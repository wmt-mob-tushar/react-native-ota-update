---
id: intro
title: Introduction
slug: /
sidebar_position: 1
---

# React Native OTA Update Platform

**Update your React Native app without the App Store.**

Normally, fixing even a tiny bug in a mobile app means submitting a new build and waiting hours or days for App Store / Play Store review. This platform lets you push the change straight to your users' phones in **minutes** — over the air (OTA).

It's **free**, **open-source**, and you **host it yourself**.

## What is OTA?

Most of a React Native app is JavaScript. OTA updates let you replace that JavaScript on a device **after** the app is installed — so bug fixes and small features go out instantly, without a new store release.

> You still need the store for native changes (new libraries, permissions, icons). OTA is for the JavaScript part — which is most of your day-to-day changes.

## How it works (in 4 steps)

1. **You release.** Run one command — `ota-cli release` — and your new JavaScript bundle is uploaded to your server.
2. **The app checks.** Your app asks the server "is there a newer version?" on launch and in the background.
3. **It downloads.** If yes, the app quietly downloads and verifies the new bundle.
4. **It applies.** The app shows an "Update available" prompt (or updates silently) and restarts into the new version.

If an update ever crashes on startup, the app **automatically rolls back** to the last working version — so a bad release can't brick your users.

## Why use this instead of the alternatives?

The popular OTA tools are either gone or paid:

- ❌ Microsoft **CodePush** — retired
- ❌ **Expo EAS Update** — paid, charges per user
- ✅ **This** — free, MIT-licensed, fully yours

You own the database, the files, the dashboard, and the keys. No per-user fees, no vendor lock-in.

## Main features

| Feature | What it means |
|---------|---------------|
| 🚀 Instant updates | Ship JavaScript fixes without store review |
| 🎯 Channels | Separate `production`, `beta`, etc. |
| 📊 Staged rollouts | Release to 5% of users, then 50%, then 100% |
| ↩️ Auto-rollback | A crashing update reverts itself automatically |
| 🔐 Secure | Per-app keys, signed downloads, integrity checks |
| 📈 Analytics | See adoption, crashes, and active devices |
| 🖥️ Dashboard | A web admin panel to manage everything |

## Use any backend you like

The reference setup runs on **Supabase** (a free, hosted database + storage) so you can be live quickly. But the backend is **swappable** — you can run it on your own Node.js server with any database and file storage using the [`@ota-platform/server`](./custom-backend) package. The app SDK doesn't change either way.

## Next steps

- 👉 **[Getting Started](./getting-started)** — set it up end to end
- 🏗️ **[Architecture](./architecture)** — how the pieces connect
- 🔌 **[Bring Your Own Backend](./custom-backend)** — run it without Supabase
