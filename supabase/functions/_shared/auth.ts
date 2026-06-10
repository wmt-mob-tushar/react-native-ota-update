import { createServiceClient, createUserClient } from './supabase.ts';
import type { Logger } from './logger.ts';

// ─────────────────────────────────────────────────────────────
// Device auth — x-app-key header
// ─────────────────────────────────────────────────────────────

export interface AppContext {
  applicationId: string;
  slug: string;
}

/**
 * Resolve an application by its api_key (the device-facing token).
 * Throws a 401 Response if the key is missing or unknown.
 */
export async function authenticateDevice(
  req: Request,
  logger: Logger,
): Promise<AppContext> {
  const appKey = req.headers.get('x-app-key');
  if (!appKey) {
    logger.warn('missing x-app-key header');
    throw unauthorised('Missing x-app-key header');
  }

  const supa = createServiceClient();
  const { data, error } = await supa
    .from('applications')
    .select('id, slug')
    .eq('api_key', appKey)
    .single();

  if (error || !data) {
    logger.warn('invalid x-app-key', { appKey: appKey.slice(0, 8) + '…' });
    throw unauthorised('Invalid app key');
  }

  return { applicationId: data.id, slug: data.slug };
}

// ─────────────────────────────────────────────────────────────
// Operator auth — Supabase JWT (Authorization: Bearer <jwt>)
// ─────────────────────────────────────────────────────────────

export interface UserContext {
  userId: string;
  email: string | undefined;
}

/**
 * Verify a Supabase JWT and return the user.
 * Throws a 401 Response if the token is missing or invalid.
 */
export async function authenticateOperator(
  req: Request,
  logger: Logger,
): Promise<UserContext> {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    logger.warn('missing bearer token');
    throw unauthorised('Authorization header required');
  }

  const client = createUserClient(authHeader);
  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    logger.warn('invalid JWT', { error: error?.message });
    throw unauthorised('Invalid or expired token');
  }

  return { userId: user.id, email: user.email };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function unauthorised(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
