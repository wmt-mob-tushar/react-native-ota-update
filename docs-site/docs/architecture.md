---
id: architecture
title: Architecture
sidebar_position: 2
---

# Architecture

```
┌──────────────────────────── React Native App ────────────────────────────┐
│                                                                            │
│   @ota-platform/sdk (OTAManager)        Native modules (own boot state)    │
│   ├─ checkUpdate / applyUpdate          ├─ Android: OTAModule.java         │
│   ├─ BundleDownloader (SHA-256 + unzip) │   getJSBundleFile() + SharedPrefs │
│   ├─ BundleInstaller (write-through)    └─ iOS: OTAModule.m                │
│   └─ RollbackManager / Analytics            bundleURL + NSUserDefaults      │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │  POST  x-app-key: <per-app uuid>
                                 ▼
┌──────────────────── Supabase Edge Functions (Deno / TS) ───────────────────┐
│  check-update   create-release   rollback-release   list-releases          │
│  report-install report-crash     analytics                                 │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │  service-role
                ┌────────────────┴─────────────────┐
                ▼                                   ▼
┌──────────────────────────────┐     ┌──────────────────────────────────────┐
│  PostgreSQL (RLS-protected)  │     │  Storage — private "ota" bucket       │
│  applications · ota_bundles  │     │  ota/{slug}/{channel}/{platform}/     │
│  ota_deployments · rollouts  │     │      {bundle_id}/bundle.zip           │
│  ota_devices · ota_analytics │     │  (downloads via 5-min signed URLs)    │
└──────────────────────────────┘     └──────────────────────────────────────┘
        ▲                                            ▲
        │ Bearer JWT (operator)                      │ Bearer JWT (operator)
┌───────┴────────┐                          ┌────────┴──────────────┐
│  ota-cli       │  npx ota-cli release     │  Next.js Dashboard     │  :3001
└────────────────┘                          └────────────────────────┘
```

## Components

| Component | Tech | Responsibility |
|-----------|------|----------------|
| **SDK** | TypeScript (RN) | Check, download, verify, stage, rollback, analytics |
| **Native modules** | Java (Android) / Obj-C (iOS) | Own the boot-critical bundle path; crash-window protection |
| **Edge functions** | Deno / TypeScript | Update decisions, release creation, telemetry |
| **Database** | PostgreSQL + RLS | Apps, bundles, deployments, rollouts, devices, analytics |
| **Storage** | Supabase Storage | Private bucket of `bundle.zip` artifacts |
| **CLI** | Node / Commander | Build, upload, create release, rollout, rollback |
| **Dashboard** | Next.js 14 | Operator UI |

## Trust model

| Actor | Authentication | Capabilities |
|-------|----------------|--------------|
| **Device** | `x-app-key` header (public per-app UUID) | Check for updates, download via signed URL, report install/crash. **No database access.** |
| **Operator** | Supabase JWT (email/password) | Create releases, manage rollouts, view analytics — gated by RLS roles. |
| **Edge functions** | `service_role` key | The only writer to telemetry tables (`ota_devices`, `ota_analytics`, `ota_crashes`, …). |

### RLS role hierarchy

`owner` ▸ `admin` ▸ `developer` ▸ `viewer`. The SQL helper `ota_is_app_member(app_id, min_role)` powers every policy. Devices are anonymous — they authenticate only with the app key and never read or write the database directly.

## Key design decisions

### Native-owned bundle state

The "which bundle to boot" pointer lives in **Android `SharedPreferences` ("OTAPrefs")** and **iOS `NSUserDefaults` (`ota.*` keys)** — *not* AsyncStorage. The native bundle resolver (`getJSBundleFile()` / `bundleURL`) runs **before the React context exists**, and AsyncStorage (SQLite on Android) cannot be read synchronously at that point. The SDK writes through to native and keeps an AsyncStorage mirror only for UI.

### Crash-window auto-rollback

The native module owns boot-loop protection. Each OTA boot increments a counter; a successful launch resets it via `markSuccess()`. If a bundle crashes twice **before JS confirms success**, native discards it (pending → current → lastGood → embedded) and records the reason for the SDK to report. This is the one failure mode JS-side rollback can't handle — because JS never runs.

### Signed, integrity-checked bundles

Bundles are stored in a **private** bucket. The CLI computes a SHA-256 at upload; `create-release` re-verifies it server-side; `check-update` mints a **5-minute signed URL**; and the SDK verifies the hash again after download, before unzipping.
