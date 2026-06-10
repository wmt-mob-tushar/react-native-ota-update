'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';
import type { Application } from '../../../types';
import { Plus, Copy, RefreshCw } from 'lucide-react';

export default function ApplicationsPage() {
  const [apps,    setApps]    = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [name,    setName]    = useState('');
  const [slug,    setSlug]    = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const supa = createClient();

  async function load() {
    setLoading(true);
    const { data } = await supa.from('applications').select('*').order('name');
    setApps(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createApp() {
    if (!name || !slug) return;
    setCreating(true);
    const { data: { user } } = await supa.auth.getUser();
    const { error } = await supa.from('applications')
      .insert({ name, slug: slug.toLowerCase().replace(/\s+/g, '-'), owner_id: user!.id });
    if (!error) { setName(''); setSlug(''); setShowForm(false); await load(); }
    else alert(error.message);
    setCreating(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Applications</h1>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition">
          <Plus className="w-4 h-4" /> New Application
        </button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 mb-6 space-y-3">
          <h2 className="font-semibold text-sm">Create Application</h2>
          <input value={name} onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g,'-')); }}
            placeholder="App name" className="w-full px-3 py-2 border rounded-md text-sm" />
          <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
            placeholder="app-slug" className="w-full px-3 py-2 border rounded-md text-sm font-mono" />
          <div className="flex gap-2">
            <button onClick={createApp} disabled={creating}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50">
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-md text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-muted-foreground" /></div>
      ) : apps.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No applications yet.</div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <a key={app.id} href={`/dashboard/applications/${app.id}`}
              className="block bg-card border rounded-xl p-5 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{app.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{app.slug}</p>
                  {app.description && <p className="text-sm text-muted-foreground mt-1">{app.description}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{app.created_at.slice(0,10)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  {app.api_key}
                </span>
                <button onClick={e => { e.preventDefault(); navigator.clipboard.writeText(app.api_key); }}
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
