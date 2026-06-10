/**
 * Backend-agnostic OTA handlers. Each function takes your adapters plus a
 * request and returns a plain object — wire them into Express, Fastify,
 * Next.js route handlers, Lambda, or anything else.
 */

import {
  OTAServerOptions,
  OTAError,
  CheckUpdateRequest,
  CheckUpdateResponse,
  BundleManifest,
  OTABundleRecord,
  ReportInstallRequest,
  ReportCrashRequest,
  CreateReleaseInput,
  RollbackInput,
  Platform,
} from './types';
import { rolloutBucket, randomUUID } from './util';

const DEFAULT_TTL = 300;

async function toManifest(
  o: OTAServerOptions,
  b: OTABundleRecord,
): Promise<BundleManifest> {
  const ttl = o.signedUrlTtlSeconds ?? DEFAULT_TTL;
  return {
    id: b.id,
    version: b.version,
    semver: b.semver,
    platform: b.platform,
    file_hash: b.fileHash,
    file_size: b.fileSize,
    download_url: await o.storage.getDownloadUrl(b.storagePath, ttl),
    should_force_update: b.shouldForceUpdate,
    message: b.message,
  };
}

/** Authenticate a device app key → app id. Throws 401 if unknown. */
async function authApp(o: OTAServerOptions, appKey: string | undefined) {
  if (!appKey) throw new OTAError(401, 'Missing app key');
  const app = await o.db.getAppByKey(appKey);
  if (!app) throw new OTAError(401, 'Invalid app key');
  return app;
}

/**
 * The update decision engine. Returns UPDATE / ROLLBACK / NONE.
 */
export async function checkUpdate(
  o: OTAServerOptions,
  appKey: string | undefined,
  req: CheckUpdateRequest,
): Promise<CheckUpdateResponse> {
  const app = await authApp(o, appKey);

  const query = {
    applicationId: app.id,
    channel: req.channel,
    platform: req.platform,
    runtimeVersion: req.runtime_version,
  };

  const active = await o.db.getActiveBundle(query);

  // No servable bundle → maybe the device is on a now-disabled one → rollback.
  if (!active || !active.enabled || active.status !== 'active') {
    if (req.current_bundle_id) {
      const current = await o.db.getBundleById(req.current_bundle_id);
      if (current && (!current.enabled || current.status !== 'active')) {
        const good = await o.db.getLatestGoodBundle(query);
        if (good && good.id !== current.id) {
          return { status: 'ROLLBACK', bundle: await toManifest(o, good) };
        }
      }
    }
    return { status: 'NONE' };
  }

  // Already up to date.
  if (req.current_bundle_id && req.current_bundle_id === active.id) {
    return { status: 'NONE' };
  }

  // Staged rollout gate.
  if (active.rolloutPercentage < 100) {
    if (rolloutBucket(req.device_id) >= active.rolloutPercentage) {
      return { status: 'NONE' };
    }
  }

  await o.db.upsertDevice?.({
    deviceId: req.device_id,
    applicationId: app.id,
    platform: req.platform,
    currentBundleId: req.current_bundle_id ?? null,
    channel: req.channel,
    runtimeVersion: req.runtime_version,
  });

  return { status: 'UPDATE', bundle: await toManifest(o, active) };
}

/** Record install telemetry. */
export async function reportInstall(
  o: OTAServerOptions,
  appKey: string | undefined,
  req: ReportInstallRequest,
): Promise<{ success: true }> {
  const app = await authApp(o, appKey);
  await o.db.recordInstall({ ...req, applicationId: app.id });
  if (req.status === 'installed') {
    await o.db.upsertDevice?.({
      deviceId: req.device_id,
      applicationId: app.id,
      platform: req.platform,
      currentBundleId: req.bundle_id,
    });
  }
  return { success: true };
}

/** Record a crash report (telemetry only — recovery is client-side). */
export async function reportCrash(
  o: OTAServerOptions,
  appKey: string | undefined,
  req: ReportCrashRequest,
): Promise<{ success: true }> {
  const app = await authApp(o, appKey);
  await o.db.recordCrash({ ...req, applicationId: app.id });
  return { success: true };
}

/**
 * Create a release. The bundle archive must already be uploaded to storage
 * at `storagePath` (use `storage.upload(...)` first, or the CLI flow).
 */
export async function createRelease(
  o: OTAServerOptions,
  input: CreateReleaseInput,
): Promise<{ bundleId: string; version: number }> {
  const version = await o.db.getNextVersion({
    applicationId: input.applicationId,
    channel: input.channel,
    platform: input.platform,
  });
  const id = randomUUID();

  const bundle: OTABundleRecord = {
    id,
    applicationId: input.applicationId,
    channel: input.channel,
    platform: input.platform,
    runtimeVersion: input.runtimeVersion,
    version,
    semver: input.semver,
    storagePath: input.storagePath,
    fileHash: input.fileHash,
    fileSize: input.fileSize,
    shouldForceUpdate: input.shouldForceUpdate ?? false,
    message: input.message,
    enabled: true,
    status: 'active',
    rolloutPercentage: input.rolloutPercentage ?? 100,
    createdAt: new Date().toISOString(),
  };

  await o.db.insertBundle(bundle);
  await o.db.setActiveBundle({
    applicationId: input.applicationId,
    channel: input.channel,
    platform: input.platform,
    runtimeVersion: input.runtimeVersion,
    bundleId: id,
  });

  return { bundleId: id, version };
}

/** Roll back the active release to the previous (or an explicit) bundle. */
export async function rollbackRelease(
  o: OTAServerOptions,
  input: RollbackInput,
): Promise<{ toBundleId: string | null }> {
  const query = {
    applicationId: input.applicationId,
    channel: input.channel,
    platform: input.platform,
    runtimeVersion: input.runtimeVersion,
  };

  const active = await o.db.getActiveBundle(query);
  if (active) {
    await o.db.setBundleEnabled(active.id, false, 'rolled_back');
  }

  const target = input.toBundleId
    ? await o.db.getBundleById(input.toBundleId)
    : await o.db.getLatestGoodBundle(query);

  if (target) {
    await o.db.setBundleEnabled(target.id, true, 'active');
    await o.db.setActiveBundle({ ...query, bundleId: target.id });
  }

  await o.db.recordRollback?.({
    applicationId: input.applicationId,
    channel: input.channel,
    platform: input.platform,
    fromBundleId: active?.id ?? null,
    toBundleId: target?.id ?? null,
    reason: input.reason,
  });

  return { toBundleId: target?.id ?? null };
}

/** List bundles for an application. */
export async function listReleases(
  o: OTAServerOptions,
  q: {
    applicationId: string;
    channel?: string;
    platform?: Platform;
    limit?: number;
    offset?: number;
  },
): Promise<{ bundles: OTABundleRecord[] }> {
  const bundles = await o.db.listBundles({
    applicationId: q.applicationId,
    channel: q.channel,
    platform: q.platform,
    limit: Math.min(q.limit ?? 20, 100),
    offset: q.offset ?? 0,
  });
  return { bundles };
}
