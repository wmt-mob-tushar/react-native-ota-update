'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase';
import {
  LayoutDashboard, AppWindow, GitBranch, Package,
  Rocket, BarChart3, Smartphone, Bug, Settings,
  Radio, LogOut, Zap,
} from 'lucide-react';

const nav = [
  { href: '/dashboard',            label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/dashboard/applications', label: 'Applications', icon: AppWindow },
  { href: '/dashboard/channels',   label: 'Channels',     icon: GitBranch },
  { href: '/dashboard/bundles',    label: 'Bundles',      icon: Package },
  { href: '/dashboard/deployments',label: 'Deployments',  icon: Rocket },
  { href: '/dashboard/rollouts',   label: 'Rollouts',     icon: Radio },
  { href: '/dashboard/analytics',  label: 'Analytics',    icon: BarChart3 },
  { href: '/dashboard/devices',    label: 'Devices',      icon: Smartphone },
  { href: '/dashboard/crashes',    label: 'Crash Reports',icon: Bug },
  { href: '/dashboard/settings',   label: 'Settings',     icon: Settings },
];

export default function Sidebar({ user }: { user: { email: string } }) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r flex flex-col bg-card h-full">
      <div className="px-5 py-5 border-b flex items-center gap-2">
        <Zap className="text-primary w-5 h-5" />
        <span className="font-bold text-sm">OTA Platform</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
                ${active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-4 py-3">
        <p className="text-xs text-muted-foreground truncate mb-2">{user.email}</p>
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  );
}
