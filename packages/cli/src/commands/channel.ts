import { Command } from 'commander';
import chalk from 'chalk';
import { createClient } from '@supabase/supabase-js';
import { table } from 'table';
import { getAuth, getAnonKey, readProjectConfig } from '../utils/config.js';

function supabase(auth: NonNullable<ReturnType<typeof getAuth>>) {
  return createClient(auth.supabaseUrl, getAnonKey(), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${auth!.accessToken}` } },
  });
}

export const channelCreateCommand = new Command('channel:create')
  .description('Create a new release channel')
  .requiredOption('-n, --name <name>', 'Channel name (e.g. staging)')
  .option('--default',                'Set as the default channel')
  .action(async (opts) => {
    const auth = getAuth(); const project = readProjectConfig();
    if (!auth || !project) { console.error(chalk.red('Not logged in or no project.')); process.exit(1); }

    const { error } = await supabase(auth).from('ota_channels')
      .insert({ application_id: project.applicationId, name: opts.name, is_default: opts.default ?? false });

    if (error) { console.error(chalk.red(error.message)); process.exit(1); }
    console.log(chalk.green(`✔ Channel '${opts.name}' created`));
  });

export const channelListCommand = new Command('channel:list')
  .description('List channels for the current application')
  .action(async () => {
    const auth = getAuth(); const project = readProjectConfig();
    if (!auth || !project) { console.error(chalk.red('Not logged in or no project.')); process.exit(1); }

    const { data, error } = await supabase(auth).from('ota_channels')
      .select('name, is_default, created_at')
      .eq('application_id', project.applicationId).order('name');

    if (error) { console.error(chalk.red(error.message)); process.exit(1); }
    if (!data?.length) { console.log(chalk.yellow('No channels found')); return; }

    console.log(table([
      ['Name', 'Default', 'Created'],
      ...data.map(c => [c.name, c.is_default ? '✔' : '', c.created_at.slice(0,10)]),
    ]));
  });
