#!/usr/bin/env node
/**
 * ota-cli — Self-hosted OTA Update Platform CLI
 *
 * Usage:
 *   npx ota-cli <command> [options]
 *
 * Commands:
 *   init              Link this directory to an OTA application
 *   login             Authenticate with Supabase
 *   logout            Clear stored credentials
 *   apps:list         List accessible applications
 *   release           Build + upload + create a new release
 *   rollout           Update rollout percentage
 *   rollback          Roll back to a previous bundle
 *   analytics         Show analytics summary
 *   channel:create    Create a new channel
 *   channel:list      List channels
 *   releases:list     List releases
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loginCommand, logoutCommand } from './commands/login.js';
import { initCommand }           from './commands/init.js';
import { appsListCommand }       from './commands/apps.js';
import { releaseCommand }        from './commands/release.js';
import { rolloutCommand }        from './commands/rollout.js';
import { rollbackCommand }       from './commands/rollback.js';
import { analyticsCommand }      from './commands/analytics.js';
import { channelCreateCommand, channelListCommand } from './commands/channel.js';
import { releasesListCommand }   from './commands/releases.js';

const program = new Command();

program
  .name('ota-cli')
  .description(chalk.bold('Self-hosted OTA Update Platform CLI'))
  .version('1.0.0')
  .addHelpText('after', `
${chalk.dim('Examples:')}
  ${chalk.cyan('$ npx ota-cli login')}
  ${chalk.cyan('$ npx ota-cli init')}
  ${chalk.cyan('$ npx ota-cli release --platform both --channel production')}
  ${chalk.cyan('$ npx ota-cli rollout --channel production --platform ios --percent 25')}
  ${chalk.cyan('$ npx ota-cli rollback --channel production --platform android')}
  ${chalk.cyan('$ npx ota-cli analytics --range 7d')}
`);

program
  .addCommand(loginCommand)
  .addCommand(logoutCommand)
  .addCommand(initCommand)
  .addCommand(appsListCommand)
  .addCommand(releaseCommand)
  .addCommand(rolloutCommand)
  .addCommand(rollbackCommand)
  .addCommand(analyticsCommand)
  .addCommand(channelCreateCommand)
  .addCommand(channelListCommand)
  .addCommand(releasesListCommand);

program.parseAsync(process.argv).catch((e: unknown) => {
  console.error(chalk.red(`Error: ${(e as Error).message}`));
  process.exit(1);
});
