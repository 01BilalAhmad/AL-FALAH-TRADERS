// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Shop } from './api';
import { getTodayDateStr } from '@/utils/format';

const KEYS = {
  USER: 'af_user',
  TOKEN: 'af_token',
  SHOPS: 'af_shops',
  OFFLINE_QUEUE: 'af_offline_queue',
  LAST_SYNC: 'af_last_sync',
  PENDING_NOTIFICATIONS: 'af_pending_notifications',
  LAST_RECOVERY_DATES: 'af_last_recovery_dates',
  TOUR_COMPLETED: 'af_tour_completed',
  SHOP_NOTES: 'af_shop_notes',
  DAILY_TARGETS: 'af_daily_targets',
  VISIT_STREAKS: 'af_visit_streaks',
  TODAY_RECOVERY: 'af_today_recovery',
  NOTIF_COUNTS: 'af_notif_counts',
  NOTIF_SHOPS: 'af_notif_shops', // track unique shop IDs for SMS/WhatsApp
  VISITED_SHOPS: 'af_visited_shops',
  RECOVERY_SUBMITTED_SHOPS: 'af_recovery_submitted_shops',
};

export interface PendingNotification {
  id: string; // unique: shopId + timestamp
  shopId: string;
  shopName: string;
  shopPhone: string;
  area: string;
  openingBalance: number;
  recoveryAmount: number;
  remainingBalance: number;
  companyName?: string;
  orderbookerName?: string;
  distributorPhone?: string;
  createdAt: string;
  date: string; // YYYY-MM-DD for daily grouping
}

export interface OfflineRecovery {
  localId: string;
  shopId: string;
  shopName: string;
  amount: number;
  description?: string;
  gpsLat?: number;
  gpsLng?: number;
  gpsAddress?: string;
  createdBy: string;
  createdAt: string;
}

export interface ShopLastRecovery {
  shopId: string;
  lastRecoveryDate: string;
}

export interface ShopNote {
  shopId: string;
  note: string;
  updatedAt: string;
}

export interface DailyTarget {
  orderbookerId: string;
  target: number;
  month: string;
}

export interface VisitStreak {
  orderbookerId: string;
  currentStreak: number;
  lastVisitDate: string;
  longestStreak: number;
}

