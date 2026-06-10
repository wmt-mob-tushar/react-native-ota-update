---
id: edge-functions
title: Edge Functions
sidebar_position: 6
---

# Edge Functions

Seven Deno / TypeScript functions under `supabase/functions/`. Device-facing functions authenticate with the `x-app-key` header; operator functions use a Supabase JWT.

## Device functions (`x-app-key`)

### `check-update`

The update decision engine. Given platform, channel, runtime, device id, and current bundle id, it:

1. Authenticates the app key → `application_id`.
2. Rate-limits per `(app_key + device_id)`.
3. Resolves channel + runtime → the active deployment + enabled bundle.
4. **Rollback detection** — if the device is on a disabled/rolled-back bundle, returns `ROLLBACK` with the last good bundle.
5. **Rollout gate** — buckets the device by `hash(device_id) % 100`.
6. Mints a 5-minute signed URL, upserts `ota_devices`, logs analytics.

Returns `{ status: 'UPDATE' | 'ROLLBACK' | 'NONE', bundle? }`.

### `report-install`

Records `downloaded` / `installed` / `failed` telemetry and updates the device's current bundle on success.

### `report-crash`

Stores a crash report. Crash *recovery* is handled on-device (native crash-window); this is telemetry only.

## Operator functions (Bearer JWT)

### `create-release`

1. Verifies the operator is a `developer`+ member.
2. Confirms the uploaded file exists and **re-verifies its SHA-256** server-side.
3. Auto-creates the channel / runtime if missing.
4. Allocates the next monotonic bundle version.
5. Inserts the bundle, supersedes the old deployment, creates the new active deployment + rollout.

### `rollback-release`

Marks the current bundle rolled-back and repoints the deployment to the previous (or an explicit) bundle, writing a `ota_rollbacks` audit row.

### `list-releases`

Paginated bundle list enriched with install counts.

### `analytics`

Aggregates the six analytics views + recent events for a time range.

## Shared utilities (`_shared/`)

| File | Provides |
|------|----------|
| `auth.ts` | `authenticateDevice()` (app key) / `authenticateOperator()` (JWT) |
| `cors.ts` | CORS headers + helpers |
| `rate-limit.ts` | `checkRateLimit()` → atomic `ota_check_rate_limit()` RPC |
| `sha256.ts` | `deviceBucket()` (rollout hashing) + constant-time compare |
| `supabase.ts` | Service-role + anon client factories |
| `types.ts` | Shared request/response interfaces |
