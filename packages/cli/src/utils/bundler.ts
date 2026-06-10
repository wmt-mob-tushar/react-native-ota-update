import { execa } from 'execa';
import AdmZip from 'adm-zip';
import { glob } from 'glob';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import ora from 'ora';

export interface BundleResult {
  zipPath:   string;
  fileHash:  string;  // sha256 hex
  fileSize:  number;  // bytes
  tempDir:   string;  // caller must clean up
}

export interface BundleOptions {
  platform:   'ios' | 'android';
  entryFile?: string;
  outputDir?: string;
  hermes?:    boolean;
  dev?:       boolean;
}

/**
 * Build the React Native JS bundle + assets, zip them, and return the
 * bundle metadata. Supports Hermes bytecode compilation.
 */
export async function buildBundle(opts: BundleOptions): Promise<BundleResult> {
  const { platform, entryFile = 'index.js', hermes = false, dev = false } = opts;

  const tempDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-bundle-'));
  const bundleOut = path.join(tempDir, 'main.jsbundle');
  const assetsDir = path.join(tempDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const spinner = ora(`Building ${platform} bundle…`).start();

  try {
    // ── Step 1: react-native bundle ───────────────────────────
    await execa('npx', [
      'react-native', 'bundle',
      '--platform',          platform,
      '--entry-file',        entryFile,
      '--bundle-output',     bundleOut,
      '--assets-dest',       assetsDir,
      '--reset-cache',
      ...(dev  ? [] : ['--minify']),
      ...(dev  ? ['--dev', 'true'] : ['--dev', 'false']),
    ], { stdio: 'pipe' });

    // ── Step 2: Hermes bytecode compilation (optional) ────────
    let finalBundle = bundleOut;
    if (hermes) {
      spinner.text = 'Compiling Hermes bytecode…';
      const hbcOut = bundleOut.replace('.jsbundle', '.hbc');
      const hermesPath = findHermesc();
      if (hermesPath) {
        await execa(hermesPath, ['-emit-binary', '-out', hbcOut, bundleOut], { stdio: 'pipe' });
        finalBundle = hbcOut;
      } else {
        console.warn(chalk.yellow('hermesc not found, skipping Hermes compilation'));
      }
    }

    // ── Step 3: Zip bundle + assets ───────────────────────────
    spinner.text = 'Zipping bundle…';
    const zip     = new AdmZip();
    const zipPath = path.join(tempDir, 'bundle.zip');

    zip.addLocalFile(finalBundle, '', 'main.jsbundle');

    const assetFiles = await glob('**/*', { cwd: assetsDir, nodir: true });
    for (const f of assetFiles) {
      zip.addLocalFile(path.join(assetsDir, f), path.dirname(f));
    }
    zip.writeZip(zipPath);

    // ── Step 4: SHA-256 ──────────────────────────────────────
    const zipBytes = fs.readFileSync(zipPath);
    const hash     = crypto.createHash('sha256').update(zipBytes).digest('hex');
    const size     = zipBytes.length;

    spinner.succeed(`Bundle ready: ${(size / 1024 / 1024).toFixed(2)} MB, sha256: ${hash.slice(0, 12)}…`);

    return { zipPath, fileHash: hash, fileSize: size, tempDir };

  } catch (e: unknown) {
    spinner.fail('Bundle failed');
    // Clean up on failure
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw e;
  }
}

function findHermesc(): string | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules/react-native/sdks/hermesc/osx-bin/hermesc'),
    path.join(process.cwd(), 'node_modules/react-native/sdks/hermesc/linux64-bin/hermesc'),
    path.join(process.cwd(), 'node_modules/hermes-engine/linux64-bin/hermesc'),
  ];
  return candidates.find(c => fs.existsSync(c)) ?? null;
}