export const StorageService = {
  saveUser: async (user: User, token: string) => {
    await AsyncStorage.multiSet([
      [KEYS.USER, JSON.stringify(user)],
      [KEYS.TOKEN, token],
    ]);
  },

  getUser: async (): Promise<User | null> => {
    const raw = await AsyncStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  },

  getToken: async (): Promise<string | null> => {
    return AsyncStorage.getItem(KEYS.TOKEN);
  },

  clearSession: async () => {
    await AsyncStorage.multiRemove([KEYS.USER, KEYS.TOKEN]);
  },

  saveShops: async (shops: Shop[]) => {
    await AsyncStorage.setItem(KEYS.SHOPS, JSON.stringify(shops));
    await AsyncStorage.setItem(KEYS.LAST_SYNC, new Date().toISOString());
  },

  getShops: async (): Promise<Shop[]> => {
    const raw = await AsyncStorage.getItem(KEYS.SHOPS);
    return raw ? JSON.parse(raw) : [];
  },

  getLastSync: async (): Promise<string | null> => {
    return AsyncStorage.getItem(KEYS.LAST_SYNC);
  },

  addOfflineRecovery: async (recovery: OfflineRecovery) => {
    const raw = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
    const queue: OfflineRecovery[] = raw ? JSON.parse(raw) : [];
    queue.push(recovery);
    await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  },

  getOfflineQueue: async (): Promise<OfflineRecovery[]> => {
    const raw = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  },

  removeFromOfflineQueue: async (localIds: string[]) => {
    const raw = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
    const queue: OfflineRecovery[] = raw ? JSON.parse(raw) : [];
    const filtered = queue.filter((r) => !localIds.includes(r.localId));
    await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
  },

  clearOfflineQueue: async () => {
    await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify([]));
  },

  // --- Pending Notifications Tracking ---
  addPendingNotification: async (notification: PendingNotification) => {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_NOTIFICATIONS);
    const list: PendingNotification[] = raw ? JSON.parse(raw) : [];
    // Avoid duplicates by same shopId on same date
    const exists = list.some(
      (n) => n.shopId === notification.shopId && n.date === notification.date
    );
    if (!exists) {
      list.push(notification);
      await AsyncStorage.setItem(KEYS.PENDING_NOTIFICATIONS, JSON.stringify(list));
    }
  },

  getPendingNotifications: async (date?: string): Promise<PendingNotification[]> => {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_NOTIFICATIONS);
    const list: PendingNotification[] = raw ? JSON.parse(raw) : [];
    if (date) {
      // Return only today's pending notifications
      return list.filter((n) => n.date === date);
    }
    return list;
  },

  removePendingNotification: async (id: string) => {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_NOTIFICATIONS);
    const list: PendingNotification[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((n) => n.id !== id);
    await AsyncStorage.setItem(KEYS.PENDING_NOTIFICATIONS, JSON.stringify(filtered));
  },

  clearPendingNotifications: async (date?: string) => {
    if (date) {
      const raw = await AsyncStorage.getItem(KEYS.PENDING_NOTIFICATIONS);
      const list: PendingNotification[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((n) => n.date !== date);
      await AsyncStorage.setItem(KEYS.PENDING_NOTIFICATIONS, JSON.stringify(filtered));
    } else {
      await AsyncStorage.setItem(KEYS.PENDING_NOTIFICATIONS, JSON.stringify([]));
    }
  },

  // --- Offline Data Expiry (7 Day Auto-Clear) ---
  cleanExpiredOfflineQueue: async (): Promise<number> => {
    const raw = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
    const queue: OfflineRecovery[] = raw ? JSON.parse(raw) : [];
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const before = queue.length;
    const filtered = queue.filter((r) => {
      const created = new Date(r.createdAt).getTime();
      return created >= cutoff;
    });
    const removed = before - filtered.length;
    if (removed > 0) {
      await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
    }
    return removed;
  },

  // --- Recurring Recovery Reminder (Last Recovery Dates) ---
  updateLastRecoveryDate: async (shopId: string, date: string) => {
    const raw = await AsyncStorage.getItem(KEYS.LAST_RECOVERY_DATES);
    const list: ShopLastRecovery[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((e) => e.shopId === shopId);
    if (idx >= 0) {
      list[idx].lastRecoveryDate = date;
    } else {
      list.push({ shopId, lastRecoveryDate: date });
    }
    await AsyncStorage.setItem(KEYS.LAST_RECOVERY_DATES, JSON.stringify(list));
  },

  getLastRecoveryDates: async (): Promise<ShopLastRecovery[]> => {
    const raw = await AsyncStorage.getItem(KEYS.LAST_RECOVERY_DATES);
    return raw ? JSON.parse(raw) : [];
  },

  getShopsNeedingRecovery: async (minDays: number): Promise<ShopLastRecovery[]> => {
    const raw = await AsyncStorage.getItem(KEYS.LAST_RECOVERY_DATES);
    const list: ShopLastRecovery[] = raw ? JSON.parse(raw) : [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minDays);
    const cutoffStr = cutoff.toISOString();
    return list.filter((e) => e.lastRecoveryDate <= cutoffStr);
  },

  removeLastRecoveryDate: async (shopId: string) => {
    const raw = await AsyncStorage.getItem(KEYS.LAST_RECOVERY_DATES);
    const list: ShopLastRecovery[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((e) => e.shopId !== shopId);
    await AsyncStorage.setItem(KEYS.LAST_RECOVERY_DATES, JSON.stringify(filtered));
  },

  // --- App Tour / First-Time Walkthrough ---
  isTourCompleted: async (): Promise<boolean> => {
    const raw = await AsyncStorage.getItem(KEYS.TOUR_COMPLETED);
    return raw === 'true';
  },

  markTourCompleted: async () => {
    await AsyncStorage.setItem(KEYS.TOUR_COMPLETED, 'true');
  },

  // --- Shop Notes / Remarks ---
  saveShopNote: async (shopId: string, note: string) => {
    const raw = await AsyncStorage.getItem(KEYS.SHOP_NOTES);
    const notes: ShopNote[] = raw ? JSON.parse(raw) : [];
    const existingIndex = notes.findIndex((n) => n.shopId === shopId);
    const entry: ShopNote = { shopId, note, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) {
      notes[existingIndex] = entry;
    } else {
      notes.push(entry);
    }
    await AsyncStorage.setItem(KEYS.SHOP_NOTES, JSON.stringify(notes));
  },

  getShopNote: async (shopId: string): Promise<ShopNote | null> => {
    const raw = await AsyncStorage.getItem(KEYS.SHOP_NOTES);
    const notes: ShopNote[] = raw ? JSON.parse(raw) : [];
    return notes.find((n) => n.shopId === shopId) || null;
  },

  getAllShopNotes: async (): Promise<ShopNote[]> => {
    const raw = await AsyncStorage.getItem(KEYS.SHOP_NOTES);
    return raw ? JSON.parse(raw) : [];
  },

  deleteShopNote: async (shopId: string) => {
    const raw = await AsyncStorage.getItem(KEYS.SHOP_NOTES);
    const notes: ShopNote[] = raw ? JSON.parse(raw) : [];
    const filtered = notes.filter((n) => n.shopId !== shopId);
    await AsyncStorage.setItem(KEYS.SHOP_NOTES, JSON.stringify(filtered));
  },

  // --- Daily Targets ---
  saveDailyTarget: async (target: DailyTarget) => {
    const raw = await AsyncStorage.getItem(KEYS.DAILY_TARGETS);
    const targets: DailyTarget[] = raw ? JSON.parse(raw) : [];
    const existingIndex = targets.findIndex(
      (t) => t.orderbookerId === target.orderbookerId && t.month === target.month
    );
    if (existingIndex >= 0) {
      targets[existingIndex] = target;
    } else {
      targets.push(target);
    }
    await AsyncStorage.setItem(KEYS.DAILY_TARGETS, JSON.stringify(targets));
  },

  getDailyTarget: async (orderbookerId: string, month: string): Promise<DailyTarget | null> => {
    const raw = await AsyncStorage.getItem(KEYS.DAILY_TARGETS);
    const targets: DailyTarget[] = raw ? JSON.parse(raw) : [];
    return targets.find((t) => t.orderbookerId === orderbookerId && t.month === month) || null;
  },

  getDailyTargets: async (): Promise<DailyTarget[]> => {
    const raw = await AsyncStorage.getItem(KEYS.DAILY_TARGETS);
    return raw ? JSON.parse(raw) : [];
  },

  // --- Visit Streak Tracking ---
  saveVisitStreak: async (streak: VisitStreak) => {
    const raw = await AsyncStorage.getItem(KEYS.VISIT_STREAKS);
    const streaks: VisitStreak[] = raw ? JSON.parse(raw) : [];
    const idx = streaks.findIndex((s) => s.orderbookerId === streak.orderbookerId);
    if (idx >= 0) {
      streaks[idx] = streak;
    } else {
      streaks.push(streak);
    }
    await AsyncStorage.setItem(KEYS.VISIT_STREAKS, JSON.stringify(streaks));
  },

  getVisitStreak: async (orderbookerId: string): Promise<VisitStreak | null> => {
    const raw = await AsyncStorage.getItem(KEYS.VISIT_STREAKS);
    const streaks: VisitStreak[] = raw ? JSON.parse(raw) : [];
    return streaks.find((s) => s.orderbookerId === orderbookerId) ?? null;
  },

  updateVisitStreak: async (orderbookerId: string, visitedToday: boolean): Promise<VisitStreak> => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const existing = await StorageService.getVisitStreak(orderbookerId);

    if (!existing) {
      const newStreak: VisitStreak = {
        orderbookerId,
        currentStreak: visitedToday ? 1 : 0,
        lastVisitDate: visitedToday ? today : '',
        longestStreak: visitedToday ? 1 : 0,
      };
      await StorageService.saveVisitStreak(newStreak);
      return newStreak;
    }

    // Already updated today
    if (existing.lastVisitDate === today) {
      return existing;
    }

    if (visitedToday) {
      // Check if last visit was yesterday (consecutive)
      const lastVisit = new Date(existing.lastVisitDate);
      const todayDate = new Date(today);
      const diffDays = Math.round((todayDate.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));

      const newCurrentStreak = diffDays <= 1 ? existing.currentStreak + 1 : 1;
      const newLongestStreak = Math.max(existing.longestStreak, newCurrentStreak);

      const updated: VisitStreak = {
        ...existing,
        currentStreak: newCurrentStreak,
        lastVisitDate: today,
        longestStreak: newLongestStreak,
      };
      await StorageService.saveVisitStreak(updated);
      return updated;
    } else {
      // Not visited today — check if streak should be broken
      const lastVisit = new Date(existing.lastVisitDate);
      const todayDate = new Date(today);
      const diffDays = Math.round((todayDate.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays > 1) {
        // Streak broken — reset
        const updated: VisitStreak = {
          ...existing,
          currentStreak: 0,
        };
        await StorageService.saveVisitStreak(updated);
        return updated;
      }
      return existing;
    }
  },

  // --- Today's Recovery Cache (persists across page refreshes) ---
  saveTodayRecovery: async (amount: number) => {
    const entry = { date: getTodayDateStr(), amount };
    await AsyncStorage.setItem(KEYS.TODAY_RECOVERY, JSON.stringify(entry));
  },

  getTodayRecovery: async (): Promise<number> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.TODAY_RECOVERY);
      if (!raw) return 0;
      const entry = JSON.parse(raw);
      // Only return cached value if it's from today
      return entry.date === getTodayDateStr() ? entry.amount : 0;
    } catch {
      return 0;
    }
  },

  // --- Notification Counts (SMS/WhatsApp sent today) ---
  getNotifCounts: async (): Promise<{ sms: number; whatsapp: number }> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.NOTIF_COUNTS);
      if (!raw) return { sms: 0, whatsapp: 0 };
      const entry = JSON.parse(raw);
      // Only return if from today, otherwise reset
      return entry.date === getTodayDateStr()
        ? { sms: entry.sms || 0, whatsapp: entry.whatsapp || 0 }
        : { sms: 0, whatsapp: 0 };
    } catch {
      return { sms: 0, whatsapp: 0 };
    }
  },

  incrementNotifCount: async (method: 'sms' | 'whatsapp', shopId?: string): Promise<{ sms: number; whatsapp: number }> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.NOTIF_COUNTS);
      const shopsRaw = await AsyncStorage.getItem(KEYS.NOTIF_SHOPS);
      let entry: { date: string; sms: number; whatsapp: number };
      let shopsEntry: { date: string; smsShops: string[]; whatsappShops: string[] };

      if (!raw) {
        entry = { date: getTodayDateStr(), sms: 0, whatsapp: 0 };
      } else {
        entry = JSON.parse(raw);
        if (entry.date !== getTodayDateStr()) {
          entry = { date: getTodayDateStr(), sms: 0, whatsapp: 0 };
        }
      }

      if (!shopsRaw) {
        shopsEntry = { date: getTodayDateStr(), smsShops: [], whatsappShops: [] };
      } else {
        shopsEntry = JSON.parse(shopsRaw);
        if (shopsEntry.date !== getTodayDateStr()) {
          shopsEntry = { date: getTodayDateStr(), smsShops: [], whatsappShops: [] };
        }
      }

      // Only increment count if this shop hasn't been counted before for this method
      if (shopId) {
        const shopKey = method === 'sms' ? 'smsShops' : 'whatsappShops';
        if (!shopsEntry[shopKey].includes(shopId)) {
          shopsEntry[shopKey].push(shopId);
          entry[method] = (entry[method] || 0) + 1;
        }
      } else {
        // Fallback: no shopId, just increment
        entry[method] = (entry[method] || 0) + 1;
      }

      await AsyncStorage.setItem(KEYS.NOTIF_COUNTS, JSON.stringify(entry));
      await AsyncStorage.setItem(KEYS.NOTIF_SHOPS, JSON.stringify(shopsEntry));
      return { sms: entry.sms, whatsapp: entry.whatsapp };
    } catch {
      return { sms: 0, whatsapp: 0 };
    }
  },

  // --- Visited Shops (persists across page refreshes, resets daily) ---
  saveVisitedShops: async (shopIds: string[]) => {
    const entry = { date: getTodayDateStr(), shopIds };
    await AsyncStorage.setItem(KEYS.VISITED_SHOPS, JSON.stringify(entry));
  },

  getVisitedShops: async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.VISITED_SHOPS);
      if (!raw) return [];
      const entry = JSON.parse(raw);
      // Only return if from today, otherwise reset
      return entry.date === getTodayDateStr() ? entry.shopIds || [] : [];
    } catch {
      return [];
    }
  },

  addVisitedShop: async (shopId: string) => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.VISITED_SHOPS);
      let entry: { date: string; shopIds: string[] };
      if (!raw) {
        entry = { date: getTodayDateStr(), shopIds: [] };
      } else {
        entry = JSON.parse(raw);
        if (entry.date !== getTodayDateStr()) {
          entry = { date: getTodayDateStr(), shopIds: [] };
        }
      }
      if (!entry.shopIds.includes(shopId)) {
        entry.shopIds.push(shopId);
        await AsyncStorage.setItem(KEYS.VISITED_SHOPS, JSON.stringify(entry));
      }
    } catch { /* non-critical */ }
  },

  // --- Recovery Submitted Shops (duplicate prevention - persists daily) ---
  saveRecoverySubmittedShops: async (shopIds: string[]) => {
    const entry = { date: getTodayDateStr(), shopIds };
    await AsyncStorage.setItem(KEYS.RECOVERY_SUBMITTED_SHOPS, JSON.stringify(entry));
  },

  getRecoverySubmittedShops: async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.RECOVERY_SUBMITTED_SHOPS);
      if (!raw) return [];
      const entry = JSON.parse(raw);
      // Only return if from today, otherwise reset
      return entry.date === getTodayDateStr() ? entry.shopIds || [] : [];
    } catch {
      return [];
    }
  },

  addRecoverySubmittedShop: async (shopId: string) => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.RECOVERY_SUBMITTED_SHOPS);
      let entry: { date: string; shopIds: string[] };
      if (!raw) {
        entry = { date: getTodayDateStr(), shopIds: [] };
      } else {
        entry = JSON.parse(raw);
        if (entry.date !== getTodayDateStr()) {
          entry = { date: getTodayDateStr(), shopIds: [] };
        }
      }
      if (!entry.shopIds.includes(shopId)) {
        entry.shopIds.push(shopId);
        await AsyncStorage.setItem(KEYS.RECOVERY_SUBMITTED_SHOPS, JSON.stringify(entry));
      }
    } catch { /* non-critical */ }
  },

  removeRecoverySubmittedShop: async (shopId: string) => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.RECOVERY_SUBMITTED_SHOPS);
      if (!raw) return;
      const entry = JSON.parse(raw);
      if (entry.date !== getTodayDateStr()) return;
      entry.shopIds = entry.shopIds.filter((id: string) => id !== shopId);
      await AsyncStorage.setItem(KEYS.RECOVERY_SUBMITTED_SHOPS, JSON.stringify(entry));
    } catch { /* non-critical */ }
  },
};
