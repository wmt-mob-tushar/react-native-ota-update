/**
 * RollbackManager — crash-count-based automatic rollback.
 *
 * On each app startup:
 *   1. Increment crash count (we assume a crash happened if the app
 *      previously launched this bundle and didn't call onLaunchSuccess).
 *   2. If crash count ≥ threshold → rollback to lastGoodBundle.
 *   3. After successful launch → reset crash count.
 *
 * The UI can also trigger a manual rollback via OTAManager.rollback().
 */

import RNFS from 'react-native-fs';
import { OTABundleLoader } from './BundleLoader';
import type { BundleInstaller } from './BundleInstaller';
import type { OTAClient } from './OTAClient';
import type { AnalyticsManager } from './AnalyticsManager';

export class RollbackManager {
  private readonly crashThreshold: number;

  constructor(
    private readonly installer: BundleInstaller,
    private readonly client: OTAClient,
    private readonly analytics: AnalyticsManager,
    crashThreshold = 3,
  ) {
    this.crashThreshold = crashThreshold;
  }

  /**
   * Called at the very start of every app launch, BEFORE the JS bundle runs.
   * Returns true if a rollback was performed (app should reload with old bundle).
   */
  async checkAndRollbackIfNeeded(opts: {
    deviceId: string;
    platform: 'ios' | 'android';
    appVersion?: string;
  }): Promise<boolean> {
    // With the native module present, boot-loop protection is native-owned
    // (crash-window in getJSBundleFile / bundleURL) — counting launches here
    // would double up. This JS counter is only the Expo Go / JS-only fallback.
    if (OTABundleLoader.isAvailable) return false;

    const state = await this.installer.getState();

    // No OTA bundle active — nothing to roll back
    if (!state.currentBundleId) return false;

    const count = await this.installer.incrementCrashCount();

    if (count >= this.crashThreshold) {
      await this.performRollback({
        reason: `Auto-rollback after ${count} crashes`,
        deviceId: opts.deviceId,
        platform: opts.platform,
        appVersion: opts.appVersion,
        currentBundleId: state.currentBundleId,
        targetBundlePath: state.lastGoodBundlePath ?? null,
        targetBundleId:   state.lastGoodBundleId ?? null,
      });
      return true;
    }

    return false;
  }

  /** Called once the app has successfully rendered (no crash this launch). */
  async onLaunchSuccess(bundleId: string): Promise<void> {
    await this.installer.resetCrashCount();
    // Promote pending → current; activatePending() also saves the previous
    // current bundle as lastGood. Overwriting lastGood with the just-activated
    // bundle here would make every rollback a no-op self-rollback.
    await this.installer.activatePending();
  }

  /** Manual rollback triggered by the user / operator. */
  async manualRollback(opts: {
    deviceId:   string;
    platform:   'ios' | 'android';
    appVersion?: string;
    reason?:    string;
  }): Promise<boolean> {
    const state = await this.installer.getState();
    if (!state.lastGoodBundleId) return false;

    await this.performRollback({
      reason:          opts.reason ?? 'Manual rollback',
      deviceId:        opts.deviceId,
      platform:        opts.platform,
      appVersion:      opts.appVersion,
      currentBundleId: state.currentBundleId,
      targetBundlePath: state.lastGoodBundlePath ?? null,
      targetBundleId:   state.lastGoodBundleId,
    });
    return true;
  }

  private async performRollback(opts: {
    reason:           string;
    deviceId:         string;
    platform:         'ios' | 'android';
    appVersion?:      string;
    currentBundleId:  string | null;
    targetBundlePath: string | null;
    targetBundleId:   string | null;
  }): Promise<void> {
    // If we have a local good bundle, switch to it
    if (opts.targetBundleId && opts.targetBundlePath) {
      const exists = await RNFS.exists(opts.targetBundlePath);
      if (exists) {
        await OTABundleLoader.setBundleState({
          currentId:   opts.targetBundleId,
          currentPath: opts.targetBundlePath,
          pendingId:   null,
          pendingPath: null,
        });
        await this.installer.saveState({
          currentBundleId:   opts.targetBundleId,
          currentBundlePath: opts.targetBundlePath,
          pendingBundleId:   null,
          pendingBundlePath: null,
          crashCount:        0,
        });
      } else {
        // File gone — fall back to embedded bundle (clear state)
        await this.clearToEmbedded();
      }
    } else {
      // No last-good bundle: fall back to the embedded bundle
      await this.clearToEmbedded();
    }

    // Report crash to server
    await this.client.reportCrash({
      deviceId:     opts.deviceId,
      platform:     opts.platform,
      fatal:        true,
      errorMessage: opts.reason,
      bundleId:     opts.currentBundleId ?? undefined,
      appVersion:   opts.appVersion,
      metadata:     { auto_rollback: true },
    });

    await this.analytics.track({
      deviceId:   opts.deviceId,
      platform:   opts.platform,
      eventType:  'rollback',
      bundleId:   opts.targetBundleId ?? undefined,
    });
  }

  private async clearToEmbedded(): Promise<void> {
    await OTABundleLoader.setBundleState({
      currentId:   null,
      currentPath: null,
      pendingId:   null,
      pendingPath: null,
    });
    await this.installer.saveState({
      currentBundleId:   null,
      currentBundlePath: null,
      pendingBundleId:   null,
      pendingBundlePath: null,
      crashCount:        0,
    });
  }
}
