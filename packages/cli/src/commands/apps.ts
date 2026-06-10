import { Command } from 'commander';
import chalk from 'chalk';
import { createClient } from '@supabase/supabase-js';
import { table } from 'table';
import { getAuth, getAnonKey } from '../utils/config.js';

export const appsListCommand = new Command('apps:list')
  .description('List applications you have access to')
  .action(async () => {
    const auth = getAuth();
    if (!auth) { console.error(chalk.red('Not logged in.')); process.exit(1); }

    const supa = createClient(auth.supabaseUrl, getAnonKey(), {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    });

    const { data: apps, error } = await supa
      .from('applications')
      .select('id, name, slug, api_key, created_at')
      .order('name');

    if (error) { console.error(chalk.red(error.message)); process.exit(1); }
    if (!apps?.length) { console.log(chalk.yellow('No applications found')); return; }

    console.log(table([
      ['Name', 'Slug', 'App Key', 'Created'],
      ...apps.map(a => [a.name, a.slug, a.api_key, a.created_at.slice(0, 10)]),
    ]));
  });
