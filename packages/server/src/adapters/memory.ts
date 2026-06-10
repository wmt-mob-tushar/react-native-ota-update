/**
 * Reference in-memory database adapter — zero dependencies, great for local
 * development, tests, and as a template for a real adapter (Postgres, Mongo,
 * Prisma, Supabase, …). Data is lost on restart.
 */

import {
  OTADatabaseAdapter,
  OTAApp,
  OTABundleRecord,
  BundleQuery,
  BundleStatus,
  ReportInstallRequest,
  ReportCrashRequest,
  Platform,
} from '../types';

export class InMemoryDatabaseAdapter implements OTADatabaseAdapter {
  private apps: OTAApp[] = [];
  private bundles: OTABundleRecord[] = [];
  /** key: applicationId|channel|platform|runtimeVersion → bundleId */
  private active = new Map<string, string>();
  public installs: Array<ReportInstallRequest & { applicationId: string }> = [];
  public crashes: Array<ReportCrashRequest & { applicationId: string }> = [];

  constructor(seedApps: OTAApp[] = []) {
    this.apps = [...seedApps];
  }

  /** Register an app (handy in tests / quick start). */
  addApp(app: OTAApp): void {
    this.apps.push(app);
  }

  private activeKey(q: BundleQuery): string {
    return [q.applicationId, q.channel, q.platform, q.runtimeVersion].join('|');
  }

  async getAppByKey(appKey: string): Promise<OTAApp | null> {
    return this.apps.find((a) => a.appKey === appKey) ?? null;
  }

  async getActiveBundle(q: BundleQuery): Promise<OTABundleRecord | null> {
    const id = this.active.get(this.activeKey(q));
    if (!id) return null;
    return this.bundles.find((b) => b.id === id) ?? null;
  }

  async getBundleById(id: string): Promise<OTABundleRecord | null> {
    return this.bundles.find((b) => b.id === id) ?? null;
  }

  async getLatestGoodBundle(q: BundleQuery): Promise<OTABundleRecord | null> {
    return (
      this.bundles
        .filter(
          (b) =>
            b.applicationId === q.applicationId &&
            b.channel === q.channel &&
            b.platform === q.platform &&
            b.runtimeVersion === q.runtimeVersion &&
            b.enabled &&
            b.status === 'active',
        )
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async getNextVersion(q: {
    applicationId: string;
    channel: string;
    platform: Platform;
  }): Promise<number> {
    const max = this.bundles
      .filter(
        (b) =>
          b.applicationId === q.applicationId &&
          b.channel === q.channel &&
          b.platform === q.platform,
      )
      .reduce((m, b) => Math.max(m, b.version), 0);
    return max + 1;
  }

  async insertBundle(bundle: OTABundleRecord): Promise<void> {
    this.bundles.push({ ...bundle });
  }

  async setActiveBundle(q: BundleQuery & { bundleId: string }): Promise<void> {
    // Supersede any prior active bundle for this lane.
    const prevId = this.active.get(this.activeKey(q));
    if (prevId && prevId !== q.bundleId) {
      const prev = this.bundles.find((b) => b.id === prevId);
      if (prev && prev.status === 'active') prev.status = 'active'; // keep enabled history
    }
    this.active.set(this.activeKey(q), q.bundleId);
  }

  async setBundleEnabled(
    bundleId: string,
    enabled: boolean,
    status?: BundleStatus,
  ): Promise<void> {
    const b = this.bundles.find((x) => x.id === bundleId);
    if (!b) return;
    b.enabled = enabled;
    if (status) b.status = status;
  }

  async recordInstall(r: ReportInstallRequest & { applicationId: string }): Promise<void> {
    this.installs.push(r);
  }

  async recordCrash(r: ReportCrashRequest & { applicationId: string }): Promise<void> {
    this.crashes.push(r);
  }

  async listBundles(q: {
    applicationId: string;
    channel?: string;
    platform?: Platform;
    limit: number;
    offset: number;
  }): Promise<OTABundleRecord[]> {
    return this.bundles
      .filter(
        (b) =>
          b.applicationId === q.applicationId &&
          (!q.channel || b.channel === q.channel) &&
          (!q.platform || b.platform === q.platform),
      )
      .sort((a, b) => b.version - a.version)
      .slice(q.offset, q.offset + q.limit);
  }
}
