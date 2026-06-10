import { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import { getAuth, readProjectConfig } from '../utils/config.js';

export const releasesListCommand = new Command('releases:list')
  .description('List releases for the current application')
  .option('-c, --channel <channel>',  'Filter by channel')
  .option('-p, --platform <platform>','Filter by platform')
  .option('--limit <n>',              'Number of results', '20')
  .action(async (opts) => {
    const auth = getAuth(); const project = readProjectConfig();
    if (!auth || !project) { console.error(chalk.red('Not logged in or no project.')); process.exit(1); }

    const resp = await fetch(`${project.supabaseUrl}/functions/v1/list-releases`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` },
      body: JSON.stringify({
        application_id: project.applicationId,
        channel:        opts.channel   ?? undefined,
        platform:       opts.platform  ?? undefined,
        limit:          parseInt(opts.limit, 10),
        offset:         0,
      }),
    });

    const result = await resp.json();
    if (!resp.ok) { console.error(chalk.red(result.error)); process.exit(1); }

    const rows = result.bundles ?? [];
    if (!rows.length) { console.log(chalk.yellow('No releases found')); return; }

    console.log(table([
      ['Version', 'Semver', 'Platform', 'Channel', 'Status', 'Force', 'Installs', 'Created'],
      ...rows.map((b: Record<string, unknown>) => [
        b.version,
        b.semver ?? '—',
        b.platform,
        (b.channel as Record<string,string>)?.name ?? '—',
        b.status,
        b.should_force_update ? '✔' : '',
        (b.installs as Record<string,number>)?.installed ?? 0,
        String(b.created_at).slice(0, 10),
      ]),
    ]));
    console.log(chalk.dim(`  ${rows.length} of ${result.total} total`));
  });
