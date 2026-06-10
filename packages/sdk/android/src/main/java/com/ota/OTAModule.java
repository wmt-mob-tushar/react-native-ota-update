package com.ota;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;

import java.io.File;

/**
 * OTAModule — Native Android bridge.
 *
 * Bundle state lives in a native-owned SharedPreferences file ("OTAPrefs"),
 * NOT in AsyncStorage: AsyncStorage stores data in SQLite on Android, which
 * cannot be read synchronously in getJSBundleFile() before the React context
 * exists. The JS SDK writes through to this module (setPendingBundle /
 * markSuccess / setBundleState) and keeps its own AsyncStorage mirror for UI.
 *
 * Crash-window boot protection (native-owned):
 *  - getJSBundleFile() increments ota.bootAttempts before booting an OTA
 *    bundle. A successful launch calls markSuccess(), which resets it.
 *  - If bootAttempts reaches MAX_BOOT_ATTEMPTS the previous launches crashed
 *    before JS could run: fall back one tier (pending → current → lastGood →
 *    embedded) and record ota.rollbackReason for the JS SDK to report.
 *
 * Integration:
 *  1. Register OTAPackage in MainApplication.getPackages().
 *  2. In MainApplication.getJSBundleFile(), call OTAUtils.getJSBundleFile(this).
 */
public class OTAModule extends ReactContextBaseJavaModule {

    private static final String TAG         = "OTAModule";
    private static final String MODULE_NAME = "OTAModule";
    private static final String PREFS_NAME  = "OTAPrefs";

    private static final String KEY_CURRENT_PATH     = "ota.currentPath";
    private static final String KEY_CURRENT_ID       = "ota.currentId";
    private static final String KEY_PENDING_PATH     = "ota.pendingPath";
    private static final String KEY_PENDING_ID       = "ota.pendingId";
    private static final String KEY_LAST_GOOD_PATH   = "ota.lastGoodPath";
    private static final String KEY_LAST_GOOD_ID     = "ota.lastGoodId";
    private static final String KEY_BOOT_ATTEMPTS    = "ota.bootAttempts";
    private static final String KEY_ROLLBACK_REASON  = "ota.rollbackReason";
    private static final String KEY_ROLLBACK_FROM_ID = "ota.rollbackFromId";

    /** Boots without a markSuccess() before the bundle is considered bad. */
    private static final int MAX_BOOT_ATTEMPTS = 2;

    public OTAModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ─────────────────────────────────────────────────────────
    // Boot path — called from MainApplication.getJSBundleFile()
    // ─────────────────────────────────────────────────────────

    /**
     * Returns the path of the OTA bundle to boot, or null for the embedded
     * bundle. Must stay synchronous and cheap: it runs before React starts.
     */
    public static String getJSBundleFile(Context context) {
        try {
            SharedPreferences prefs =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            if (prefs.getInt(KEY_BOOT_ATTEMPTS, 0) >= MAX_BOOT_ATTEMPTS) {
                fallbackOneTier(prefs);
            }

            String path = selectBootPath(prefs);
            if (path == null) {
                // Embedded bundle is always safe — no crash window needed.
                prefs.edit().putInt(KEY_BOOT_ATTEMPTS, 0).commit();
                Log.i(TAG, "No OTA bundle staged — using embedded bundle");
                return null;
            }

            // Tentative boot: if the app crashes before markSuccess(), this
            // counter survives and the next boot falls back a tier.
            prefs.edit()
                .putInt(KEY_BOOT_ATTEMPTS, prefs.getInt(KEY_BOOT_ATTEMPTS, 0) + 1)
                .commit();
            Log.i(TAG, "Loading OTA bundle: " + path);
            return path;

        } catch (Exception e) {
            Log.e(TAG, "getJSBundleFile error — using embedded bundle", e);
            return null;
        }
    }

    /** pending → current → null, dropping tiers whose files are missing. */
    private static String selectBootPath(SharedPreferences prefs) {
        String pending = prefs.getString(KEY_PENDING_PATH, null);
        if (pending != null) {
            if (new File(pending).exists()) return pending;
            prefs.edit().remove(KEY_PENDING_PATH).remove(KEY_PENDING_ID).commit();
        }
        String current = prefs.getString(KEY_CURRENT_PATH, null);
        if (current != null) {
            if (new File(current).exists()) return current;
            prefs.edit().remove(KEY_CURRENT_PATH).remove(KEY_CURRENT_ID).commit();
        }
        return null;
    }

