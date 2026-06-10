// ──────────────────────────────────────────────────────────────
// Shared domain types for Edge Functions
// ──────────────────────────────────────────────────────────────

export type Platform = 'ios' | 'android';
export type ChannelName = 'production' | 'beta' | 'internal' | 'development' | string;
export type BundleStatus = 'active' | 'disabled' | 'rolled_back';
export type EventType =
  | 'download'
  | 'install'
  | 'active'
  | 'crash'
  | 'rollback'
  | 'update_success'
  | 'update_fail';

// ── check-update ──────────────────────────────────────────────
export interface CheckUpdateRequest {
  platform: Platform;
  channel: ChannelName;
  runtime_version: string;       // native binary version / ABI
  device_id: string;             // stable UUID from the device
  current_bundle_id?: string;    // UUID or null for fresh installs
  app_version?: string;          // human-readable app version
  os_version?: string;
}

export type UpdateStatus = 'UPDATE' | 'ROLLBACK' | 'NONE';

export interface BundleManifest {
  id: string;
  version: number;
  semver?: string;
  platform: Platform;
  file_hash: string;   // sha256 hex
  file_size: number;   // bytes
  download_url: string; // signed URL, 5-min TTL
  should_force_update: boolean;
  message?: string;
}

export interface CheckUpdateResponse {
  status: UpdateStatus;
  bundle?: BundleManifest;
}

// ── create-release ────────────────────────────────────────────
export interface CreateReleaseRequest {
  application_id: string;
  channel: ChannelName;
  platform: Platform;
  runtime_version: string;
  storage_path: string;         // path inside ota bucket (already uploaded)
  file_hash: string;            // sha256 hex supplied by CLI
  file_size: number;
  semver?: string;
  should_force_update?: boolean;
  message?: string;
  rollout_percentage?: number;  // 0-100, default 100
}

export interface CreateReleaseResponse {
  bundle_id: string;
  deployment_id: string;
  version: number;
}

// ── rollback-release ──────────────────────────────────────────
export interface RollbackReleaseRequest {
  application_id: string;
  channel: ChannelName;
  platform: Platform;
  runtime_version?: string;     // optional: rollback specific runtime
  to_bundle_id?: string;        // optional: rollback to specific bundle (else previous)
  reason?: string;
}

// ── report-install ────────────────────────────────────────────
export interface ReportInstallRequest {
  bundle_id: string;
  device_id: string;
  platform: Platform;
  status: 'downloaded' | 'installed' | 'failed';
  app_version?: string;
  error_message?: string;
}

// ── report-crash ──────────────────────────────────────────────
export interface ReportCrashRequest {
  bundle_id?: string;
  device_id: string;
  platform: Platform;
  fatal: boolean;
  error_message: string;
  stack?: string;
  app_version?: string;
  metadata?: Record<string, unknown>;
}

// ── analytics ─────────────────────────────────────────────────
export interface AnalyticsRequest {
  application_id: string;
  range?: '1d' | '7d' | '30d' | '90d';
  bundle_id?: string;
}

// ── list-releases ─────────────────────────────────────────────
export interface ListReleasesRequest {
  application_id: string;
  channel?: ChannelName;
  platform?: Platform;
  limit?: number;
  offset?: number;
}

// ── Standard error envelope ───────────────────────────────────
export interface ApiError {
  error: string;
  details?: unknown;
  code?: string;
}
