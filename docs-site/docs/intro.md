---
id: intro
title: Introduction
slug: /
sidebar_position: 1
---

# React Native OTA Update Platform

**Self-hosted Over-The-Air updates for React Native — powered entirely by Supabase.**

Ship JavaScript bundle updates to your users instantly, without going through the App Store or Play Store review process.

> No CodePush. No App Center. No Expo EAS. No per-seat pricing. **Full ownership.**

## Why this exists

Microsoft **CodePush / App Center is retired**, Expo **EAS Update is paid**, and other OTA services bill per monthly active user. This project is a free, MIT-licensed alternative that you host yourself on a single Supabase project. You keep the database, the storage bucket, the admin dashboard, and the keys.

It is modelled on the architecture of the best open-source OTA projects (notably [hot-updater](https://github.com/gronxb/hot-updater)) — native-owned bundle state, a crash-window auto-rollback, staged percentage rollouts, and signed download URLs.

## What you get

| | |
|---|---|
| 🚀 **Instant JS updates** | Push a new bundle; devices pick it up on next launch / background check |
| 🔐 **Per-app API keys** | Devices authenticate with a public `x-app-key`; never touch the database |
| 🎯 **Channels & runtimes** | `production` / `beta` / … per native binary version |
| 📊 **Staged rollouts** | Ship to 5% → 50% → 100%; pause/resume from the dashboard |
| ↩️ **Crash-window rollback** | Native auto-reverts a bundle that crashes on launch — before JS even runs |
| 🧮 **SHA-256 integrity** | Verified at upload, server-side, and on-device |
| 📈 **Analytics** | Adoption, install success, crash rate, active devices |
| 🖥️ **Admin dashboard** | Next.js 14 UI for apps, bundles, deployments, rollouts, crashes |

## How it fits together

A React Native app embeds the **SDK** and two tiny **native modules**. The SDK talks to **Supabase Edge Functions** using a public per-app key. Bundles live in a **private storage bucket** and are served via short-lived signed URLs. Operators publish releases with the **CLI** or manage them in the **dashboard**.

Continue to **[Architecture](./architecture)** for the full picture, or jump straight to **[Getting Started](./getting-started)**.
