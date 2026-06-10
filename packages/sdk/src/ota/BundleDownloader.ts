/**
 * BundleDownloader — downloads bundle.zip to a local temp file,
 * verifies SHA-256, and extracts main.jsbundle.
 *
 * Dependencies: react-native-fs, react-native-zip-archive
 */

import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import type { BundleManifest } from './types';

export interface DownloadResult {
  bundleDir:  string; // dir containing main.jsbundle
  bundlePath: string; // full path to main.jsbundle
}

export class BundleDownloader {
  private readonly downloadDir: string;

  constructor(downloadDir?: string) {
    this.downloadDir = downloadDir ?? `${RNFS.DocumentDirectoryPath}/ota_bundles`;
  }

  async download(
    manifest: BundleManifest,
    onProgress?: (received: number, total: number) => void,
    retries = 3,
  ): Promise<DownloadResult> {
    const bundleDir = `${this.downloadDir}/${manifest.id}`;
    const zipPath   = `${bundleDir}/bundle.zip`;

    await RNFS.mkdir(bundleDir);

    // Download with progress and retry
    let attempt = 0;
    while (attempt < retries) {
      try {
        const downloadTask = RNFS.downloadFile({
          fromUrl:         manifest.download_url,
          toFile:          zipPath,
          progressDivider: 5,
          progress: (res) => {
            onProgress?.(res.bytesWritten, res.contentLength);
          },
        });

        const result = await downloadTask.promise;
        if (result.statusCode !== 200) {
          throw new Error(`Download failed with status ${result.statusCode}`);
        }
        break;
      } catch (e) {
        attempt++;
        if (attempt >= retries) throw e;
        await sleep(1000 * attempt); // exponential backoff
      }
    }

    // Verify SHA-256
    const actualHash = await RNFS.hash(zipPath, 'sha256');
    if (actualHash.toLowerCase() !== manifest.file_hash.toLowerCase()) {
      await RNFS.unlink(zipPath).catch(() => {});
      throw new Error(
        `SHA-256 mismatch: expected ${manifest.file_hash}, got ${actualHash}`,
      );
    }

    // Extract
    const extractDir = `${bundleDir}/extracted`;
    await unzip(zipPath, extractDir);

    // Clean up zip
    await RNFS.unlink(zipPath).catch(() => {});

    const bundlePath = `${extractDir}/main.jsbundle`;
    const exists     = await RNFS.exists(bundlePath);
    if (!exists) {
      throw new Error('main.jsbundle not found in extracted archive');
    }

    return { bundleDir: extractDir, bundlePath };
  }

  /** Remove a specific bundle from disk. */
  async remove(bundleId: string): Promise<void> {
    const dir = `${this.downloadDir}/${bundleId}`;
    if (await RNFS.exists(dir)) {
      await RNFS.unlink(dir);
    }
  }

  /** Remove all bundles except the ones to keep. */
  async cleanup(keepIds: string[]): Promise<void> {
    if (!(await RNFS.exists(this.downloadDir))) return;
    const items = await RNFS.readDir(this.downloadDir);
    for (const item of items) {
      if (item.isDirectory() && !keepIds.includes(item.name)) {
        await RNFS.unlink(item.path).catch(() => {});
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
