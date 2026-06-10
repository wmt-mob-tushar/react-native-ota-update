/**
 * SHA-256 utilities for bundle integrity verification.
 * Uses the Web Crypto API (available in Deno + modern browsers).
 */

/** Return hex-encoded SHA-256 of the given ArrayBuffer or Uint8Array. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array ? data.buffer : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return bufferToHex(digest);
}

/** Compute SHA-256 of a string (UTF-8 encoded). */
export async function sha256String(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  return sha256Hex(encoded.buffer);
}

/** Convert an ArrayBuffer to a lowercase hex string. */
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Bucket a device deterministically into [0, 99] for staged rollouts.
 * Uses the first 4 bytes of SHA-256(deviceId) as a uint32.
 */
export async function deviceBucket(deviceId: string): Promise<number> {
  const data   = new TextEncoder().encode(deviceId);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const view   = new DataView(digest);
  const uint32 = view.getUint32(0, false); // big-endian
  return uint32 % 100;
}

/**
 * Constant-time comparison of two hex strings.
 * Prevents timing attacks on hash comparison.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
