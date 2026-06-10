/**
 * check-update — the OTA decision engine.
 *
 * Called by every device on startup / background check.
 * Auth: x-app-key (per-application UUID, NOT the service-role key).
 * No JWT required — devices are anonymous, authenticated by app key only.
 *
 * Flow:
 *  1. Authenticate app via x-app-key → resolve application_id
 *  2. Rate-limit by app_key + device_id
 *  3. Validate request body
 *  4. Find active deployment → bundle
 *  5. Apply rollout bucketing (hash(device_id) % 100 < rollout.percentage)
 *  6. Compare with current_bundle_id
 *  7. Detect ROLLBACK if current bundle is disabled
 *  8. Upsert device record + write analytics event
 *  9. Return { status, bundle? } — bundle includes a 5-min signed URL
 */

import { corsResponse, withCors, CORS_HEADERS } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { authenticateDevice } from '../_shared/auth.ts';
import { deviceBucket } from '../_shared/sha256.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rate-limit.ts';
import type {
  CheckUpdateRequest,
  CheckUpdateResponse,
  BundleManifest,
  Platform,
} from '../_shared/types.ts';

const logger = createLogger('check-update');

// 30 requests per 60 s per (app_key + device_id) pair
const RATE_LIMIT    = 30;
const RATE_WINDOW   = 60_000;
const SIGNED_URL_TTL = 300; // seconds

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    // ── 1. App auth ──────────────────────────────────────────
    let appCtx;
    try {
      appCtx = await authenticateDevice(req, logger);
    } catch (e) {
      return e instanceof Response ? withCors(e) : withCors(error(401, 'Unauthorized'));
    }
    const { applicationId } = appCtx;

    // ── 2. Parse body ────────────────────────────────────────
    let body: CheckUpdateRequest;
    try {
      body = await req.json() as CheckUpdateRequest;
    } catch {
      return withCors(error(400, 'Invalid JSON body'));
    }

    const {
      platform,
      channel,
      runtime_version,
      device_id,
      current_bundle_id,
      app_version,
      os_version,
    } = body;

    if (!platform || !channel || !runtime_version || !device_id) {
      return withCors(error(400, 'platform, channel, runtime_version, device_id are required'));
    }
    if (!['ios', 'android'].includes(platform)) {
      return withCors(error(400, 'platform must be ios or android'));
    }

    // ── 3. Rate limit ────────────────────────────────────────
    const appKey = req.headers.get('x-app-key')!;
    const rlKey  = `check-update:${appKey}:${device_id}`;
    const rl     = await checkRateLimit(rlKey, RATE_LIMIT, RATE_WINDOW, logger);
    if (!rl.allowed) {
      logger.warn('rate limited', { device_id, applicationId });
      return withCors(rateLimitedResponse(RATE_WINDOW));
    }

    const supa = createServiceClient();

    // ── 4. Resolve channel ───────────────────────────────────
    const { data: channelRow, error: chErr } = await supa
      .from('ota_channels')
      .select('id')
      .eq('application_id', applicationId)
      .eq('name', channel)
      .single();

    if (chErr || !channelRow) {
      logger.info('unknown channel', { channel, applicationId });
      return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
    }

    // ── 5. Resolve runtime ───────────────────────────────────
    const { data: runtimeRow, error: rtErr } = await supa
      .from('ota_runtimes')
      .select('id')
      .eq('application_id', applicationId)
      .eq('platform', platform)
      .eq('runtime_version', runtime_version)
      .single();

    if (rtErr || !runtimeRow) {
      logger.info('no matching runtime', { platform, runtime_version, applicationId });
      return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
    }

    // ── 6. Find active deployment ────────────────────────────
    const { data: deployment, error: depErr } = await supa
      .from('ota_deployments')
      .select('id, bundle_id')
      .eq('channel_id', channelRow.id)
      .eq('platform', platform)
      .eq('runtime_id', runtimeRow.id)
      .eq('status', 'active')
      .single();

    if (depErr || !deployment) {
      logger.info('no active deployment', { channel, platform, runtime_version });
      return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
    }

    // ── 7. Fetch bundle row ──────────────────────────────────
    const { data: bundle, error: bErr } = await supa
      .from('ota_bundles')
      .select(
        'id, version, semver, platform, storage_path, file_hash, file_size, ' +
        'should_force_update, message, status, enabled',
      )
      .eq('id', deployment.bundle_id)
      .single();

    if (bErr || !bundle) {
      logger.error('bundle row missing', { bundle_id: deployment.bundle_id });
      return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
    }

    // ── 8. Detect ROLLBACK ───────────────────────────────────
    // If the device is on a bundle that is now disabled/rolled_back,
    // we must send them back to the last known-good bundle.
    if (current_bundle_id && current_bundle_id !== bundle.id) {
      const { data: currentBundle } = await supa
        .from('ota_bundles')
        .select('id, enabled, status')
        .eq('id', current_bundle_id)
        .single();

      if (currentBundle && (!currentBundle.enabled || currentBundle.status !== 'active')) {
        // Find the latest prior good bundle for this runtime/channel/platform
        const { data: goodBundle } = await supa
          .from('ota_bundles')
          .select(
            'id, version, semver, platform, storage_path, file_hash, ' +
            'file_size, should_force_update, message',
          )
          .eq('application_id', applicationId)
          .eq('channel_id', channelRow.id)
          .eq('platform', platform as Platform)
          .eq('runtime_id', runtimeRow.id)
          .eq('enabled', true)
          .eq('status', 'active')
          .neq('id', current_bundle_id)
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (goodBundle) {
          const url = await signedUrl(supa, goodBundle.storage_path, SIGNED_URL_TTL);
          await recordAnalytics(supa, applicationId, channelRow.id, goodBundle.id, device_id, platform as Platform, 'rollback');
          await upsertDevice(supa, { applicationId, deviceId: device_id, platform: platform as Platform, appVersion: app_version, osVersion: os_version, bundleId: goodBundle.id, channel });
          return withCors(json({
            status: 'ROLLBACK',
            bundle: buildManifest(goodBundle, url),
          } satisfies CheckUpdateResponse));
        }
        // No good bundle found — go to NONE (device stays on whatever it has)
        return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
      }
    }

    // ── 9. Check if bundle is enabled ────────────────────────
    if (!bundle.enabled || bundle.status !== 'active') {
      return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
    }

    // ── 10. Check if already up to date ──────────────────────
    if (current_bundle_id && current_bundle_id === bundle.id) {
      await upsertDevice(supa, { applicationId, deviceId: device_id, platform: platform as Platform, appVersion: app_version, osVersion: os_version, bundleId: bundle.id, channel });
      return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
    }

    // ── 11. Rollout gate ─────────────────────────────────────
    const { data: rollout } = await supa
      .from('ota_rollouts')
      .select('percentage, status')
      .eq('deployment_id', deployment.id)
      .single();

    if (rollout && rollout.status === 'paused') {
      return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
    }

    if (rollout && rollout.percentage < 100) {
      const bucket = await deviceBucket(device_id);
      if (bucket >= rollout.percentage) {
        logger.debug('device outside rollout window', { bucket, percentage: rollout.percentage });
        return withCors(json({ status: 'NONE' } satisfies CheckUpdateResponse));
      }
    }

    // ── 12. Generate signed download URL ─────────────────────
    const url = await signedUrl(supa, bundle.storage_path, SIGNED_URL_TTL);

    // ── 13. Side effects ─────────────────────────────────────
    await Promise.allSettled([
      recordAnalytics(supa, applicationId, channelRow.id, bundle.id, device_id, platform as Platform, 'download'),
      upsertDevice(supa, {
        applicationId,
        deviceId: device_id,
        platform: platform as Platform,
        appVersion: app_version,
        osVersion: os_version,
        bundleId: bundle.id,
        channel,
        runtimeVersion: runtime_version,
      }),
    ]);

    logger.info('sending UPDATE', { device_id, bundleId: bundle.id, version: bundle.version });

    return withCors(json({
      status: 'UPDATE',
      bundle: buildManifest(bundle, url),
    } satisfies CheckUpdateResponse));

  } catch (err) {
    logger.error('unhandled error', { err: String(err) });
    return withCors(error(500, 'Internal server error'));
  }
});

