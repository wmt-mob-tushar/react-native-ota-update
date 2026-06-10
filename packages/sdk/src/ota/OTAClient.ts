/**
 * OTAClient — raw HTTP client wrapping the Supabase Edge Functions.
 * Stateless: no AsyncStorage, no file I/O.
 */

import type { CheckUpdateResult, OTAConfig, BundleManifest } from './types';

export class OTAClient {
  private config: Required<Pick<OTAConfig, 'apiUrl' | 'appKey' | 'channel'>>;

  constructor(config: OTAConfig) {
    this.config = {
      apiUrl:  config.apiUrl.replace(/\/$/, ''),
      appKey:  config.appKey,
      channel: config.channel ?? 'production',
    };
  }

  /** Check whether an update is available for this device. */
  async checkUpdate(opts: {
    platform:        'ios' | 'android';
    runtimeVersion:  string;
    deviceId:        string;
    currentBundleId?: string | null;
    appVersion?:     string;
    osVersion?:      string;
  }): Promise<CheckUpdateResult> {
    const resp = await this.post('/check-update', {
      platform:          opts.platform,
      channel:           this.config.channel,
      runtime_version:   opts.runtimeVersion,
      device_id:         opts.deviceId,
      current_bundle_id: opts.currentBundleId ?? undefined,
      app_version:       opts.appVersion,
      os_version:        opts.osVersion,
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(`check-update failed ${resp.status}: ${(body as Record<string,string>).error ?? 'unknown'}`);
    }

    return resp.json() as Promise<CheckUpdateResult>;
  }

  /** Report a download/install/failure event. */
  async reportInstall(opts: {
    bundleId:     string;
    deviceId:     string;
    platform:     'ios' | 'android';
    status:       'downloaded' | 'installed' | 'failed';
    appVersion?:  string;
    errorMessage?: string;
  }): Promise<void> {
    await this.post('/report-install', {
      bundle_id:     opts.bundleId,
      device_id:     opts.deviceId,
      platform:      opts.platform,
      status:        opts.status,
      app_version:   opts.appVersion,
      error_message: opts.errorMessage,
    }).catch(() => { /* telemetry — never crash the app */ });
  }

  /** Report a JS crash. */
  async reportCrash(opts: {
    deviceId:     string;
    platform:     'ios' | 'android';
    fatal:        boolean;
    errorMessage: string;
    stack?:       string;
    bundleId?:    string;
    appVersion?:  string;
    metadata?:    Record<string, unknown>;
  }): Promise<void> {
    await this.post('/report-crash', {
      bundle_id:     opts.bundleId,
      device_id:     opts.deviceId,
      platform:      opts.platform,
      fatal:         opts.fatal,
      error_message: opts.errorMessage,
      stack:         opts.stack,
      app_version:   opts.appVersion,
      metadata:      opts.metadata,
    }).catch(() => { /* telemetry — never crash the app */ });
  }

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.config.apiUrl}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-key':    this.config.appKey,
      },
      body: JSON.stringify(body),
    });
  }
}
