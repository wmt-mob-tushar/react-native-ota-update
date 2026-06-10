# OTA Platform — Complete Instructions

Everything you need to go from zero to live OTA updates.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Backend Setup (Supabase)](#2-backend-setup-supabase)
3. [CLI Setup & Usage](#3-cli-setup--usage)
4. [React Native SDK Integration](#4-react-native-sdk-integration)
5. [Native Module Integration — Android](#5-native-module-integration--android)
6. [Native Module Integration — iOS](#6-native-module-integration--ios)
7. [Admin Dashboard](#7-admin-dashboard)
8. [CI/CD — GitHub Actions](#8-cicd--github-actions)
9. [Update Flow — How It All Works](#9-update-flow--how-it-all-works)
10. [Rollback Guide](#10-rollback-guide)
11. [Analytics & Monitoring](#11-analytics--monitoring)
12. [Security Notes](#12-security-notes)
13. [Troubleshooting](#13-troubleshooting)
14. [API Reference](#14-api-reference)
15. [End-to-End Test Walkthrough (Demo App)](#15-end-to-end-test-walkthrough-demo-app)

---

## 1. Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18+ |
| npm | 9+ |
| Supabase CLI | 1.175+ |
| React Native | 0.71+ |
| Java (for Android) | 11+ |
| Xcode (for iOS) | 14+ |

Install the Supabase CLI if you haven't:

```bash
npm install -g supabase
```

---

## 2. Backend Setup (Supabase)

### 2.1 Link your project

```bash
cd ~/ota-platform
supabase login
supabase link --project-ref iboujbxhilhhehcrsorv
```

### 2.2 Apply migrations (safe — all idempotent)

```bash
supabase db push
```

This runs 6 migration files in order:

| File | What it creates |
|------|----------------|
| `20260609000001_ota_core.sql` | All 12 tables (applications, ota_bundles, ota_devices …) |
| `20260609000002_ota_views.sql` | 6 analytics views |
| `20260609000003_ota_rls.sql` | Row-Level Security policies |
| `20260609000004_ota_storage.sql` | Private `ota` storage bucket + policies |
| `20260609000005_ota_rate_limits.sql` | Rate-limit counter table |
| `20260609000006_ota_rls_fixes.sql` | Rollouts RLS `WITH CHECK` fix + atomic rate-limit function |

> **Safe against existing data.** Every statement is `CREATE … IF NOT EXISTS`.
> No existing tables are dropped or altered.

### 2.3 Deploy Edge Functions

First, set the service-role secret (get it from Supabase Dashboard → Settings → API):

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

Then deploy all 7 functions:

```bash
supabase functions deploy check-update
supabase functions deploy create-release
supabase functions deploy rollback-release
supabase functions deploy report-install
supabase functions deploy report-crash
supabase functions deploy analytics
supabase functions deploy list-releases
```

Or deploy all at once:

```bash
supabase functions deploy
```

### 2.4 Verify the deployment

```bash
# Test check-update with a dummy app key (will return 401 — expected)
curl -X POST https://iboujbxhilhhehcrsorv.supabase.co/functions/v1/check-update \
  -H "Content-Type: application/json" \
  -H "x-app-key: not-real" \
  -d '{"platform":"ios","channel":"production","runtime_version":"1.0.0","device_id":"test-device-001"}'
# Expected: {"error":"Invalid app key"}  ← 401
```

---

## 3. CLI Setup & Usage

### 3.1 Install the CLI

```bash
# From the monorepo (local development):
cd ~/ota-platform/packages/cli
npm install
npm run build
npm link   # makes `ota-cli` available globally

# Or use directly with npx from your React Native project:
npx ota-cli --help
```

> **Note**: The CLI asks for your Supabase publishable (anon) key the first
> time you run `ota-cli login` and stores it with your credentials.
> Alternatively set it via environment variable:
> ```bash
> export OTA_SUPABASE_ANON_KEY=sb_publishable_AwualE5kkqlHc0yx_v2rgQ_dJHTGFqW
> ```

---

### 3.2 `ota-cli login`

Authenticates you with Supabase and stores credentials in `~/.config/ota-cli/auth.json`.

```bash
npx ota-cli login
# → prompts for email + password
# → stores access token locally
```

| Option | Description |
|--------|-------------|
| `-e, --email <email>` | Skip the email prompt |
| `-p, --password <pass>` | Skip the password prompt (not recommended) |
| `-k, --anon-key <key>` | Supabase publishable (anon) key (or set `OTA_SUPABASE_ANON_KEY`) |

---

### 3.3 `ota-cli logout`

Clears stored credentials.

```bash
npx ota-cli logout
```

---

### 3.4 `ota-cli init`

Links the current directory to one of your OTA applications.
Creates `.ota-config.json` in the current directory.

```bash
cd your-react-native-project
npx ota-cli init
# → shows a list of your apps to choose from
# → writes .ota-config.json
```

`.ota-config.json` looks like:
```json
{
  "applicationId": "uuid...",
  "appSlug": "my-app",
  "supabaseUrl": "https://iboujbxhilhhehcrsorv.supabase.co",
  "anonKey": "sb_publishable_...",
  "appKey": "uuid..."
}
```

> ⚠️ Commit `.ota-config.json` but **not** `.env` files or any secrets.
> The `appKey` in this file is the public device key — it's safe to commit.

---

### 3.5 `ota-cli apps:list`

Lists all applications you have access to, along with their API keys.

```bash
npx ota-cli apps:list
```

Output:
```
┌──────────────────┬──────────────────┬──────────────────────────────────────┬────────────┐
│ Name             │ Slug             │ App Key                              │ Created    │
├──────────────────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ My App           │ my-app           │ 550e8400-e29b-41d4-a716-446655440000  │ 2026-06-09 │
└──────────────────┴──────────────────┴──────────────────────────────────────┴────────────┘
```

---

### 3.6 `ota-cli release` ← **most important command**

Builds the JS bundle, uploads to Supabase Storage, and creates a new release.

```bash
# Release to production (both platforms):
npx ota-cli release --channel production --platform both

# Release to beta (iOS only, 25% staged rollout):
npx ota-cli release \
  --channel beta \
  --platform ios \
  --rollout 25 \
  --semver 1.2.3 \
  --message "New feature: dark mode"

# Force update (all devices must apply immediately):
npx ota-cli release --channel production --force

# Release with Hermes bytecode:
npx ota-cli release --hermes

# Dry run (build only, no upload):
npx ota-cli release --dry-run
```

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --platform` | `both` | `ios` \| `android` \| `both` |
| `-c, --channel` | `production` | Release channel |
| `--runtime <version>` | from `package.json` | Native binary version / ABI |
| `--hermes` | `false` | Compile to Hermes bytecode (.hbc) |
| `--force` | `false` | Mark as force-update |
| `--semver <ver>` | — | Human-readable version (e.g. `1.2.3`) |
| `--message <text>` | — | Release notes |
| `--rollout <n>` | `100` | Rollout percentage (0–100) |
| `--entry <file>` | `index.js` | RN entry point |
| `--dry-run` | `false` | Build only, skip upload |

**What `release` does internally:**
1. Runs `npx react-native bundle` (iOS + Android separately)
2. Optionally compiles Hermes bytecode via `hermesc`
3. Zips `main.jsbundle` + `assets/`
4. Computes SHA-256 of the zip
5. Uploads `bundle.zip` to `ota/{slug}/{channel}/{platform}/{uuid}/bundle.zip`
6. Calls the `create-release` Edge Function (which re-verifies the SHA-256 server-side)
7. Creates `ota_bundles` → `ota_deployments` → `ota_rollouts` records

---

### 3.7 `ota-cli rollout`

Update the rollout percentage for the active deployment.

```bash
# Increase rollout to 50%
npx ota-cli rollout \
  --channel production \
  --platform android \
  --percent 50

# Pause a rollout
npx ota-cli rollout --channel production --platform ios --percent 100 --pause

# Resume
npx ota-cli rollout --channel production --platform ios --percent 100 --resume
```

| Flag | Required | Description |
|------|----------|-------------|
| `-c, --channel` | ✓ | Channel name |
| `-p, --platform` | ✓ | `ios` \| `android` |
| `--percent <n>` | ✓ | New percentage (0–100) |
| `--pause` | — | Pause the rollout |
| `--resume` | — | Resume a paused rollout |

---

### 3.8 `ota-cli rollback`

Roll back the active release to the previous bundle.

```bash
# Auto-rollback to last good bundle:
npx ota-cli rollback --channel production --platform both

# Roll back to a specific bundle:
npx ota-cli rollback \
  --channel production \
  --platform ios \
  --to <bundle_id>

# With reason for the audit log:
npx ota-cli rollback \
  --channel production \
  --platform android \
  --reason "Critical JS crash in payment flow"
```

| Flag | Description |
|------|-------------|
| `-c, --channel` | Channel name (required) |
| `-p, --platform` | `ios` \| `android` (required) |
| `--to <bundle_id>` | Specific bundle UUID to roll back to |
| `--runtime <ver>` | Rollback only for a specific runtime version |
| `--reason <text>` | Audit reason (stored in `ota_rollbacks`) |

---

### 3.9 `ota-cli channel:create` / `channel:list`

```bash
# Create a new channel:
npx ota-cli channel:create --name staging

# List all channels:
npx ota-cli channel:list
```

---

### 3.10 `ota-cli releases:list`

```bash
# List recent releases:
npx ota-cli releases:list

# Filter by channel and platform:
npx ota-cli releases:list --channel beta --platform ios --limit 10
```

---

### 3.11 `ota-cli analytics`

```bash
npx ota-cli analytics --range 7d
# → prints active devices, adoption, crash rates, event totals
```

---

## 4. React Native SDK Integration

### 4.1 Install

```bash
# From npm (once published):
npm install @ota-platform/sdk

# Or copy the packages/sdk folder into your project and
# add to package.json:
# "@ota-platform/sdk": "file:../ota-platform/packages/sdk"
```

Also install peer dependencies:

```bash
npm install \
  @react-native-async-storage/async-storage \
  react-native-fs \
  react-native-zip-archive \
  react-native-device-info
```

### 4.2 Basic setup

```tsx
// App.tsx (or your root component)
import React, { useEffect } from 'react';
import { OTAManager } from '@ota-platform/sdk';

const ota = new OTAManager({
  apiUrl:  'https://iboujbxhilhhehcrsorv.supabase.co/functions/v1',
  appKey:  'your-app-api-key',   // from: npx ota-cli apps:list
  channel: 'production',
  runtimeVersion: '1.0.0',       // must match `ota-cli release --runtime`
  checkOnStartup:    true,
  checkInBackground: true,
  backgroundIntervalMs: 300_000,  // 5 minutes
  rollbackOnCrashCount: 3,
});

// Register callbacks
ota.on({
  onUpdateAvailable:  (bundle) => console.log('Update available:', bundle.version),
  onDownloadProgress: (recv, total) => console.log(`${recv}/${total} bytes`),
  onUpdateInstalled:  (bundle) => console.log('Update installed:', bundle.id),
  onError:            (err)    => console.error('OTA error:', err),
  onRollback:         (reason) => console.warn('Rolled back:', reason),
});

export default function App() {
  useEffect(() => {
    // Start OTA (checks for updates, handles rollback detection)
    ota.initialize();

    return () => ota.stopBackgroundCheck();
  }, []);

  useEffect(() => {
    // Tell OTA the app launched successfully (resets crash counter)
    const timer = setTimeout(() => ota.onLaunchSuccess(), 5000);
    return () => clearTimeout(timer);
  }, []);

  return /* your app */;
}
```

### 4.3 Showing an update prompt

```tsx
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { OTAManager, type BundleManifest } from '@ota-platform/sdk';

const ota = new OTAManager({ /* ... */ });

ota.on({
  onUpdateAvailable: (bundle: BundleManifest) => {
    if (bundle.should_force_update) {
      // Force update — no choice
      ota.applyUpdate(bundle, true);
      return;
    }
    // Optional update — prompt the user
    Alert.alert(
      'Update Available',
      bundle.message ?? `Version ${bundle.version} is available`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Update', onPress: () => ota.applyUpdate(bundle) },
      ],
    );
  },
});
```

### 4.4 Manual update check

```tsx
async function checkNow() {
  const result = await ota.checkUpdate();
  if (result.status === 'UPDATE') {
    console.log('New bundle:', result.bundle?.version);
  }
}
```

### 4.5 Manual rollback

```tsx
async function rollbackNow() {
  const didRollback = await ota.rollbackToLastGood();
  if (didRollback) {
    console.log('Rolled back to previous bundle');
  } else {
    console.log('No previous bundle to roll back to');
  }
}
```

---

## 5. Native Module Integration — Android

### 5.1 Copy native files

Copy `packages/sdk/android/src/main/java/com/ota/` into your Android project:

```bash
cp -r ~/ota-platform/packages/sdk/android/src/main/java/com/ota \
      android/app/src/main/java/com/
```

### 5.2 Register the package in `MainApplication.java`

```java
// android/app/src/main/java/com/yourapp/MainApplication.java

import com.ota.OTAPackage;           // ← add this import
import com.ota.OTAUtils;             // ← add this import

public class MainApplication extends Application implements ReactApplication {

  private final ReactNativeHost mReactNativeHost = new ReactNativeHost(this) {

    @Override
    protected List<ReactPackage> getPackages() {
      List<ReactPackage> packages = new PackageList(this).getPackages();
      packages.add(new OTAPackage());        // ← add this line
      return packages;
    }

    // ── KEY INTEGRATION: override getJSBundleFile() ──
    @Override
    protected String getJSBundleFile() {
      // Try OTA bundle first; fall back to embedded if none is staged
      String otaBundle = OTAUtils.getJSBundleFile(getApplication());
      return otaBundle != null ? otaBundle : super.getJSBundleFile();
    }

    @Override
    public boolean getUseDeveloperSupport() { return BuildConfig.DEBUG; }

    @Override
    protected String getJSMainModuleName() { return "index"; }
  };

  // ... rest of MainApplication unchanged
}
```

### 5.3 New Architecture (Kotlin + DefaultReactNativeHost)

```kotlin
// android/app/src/main/java/com/yourapp/MainApplication.kt

import com.ota.OTAPackage
import com.ota.OTAUtils

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
    object : DefaultReactNativeHost(this) {
      override fun getPackages(): List<ReactPackage> =
        PackageList(this).packages + listOf(OTAPackage())

      override fun getJSBundleFile(): String? =
        OTAUtils.getJSBundleFile(applicationContext) ?: super.getJSBundleFile()

      override fun getJSMainModuleName() = "index"
      override val isNewArchEnabled = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      override val isHermesEnabled  = BuildConfig.IS_HERMES_ENABLED
    }

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    OTAUtils.logBundleStatus(this)   // optional: logs which bundle is active
  }
}
```

---

## 6. Native Module Integration — iOS

### 6.1 Copy native files

```bash
cp ~/ota-platform/packages/sdk/ios/OTAModule.h  ios/YourApp/
cp ~/ota-platform/packages/sdk/ios/OTAModule.m  ios/YourApp/
```

Open Xcode, right-click your app target → **Add Files to "YourApp"** → select both files.

### 6.2 Old Architecture (`AppDelegate.m`)

```objc
// ios/YourApp/AppDelegate.m

#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>
#import "OTAModule.h"                // ← add this import

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  // ...existing code...
  return YES;
}

// ── KEY INTEGRATION: override sourceURLForBridge ──
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge {
  // Try OTA bundle first
  NSURL *otaBundle = [OTAModule bundleURLForBridge:bridge];
  if (otaBundle) return otaBundle;

#if DEBUG
  return [[RCTBundleURLProvider sharedSettings]
          jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle]
          URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
```

### 6.3 New Architecture (`AppDelegate.mm`)

```objc
// ios/YourApp/AppDelegate.mm

#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>
#import "OTAModule.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  self.moduleName = @"YourApp";
  return [super application:application
      didFinishLaunchingWithOptions:launchOptions];
}

// ── KEY INTEGRATION ──
- (NSURL *)bundleURL {
  NSURL *ota = [OTAModule bundleURL];
  if (ota) return ota;

#if DEBUG
  return [[RCTBundleURLProvider sharedSettings]
          jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle]
          URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
```

---

## 7. Admin Dashboard

### 7.1 Setup

```bash
cd ~/ota-platform/apps/dashboard

# Copy environment
cp ../../.env.example .env.local
# Edit .env.local with your actual values

npm install
npm run dev
```

Open http://localhost:3001

### 7.2 Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Overview — apps, active devices, crashes |
| Applications | `/dashboard/applications` | Create/manage apps, copy API keys |
| Channels | `/dashboard/channels` | Create release channels |
| Bundles | `/dashboard/bundles` | View all bundles, enable/disable |
| Deployments | `/dashboard/deployments` | Active deployment pointers per runtime |
| Rollouts | `/dashboard/rollouts` | Adjust rollout % live, pause/resume |
| Analytics | `/dashboard/analytics` | Charts: events, adoption, crash rates |
| Devices | `/dashboard/devices` | Active device list |
| Crash Reports | `/dashboard/crashes` | Crash log with stack traces |
| Settings | `/dashboard/settings` | Account, password |

### 7.3 Build for production

```bash
cd apps/dashboard
npm run build
npm start   # or deploy to Vercel/Netlify
```

Required environment variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://iboujbxhilhhehcrsorv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_AwualE5kkqlHc0yx_v2rgQ_dJHTGFqW
```

---

## 8. CI/CD — GitHub Actions

### 8.1 Add secrets to your repository

In your GitHub repository → Settings → Secrets and Variables → Actions:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://iboujbxhilhhehcrsorv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |
| `OTA_ACCESS_TOKEN` | your Supabase user access token (from CLI login) |

### 8.2 Automatic release on push to main

The workflow (`.github/workflows/ota-release.yml`) triggers on every push to `main`/`master` that changes JS files. It:

1. Builds the RN bundle for both iOS and Android in parallel
2. Zips and SHA-256s each bundle
3. Uploads to Supabase Storage
4. Calls `create-release` Edge Function
5. Posts a summary to the GitHub Actions step summary

### 8.3 Manual trigger with options

In GitHub → Actions → "OTA Release" → Run workflow:

- Choose `platform` (both / ios / android)
- Choose `channel` (production, beta, etc.)
- Set `rollout_percentage` (default 100)
- Toggle `force_update`

---

## 9. Update Flow — How It All Works

```
Device startup
    │
    ▼
OTAManager.initialize()
    │
    ├── 1. Flush queued analytics (offline events)
    │
    ├── 2. Rollback check
    │       Has crash count ≥ threshold?
    │       YES → rollback to lastGoodBundlePath → reload
    │       NO  → continue
    │
    ├── 3. POST /check-update  {platform, channel, runtime_version,
    │                           device_id, current_bundle_id}
    │
    │   Server logic:
    │   ├── Authenticate by x-app-key
    │   ├── Find active deployment for (channel, platform, runtime)
    │   ├── Get rollout → hash(device_id) % 100 < percentage?
    │   ├── current_bundle_id == active bundle?
    │   │       YES → return NONE
    │   │       NO  → return UPDATE (with signed URL, 5-min TTL)
    │   └── Current bundle disabled? → return ROLLBACK
    │
    ├── 4. Response: NONE  → nothing to do
    │             UPDATE → download bundle.zip
    │                       verify SHA-256
    │                       extract main.jsbundle
    │                       stage as pending
    │                       report install (downloaded + installed)
    │                       if force → reload native bridge
    │             ROLLBACK → apply lastGoodBundle or server-provided bundle
    │
    └── 5. App renders → ota.onLaunchSuccess()
              resets crash counter
              promotes pending → current
              records lastGoodBundle
```

---

## 10. Rollback Guide

### Automatic (crash-recovery)

The SDK detects crashes automatically:

1. On every startup, it increments a crash counter.
2. On successful render, `onLaunchSuccess()` resets it to 0.
3. If the counter reaches `rollbackOnCrashCount` (default: 3),
   the SDK automatically loads `lastGoodBundlePath`.
4. If there's no last-good path, it clears all OTA state → embedded bundle.

### Manual via CLI

```bash
# Roll back immediately (server-side + all devices on next check):
npx ota-cli rollback \
  --channel production \
  --platform both \
  --reason "v12 breaks checkout"
```

This:
1. Disables the current bundle (sets `enabled=false`, `status=rolled_back`)
2. Creates a new deployment pointing to the previous bundle
3. Writes an `ota_rollbacks` audit record
4. All devices get the rollback on their next `check-update` call

### Manual via Dashboard

1. Open **Bundles** page
2. Find the problematic bundle → toggle **Enabled** to OFF
3. Open **Rollouts** → set rollout to 0% for the current deployment
4. Navigate to **Deployments** → trigger rollback (TBD button in full build)

### Emergency: rollback to embedded bundle

```bash
npx ota-cli rollback \
  --channel production \
  --platform both \
  --to embedded
```

(Pass `to_bundle_id: null` to the Edge Function — it will clear all deployments.)

---

## 11. Analytics & Monitoring

### Tracked events

| Event | Triggered by |
|-------|-------------|
| `download` | Device started downloading bundle |
| `install` | Bundle installed (staged) successfully |
| `active` | Device called `onLaunchSuccess()` |
| `crash` | Device reported a crash via `report-crash` |
| `rollback` | Rollback triggered (SDK or CLI) |
| `update_success` | Install succeeded (alias of `install`) |
| `update_fail` | Install failed |

### Dashboard charts

- **Daily Events** — line chart: downloads, installs, crashes, rollbacks per day
- **Bundle Adoption** — bar chart: device count per bundle version
- **Crash Rates** — table: crashes/1000 installs per bundle
- **Active Devices** — 1d/7d/30d device counts per platform

### CLI analytics

```bash
npx ota-cli analytics --range 30d
```

---

## 12. Security Notes

| Concern | How it's handled |
|---------|-----------------|
| Device auth | `x-app-key` — a per-app UUID stored in the `applications` table. Never the service-role key. |
| Bundle integrity | SHA-256 verified both by CLI at build time AND by `create-release` Edge Function server-side. |
| Download URLs | Short-lived signed URLs (5-minute TTL) generated per device request. Never long-lived. |
| Operator auth | Supabase JWT (`Authorization: Bearer <token>`). |
| DB access | Devices have zero direct DB access — all writes go through service-role in Edge Functions. |
| RLS | Row-Level Security on every table. App members only see their own app's data. |
| Rate limiting | `check-update`: 30 req/60s per device. `report-crash`: 20 req/60s per device. |
| Bundle paths | Storage RLS prevents accessing another app's bundles. |
| Service-role key | Never shipped to client/CLI. Set as a Supabase function secret only. |

---

## 13. Troubleshooting

### "Invalid app key" (401 from check-update)

- Check that `.ota-config.json` has the correct `appKey`
- Confirm the app exists in the `applications` table
- Confirm the `api_key` column value matches

### "Bundle not found at storage path"

- The bundle was not uploaded before calling `create-release`
- Verify the upload step completed (no error in CLI output)
- Check the bucket path in Supabase Dashboard → Storage

### "SHA-256 mismatch"

- The file was corrupted during upload
- Re-run `ota-cli release` — it will generate a fresh bundle

### OTA bundle not loading on Android

1. Check logcat: `adb logcat -s OTAModule`
2. Verify `OTAUtils.getJSBundleFile()` returns a non-null path
3. Confirm `AsyncStorage` has the `@ota_state` key with a valid path
4. Ensure the bundle file exists at that path: `adb shell ls <path>`

### OTA bundle not loading on iOS

1. Check Xcode console for `[OTA]` log lines
2. Verify `AppDelegate` is calling `OTAModule.bundleURL` (not the old method)
3. Check that `RCTAsyncLocalStorage` directory contains the manifest

### "Rate limited" (429)

- Too many check-update calls from one device
- The SDK has built-in backoff; if you're calling manually, add a delay
- Check `ota_rate_limits` table for the key — run `ota_prune_rate_limits()` if it's full

### `supabase db push` fails with "relation already exists"

- The migrations are idempotent (`IF NOT EXISTS`) — re-running should be safe
- If you see this error, it means a non-OTA table name collides. Check the error details.

---

## 14. API Reference

### `POST /check-update`

**Auth**: `x-app-key: <api_key>`

**Request**:
```json
{
  "platform":         "ios",
  "channel":          "production",
  "runtime_version":  "1.0.0",
  "device_id":        "uuid-or-stable-id",
  "current_bundle_id": "uuid-or-null",
  "app_version":      "1.0.0",
  "os_version":       "17.0"
}
```

**Response** (UPDATE):
```json
{
  "status": "UPDATE",
  "bundle": {
    "id":                  "uuid",
    "version":             5,
    "semver":              "1.2.3",
    "platform":            "ios",
    "file_hash":           "sha256hex",
    "file_size":           1048576,
    "download_url":        "https://…signed…",
    "should_force_update": false,
    "message":             "Bug fixes"
  }
}
```

**Response** (NONE / ROLLBACK): same shape, `bundle` present only for ROLLBACK.

---

### `POST /create-release`

**Auth**: `Authorization: Bearer <jwt>`

**Request**:
```json
{
  "application_id":     "uuid",
  "channel":            "production",
  "platform":           "android",
  "runtime_version":    "1.0.0",
  "storage_path":       "my-app/production/android/uuid/bundle.zip",
  "file_hash":          "sha256hex",
  "file_size":          1048576,
  "semver":             "1.2.3",
  "should_force_update": false,
  "message":            "Release notes",
  "rollout_percentage": 100
}
```

**Response**:
```json
{ "bundle_id": "uuid", "deployment_id": "uuid", "version": 7 }
```

---

### `POST /rollback-release`

**Auth**: `Authorization: Bearer <jwt>`

**Request**:
```json
{
  "application_id":  "uuid",
  "channel":         "production",
  "platform":        "android",
  "to_bundle_id":    "uuid-or-omit-for-auto",
  "reason":          "Critical bug"
}
```

---

### `POST /report-install`

**Auth**: `x-app-key`

```json
{
  "bundle_id":     "uuid",
  "device_id":     "stable-device-id",
  "platform":      "ios",
  "status":        "installed",
  "app_version":   "1.0.0"
}
```

---

### `POST /report-crash`

**Auth**: `x-app-key`

```json
{
  "bundle_id":     "uuid-or-omit",
  "device_id":     "stable-device-id",
  "platform":      "android",
  "fatal":         true,
  "error_message": "TypeError: cannot read property 'x' of undefined",
  "stack":         "at foo (bundle.js:1:2)\n…",
  "app_version":   "1.0.0"
}
```

---

### `POST /analytics`

**Auth**: `Authorization: Bearer <jwt>`

```json
{ "application_id": "uuid", "range": "7d" }
```

---

### `POST /list-releases`

**Auth**: `Authorization: Bearer <jwt>`

```json
{
  "application_id": "uuid",
  "channel":        "production",
  "platform":       "ios",
  "limit":          20,
  "offset":         0
}
```

---

## 15. End-to-End Test Walkthrough (Demo App)

Run this once on a real device/emulator to prove the whole pipeline:
release → update check → download → reload → rollback → crash recovery.

### 15.1 One-time setup

```bash
# 1. Apply migrations + deploy edge functions (from repo root)
npx supabase link --project-ref iboujbxhilhhehcrsorv
npx supabase db push
npx supabase functions deploy

# 2. Install workspace dependencies
npm install

# 3. Create an app in the dashboard (http://localhost:3001 → Applications →
#    New) and copy its App API key into apps/demo-app/src/hooks/useOTA.ts
#    (OTA_APP_KEY). Keep OTA_RUNTIME_VERSION = '1.0.0'.

# 4. Log in with the CLI and link the demo app
cd apps/demo-app
npx ota-cli login        # prompts for email/password + Supabase publishable key
npx ota-cli init         # select the app you created
```

### 15.2 Android: baseline build with embedded bundle

```bash
cd apps/demo-app
mkdir -p android/app/src/main/assets
npm run bundle:android                  # embeds the baseline JS bundle
cd android && ./gradlew assembleRelease
adb install app/build/outputs/apk/release/app-release.apk
```

Launch the app — it should show the home screen and `adb logcat -s OTAModule`
should print `No OTA bundle staged — using embedded bundle`.

### 15.3 Publish an OTA update

```bash
# Make a visible JS change, e.g. edit a title in src/screens/HomeScreen.tsx
npx ota-cli release -p android --runtime 1.0.0 --message "test update"
```

In the app press **Check for updates** → it downloads and stages the bundle.
Press **Install** (or relaunch the app). On the next boot logcat shows
`Loading OTA bundle: /data/.../bundle_id/extracted/main.jsbundle` and your
change is visible. The dashboard → Devices shows the device on the new bundle.

### 15.4 Server-directed rollback

```bash
npx ota-cli rollback -c production -p android --runtime 1.0.0
```

Press **Check for updates** in the app → status `ROLLBACK`, the previous
bundle is restored, and the rollback appears in the dashboard audit log.

### 15.5 Crash-window auto-rollback

Release a deliberately broken bundle:

```bash
# Add `throw new Error('boom')` at the top of index.js, then:
npx ota-cli release -p android --runtime 1.0.0 --message "broken"
```

In the app: check for updates, install, and relaunch the app **twice**.
Both launches crash before JS runs `onLaunchSuccess()`, so on the third
launch the native module discards the bad bundle (logcat:
`Crash-window: discarding pending bundle …`), boots the previous one, and
the SDK reports the crash — visible in dashboard → Crashes.

> Remember to remove the `throw` and release a good bundle afterwards.

### 15.6 iOS (macOS required)

```bash
cd apps/demo-app/ios && pod install
npm run bundle:ios          # embeds main.jsbundle for Release builds
# Open OTADemo.xcworkspace in Xcode, select the Release scheme, run on
# a simulator, then repeat 15.3–15.5 with -p ios.
```
