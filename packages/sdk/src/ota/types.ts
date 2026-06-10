export type Platform = 'ios' | 'android';

export interface OTAConfig {
  /** Supabase Edge Function base URL — e.g. https://xxx.supabase.co/functions/v1 */
  apiUrl: string;
  /** Per-application API key (public, from dashboard). */
  appKey: string;
  /** Channel to target: production | beta | internal | development */
  channel?: string;
  /**
   * Native runtime/binary version. Must exactly match the value passed to
   * `ota-cli release --runtime`. Defaults to the app's marketing version
   * (DeviceInfo.getVersion()), which only works if releases use that too.
   */
  runtimeVersion?: string;
  /** Whether to check on app startup. Default: true */
  checkOnStartup?: boolean;
  /** Whether to check in the background periodically. Default: false */
  checkInBackground?: boolean;
  /** Background check interval in milliseconds. Default: 300_000 (5 min) */
  backgroundIntervalMs?: number;
  /** Retry attempts for failed downloads. Default: 3 */
  maxRetries?: number;
  /** How many consecutive crash counts before auto-rollback. Default: 3 */
  rollbackOnCrashCount?: number;
  /** Custom device ID (auto-generated if omitted). */
  deviceId?: string;
}

export interface BundleManifest {
  id:                 string;
  version:            number;
  semver?:            string;
  platform:           Platform;
  file_hash:          string;
  file_size:          number;
  download_url:       string;
  should_force_update: boolean;
  message?:           string;
}

export type UpdateStatus = 'UPDATE' | 'ROLLBACK' | 'NONE';

export interface CheckUpdateResult {
  status: UpdateStatus;
  bundle?: BundleManifest;
}

/** Persisted state stored via AsyncStorage. */
export interface OTAState {
  currentBundleId:     string | null;
  pendingBundleId:     string | null;
  pendingBundlePath:   string | null;
  lastGoodBundleId:    string | null;
  lastGoodBundlePath:  string | null;
  crashCount:          number;
  lastCheckAt:         string | null;
}

export const INITIAL_STATE: OTAState = {
  currentBundleId:    null,
  pendingBundleId:    null,
  pendingBundlePath:  null,
  lastGoodBundleId:   null,
  lastGoodBundlePath: null,
  crashCount:         0,
  lastCheckAt:        null,
};

export interface OTAUpdateCallbacks {
  onUpdateAvailable?:  (bundle: BundleManifest) => void;
  onDownloadProgress?: (received: number, total: number) => void;
  onUpdateInstalled?:  (bundle: BundleManifest) => void;
  onNoUpdate?:         () => void;
  onError?:            (error: Error) => void;
  onRollback?:         (reason: string) => void;
}
