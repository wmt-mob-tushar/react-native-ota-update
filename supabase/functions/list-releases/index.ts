/**
 * list-releases — paginated bundle/deployment history.
 *
 * Auth: Supabase JWT (operator, viewer+).
 *
 * Returns bundles with their deployment status, rollout percentage,
 * and install counts, newest first.
 */

import { corsResponse, withCors, CORS_HEADERS } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { authenticateOperator } from '../_shared/auth.ts';
import type { ListReleasesRequest } from '../_shared/types.ts';

const logger = createLogger('list-releases');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    let userCtx;
    try {
      userCtx = await authenticateOperator(req, logger);
    } catch (e) {
      return e instanceof Response ? withCors(e) : withCors(err(401, 'Unauthorized'));
    }

    let body: ListReleasesRequest;
    try { body = await req.json(); } catch { return withCors(err(400, 'Invalid JSON')); }

    const {
      application_id,
      channel,
      platform,
      limit  = 20,
      offset = 0,
    } = body;

    if (!application_id) return withCors(err(400, 'application_id is required'));

    const clampedLimit = Math.min(Math.max(1, limit), 100);

    const supa = createServiceClient();

    // Verify membership
    const { data: member } = await supa
      .from('application_members')
      .select('role')
      .eq('application_id', application_id)
      .eq('user_id', userCtx.userId)
      .single();
    if (!member) return withCors(err(403, 'Not a member of this application'));

    // Build bundles query
    let q = supa
      .from('ota_bundles')
      .select(
        `id, version, semver, platform, status, enabled, should_force_update,
         message, file_hash, file_size, storage_path, created_at,
         channel:ota_channels!channel_id(id, name),
         runtime:ota_runtimes!runtime_id(id, platform, runtime_version),
         deployments:ota_deployments(id, status, rollouts:ota_rollouts(percentage, status))`,
        { count: 'exact' },
      )
      .eq('application_id', application_id)
      .order('version', { ascending: false })
      .range(offset, offset + clampedLimit - 1);

    if (platform) q = q.eq('platform', platform) as typeof q;

    if (channel) {
      const { data: ch } = await supa
        .from('ota_channels')
        .select('id')
        .eq('application_id', application_id)
        .eq('name', channel)
        .single();
      if (ch) q = q.eq('channel_id', ch.id) as typeof q;
    }

    const { data: bundles, count, error: bErr } = await q;

    if (bErr) {
      logger.error('query failed', { error: bErr.message });
      return withCors(err(500, bErr.message));
    }

    // Enrich with install counts
    const bundleIds = (bundles ?? []).map(b => b.id);
    let installCounts: Record<string, { downloaded: number; installed: number; failed: number }> = {};

    if (bundleIds.length) {
      const { data: instRows } = await supa
        .from('ota_installations')
        .select('bundle_id, status')
        .in('bundle_id', bundleIds);

      for (const row of (instRows ?? [])) {
        if (!installCounts[row.bundle_id]) {
          installCounts[row.bundle_id] = { downloaded: 0, installed: 0, failed: 0 };
        }
        installCounts[row.bundle_id][row.status as 'downloaded' | 'installed' | 'failed'] += 1;
      }
    }

    const enriched = (bundles ?? []).map(b => ({
      ...b,
      installs: installCounts[b.id] ?? { downloaded: 0, installed: 0, failed: 0 },
    }));

    return withCors(json({
      bundles: enriched,
      total:  count ?? 0,
      limit:  clampedLimit,
      offset,
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
