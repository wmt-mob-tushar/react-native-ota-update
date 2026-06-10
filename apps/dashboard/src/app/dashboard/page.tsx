import { createServerSupabaseClient } from '../../lib/supabase-server';
import { Package, Smartphone, Bug, Rocket } from 'lucide-react';

export default async function DashboardPage() {
  const supa = await createServerSupabaseClient();

  const [{ data: apps }, { data: devices }, { data: crashes }, { data: bundles }] =
    await Promise.all([
      supa.from('applications').select('id, name, slug, created_at').order('name'),
      supa.from('ota_active_devices').select('application_id, active_devices_30d, platform'),
      supa.from('ota_crashes').select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString()),
      supa.from('ota_bundles').select('id', { count: 'exact', head: true }),
    ]);

  const totalDevices  = (devices ?? []).reduce((a, r) => a + (r.active_devices_30d ?? 0), 0);
  const totalCrashes  = crashes?.length ?? 0;
  const totalBundles  = bundles?.length ?? 0;

  const stats = [
    { label: 'Applications',     value: apps?.length ?? 0,  icon: Rocket,     color: 'text-blue-500' },
    { label: 'Active Devices',   value: totalDevices,        icon: Smartphone, color: 'text-green-500' },
    { label: 'Total Bundles',    value: totalBundles,        icon: Package,    color: 'text-purple-500' },
    { label: 'Crashes (30d)',    value: totalCrashes,        icon: Bug,        color: 'text-red-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-3xl font-bold">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Recent apps */}
      <div className="bg-card border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">Applications</h2>
        {apps?.length ? (
          <div className="space-y-2">
            {apps.map(app => (
              <a key={app.id} href={`/dashboard/applications/${app.id}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent transition-colors">
                <div>
                  <p className="font-medium text-sm">{app.name}</p>
                  <p className="text-xs text-muted-foreground">{app.slug}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(app.created_at).toLocaleDateString()}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No applications yet. Create one via the{' '}
            <a href="/dashboard/applications" className="text-primary underline">Applications</a> page.
          </p>
        )}
      </div>
    </div>
  );
}
