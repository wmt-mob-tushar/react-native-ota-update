// Auto-generated type stubs.
// Run `supabase gen types typescript --project-id iboujbxhilhhehcrsorv` to regenerate.

// Supabase typed-client helpers: tables need Relationships, views need Row + Relationships.
// Insert is Partial because many columns have DB defaults (ids, api_key, is_default, timestamps).
type Tbl<R, I = Partial<Omit<R, 'id'|'created_at'|'updated_at'>>, U = Partial<R>> = {
  Row: R; Insert: I; Update: U; Relationships: [];
};
type Vw<R> = { Row: R; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      applications:        Tbl<Application>;
      application_members: Tbl<AppMember>;
      ota_channels:        Tbl<OTAChannel>;
      ota_runtimes:        Tbl<OTARuntime>;
      ota_bundles:         Tbl<OTABundle>;
      ota_deployments:     Tbl<OTADeployment>;
      ota_rollouts:        Tbl<OTARollout>;
      ota_installations:   Tbl<OTAInstallation, Partial<Omit<OTAInstallation, 'id'|'created_at'>>, never>;
      ota_crashes:         Tbl<OTACrash,        Partial<Omit<OTACrash, 'id'|'created_at'>>,        never>;
      ota_rollbacks:       Tbl<OTARollbackLog,  Partial<Omit<OTARollbackLog, 'id'|'created_at'>>,  never>;
      ota_analytics:       Tbl<OTAAnalytic,     Partial<Omit<OTAAnalytic, 'id'|'created_at'>>,     never>;
      ota_devices:         Tbl<OTADevice>;
    };
    Views: {
      ota_bundle_adoption:     Vw<BundleAdoption>;
      ota_update_success_stats: Vw<UpdateSuccessStat>;
      ota_crash_stats:         Vw<CrashStat>;
      ota_active_devices:      Vw<ActiveDeviceStat>;
      ota_daily_events:        Vw<DailyEvent>;
      ota_app_summary:         Vw<AppSummary>;
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Application = {
  id: string; name: string; slug: string; description?: string;
  api_key: string; owner_id: string; created_at: string; updated_at: string;
}
export type AppMember = {
  id: string; application_id: string; user_id: string;
  role: 'owner'|'admin'|'developer'|'viewer'; invited_by?: string;
  created_at: string; updated_at: string;
}
export type OTAChannel = {
  id: string; application_id: string; name: string; is_default: boolean;
  created_at: string; updated_at: string;
}
export type OTARuntime = {
  id: string; application_id: string; platform: 'ios'|'android';
  runtime_version: string; label?: string; created_at: string; updated_at: string;
}
export type OTABundle = {
  id: string; application_id: string; channel_id: string; runtime_id: string;
  platform: 'ios'|'android'; version: number; semver?: string;
  storage_path: string; file_hash: string; file_size: number;
  should_force_update: boolean; message?: string;
  status: 'active'|'disabled'|'rolled_back'; enabled: boolean;
  created_by?: string; created_at: string; updated_at: string;
}
export type OTADeployment = {
  id: string; application_id: string; channel_id: string; runtime_id: string;
  platform: 'ios'|'android'; bundle_id: string;
  status: 'active'|'superseded'; created_by?: string; created_at: string; updated_at: string;
}
export type OTARollout = {
  id: string; deployment_id: string; bundle_id: string;
  percentage: number; strategy: 'percentage'|'all';
  status: 'active'|'paused'|'completed';
  started_at: string; created_at: string; updated_at: string;
}
export type OTAInstallation = {
  id: string; application_id: string; bundle_id: string; device_id: string;
  platform: 'ios'|'android'; status: 'downloaded'|'installed'|'failed';
  app_version?: string; error_message?: string; created_at: string;
}
export type OTACrash = {
  id: string; application_id: string; bundle_id?: string; device_id: string;
  platform: 'ios'|'android'; fatal: boolean; error_message: string;
  stack?: string; app_version?: string; metadata?: Record<string, unknown>; created_at: string;
}
export type OTARollbackLog = {
  id: string; application_id: string; channel_id: string; platform: 'ios'|'android';
  from_bundle_id?: string; to_bundle_id?: string; reason?: string;
  created_by?: string; created_at: string;
}
export type OTAAnalytic = {
  id: string; application_id: string; channel_id?: string; bundle_id?: string;
  device_id: string; platform: 'ios'|'android';
  event_type: 'download'|'install'|'active'|'crash'|'rollback'|'update_success'|'update_fail';
  metadata?: Record<string, unknown>; created_at: string;
}
export type OTADevice = {
  id: string; device_id: string; application_id: string;
  platform: 'ios'|'android'; os_version?: string; app_version?: string;
  current_bundle_id?: string; channel?: string; runtime_version?: string;
  first_seen: string; last_seen: string; created_at: string; updated_at: string;
}

// Views
export type BundleAdoption = {
  application_id: string; bundle_id: string; version: number; semver?: string;
  platform: string; channel: string; device_count: number;
  total_devices: number; adoption_pct: number;
}
export type UpdateSuccessStat = {
  application_id: string; bundle_id: string; platform: string;
  downloads: number; installs: number; failures: number; success_rate_pct: number;
}
export type CrashStat = {
  application_id: string; bundle_id?: string; platform: string;
  total_crashes: number; fatal_crashes: number; affected_devices: number; crash_rate_per_1k: number;
}
export type ActiveDeviceStat = {
  application_id: string; platform: string;
  active_devices_30d: number; active_devices_7d: number; active_devices_1d: number;
}
export type DailyEvent = {
  application_id: string; bundle_id?: string; platform: string;
  event_type: string; day: string; event_count: number;
}
export type AppSummary = {
  application_id: string; name: string; slug: string;
  active_devices: number; total_bundles: number; crashes_30d: number; last_release_at?: string;
}
