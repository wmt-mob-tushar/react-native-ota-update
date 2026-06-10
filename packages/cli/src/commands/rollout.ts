import { Command } from 'commander';
import chalk from 'chalk';
import { createClient } from '@supabase/supabase-js';
import { getAuth, getAnonKey, readProjectConfig } from '../utils/config.js';

export const rolloutCommand = new Command('rollout')
  .description('Update rollout percentage for the active deployment')
  .requiredOption('-c, --channel <channel>',   'Channel name')
  .requiredOption('-p, --platform <platform>',  'ios | android')
  .requiredOption('--percent <n>',              'New rollout percentage (0-100)')
  .option('--pause',                            'Pause the rollout')
  .option('--resume',                           'Resume a paused rollout')
  .action(async (opts) => {
    const auth    = getAuth();
    const project = readProjectConfig();
    if (!auth || !project) { console.error(chalk.red('Not logged in or no project config.')); process.exit(1); }

    const supa = createClient(auth.supabaseUrl, getAnonKey(), {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    });

    // Find active deployment
    const { data: ch } = await supa.from('ota_channels').select('id')
      .eq('application_id', project.applicationId).eq('name', opts.channel).single();
    if (!ch) { console.error(chalk.red(`Channel '${opts.channel}' not found`)); process.exit(1); }

    const { data: dep } = await supa.from('ota_deployments').select('id')
      .eq('application_id', project.applicationId)
      .eq('channel_id', ch.id).eq('platform', opts.platform).eq('status', 'active').single();
    if (!dep) { console.error(chalk.red('No active deployment found')); process.exit(1); }

    const newStatus  = opts.pause  ? 'paused'
                     : opts.resume ? 'active'
                     : 'active';
    const percentage = parseInt(opts.percent, 10);

    const { error } = await supa.from('ota_rollouts')
      .update({ percentage, status: newStatus, updated_at: new Date().toISOString() })
      .eq('deployment_id', dep.id);

    if (error) { console.error(chalk.red(error.message)); process.exit(1); }
    console.log(chalk.green(`✔ Rollout updated: ${percentage}% (${newStatus})`));
  });
