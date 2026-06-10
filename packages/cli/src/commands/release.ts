import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { buildBundle } from '../utils/bundler.js';
import { uploadBundle } from '../utils/uploader.js';
import { getAuth, getAnonKey, readProjectConfig } from '../utils/config.js';

export const releaseCommand = new Command('release')
  .description('Build, bundle, upload, and create a new OTA release')
  .option('-p, --platform <platform>', 'ios | android | both', 'both')
  .option('-c, --channel <channel>',   'Target channel', 'production')
  .option('--runtime <version>',       'Native runtime version (binary version)')
  .option('--hermes',                  'Compile with Hermes bytecode', false)
  .option('--force',                   'Mark this release as force update', false)
  .option('--semver <version>',        'Human-readable semver e.g. 1.2.3')
  .option('--message <message>',       'Release notes')
  .option('--rollout <percent>',       'Rollout percentage (0-100)', '100')
  .option('--entry <file>',            'Entry file', 'index.js')
  .option('--dry-run',                 'Build only, do not upload or create release')
  .action(async (opts) => {
    const auth    = getAuth();
    const project = readProjectConfig();

    if (!auth) { console.error(chalk.red('Not logged in. Run: npx ota-cli login')); process.exit(1); }
    if (!project) { console.error(chalk.red('No project config. Run: npx ota-cli init')); process.exit(1); }

    const platforms: Array<'ios'|'android'> = opts.platform === 'both'
      ? ['ios', 'android']
      : [opts.platform as 'ios'|'android'];

    let runtimeVersion = opts.runtime;
    if (!runtimeVersion) {
      // Try to read from app.json / package.json
      try {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
        runtimeVersion = pkg.version ?? '1.0.0';
      } catch {
        const { rv } = await inquirer.prompt([{
          type: 'input', name: 'rv', message: 'Native runtime version (e.g. 1.0.0):',
          validate: v => v.length > 0,
        }]);
        runtimeVersion = rv;
      }
    }

    for (const platform of platforms) {
      console.log(chalk.bold(`\n── ${platform.toUpperCase()} ──`));

      const bundleResult = await buildBundle({
        platform,
        entryFile: opts.entry,
        hermes:    opts.hermes,
        dev:       false,
      });

      if (opts.dryRun) {
        console.log(chalk.yellow('Dry run — skipping upload'));
        fs.rmSync(bundleResult.tempDir, { recursive: true, force: true });
        continue;
      }

      const bundleId = uuidv4();

      const { storagePath } = await uploadBundle({
        zipPath:     bundleResult.zipPath,
        appSlug:     project.appSlug,
        channel:     opts.channel,
        platform,
        bundleId,
        anonKey:     getAnonKey(),
        supabaseUrl: project.supabaseUrl,
        accessToken: auth.accessToken,
      });

      // Clean up temp files
      fs.rmSync(bundleResult.tempDir, { recursive: true, force: true });

      // Call create-release Edge Function
      const spinner = ora('Creating release…').start();
      const resp    = await fetch(`${project.supabaseUrl}/functions/v1/create-release`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify({
          application_id:     project.applicationId,
          channel:            opts.channel,
          platform,
          runtime_version:    runtimeVersion,
          storage_path:       storagePath,
          file_hash:          bundleResult.fileHash,
          file_size:          bundleResult.fileSize,
          semver:             opts.semver ?? null,
          should_force_update: opts.force,
          message:            opts.message ?? null,
          rollout_percentage: parseInt(opts.rollout, 10),
        }),
      });

      const result = await resp.json();
      if (!resp.ok) {
        spinner.fail(chalk.red(`Release failed: ${result.error ?? JSON.stringify(result)}`));
        process.exit(1);
      }

      spinner.succeed(chalk.green(
        `Release created! version=${result.version}, bundle_id=${result.bundle_id}`,
      ));
    }
  });
