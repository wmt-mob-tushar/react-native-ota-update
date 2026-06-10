/**
 * analytics — aggregated stats for the dashboard.
 *
 * Auth: Supabase JWT (operator, viewer+).
 *
 * Returns:
 *   - adoption data per bundle
 *   - daily event counts (last N days)
 *   - success/crash rates per bundle
 *   - active device counts
 *   - rollback history
 */

import { corsResponse, withCors, CORS_HEADERS } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { authenticateOperator } from '../_shared/auth.ts';
import type { AnalyticsRequest } from '../_shared/types.ts';

const logger = createLogger('analytics');

const RANGE_DAYS: Record<string, number> = {
  '1d': 1, '7d': 7, '30d': 30, '90d': 90,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    let userCtx;
    try {
      userCtx = await authenticateOperator(req, logger);
    } catch (e) {
      return e instanceof Response ? withCors(e) : withCors(err(401, 'Unauthorized'));
    }

    let body: AnalyticsRequest;
    try { body = await req.json(); } catch { return withCors(err(400, 'Invalid JSON')); }

    const { application_id, range = '30d', bundle_id } = body;
    if (!application_id) return withCors(err(400, 'application_id is required'));

    const supa = createServiceClient();

    // Verify membership
    const { data: member } = await supa
      .from('application_members')
      .select('role')
      .eq('application_id', application_id)
      .eq('user_id', userCtx.userId)
      .single();
    if (!member) return withCors(err(403, 'Not a member of this application'));

    const days = RANGE_DAYS[range] ?? 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    // Parallel query all analytics views
    const [
      adoptionRes,
      successRes,
      crashRes,
      activeDevRes,
      dailyEventsRes,
      rollbackRes,
    ] = await Promise.all([
      // Bundle adoption
      supa
        .from('ota_bundle_adoption')
        .select('*')
        .eq('application_id', application_id)
        .order('version', { ascending: false }),

      // Update success stats
      supa
        .from('ota_update_success_stats')
        .select('*')
        .eq('application_id', application_id),

      // Crash stats
      supa
        .from('ota_crash_stats')
        .select('*')
        .eq('application_id', application_id),

      // Active devices
      supa
        .from('ota_active_devices')
        .select('*')
        .eq('application_id', application_id),

      // Daily events
      supa
        .from('ota_analytics')
        .select('event_type, platform, created_at, bundle_id')
        .eq('application_id', application_id)
        .gte('created_at', since)
        .order('created_at', { ascending: true }),

      // Rollback history
      supa
        .from('ota_rollbacks')
        .select('id, channel_id, platform, from_bundle_id, to_bundle_id, reason, created_at')
        .eq('application_id', application_id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    // Aggregate daily events into a chart-friendly format
    const dailyMap: Record<string, Record<string, number>> = {};
    for (const event of (dailyEventsRes.data ?? [])) {
      const day = event.created_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = {};
      dailyMap[day][event.event_type] = (dailyMap[day][event.event_type] ?? 0) + 1;
    }
    const dailyChart = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    return withCors(json({
      range,
      adoption:      adoptionRes.data  ?? [],
      success_stats: successRes.data   ?? [],
      crash_stats:   crashRes.data     ?? [],
      active_devices: activeDevRes.data ?? [],
      daily_events:  dailyChart,
      rollbacks:     rollbackRes.data  ?? [],
    }));

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
