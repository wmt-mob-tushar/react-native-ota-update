import { createServiceClient } from './supabase.ts';
import type { Logger } from './logger.ts';

/**
 * Postgres-backed window rate limiter.
 * Delegates to the atomic ota_check_rate_limit() SQL function
 * (advisory-lock serialized per key, prunes expired rows itself).
 * Falls back to allowing the request if the function doesn't exist
 * yet, so early deployments don't break.
 *
 *   key        — e.g. "check-update:{app_key}"
 *   limit      — max requests per window
 *   window_ms  — window duration in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  logger: Logger,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const supa = createServiceClient();
    const { data, error } = await supa.rpc('ota_check_rate_limit', {
      p_key:       key,
      p_limit:     limit,
      p_window_ms: windowMs,
    });

    if (error) {
      // Function might not exist on first deploy — allow through
      logger.warn('rate-limit function unavailable, skipping', { error: error.message });
      return { allowed: true, remaining: limit };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed:   row?.allowed   ?? true,
      remaining: row?.remaining ?? limit,
    };
  } catch (err) {
    logger.warn('rate-limit check failed, allowing request', { err: String(err) });
    return { allowed: true, remaining: limit };
  }
}

/**
 * Returns a 429 Response with Retry-After header.
 */
export function rateLimitedResponse(windowMs: number): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(windowMs / 1000)),
      },
    },
  );
}
