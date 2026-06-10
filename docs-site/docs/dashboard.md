---
id: dashboard
title: Dashboard
sidebar_position: 12
---

# Dashboard

A Next.js 14 admin panel (`apps/dashboard`) for managing everything visually.

## Run it

```bash
cd apps/dashboard
cp ../../.env.example .env.local   # set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY
npm run dev                        # http://localhost:3001
```

Authentication uses Supabase email/password. Middleware redirects unauthenticated users to `/login`; Row-Level Security ensures you only see apps you are a member of.

## Pages

| Page | What you can do |
|------|-----------------|
| **Dashboard** | Stats: apps, active devices, bundles, crashes (30d) |
| **Applications** | Create apps, copy the App API key, drill into details |
| **Application detail** | Members, channels, bundles, deployments, settings |
| **Bundles** | List bundles; **enable/disable** toggle (disabling triggers device rollback) |
| **Deployments** | Active deployments with rollout status |
| **Rollouts** | Percentage **slider**, **pause/resume** with confirmation |
| **Devices** | Active devices filtered by platform |
| **Crashes** | Crash reports with stack traces |
| **Analytics** | Adoption, install success, crash rate, daily events (recharts) |
| **Settings** | Team and danger-zone actions |

## Creating your first app

1. Sign up / log in.
2. **Applications → New** — enter a name and slug.
3. A `production` channel is created automatically.
4. Copy the **App API key** — this is the `appKey` for your SDK config and the `x-app-key` devices send.

## The enable/disable toggle

Each bundle row has a switch. Turning a bundle **off** removes it from `check-update` results and signals a **`ROLLBACK`** to devices currently on it. Useful for instantly pulling a bad release. The toggle confirms the write succeeded against the database before updating the UI.
