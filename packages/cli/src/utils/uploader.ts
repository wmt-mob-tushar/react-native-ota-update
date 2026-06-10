import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { getAuth } from './config.js';

export interface UploadResult {
  storagePath: string;
}

/**
 * Upload a bundle.zip to Supabase Storage.
 * Path: ota/{app_slug}/{channel}/{platform}/{bundle_uuid}/bundle.zip
 *
 * Returns the storage path (relative to the bucket root).
 */
export async function uploadBundle(opts: {
  zipPath:   string;
  appSlug:   string;
  channel:   string;
  platform:  'ios' | 'android';
  bundleId:  string; // pre-generated UUID, used as folder name
  anonKey:   string;
  supabaseUrl: string;
  accessToken: string;
}): Promise<UploadResult> {
  const { zipPath, appSlug, channel, platform, bundleId, anonKey, supabaseUrl, accessToken } = opts;

  const storagePath = `${appSlug}/${channel}/${platform}/${bundleId}/bundle.zip`;

  const supa = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const fileBuffer = fs.readFileSync(zipPath);
  const spinner    = ora(`Uploading bundle to ota/${storagePath}…`).start();

  const { error } = await supa.storage
    .from('ota')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/zip',
      upsert:      false,
    });

  if (error) {
    spinner.fail(`Upload failed: ${error.message}`);
    throw new Error(error.message);
  }

  spinner.succeed(`Uploaded → ota/${storagePath}`);
  return { storagePath };
}
