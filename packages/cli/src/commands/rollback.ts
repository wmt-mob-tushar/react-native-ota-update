import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getAuth, readProjectConfig } from '../utils/config.js';

export const rollbackCommand = new Command('rollback')
  .description('Roll back the active release to the previous bundle')
  .requiredOption('-c, --channel <channel>',   'Channel name')
  .requiredOption('-p, --platform <platform>',  'ios | android')
  .option('--to <bundle_id>',                  'Rollback to a specific bundle ID')
  .option('--runtime <version>',               'Specific runtime version')
  .option('--reason <text>',                   'Reason for rollback')
  .action(async (opts) => {
    const auth    = getAuth();
    const project = readProjectConfig();
    if (!auth || !project) { console.error(chalk.red('Not logged in or no project config.')); process.exit(1); }

    const spinner = ora('Rolling back…').start();

    const resp = await fetch(`${project.supabaseUrl}/functions/v1/rollback-release`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        application_id:  project.applicationId,
        channel:         opts.channel,
        platform:        opts.platform,
        runtime_version: opts.runtime ?? undefined,
        to_bundle_id:    opts.to      ?? undefined,
        reason:          opts.reason  ?? undefined,
      }),
    });

    const result = await resp.json();
    if (!resp.ok) {
      spinner.fail(chalk.red(`Rollback failed: ${result.error}`));
      process.exit(1);
    }

    spinner.succeed(chalk.green(`Rollback complete: ${JSON.stringify(result.rollbacks)}`));
  });
