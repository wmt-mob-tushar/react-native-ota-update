export { OTAManager }       from './OTAManager';
export { OTAClient }        from './OTAClient';
export { BundleDownloader } from './BundleDownloader';
export { BundleInstaller }  from './BundleInstaller';
export { OTABundleLoader } from './BundleLoader';
export { RollbackManager }  from './RollbackManager';
export { AnalyticsManager } from './AnalyticsManager';
export type {
  OTAConfig,
  BundleManifest,
  CheckUpdateResult,
  UpdateStatus,
  OTAState,
  OTAUpdateCallbacks,
  Platform as OTAPlatform,
} from './types';
