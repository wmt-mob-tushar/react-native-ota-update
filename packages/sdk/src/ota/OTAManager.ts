/**
 * OTAManager — high-level orchestrator.
 *
 * This is the class most apps will instantiate directly.
 *
 * Usage:
 *   const ota = new OTAManager({ apiUrl, appKey, channel: 'production' });
 *   await ota.initialize();
 *   // In your App root:
 *   useEffect(() => { ota.onLaunchSuccess(); }, []);
 */

import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { OTAClient }         from './OTAClient';
import { BundleDownloader }  from './BundleDownloader';
import { BundleInstaller }   from './BundleInstaller';
import { RollbackManager }   from './RollbackManager';
import { AnalyticsManager }  from './AnalyticsManager';
import { OTABundleLoader }   from './BundleLoader';
import type {
  OTAConfig,
  BundleManifest,
  OTAUpdateCallbacks,
  CheckUpdateResult,
  OTAState,
} from './types';

export class OTAManager {
  private client:     OTAClient;
  private downloader: BundleDownloader;
  private installer:  BundleInstaller;
  private rollback:   RollbackManager;
  private analytics:  AnalyticsManager;

  private config:    Required<OTAConfig>;
  private deviceId:  string = '';
  private platform:  'ios' | 'android' = Platform.OS as 'ios' | 'android';
  private callbacks: OTAUpdateCallbacks = {};

