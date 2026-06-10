/**
 * Optional Express integration. Mount the returned router and the existing
 * React Native SDK works against your backend unchanged:
 *
 *   import express from 'express';
 *   import { createOTARouter, InMemoryDatabaseAdapter, LocalFileStorageAdapter } from '@ota-platform/server';
 *
 *   const app = express();
 *   app.use('/functions/v1', createOTARouter({
 *     db: new InMemoryDatabaseAdapter(),
 *     storage: new LocalFileStorageAdapter({ dir: './bundles', publicBaseUrl: 'http://localhost:3000/bundles' }),
 *   }));
 *   app.use('/bundles', express.static('./bundles'));
 *   app.listen(3000);
 */

import type { Request, Response, Router } from 'express';
import { OTAServerOptions, OTAError } from './types';
import {
  checkUpdate,
  reportInstall,
  reportCrash,
  createRelease,
  rollbackRelease,
  listReleases,
} from './core';

export interface OTARouterOptions extends OTAServerOptions {
  /**
   * Optional operator-auth guard for the management endpoints
   * (create-release / rollback-release / list-releases). Return the
   * authorised application id, or null to reject with 401. If omitted,
   * those endpoints are not mounted.
   */
  operatorAuth?: (req: Request) => Promise<{ applicationId: string } | null>;
}

function appKeyOf(req: Request): string | undefined {
  const key = req.header('x-app-key');
  return key ?? undefined;
}

async function run(res: Response, fn: () => Promise<unknown>) {
  try {
    res.json(await fn());
  } catch (e) {
    if (e instanceof OTAError) {
      res.status(e.status).json({ error: e.message });
    } else {
      res.status(500).json({ error: (e as Error).message ?? 'Internal error' });
    }
  }
}

/** Build an Express Router exposing the OTA endpoints. */
export function createOTARouter(opts: OTARouterOptions): Router {
  // express is an optional peer dependency — require it lazily.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  const router: Router = express.Router();
  const json = express.json({ limit: '1mb' });

  // ── Device endpoints (x-app-key) ──────────────────────────────────
  router.post('/check-update', json, (req: Request, res: Response) =>
    run(res, () => checkUpdate(opts, appKeyOf(req), req.body)),
  );

  router.post('/report-install', json, (req: Request, res: Response) =>
    run(res, () => reportInstall(opts, appKeyOf(req), req.body)),
  );

  router.post('/report-crash', json, (req: Request, res: Response) =>
    run(res, () => reportCrash(opts, appKeyOf(req), req.body)),
  );

  // ── Operator endpoints (only when an auth guard is supplied) ───────
  if (opts.operatorAuth) {
    const guard = opts.operatorAuth;

    router.post('/create-release', json, (req: Request, res: Response) =>
      run(res, async () => {
        const op = await guard(req);
        if (!op) throw new OTAError(401, 'Unauthorized');
        return createRelease(opts, { ...req.body, applicationId: op.applicationId });
      }),
    );

    router.post('/rollback-release', json, (req: Request, res: Response) =>
      run(res, async () => {
        const op = await guard(req);
        if (!op) throw new OTAError(401, 'Unauthorized');
        return rollbackRelease(opts, { ...req.body, applicationId: op.applicationId });
      }),
    );

    router.post('/list-releases', json, (req: Request, res: Response) =>
      run(res, async () => {
        const op = await guard(req);
        if (!op) throw new OTAError(401, 'Unauthorized');
        return listReleases(opts, { ...req.body, applicationId: op.applicationId });
      }),
    );
  }

  return router;
}
