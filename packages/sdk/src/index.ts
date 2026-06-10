/**
 * @ota-platform/sdk
 *
 * Drop-in OTA update client for React Native.
 *
 * Quick start:
 *
 *   import { OTAManager } from '@ota-platform/sdk';
 *
 *   const ota = new OTAManager({
 *     apiUrl: 'https://xxx.supabase.co/functions/v1',
 *     appKey: 'your-app-api-key',
 *     channel: 'production',
 *   });
 *
 *   // In your App.tsx root:
 *   useEffect(() => {
 *     ota.initialize();
 *     return () => ota.stopBackgroundCheck();
 *   }, []);
 *
 *   // Once the app has rendered without a crash:
 *   ota.onLaunchSuccess();
 */

export * from './ota';
