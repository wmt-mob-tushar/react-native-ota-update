'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application, OTAChannel } from '../../../types';
import { Plus } from 'lucide-react';

export default function ChannelsPage() {
  const supa = createClient();
  const [apps,     setApps]     = useState<Pick<Application, 'id' | 'name'>[]>([]);
  const [appId,    setAppId]    = useState('');
  const [channels, setChannels] = useState<OTAChannel[]>([]);
  const [name,     setName]     = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supa.from('applications').select('id,name').order('name')
      .then(({ data: a }) => { setApps(a ?? []); if (a?.length) setAppId(a[0].id); });
  }, []);

  useEffect(() => {
    if (!appId) return;
    supa.from('ota_channels').select('*').eq('application_id', appId).order('name')
      .then(({ data }) => setChannels(data ?? []));
  }, [appId]);

  async function create() {
    if (!name || !appId) return;
    setCreating(true);
    const { error } = await supa.from('ota_channels').insert({ application_id: appId, name });
    if (!error) {
      setName('');
      const { data } = await supa.from('ota_channels').select('*').eq('application_id', appId).order('name');
      setChannels(data ?? []);
    } else alert(error.message);
    setCreating(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Channels</h1>
      <div className="flex gap-3 mb-6">
        <select value={appId} onChange={e => setAppId(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-background">
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Channel name"
          className="px-3 py-2 border rounded-md text-sm flex-1 max-w-xs" />
        <button onClick={create} disabled={creating || !name}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <div className="bg-card border rounded-xl overflow-hidden">
        {channels.length === 0 ? (
          <p className="p-6 text-muted-foreground text-center">No channels for this application.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-muted-foreground text-xs text-left">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Default</th><th className="px-4 py-3">Created</th>
            </tr></thead>
            <tbody className="divide-y">
              {channels.map(c => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.is_default ? '✔ Default' : '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.created_at.slice(0,10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