  private bgTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: OTAConfig) {
    this.config = {
      channel:              'production',
      runtimeVersion:       '',
      checkOnStartup:       true,
      checkInBackground:    false,
      backgroundIntervalMs: 300_000,
      maxRetries:           3,
      rollbackOnCrashCount: 3,
      deviceId:             '',
      ...config,
    };

    this.client     = new OTAClient(config);
    this.downloader = new BundleDownloader();
    this.installer  = new BundleInstaller();
    this.analytics  = new AnalyticsManager(this.client);
    this.rollback   = new RollbackManager(
      this.installer,
      this.client,
      this.analytics,
      this.config.rollbackOnCrashCount,
    );
  }

  /** Register callbacks for update events. */
  on(callbacks: OTAUpdateCallbacks): this {
    this.callbacks = { ...this.callbacks, ...callbacks };
    return this;
  }

  /**
   * Call once on app startup.
   * Handles rollback check, pending bundle activation, and optional update check.
   */
  async initialize(): Promise<void> {
    this.deviceId = this.config.deviceId || (await DeviceInfo.getUniqueId());

    // Flush any queued analytics events
    await this.analytics.flush().catch(() => {});

    // Native crash-window protection may have rolled back during boot —
    // pick up the outcome, report it, and sync the JS mirror.
    await this.syncNativeRollback();

    // JS-only fallback (no native module): launch-count based rollback
    const didRollback = await this.rollback.checkAndRollbackIfNeeded({
      deviceId:   this.deviceId,
      platform:   this.platform,
      appVersion: DeviceInfo.getVersion(),
    });

    if (didRollback) {
      this.callbacks.onRollback?.('Auto-rolled back due to repeated crashes');
    }

    // Check for updates on startup
    if (this.config.checkOnStartup) {
      await this.checkAndApplyUpdate();
    }

    // Start background polling
    if (this.config.checkInBackground) {
      this.startBackgroundCheck();
    }
  }

  /**
   * If the native module rolled back during boot (crash-window), report the
   * crash + rollback to the server and mirror the new state into AsyncStorage.
   */
  private async syncNativeRollback(): Promise<void> {
    if (!OTABundleLoader.isAvailable) return;

    const native = await OTABundleLoader.getNativeState().catch(() => null);
    if (!native) return;

    // Keep the JS mirror in line with what native actually booted
    await this.installer.saveState({
      currentBundleId:    native.currentId,
      currentBundlePath:  native.currentPath,
      pendingBundleId:    native.pendingId,
      pendingBundlePath:  native.pendingPath,
      lastGoodBundleId:   native.lastGoodId,
      lastGoodBundlePath: native.lastGoodPath,
    });

    if (!native.rollbackReason) return;

    await this.client.reportCrash({
      deviceId:     this.deviceId,
      platform:     this.platform,
      fatal:        true,
      errorMessage: native.rollbackReason,
      bundleId:     native.rollbackFromId ?? undefined,
      appVersion:   DeviceInfo.getVersion(),
      metadata:     { auto_rollback: true, crash_window: true },
    });
    await this.analytics.track({
      deviceId:  this.deviceId,
      platform:  this.platform,
      eventType: 'rollback',
      bundleId:  native.rollbackFromId ?? undefined,
    });
    this.callbacks.onRollback?.(native.rollbackReason);
  }

  /** Signal that the current bundle launched successfully (no crash). */
  async onLaunchSuccess(): Promise<void> {
    const bundleId = await this.installer.getActiveBundleId();
    if (bundleId) {
      await this.rollback.onLaunchSuccess(bundleId);
      // Track active event
      await this.analytics.track({
        deviceId:  this.deviceId,
        platform:  this.platform,
        eventType: 'active',
        bundleId,
      });
    }
  }

  /** Explicit update check — returns the result without applying. */
  async checkUpdate(): Promise<CheckUpdateResult> {
    const state = await this.installer.getState();
    return this.client.checkUpdate({
      platform:        this.platform,
      runtimeVersion:  this.config.runtimeVersion || DeviceInfo.getVersion(),
      deviceId:        this.deviceId,
      currentBundleId: state.currentBundleId,
      appVersion:      DeviceInfo.getVersion(),
      osVersion:       DeviceInfo.getSystemVersion(),
    });
  }

  /** Check for an update and apply it if available. Returns the result. */
  async checkAndApplyUpdate(): Promise<CheckUpdateResult> {
    try {
      const result = await this.checkUpdate();
      await this.installer.saveState({ lastCheckAt: new Date().toISOString() });

      if (result.status === 'UPDATE' && result.bundle) {
        this.callbacks.onUpdateAvailable?.(result.bundle);
        await this.applyUpdate(result.bundle);
      } else if (result.status === 'ROLLBACK' && result.bundle) {
        this.callbacks.onRollback?.('Server-directed rollback');
        await this.applyUpdate(result.bundle, true);
      } else {
        this.callbacks.onNoUpdate?.();
      }

      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.callbacks.onError?.(err);
      return { status: 'NONE' };
    }
  }

  /** Download and stage a bundle. Pass force=true to activate immediately. */
  async applyUpdate(bundle: BundleManifest, force = false): Promise<void> {
    const appVersion = DeviceInfo.getVersion();

    try {
      const { bundlePath } = await this.downloader.download(
        bundle,
        (received, total) => this.callbacks.onDownloadProgress?.(received, total),
        this.config.maxRetries,
      );

      // Report download
      await this.client.reportInstall({
        bundleId:   bundle.id,
        deviceId:   this.deviceId,
        platform:   this.platform,
        status:     'downloaded',
        appVersion,
      });

      // Stage as pending — active on next restart
      await this.installer.stagePending(bundle.id, bundlePath);

      // Report install (staged)
      await this.client.reportInstall({
        bundleId:   bundle.id,
        deviceId:   this.deviceId,
        platform:   this.platform,
        status:     'installed',
        appVersion,
      });

      // Clean up old bundles (keep current + pending + last good)
      const state = await this.installer.getState();
      await this.downloader.cleanup([
        bundle.id,
        state.currentBundleId,
        state.lastGoodBundleId,
      ].filter(Boolean) as string[]);

      this.callbacks.onUpdateInstalled?.(bundle);

      if (bundle.should_force_update || force) {
        // For force updates, trigger a reload via the native module
        await OTABundleLoader.reload();
      }

    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      await this.client.reportInstall({
        bundleId:     bundle.id,
        deviceId:     this.deviceId,
        platform:     this.platform,
        status:       'failed',
        appVersion,
        errorMessage: err.message,
      });
      this.callbacks.onError?.(err);
    }
  }

  /** Manual rollback to the last good bundle. */
  async rollbackToLastGood(): Promise<boolean> {
    return this.rollback.manualRollback({
      deviceId:   this.deviceId,
      platform:   this.platform,
      appVersion: DeviceInfo.getVersion(),
      reason:     'Manual rollback',
    });
  }

  /** Get the path to the bundle that should be loaded. null = use embedded. */
  async getBundlePath(): Promise<string | null> {
    return this.installer.getActiveBundlePath();
  }

  /** Snapshot of the persisted OTA state (current/pending/lastGood bundles). */
  async getState(): Promise<OTAState> {
    return this.installer.getState();
  }

  /** Reload the app so a staged bundle takes effect (requires the native module). */
  async reloadApp(): Promise<void> {
    await OTABundleLoader.reload();
  }

  private startBackgroundCheck(): void {
    if (this.bgTimer) return;
    this.bgTimer = setInterval(() => {
      this.checkAndApplyUpdate().catch(() => {});
    }, this.config.backgroundIntervalMs);
  }

  stopBackgroundCheck(): void {
    if (this.bgTimer) {
      clearInterval(this.bgTimer);
      this.bgTimer = null;
    }
  }
}
