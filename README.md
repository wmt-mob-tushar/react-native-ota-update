<div align="center">

# ⚡ React Native OTA Update Platform

**Self-hosted Over-The-Air updates for React Native — powered entirely by Supabase.**

Ship JavaScript bundle updates to your users instantly, without going through the App Store or Play Store.

No CodePush. No App Center. No Expo EAS. No per-seat pricing. **Full ownership.**

[Getting Started](#-getting-started) · [Architecture](#-architecture) · [CLI](#-cli-reference) · [SDK](#-sdk-integration) · [Docs](./docs-site)

</div>

---

## Why this exists

Microsoft **CodePush / App Center is retired**, Expo **EAS Update is paid**, and the other OTA services bill per‑MAU. This project is a free, MIT‑licensed alternative you host yourself on a single Supabase project. You keep the database, the storage bucket, the admin dashboard, and the keys.

It is modelled on the architecture of the best open‑source OTA projects (notably [hot-updater](https://github.com/gronxb/hot-updater)) — native‑owned bundle state, a crash‑window auto‑rollback, staged percentage rollouts, and signed download URLs.

## ✨ Features

| | |
|---|---|
| 🚀 **Instant JS updates** | Push a new bundle; devices pick it up on next launch / background check |
| 🔐 **Per-app API keys** | Devices authenticate with a public `x-app-key`; no DB access |
| 🎯 **Channels & runtimes** | `production` / `beta` / … per native binary version |
| 📊 **Staged rollouts** | Ship to 5% → 50% → 100%; pause/resume from the dashboard |
| ↩️ **Crash-window rollback** | Native auto-reverts a bundle that crashes on launch — before JS even runs |
| 🔁 **Server-directed rollback** | Disable a bad bundle; devices roll back on next check |
| 🧮 **SHA-256 integrity** | Verified at upload, server-side, and on-device before applying |
| 🗄️ **Signed URLs** | Bundles live in a private bucket; downloads use 5-min signed URLs |
| 📈 **Analytics** | Adoption, install success, crash rate, active devices |
| 🖥️ **Admin dashboard** | Next.js 14 UI for apps, bundles, deployments, rollouts, crashes |

## 🏗 Architecture

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
│  report-install report-crash     analytics          (_shared: auth, cors,  │
│                                                       rate-limit, sha256)   │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │  service-role
                ┌────────────────┴─────────────────┐
                ▼                                   ▼
┌──────────────────────────────┐     ┌──────────────────────────────────────┐
│  PostgreSQL (RLS-protected)  │     │  Storage — private "ota" bucket       │
│  applications · ota_channels │     │  ota/{slug}/{channel}/{platform}/     │
│  ota_runtimes · ota_bundles  │     │      {bundle_id}/bundle.zip           │
│  ota_deployments · rollouts  │     │  (downloads via 5-min signed URLs)    │
│  ota_devices · ota_analytics │     └──────────────────────────────────────┘
│  ota_crashes · ota_rate_limit│
└──────────────────────────────┘
        ▲                                            ▲
        │ Bearer JWT (operator)                      │ Bearer JWT (operator)
┌───────┴────────┐                          ┌────────┴──────────────┐
│  ota-cli       │  npx ota-cli release     │  Next.js Dashboard     │  :3001
└────────────────┘                          └────────────────────────┘
```

### Trust model

| Actor | Auth | Can do |
|-------|------|--------|
| **Device** | `x-app-key` header (public per-app UUID) | check for updates, download (signed URL), report install/crash |
| **Operator** | Supabase JWT (email/password) | create releases, manage rollouts, view analytics — gated by RLS roles (`owner` > `admin` > `developer` > `viewer`) |
| **Edge functions** | `service_role` | the only writer to telemetry tables |

## 📦 Monorepo structure

```
react-native-ota-update/
├── supabase/
│   ├── migrations/              # 7 idempotent SQL migrations
│   └── functions/               # 7 Deno edge functions + _shared/
├── packages/
│   ├── sdk/                     # @ota-platform/sdk
│   │   ├── src/ota/             #   OTAManager, BundleDownloader, …
│   │   ├── android/             #   OTAModule.java (native boot state)
│   │   └── ios/                 #   OTAModule.m
│   └── cli/                     # npx ota-cli (login, init, release, rollout…)
├── apps/
│   ├── dashboard/               # Next.js 14 admin panel
│   └── demo-app/                # RN 0.74 reference app (full OTA flow)
├── docs-site/                   # Docusaurus documentation
└── INSTRUCTIONS.md              # exhaustive step-by-step reference
```

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Supabase CLI | ≥ 2.x (`npm i -D supabase`) |
| JDK (Android) | 17 |
| Android SDK | platform 34, build-tools 34 |
| Xcode (iOS) | 15+ |

### 1 · Backend

```bash
git clone https://github.com/wmt-mob-tushar/react-native-ota-update.git
cd react-native-ota-update
npm install

# Link your Supabase project and apply the schema
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # 7 migrations
npx supabase functions deploy   # 7 edge functions
```

> The edge functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the function environment (set automatically by Supabase, or via `supabase secrets set`).

### 2 · Dashboard

```bash
cd apps/dashboard
cp ../../.env.example .env.local   # set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY
npm run dev                        # → http://localhost:3001
```

Sign up, **create an application**, and copy its **App API key**. A `production` channel is created for you automatically.

### 3 · CLI

```bash
npx ota-cli login      # email + password + Supabase publishable key
npx ota-cli init       # link the current RN project to an app
npx ota-cli release -p android --runtime 1.0.0 --message "First OTA update"
```

### 4 · SDK in your app

See [SDK Integration](#-sdk-integration) below, then publish a change with `ota-cli release` and watch it land on-device.

> 💡 A complete, working reference app lives in [`apps/demo-app`](./apps/demo-app) — including a prominent version hero and an automatic “Update Available → Restart” dialog.

## 🧩 SDK Integration

```bash
npm install @ota-platform/sdk \
  @react-native-async-storage/async-storage \
  react-native-fs react-native-zip-archive react-native-device-info
```

```tsx
import { useEffect } from 'react';
import { OTAManager } from '@ota-platform/sdk';

const ota = new OTAManager({
  apiUrl:  'https://<project>.supabase.co/functions/v1',
  appKey:  'your-app-api-key',     // npx ota-cli apps:list
  channel: 'production',
  runtimeVersion: '1.0.0',         // MUST match `ota-cli release --runtime`
  checkInBackground: true,
  backgroundIntervalMs: 60_000,
}).on({
  onUpdateAvailable:  (b) => console.log('downloading', b.version),
  onUpdateInstalled:  ()  => {/* show "Restart now?" dialog */},
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

**Native setup** is one override per platform — `getJSBundleFile()` (Android `MainApplication`) and `sourceURLForBridge:` (iOS `AppDelegate`). Full snippets in [`INSTRUCTIONS.md` §5–6](./INSTRUCTIONS.md) and the docs site.

### How an update applies

1. SDK calls `check-update` on launch + every `backgroundIntervalMs`.
2. Server returns the newest **enabled** bundle for the device’s channel + runtime (honouring the rollout %).
3. SDK downloads `bundle.zip` from a signed URL, verifies SHA-256, unzips, and **stages it as pending** (written into native `SharedPreferences` / `NSUserDefaults`).
4. App calls `ota.reloadApp()` → **process restart** → native `getJSBundleFile()` returns the staged path → the new JS runs.
5. `onLaunchSuccess()` promotes *pending → current* and resets the crash counter.

### Crash-window auto-rollback (native-owned)

If a freshly applied bundle **crashes before JS confirms success**, the native module detects the boot loop (2 failed launches), discards the bad bundle (pending → current → lastGood → embedded), and records the reason — which the SDK reports to `report-crash`. No server round-trip required.

## 🛠 CLI Reference

| Command | Purpose |
|---------|---------|
| `ota-cli login` | Authenticate (stores JWT + publishable key) |
| `ota-cli init` | Link a directory to an app → `.ota-config.json` |
| `ota-cli apps:list` | List your applications + API keys |
| `ota-cli release` | Build → upload → create release |
| `ota-cli rollout` | Set rollout %, pause, or resume |
| `ota-cli rollback` | Roll back to previous (or a specific) bundle |
| `ota-cli channel:create` / `channel:list` | Manage channels |
| `ota-cli releases:list` | List bundles |
| `ota-cli analytics` | Adoption / crash summary |

```bash
# Staged beta rollout with Hermes bytecode
ota-cli release -p ios -c beta --rollout 25 --hermes --semver 1.4.0 --message "Dark mode"

# Promote to everyone
ota-cli rollout -c beta -p ios --percent 100
```

> The CLI reads the Supabase publishable key from your login, `.ota-config.json`, or `OTA_SUPABASE_ANON_KEY`. It never needs the service-role key.

## 🖥 Dashboard

`apps/dashboard` (Next.js 14) provides: applications & API keys · bundles with an enable/disable toggle · deployments · rollouts with a percentage slider and pause/resume · devices · crash reports · analytics charts (recharts) · settings.

## 🗃 Database schema (highlights)

`applications`, `application_members` (RBAC), `ota_channels`, `ota_runtimes`, `ota_bundles`, `ota_deployments` (one active per channel/platform/runtime), `ota_rollouts` (percentage bucketing), `ota_devices`, `ota_installations`, `ota_crashes`, `ota_analytics`, `ota_rate_limits`. All operator access is enforced by Row-Level Security; the device path never touches the DB directly.

## 🧪 The demo app

[`apps/demo-app`](./apps/demo-app) is a runnable RN 0.74 app wired to the SDK and native modules. It shows a version hero, live bundle state, a download progress bar, and an **automatic update dialog** that restarts into the new bundle. See [`INSTRUCTIONS.md` §15](./INSTRUCTIONS.md) for the end-to-end test walkthrough (release → update → rollback → crash recovery).

## 📚 Documentation

- **[INSTRUCTIONS.md](./INSTRUCTIONS.md)** — exhaustive step-by-step reference (backend, CLI, SDK, native, dashboard, API, troubleshooting, E2E test).
- **[docs-site/](./docs-site)** — Docusaurus site (`cd docs-site && npm install && npm start`).

## License

MIT © WebMob Technologies
