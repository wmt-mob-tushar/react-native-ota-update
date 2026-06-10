import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '../lib/supabase-server';

export default async function RootPage() {
  const supa = await createServerSupabaseClient();
  const { data: { session } } = await supa.auth.getSession();
  if (session?.user) redirect('/dashboard');
  redirect('/login');
}
