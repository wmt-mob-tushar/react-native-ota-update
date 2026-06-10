import { createClient } from '@supabase/supabase-js';
import { authStore, getAuth, getAnonKey } from './config.js';
import chalk from 'chalk';

const SUPABASE_URL = process.env.OTA_SUPABASE_URL
  ?? 'https://iboujbxhilhhehcrsorv.supabase.co';

export function getSupabaseClient() {
  const auth = getAuth();
  if (!auth) {
    console.error(chalk.red('Not logged in. Run: npx ota-cli login'));
    process.exit(1);
  }
  return createClient(auth.supabaseUrl, getAnonKey(), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${auth.accessToken}` } },
  });
}

export async function loginWithPassword(
  email: string,
  password: string,
  anonKey: string,
  supabaseUrl: string = SUPABASE_URL,
): Promise<void> {
  const supa = createClient(supabaseUrl, anonKey);
  const { data, error } = await supa.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new Error(error?.message ?? 'Login failed');
  }

  authStore.set({
    supabaseUrl,
    anonKey,
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId:       data.user?.id ?? '',
    email:        data.user?.email ?? email,
  });
}

export function requireAuth(): string {
  const auth = getAuth();
  if (!auth?.accessToken) {
    console.error(chalk.red('Not logged in. Run: npx ota-cli login'));
    process.exit(1);
  }
  return auth.accessToken;
}
