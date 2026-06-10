---
id: backend-setup
title: Backend Setup
sidebar_position: 4
---

# Backend Setup

The entire backend is a single Supabase project: PostgreSQL, Edge Functions, and Storage.

## Link your project

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

## Apply migrations

```bash
npx supabase db push
```

This runs **7 idempotent migrations** in order:

| File | Creates |
|------|---------|
| `20260609000000_drop_legacy_schema.sql` | Drops any incompatible pre-release tables (no-op on a fresh DB) |
| `20260609000001_ota_core.sql` | Core tables (applications, bundles, deployments, devices…) + auto-enroll trigger |
| `20260609000002_ota_views.sql` | 6 analytics views |
| `20260609000003_ota_rls.sql` | Row-Level Security policies + `ota_is_app_member()` |
| `20260609000004_ota_storage.sql` | Private `ota` bucket + storage policies |
| `20260609000005_ota_rate_limits.sql` | Rate-limit counter table |
| `20260609000006_ota_rls_fixes.sql` | Rollouts `WITH CHECK` fix + atomic rate-limit RPC |
| `20260609000007_default_channel.sql` | Auto-creates a `production` channel on app creation |

:::note Idempotent & safe
Every statement uses `IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING`. Re-running `db push` will not drop or corrupt existing data.
:::

## Deploy edge functions

```bash
npx supabase functions deploy
```

Deploys all seven functions. They read three environment variables, which Supabase injects automatically for deployed functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

For local serving you can set them explicitly:

```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## Verify

```bash
curl -X POST https://<project>.supabase.co/functions/v1/check-update \
  -H "Content-Type: application/json" \
  -H "x-app-key: not-a-real-key" \
  -d '{"platform":"android","channel":"production","runtime_version":"1.0.0","device_id":"test"}'
# → {"error":"Invalid app key"}  (HTTP 401)  ✅ the function is live
```

A `401` here is the **correct** response — it proves the function deployed and rejected an unknown key.

## Storage layout

Bundles are stored in a private bucket named `ota`:

```
ota/{app_slug}/{channel}/{platform}/{bundle_id}/bundle.zip
```

Devices never access storage directly — `check-update` mints a 5-minute signed URL per download.
