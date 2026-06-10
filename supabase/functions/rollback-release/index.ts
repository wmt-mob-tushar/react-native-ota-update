/**
 * rollback-release — revert to a previous bundle.
 *
 * Auth: Supabase JWT (operator / developer+).
 *
 * Two modes:
 *  a) to_bundle_id provided → rollback to that specific bundle
 *  b) no to_bundle_id      → rollback to the previous bundle
 *     (latest active bundle before the current deployment)
 *
 * Steps:
 *  1. Auth operator
 *  2. Find current active deployment for (app, channel, platform, runtime)
 *  3. Disable the current bundle (status = 'rolled_back', enabled = false)
 *  4. Find / verify the target bundle
 *  5. Supersede current deployment → create new deployment pointing to target bundle
 *  6. Write ota_rollbacks audit row
 *  7. Write analytics event
 */

import { corsResponse, withCors, CORS_HEADERS } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { authenticateOperator } from '../_shared/auth.ts';
import type { RollbackReleaseRequest } from '../_shared/types.ts';

const logger = createLogger('rollback-release');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    let userCtx;
    try {
      userCtx = await authenticateOperator(req, logger);
    } catch (e) {
      return e instanceof Response ? withCors(e) : withCors(err(401, 'Unauthorized'));
    }

    let body: RollbackReleaseRequest;
    try { body = await req.json(); } catch { return withCors(err(400, 'Invalid JSON')); }

    const { application_id, channel, platform, runtime_version, to_bundle_id, reason } = body;

    if (!application_id || !channel || !platform) {
      return withCors(err(400, 'application_id, channel, and platform are required'));
    }

    const supa = createServiceClient();

    // ── Check membership ─────────────────────────────────────
    const { data: member } = await supa
      .from('application_members')
      .select('role')
      .eq('application_id', application_id)
      .eq('user_id', userCtx.userId)
      .single();

    if (!member || !['owner','admin','developer'].includes(member.role)) {
      return withCors(err(403, 'Insufficient permissions'));
    }

    // ── Find channel ──────────────────────────────────────────
    const { data: channelRow } = await supa
      .from('ota_channels')
      .select('id')
      .eq('application_id', application_id)
      .eq('name', channel)
      .single();
    if (!channelRow) return withCors(err(404, `Channel '${channel}' not found`));

    // ── Build deployment query ────────────────────────────────
    let depQuery = supa
      .from('ota_deployments')
      .select('id, bundle_id, runtime_id, platform')
      .eq('application_id', application_id)
      .eq('channel_id', channelRow.id)
      .eq('platform', platform)
      .eq('status', 'active');

    if (runtime_version) {
      const { data: rt } = await supa
        .from('ota_runtimes')
        .select('id')
        .eq('application_id', application_id)
        .eq('platform', platform)
        .eq('runtime_version', runtime_version)
        .single();
      if (!rt) return withCors(err(404, `Runtime '${runtime_version}' not found`));
      depQuery = depQuery.eq('runtime_id', rt.id) as typeof depQuery;
    }

    const { data: deployments, error: depErr } = await depQuery;
    if (depErr || !deployments?.length) {
      return withCors(err(404, 'No active deployment found matching the criteria'));
    }

    // Process each matching deployment (usually 1 unless runtime_version omitted)
    const rollbackResults = [];

    for (const deployment of deployments) {
      // ── Mark current bundle as rolled_back ──────────────────
      await supa
        .from('ota_bundles')
        .update({ status: 'rolled_back', enabled: false })
        .eq('id', deployment.bundle_id);

      // ── Determine target bundle ──────────────────────────────
      let targetBundleId = to_bundle_id;

      if (!targetBundleId) {
        // Find previous good bundle
        const { data: prev } = await supa
          .from('ota_bundles')
          .select('id, version')
          .eq('application_id', application_id)
          .eq('channel_id', channelRow.id)
          .eq('platform', platform)
          .eq('runtime_id', deployment.runtime_id)
          .eq('status', 'active')
          .eq('enabled', true)
          .neq('id', deployment.bundle_id)
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (!prev) {
          logger.warn('no previous bundle to roll back to', { deployment_id: deployment.id });
          continue;
        }
        targetBundleId = prev.id;
      } else {
        // Validate the supplied bundle
        const { data: targetBundle } = await supa
          .from('ota_bundles')
          .select('id, status, enabled')
          .eq('id', targetBundleId)
          .single();

        if (!targetBundle) return withCors(err(404, `Bundle ${targetBundleId} not found`));

        // Re-enable if it was previously rolled back
        await supa
          .from('ota_bundles')
          .update({ status: 'active', enabled: true })
          .eq('id', targetBundleId);
      }

      // ── Supersede current deployment ─────────────────────────
      await supa
        .from('ota_deployments')
        .update({ status: 'superseded' })
        .eq('id', deployment.id);

      // ── Create rollback deployment ────────────────────────────
      const { data: newDep } = await supa
        .from('ota_deployments')
        .insert({
          application_id,
          channel_id:  channelRow.id,
          runtime_id:  deployment.runtime_id,
          platform:    deployment.platform,
          bundle_id:   targetBundleId,
          status:      'active',
          created_by:  userCtx.userId,
        })
        .select('id')
        .single();

      if (newDep) {
        // 100% rollout for rollback
        await supa.from('ota_rollouts').insert({
          deployment_id: newDep.id,
          bundle_id:     targetBundleId,
          percentage:    100,
          strategy:      'all',
          status:        'active',
        });
      }

      // ── Audit log ─────────────────────────────────────────────
      await supa.from('ota_rollbacks').insert({
        application_id,
        channel_id:     channelRow.id,
        platform,
        from_bundle_id: deployment.bundle_id,
        to_bundle_id:   targetBundleId,
        reason:         reason ?? null,
        created_by:     userCtx.userId,
      });

      await supa.from('ota_analytics').insert({
        application_id,
        channel_id: channelRow.id,
        bundle_id:  targetBundleId,
        device_id:  userCtx.userId,
        platform,
        event_type: 'rollback',
        metadata:   { from_bundle_id: deployment.bundle_id, reason },
      });

      rollbackResults.push({ deployment_id: deployment.id, to_bundle_id: targetBundleId });
      logger.info('rollback complete', { from: deployment.bundle_id, to: targetBundleId });
    }

    if (!rollbackResults.length) {
      return withCors(err(409, 'No bundles could be rolled back (no previous bundle exists)'));
    }

    return withCors(json({ success: true, rollbacks: rollbackResults }));

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
