'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase';

export default function SettingsPage() {
  const supa = createClient();
  const [email, setEmail] = useState('');
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    supa.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''));
  }, []);

  async function updatePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pass = form.get('password') as string;
    const { error } = await supa.auth.updateUser({ password: pass });
    if (!error) setSaved(true);
    else alert(error.message);
  }

  async function signOut() {
    await supa.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-card border rounded-xl p-5 mb-4">
        <h2 className="font-semibold mb-1">Account</h2>
        <p className="text-sm text-muted-foreground">{email}</p>
      </div>

      <div className="bg-card border rounded-xl p-5 mb-4">
        <h2 className="font-semibold mb-3">Change Password</h2>
        <form onSubmit={updatePassword} className="space-y-3">
          <input name="password" type="password" placeholder="New password (min 8 chars)" minLength={8}
            className="w-full px-3 py-2 border rounded-md text-sm" required />
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
            Update Password
          </button>
          {saved && <p className="text-green-600 text-sm">Password updated!</p>}
        </form>
      </div>

      <div className="bg-card border rounded-xl p-5">
        <h2 className="font-semibold mb-1 text-destructive">Danger Zone</h2>
        <button onClick={signOut} className="mt-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm">
          Sign Out
        </button>
      </div>

      <div className="mt-6 bg-muted rounded-xl p-5 text-sm text-muted-foreground space-y-1">
        <p><strong>Supabase URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL}</p>
        <p><strong>Dashboard version:</strong> 1.0.0</p>
      </div>
    </div>
  );
}
