// Al FALAH Credit System
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TextInput,
  Pressable,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useShops } from '@/hooks/useShops';
import { ApiService, Shop } from '@/services/api';
import { getShopDisplayBalance } from '@/components/ui/ShopCard';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { ROUTE_DAYS, DAY_LABELS } from '@/constants/config';
import { getTodayDayName, getTodayLabel, getTodayDateStr, capitalize, formatPKR } from '@/utils/format';
import { ShopCard } from '@/components/ui/ShopCard';
import { RecoveryBottomSheet } from '@/components/ui/RecoveryBottomSheet';
import { GpsVisitBottomSheet } from '@/components/ui/GpsVisitBottomSheet';
import { ShopDetailModal } from '@/components/ui/ShopDetailModal';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { PendingCreditAlert } from '@/components/ui/PendingCreditAlert';
import { VisitStreakCounter } from '@/components/ui/VisitStreakCounter';
import { PerformanceChart } from '@/components/ui/PerformanceChart';
import { RecoveryAnalysisChart } from '@/components/ui/RecoveryAnalysisChart';
import { NotificationChoice, NotificationMethod } from '@/components/ui/NotificationChoice';
import { DailyReportCard } from '@/components/ui/DailyReportCard';
import { PendingMessagesSheet } from '@/components/ui/PendingMessagesSheet';
import { DailyTargetProgress } from '@/components/ui/DailyTargetProgress';
import { StorageService, PendingNotification, OfflineRecovery } from '@/services/storage';
import { RecoveryReminder } from '@/components/ui/RecoveryReminder';
import { AppTour } from '@/components/ui/AppTour';
import { PhoneInputModal } from '@/components/ui/PhoneInputModal';

type ChartView = 'trend' | 'analysis' | 'none';

// ── Section item types for grouped FlatList ──────────────────────────────────
type SectionItem =
  | { type: 'header'; dayKey: string; dayLabel: string; shopCount: number; isToday: boolean }
  | { type: 'shop'; shop: Shop; dayKey: string };

