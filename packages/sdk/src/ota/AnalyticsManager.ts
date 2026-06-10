/**
 * AnalyticsManager — thin wrapper around OTAClient telemetry calls.
 * Queues events in AsyncStorage if offline, flushes on next network check.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OTAClient } from './OTAClient';
import type { Platform } from './types';

const QUEUE_KEY = '@ota_event_queue';

interface QueuedEvent {
  deviceId:   string;
  platform:   Platform;
  eventType:  'download' | 'install' | 'active' | 'crash' | 'rollback' | 'update_success' | 'update_fail';
  bundleId?:  string;
  status?:    'downloaded' | 'installed' | 'failed';
  errorMessage?: string;
  fatal?:     boolean;
  queuedAt:   string;
}

export class AnalyticsManager {
  constructor(private readonly client: OTAClient) {}

  async track(event: Omit<QueuedEvent, 'queuedAt'>): Promise<void> {
    const queued: QueuedEvent = { ...event, queuedAt: new Date().toISOString() };
    try {
      await this.dispatch(queued);
    } catch {
      // Offline — queue for later
      await this.enqueue(queued);
    }
  }

  /** Flush queued events (call on startup / after connectivity restored). */
  async flush(): Promise<void> {
    const queue = await this.getQueue();
    if (!queue.length) return;

    const failed: QueuedEvent[] = [];
    for (const event of queue) {
      try {
        await this.dispatch(event);
      } catch {
        failed.push(event);
      }
    }
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
  }

  private async dispatch(event: QueuedEvent): Promise<void> {
    if (event.eventType === 'crash') {
      await this.client.reportCrash({
        deviceId:     event.deviceId,
        platform:     event.platform,
        fatal:        event.fatal ?? false,
        errorMessage: event.errorMessage ?? 'Unknown error',
        bundleId:     event.bundleId,
      });
    } else if (event.status) {
      await this.client.reportInstall({
        bundleId:  event.bundleId!,
        deviceId:  event.deviceId,
        platform:  event.platform,
        status:    event.status,
        errorMessage: event.errorMessage,
      });
    }
    // For other event types (active, rollback etc.) the server-side
    // Edge Functions handle analytics insertion automatically.
  }

  private async getQueue(): Promise<QueuedEvent[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  private async enqueue(event: QueuedEvent): Promise<void> {
    const queue = await this.getQueue();
    queue.push(event);
    // Cap queue at 100 events to avoid unbounded growth
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-100)));
  }
}
