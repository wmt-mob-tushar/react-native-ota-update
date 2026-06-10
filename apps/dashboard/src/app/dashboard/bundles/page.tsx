'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application } from '../../../types';

export default function BundlesPage() {
  const supa = createClient();
  const [apps,   setApps]   = useState<Pick<Application, 'id' | 'name'>[]>([]);
  const [appId,  setAppId]  = useState('');
  const [bundles,setBundles]= useState<unknown[]>([]);
  const [loading,setLoading]= useState(false);

  useEffect(() => {
    supa.from('applications').select('id,name').order('name')
      .then(({ data: a }) => { setApps(a ?? []); if (a?.length) setAppId(a[0].id); });
  }, []);

  useEffect(() => {
    if (!appId) return;
    setLoading(true);
    supa.from('ota_bundles')
      .select('id,version,semver,platform,status,enabled,should_force_update,message,file_size,created_at,channel:ota_channels!channel_id(name),runtime:ota_runtimes!runtime_id(runtime_version)')
      .eq('application_id', appId).order('version', { ascending: false }).limit(50)
      .then(({ data }) => { setBundles(data ?? []); setLoading(false); });
  }, [appId]);

  async function toggleEnabled(id: string, current: boolean) {
    const { data, error } = await supa.from('ota_bundles')
      .update({ enabled: !current }).eq('id', id).select('id,enabled');
    if (error || !data?.length) {
      alert(`Could not update bundle: ${error?.message ?? 'no permission (RLS)'}`);
      return;
    }
    setBundles(b => b.map((x: unknown) => {
      const bundle = x as Record<string, unknown>;
      return bundle.id === id ? { ...bundle, enabled: !current } : bundle;
    }));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Bundles</h1>
      <select value={appId} onChange={e => setAppId(e.target.value)} className="mb-4 px-3 py-2 border rounded-md text-sm bg-background">
        {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground text-xs border-b">
              <th className="pb-2 pr-4">Version</th><th className="pb-2 pr-4">Platform</th>
              <th className="pb-2 pr-4">Channel</th><th className="pb-2 pr-4">Runtime</th>
              <th className="pb-2 pr-4">Size</th><th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Force</th><th className="pb-2 pr-4">Enabled</th>
              <th className="pb-2">Created</th>
            </tr></thead>
            <tbody className="divide-y">
              {(bundles as Record<string, unknown>[]).map(b => (
                <tr key={String(b.id)}>
                  <td className="py-2 pr-4 font-mono">{String(b.version)}{b.semver ? ` (${b.semver})` : ''}</td>
                  <td className="py-2 pr-4">{String(b.platform)}</td>
                  <td className="py-2 pr-4">{(b.channel as Record<string,string>)?.name ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{(b.runtime as Record<string,string>)?.runtime_version ?? '—'}</td>
                  <td className="py-2 pr-4 text-xs">{Math.round(Number(b.file_size) / 1024)} KB</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      b.status === 'active' ? 'bg-green-100 text-green-700'
                      : b.status === 'rolled_back' ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>{String(b.status)}</span>
                  </td>
                  <td className="py-2 pr-4">{b.should_force_update ? '⚡' : '—'}</td>
                  <td className="py-2 pr-4">
                    <button onClick={() => toggleEnabled(String(b.id), Boolean(b.enabled))}
                      role="switch" aria-checked={Boolean(b.enabled)}
                      title={b.enabled ? 'Disable this bundle' : 'Enable this bundle'}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${b.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${b.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{String(b.created_at).slice(0,10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
