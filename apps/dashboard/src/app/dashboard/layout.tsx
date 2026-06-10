import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '../../lib/supabase-server';
import Sidebar from '../../components/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supa = await createServerSupabaseClient();
  // getSession reads from cookie — no network call, works reliably in RSC
  const { data: { session } } = await supa.auth.getSession();
  if (!session?.user) redirect('/login');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={{ email: session.user.email ?? '' }} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
