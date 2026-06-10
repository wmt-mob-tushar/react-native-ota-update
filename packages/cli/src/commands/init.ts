import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { createClient } from '@supabase/supabase-js';
import { getAuth, getAnonKey, writeProjectConfig } from '../utils/config.js';

export const initCommand = new Command('init')
  .description('Link the current directory to an OTA application')
  .action(async () => {
    const auth = getAuth();
    if (!auth) {
      console.error(chalk.red('Not logged in. Run: npx ota-cli login'));
      process.exit(1);
    }

    const supa = createClient(auth.supabaseUrl, getAnonKey(), {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    });

    // Fetch apps the user has access to
    const { data: apps, error } = await supa
      .from('applications')
      .select('id, name, slug, api_key')
      .order('name');

    if (error) {
      console.error(chalk.red(`Failed to fetch apps: ${error.message}`));
      process.exit(1);
    }

    if (!apps?.length) {
      console.log(chalk.yellow('No applications found. Create one in the dashboard first.'));
      process.exit(0);
    }

    const { appId } = await inquirer.prompt([{
      type:    'list',
      name:    'appId',
      message: 'Select the application to link to this project:',
      choices: apps.map(a => ({ name: `${a.name} (${a.slug})`, value: a.id })),
    }]);

    const app = apps.find(a => a.id === appId)!;

    writeProjectConfig({
      applicationId: app.id,
      appSlug:       app.slug,
      supabaseUrl:   auth.supabaseUrl,
      anonKey:       getAnonKey(),
      appKey:        app.api_key,
    });

    console.log(chalk.green(`✔ Linked to application: ${app.name} (${app.slug})`));
    console.log(chalk.dim('  Config saved to .ota-config.json'));
    console.log(chalk.dim(`  App key (for React Native SDK): ${app.api_key}`));
  });
