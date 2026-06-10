---
id: rollback
title: Rollback
sidebar_position: 10
---

# Rollback

There are three independent ways a device can return to a previous bundle.

## 1 · Crash-window auto-rollback (native, automatic)

If a freshly applied bundle **crashes on launch before JS confirms success**, the native module detects the boot loop after 2 failed launches and reverts one tier:

```
pending → current → lastGood → embedded
```

It records `rollbackReason`, which the SDK reads once on the next launch and reports via `report-crash`. This is fully automatic and requires no server interaction — it is the only mechanism that works when JS never runs.

**Test it:** release a bundle that `throw`s at module top, apply it, relaunch twice. The third launch boots the previous bundle and a crash appears in the dashboard.

## 2 · Server-directed rollback (operator, remote)

Disable a bad bundle and devices roll back on their next check.

**Dashboard:** Bundles → toggle the bundle **off**.

**CLI:**

```bash
# Roll back the active release to the previous bundle
ota-cli rollback -c production -p android --runtime 1.0.0

# Roll back to a specific bundle, with an audit reason
ota-cli rollback -c production -p android --runtime 1.0.0 \
  --to-bundle <bundle-id> --reason "regression in checkout"
```

`check-update` then returns `ROLLBACK` to devices on the disabled bundle, and they apply the last good one. Every rollback writes an `ota_rollbacks` audit row.

## 3 · Manual rollback (in-app)

The SDK exposes `rollbackToLastGood()` for a user-triggered revert:

```tsx
const ok = await ota.rollbackToLastGood();
if (ok) await ota.reloadApp();
```

Returns `false` if there is no last-good bundle to revert to.

## Who owns what

| Layer | Handles |
|-------|---------|
| **Native** | Boot-loop / crash-window protection (JS can't run) |
| **Server** | Operator-initiated rollback, disabling bad bundles |
| **SDK (JS)** | Manual rollback, reporting, and a JS-only fallback for Expo Go |
