---
id: sdk-integration
title: SDK Integration
sidebar_position: 7
---

# SDK Integration

## Install

```bash
npm install @ota-platform/sdk \
  @react-native-async-storage/async-storage \
  react-native-fs \
  react-native-zip-archive \
  react-native-device-info
```

## Basic setup

```tsx
import { useEffect } from 'react';
import { OTAManager } from '@ota-platform/sdk';

const ota = new OTAManager({
  apiUrl:  'https://<project>.supabase.co/functions/v1',
  appKey:  'your-app-api-key',     // npx ota-cli apps:list
  channel: 'production',
  runtimeVersion: '1.0.0',         // MUST match `ota-cli release --runtime`
  checkOnStartup: true,
  checkInBackground: true,
  backgroundIntervalMs: 60_000,
  rollbackOnCrashCount: 3,
}).on({
  onUpdateAvailable:  (b) => console.log('downloading', b.version),
  onDownloadProgress: (recv, total) => console.log(recv, '/', total),
  onUpdateInstalled:  ()  => {/* prompt to restart */},
  onNoUpdate:         ()  => console.log('up to date'),
  onRollback:         (r) => console.warn('rolled back:', r),
  onError:            (e) => console.error(e),
});

export default function App() {
  useEffect(() => {
    ota.initialize().then(() => ota.onLaunchSuccess());
    return () => ota.stopBackgroundCheck();
  }, []);
  // …
}
```

:::caution runtimeVersion must match
`runtimeVersion` identifies the **native binary** the JS bundle is compatible with. It must exactly equal the value passed to `ota-cli release --runtime`. A mismatch means the device will never be offered the release.
:::

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `apiUrl` | — | Edge function base URL |
| `appKey` | — | Public per-app API key |
| `channel` | `production` | Target channel |
| `runtimeVersion` | app version | Native binary version (match the CLI `--runtime`) |
| `checkOnStartup` | `true` | Check for an update on `initialize()` |
| `checkInBackground` | `false` | Poll periodically |
| `backgroundIntervalMs` | `300000` | Poll interval |
| `maxRetries` | `3` | Download retry attempts |
| `rollbackOnCrashCount` | `3` | JS-fallback crash threshold (native owns the real crash-window) |
| `deviceId` | auto | Override the device id |

## OTAManager API

| Method | Description |
|--------|-------------|
| `initialize()` | Flush analytics, handle native rollback, optionally check on startup, start polling |
| `on(callbacks)` | Register event callbacks |
| `onLaunchSuccess()` | Signal a clean launch — promotes pending→current, resets crash counter |
| `checkUpdate()` | Check without applying |
| `checkAndApplyUpdate()` | Check and download/stage if available |
| `applyUpdate(bundle, force?)` | Download, verify, stage a specific bundle |
| `reloadApp()` | Restart the app so a staged bundle takes effect |
| `rollbackToLastGood()` | Manual rollback |
| `getState()` | Current / pending / last-good bundle ids |
| `stopBackgroundCheck()` | Stop polling |

## Auto-update dialog pattern

The reference app pops a native dialog automatically once a bundle is staged:

```tsx
onUpdateInstalled: () => {
  Alert.alert(
    '🆕 Update Available',
    'A new version has been downloaded. Restart now to apply it?',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Restart Now', onPress: () => ota.reloadApp() },
    ],
  );
},
```

Forced updates (`should_force_update`) can call `reloadApp()` directly without prompting. See `apps/demo-app/src/hooks/useOTA.ts` for the complete, de-duplicated implementation.
