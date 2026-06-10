import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { OTAManager } from '@ota-platform/sdk';
import type { OTAState } from '@ota-platform/sdk';

export type OTAStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'up_to_date'
  | 'error'
  | 'rollback';

export interface OTAHookResult {
  status: OTAStatus;
  progress: number;        // 0–100
  currentBundle: string | null;
  pendingBundle: string | null;
  lastGoodBundle: string | null;
  errorMessage: string | null;
  updateMessage: string | null;
  isForced: boolean;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  rollback: () => Promise<void>;
  dismissError: () => void;
}

const OTA_API_URL = 'https://iboujbxhilhhehcrsorv.supabase.co/functions/v1';
const OTA_APP_KEY = '98b345c2-5f77-440d-968c-23f664ee2d3b';   // from dashboard → Applications
const OTA_CHANNEL = 'production';
// Must exactly match the value passed to `ota-cli release --runtime`.
const OTA_RUNTIME_VERSION = '1.0.0';

export function useOTA(): OTAHookResult {
  const managerRef = useRef<OTAManager | null>(null);
  const [status,       setStatus]       = useState<OTAStatus>('idle');
  const [progress,     setProgress]     = useState(0);
  const [state,        setState]        = useState<OTAState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updateMsg,    setUpdateMsg]    = useState<string | null>(null);
  const [isForced,     setIsForced]     = useState(false);

  // Guards against re-prompting for the same staged bundle every poll.
  const promptedRef   = useRef<string | null>(null);
  const isForcedRef   = useRef(false);
  const updateMsgRef  = useRef<string | null>(null);

  const refreshState = useCallback(async () => {
    const mgr = managerRef.current;
    if (!mgr) return;
    setState(await mgr.getState());
  }, []);

  /** Reload the app so the staged bundle takes effect. */
  const applyAndRestart = useCallback(async () => {
    if (!managerRef.current) return;
    setStatus('installing');
    try {
      await managerRef.current.reloadApp();
    } catch (e) {
      setErrorMessage(String(e));
      setStatus('error');
    }
  }, []);

  /**
   * Fired once a new bundle is downloaded + staged. Auto-pops the
   * "Update available" dialog; forced updates restart with no prompt.
   */
  const promptToRestart = useCallback(async (forced: boolean, message: string | null) => {
    const state = await managerRef.current?.getState();
    const pendingId = state?.pendingBundleId ?? 'pending';
    if (promptedRef.current === pendingId) return;   // already prompted
    promptedRef.current = pendingId;

    if (forced) {
      await applyAndRestart();
      return;
    }
    Alert.alert(
      '🆕 Update Available',
      message ?? 'A new version has been downloaded. Restart now to apply it?',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart Now', onPress: applyAndRestart },
      ],
    );
  }, [applyAndRestart]);

  useEffect(() => {
    const mgr = new OTAManager({
      apiUrl:               OTA_API_URL,
      appKey:               OTA_APP_KEY,
      channel:              OTA_CHANNEL,
      runtimeVersion:       OTA_RUNTIME_VERSION,
      checkOnStartup:       false,   // demo checks manually via the button
      checkInBackground:    true,
      backgroundIntervalMs: 60_000,
    }).on({
      onUpdateAvailable: (manifest) => {
        const forced = manifest.should_force_update ?? false;
        isForcedRef.current  = forced;
        updateMsgRef.current = manifest.message ?? null;
        setIsForced(forced);
        setUpdateMsg(manifest.message ?? null);
        setStatus('downloading');
      },
      onDownloadProgress: (received, total) => {
        setProgress(total > 0 ? Math.round((received / total) * 100) : 0);
        setStatus('downloading');
      },
      onUpdateInstalled: () => {
        setStatus('ready');           // staged; takes effect on restart/install
        refreshState();
        // Auto-prompt the user to restart (forced updates restart silently).
        promptToRestart(isForcedRef.current, updateMsgRef.current);
      },
      onNoUpdate: () => {
        setStatus('up_to_date');
        setTimeout(() => setStatus('idle'), 3000);
      },
      onError: (err) => {
        setErrorMessage(err.message);
        setStatus('error');
      },
      onRollback: () => {
        setStatus('rollback');
        refreshState();
      },
    });
    managerRef.current = mgr;

    mgr.initialize()
      .then(() => mgr.onLaunchSuccess())
      .then(refreshState)
      .catch((e) => {
        setErrorMessage(String(e));
        setStatus('error');
      });

    return () => { mgr.stopBackgroundCheck(); };
  }, [refreshState]);

  const checkForUpdate = useCallback(async () => {
    if (!managerRef.current) return;
    setStatus('checking');
    setProgress(0);
    try {
      await managerRef.current.checkAndApplyUpdate();
      await refreshState();
    } catch (e) {
      setErrorMessage(String(e));
      setStatus('error');
    }
  }, [refreshState]);

  const installUpdate = applyAndRestart;

  const rollback = useCallback(async () => {
    if (!managerRef.current) return;
    try {
      const didRollback = await managerRef.current.rollbackToLastGood();
      if (didRollback) {
        setStatus('rollback');
        await refreshState();
        await managerRef.current.reloadApp();
      } else {
        setErrorMessage('No previous bundle to roll back to.');
        setStatus('error');
      }
    } catch (e) {
      setErrorMessage(String(e));
      setStatus('error');
    }
  }, [refreshState]);

  return {
    status,
    progress,
    currentBundle:  state?.currentBundleId  ?? null,
    pendingBundle:  state?.pendingBundleId  ?? null,
    lastGoodBundle: state?.lastGoodBundleId ?? null,
    errorMessage,
    updateMessage: updateMsg,
    isForced,
    checkForUpdate,
    installUpdate,
    rollback,
    dismissError: () => { setErrorMessage(null); setStatus('idle'); },
  };
}