    /**
     * The active tier crashed repeatedly before JS could mark success.
     * Discard it, record why, and reset the boot counter.
     */
    private static void fallbackOneTier(SharedPreferences prefs) {
        SharedPreferences.Editor ed = prefs.edit();

        String pendingPath = prefs.getString(KEY_PENDING_PATH, null);
        if (pendingPath != null) {
            String pendingId = prefs.getString(KEY_PENDING_ID, null);
            ed.remove(KEY_PENDING_PATH).remove(KEY_PENDING_ID);
            ed.putString(KEY_ROLLBACK_REASON,
                "Pending bundle crashed during launch (crash-window rollback)");
            if (pendingId != null) ed.putString(KEY_ROLLBACK_FROM_ID, pendingId);
            Log.w(TAG, "Crash-window: discarding pending bundle " + pendingId);
        } else {
            String currentId    = prefs.getString(KEY_CURRENT_ID, null);
            String lastGoodPath = prefs.getString(KEY_LAST_GOOD_PATH, null);
            String lastGoodId   = prefs.getString(KEY_LAST_GOOD_ID, null);

            if (lastGoodPath != null && new File(lastGoodPath).exists()) {
                ed.putString(KEY_CURRENT_PATH, lastGoodPath);
                if (lastGoodId != null) ed.putString(KEY_CURRENT_ID, lastGoodId);
                else                    ed.remove(KEY_CURRENT_ID);
                ed.remove(KEY_LAST_GOOD_PATH).remove(KEY_LAST_GOOD_ID);
            } else {
                ed.remove(KEY_CURRENT_PATH).remove(KEY_CURRENT_ID);
            }
            ed.putString(KEY_ROLLBACK_REASON,
                "Current bundle crashed during launch (crash-window rollback)");
            if (currentId != null) ed.putString(KEY_ROLLBACK_FROM_ID, currentId);
            Log.w(TAG, "Crash-window: rolling back current bundle " + currentId);
        }

        ed.putInt(KEY_BOOT_ATTEMPTS, 0);
        ed.commit();
    }

    // ─────────────────────────────────────────────────────────
    // JS-exposed methods
    // ─────────────────────────────────────────────────────────

    /** Stage a downloaded bundle; it boots (tentatively) on next launch. */
    @ReactMethod
    public void setPendingBundle(String bundleId, String path, Promise promise) {
        try {
            prefs().edit()
                .putString(KEY_PENDING_ID, bundleId)
                .putString(KEY_PENDING_PATH, path)
                .commit();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SET_PENDING_FAILED", e.getMessage());
        }
    }

    /**
     * The app launched successfully: reset the crash window and promote
     * pending → current (previous current becomes lastGood).
     * Resolves true if a pending bundle was promoted.
     */
    @ReactMethod
    public void markSuccess(Promise promise) {
        try {
            SharedPreferences prefs = prefs();
            SharedPreferences.Editor ed = prefs.edit();
            boolean promoted = false;

            String pendingPath = prefs.getString(KEY_PENDING_PATH, null);
            if (pendingPath != null) {
                String pendingId = prefs.getString(KEY_PENDING_ID, null);
                String curPath   = prefs.getString(KEY_CURRENT_PATH, null);
                String curId     = prefs.getString(KEY_CURRENT_ID, null);

                if (curPath != null) ed.putString(KEY_LAST_GOOD_PATH, curPath);
                else                 ed.remove(KEY_LAST_GOOD_PATH);
                if (curId != null)   ed.putString(KEY_LAST_GOOD_ID, curId);
                else                 ed.remove(KEY_LAST_GOOD_ID);

                ed.putString(KEY_CURRENT_PATH, pendingPath);
                if (pendingId != null) ed.putString(KEY_CURRENT_ID, pendingId);
                else                   ed.remove(KEY_CURRENT_ID);
                ed.remove(KEY_PENDING_PATH).remove(KEY_PENDING_ID);
                promoted = true;
            }

            ed.putInt(KEY_BOOT_ATTEMPTS, 0);
            ed.commit();
            promise.resolve(promoted);
        } catch (Exception e) {
            promise.reject("MARK_SUCCESS_FAILED", e.getMessage());
        }
    }

