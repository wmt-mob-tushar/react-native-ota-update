# @ota-platform/server

Framework-agnostic **backend** for self-hosted React Native OTA updates.

Supabase is just the *reference* backend for this platform — the protocol is open. This package lets you run the OTA server on **any Node.js stack** (Express, Fastify, Next.js, NestJS, AWS Lambda…) with **any database and storage** via two small adapter interfaces. The existing [`@ota-platform/sdk`](../sdk) talks to it unchanged.

```bash
npm install @ota-platform/server
```

## Quick start (Express, zero config)

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

Point the SDK at it:

```ts
new OTAManager({
  apiUrl: 'http://localhost:3000/functions/v1',
  appKey: 'your-app-key',
  channel: 'production',
  runtimeVersion: '1.0.0',
});
```

## Use the handlers directly (any framework)

The router is optional — every handler is a plain function:

```ts
import { checkUpdate, createRelease, reportCrash } from '@ota-platform/server';

// e.g. a Fastify / Next.js / Lambda route:
const result = await checkUpdate({ db, storage }, appKey, requestBody);
// → { status: 'UPDATE' | 'ROLLBACK' | 'NONE', bundle? }
```

| Handler | Purpose |
|---------|---------|
| `checkUpdate(opts, appKey, req)` | Update decision (UPDATE / ROLLBACK / NONE) |
| `reportInstall(opts, appKey, req)` | Install telemetry |
| `reportCrash(opts, appKey, req)` | Crash telemetry |
| `createRelease(opts, input)` | Create a release + active deployment |
| `rollbackRelease(opts, input)` | Roll back to the previous/explicit bundle |
| `listReleases(opts, query)` | List bundles |

## Bring your own database & storage

Implement two interfaces. The in-memory adapter (`InMemoryDatabaseAdapter`) is a complete, readable template.

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
  getDownloadUrl(path, expiresInSeconds?): Promise<string>;
  download?(path): Promise<Buffer>;      // optional
}
```

Drop in Postgres + S3, MongoDB + GCS, Prisma + R2, Drizzle + Cloudflare — anything. `getDownloadUrl` is where you return a signed/CDN URL.

## Operator (management) endpoints

`create-release`, `rollback-release`, and `list-releases` are mounted only when you supply an `operatorAuth` guard (your own JWT/session check):

```ts
createOTARouter({
  db, storage,
  operatorAuth: async (req) => {
    const user = await verifyMyJwt(req.header('authorization'));
    return user ? { applicationId: user.appId } : null;
  },
});
```

## Wire protocol

The endpoints match the SDK exactly, so any SDK works with any compliant backend:

- `POST /check-update` — header `x-app-key`
- `POST /report-install` — header `x-app-key`
- `POST /report-crash` — header `x-app-key`
- `POST /create-release` / `rollback-release` / `list-releases` — operator-authed

See the [Custom Backend docs](https://react-native-ota-update-docs.vercel.app/custom-backend) for full request/response shapes.

## License

MIT © WebMob Technologies
