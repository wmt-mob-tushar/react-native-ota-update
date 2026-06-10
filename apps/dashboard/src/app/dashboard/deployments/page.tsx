'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application } from '../../../types';

export default function DeploymentsPage() {
  const supa = createClient();
  const [apps,        setApps]        = useState<Pick<Application, 'id' | 'name'>[]>([]);
  const [appId,       setAppId]       = useState('');
  const [deployments, setDeployments] = useState<unknown[]>([]);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    supa.from('applications').select('id,name').order('name')
      .then(({ data: a }) => { setApps(a ?? []); if (a?.length) setAppId(a[0].id); });
  }, []);

  useEffect(() => {
    if (!appId) return;
    setLoading(true);
    supa.from('ota_deployments')
      .select('id,platform,status,created_at,channel:ota_channels!channel_id(name),runtime:ota_runtimes!runtime_id(runtime_version),bundle:ota_bundles!bundle_id(version,semver,file_hash,should_force_update),rollout:ota_rollouts(percentage,status)')
      .eq('application_id', appId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setDeployments(data ?? []); setLoading(false); });
  }, [appId]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Deployments</h1>
      <select value={appId} onChange={e => setAppId(e.target.value)} className="mb-4 px-3 py-2 border rounded-md text-sm bg-background">
        {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="space-y-3">
          {(deployments as Record<string, unknown>[]).map(dep => {
            const channel = dep.channel as Record<string,string>;
            const runtime = dep.runtime as Record<string,string>;
            const bundle  = dep.bundle  as Record<string,unknown>;
            const rollout = Array.isArray(dep.rollout) ? dep.rollout[0] as Record<string,unknown> : dep.rollout as Record<string,unknown>;
            return (
              <div key={String(dep.id)} className={`bg-card border rounded-xl p-5 ${dep.status === 'active' ? 'border-primary/30' : 'opacity-60'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dep.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {String(dep.status)}
                      </span>
                      <span className="text-sm font-semibold">{channel?.name} / {String(dep.platform)}</span>
                      {bundle?.should_force_update ? <span className="text-xs text-orange-600 font-medium">⚡ Force</span> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Runtime: {runtime?.runtime_version} · Bundle v{String(bundle?.version)}{bundle?.semver ? ` (${bundle.semver})` : ''}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">{String(bundle?.file_hash ?? '').slice(0,16)}…</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{String(dep.created_at).slice(0,16)}</p>
                    {rollout && (
                      <p className="text-xs font-medium mt-1">
                        Rollout: {String(rollout.percentage)}%
                        <span className={`ml-1 ${rollout.status === 'paused' ? 'text-yellow-600' : 'text-green-600'}`}>
                          ({String(rollout.status)})
                        </span>
                      </p>
                    )}
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
