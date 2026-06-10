/**
 * Reference local-filesystem storage adapter. Writes bundle archives under a
 * directory and serves them from a public base URL (e.g. an Express static
 * mount or a CDN origin). For production prefer S3 / GCS / R2 with signed URLs.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { OTAStorageAdapter } from '../types';

export interface LocalFileStorageOptions {
  /** Directory to write bundle archives into. */
  dir: string;
  /** Public base URL that serves `dir`, e.g. `http://localhost:3000/bundles`. */
  publicBaseUrl: string;
}

export class LocalFileStorageAdapter implements OTAStorageAdapter {
  constructor(private readonly opts: LocalFileStorageOptions) {}

  private fullPath(p: string): string {
    return path.join(this.opts.dir, p);
  }

  async upload(p: string, data: Buffer): Promise<void> {
    const full = this.fullPath(p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async getDownloadUrl(p: string): Promise<string> {
    const base = this.opts.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${p.replace(/^\//, '')}`;
  }

  async download(p: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(p));
  }
}
