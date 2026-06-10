/**
 * BundleInstaller — bundle state bookkeeping.
 *
 * The boot-critical state (which bundle to load) lives in the NATIVE module
 * (SharedPreferences / NSUserDefaults) because getJSBundleFile /
 * sourceURLForBridge must read it synchronously before React starts.
 * This class writes through to native and keeps an AsyncStorage mirror
 * (@ota_state) for UI state and JS-only fallback mode.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { OTABundleLoader } from './BundleLoader';
import type { OTAState } from './types';

const STATE_KEY = '@ota_state';

export class BundleInstaller {
  async getState(): Promise<OTAState> {
    try {
      const raw = await AsyncStorage.getItem(STATE_KEY);
      if (!raw) return defaultState();
      return { ...defaultState(), ...JSON.parse(raw) };
    } catch {
      return defaultState();
    }
  }

  async saveState(state: Partial<OTAState>): Promise<void> {
    const current = await this.getState();
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ ...current, ...state }));
  }

  /**
   * Stage a downloaded bundle as "pending install".
   * It will be activated on next restart.
   */
  async stagePending(bundleId: string, bundlePath: string): Promise<void> {
    await OTABundleLoader.setPendingBundle(bundleId, bundlePath);
    await this.saveState({ pendingBundleId: bundleId, pendingBundlePath: bundlePath });
  }

  /**
   * Promote the pending bundle to "current" (called on startup after
   * the new bundle has been loaded successfully).
   */
  async activatePending(): Promise<void> {
    // Native is the source of truth: resets the crash window and promotes
    // pending → current (previous current becomes lastGood).
    await OTABundleLoader.markSuccess();

    const state = await this.getState();
    if (!state.pendingBundleId || !state.pendingBundlePath) return;

    await this.saveState({
      lastGoodBundleId:   state.currentBundleId,
      lastGoodBundlePath: state.currentBundlePath ?? null,
      currentBundleId:    state.pendingBundleId,
      currentBundlePath:  state.pendingBundlePath,
      pendingBundleId:    null,
      pendingBundlePath:  null,
      crashCount:         0,
    });
  }

  /** Get the path of the active bundle (pending if staged, else current). */
  async getActiveBundlePath(): Promise<string | null> {
    const state = await this.getState();
    return state.pendingBundlePath ?? state.currentBundlePath ?? null;
  }

  /** Get the active bundle ID. */
  async getActiveBundleId(): Promise<string | null> {
    const state = await this.getState();
    return state.pendingBundleId ?? state.currentBundleId ?? null;
  }

  async incrementCrashCount(): Promise<number> {
    const state = await this.getState();
    const next  = (state.crashCount ?? 0) + 1;
    await this.saveState({ crashCount: next });
    return next;
  }

  async resetCrashCount(): Promise<void> {
    await this.saveState({ crashCount: 0 });
  }
}

function defaultState(): OTAState & { currentBundlePath?: string | null } {
  return {
    currentBundleId:    null,
    currentBundlePath:  null,
    pendingBundleId:    null,
    pendingBundlePath:  null,
    lastGoodBundleId:   null,
    lastGoodBundlePath: null,
    crashCount:         0,
    lastCheckAt:        null,
  };
}

// Extend OTAState locally for the path field
declare module './types' {
  interface OTAState {
    currentBundlePath?: string | null;
  }
}
