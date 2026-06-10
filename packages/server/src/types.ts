/**
 * Core domain types and adapter interfaces for @ota-platform/server.
 *
 * The server logic is backend-agnostic: you implement an `OTADatabaseAdapter`
 * and an `OTAStorageAdapter` for your stack (Postgres + S3, MongoDB + GCS,
 * SQLite + local disk, Supabase, …) and the handlers do the rest.
 */

export type Platform = 'ios' | 'android';
export type UpdateStatus = 'UPDATE' | 'ROLLBACK' | 'NONE';
export type BundleStatus = 'active' | 'disabled' | 'rolled_back';
export type InstallStatus = 'downloaded' | 'installed' | 'failed';

/** An application (the unit a device authenticates against). */
export interface OTAApp {
  id: string;
  /** Public per-app key sent by devices in the `x-app-key` header. */
  appKey: string;
  slug: string;
}

/** A stored JS bundle release. */
export interface OTABundleRecord {
  id: string;
  applicationId: string;
  channel: string;
  platform: Platform;
  runtimeVersion: string;
  version: number;
  semver?: string;
  /** Path inside your storage backend, e.g. `slug/production/android/<id>/bundle.zip`. */
  storagePath: string;
  /** SHA-256 hex of the bundle archive. */
  fileHash: string;
  fileSize: number;
  shouldForceUpdate: boolean;
  message?: string;
  enabled: boolean;
  status: BundleStatus;
  /** 0–100. Devices outside the percentage are told `NONE`. */
  rolloutPercentage: number;
  createdAt: string;
}

/** What `check-update` returns to the SDK for an available update. */
export interface BundleManifest {
  id: string;
  version: number;
  semver?: string;
  platform: Platform;
  file_hash: string;
  file_size: number;
  download_url: string;
  should_force_update: boolean;
  message?: string;
}

// ── Request / response shapes (match the SDK wire format) ──────────────

export interface CheckUpdateRequest {
  platform: Platform;
  channel: string;
  runtime_version: string;
  device_id: string;
  current_bundle_id?: string | null;
  app_version?: string;
  os_version?: string;
}

export interface CheckUpdateResponse {
  status: UpdateStatus;
  bundle?: BundleManifest;
}

export interface ReportInstallRequest {
  bundle_id: string;
  device_id: string;
  platform: Platform;
  status: InstallStatus;
  app_version?: string;
  error_message?: string;
}

export interface ReportCrashRequest {
  device_id: string;
  platform: Platform;
  fatal: boolean;
  error_message: string;
  stack?: string;
  bundle_id?: string;
  app_version?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateReleaseInput {
  applicationId: string;
  channel: string;
  platform: Platform;
  runtimeVersion: string;
  storagePath: string;
  fileHash: string;
  fileSize: number;
  semver?: string;
  shouldForceUpdate?: boolean;
  message?: string;
  rolloutPercentage?: number;
}

export interface RollbackInput {
  applicationId: string;
  channel: string;
  platform: Platform;
  runtimeVersion: string;
  /** Optional explicit target; defaults to the latest good bundle. */
  toBundleId?: string;
  reason?: string;
}

// ── Adapter interfaces ─────────────────────────────────────────────────

export interface BundleQuery {
  applicationId: string;
  channel: string;
  platform: Platform;
  runtimeVersion: string;
}

export interface OTADatabaseAdapter {
  /** Resolve an app by its public device key. */
  getAppByKey(appKey: string): Promise<OTAApp | null>;

  /** The active, enabled bundle for a channel/platform/runtime (or null). */
  getActiveBundle(q: BundleQuery): Promise<OTABundleRecord | null>;

  getBundleById(id: string): Promise<OTABundleRecord | null>;

  /** Newest enabled+active bundle to fall back to during a rollback. */
  getLatestGoodBundle(q: BundleQuery): Promise<OTABundleRecord | null>;

  /** Next monotonic version number for a channel/platform. */
  getNextVersion(q: { applicationId: string; channel: string; platform: Platform }): Promise<number>;

  insertBundle(bundle: OTABundleRecord): Promise<void>;

  /** Make a bundle the single active release for its channel/platform/runtime. */
  setActiveBundle(q: BundleQuery & { bundleId: string }): Promise<void>;

  setBundleEnabled(bundleId: string, enabled: boolean, status?: BundleStatus): Promise<void>;

  recordInstall(r: ReportInstallRequest & { applicationId: string }): Promise<void>;
  recordCrash(r: ReportCrashRequest & { applicationId: string }): Promise<void>;

  listBundles(q: {
    applicationId: string;
    channel?: string;
    platform?: Platform;
    limit: number;
    offset: number;
  }): Promise<OTABundleRecord[]>;

  /** Optional: track last-seen device state. */
  upsertDevice?(d: {
    deviceId: string;
    applicationId: string;
    platform: Platform;
    currentBundleId?: string | null;
    channel?: string;
    runtimeVersion?: string;
  }): Promise<void>;

  /** Optional: audit log for rollbacks. */
  recordRollback?(r: {
    applicationId: string;
    channel: string;
    platform: Platform;
    fromBundleId?: string | null;
    toBundleId?: string | null;
    reason?: string;
  }): Promise<void>;
}

export interface OTAStorageAdapter {
  /** Persist the uploaded bundle archive at `path`. */
  upload(path: string, data: Buffer, contentType?: string): Promise<void>;
  /** Return a (preferably time-limited) URL a device can download from. */
  getDownloadUrl(path: string, expiresInSeconds?: number): Promise<string>;
  /** Optional: read a stored bundle back (used for server-side hash checks). */
  download?(path: string): Promise<Buffer>;
}

export interface OTAServerOptions {
  db: OTADatabaseAdapter;
  storage: OTAStorageAdapter;
  /** Signed-URL lifetime for downloads. Default: 300 (5 minutes). */
  signedUrlTtlSeconds?: number;
}

/** Thrown by handlers; carries an HTTP-style status code. */
export class OTAError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'OTAError';
  }
}