    /**
     * Snapshot of the native bundle state. rollbackReason / rollbackFromId
     * are consumed (cleared) by this call so a rollback is reported once.
     */
    @ReactMethod
    public void getState(Promise promise) {
        try {
            SharedPreferences prefs = prefs();
            WritableMap map = Arguments.createMap();
            map.putString("currentId",      prefs.getString(KEY_CURRENT_ID, null));
            map.putString("currentPath",    prefs.getString(KEY_CURRENT_PATH, null));
            map.putString("pendingId",      prefs.getString(KEY_PENDING_ID, null));
            map.putString("pendingPath",    prefs.getString(KEY_PENDING_PATH, null));
            map.putString("lastGoodId",     prefs.getString(KEY_LAST_GOOD_ID, null));
            map.putString("lastGoodPath",   prefs.getString(KEY_LAST_GOOD_PATH, null));
            map.putInt("bootAttempts",      prefs.getInt(KEY_BOOT_ATTEMPTS, 0));
            map.putString("rollbackReason", prefs.getString(KEY_ROLLBACK_REASON, null));
            map.putString("rollbackFromId", prefs.getString(KEY_ROLLBACK_FROM_ID, null));

            prefs.edit()
                .remove(KEY_ROLLBACK_REASON)
                .remove(KEY_ROLLBACK_FROM_ID)
                .commit();
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("GET_STATE_FAILED", e.getMessage());
        }
    }

    /**
     * Overwrite parts of the bundle state (manual rollback, clear-to-embedded).
     * Recognised keys: currentId, currentPath, pendingId, pendingPath,
     * lastGoodId, lastGoodPath. A null value removes the key.
     */
    @ReactMethod
    public void setBundleState(ReadableMap state, Promise promise) {
        try {
            SharedPreferences.Editor ed = prefs().edit();
            applyKey(ed, state, "currentId",    KEY_CURRENT_ID);
            applyKey(ed, state, "currentPath",  KEY_CURRENT_PATH);
            applyKey(ed, state, "pendingId",    KEY_PENDING_ID);
            applyKey(ed, state, "pendingPath",  KEY_PENDING_PATH);
            applyKey(ed, state, "lastGoodId",   KEY_LAST_GOOD_ID);
            applyKey(ed, state, "lastGoodPath", KEY_LAST_GOOD_PATH);
            ed.putInt(KEY_BOOT_ATTEMPTS, 0);
            ed.commit();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SET_STATE_FAILED", e.getMessage());
        }
    }

    /** Path that would boot right now (pending → current), or null. */
    @ReactMethod
    public void getBundlePath(Promise promise) {
        try {
            promise.resolve(selectBootPath(prefs()));
        } catch (Exception e) {
            Log.e(TAG, "getBundlePath failed", e);
            promise.resolve(null);
        }
    }

    /** Returns the path of the embedded (compiled-in) bundle. */
    @ReactMethod
    public void getEmbeddedBundlePath(Promise promise) {
        promise.resolve("assets://index.android.bundle");
    }

    /**
     * Restart the app so a staged bundle takes effect now.
     *
     * A full process restart (relaunch intent + Runtime.exit) is used rather
     * than recreateReactContextInBackground(): only a cold start re-invokes
     * getJSBundleFile(), so the new bundle path is guaranteed to be picked up.
     * This is the same approach used by production OTA libraries.
     */
    @ReactMethod
    public void reload(Promise promise) {
        try {
            final Context app = getReactApplicationContext().getApplicationContext();
            promise.resolve(null);
            UiThreadUtil.runOnUiThread(() -> {
                try {
                    Intent intent = app.getPackageManager()
                        .getLaunchIntentForPackage(app.getPackageName());
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                      | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                        app.startActivity(intent);
                    }
                    // Hard-exit shortly after so the new process cold-starts
                    // and getJSBundleFile() reads the staged bundle.
                    new Handler(Looper.getMainLooper()).postDelayed(
                        () -> Runtime.getRuntime().exit(0), 300);
                } catch (Exception e) {
                    Log.e(TAG, "reload failed", e);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "reload failed", e);
            promise.reject("RELOAD_FAILED", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────

    private SharedPreferences prefs() {
        return getReactApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static void applyKey(
        SharedPreferences.Editor ed, ReadableMap state, String jsKey, String prefKey) {
        if (!state.hasKey(jsKey)) return;
        if (state.isNull(jsKey)) ed.remove(prefKey);
        else                     ed.putString(prefKey, state.getString(jsKey));
    }
}
