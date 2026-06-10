'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabase';
import type { Application, OTAChannel, OTABundle, OTADeployment } from '../../../../types';
import {
  Copy, ArrowLeft, Package, GitBranch, Rocket,
  Smartphone, RefreshCw, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: { id: string };  // Next 14: params is a plain object in client pages
}

export default function ApplicationDetailPage({ params }: Props) {
  const { id } = params;
  const supa = createClient();

  const [app,         setApp]         = useState<Application | null>(null);
  const [channels,    setChannels]    = useState<OTAChannel[]>([]);
  const [bundles,     setBundles]     = useState<OTABundle[]>([]);
  const [deployments, setDeployments] = useState<OTADeployment[]>([]);
  const [activeTab,   setActiveTab]   = useState<'overview'|'bundles'|'deployments'|'settings'>('overview');
  const [loading,     setLoading]     = useState(true);
  const [copied,      setCopied]      = useState<string | null>(null);

  // Release form state
  const [releasing,   setReleasing]   = useState(false);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: appData }, { data: chData }, { data: bData }, { data: dData }] =
        await Promise.all([
          supa.from('applications').select('*').eq('id', id).single(),
          supa.from('ota_channels').select('*').eq('application_id', id).order('name'),
          supa.from('ota_bundles').select('*,channel:ota_channels!channel_id(name),runtime:ota_runtimes!runtime_id(runtime_version)')
              .eq('application_id', id).order('version', { ascending: false }).limit(20),
          supa.from('ota_deployments').select('*,channel:ota_channels!channel_id(name),bundle:ota_bundles!bundle_id(version,semver,platform),runtime:ota_runtimes!runtime_id(runtime_version),rollout:ota_rollouts(percentage,status)')
              .eq('application_id', id).order('created_at', { ascending: false }).limit(10),
        ]);
      setApp(appData);
      setChannels(chData ?? []);
      setBundles(bData as OTABundle[] ?? []);
      setDeployments(dData as OTADeployment[] ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  async function toggleBundle(bundleId: string, enabled: boolean) {
    const { data, error } = await supa.from('ota_bundles')
      .update({ enabled }).eq('id', bundleId).select('id,enabled');
    if (error || !data?.length) {
      alert(`Could not update bundle: ${error?.message ?? 'no permission (RLS)'}`);
      return;
    }
    setBundles(prev => prev.map(b => b.id === bundleId ? { ...b, enabled } : b));
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="animate-spin text-muted-foreground w-6 h-6" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Application not found.</p>
        <Link href="/dashboard/applications" className="text-primary text-sm mt-2 inline-block">← Back to applications</Link>
      </div>
    );
  }

  const activeDeployments = (deployments as unknown as Record<string,unknown>[]).filter(d => d.status === 'active');

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link href="/dashboard/applications" className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{app.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{app.slug}</p>
          {app.description && <p className="text-sm text-muted-foreground mt-1">{app.description}</p>}
        </div>
      </div>

      {/* API Key card */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-primary mb-1">App API Key (for React Native SDK)</p>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono flex-1 break-all">{app.api_key}</code>
          <button onClick={() => copy(app.api_key, 'key')}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            {copied === 'key' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Use this key as <code className="bg-muted px-1 rounded">appKey</code> in your <code className="bg-muted px-1 rounded">OTAManager</code> config.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {(['overview','bundles','deployments','settings'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px
              ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Channels',           value: channels.length,          icon: GitBranch },
              { label: 'Total Bundles',       value: bundles.length,           icon: Package },
              { label: 'Active Deployments',  value: activeDeployments.length, icon: Rocket },
              { label: 'ID',                  value: app.id.slice(0,8) + '…',  icon: Smartphone },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-card border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          {/* Channels */}
          <div className="bg-card border rounded-xl p-5">
            <h2 className="font-semibold mb-3">Channels</h2>
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No channels yet. Run <code className="bg-muted px-1 rounded text-xs">npx ota-cli channel:create --name production</code>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {channels.map(ch => (
                  <span key={ch.id} className={`px-3 py-1 rounded-full text-sm font-medium
                    ${ch.name === 'production' ? 'bg-green-100 text-green-700'
                    : ch.name === 'beta'       ? 'bg-blue-100 text-blue-700'
                    : ch.name === 'internal'   ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600'}`}>
                    {ch.name}{ch.is_default ? ' ★' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Active deployments */}
          <div className="bg-card border rounded-xl p-5">
            <h2 className="font-semibold mb-3">Active Deployments</h2>
            {activeDeployments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active deployments. Run <code className="bg-muted px-1 rounded text-xs">npx ota-cli release</code> to create one.
              </p>
            ) : (
              <div className="space-y-2">
                {activeDeployments.map((dep) => {
                  const d = dep as Record<string, unknown>;
                  const ch  = d.channel  as Record<string,string>;
                  const bnd = d.bundle   as Record<string,unknown>;
                  const rt  = d.runtime  as Record<string,string>;
                  const ro  = Array.isArray(d.rollout) ? d.rollout[0] as Record<string,unknown> : d.rollout as Record<string,unknown>;
                  return (
                    <div key={String(d.id)} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-sm font-medium">{ch?.name} / {String(d.platform)}</span>
                        <span className="text-xs text-muted-foreground ml-2">runtime {rt?.runtime_version}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs">v{String(bnd?.version)}{bnd?.semver ? ` (${bnd.semver})` : ''}</span>
                        {ro && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            ro.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                          }`}>{String(ro.percentage)}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SDK quickstart */}
          <div className="bg-card border rounded-xl p-5">
            <h2 className="font-semibold mb-3">SDK Quickstart</h2>
            <pre className="bg-muted text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">{
`import { OTAManager } from '@ota-platform/sdk';

const ota = new OTAManager({
  apiUrl:  '${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1',
  appKey:  '${app.api_key}',
  channel: 'production',
});

// In your App root:
useEffect(() => {
  ota.initialize().then(() => ota.onLaunchSuccess());
  return () => ota.stopBackgroundCheck();
}, []);`}</pre>
            <button onClick={() => copy(`import { OTAManager } from '@ota-platform/sdk';\n\nconst ota = new OTAManager({\n  apiUrl:  '${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1',\n  appKey:  '${app.api_key}',\n  channel: 'production',\n});`, 'sdk')}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              {copied === 'sdk' ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied === 'sdk' ? 'Copied!' : 'Copy snippet'}
            </button>
          </div>
        </div>
      )}

      {/* ── BUNDLES TAB ── */}
      {activeTab === 'bundles' && (
        <div>
          {bundles.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              No bundles yet. Run <code className="bg-muted px-1 py-0.5 rounded text-xs">npx ota-cli release</code> to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="pb-2 pr-4">Version</th>
                  <th className="pb-2 pr-4">Platform</th>
                  <th className="pb-2 pr-4">Channel</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Force</th>
                  <th className="pb-2 pr-4">Enabled</th>
                  <th className="pb-2">Created</th>
                </tr></thead>
                <tbody className="divide-y">
                  {(bundles as unknown as Record<string,unknown>[]).map(b => (
                    <tr key={String(b.id)}>
                      <td className="py-2 pr-4">
                        <span className="font-mono font-medium">v{String(b.version)}</span>
                        {b.semver ? <span className="text-muted-foreground text-xs ml-1">({String(b.semver)})</span> : null}
                      </td>
                      <td className="py-2 pr-4">{String(b.platform)}</td>
                      <td className="py-2 pr-4 text-xs">{(b.channel as Record<string,string>)?.name ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{Math.round(Number(b.file_size)/1024)} KB</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          b.status === 'active'      ? 'bg-green-100 text-green-700'
                        : b.status === 'rolled_back' ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'}`}>{String(b.status)}</span>
                      </td>
                      <td className="py-2 pr-4">{b.should_force_update ? <AlertTriangle className="w-4 h-4 text-orange-500" /> : '—'}</td>
                      <td className="py-2 pr-4">
                        <button onClick={() => toggleBundle(String(b.id), !b.enabled)}
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
      )}

      {/* ── DEPLOYMENTS TAB ── */}
      {activeTab === 'deployments' && (
        <div className="space-y-3">
          {(deployments as unknown as Record<string,unknown>[]).map(dep => {
            const ch  = dep.channel  as Record<string,string>;
            const bnd = dep.bundle   as Record<string,unknown>;
            const rt  = dep.runtime  as Record<string,string>;
            const ro  = Array.isArray(dep.rollout) ? dep.rollout[0] as Record<string,unknown> : dep.rollout as Record<string,unknown>;
            return (
              <div key={String(dep.id)} className={`bg-card border rounded-xl p-5 ${dep.status === 'active' ? 'border-primary/30' : 'opacity-50'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dep.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="font-semibold text-sm">{ch?.name} / {String(dep.platform)}</span>
                      <span className="text-xs text-muted-foreground">runtime {rt?.runtime_version}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Bundle v{String(bnd?.version)}{bnd?.semver ? ` (${bnd.semver})` : ''}
                      {bnd?.should_force_update ? <span className="ml-1 text-orange-500">⚡ force</span> : null}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{String(dep.created_at).slice(0,16)}</span>
                </div>
                {ro && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Rollout</span>
                      <span className={ro.status === 'paused' ? 'text-yellow-600' : 'text-green-600'}>
                        {String(ro.percentage)}% · {String(ro.status)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${ro.percentage}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {deployments.length === 0 && (
            <p className="text-center text-muted-foreground py-12">No deployments yet.</p>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-card border rounded-xl p-5">
            <h2 className="font-semibold mb-3">Application Info</h2>
            <dl className="space-y-2 text-sm">
              {[
                ['ID',      app.id],
                ['Name',    app.name],
                ['Slug',    app.slug],
                ['API Key', app.api_key],
                ['Created', app.created_at.slice(0,10)],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="text-muted-foreground w-20 shrink-0">{k}</dt>
                  <dd className="font-mono text-xs break-all flex items-center gap-1">
                    {v}
                    {(k === 'ID' || k === 'API Key') && (
                      <button onClick={() => copy(v, k)} className="text-muted-foreground hover:text-foreground">
                        {copied === k ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-card border border-destructive/30 rounded-xl p-5">
            <h2 className="font-semibold text-destructive mb-1">Danger Zone</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Deleting an application removes all associated bundles, deployments, and telemetry.
              This cannot be undone.
            </p>
            <button className="px-4 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-sm hover:bg-destructive hover:text-destructive-foreground transition-colors"
              onClick={() => alert('Delete via Supabase dashboard or CLI for safety.')}>
              Delete Application
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
