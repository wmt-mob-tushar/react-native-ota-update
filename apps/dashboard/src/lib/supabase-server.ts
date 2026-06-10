import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '../types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Server component / route-handler Supabase client (reads cookies). */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll:  () => cookieStore.getAll(),
      setAll: (pairs) => {
        try {
          pairs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch { /* read-only context during RSC render */ }
      },
    },
  });
}
