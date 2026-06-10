'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application, OTACrash } from '../../../types';
import { AlertTriangle } from 'lucide-react';

export default function CrashesPage() {
  const supa = createClient();
  const [apps,   setApps]   = useState<Pick<Application, 'id' | 'name'>[]>([]);
  const [appId,  setAppId]  = useState('');
  const [crashes,setCrashes]= useState<OTACrash[]>([]);
  const [loading,setLoading]= useState(false);
  const [selected, setSelected] = useState<OTACrash | null>(null);

  useEffect(() => {
    supa.from('applications').select('id,name').order('name')
      .then(({ data: a }) => { setApps(a ?? []); if (a?.length) setAppId(a[0].id); });
  }, []);

  useEffect(() => {
    if (!appId) return;
    setLoading(true);
    supa.from('ota_crashes').select('*').eq('application_id', appId)
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setCrashes(data ?? []); setLoading(false); });
  }, [appId]);

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Crash Reports</h1>
          <select value={appId} onChange={e => setAppId(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-background">
            {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {loading ? <p className="text-muted-foreground">Loading…</p> : crashes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">No crash reports 🎉</div>
        ) : (
          <div className="space-y-2">
            {crashes.map(c => (
              <button key={c.id} onClick={() => setSelected(c === selected ? null : c)}
                className={`w-full text-left bg-card border rounded-lg p-4 hover:border-primary/50 transition-colors ${selected?.id === c.id ? 'border-primary' : ''}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${c.fatal ? 'text-red-500' : 'text-yellow-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.error_message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.platform} · {c.device_id.slice(0,8)}… · {c.created_at.slice(0,16)}
                      {c.fatal && <span className="ml-2 text-red-500 font-medium">FATAL</span>}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="w-96 shrink-0 bg-card border rounded-xl p-5 h-fit sticky top-0">
          <h3 className="font-semibold mb-3">Crash Detail</h3>
          <dl className="space-y-2 text-sm">
            {[
              ['Platform', selected.platform],
              ['Device',   selected.device_id],
              ['Version',  selected.app_version ?? '—'],
              ['Fatal',    selected.fatal ? 'Yes' : 'No'],
              ['Time',     selected.created_at.slice(0,19)],
            ].map(([k,v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-muted-foreground w-20 shrink-0">{k}</dt>
                <dd className="font-mono text-xs break-all">{v}</dd>
              </div>
            ))}
          </dl>
          {selected.stack && (
            <div className="mt-4">
              <p className="text-xs font-semibold mb-1">Stack Trace</p>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap max-h-64">{selected.stack}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
