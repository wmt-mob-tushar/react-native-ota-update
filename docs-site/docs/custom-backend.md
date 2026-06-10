---
id: custom-backend
title: Bring Your Own Backend
sidebar_position: 7
---

# Bring Your Own Backend

**Supabase is the reference backend — not a requirement.** The OTA protocol is open: any server that implements the wire endpoints works with the React Native SDK unchanged. Use Node.js, Postgres, S3, MongoDB, Cloudflare — whatever your stack is.

The easiest path is the **[`@ota-platform/server`](https://www.npmjs.com/package/@ota-platform/server)** npm package, a framework-agnostic implementation you drop into any Node.js backend.

```bash
npm install @ota-platform/server
```

## Express in 15 lines

```ts
import express from 'express';
import {
  createOTARouter,
  InMemoryDatabaseAdapter,
  LocalFileStorageAdapter,
} from '@ota-platform/server';

const db = new InMemoryDatabaseAdapter([
  { id: 'app1', appKey: 'your-app-key', slug: 'demo' },
]);
const storage = new LocalFileStorageAdapter({
  dir: './bundles',
  publicBaseUrl: 'http://localhost:3000/bundles',
});

const app = express();
app.use('/functions/v1', createOTARouter({ db, storage }));
app.use('/bundles', express.static('./bundles'));
app.listen(3000);
```

Point the SDK at your server — nothing else changes:

```ts
new OTAManager({
  apiUrl: 'http://localhost:3000/functions/v1',
  appKey: 'your-app-key',
  channel: 'production',
  runtimeVersion: '1.0.0',
});
```

## Framework-agnostic handlers

You don't need Express. Every endpoint is a plain async function you can call from Fastify, NestJS, a Next.js route handler, or a Lambda:

```ts
import { checkUpdate, createRelease, reportCrash } from '@ota-platform/server';

const result = await checkUpdate({ db, storage }, appKey, requestBody);
// → { status: 'UPDATE' | 'ROLLBACK' | 'NONE', bundle? }
```

| Handler | Purpose |
|---------|---------|
| `checkUpdate(opts, appKey, req)` | Update decision engine |
| `reportInstall(opts, appKey, req)` | Install telemetry |
| `reportCrash(opts, appKey, req)` | Crash telemetry |
| `createRelease(opts, input)` | Create a release + active deployment |
| `rollbackRelease(opts, input)` | Roll back to previous/explicit bundle |
| `listReleases(opts, query)` | List bundles |

## Adapters: any database, any storage

Implement two small interfaces for your stack. The bundled `InMemoryDatabaseAdapter` is a complete, readable template — copy it and swap the arrays for SQL/Mongo/ORM calls.

```ts
interface OTADatabaseAdapter {
  getAppByKey(appKey): Promise<OTAApp | null>;
  getActiveBundle(q): Promise<OTABundleRecord | null>;
  getBundleById(id): Promise<OTABundleRecord | null>;
  getLatestGoodBundle(q): Promise<OTABundleRecord | null>;
  getNextVersion(q): Promise<number>;
  insertBundle(bundle): Promise<void>;
  setActiveBundle(q): Promise<void>;
  setBundleEnabled(id, enabled, status?): Promise<void>;
  recordInstall(r): Promise<void>;
  recordCrash(r): Promise<void>;
  listBundles(q): Promise<OTABundleRecord[]>;
  upsertDevice?(d): Promise<void>;       // optional
  recordRollback?(r): Promise<void>;     // optional
}

interface OTAStorageAdapter {
  upload(path, data, contentType?): Promise<void>;
  getDownloadUrl(path, expiresInSeconds?): Promise<string>;   // signed/CDN URL
  download?(path): Promise<Buffer>;      // optional, for server-side hash checks
}
```

### Example: Postgres + S3 (sketch)

```ts
class PostgresAdapter implements OTADatabaseAdapter {
  constructor(private pool: Pool) {}
  async getAppByKey(appKey: string) {
    const { rows } = await this.pool.query(
      'select id, api_key as "appKey", slug from applications where api_key = $1',
      [appKey],
    );
    return rows[0] ?? null;
  }
  async getActiveBundle(q) {
    const { rows } = await this.pool.query(
      `select b.* from bundles b
         join deployments d on d.bundle_id = b.id
        where d.application_id = $1 and d.channel = $2
          and d.platform = $3 and d.runtime_version = $4
          and d.status = 'active' and b.enabled
        limit 1`,
      [q.applicationId, q.channel, q.platform, q.runtimeVersion],
    );
    return rows[0] ?? null;
  }
  // … the rest mirror the interface
}

class S3Adapter implements OTAStorageAdapter {
  async upload(path, data, contentType) {/* PutObject */}
  async getDownloadUrl(path, ttl = 300) {/* getSignedUrl(GetObject, ttl) */ return url; }
}
```

## Operator endpoints

`create-release`, `rollback-release`, and `list-releases` are mounted only when you provide an `operatorAuth` guard — your own JWT/session check:

```ts
createOTARouter({
  db, storage,
  operatorAuth: async (req) => {
    const user = await verifyMyJwt(req.header('authorization'));
    return user ? { applicationId: user.appId } : null;
  },
});
```

## Wire protocol (implement in any language)

If you'd rather not use Node, implement these endpoints directly. Devices send `x-app-key`; operator endpoints use your own auth.

### `POST /check-update`

```jsonc
// request
{ "platform": "android", "channel": "production", "runtime_version": "1.0.0",
  "device_id": "abc", "current_bundle_id": null }

// response
{ "status": "UPDATE",
  "bundle": { "id": "uuid", "version": 2, "file_hash": "sha256",
              "file_size": 247692, "download_url": "https://…signed…",
              "should_force_update": false, "message": "Bug fixes" } }
```

`status` is `UPDATE`, `ROLLBACK`, or `NONE`. See the [API Reference](./api-reference) for `report-install`, `report-crash`, `create-release`, `rollback-release`, and `list-releases`.

## What the server must enforce

1. **App-key auth** — reject unknown keys with `401`.
2. **Active bundle resolution** — newest enabled bundle for `(channel, platform, runtime_version)`.
3. **Up-to-date check** — return `NONE` when the device already has the active bundle.
4. **Rollout gate** — bucket the device by `hash(device_id) % 100`; outside the percentage → `NONE`.
5. **Rollback** — if the device's current bundle is disabled, return `ROLLBACK` with the latest good bundle.
6. **Signed downloads** — never expose the bundle storage publicly; return a short-lived URL.

The `@ota-platform/server` package implements all six for you.
