'use client';

import { useState } from 'react';
import { createClient } from '../../../lib/supabase';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const [mode,     setMode]     = useState<Mode>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [message,  setMessage]  = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const supa = createClient();

      if (mode === 'login') {
        const { data, error } = await supa.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage({ type: 'error', text: error.message });
          setLoading(false);
          return;
        }
        if (data.session) {
          setMessage({ type: 'success', text: 'Signed in! Redirecting…' });
          window.location.href = '/dashboard';
          return;
        }
        setMessage({ type: 'error', text: 'Sign in failed. Please try again.' });
        setLoading(false);

      } else {
        const { data, error } = await supa.auth.signUp({ email, password });
        if (error) {
          setMessage({ type: 'error', text: error.message });
          setLoading(false);
          return;
        }
        if (data.session) {
          // Auto-confirmed (email confirm disabled)
          setMessage({ type: 'success', text: 'Account created! Redirecting…' });
          window.location.href = '/dashboard';
          return;
        }
        // Email confirmation required
        setMessage({ type: 'success', text: 'Account created! Check your email to confirm, then sign in.' });
        setMode('login');
        setLoading(false);
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unexpected error' });
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4 shadow-lg">
            <span className="text-2xl">⚡</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">OTA Platform</h1>
          <p className="text-gray-500 text-sm mt-1">Self-hosted React Native updates</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">

          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setMessage(null); }}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
                  mode === m
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Feedback banner */}
          {message && (
            <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-start gap-2 ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              <span>{message.type === 'error' ? '✕' : '✓'}</span>
              <span>{message.text}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="••••••••"
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={6}
              />
              {mode === 'signup' && (
                <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          OTA Platform · Self-hosted on Supabase
        </p>
      </div>
    </div>
  );
}
