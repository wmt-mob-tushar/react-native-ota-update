/**
 * BundleLoader — JS bridge to the native OTA module.
 *
 * The native module owns the boot-critical bundle state (SharedPreferences
 * "OTAPrefs" on Android, NSUserDefaults ota.* keys on iOS) because it must
 * be readable synchronously in getJSBundleFile / sourceURLForBridge before
 * the React context exists. The JS SDK writes through these wrappers and
 * keeps an AsyncStorage mirror for UI state.
 *
 * When the native module is not available (e.g. running in Expo Go
 * without a native build), every method falls back to a no-op.
 */

import { NativeModules } from 'react-native';

export interface NativeBundleState {
  currentId:      string | null;
  currentPath:    string | null;
  pendingId:      string | null;
  pendingPath:    string | null;
  lastGoodId:     string | null;
  lastGoodPath:   string | null;
  bootAttempts:   number;
  /** Set by the native crash-window rollback; consumed (cleared) on read. */
  rollbackReason: string | null;
  rollbackFromId: string | null;
}

export type NativeBundleStatePatch = Partial<
  Pick<
    NativeBundleState,
    'currentId' | 'currentPath' | 'pendingId' | 'pendingPath' | 'lastGoodId' | 'lastGoodPath'
  >
>;

const { OTAModule } = NativeModules as {
  OTAModule?: {
    reload():                Promise<void>;
    getBundlePath():         Promise<string | null>;
    getEmbeddedBundlePath(): Promise<string | null>;
    setPendingBundle(bundleId: string, path: string): Promise<void>;
    markSuccess():           Promise<boolean>;
    getState():              Promise<NativeBundleState>;
    setBundleState(state: NativeBundleStatePatch): Promise<void>;
  };
};

export const OTABundleLoader = {
  /** True when the native module is available. */
  get isAvailable(): boolean {
    return !!OTAModule;
  },

  /** Trigger a bridge reload so a staged bundle takes effect immediately. */
  async reload(): Promise<void> {
    if (OTAModule?.reload) {
      await OTAModule.reload();
    } else {
      console.warn('[OTA] OTAModule not available — reload is a no-op in JS-only mode');
    }
  },

  /** Stage a downloaded bundle in native state (boots on next launch). */
  async setPendingBundle(bundleId: string, path: string): Promise<void> {
    if (OTAModule?.setPendingBundle) {
      await OTAModule.setPendingBundle(bundleId, path);
    }
  },

  /**
   * Signal a successful launch: native resets the crash window and promotes
   * pending → current. Returns true if a pending bundle was promoted.
   */
  async markSuccess(): Promise<boolean> {
    if (OTAModule?.markSuccess) {
      return OTAModule.markSuccess();
    }
    return false;
  },

  /**
   * Snapshot of the native bundle state, or null in JS-only mode.
   * rollbackReason/rollbackFromId are consumed (cleared) by this read.
   */
  async getNativeState(): Promise<NativeBundleState | null> {
    if (OTAModule?.getState) {
      return OTAModule.getState();
    }
    return null;
  },

  /** Overwrite parts of the native state (manual rollback / clear). */
  async setBundleState(state: NativeBundleStatePatch): Promise<void> {
    if (OTAModule?.setBundleState) {
      await OTAModule.setBundleState(state);
    }
  },

  /** Returns the path that would boot right now (or null for embedded). */
  async getBundlePath(): Promise<string | null> {
    if (OTAModule?.getBundlePath) {
      return OTAModule.getBundlePath();
    }
    return null;
  },

  /** Returns the path to the embedded (original) bundle. */
  async getEmbeddedBundlePath(): Promise<string> {
    if (OTAModule?.getEmbeddedBundlePath) {
      const path = await OTAModule.getEmbeddedBundlePath();
      if (path) return path;
    }
    return 'assets://index.android.bundle'; // Android default
  },
};
