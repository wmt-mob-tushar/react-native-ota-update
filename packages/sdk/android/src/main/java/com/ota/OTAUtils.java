package com.ota;

import android.content.Context;
import android.util.Log;

/**
 * OTAUtils — static helpers for use in MainApplication / ReactNativeHost.
 *
 * ─────────────────────────────────────────────────────────────
 * INTEGRATION GUIDE — MainApplication.java
 * ─────────────────────────────────────────────────────────────
 *
 * Old Architecture:
 * ─────────────────
 * In your MainApplication.java, override getJSBundleFile():
 *
 *   private final ReactNativeHost mReactNativeHost = new ReactNativeHost(this) {
 *     @Override
 *     public boolean getUseDeveloperSupport() { return BuildConfig.DEBUG; }
 *
 *     @Override
 *     protected List<ReactPackage> getPackages() {
 *       List<ReactPackage> packages = new PackageList(this).getPackages();
 *       packages.add(new OTAPackage());
 *       return packages;
 *     }
 *
 *     @Override
 *     protected String getJSBundleFile() {
 *       String otaBundle = OTAUtils.getJSBundleFile(getApplication());
 *       return otaBundle != null ? otaBundle : super.getJSBundleFile();
 *     }
 *
 *     @Override
 *     protected String getJSMainModuleName() { return "index"; }
 *   };
 *
 *
 * New Architecture (ReactNativeHost replaced by DefaultReactNativeHost):
 * ────────────────────────────────────────────────────────────────────────
 * Override jsBundleFile in DefaultReactNativeHost:
 *
 *   override val reactNativeHost: ReactNativeHost =
 *     object : DefaultReactNativeHost(this) {
 *       override fun getJSBundleFile(): String? {
 *         return OTAUtils.getJSBundleFile(applicationContext)
 *           ?: super.getJSBundleFile()
 *       }
 *       override fun getPackages(): List<ReactPackage> =
 *         PackageList(this).packages + listOf(OTAPackage())
 *       override fun getJSMainModuleName() = "index"
 *       override val isNewArchEnabled = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
 *       override val isHermesEnabled  = BuildConfig.IS_HERMES_ENABLED
 *     }
 *
 *
 * Hermes:
 * ───────
 * Hermes loads the .hbc (bytecode) or .jsbundle automatically.
 * The OTA bundle path returned by getJSBundleFile() can point to either
 * format — Hermes auto-detects based on the file magic bytes.
 * Ensure you compile with Hermes if your production builds use Hermes:
 *   npx ota-cli release --hermes
 */
public class OTAUtils {

    private static final String TAG = "OTAUtils";

    /**
     * Returns the path to the active OTA bundle, or null if no OTA bundle
     * has been staged (fall through to the embedded bundle).
     */
    public static String getJSBundleFile(Context context) {
        return OTAModule.getJSBundleFile(context);
    }

    /** Log helper to surface OTA status in logcat. */
    public static void logBundleStatus(Context context) {
        String path = getJSBundleFile(context);
        if (path != null) {
            Log.i(TAG, "🚀 OTA bundle active: " + path);
        } else {
            Log.i(TAG, "📦 Using embedded bundle");
        }
    }
}
