import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loginWithPassword } from '../utils/auth.js';
import { getAuth, clearAuth } from '../utils/config.js';

export const loginCommand = new Command('login')
  .description('Authenticate with your Supabase OTA backend')
  .option('-e, --email <email>',       'Email address')
  .option('-p, --password <password>', 'Password (prefer interactive prompt)')
  .option('-k, --anon-key <key>',      'Supabase publishable (anon) key (or set OTA_SUPABASE_ANON_KEY)')
  .action(async (opts) => {
    const existing = getAuth();
    if (existing) {
      console.log(chalk.yellow(`Already logged in as ${existing.email}`));
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm', name: 'overwrite',
        message: 'Log in as a different user?', default: false,
      }]);
      if (!overwrite) return;
      clearAuth();
    }

    const envAnonKey = process.env.OTA_SUPABASE_ANON_KEY;
    const answers = await inquirer.prompt([
      { type: 'input',    name: 'email',    message: 'Email:',    when: !opts.email,    validate: v => v.includes('@') || 'Invalid email' },
      { type: 'password', name: 'password', message: 'Password:', when: !opts.password, validate: v => v.length > 0 || 'Required' },
      { type: 'input',    name: 'anonKey',  message: 'Supabase publishable (anon) key:', when: !opts.anonKey && !envAnonKey, validate: v => v.length > 0 || 'Required' },
    ]);

    const email    = opts.email    ?? answers.email;
    const password = opts.password ?? answers.password;
    const anonKey  = opts.anonKey  ?? envAnonKey ?? answers.anonKey;

    const spinner = ora('Logging in…').start();
    try {
      await loginWithPassword(email, password, anonKey);
      spinner.succeed(chalk.green(`Logged in as ${email}`));
    } catch (e: unknown) {
      spinner.fail(chalk.red(`Login failed: ${(e as Error).message}`));
      process.exit(1);
    }
  });

export const logoutCommand = new Command('logout')
  .description('Clear stored credentials')
  .action(() => {
    clearAuth();
    console.log(chalk.green('Logged out.'));
  });
