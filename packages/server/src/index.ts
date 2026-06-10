/**
 * @ota-platform/server
 *
 * Framework-agnostic backend for self-hosted React Native OTA updates.
 * Implement the two adapter interfaces for your stack (or use the bundled
 * reference adapters) and wire the handlers into any HTTP server.
 */

export * from './types';
export {
  sha256,
  rolloutBucket,
  hashesEqual,
} from './util';
export {
  checkUpdate,
  reportInstall,
  reportCrash,
  createRelease,
  rollbackRelease,
  listReleases,
} from './core';
export { createOTARouter } from './express';
export type { OTARouterOptions } from './express';
export { InMemoryDatabaseAdapter } from './adapters/memory';
export {
  LocalFileStorageAdapter,
} from './adapters/localFileStorage';
export type { LocalFileStorageOptions } from './adapters/localFileStorage';
