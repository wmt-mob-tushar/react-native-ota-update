'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application, OTADevice } from '../../../types';

export default function DevicesPage() {
  const supa = createClient();
  const [apps,    setApps]    = useState<Pick<Application, 'id' | 'name'>[]>([]);
  const [appId,   setAppId]   = useState('');
  const [devices, setDevices] = useState<OTADevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState<''|'ios'|'android'>('');

  useEffect(() => {
    supa.from('applications').select('id,name').order('name')
      .then(({ data: a }) => { setApps(a ?? []); if (a?.length) setAppId(a[0].id); });
  }, []);

  useEffect(() => {
    if (!appId) return;
    setLoading(true);
    let q = supa.from('ota_devices').select('*').eq('application_id', appId)
      .order('last_seen', { ascending: false }).limit(200);
    if (platform) q = q.eq('platform', platform) as typeof q;
    q.then(({ data }) => { setDevices(data ?? []); setLoading(false); });
  }, [appId, platform]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Devices</h1>
        <div className="flex gap-2">
          <select value={appId} onChange={e => setAppId(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-background">
            {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={platform} onChange={e => setPlatform(e.target.value as ''|'ios'|'android')} className="px-3 py-2 border rounded-md text-sm bg-background">
            <option value="">All Platforms</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
          </select>
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground text-xs border-b">
              <th className="pb-2 pr-4">Device ID</th><th className="pb-2 pr-4">Platform</th>
              <th className="pb-2 pr-4">OS</th><th className="pb-2 pr-4">App Ver</th>
              <th className="pb-2 pr-4">Channel</th><th className="pb-2 pr-4">Bundle</th>
              <th className="pb-2 pr-4">Last Seen</th>
            </tr></thead>
            <tbody className="divide-y">
              {devices.map(d => (
                <tr key={d.id}>
                  <td className="py-2 pr-4 font-mono text-xs">{d.device_id.slice(0,12)}…</td>
                  <td className="py-2 pr-4">{d.platform}</td>
                  <td className="py-2 pr-4 text-xs">{d.os_version ?? '—'}</td>
                  <td className="py-2 pr-4 text-xs">{d.app_version ?? '—'}</td>
                  <td className="py-2 pr-4 text-xs">{d.channel ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{d.current_bundle_id?.slice(0,8) ?? 'embedded'}…</td>
                  <td className="py-2 text-xs text-muted-foreground">{d.last_seen.slice(0,16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">{devices.length} devices shown</p>
        </div>
      )}
    </div>
  );
}
