// Powered by OnSpace.AI
// Offline-First Sync Engine for Al FALAH Credit System
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { StorageService, OfflineRecovery } from './storage';
import { ApiService } from './api';

export type SyncResult = {
  synced: number;
  failed: number;
  failedItems: OfflineRecovery[];
};

export type NetworkStatus = {
  isOnline: boolean;
  isWifi: boolean;
  type: string;
};

// Module-level lock with a safety timeout so it never gets permanently stuck
let syncInProgress = false;
let syncLockTimeout: ReturnType<typeof setTimeout> | null = null;

function acquireSyncLock(): boolean {
  if (syncInProgress) return false;
  syncInProgress = true;
  // Safety: force-release lock after 30 seconds regardless
  syncLockTimeout = setTimeout(() => {
    syncInProgress = false;
  }, 30000);
  return true;
}

function releaseSyncLock() {
  syncInProgress = false;
  if (syncLockTimeout) {
    clearTimeout(syncLockTimeout);
    syncLockTimeout = null;
  }
}

/**
 * Get current network status (one-shot)
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const state = await NetInfo.fetch();
  return {
    isOnline: state.isConnected === true && state.isInternetReachable !== false,
    isWifi: state.type === 'wifi',
    type: state.type,
  };
}

/**
 * Subscribe to network changes. Returns an unsubscribe function.
 */
export function subscribeToNetworkChanges(
  callback: (status: NetworkStatus) => void
): () => void {
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    callback({
      isOnline: state.isConnected === true && state.isInternetReachable !== false,
      isWifi: state.type === 'wifi',
      type: state.type,
    });
  });
  return unsubscribe;
}

/**
 * Attempt to sync all queued offline recoveries to the server.
 * Strategy: always try one-by-one (most reliable). Batch is unreliable
 * because it requires previousBalance which we don't have offline.
 * Safe to call multiple times — prevents concurrent runs via lock.
 */
export async function syncOfflineRecoveries(): Promise<SyncResult> {
  if (!acquireSyncLock()) {
    // Already syncing — return current queue size as "pending"
    const queue = await StorageService.getOfflineQueue();
    return { synced: 0, failed: queue.length, failedItems: queue };
  }

  try {
    // Feature 11: Clean expired offline entries (>7 days old) before syncing
    const expiredCount = await StorageService.cleanExpiredOfflineQueue();
    if (expiredCount > 0) {
      console.log(`[OfflineSync] Cleaned ${expiredCount} expired offline recoveries (>7 days old)`);
    }

    const queue = await StorageService.getOfflineQueue();
    if (queue.length === 0) {
      return { synced: 0, failed: 0, failedItems: [] };
    }

    const synced: string[] = [];
    const failed: OfflineRecovery[] = [];

    // One-by-one is primary — most reliable since we don't have previousBalance for batch
    for (const item of queue) {
      try {
        // Get companyId from stored user for multi-company support
        let companyId: string | undefined;
        try {
          const user = await StorageService.getUser();
          companyId = user?.companyId || undefined;
        } catch {}

        await ApiService.submitRecovery({
          shopId: item.shopId,
          type: 'recovery',
          amount: item.amount,
          createdBy: item.createdBy,
          description: item.description,
          gpsLat: item.gpsLat,
          gpsLng: item.gpsLng,
          gpsAddress: item.gpsAddress,
          companyId,
          idempotencyKey: item.id, // Use offline item ID as idempotency key to prevent duplicates
        });
        // Also create a ShopVisit record so admin map shows the location
        if (item.gpsLat && item.gpsLng) {
          try {
            await ApiService.recordVisit(item.shopId, {
              orderbookerId: item.createdBy,
              gpsLat: item.gpsLat,
              gpsLng: item.gpsLng,
              gpsAddress: item.gpsAddress,
              inRange: true,
            });
          } catch (e) {
            console.warn('[OfflineSync] Failed to record GPS visit:', e);
          }
        }
        synced.push(item.localId);
      } catch (err: any) {
        // If the error is a business rule error (e.g. amount > balance), remove it too
        // so it doesn't block the queue forever — log for reference
        const msg: string = err?.message ?? '';
        const isPermanentError =
          msg.includes('exceeds shop balance') ||
          msg.includes('Shop not found') ||
          msg.includes('Minimum transaction') ||
          msg.includes('Maximum single');
        if (isPermanentError) {
          // Remove from queue — it will never succeed, no point retrying
          synced.push(item.localId);
        } else {
          failed.push(item);
        }
      }
    }

    if (synced.length > 0) {
      await StorageService.removeFromOfflineQueue(synced);
    }

    return { synced: synced.length, failed: failed.length, failedItems: failed };
  } finally {
    releaseSyncLock();
  }
}

/**
 * Force-reset the sync lock. Call this if UI shows stuck syncing state.
 */
export function resetSyncLock() {
  releaseSyncLock();
}

/**
 * Save shops locally for offline use (called on full sync)
 * Also updates stored user data (including allRoutesEnabled) from server
 */
export async function performFullSync(userId: string): Promise<boolean> {
  try {
    const data = await ApiService.mobileSync(userId);
    await StorageService.saveShops(data.shops);
    // Update stored user with latest allRoutesEnabled + companyId from server
    // This ensures admin toggle changes are picked up on sync
    if (data.user) {
      const existingUser = await StorageService.getUser();
      if (existingUser) {
        const updatedUser = {
          ...existingUser,
          allRoutesEnabled: data.user.allRoutesEnabled ?? existingUser.allRoutesEnabled,
          companyId: data.user.companyId ?? existingUser.companyId,
          companyName: data.user.companyName ?? existingUser.companyName,
        };
        const token = await StorageService.getToken();
        if (token) {
          await StorageService.saveUser(updatedUser, token);
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
