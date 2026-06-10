'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application } from '../../../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

type Range = '1d'|'7d'|'30d'|'90d';

interface AnalyticsData {
  active_devices:  { platform: string; active_devices_30d: number; active_devices_7d: number; active_devices_1d: number }[];
  adoption:        { version: number; channel: string; platform: string; device_count: number; adoption_pct: number }[];
  crash_stats:     { bundle_id: string; platform: string; total_crashes: number; crash_rate_per_1k: number }[];
  daily_events:    Record<string, number | string>[];
  rollbacks:       { id: string; platform: string; reason?: string; created_at: string }[];
}

export default function AnalyticsPage() {
  const supa = createClient();
  const [apps,   setApps]   = useState<Pick<Application, 'id' | 'name'>[]>([]);
  const [appId,  setAppId]  = useState('');
  const [range,  setRange]  = useState<Range>('7d');
  const [data,   setData]   = useState<AnalyticsData | null>(null);
  const [loading,setLoading]= useState(false);

  useEffect(() => {
    supa.from('applications').select('id, name').order('name')
      .then(({ data: a }) => { setApps(a ?? []); if (a?.length) setAppId(a[0].id); });
  }, []);

  useEffect(() => { if (appId) fetchAnalytics(); }, [appId, range]);

  async function fetchAnalytics() {
    setLoading(true);
    const { data: { session } } = await supa.auth.getSession();
    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analytics`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ application_id: appId, range }),
      },
    );
    if (resp.ok) setData(await resp.json());
    setLoading(false);
  }

  const totalActive = (data?.active_devices ?? []).reduce((a, r) => a + r.active_devices_30d, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={appId} onChange={e => setAppId(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm bg-background">
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {(['1d','7d','30d','90d'] as Range[]).map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition
              ${range === r ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}>
            {r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground">Select an application</div>
      ) : (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active Devices (30d)', value: totalActive.toLocaleString() },
              { label: 'Total Rollbacks', value: data.rollbacks.length },
              { label: 'Total Crashes', value: (data.crash_stats ?? []).reduce((a,r) => a + r.total_crashes, 0) },
              { label: 'Bundles Tracked', value: [...new Set(data.adoption.map(a => a.version))].length },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold mt-1">{value}</p>
              </div>
            ))}
          </div>

          {/* Daily events chart */}
          {data.daily_events.length > 0 && (
            <div className="bg-card border rounded-xl p-5">
              <h2 className="font-semibold mb-4">Daily Events</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.daily_events}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="download"       stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="install"        stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="crash"          stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="update_success" stroke="#a855f7" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bundle adoption chart */}
          {data.adoption.length > 0 && (
            <div className="bg-card border rounded-xl p-5">
              <h2 className="font-semibold mb-4">Bundle Adoption</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.adoption.slice(0,10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="version" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="device_count" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Crash stats table */}
          {data.crash_stats.length > 0 && (
            <div className="bg-card border rounded-xl p-5">
              <h2 className="font-semibold mb-4">Crash Rates</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground text-xs border-b">
                  <th className="pb-2">Bundle ID</th><th className="pb-2">Platform</th>
                  <th className="pb-2">Crashes</th><th className="pb-2">Rate/1k</th>
                </tr></thead>
                <tbody className="divide-y">
                  {data.crash_stats.map((r, i) => (
                    <tr key={i} className="py-2">
                      <td className="py-2 font-mono text-xs">{r.bundle_id?.slice(0,8)}…</td>
                      <td className="py-2">{r.platform}</td>
                      <td className="py-2 text-destructive font-medium">{r.total_crashes}</td>
                      <td className="py-2">{r.crash_rate_per_1k}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
