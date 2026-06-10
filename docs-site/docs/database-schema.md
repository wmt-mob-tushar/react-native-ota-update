---
id: database-schema
title: Database Schema
sidebar_position: 5
---

# Database Schema

All tables live in the `public` schema and are protected by Row-Level Security.

## Core tables

| Table | Purpose |
|-------|---------|
| `applications` | Master app registry; holds the public `api_key` (device auth) |
| `application_members` | RBAC membership — role: `owner` / `admin` / `developer` / `viewer` |
| `ota_channels` | Deployment lanes (`production`, `beta`, …); one default per app |
| `ota_runtimes` | Native binary versions per `(app, platform, runtime_version)` |
| `ota_bundles` | JS bundle artifacts — version, SHA-256, storage path, `enabled`, `status` |
| `ota_deployments` | The active-release pointer — exactly one active per `(channel, platform, runtime)` |
| `ota_rollouts` | Staged rollout config — percentage bucketing, `active` / `paused` / `completed` |
| `ota_devices` | Last-known per-device state (current bundle, last seen) |
| `ota_installations` | Append-only install telemetry (`downloaded` / `installed` / `failed`) |
| `ota_crashes` | Crash reports (fatal flag, stack, metadata) |
| `ota_rollbacks` | Audit log of rollback operations |
| `ota_analytics` | Append-only event stream (download / install / active / crash / rollback / …) |
| `ota_rate_limits` | Window-based rate-limit counters |

## Views

`ota_bundle_adoption`, `ota_update_success_stats`, `ota_crash_stats`, `ota_active_devices`, `ota_daily_events`, `ota_app_summary` — power the dashboard analytics with no extra queries.

## Row-Level Security

Every operator query is checked by `ota_is_app_member(application_id, min_role)`, which enforces the role hierarchy:

```
owner  ≥  admin  ≥  developer  ≥  viewer
```

- **Read** (`viewer`+): members can read their apps' data.
- **Releases / channels / rollouts** (`developer`+): create and update.
- **Settings / roles / delete** (`admin` / `owner`).
- **Telemetry tables** (`ota_devices`, `ota_installations`, `ota_crashes`, `ota_analytics`, `ota_rollbacks`): readable by members, **written only by the `service_role`** (edge functions).

Devices have no row in any policy — they authenticate solely via the app key against the edge functions.

## Staged rollout bucketing

`check-update` buckets a device deterministically with `hash(device_id) % 100`. If that value is outside the active rollout percentage, the device is told `NONE` (stays on its current bundle). Bumping the percentage later lets more devices through — the same device always lands in the same bucket, so a device that received the update keeps it.
