import Conf from 'conf';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface OTAConfig {
  supabaseUrl:    string;
  anonKey:        string;  // Supabase publishable/anon key
  accessToken:    string;
  refreshToken:   string;
  userId:         string;
  email:          string;
}

export interface ProjectConfig {
  applicationId: string;
  appSlug:       string;
  supabaseUrl:   string;
  anonKey?:      string;  // Supabase publishable/anon key
  appKey:        string;  // public API key shown in dashboard
}

// Global auth config (~/.config/ota-cli/config.json)
export const authStore = new Conf<Partial<OTAConfig>>({
  projectName: 'ota-cli',
  configName:  'auth',
});

// Per-project config (.ota-config.json in cwd)
export function readProjectConfig(): ProjectConfig | null {
  try {
    const file = path.join(process.cwd(), '.ota-config.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as ProjectConfig;
  } catch {
    return null;
  }
}

export function writeProjectConfig(cfg: ProjectConfig): void {
  const file = path.join(process.cwd(), '.ota-config.json');
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

/** Supabase publishable (anon) key: env var → project config → stored login. */
export function getAnonKey(): string {
  const key = process.env.OTA_SUPABASE_ANON_KEY
    ?? readProjectConfig()?.anonKey
    ?? authStore.get('anonKey');
  if (!key) {
    console.error(
      'Missing Supabase publishable (anon) key.\n' +
      'Run `npx ota-cli login` again, or set the OTA_SUPABASE_ANON_KEY environment variable.',
    );
    process.exit(1);
  }
  return key;
}

export function getAuth(): OTAConfig | null {
  const url   = authStore.get('supabaseUrl');
  const token = authStore.get('accessToken');
  if (!url || !token) return null;
  return authStore.store as OTAConfig;
}

export function clearAuth(): void {
  authStore.clear();
}
