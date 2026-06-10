---
id: update-flow
title: Update Flow
sidebar_position: 9
---

# Update Flow

End-to-end, here is what happens from publishing a release to a device running the new code.

```
Operator                Edge Functions            Device (SDK + native)
   │                          │                          │
   │ ota-cli release          │                          │
   ├─ build + zip + sha256 ──▶│                          │
   ├─ upload bundle.zip ─────▶│ Storage                  │
   ├─ create-release ────────▶│ verify sha256, insert    │
   │                          │ bundle + deployment      │
   │                          │                          │
   │                          │◀──── check-update ───────┤ (startup / every 60s)
   │                          │ resolve active bundle    │
   │                          │ rollout gate             │
   │                          │ sign URL ───────────────▶│
   │                          │                          ├─ download bundle.zip
   │                          │                          ├─ verify sha256
   │                          │                          ├─ unzip → stage pending
   │                          │◀──── report-install ─────┤   (write to native prefs)
   │                          │                          │
   │                          │                          ├─ Alert: "Update available"
   │                          │                          ├─ reloadApp() → restart
   │                          │                          ├─ getJSBundleFile() → pending
   │                          │                          ├─ new JS runs
   │                          │◀──── report (active) ────┤ onLaunchSuccess()
   │                          │                          │   promote pending→current
```

## Step by step

1. **Publish.** `ota-cli release` builds the JS bundle, zips it with assets, computes SHA-256, uploads to the private bucket, and calls `create-release` — which re-verifies the hash and creates the bundle + active deployment.

2. **Check.** The SDK calls `check-update` on launch and every `backgroundIntervalMs`. The server returns the newest enabled bundle for the device's channel + runtime, subject to the rollout percentage.

3. **Download & verify.** The SDK fetches the signed URL, retries with backoff, and verifies SHA-256 before unzipping to the app's documents directory.

4. **Stage.** The new bundle is written into native state as `pending`. The AsyncStorage mirror is updated for the UI.

5. **Apply.** `reloadApp()` performs a full process restart. On the cold start, `getJSBundleFile()` returns the pending path and the new JS runs.

6. **Confirm.** `onLaunchSuccess()` calls `markSuccess()` — native promotes pending→current, saves the old current as last-good, and resets the crash counter.

## Status values

`check-update` returns one of:

| Status | Meaning |
|--------|---------|
| `UPDATE` | A newer enabled bundle is available — SDK downloads & stages it |
| `ROLLBACK` | The device is on a disabled/rolled-back bundle — SDK applies the last good bundle |
| `NONE` | Up to date, or outside the rollout window |

## Forced vs optional updates

A bundle released with `--force` carries `should_force_update: true`. The SDK can apply and reload it immediately without prompting. Optional updates stage silently and let the app decide when to restart (e.g. via the "Update available" dialog).
