/**
 * create-release — register a new bundle & deploy it.
 *
 * Called by the CLI after uploading bundle.zip to Storage.
 * Auth: Supabase JWT (operator / developer role).
 *
 * Steps:
 *  1. Authenticate operator (JWT)
 *  2. Validate body
 *  3. Verify the uploaded file exists in Storage
 *  4. Verify SHA-256 matches the supplied hash (integrity check)
 *  5. Create / resolve runtime row
 *  6. Insert ota_bundles row (auto-incremented version)
 *  7. Supersede current active deployment → create new active deployment
 *  8. Create rollout row
 *  9. Write analytics event
 */

import { corsResponse, withCors, CORS_HEADERS } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { authenticateOperator } from '../_shared/auth.ts';
import { safeEqual } from '../_shared/sha256.ts';
import type { CreateReleaseRequest, CreateReleaseResponse } from '../_shared/types.ts';

const logger = createLogger('create-release');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    // ── Auth ─────────────────────────────────────────────────
    let userCtx;
    try {
      userCtx = await authenticateOperator(req, logger);
    } catch (e) {
      return e instanceof Response ? withCors(e) : withCors(err(401, 'Unauthorized'));
    }

    // ── Parse body ───────────────────────────────────────────
    let body: CreateReleaseRequest;
    try { body = await req.json(); } catch { return withCors(err(400, 'Invalid JSON')); }

    const {
      application_id,
      channel,
      platform,
      runtime_version,
      storage_path,
      file_hash,
      file_size,
      semver,
      should_force_update = false,
      message,
      rollout_percentage  = 100,
    } = body;

    if (!application_id || !channel || !platform || !runtime_version || !storage_path || !file_hash || !file_size) {
      return withCors(err(400, 'Missing required fields: application_id, channel, platform, runtime_version, storage_path, file_hash, file_size'));
    }
    if (!['ios', 'android'].includes(platform)) return withCors(err(400, 'Invalid platform'));
    if (rollout_percentage < 0 || rollout_percentage > 100) return withCors(err(400, 'rollout_percentage must be 0-100'));

    const supa = createServiceClient();

    // ── Check operator membership ────────────────────────────
    const { data: member } = await supa
      .from('application_members')
      .select('role')
      .eq('application_id', application_id)
      .eq('user_id', userCtx.userId)
      .single();

    if (!member || !['owner','admin','developer'].includes(member.role)) {
      return withCors(err(403, 'Insufficient permissions'));
    }

    // ── Verify file exists in Storage ────────────────────────
    const { data: fileList, error: listErr } = await supa.storage
      .from('ota')
      .list(storage_path.substring(0, storage_path.lastIndexOf('/')));

    const fileName = storage_path.split('/').pop();
    if (listErr || !fileList?.some(f => f.name === fileName)) {
      logger.error('bundle file not found in storage', { storage_path });
      return withCors(err(422, `Bundle not found at storage path: ${storage_path}. Upload it first.`));
    }

    // ── Verify SHA-256 (download + hash) ─────────────────────
    // This protects against corrupted uploads.
    const { data: fileData, error: dlErr } = await supa.storage
      .from('ota')
      .download(storage_path);

    if (dlErr || !fileData) {
      return withCors(err(422, 'Failed to download bundle for hash verification'));
    }

    const fileBytes   = await fileData.arrayBuffer();
    const hashBuffer  = await crypto.subtle.digest('SHA-256', fileBytes);
    const actualHash  = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');

    if (!safeEqual(actualHash, file_hash.toLowerCase())) {
      logger.error('SHA-256 mismatch', { expected: file_hash, actual: actualHash });
      return withCors(err(422, `SHA-256 mismatch. Expected: ${file_hash}, got: ${actualHash}`));
    }

    // ── Resolve channel ──────────────────────────────────────
    let { data: channelRow } = await supa
      .from('ota_channels')
      .select('id')
      .eq('application_id', application_id)
      .eq('name', channel)
      .single();

    if (!channelRow) {
      // Auto-create the channel
      const { data: newCh, error: chErr } = await supa
        .from('ota_channels')
        .insert({ application_id, name: channel })
        .select('id')
        .single();
      if (chErr || !newCh) return withCors(err(500, `Failed to create channel: ${chErr?.message}`));
      channelRow = newCh;
    }

    // ── Resolve / create runtime ─────────────────────────────
    let { data: runtimeRow } = await supa
      .from('ota_runtimes')
      .select('id')
      .eq('application_id', application_id)
      .eq('platform', platform)
      .eq('runtime_version', runtime_version)
      .single();

    if (!runtimeRow) {
      const { data: newRt, error: rtErr } = await supa
        .from('ota_runtimes')
        .insert({ application_id, platform, runtime_version })
        .select('id')
        .single();
      if (rtErr || !newRt) return withCors(err(500, `Failed to create runtime: ${rtErr?.message}`));
      runtimeRow = newRt;
    }

    // ── Next bundle version ──────────────────────────────────
    const { data: vRow } = await supa
      .rpc('ota_next_bundle_version', {
        p_application_id: application_id,
        p_channel_id: channelRow.id,
        p_platform: platform,
      });

    const nextVersion = (vRow as number) ?? 1;

    // ── Insert bundle ────────────────────────────────────────
    const { data: bundle, error: bErr } = await supa
      .from('ota_bundles')
      .insert({
        application_id,
        channel_id:          channelRow.id,
        runtime_id:          runtimeRow.id,
        platform,
        version:             nextVersion,
        semver:              semver ?? null,
        storage_path,
        file_hash:           file_hash.toLowerCase(),
        file_size,
        should_force_update,
        message:             message ?? null,
        status:              'active',
        enabled:             true,
        created_by:          userCtx.userId,
      })
      .select('id')
      .single();

    if (bErr || !bundle) {
      logger.error('bundle insert failed', { error: bErr?.message });
      return withCors(err(500, `Failed to create bundle: ${bErr?.message}`));
    }

    // ── Supersede old active deployment ──────────────────────
    await supa
      .from('ota_deployments')
      .update({ status: 'superseded' })
      .eq('channel_id', channelRow.id)
      .eq('platform', platform)
      .eq('runtime_id', runtimeRow.id)
      .eq('status', 'active');

    // ── Create new deployment ─────────────────────────────────
    const { data: deployment, error: dErr } = await supa
      .from('ota_deployments')
      .insert({
        application_id,
        channel_id:  channelRow.id,
        runtime_id:  runtimeRow.id,
        platform,
        bundle_id:   bundle.id,
        status:      'active',
        created_by:  userCtx.userId,
      })
      .select('id')
      .single();

    if (dErr || !deployment) {
      return withCors(err(500, `Failed to create deployment: ${dErr?.message}`));
    }

    // ── Create rollout ────────────────────────────────────────
    await supa.from('ota_rollouts').insert({
      deployment_id: deployment.id,
      bundle_id:     bundle.id,
      percentage:    rollout_percentage,
      strategy:      rollout_percentage < 100 ? 'percentage' : 'all',
      status:        'active',
    });

    // ── Analytics event ───────────────────────────────────────
    await supa.from('ota_analytics').insert({
      application_id,
      channel_id:  channelRow.id,
      bundle_id:   bundle.id,
      device_id:   userCtx.userId, // operator as actor
      platform,
      event_type:  'install',
      metadata:    { action: 'create-release', version: nextVersion },
    });

    logger.info('release created', {
      bundle_id: bundle.id, version: nextVersion, platform, channel,
    });

    return withCors(json({
      bundle_id:     bundle.id,
      deployment_id: deployment.id,
      version:       nextVersion,
    } satisfies CreateReleaseResponse));

  } catch (e) {
    logger.error('unhandled', { err: String(e) });
    return withCors(err(500, 'Internal server error'));
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(status: number, message: string): Response {
  return json({ error: message }, status);
}
