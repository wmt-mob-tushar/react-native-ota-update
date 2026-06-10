---
id: getting-started
title: Getting Started
sidebar_position: 3
---

# Getting Started

Go from zero to a live OTA update in five steps.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Supabase CLI | ≥ 2.x (`npm i -D supabase`) |
| JDK (Android) | 17 |
| Android SDK | platform 34, build-tools 34 |
| Xcode (iOS) | 15+ |

## 1 · Clone & install

```bash
git clone https://github.com/wmt-mob-tushar/react-native-ota-update.git
cd react-native-ota-update
npm install
```

## 2 · Provision the backend

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies 7 migrations
npx supabase functions deploy   # deploys 7 edge functions
```

See **[Backend Setup](./backend-setup)** for detail and verification.

## 3 · Run the dashboard

```bash
cd apps/dashboard
cp ../../.env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY
npm run dev                        # http://localhost:3001
```

Sign up, **create an application**, and copy its **App API key**. A `production` channel is created automatically.

## 4 · Authenticate the CLI & link your app

```bash
npx ota-cli login      # email + password + Supabase publishable key
npx ota-cli init       # pick the app you just created
```

## 5 · Add the SDK and publish

Integrate the [SDK](./sdk-integration) and [native modules](./native-modules) into your app, build it once with the embedded bundle, then:

```bash
# Make a visible JS change, then:
npx ota-cli release -p android --runtime 1.0.0 --message "First OTA update"
```

On the next background check (or a manual "Check for Update"), the device downloads the bundle, prompts to restart, and loads your change — no reinstall.

:::tip Reference app
A complete, runnable example is in [`apps/demo-app`](https://github.com/wmt-mob-tushar/react-native-ota-update/tree/main/apps/demo-app). It shows a version hero and an automatic “Update Available → Restart” dialog. The full end-to-end test walkthrough (release → update → rollback → crash recovery) is in `INSTRUCTIONS.md` §15.
:::

## Building the demo app on a fresh machine

```bash
# JDK 17 + Android SDK 34 required. Then:
cd apps/demo-app
npm run bundle:android                          # embed baseline JS
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```