export default function TodayRouteScreen() {
  const insets = useSafeAreaInsets();
  const { user, distributorPhone } = useAuth();
  const {
    todayShops,
    allShops,
    isLoadingToday,
    offlineQueueCount,
    isOnline,
    isSyncing,
    syncStatus,
    lastSyncTime,
    loadTodayShops,
    loadAllShops,
    addToOfflineQueue,
    syncOfflineQueue,
  } = useShops();

  const [recoveryShop, setRecoveryShop] = useState<Shop | null>(null);
  const [detailShop, setDetailShop] = useState<Shop | null>(null);
  const [gpsVisitShop, setGpsVisitShop] = useState<Shop | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successState, setSuccessState] = useState<{
    visible: boolean;
    shopName: string;
    amount: number;
    isOffline: boolean;
  }>({ visible: false, shopName: '', amount: 0, isOffline: false });
  const [notifChoice, setNotifChoice] = useState<{
    visible: boolean;
    shopId: string;
    shopPhone: string;
    shopName: string;
    shopAddress?: string;
    shopOwnerName?: string;
    openingBalance: number;
    recoveryAmount: number;
    remainingBalance: number;
    companyName?: string;
    orderbookerName?: string;
    distributorPhone?: string;
  }>({ visible: false, shopId: '', shopPhone: '', shopName: '', openingBalance: 0, recoveryAmount: 0, remainingBalance: 0 });
  const [visitedShopIds, setVisitedShopIds] = useState<Set<string>>(new Set());
  const [todayRecovery, setTodayRecovery] = useState(0);
  const [recoverySubmittedShopIds, setRecoverySubmittedShopIds] = useState<Set<string>>(new Set());
  const [phoneInputShop, setPhoneInputShop] = useState<Shop | null>(null);
  const [pendingNotifAfterSuccess, setPendingNotifAfterSuccess] = useState<{
    shopId: string;
    shopPhone: string;
    shopName: string;
    shopAddress?: string;
    shopOwnerName?: string;
    openingBalance: number;
    recoveryAmount: number;
    remainingBalance: number;
    companyName?: string;
    orderbookerName?: string;
    distributorPhone?: string;
  } | null>(null);

  // Load cached todayRecovery on mount so it doesn't show 0 after refresh
  useEffect(() => {
    StorageService.getTodayRecovery().then((cached) => {
      if (cached > 0) setTodayRecovery(cached);
    });
    // Load cached visited shops so they persist across app refreshes
    StorageService.getVisitedShops().then((cached) => {
      if (cached.length > 0) setVisitedShopIds(new Set(cached));
    });
    // Load cached recovery submitted shops for duplicate prevention
    StorageService.getRecoverySubmittedShops().then((cached) => {
      if (cached.length > 0) setRecoverySubmittedShopIds(new Set(cached));
    });
    // Load cached notification counts so they persist across app refreshes
    StorageService.getNotifCounts().then((counts) => {
      if (counts.sms > 0) setSmsSentCount(counts.sms);
      if (counts.whatsapp > 0) setWhatsappSentCount(counts.whatsapp);
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [chartView, setChartView] = useState<ChartView>('none');
  const [smsSentCount, setSmsSentCount] = useState(0);
  const [whatsappSentCount, setWhatsappSentCount] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState<PendingNotification[]>([]);

  // Feature 12: Undo tracking
  const [lastRecoveryInfo, setLastRecoveryInfo] = useState<{
    shopId: string;
    amount: number;
    isOffline: boolean;
    transactionId?: string;
    localId?: string;
  } | null>(null);

  // Feature 14: Tour state
  const [showTour, setShowTour] = useState(false);

  const todayDay = getTodayDayName();
  const isFriday = todayDay === 'friday';
  // Route-wise by default (Sunday = Sunday shops only).
  // Admin can enable "All Routes Access" from website to show all days' shops.
  const allRoutesEnabled = user?.allRoutesEnabled ?? false;

  // Feature 14: Check if tour has been completed on mount
  useEffect(() => {
    if (user) {
      StorageService.isTourCompleted().then((completed) => {
        if (!completed) setShowTour(true);
      });
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTodayShops(user.id, allRoutesEnabled);
      loadAllShops(user.id);
      loadTodayStats();
      loadPendingNotifications();
    }
  }, [user, allRoutesEnabled]);

  async function loadPendingNotifications() {
    try {
      const today = getTodayDateStr();
      const list = await StorageService.getPendingNotifications(today);
      setPendingNotifications(list);
    } catch { /* not critical */ }
  }

  async function loadTodayStats() {
    if (!user) return;
    try {
      const res = await ApiService.getRecoverySummary(getTodayDateStr());
      const myEntry = res.orderbookers.find((ob) => ob.orderbookerId === user.id);
      if (myEntry) {
        setTodayRecovery(myEntry.totalRecovery);
        StorageService.saveTodayRecovery(myEntry.totalRecovery);
        const visited = new Set(
          myEntry.shops.filter((s) => s.visited).map((s) => s.shopId)
        );
        // Merge API visited with locally tracked visited (local takes precedence)
        setVisitedShopIds((prev) => {
          const merged = new Set([...prev, ...visited]);
          StorageService.saveVisitedShops([...merged]);
          return merged;
        });
      }
      // If myEntry not found, don't reset — keep cached value
    } catch {
      // API failed — keep cached value, don't reset to 0
      console.warn('[loadTodayStats] Failed to fetch, using cached value');
    }
  }

  const handleRefresh = useCallback(async () => {
    if (user) {
      await loadTodayShops(user.id, allRoutesEnabled);
      await loadAllShops(user.id);
      await loadTodayStats();
    }
  }, [user, allRoutesEnabled]);

  const handleSync = async () => {
    if (offlineQueueCount === 0) return;
    const result = await syncOfflineQueue();
    if (result.synced > 0) {
      Alert.alert('Sync Complete', `${result.synced} ${result.synced === 1 ? 'recovery' : 'recoveries'} synced successfully.`);
      handleRefresh();
    } else if (result.failed > 0) {
      Alert.alert('Sync Failed', 'Could not sync recoveries. Please try again.');
    }
  };

  const handleSubmitRecovery = async (payload: {
    amount: number;
    description: string;
    gpsLat?: number;
    gpsLng?: number;
    gpsAddress?: string;
    markGpsVisit: boolean;
    outOfRange?: boolean;
  }) => {
    if (!recoveryShop || !user) return;
    // Duplicate recovery prevention - check if recovery already submitted for this shop today
    if (recoverySubmittedShopIds.has(recoveryShop.id)) {
      Alert.alert('Already Recovered', `Recovery for ${recoveryShop.name} has already been submitted today. You cannot submit duplicate recovery.`);
      return;
    }
    setIsSubmitting(true);
    const shopName = recoveryShop.name;
    const shopId = recoveryShop.id;
    const shopPhone = recoveryShop.phone;
    const openingBalance = recoveryShop.balance;
    // Generate idempotency key to prevent duplicate submissions
    const idempotencyKey = `${shopId}_${user.id}_${payload.amount}_${Date.now()}`;
    try {
      if (isOnline) {
        const result = await ApiService.submitRecovery({
          shopId,
          type: 'recovery',
          amount: payload.amount,
          createdBy: user.id,
          description: payload.description || undefined,
          gpsLat: payload.gpsLat,
          gpsLng: payload.gpsLng,
          gpsAddress: payload.gpsAddress,
          outOfRange: payload.outOfRange,
          companyId: user.companyId || undefined,
          idempotencyKey,
        });
        setVisitedShopIds((prev) => new Set([...prev, shopId]));
        StorageService.addVisitedShop(shopId);
        // Mark shop as recovery submitted (duplicate prevention)
        setRecoverySubmittedShopIds((prev) => new Set([...prev, shopId]));
        StorageService.addRecoverySubmittedShop(shopId);
        setTodayRecovery((prev) => {
          const newTotal = prev + payload.amount;
          StorageService.saveTodayRecovery(newTotal);
          return newTotal;
        });
        // Also create a ShopVisit record so admin map can show the location
        if (payload.markGpsVisit && payload.gpsLat && payload.gpsLng) {
          try {
            await ApiService.recordVisit(shopId, {
              orderbookerId: user.id,
              gpsLat: payload.gpsLat,
              gpsLng: payload.gpsLng,
              gpsAddress: payload.gpsAddress,
              inRange: !payload.outOfRange,
            });
          } catch (e) {
            console.warn('Failed to record GPS visit from recovery:', e);
          }
        }
        // Feature 12: Track last recovery for undo
        setLastRecoveryInfo({ shopId, amount: payload.amount, isOffline: false, transactionId: result.id });
        // Feature 13: Update last recovery date
        StorageService.updateLastRecoveryDate(shopId, new Date().toISOString());
        setSuccessState({ visible: true, shopName, amount: payload.amount, isOffline: false });

        if (shopPhone) {
          const remainingBalance = openingBalance - payload.amount;
          const pendingNotif: PendingNotification = {
            id: `${shopId}_${Date.now()}`,
            shopId,
            shopName,
            shopPhone,
            area: recoveryShop.area,
            openingBalance,
            recoveryAmount: payload.amount,
            remainingBalance,
            companyName: user.companyName || undefined,
            orderbookerName: user.name || undefined,
            distributorPhone: distributorPhone || undefined,
            createdAt: new Date().toISOString(),
            date: getTodayDateStr(),
          };
          await StorageService.addPendingNotification(pendingNotif);
          loadPendingNotifications();

          // Store pending notification data — will be shown when SuccessOverlay dismisses
          // This is more reliable than setTimeout which can be interrupted
          setPendingNotifAfterSuccess({
            shopId,
            shopPhone,
            shopName,
            shopAddress: recoveryShop.address || recoveryShop.area || undefined,
            shopOwnerName: recoveryShop.ownerName || undefined,
            openingBalance,
            recoveryAmount: payload.amount,
            remainingBalance,
            companyName: user.companyName || undefined,
            orderbookerName: user.name || undefined,
            distributorPhone: distributorPhone || undefined,
          });

          // Fallback timeout in case SuccessOverlay doesn't dismiss properly
          // This ensures the SMS popup always shows even if overlay has issues
          setTimeout(() => {
            setNotifChoice((prev) => {
              // Only set if not already visible (avoid double-show)
              if (prev.visible) return prev;
              return {
                visible: true,
                shopId: shopId,
                shopPhone,
                shopName,
                shopAddress: recoveryShop.address || recoveryShop.area || undefined,
                shopOwnerName: recoveryShop.ownerName || undefined,
                openingBalance,
                recoveryAmount: payload.amount,
                remainingBalance,
                companyName: user.companyName || undefined,
                orderbookerName: user.name || undefined,
                distributorPhone: distributorPhone || undefined,
              };
            });
            setPendingNotifAfterSuccess(null);
          }, 4000);
        } else {
          // No phone number — show phone input popup to add number
          // After saving, NotificationChoice will be shown automatically
          setPhoneInputShop(recoveryShop);
        }
      } else {
        const localId = `local_${Date.now()}`;
        await addToOfflineQueue({
          localId,
          shopId,
          shopName,
          amount: payload.amount,
          description: payload.description,
          gpsLat: payload.gpsLat,
          gpsLng: payload.gpsLng,
          gpsAddress: payload.gpsAddress,
          createdBy: user.id,
          createdAt: new Date().toISOString(),
        });
        if (payload.markGpsVisit) {
          setVisitedShopIds((prev) => new Set([...prev, shopId]));
          StorageService.addVisitedShop(shopId);
        }
        // Mark shop as recovery submitted (duplicate prevention) for offline too
        setRecoverySubmittedShopIds((prev) => new Set([...prev, shopId]));
        StorageService.addRecoverySubmittedShop(shopId);
        // Increment todayRecovery for offline recoveries too
        setTodayRecovery((prev) => {
          const newTotal = prev + payload.amount;
          StorageService.saveTodayRecovery(newTotal);
          return newTotal;
        });
        // Feature 12: Track last offline recovery for undo
        setLastRecoveryInfo({ shopId, amount: payload.amount, isOffline: true, localId });
        // Feature 13: Update last recovery date
        StorageService.updateLastRecoveryDate(shopId, new Date().toISOString());
        setSuccessState({ visible: true, shopName, amount: payload.amount, isOffline: true });
      }
      setRecoveryShop(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit recovery. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGpsVisitMarked = async (shopId: string, gpsLat: number, gpsLng: number, address: string) => {
    setVisitedShopIds((prev) => new Set([...prev, shopId]));
    StorageService.addVisitedShop(shopId);
    // Create a ShopVisit record on the server so admin map can show the location
    if (user && isOnline) {
      try {
        await ApiService.recordVisit(shopId, {
          orderbookerId: user.id,
          gpsLat,
          gpsLng,
          gpsAddress: address,
          inRange: true,
        });
      } catch (e) {
        console.warn('Failed to record GPS visit on server:', e);
      }
    }
  };

  // Feature 12: Undo last recovery
  const handleUndoRecovery = useCallback(async () => {
    if (!lastRecoveryInfo) return;
    const { shopId, amount, isOffline, transactionId, localId } = lastRecoveryInfo;

    try {
      // Reverse the local state
      setTodayRecovery((prev) => {
        const newTotal = Math.max(0, prev - amount);
        StorageService.saveTodayRecovery(newTotal);
        return newTotal;
      });
      setVisitedShopIds((prev) => {
        const next = new Set(prev);
        next.delete(shopId);
        StorageService.saveVisitedShops([...next]);
        return next;
      });
      // Remove from recovery submitted (undo means no longer submitted)
      setRecoverySubmittedShopIds((prev) => {
        const next = new Set(prev);
        next.delete(shopId);
        StorageService.removeRecoverySubmittedShop(shopId);
        return next;
      });

      if (isOffline && localId) {
        // Remove from offline queue
        await StorageService.removeFromOfflineQueue([localId]);
      } else if (!isOffline && transactionId) {
        // Delete the online transaction via API
        try {
          await ApiService.deleteTransaction(transactionId);
        } catch {
          // If API delete fails, still reverse local state
          console.warn('[Undo] Failed to delete transaction on server');
        }
      }

      // Feature 13: Remove last recovery date for this shop
      await StorageService.removeLastRecoveryDate(shopId);

      setLastRecoveryInfo(null);
      setSuccessState((s) => ({ ...s, visible: false }));
    } catch {
      Alert.alert('Undo Failed', 'Could not reverse the recovery. Please try again.');
    }
  }, [lastRecoveryInfo]);

  // Feature 14: Tour complete handler
  const handleTourComplete = useCallback(async () => {
    await StorageService.markTourCompleted();
    setShowTour(false);
  }, []);

  // Handle phone number saved from PhoneInputModal → show NotificationChoice
  const handlePhoneSaved = useCallback((savedPhone: string, savedOwnerName?: string) => {
    if (!phoneInputShop || !user) return;
    const shopName = phoneInputShop.name;
    const shopId = phoneInputShop.id;
    const openingBalance = phoneInputShop.balance;

    // Find the last recovery amount for this shop
    const remainingBalance = openingBalance - (lastRecoveryInfo?.shopId === shopId ? lastRecoveryInfo.amount : 0);
    const recoveryAmount = lastRecoveryInfo?.shopId === shopId ? lastRecoveryInfo.amount : 0;

    // Use saved owner name if provided, otherwise fall back to shop's existing ownerName
    const ownerName = savedOwnerName || phoneInputShop.ownerName || undefined;

    // Create pending notification with the new phone number
    const pendingNotif: PendingNotification = {
      id: `${shopId}_${Date.now()}`,
      shopId,
      shopName,
      shopPhone: savedPhone,
      area: phoneInputShop.area,
      openingBalance,
      recoveryAmount,
      remainingBalance,
      companyName: user.companyName || undefined,
      orderbookerName: user.name || undefined,
      distributorPhone: distributorPhone || undefined,
      createdAt: new Date().toISOString(),
      date: getTodayDateStr(),
    };
    StorageService.addPendingNotification(pendingNotif);
    loadPendingNotifications();

    // Close phone input modal and show notification choice
    setPhoneInputShop(null);
    setNotifChoice({
      visible: true,
      shopId: phoneInputShop?.id || '',
      shopPhone: savedPhone,
      shopName,
      shopAddress: phoneInputShop.address || phoneInputShop.area || undefined,
      shopOwnerName: ownerName,
      openingBalance,
      recoveryAmount,
      remainingBalance,
      companyName: user.companyName || undefined,
      orderbookerName: user.name || undefined,
      distributorPhone: distributorPhone || undefined,
    });
  }, [phoneInputShop, user, lastRecoveryInfo, distributorPhone]);

  // Feature 13: Handle reminder shop press
  const handleReminderShopPress = useCallback((shopId: string) => {
    const shop = todayShops.find((s) => s.id === shopId);
    if (shop) {
      setRecoveryShop(shop);
    } else {
      const allShop = allShops.find((s) => s.id === shopId);
      if (allShop) setDetailShop(allShop);
    }
  }, [todayShops, allShops]);

  // Open recovery sheet with duplicate check
  const handleOpenRecovery = useCallback((shop: Shop) => {
    if (recoverySubmittedShopIds.has(shop.id)) {
      Alert.alert('Already Recovered', `Recovery for ${shop.name} has already been submitted today. You cannot submit duplicate recovery.`);
      return;
    }
    setRecoveryShop(shop);
  }, [recoverySubmittedShopIds]);

  // ── Filtered shops (search) ──────────────────────────────────────────────
  const filteredShops = useMemo(() => {
    if (!searchQuery.trim()) return todayShops;
    const q = searchQuery.toLowerCase();
    return todayShops.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.area.toLowerCase().includes(q) ||
        s.ownerName.toLowerCase().includes(q)
    );
  }, [todayShops, searchQuery]);

  // ── Group shops by day for all-routes mode ───────────────────────────────
  const groupedSections = useMemo(() => {
    if (!allRoutesEnabled) return null;

    // Group filtered shops by routeDays — each shop appears ONLY ONCE under its primary day
    // (prefer today's route, otherwise first day in its routeDays array)
    const groups: Record<string, Shop[]> = {};
    const assignedShops = new Set<string>();

    for (const shop of filteredShops) {
      if (assignedShops.has(shop.id)) continue; // skip if already placed

      const days = shop.routeDays.length > 0 ? shop.routeDays : ['other'];
      // Prefer today's route if the shop has it, otherwise use first day
      const primaryDay = days.includes(todayDay) ? todayDay : days[0];

      if (!groups[primaryDay]) groups[primaryDay] = [];
      groups[primaryDay].push(shop);
      assignedShops.add(shop.id);
    }

    // Sort: today's route FIRST, then other days by ROUTE_DAYS order
    const sortedDays = Object.keys(groups).sort((a, b) => {
      // Today's route always comes first
      if (a === todayDay && b !== todayDay) return -1;
      if (b === todayDay && a !== todayDay) return 1;
      const idxA = ROUTE_DAYS.indexOf(a);
      const idxB = ROUTE_DAYS.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    // Build section items for FlatList
    const items: SectionItem[] = [];
    for (const dayKey of sortedDays) {
      const dayShops = groups[dayKey];
      const isToday = dayKey === todayDay;
      items.push({
        type: 'header',
        dayKey,
        dayLabel: DAY_LABELS[dayKey] || capitalize(dayKey),
        shopCount: dayShops.length,
        isToday,
      });
      for (const shop of dayShops) {
        items.push({ type: 'shop', shop, dayKey });
      }
    }
    return items;
  }, [filteredShops, allRoutesEnabled, todayDay]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalOutstanding = todayShops.reduce((sum, s) => sum + getShopDisplayBalance(s, user?.companyId).balance, 0);
  const visitedCount = visitedShopIds.size;
  const progressPct = todayShops.length > 0 ? (visitedCount / todayShops.length) * 100 : 0;

  // ── Determine if Friday should show holiday screen ───────────────────────
  // Only show holiday if NOT allRoutesEnabled. If allRoutesEnabled, show shops even on Friday.
  const showFridayHoliday = isFriday && !allRoutesEnabled;

  // ── Hero badge label ─────────────────────────────────────────────────────
  const routeBadgeLabel = allRoutesEnabled ? 'All Routes' : capitalize(todayDay);
  const routeBadgeIcon: React.ComponentProps<typeof MaterialIcons>['name'] = allRoutesEnabled ? 'map' : 'route';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner
        isOnline={isOnline}
        queueCount={offlineQueueCount}
        isSyncing={isSyncing}
        syncStatus={syncStatus}
        lastSyncTime={lastSyncTime}
        onSync={handleSync}
      />

      <PendingCreditAlert orderbookerId={user?.id} />

      {showFridayHoliday ? (
        <View style={styles.holidayContainer}>
          <LinearGradient colors={['#FEF3C7', '#FFFBEB']} style={styles.holidayGradient}>
            <MaterialIcons name="wb-sunny" size={64} color={Colors.secondary} />
            <Text style={styles.holidayTitle}>Friday — Day Off</Text>
            <Text style={styles.holidaySubtitle}>No route scheduled today. Enjoy your day!</Text>
          </LinearGradient>
        </View>
      ) : allRoutesEnabled && groupedSections ? (
        /* ── ALL ROUTES MODE: Day-wise grouped sections ─────────────────── */
        <FlatList
          data={groupedSections}
          keyExtractor={(item, idx) =>
            item.type === 'header' ? `header_${item.dayKey}` : `shop_${item.shop.id}_${item.dayKey}`
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingToday}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListHeaderComponent={
            <View>
              {/* Hero Card - All Routes */}
              <LinearGradient
                colors={['#2563EB', '#1E40AF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <View style={styles.heroBubble1} />
                <View style={styles.heroBubble2} />

                <View style={styles.heroTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroGreeting} numberOfLines={1}>
                      Hello, {user ? user.name.split(' ')[0] : 'Order Booker'} 👋
                    </Text>
                    <Text style={styles.heroDate}>{getTodayLabel()}</Text>
                  </View>
                </View>

                {/* Visit Streak Counter */}
                {user ? (
                  <VisitStreakCounter orderbookerId={user.id} visitedCount={visitedCount} />
                ) : null}

                {/* Badges */}
                <View style={styles.badgesRow}>
                  <View style={[styles.heroDayBadge, styles.allRoutesBadge]}>
                    <MaterialIcons name={routeBadgeIcon} size={13} color="rgba(255,255,255,0.95)" />
                    <Text style={styles.badgeText}>{routeBadgeLabel}</Text>
                  </View>
                  <Pressable style={styles.reportBadge} onPress={() => setShowReport(true)} hitSlop={8}>
                    <MaterialIcons name="assessment" size={13} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.badgeText}>Report</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.pendingBadge,
                      pendingNotifications.length > 0 && styles.pendingBadgeActive,
                    ]}
                    onPress={() => setShowPending(true)}
                    hitSlop={8}
                  >
                    <MaterialIcons name="pending-actions" size={13} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.badgeText}>Pending</Text>
                    {pendingNotifications.length > 0 ? (
                      <View style={styles.pendingCountDot}>
                        <Text style={styles.pendingCountText}>{pendingNotifications.length}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>

                {/* Progress Bar - All Routes */}
                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>
                      {visitedCount} of {todayShops.length} shops visited (all routes)
                    </Text>
                    <Text style={styles.progressPct}>{Math.round(progressPct)}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${Math.min(progressPct, 100)}%` }]}
                    />
                  </View>
                </View>

                {/* Stat Pills */}
                <View style={styles.pillsRow}>
                  <View style={styles.pill}>
                    <Text style={styles.pillValue}>{todayShops.length}</Text>
                    <Text style={styles.pillLabel}>Shops</Text>
                  </View>
                  <View style={styles.pillDivider} />
                  <View style={styles.pill}>
                    <Text style={styles.pillValue}>
                      {formatPKR(totalOutstanding)}
                    </Text>
                    <Text style={styles.pillLabel}>Outstanding</Text>
                  </View>
                  <View style={styles.pillDivider} />
                  <View style={styles.pill}>
                    <Text style={[styles.pillValue, styles.pillGreen]}>
                      {formatPKR(todayRecovery)}
                    </Text>
                    <Text style={styles.pillLabel}>Recovered</Text>
                  </View>
                </View>
              </LinearGradient>


              {/* Daily Target Progress */}
              <DailyTargetProgress todayRecovery={todayRecovery} />

              {/* Chart Toggle */}
              <View style={styles.chartToggleRow}>
                {(
                  [
                    { key: 'trend' as ChartView, icon: 'show-chart', label: 'Trend' },
                    { key: 'analysis' as ChartView, icon: 'analytics', label: 'Analysis' },
                    { key: 'none' as ChartView, icon: 'visibility-off', label: 'Hide' },
                  ]
                ).map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.chartTabBtn,
                      chartView === opt.key && styles.chartTabBtnActive,
                    ]}
                    onPress={() => setChartView(opt.key)}
                    hitSlop={4}
                  >
                    <MaterialIcons
                      name={opt.icon as any}
                      size={13}
                      color={chartView === opt.key ? Colors.primaryDark : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.chartTabLabel,
                        chartView === opt.key && styles.chartTabLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {chartView === 'trend' && user ? (
                <View style={styles.chartWrap}>
                  <PerformanceChart userId={user.id} />
                </View>
              ) : chartView === 'analysis' && user ? (
                <View style={styles.chartWrap}>
                  <RecoveryAnalysisChart userId={user.id} />
                </View>
              ) : null}

              {/* Search Bar */}
              <View style={styles.searchRow}>
                <MaterialIcons name="search" size={18} color={Colors.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search shops, areas..."
                  placeholderTextColor={Colors.textMuted}
                />
                {searchQuery ? (
                  <Pressable
                    onPress={() => setSearchQuery('')}
                    hitSlop={8}
                    style={styles.searchClear}
                  >
                    <MaterialIcons name="cancel" size={16} color={Colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {/* All Routes indicator */}
              <View style={styles.shopCountRow}>
                <View style={styles.shopCountLeft}>
                  <View style={[styles.shopCountDot, { backgroundColor: Colors.blue }]} />
                  <Text style={styles.shopCountText}>
                    {filteredShops.length} {filteredShops.length === 1 ? 'shop' : 'shops'} across all routes
                  </Text>
                </View>
                {visitedCount > 0 ? (
                  <View style={styles.visitedChip}>
                    <MaterialIcons name="check-circle" size={12} color={Colors.primary} />
                    <Text style={styles.visitedChipText}>{visitedCount} visited</Text>
                  </View>
                ) : null}
              </View>

              {/* Feature 13: Recovery Reminder */}
              <RecoveryReminder
                shops={allShops.length > 0 ? allShops : todayShops}
                onShopPress={handleReminderShopPress}
              />
            </View>
          }
          ListEmptyComponent={
            !isLoadingToday ? (
              <View style={styles.emptyContainer}>
                <LinearGradient
                  colors={[Colors.primaryLight, Colors.background]}
                  style={styles.emptyGradient}
                >
                  <MaterialIcons name="store-mall-directory" size={56} color={Colors.primary} />
                  <Text style={styles.emptyTitle}>
                    {searchQuery ? 'No shops found' : 'No shops found'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? 'Try a different search term'
                      : 'No shops are assigned to your routes'}
                  </Text>
                </LinearGradient>
              </View>
            ) : null
          }
          renderItem={({ item }: { item: SectionItem }) => {
            if (item.type === 'header') {
              return (
                <View style={[styles.daySectionHeader, item.isToday && styles.daySectionHeaderToday]}>
                  <View style={styles.daySectionLeft}>
                    {item.isToday ? (
                      <View style={styles.todayDot} />
                    ) : null}
                    <MaterialIcons
                      name={item.isToday ? 'today' : 'calendar-view-day'}
                      size={16}
                      color={item.isToday ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[styles.daySectionTitle, item.isToday && styles.daySectionTitleToday]}>
                      {item.dayLabel}
                    </Text>
                    {item.isToday ? (
                      <View style={styles.todayBadge}>
                        <Text style={styles.todayBadgeText}>Today</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.daySectionCount}>{item.shopCount} shops</Text>
                </View>
              );
            }
            // Shop card
            return (
              <View style={styles.shopCardInGroup}>
                <ShopCard
                  shop={item.shop}
                  isVisited={visitedShopIds.has(item.shop.id)}
                  hasRecovery={recoverySubmittedShopIds.has(item.shop.id)}
                  onCollect={() => handleOpenRecovery(item.shop)}
                  onPress={() => setDetailShop(item.shop)}
                  onGpsVisit={() => setGpsVisitShop(item.shop)}
                  companyId={user?.companyId}
                />
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        /* ── NORMAL MODE: Today's route only ────────────────────────────── */
        <FlatList
          data={filteredShops}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingToday}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListHeaderComponent={
            <View>
              {/* Hero Card - Normal */}
              <LinearGradient
                colors={['#2563EB', '#1E40AF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <View style={styles.heroBubble1} />
                <View style={styles.heroBubble2} />

                <View style={styles.heroTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroGreeting} numberOfLines={1}>
                      Hello, {user ? user.name.split(' ')[0] : 'Order Booker'} 👋
                    </Text>
                    <Text style={styles.heroDate}>{getTodayLabel()}</Text>
                  </View>
                </View>

                {/* Visit Streak Counter */}
                {user ? (
                  <VisitStreakCounter orderbookerId={user.id} visitedCount={visitedCount} />
                ) : null}

                {/* Badges */}
                <View style={styles.badgesRow}>
                  <View style={styles.heroDayBadge}>
                    <MaterialIcons name={routeBadgeIcon} size={13} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.badgeText}>{routeBadgeLabel}</Text>
                  </View>
                  <Pressable style={styles.reportBadge} onPress={() => setShowReport(true)} hitSlop={8}>
                    <MaterialIcons name="assessment" size={13} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.badgeText}>Report</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.pendingBadge,
                      pendingNotifications.length > 0 && styles.pendingBadgeActive,
                    ]}
                    onPress={() => setShowPending(true)}
                    hitSlop={8}
                  >
                    <MaterialIcons name="pending-actions" size={13} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.badgeText}>Pending</Text>
                    {pendingNotifications.length > 0 ? (
                      <View style={styles.pendingCountDot}>
                        <Text style={styles.pendingCountText}>{pendingNotifications.length}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>
                      {visitedCount} of {todayShops.length} shops visited
                    </Text>
                    <Text style={styles.progressPct}>{Math.round(progressPct)}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${Math.min(progressPct, 100)}%` }]}
                    />
                  </View>
                </View>

                {/* Stat Pills */}
                <View style={styles.pillsRow}>
                  <View style={styles.pill}>
                    <Text style={styles.pillValue}>{todayShops.length}</Text>
                    <Text style={styles.pillLabel}>Shops</Text>
                  </View>
                  <View style={styles.pillDivider} />
                  <View style={styles.pill}>
                    <Text style={styles.pillValue}>
                      {formatPKR(totalOutstanding)}
                    </Text>
                    <Text style={styles.pillLabel}>Outstanding</Text>
                  </View>
                  <View style={styles.pillDivider} />
                  <View style={styles.pill}>
                    <Text style={[styles.pillValue, styles.pillGreen]}>
                      {formatPKR(todayRecovery)}
                    </Text>
                    <Text style={styles.pillLabel}>Recovered</Text>
                  </View>
                </View>
              </LinearGradient>


              {/* Daily Target Progress */}
              <DailyTargetProgress todayRecovery={todayRecovery} />

              {/* Chart Toggle */}
              <View style={styles.chartToggleRow}>
                {(
                  [
                    { key: 'trend' as ChartView, icon: 'show-chart', label: 'Trend' },
                    { key: 'analysis' as ChartView, icon: 'analytics', label: 'Analysis' },
                    { key: 'none' as ChartView, icon: 'visibility-off', label: 'Hide' },
                  ]
                ).map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.chartTabBtn,
                      chartView === opt.key && styles.chartTabBtnActive,
                    ]}
                    onPress={() => setChartView(opt.key)}
                    hitSlop={4}
                  >
                    <MaterialIcons
                      name={opt.icon as any}
                      size={13}
                      color={chartView === opt.key ? Colors.primaryDark : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.chartTabLabel,
                        chartView === opt.key && styles.chartTabLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {chartView === 'trend' && user ? (
                <View style={styles.chartWrap}>
                  <PerformanceChart userId={user.id} />
                </View>
              ) : chartView === 'analysis' && user ? (
                <View style={styles.chartWrap}>
                  <RecoveryAnalysisChart userId={user.id} />
                </View>
              ) : null}

              {/* Search Bar */}
              <View style={styles.searchRow}>
                <MaterialIcons name="search" size={18} color={Colors.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search shops, areas..."
                  placeholderTextColor={Colors.textMuted}
                />
                {searchQuery ? (
                  <Pressable
                    onPress={() => setSearchQuery('')}
                    hitSlop={8}
                    style={styles.searchClear}
                  >
                    <MaterialIcons name="cancel" size={16} color={Colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {/* Shop count */}
              <View style={styles.shopCountRow}>
                <View style={styles.shopCountLeft}>
                  <View style={styles.shopCountDot} />
                  <Text style={styles.shopCountText}>
                    {filteredShops.length} {filteredShops.length === 1 ? 'shop' : 'shops'}
                    {searchQuery ? ` found` : ' on route'}
                  </Text>
                </View>
                {visitedCount > 0 ? (
                  <View style={styles.visitedChip}>
                    <MaterialIcons name="check-circle" size={12} color={Colors.primary} />
                    <Text style={styles.visitedChipText}>{visitedCount} visited</Text>
                  </View>
                ) : null}
              </View>

              {/* Feature 13: Recovery Reminder */}
              <RecoveryReminder
                shops={allShops.length > 0 ? allShops : todayShops}
                onShopPress={handleReminderShopPress}
              />
            </View>
          }
          ListEmptyComponent={
            !isLoadingToday ? (
              <View style={styles.emptyContainer}>
                <LinearGradient
                  colors={[Colors.primaryLight, Colors.background]}
                  style={styles.emptyGradient}
                >
                  <MaterialIcons name="store-mall-directory" size={56} color={Colors.primary} />
                  <Text style={styles.emptyTitle}>
                    {searchQuery ? 'No shops found' : 'No shops for today'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? 'Try a different search term'
                      : "No shops are scheduled for today's route"}
                  </Text>
                </LinearGradient>
              </View>
            ) : null
          }
          renderItem={({ item }: { item: Shop }) => (
            <ShopCard
              shop={item}
              isVisited={visitedShopIds.has(item.id)}
              hasRecovery={recoverySubmittedShopIds.has(item.id)}
              onCollect={() => handleOpenRecovery(item)}
              onPress={() => setDetailShop(item)}
              onGpsVisit={() => setGpsVisitShop(item)}
              companyId={user?.companyId}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      <RecoveryBottomSheet
        visible={recoveryShop !== null}
        shop={recoveryShop}
        companyId={user?.companyId}
        onClose={() => setRecoveryShop(null)}
        onSubmit={handleSubmitRecovery}
        isSubmitting={isSubmitting}
      />

      <GpsVisitBottomSheet
        visible={gpsVisitShop !== null}
        shop={gpsVisitShop}
        onClose={() => setGpsVisitShop(null)}
        onVisitMarked={handleGpsVisitMarked}
      />

      <ShopDetailModal
        visible={detailShop !== null}
        shop={detailShop}
        companyId={user?.companyId}
        onClose={() => setDetailShop(null)}
        onCollect={() => {
          if (detailShop && recoverySubmittedShopIds.has(detailShop.id)) {
            Alert.alert('Already Recovered', `Recovery for ${detailShop.name} has already been submitted today.`);
            return;
          }
          setRecoveryShop(detailShop);
          setDetailShop(null);
        }}
        hasRecoveryToday={detailShop ? recoverySubmittedShopIds.has(detailShop.id) : false}
        onResendReceipt={() => {
          if (!detailShop || !detailShop.phone) {
            Alert.alert('No Phone Number', 'This shop has no phone number for WhatsApp.');
            return;
          }
          // Open WhatsApp chat directly to resend receipt from gallery
          let formattedPhone = detailShop.phone.trim().replace(/[^0-9]/g, '');
          if (formattedPhone.startsWith('0')) formattedPhone = formattedPhone.substring(1);
          if (!formattedPhone.startsWith('92')) formattedPhone = '92' + formattedPhone;
          formattedPhone = formattedPhone.replace(/[^0-9]/g, '');
          const whatsappUrl = `https://wa.me/${formattedPhone}`;
          Linking.openURL(whatsappUrl).then(() => {
            Alert.alert(
              'WhatsApp Opened',
              `WhatsApp chat opened for ${detailShop.name}.\n\nTap attachment → Gallery → "AlFalah Receipts" → Select receipt → Send`,
              [{ text: 'OK' }]
            );
          }).catch(() => {
            Alert.alert('WhatsApp Not Available', 'Please install WhatsApp.');
          });
        }}
      />

      {/* Phone Input Modal - shows when shop has no phone after recovery */}
      <PhoneInputModal
        visible={phoneInputShop !== null}
        shop={phoneInputShop}
        onPhoneSaved={handlePhoneSaved}
        onSkip={() => setPhoneInputShop(null)}
      />

      <SuccessOverlay
        visible={successState.visible}
        shopName={successState.shopName}
        amount={successState.amount}
        isOffline={successState.isOffline}
        onDismiss={() => {
          setSuccessState((s) => ({ ...s, visible: false }));
          // Show SMS popup immediately when success overlay dismisses
          if (pendingNotifAfterSuccess) {
            setNotifChoice({
              visible: true,
              ...pendingNotifAfterSuccess,
            });
            setPendingNotifAfterSuccess(null);
          }
        }}
        onUndo={handleUndoRecovery}
      />
      <NotificationChoice
        visible={notifChoice.visible}
        payload={notifChoice.visible ? {
          shopPhone: notifChoice.shopPhone,
          shopName: notifChoice.shopName,
          shopAddress: notifChoice.shopAddress,
          shopOwnerName: notifChoice.shopOwnerName,
          openingBalance: notifChoice.openingBalance,
          recoveryAmount: notifChoice.recoveryAmount,
          remainingBalance: notifChoice.remainingBalance,
          companyName: notifChoice.companyName,
          orderbookerName: notifChoice.orderbookerName,
          distributorPhone: notifChoice.distributorPhone,
        } : null}
        onDone={(method: NotificationMethod) => {
          setNotifChoice((s) => ({ ...s, visible: false }));
          // Increment count (unique per shop via StorageService)
          StorageService.incrementNotifCount(method, notifChoice.shopId || undefined).then((counts) => {
            setSmsSentCount(counts.sms);
            setWhatsappSentCount(counts.whatsapp);
          });
          StorageService.getPendingNotifications(getTodayDateStr()).then((list) => {
            const entry = list.find((n) => n.shopName === notifChoice.shopName);
            if (entry) {
              StorageService.removePendingNotification(entry.id);
              loadPendingNotifications();
            }
          });
        }}
      />
      <DailyReportCard
        visible={showReport}
        onClose={() => setShowReport(false)}
        shopsVisited={visitedCount}
        totalShops={todayShops.length}
        totalRecovery={todayRecovery}
        smsSent={smsSentCount}
        whatsappSent={whatsappSentCount}
        pendingMessages={pendingNotifications.length}
        orderbookerName={user?.name || 'Orderbooker'}
      />
      <PendingMessagesSheet
        visible={showPending}
        pendingList={pendingNotifications}
        onSendSms={(id) => {
          // Find the shopId from the pending notification for dedup
          const entry = pendingNotifications.find((n) => n.id === id);
          const shopId = entry?.shopId;
          StorageService.removePendingNotification(id);
          loadPendingNotifications();
          // Use incrementNotifCount for proper dedup (unique shops only)
          StorageService.incrementNotifCount('sms', shopId).then((counts) => {
            setSmsSentCount(counts.sms);
            setWhatsappSentCount(counts.whatsapp);
          });
        }}
        onSendWhatsapp={(id) => {
          // Find the shopId from the pending notification for dedup
          const entry = pendingNotifications.find((n) => n.id === id);
          const shopId = entry?.shopId;
          StorageService.removePendingNotification(id);
          loadPendingNotifications();
          // Use incrementNotifCount for proper dedup (unique shops only)
          StorageService.incrementNotifCount('whatsapp', shopId).then((counts) => {
            setSmsSentCount(counts.sms);
            setWhatsappSentCount(counts.whatsapp);
          });
        }}
        onClose={() => setShowPending(false)}
        onRefresh={loadPendingNotifications}
      />

      {/* Feature 14: App Tour */}
      <AppTour
        visible={showTour}
        onComplete={handleTourComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingBottom: Spacing.xxl + 16,
  },
  // Hero Card
  heroCard: {
    margin: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    overflow: 'hidden',
    ...Shadow.lg,
  },
  heroBubble1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -50,
    right: -40,
  },
  heroBubble2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -30,
    left: -20,
  },
  heroTop: {
    marginBottom: Spacing.sm,
  },
  heroGreeting: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  heroDate: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  // Badges
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  heroDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  allRoutesBadge: {
    backgroundColor: 'rgba(37,99,235,0.25)',
    borderColor: 'rgba(37,99,235,0.5)',
  },
  reportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(250,204,21,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.35)',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pendingBadgeActive: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.45)',
  },
  pendingCountDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  pendingCountText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  // Progress
  progressSection: {
    marginBottom: Spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FontWeight.medium,
  },
  progressPct: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.full,
  },
  // Pills
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  pillDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pillValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  pillGreen: { color: '#A7F3D0' },
  pillLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: FontWeight.medium,
  },
  // Chart Toggle
  chartToggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    padding: 3,
    ...Shadow.sm,
  },
  chartTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  chartTabBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  chartTabLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
  },
  chartTabLabelActive: {
    color: Colors.primaryDark,
    fontWeight: FontWeight.bold,
  },
  chartWrap: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  searchClear: {
    padding: 2,
  },
  // Shop Count
  shopCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  shopCountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shopCountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  shopCountText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  visitedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  visitedChipText: {
    fontSize: FontSize.xs,
    color: Colors.primaryDark,
    fontWeight: FontWeight.semibold,
  },
  // ── Day Section Header (all routes mode) ──────────────────────────────────
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.sm,
  },
  daySectionHeaderToday: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  daySectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  todayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  daySectionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  daySectionTitleToday: {
    color: Colors.primaryDark,
  },
  todayBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  todayBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  daySectionCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  shopCardInGroup: {
    paddingHorizontal: Spacing.md,
  },
  // Empty
  emptyContainer: {
    margin: Spacing.md,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  emptyGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Holiday
  holidayContainer: {
    flex: 1,
    margin: Spacing.md,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  holidayGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  holidayTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  holidaySubtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
