/**
 * report-install — device reports a download/install/failure event.
 *
 * Auth: x-app-key (device).
 * Rate limited.
 *
 * Writes to:
 *   ota_installations (status row)
 *   ota_analytics     (event log)
 *   ota_devices       (last_seen upsert)
 */

import { corsResponse, withCors, CORS_HEADERS } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { authenticateDevice } from '../_shared/auth.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rate-limit.ts';
import type { ReportInstallRequest } from '../_shared/types.ts';

const logger = createLogger('report-install');
const RATE_LIMIT  = 60;
const RATE_WINDOW = 60_000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    let appCtx;
    try {
      appCtx = await authenticateDevice(req, logger);
    } catch (e) {
      return e instanceof Response ? withCors(e) : withCors(err(401, 'Unauthorized'));
    }

    let body: ReportInstallRequest;
    try { body = await req.json(); } catch { return withCors(err(400, 'Invalid JSON')); }

    const { bundle_id, device_id, platform, status, app_version, error_message } = body;

    if (!bundle_id || !device_id || !platform || !status) {
      return withCors(err(400, 'bundle_id, device_id, platform, status are required'));
    }
    if (!['ios','android'].includes(platform)) return withCors(err(400, 'Invalid platform'));
    if (!['downloaded','installed','failed'].includes(status)) {
      return withCors(err(400, 'status must be downloaded | installed | failed'));
    }

    const appKey = req.headers.get('x-app-key')!;
    const rl = await checkRateLimit(`report-install:${appKey}:${device_id}`, RATE_LIMIT, RATE_WINDOW, logger);
    if (!rl.allowed) return withCors(rateLimitedResponse(RATE_WINDOW));

    const supa = createServiceClient();

    // Validate bundle belongs to this app
    const { data: bundle } = await supa
      .from('ota_bundles')
      .select('id, channel_id')
      .eq('id', bundle_id)
      .eq('application_id', appCtx.applicationId)
      .single();

    if (!bundle) return withCors(err(404, 'Bundle not found'));

    // Determine analytics event type
    const eventType = status === 'installed'
      ? 'install'
      : status === 'downloaded'
        ? 'download'
        : 'update_fail';

    await Promise.allSettled([
      supa.from('ota_installations').insert({
        application_id: appCtx.applicationId,
        bundle_id,
        device_id,
        platform,
        status,
        app_version:   app_version ?? null,
        error_message: error_message ?? null,
      }),

      supa.from('ota_analytics').insert({
        application_id: appCtx.applicationId,
        channel_id:     bundle.channel_id,
        bundle_id,
        device_id,
        platform,
        event_type:     eventType,
        metadata:       error_message ? { error_message } : null,
      }),

      // Update device's current bundle on successful install
      status === 'installed'
        ? supa.from('ota_devices').upsert({
            device_id,
            application_id:    appCtx.applicationId,
            platform,
            app_version:       app_version ?? null,
            current_bundle_id: bundle_id,
            last_seen:         new Date().toISOString(),
          }, { onConflict: 'device_id,application_id', ignoreDuplicates: false })
        : Promise.resolve(),
    ]);

    logger.info('install reported', { device_id, bundle_id, status });
    return withCors(json({ success: true }));

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
function err(status: number, message: string): Response { return json({ error: message }, status); }
