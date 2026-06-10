---
id: troubleshooting
title: Troubleshooting
sidebar_position: 14
---

# Troubleshooting

## `check-update` always returns `NONE`

- **`runtime_version` mismatch.** The SDK's `runtimeVersion` must exactly equal the release's `--runtime`. Different values resolve to different `ota_runtimes` rows.
- **Bundle disabled.** Check the dashboard — a disabled bundle is never served.
- **Outside the rollout window.** If the rollout is below 100%, the device may be bucketed out. Bump the percentage.
- **Wrong channel.** The SDK `channel` must match the release channel.

## Login fails in the dashboard / redirect loop

The dashboard requires `@supabase/ssr` ≥ 0.4 (it uses the `getAll`/`setAll` cookie API). If you see an endless redirect to `/login`, clear stale cookies for the host and ensure the package is up to date.

## CLI: "Invalid API key"

The Supabase **publishable** key is wrong or missing. Re-run `ota-cli login`, pass `-k <key>`, or set `OTA_SUPABASE_ANON_KEY`. This is *not* the service-role key.

## CLI: "Invalid login credentials"

The email/password don't match a user in the project. Confirm the account exists and is **email-confirmed** in Supabase → Authentication → Users.

## App crashes on launch with `useState of null`

Two copies of React in the bundle (common in monorepos). Pin React in `metro.config.js` with a `resolveRequest` that maps every `react` import to the app's own copy.

## Android build: "Could not resolve project :ota-sdk-android"

The SDK module path in `settings.gradle` is relative to the wrong directory. Use `new File(rootDir, '../../../packages/sdk/android')`.

## Android build: "Couldn't determine Hermesc location"

In a hoisted monorepo, set `hermesCommand` explicitly in `android/app/build.gradle`:

```groovy
react {
  hermesCommand = file("../../../../node_modules/react-native/sdks/hermesc/%OS-BIN%/hermesc").absolutePath
}
```

## The new bundle downloads but the app doesn't change

`reloadApp()` must trigger a **cold restart** to re-read `getJSBundleFile()`. The Android module does a full process restart (relaunch intent + `Runtime.exit`); recreating the React context alone is not enough.

## Migrations: "Remote migration versions not found"

An older schema was applied previously. Mark the stale versions reverted, then push:

```bash
supabase migration repair --status reverted <version> ...
supabase db push
```
