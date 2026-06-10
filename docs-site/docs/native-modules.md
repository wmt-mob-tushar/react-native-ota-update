---
id: native-modules
title: Native Modules
sidebar_position: 8
---

# Native Modules

Two small native modules let the app load a downloaded bundle at boot. They own the bundle pointer in platform storage so it can be read **synchronously, before the React context exists**.

## Android

Copy `packages/sdk/android/src/main/java/com/ota/` into your app (or link the module), register the package, and override `getJSBundleFile()`.

```kotlin
// MainApplication.kt
import com.ota.OTAPackage

override val reactNativeHost: ReactNativeHost =
  object : DefaultReactNativeHost(this) {
    override fun getJSBundleFile(): String? =
      com.ota.OTAModule.getJSBundleFile(applicationContext)
        ?: super.getJSBundleFile()

    override fun getPackages(): List<ReactPackage> =
      PackageList(this).packages.apply { add(OTAPackage()) }

    override fun getJSMainModuleName() = "index"
    override val isNewArchEnabled = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
    override val isHermesEnabled  = BuildConfig.IS_HERMES_ENABLED
  }
```

State lives in `SharedPreferences("OTAPrefs")`. `reload()` performs a **full process restart** (relaunch intent + `Runtime.exit`) so the next cold start re-reads `getJSBundleFile()`.

## iOS

Add `packages/sdk/ios/OTAModule.{h,m}` to your target and override the bundle URL in `AppDelegate`.

```objc
// AppDelegate.mm
#import "OTAModule.h"

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge {
  NSURL *ota = [OTAModule bundleURLForBridge:bridge];
  if (ota) return ota;
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
```

State lives in `NSUserDefaults` (`ota.*` keys). `reload()` calls `RCTTriggerReloadCommandListeners`.

## Native state keys

Both platforms persist the same shape:

```
ota.currentPath / currentId     ← active bundle
ota.pendingPath / pendingId     ← staged, awaiting first successful launch
ota.lastGoodPath / lastGoodId   ← previous known-good bundle
ota.bootAttempts                ← crash-window counter
ota.rollbackReason / fromId     ← set by a crash-window rollback, read once by the SDK
```

## Boot algorithm (crash-window)

On every launch the native bundle resolver:

1. If `bootAttempts ≥ 2`, the active tier crashed before JS confirmed success → **fall back one tier** (pending → current → lastGood → embedded) and record `rollbackReason`.
2. Otherwise pick `pending` (if staged & on disk) else `current`, and **increment** `bootAttempts`.
3. The SDK's `onLaunchSuccess()` calls `markSuccess()` → resets `bootAttempts` and promotes pending→current.

This is why the **native** layer owns rollback: when a bundle crashes on launch, JS never runs, so only native can recover. The JS `RollbackManager` is a fallback for JS-only (Expo Go) mode and disables itself when the native module is present.

## Autolinking note (monorepos)

The SDK ships native code but is linked manually in the demo (`settings.gradle` / `Podfile`). A `react-native.config.js` disables autolinking for `@ota-platform/sdk` to avoid double registration.
