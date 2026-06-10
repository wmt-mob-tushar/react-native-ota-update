import { createHash, randomUUID } from 'crypto';

/** SHA-256 hex digest of a buffer or string. */
export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Deterministic 0–99 bucket for staged rollouts.
 * The same device id always maps to the same bucket, so a device that
 * received an update keeps it as the percentage grows.
 */
export function rolloutBucket(deviceId: string): number {
  const hex = sha256(deviceId).slice(0, 8);
  return parseInt(hex, 16) % 100;
}

/** Constant-time-ish hex comparison for integrity checks. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export { randomUUID };
