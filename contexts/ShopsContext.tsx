// Powered by OnSpace.AI
import React, { createContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { ApiService, Shop, User } from '@/services/api';
import { StorageService, OfflineRecovery } from '@/services/storage';
import { getTodayDayName } from '@/utils/format';
import {
  subscribeToNetworkChanges,
  getNetworkStatus,
  syncOfflineRecoveries,
  resetSyncLock,
  performFullSync,
  SyncResult,
} from '@/services/offlineSync';

export interface ShopsContextType {
  todayShops: Shop[];
  allShops: Shop[];
  isLoadingToday: boolean;
  isLoadingAll: boolean;
  offlineQueue: OfflineRecovery[];
  offlineQueueCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  loadTodayShops: (userId: string, allRoutesEnabled?: boolean) => Promise<void>;
  loadAllShops: (userId: string) => Promise<void>;
  addToOfflineQueue: (recovery: OfflineRecovery) => Promise<void>;
  syncOfflineQueue: () => Promise<SyncResult>;
  triggerFullSync: (userId: string, allRoutesEnabled?: boolean) => Promise<boolean>;
  setIsOnline: (v: boolean) => void;
}

export const ShopsContext = createContext<ShopsContextType | undefined>(undefined);

export function ShopsProvider({ children }: { children: ReactNode }) {
  const [todayShops, setTodayShops] = useState<Shop[]>([]);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [isLoadingToday, setIsLoadingToday] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineRecovery[]>([]);
  const [isOnline, setIsOnlineState] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  // ── Refs to avoid stale closures in event listeners ──────────────────────
  const wasOnlineRef = useRef<boolean | null>(null); // null = not yet initialized
  const currentUserIdRef = useRef<string | null>(null);
  const allRoutesEnabledRef = useRef<boolean>(false); // track allRoutesEnabled for sync refreshes
  const isSyncingRef = useRef(false); // prevents double-trigger from AppState + NetInfo

  // ─── Load offline queue ────────────────────────────────────────────────────
  const refreshOfflineQueue = useCallback(async () => {
    const queue = await StorageService.getOfflineQueue();
    setOfflineQueue(queue);
    return queue;
  }, []);

  // ─── Helper: fetch shops respecting allRoutesEnabled ──────────────────────
  const fetchShopsForUser = useCallback(async (
    userId: string,
    allRoutesEnabled: boolean,
  ): Promise<Shop[]> => {
    if (allRoutesEnabled) {
      // All routes mode: fetch ALL shops for this orderbooker
      return await ApiService.getShops({ orderbookerId: userId });
    } else {
      // Route-wise mode: fetch only today's route shops
      const todayDay = getTodayDayName();
      return await ApiService.getShops({ orderbookerId: userId, routeDay: todayDay });
    }
  }, []);

  // ─── Helper: filter out inactive shops from cached data ────────────────────
  const filterActiveShops = useCallback((shops: Shop[]): Shop[] => {
    return shops.filter((s) => s.status === 'active');
  }, []);

  // ─── Core sync executor (used by auto + manual) ───────────────────────────
  const executeSyncFlow = useCallback(async () => {
    // Prevent double execution
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    const queue = await StorageService.getOfflineQueue();

    // Nothing to sync — just refresh shops
    if (queue.length === 0) {
      isSyncingRef.current = false;
      if (currentUserIdRef.current) {
        try {
          const shops = await fetchShopsForUser(
            currentUserIdRef.current,
            allRoutesEnabledRef.current,
          );
          setTodayShops(shops);
          await StorageService.saveShops(shops);
        } catch { /* use cached */ }
      }
      return;
    }

    setIsSyncing(true);
    setSyncStatus('syncing');

    try {
      const result = await syncOfflineRecoveries();
      const updatedQueue = await refreshOfflineQueue();

      const newStatus =
        result.synced > 0 && updatedQueue.length === 0
          ? 'success'
          : result.failed > 0
          ? 'error'
          : 'idle';
      setSyncStatus(newStatus);

      const now = new Date().toISOString();
      setLastSyncTime(now);

      // Refresh shops list after sync (respecting allRoutesEnabled)
      if (currentUserIdRef.current) {
        try {
          const shops = await fetchShopsForUser(
            currentUserIdRef.current,
            allRoutesEnabledRef.current,
          );
          setTodayShops(shops);
          await StorageService.saveShops(shops);
          setLastSyncTime(new Date().toISOString());
        } catch { /* keep current list */ }
      }

      // Auto-dismiss success badge after 4s
      if (newStatus === 'success') {
        setTimeout(() => setSyncStatus('idle'), 4000);
      }
    } catch {
      setSyncStatus('error');
      resetSyncLock(); // safety: clear any stuck lock
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [refreshOfflineQueue, fetchShopsForUser]);

  // Keep ref up to date so network listener always calls latest version
  const executeSyncFlowRef = useRef(executeSyncFlow);
  useEffect(() => {
    executeSyncFlowRef.current = executeSyncFlow;
  }, [executeSyncFlow]);

  // ─── Network monitoring ────────────────────────────────────────────────────
  useEffect(() => {
    // Initial network state check
    getNetworkStatus().then((status) => {
      setIsOnlineState(status.isOnline);
      wasOnlineRef.current = status.isOnline;
    });

    StorageService.getLastSync().then((t) => setLastSyncTime(t));
    refreshOfflineQueue();

    // Network change listener — uses ref so never stale
    const unsubscribeNet = subscribeToNetworkChanges((status) => {
      const prev = wasOnlineRef.current;
      wasOnlineRef.current = status.isOnline;
      setIsOnlineState(status.isOnline);

      // Came back online (prev was false/null → now true)
      if (status.isOnline && prev === false) {
        // Small delay to let network stabilize before syncing
        setTimeout(() => executeSyncFlowRef.current(), 1500);
      }
    });

    // App foreground listener
    const appStateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const netStatus = await getNetworkStatus();
        setIsOnlineState(netStatus.isOnline);
        wasOnlineRef.current = netStatus.isOnline;

        // Feature 11: Clean expired offline entries when app comes to foreground
        const expiredCount = await StorageService.cleanExpiredOfflineQueue();
        if (expiredCount > 0) {
          console.log(`[ShopsContext] Cleaned ${expiredCount} expired offline recoveries on foreground`);
          await refreshOfflineQueue();
        }

        if (netStatus.isOnline) {
          // Check if there's a pending queue before triggering sync
          const queue = await StorageService.getOfflineQueue();
          if (queue.length > 0) {
            setTimeout(() => executeSyncFlowRef.current(), 800);
          }
        }
      }
    });

    return () => {
      unsubscribeNet();
      appStateSub.remove();
    };
  }, []); // empty deps — safe because we use refs

  // ─── Load today's shops ───────────────────────────────────────────────────
  // Route-wise by default (e.g., Sunday = Sunday shops only).
  // When allRoutesEnabled is true, fetch ALL shops grouped by route day.
  const loadTodayShops = useCallback(async (userId: string, allRoutesEnabled?: boolean) => {
    currentUserIdRef.current = userId;
    const isEnabled = allRoutesEnabled ?? false;
    allRoutesEnabledRef.current = isEnabled;
    setIsLoadingToday(true);
    try {
      const shops = await fetchShopsForUser(userId, isEnabled);
      setTodayShops(shops);
      await StorageService.saveShops(shops);
      setLastSyncTime(new Date().toISOString());
    } catch {
      const cached = await StorageService.getShops();
      const activeCached = filterActiveShops(cached);
      // If route-wise mode, filter cached shops by today's route
      if (!isEnabled) {
        const todayDay = getTodayDayName();
        setTodayShops(activeCached.filter((s) => s.routeDays.includes(todayDay)));
      } else {
        setTodayShops(activeCached);
      }
    } finally {
      setIsLoadingToday(false);
      await refreshOfflineQueue();
    }
  }, [refreshOfflineQueue, fetchShopsForUser, filterActiveShops]);

  // ─── Load all shops ───────────────────────────────────────────────────────
  const loadAllShops = useCallback(async (userId: string) => {
    setIsLoadingAll(true);
    try {
      const shops = await ApiService.getShops({ orderbookerId: userId });
      setAllShops(shops);
      await StorageService.saveShops(shops);
    } catch {
      const cached = await StorageService.getShops();
      setAllShops(cached);
    } finally {
      setIsLoadingAll(false);
    }
  }, []);

  // ─── Add recovery to offline queue ────────────────────────────────────────
  const addToOfflineQueue = useCallback(async (recovery: OfflineRecovery) => {
    await StorageService.addOfflineRecovery(recovery);
    await refreshOfflineQueue();
  }, [refreshOfflineQueue]);

  // ─── Manual sync trigger (same flow, exposed to UI) ───────────────────────
  const handleSyncOfflineQueue = useCallback(async (): Promise<SyncResult> => {
    // Reset any stale lock before manual sync
    resetSyncLock();
    isSyncingRef.current = false;

    setIsSyncing(true);
    setSyncStatus('syncing');
    try {
      const result = await syncOfflineRecoveries();
      const updatedQueue = await refreshOfflineQueue();

      const newStatus =
        result.synced > 0 && updatedQueue.length === 0
          ? 'success'
          : result.failed > 0
          ? 'error'
          : 'idle';
      setSyncStatus(newStatus);
      setLastSyncTime(new Date().toISOString());

      if (currentUserIdRef.current) {
        try {
          const shops = await fetchShopsForUser(
            currentUserIdRef.current,
            allRoutesEnabledRef.current,
          );
          setTodayShops(shops);
          await StorageService.saveShops(shops);
        } catch { /* keep current */ }
      }

      if (newStatus === 'success') {
        setTimeout(() => setSyncStatus('idle'), 4000);
      }
      return result;
    } catch {
      setSyncStatus('error');
      return { synced: 0, failed: 0, failedItems: [] };
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [refreshOfflineQueue, fetchShopsForUser]);

  // ─── Full sync (initial download on login) ────────────────────────────────
  const triggerFullSync = useCallback(async (userId: string, allRoutesEnabled?: boolean): Promise<boolean> => {
    currentUserIdRef.current = userId;
    const isEnabled = allRoutesEnabled ?? false;
    allRoutesEnabledRef.current = isEnabled;
    const ok = await performFullSync(userId);
    if (ok) {
      const cached = await StorageService.getShops();
      const activeCached = filterActiveShops(cached);
      // Apply route-wise filtering based on allRoutesEnabled
      if (isEnabled) {
        setTodayShops(activeCached);
      } else {
        const todayDay = getTodayDayName();
        setTodayShops(activeCached.filter((s) => s.routeDays.includes(todayDay)));
      }
      setAllShops(activeCached);
      const t = await StorageService.getLastSync();
      setLastSyncTime(t);
    }
    return ok;
  }, [filterActiveShops]);

  const setIsOnline = useCallback((v: boolean) => {
    const prev = wasOnlineRef.current;
    setIsOnlineState(v);
    wasOnlineRef.current = v;
    // Manual online toggle → trigger sync if coming back online
    if (v && prev === false) {
      setTimeout(() => executeSyncFlowRef.current(), 500);
    }
  }, []);

  return (
    <ShopsContext.Provider
      value={{
        todayShops,
        allShops,
        isLoadingToday,
        isLoadingAll,
        offlineQueue,
        offlineQueueCount: offlineQueue.length,
        isOnline,
        isSyncing,
        lastSyncTime,
        syncStatus,
        loadTodayShops,
        loadAllShops,
        addToOfflineQueue,
        syncOfflineQueue: handleSyncOfflineQueue,
        triggerFullSync,
        setIsOnline,
      }}
    >
      {children}
    </ShopsContext.Provider>
  );
}
