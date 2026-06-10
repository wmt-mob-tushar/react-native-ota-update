/**
 * report-crash — device reports a JS crash event.
 *
 * Auth: x-app-key (device).
 *
 * Writes to:
 *   ota_crashes   (crash record)
 *   ota_analytics (event log)
 *
 * Crash recovery: the SDK will call check-update after a fatal crash,
 * which detects the bad bundle and returns ROLLBACK. This function is
 * purely telemetry — it does not perform the rollback itself.
 */

import { corsResponse, withCors, CORS_HEADERS } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { authenticateDevice } from '../_shared/auth.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rate-limit.ts';
import type { ReportCrashRequest } from '../_shared/types.ts';

const logger = createLogger('report-crash');
const RATE_LIMIT  = 20;
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

    let body: ReportCrashRequest;
    try { body = await req.json(); } catch { return withCors(err(400, 'Invalid JSON')); }

    const { bundle_id, device_id, platform, fatal, error_message, stack, app_version, metadata } = body;

    if (!device_id || !platform || !error_message) {
      return withCors(err(400, 'device_id, platform, error_message are required'));
    }
    if (!['ios','android'].includes(platform)) return withCors(err(400, 'Invalid platform'));

    const appKey = req.headers.get('x-app-key')!;
    const rl = await checkRateLimit(`report-crash:${appKey}:${device_id}`, RATE_LIMIT, RATE_WINDOW, logger);
    if (!rl.allowed) return withCors(rateLimitedResponse(RATE_WINDOW));

    const supa = createServiceClient();

    // Resolve channel_id if bundle_id known
    let channelId: string | null = null;
    if (bundle_id) {
      const { data: b } = await supa
        .from('ota_bundles')
        .select('channel_id')
        .eq('id', bundle_id)
        .eq('application_id', appCtx.applicationId)
        .single();
      channelId = b?.channel_id ?? null;
    }

    await Promise.allSettled([
      supa.from('ota_crashes').insert({
        application_id: appCtx.applicationId,
        bundle_id:      bundle_id ?? null,
        device_id,
        platform,
        fatal:          fatal ?? false,
        error_message,
        stack:          stack ?? null,
        app_version:    app_version ?? null,
        metadata:       metadata ?? null,
      }),

      supa.from('ota_analytics').insert({
        application_id: appCtx.applicationId,
        channel_id:     channelId,
        bundle_id:      bundle_id ?? null,
        device_id,
        platform,
        event_type:     'crash',
        metadata: {
          fatal,
          error_message: error_message.slice(0, 500),
          ...(metadata ?? {}),
        },
      }),
    ]);

    logger.info('crash reported', { device_id, bundle_id, fatal });
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