// ── Helpers ───────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

async function signedUrl(
  supa: ReturnType<typeof createServiceClient>,
  storagePath: string,
  expiresIn: number,
): Promise<string> {
  const { data, error: e } = await supa.storage
    .from('ota')
    .createSignedUrl(storagePath, expiresIn);
  if (e || !data?.signedUrl) throw new Error(`Failed to sign URL: ${e?.message}`);
  return data.signedUrl;
}

function buildManifest(
  bundle: {
    id: string; version: number; semver?: string; platform: string;
    file_hash: string; file_size: number;
    should_force_update: boolean; message?: string;
  },
  downloadUrl: string,
): BundleManifest {
  return {
    id: bundle.id,
    version: bundle.version,
    semver: bundle.semver ?? undefined,
    platform: bundle.platform as Platform,
    file_hash: bundle.file_hash,
    file_size: bundle.file_size,
    download_url: downloadUrl,
    should_force_update: bundle.should_force_update,
    message: bundle.message ?? undefined,
  };
}

async function recordAnalytics(
  supa: ReturnType<typeof createServiceClient>,
  applicationId: string,
  channelId: string,
  bundleId: string,
  deviceId: string,
  platform: Platform,
  eventType: string,
): Promise<void> {
  await supa.from('ota_analytics').insert({
    application_id: applicationId,
    channel_id: channelId,
    bundle_id: bundleId,
    device_id: deviceId,
    platform,
    event_type: eventType,
  });
}

async function upsertDevice(
  supa: ReturnType<typeof createServiceClient>,
  opts: {
    applicationId: string;
    deviceId: string;
    platform: Platform;
    appVersion?: string;
    osVersion?: string;
    bundleId?: string;
    channel?: string;
    runtimeVersion?: string;
  },
): Promise<void> {
  await supa.from('ota_devices').upsert(
    {
      device_id:         opts.deviceId,
      application_id:    opts.applicationId,
      platform:          opts.platform,
      app_version:       opts.appVersion,
      os_version:        opts.osVersion,
      current_bundle_id: opts.bundleId,
      channel:           opts.channel,
      runtime_version:   opts.runtimeVersion,
      last_seen:         new Date().toISOString(),
    },
    { onConflict: 'device_id,application_id', ignoreDuplicates: false },
  );
}
