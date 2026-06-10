'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application } from '../../../types';

export default function RolloutsPage() {
  const supa = createClient();
  const [apps,     setApps]     = useState<Pick<Application, 'id' | 'name'>[]>([]);
  const [appId,    setAppId]    = useState('');
  const [rollouts, setRollouts] = useState<unknown[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    supa.from('applications').select('id,name').order('name')
      .then(({ data: a }) => { setApps(a ?? []); if (a?.length) setAppId(a[0].id); });
  }, []);

  useEffect(() => {
    if (!appId) return;
    setLoading(true);
    supa.from('ota_rollouts')
      .select('*, deployment:ota_deployments!deployment_id(id,platform,status,channel:ota_channels!channel_id(name),bundle:ota_bundles!bundle_id(version,semver))')
      .filter('deployment.application_id', 'eq', appId)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setRollouts(data ?? []); setLoading(false); });
  }, [appId]);

  async function updateRollout(id: string, percentage: number, status: 'active' | 'paused' | 'completed') {
    await supa.from('ota_rollouts').update({ percentage, status }).eq('id', id);
    setRollouts(r => r.map((x: unknown) => {
      const ro = x as Record<string, unknown>;
      return ro.id === id ? { ...ro, percentage, status } : ro;
    }));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Rollouts</h1>
      <select value={appId} onChange={e => setAppId(e.target.value)} className="mb-4 px-3 py-2 border rounded-md text-sm bg-background">
        {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>

      {loading ? <p className="text-muted-foreground">Loading…</p> :
        rollouts.length === 0 ? <p className="text-muted-foreground text-center py-12">No rollouts found.</p> : (
        <div className="space-y-4">
          {(rollouts as Record<string, unknown>[]).map(r => {
            const dep = r.deployment as Record<string, unknown>;
            const bundle = dep?.bundle as Record<string, unknown>;
            const channel = dep?.channel as Record<string, unknown>;
            return (
              <div key={String(r.id)} className="bg-card border rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium">{String(channel?.name ?? '?')} / {String(dep?.platform ?? '?')}</p>
                    <p className="text-sm text-muted-foreground">Bundle v{String(bundle?.version ?? '?')}{bundle?.semver ? ` (${bundle.semver})` : ''}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === 'active' ? 'bg-green-100 text-green-700'
                    : r.status === 'paused' ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>{String(r.status)}</span>
                </div>

                {/* Percentage slider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Rollout</span><span>{Number(r.percentage)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${r.percentage}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={100} step={5} defaultValue={Number(r.percentage)}
                      className="w-28 accent-primary"
                      onMouseUp={e => updateRollout(String(r.id), parseInt((e.target as HTMLInputElement).value, 10), r.status === 'paused' ? 'paused' : 'active')}
                      onTouchEnd={e => updateRollout(String(r.id), parseInt((e.target as HTMLInputElement).value, 10), r.status === 'paused' ? 'paused' : 'active')} />
                    <button onClick={() => {
                        const pausing = r.status === 'active';
                        if (pausing && !window.confirm('Pause this rollout? Devices outside the current percentage will stop receiving the update.')) return;
                        updateRollout(String(r.id), Number(r.percentage), pausing ? 'paused' : 'active');
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium ${r.status === 'active' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {r.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
