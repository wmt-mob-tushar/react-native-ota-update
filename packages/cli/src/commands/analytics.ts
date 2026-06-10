import { Command } from 'commander';
import chalk from 'chalk';
import { getAuth, readProjectConfig } from '../utils/config.js';

export const analyticsCommand = new Command('analytics')
  .description('Show analytics summary for the current application')
  .option('--range <range>', '1d | 7d | 30d | 90d', '7d')
  .action(async (opts) => {
    const auth = getAuth(); const project = readProjectConfig();
    if (!auth || !project) { console.error(chalk.red('Not logged in or no project.')); process.exit(1); }

    const resp = await fetch(`${project.supabaseUrl}/functions/v1/analytics`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` },
      body: JSON.stringify({ application_id: project.applicationId, range: opts.range }),
    });

    const result = await resp.json();
    if (!resp.ok) { console.error(chalk.red(result.error)); process.exit(1); }

    const { active_devices, adoption, daily_events, crash_stats } = result;

    console.log(chalk.bold(`\n📊 Analytics (${opts.range})`));
    console.log(chalk.dim('─'.repeat(50)));

    if (active_devices?.length) {
      console.log(chalk.bold('\nActive Devices:'));
      for (const row of active_devices) {
        console.log(`  ${row.platform}: ${row.active_devices_30d} (30d)  ${row.active_devices_7d} (7d)  ${row.active_devices_1d} (1d)`);
      }
    }

    if (adoption?.length) {
      console.log(chalk.bold('\nTop Bundle Adoption:'));
      adoption.slice(0, 5).forEach((row: Record<string, unknown>) => {
        console.log(`  v${row.version} (${row.platform}) [${row.channel}]: ${row.device_count} devices (${row.adoption_pct}%)`);
      });
    }

    if (crash_stats?.length) {
      console.log(chalk.bold('\nCrash Rates:'));
      crash_stats.slice(0, 5).forEach((row: Record<string, unknown>) => {
        console.log(`  bundle ${String(row.bundle_id).slice(0,8)}…: ${row.total_crashes} crashes (${row.crash_rate_per_1k}/1k installs)`);
      });
    }

    const totals = (daily_events as Array<Record<string, number>>).reduce(
      (acc, d) => {
        for (const [k, v] of Object.entries(d)) {
          if (k !== 'date') acc[k] = (acc[k] ?? 0) + (v as number);
        }
        return acc;
      }, {} as Record<string, number>,
    );

    console.log(chalk.bold('\nEvent Totals:'));
    for (const [k, v] of Object.entries(totals)) {
      console.log(`  ${k}: ${v}`);
    }
    console.log('');
  });
