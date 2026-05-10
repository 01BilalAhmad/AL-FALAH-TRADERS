// Powered by OnSpace.AI
// Strict SMS System: WhatsApp opens directly to shop number, confirmation required after return
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  Alert,
  Animated,
  Linking,
  AppState,
  AppStateStatus,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from '@/utils/captureRef';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { PendingNotification } from '@/services/storage';
import { sendRecoverySms } from '@/utils/sendRecoverySms';
import { formatPKR } from '@/utils/format';

interface PendingMessagesSheetProps {
  visible: boolean;
  pendingList: PendingNotification[];
  onSendSms: (id: string) => void;
  onSendWhatsapp: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}

/** Format phone to international format for WhatsApp (923001234567) */
function formatPhoneIntl(phone: string): string {
  let p = phone.trim().replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith('92')) p = '92' + p;
  return p.replace(/[^0-9]/g, '');
}

export function PendingMessagesSheet({
  visible,
  pendingList,
  onSendSms,
  onSendWhatsapp,
  onClose,
  onRefresh,
}: PendingMessagesSheetProps) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const receiptRefs = useRef<{ [key: string]: View | null }>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmItem, setConfirmItem] = useState<PendingNotification | null>(null);
  const [confirmWarning, setConfirmWarning] = useState(false);

  // WhatsApp return tracking
  const whatsappOpenedAt = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const waitingForReturnId = useRef<string | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 12,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(600);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  // Listen for app returning from WhatsApp
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active' &&
        waitingForReturnId.current
      ) {
        const itemId = waitingForReturnId.current;
        waitingForReturnId.current = null;
        const timeSpent = whatsappOpenedAt.current ? Date.now() - whatsappOpenedAt.current : 0;
        whatsappOpenedAt.current = null;

        console.log('[PendingMessages] Returned from WhatsApp, time spent:', timeSpent, 'ms');

        // Find the item
        const item = pendingList.find((n) => n.id === itemId);
        if (item) {
          // Time detection: if < 3 seconds, likely didn't send
          const tooFast = timeSpent < 3000;
          setConfirmWarning(tooFast);
          setConfirmItem(item);
        }
        setSendingId(null);
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [pendingList]);

  /** Build recovery text message */
  const buildPendingRecoveryText = (item: PendingNotification): string => {
    const today = new Date().toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return `Al FALAH Credit System - Recovery Update\n\n`
      + `Dear ${item.shopName},\n\n`
      + `Your account has been updated:\n\n`
      + `Opening Balance: ${formatPKR(item.openingBalance)}\n`
      + `Recovery Received: ${formatPKR(item.recoveryAmount)}\n`
      + `Remaining Balance: ${formatPKR(item.remainingBalance)}\n\n`
      + `Date: ${today}\n\n`
      + `Thank you for your payment!\n`
      + `Al FALAH Credit System`;
  };

  /** Open WhatsApp directly to shop's number with pre-filled text */
  const openWhatsAppDirect = async (phone: string, message: string): Promise<boolean> => {
    if (!phone || phone.trim().length === 0) return false;

    const formattedPhone = formatPhoneIntl(phone);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      } else {
        Alert.alert(
          'WhatsApp Not Available',
          'WhatsApp is not installed on this device. Please install WhatsApp or use SMS.',
        );
        return false;
      }
    } catch (e) {
      console.warn('[PendingMessages] Could not open WhatsApp:', e);
      Alert.alert('Error', 'Could not open WhatsApp. Please try again.');
      return false;
    }
  };

  const handleSendSms = async (item: PendingNotification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const sent = await sendRecoverySms({
        shopPhone: item.shopPhone,
        shopName: item.shopName,
        openingBalance: item.openingBalance,
        recoveryAmount: item.recoveryAmount,
        remainingBalance: item.remainingBalance,
      });
      if (sent) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSendSms(item.id);
      } else {
        // SMS failed — DON'T remove from pending
        Alert.alert(
          'SMS Bhejne Mein Masla',
          'SMS bhej nahi saka. WhatsApp try karein ya dobara koshish karein.\n\nYe receipt Pending mein rahegi jab tak message send nahi hota.',
          [
            { text: 'WhatsApp Try Karo', style: 'default' },
            { text: 'OK', style: 'cancel' },
          ]
        );
      }
    } catch (err) {
      console.error('[PendingMessages] SMS error:', err);
      Alert.alert(
        'SMS Error',
        'SMS bhejne mein error aaya. Ye receipt Pending mein rahegi.',
      );
    }
  };

  const handleSendWhatsapp = async (item: PendingNotification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingId(item.id);

    try {
      // Build text message
      const textMessage = buildPendingRecoveryText(item);

      // Try to capture receipt image and save to gallery first
      const receiptView = receiptRefs.current[item.id];
      if (receiptView) {
        try {
          await new Promise(r => setTimeout(r, 200));
          const imageUri = await captureRef(receiptView, {
            format: 'png',
            quality: 1.0,
            result: 'tmpfile',
          });

          if (imageUri) {
            console.log('[PendingMessages] Receipt image captured, saved to gallery');
            // Image will be in gallery for OB to attach in WhatsApp
          }
        } catch (captureErr) {
          console.warn('[PendingMessages] Image capture failed:', captureErr);
        }
      }

      // Open WhatsApp directly to shop's number with pre-filled text
      const opened = await openWhatsAppDirect(item.shopPhone, textMessage);

      if (opened) {
        // Record when WhatsApp was opened for time detection
        whatsappOpenedAt.current = Date.now();
        waitingForReturnId.current = item.id;
        // Don't call onSendWhatsapp yet — wait for user to return from WhatsApp
        console.log('[PendingMessages] WhatsApp opened, waiting for return...');
      } else {
        // WhatsApp couldn't open — keep in pending
        setSendingId(null);
      }
    } catch (err) {
      console.error('[PendingMessages] WhatsApp error:', err);
      setSendingId(null);
    }
  };

  /** User confirmed they sent the WhatsApp message */
  const handleConfirmSent = useCallback(() => {
    if (confirmItem) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSendWhatsapp(confirmItem.id);
    }
    setConfirmItem(null);
    setConfirmWarning(false);
  }, [confirmItem, onSendWhatsapp]);

  /** User denied sending — keep in pending */
  const handleDenySent = useCallback(() => {
    console.log('[PendingMessages] User denied sending — keeping in pending');
    setConfirmItem(null);
    setConfirmWarning(false);
    setSendingId(null);
  }, []);

  const today = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const renderItem = ({ item }: { item: PendingNotification }) => (
    <View style={styles.pendingCard}>
      {/* Hidden Receipt for Image Capture */}
      <View style={styles.hiddenReceipt}>
        <View
          ref={(ref) => { receiptRefs.current[item.id] = ref; }}
          collapsable={false}
          style={styles.receiptCard}
        >
          {/* ── 1. AL-FALAH CREDIT SYSTEM (System Header) ── */}
          <View style={styles.receiptSystemHeader}>
            <MaterialIcons name="account-balance" size={30} color="#FFFFFF" />
            <Text style={styles.receiptSystemTitle}>AL-FALAH CREDIT SYSTEM</Text>
          </View>

          {/* ── 2. Company Name ── */}
          <Text style={styles.receiptCompanyName}>{item.companyName || 'Al FALAH Credit System'}</Text>

          {/* ── 3. Payment Receipt ── */}
          <Text style={styles.receiptPaymentLabel}>Payment Receipt</Text>

          {/* ── 4. Distributor Number ── */}
          {item.distributorPhone ? (
            <View style={styles.receiptDistPhoneRow}>
              <MaterialIcons name="call" size={16} color="#A7F3D0" />
              <Text style={styles.receiptDistPhoneLabel}>Distributor No:</Text>
              <Text style={styles.receiptDistPhoneValue}>{item.distributorPhone}</Text>
            </View>
          ) : null}

          {/* ── Divider ── */}
          <View style={styles.receiptDivider} />

          {/* ── 5. Shop Details ── */}
          <View style={styles.receiptShopSection}>
            <View style={styles.receiptInfoRow}>
              <MaterialIcons name="store" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.receiptInfoLabel}>Shop:</Text>
              <Text style={styles.receiptInfoValue}>{item.shopName}</Text>
            </View>
            <View style={styles.receiptInfoRow}>
              <MaterialIcons name="calendar-today" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.receiptInfoLabel}>Date:</Text>
              <Text style={styles.receiptInfoValue}>{today}</Text>
            </View>
          </View>

          {/* ── 6. Orderbooker Name ── */}
          {item.orderbookerName ? (
            <View style={styles.receiptOrderbookerSection}>
              <MaterialIcons name="badge" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.receiptOrderbookerLabel}>Orderbooker:</Text>
              <Text style={styles.receiptOrderbookerValue}>{item.orderbookerName}</Text>
            </View>
          ) : null}

          {/* ── 7. Balance Details ── */}
          <View style={styles.receiptAmountBox}>
            <View style={styles.receiptAmountRow}>
              <Text style={styles.receiptAmountLabel}>Opening Balance</Text>
              <Text style={styles.receiptAmountValue}>{formatPKR(item.openingBalance)}</Text>
            </View>
            <View style={styles.receiptAmountSeparator} />
            <View style={styles.receiptAmountRow}>
              <Text style={styles.receiptAmountLabel}>Payment Received</Text>
              <Text style={[styles.receiptAmountValue, { color: '#A7F3D0' }]}>{formatPKR(item.recoveryAmount)}</Text>
            </View>
            <View style={styles.receiptAmountSeparator} />
            <View style={[styles.receiptAmountRow, styles.receiptRemainingRow]}>
              <Text style={[styles.receiptAmountLabel, { fontWeight: FontWeight.bold, color: '#FFFFFF' }]}>Remaining Balance</Text>
              <Text style={[styles.receiptAmountValue, { color: '#FDE68A', fontSize: 22 }]}>{formatPKR(item.remainingBalance)}</Text>
            </View>
          </View>

          {/* ── 8. Thank You ── */}
          <View style={styles.receiptThankYou}>
            <MaterialIcons name="verified" size={18} color="#A7F3D0" />
            <Text style={styles.receiptThankText}>Thank you for your Payment!</Text>
          </View>

          {/* ── 9. Urdu Hidayat ── */}
          <View style={styles.receiptHidayat}>
            <Text style={styles.receiptHidayatText}>
              اگر آپ کو کسی بھی قسم کا کوئی فرق محسوس ہوتا ہے بیلنس میں تو اوپر دیے گئے نمبر پر لازمی رابطہ کریں شکریہ
            </Text>
          </View>
        </View>
      </View>

      {/* Shop info */}
      <View style={styles.pendingInfo}>
        <View style={styles.pendingIconWrap}>
          <MaterialIcons name="store" size={18} color={Colors.danger} />
        </View>
        <View style={styles.pendingDetails}>
          <Text style={styles.pendingShopName} numberOfLines={1}>
            {item.shopName}
          </Text>
          <Text style={styles.pendingArea} numberOfLines={1}>
            {item.area}
          </Text>
          <View style={styles.pendingAmountRow}>
            <View style={styles.pendingDot} />
            <Text style={styles.pendingAmountText}>
              Recovery: {formatPKR(item.recoveryAmount)}
            </Text>
          </View>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.pendingActions}>
        <Pressable
          style={styles.pendingBtnSms}
          onPress={() => handleSendSms(item)}
        >
          <View style={styles.pendingBtnGradient}>
            <MaterialIcons name="sms" size={16} color="#FFFFFF" />
            <Text style={styles.pendingBtnText}>SMS</Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.pendingBtnWa}
          onPress={() => handleSendWhatsapp(item)}
          disabled={sendingId === item.id}
        >
          <View style={styles.pendingBtnWaGradient}>
            <MaterialIcons name="chat" size={16} color="#FFFFFF" />
            <Text style={styles.pendingBtnText}>
              {sendingId === item.id ? 'Sending...' : 'WhatsApp'}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none">
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropFade, { opacity: opacityAnim }]} />
      </Pressable>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <View style={styles.sheetIconWrap}>
                <MaterialIcons name="pending-actions" size={22} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.sheetTitle}>Pending Messages</Text>
                <Text style={styles.sheetSubtitle}>
                  Bina SMS send kiye Pending se nahi hategi
                </Text>
              </View>
            </View>
            <View style={styles.sheetBadge}>
              <Text style={styles.sheetBadgeText}>{pendingList.length}</Text>
            </View>
          </View>

          {/* Mandatory note */}
          <View style={styles.noteCard}>
            <MaterialIcons name="info" size={14} color={Colors.danger} />
            <Text style={styles.noteText}>
              Ye receipts Pending mein tab tak rahengi jab tak SMS/WhatsApp send nahi hota. Refresh karne se nahi hategi.
            </Text>
          </View>

          {/* List */}
          {pendingList.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="check-circle" size={48} color={Colors.success} />
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptySubtitle}>
                Sab receipts send ho gayi hain
              </Text>
            </View>
          ) : (
            <FlatList
              data={pendingList}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              maxToRenderPerBatch={10}
            />
          )}

          {/* Footer buttons */}
          <View style={styles.footerActions}>
            {pendingList.length > 0 && (
              <Pressable style={styles.footerRefreshBtn} onPress={onRefresh}>
                <MaterialIcons name="refresh" size={16} color={Colors.primary} />
                <Text style={styles.footerRefreshText}>Refresh</Text>
              </Pressable>
            )}
            <Pressable style={styles.footerCloseBtn} onPress={onClose}>
              <MaterialIcons name="close" size={16} color={Colors.textSecondary} />
              <Text style={styles.footerCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* ── WhatsApp Confirmation Dialog ── */}
      <Modal visible={!!confirmItem} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            {/* Warning icon */}
            <View style={[styles.confirmIconWrap, confirmWarning && styles.confirmIconWrapWarning]}>
              <MaterialIcons
                name={confirmWarning ? 'warning' : 'help-outline'}
                size={36}
                color="#FFFFFF"
              />
            </View>

            <Text style={styles.confirmTitle}>
              {confirmWarning ? 'Lagta Hai Message Nahi Bheja!' : 'Kya Message Bhej Diya?'}
            </Text>

            <Text style={styles.confirmSubtitle}>
              {confirmWarning
                ? 'Aap bohot jaldi wapas aaye. Kya aapne WhatsApp pe message bhej diya? Agar nahi bheja toh ye receipt Pending mein rahegi.'
                : 'Kya aapne WhatsApp pe message bhej diya? Agar nahi bheja toh ye receipt Pending mein rahegi.'
              }
            </Text>

            {/* Confirm buttons */}
            <Pressable
              style={({ pressed }) => [styles.confirmBtnYes, pressed && styles.btnPressed]}
              onPress={handleConfirmSent}
            >
              <View style={styles.confirmBtnYesGradient}>
                <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
                <Text style={styles.confirmBtnYesText}>Haan, Bhej Diya</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.confirmBtnNo, pressed && styles.btnPressed]}
              onPress={handleDenySent}
            >
              <View style={styles.confirmBtnNoGradient}>
                <MaterialIcons name="cancel" size={20} color="#FFFFFF" />
                <Text style={styles.confirmBtnNoText}>Nahi, Abhi Bhejna Hai</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backdropFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Spacing.sm,
    maxHeight: '85%',
    ...Shadow.xl,
  },
  handleWrap: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  sheetSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sheetBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  sheetBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerLight,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  noteText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.danger,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  pendingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.sm,
  },
  pendingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pendingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingDetails: {
    flex: 1,
  },
  pendingShopName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  pendingArea: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  pendingAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  pendingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  pendingAmountText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pendingBtnSms: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  pendingBtnWa: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  pendingBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.primary,
  },
  pendingBtnWaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    backgroundColor: '#25D366',
  },
  pendingBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
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
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  footerRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
  },
  footerRefreshText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primaryDark,
  },
  footerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
  },
  footerCloseText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  btnPressed: {
    opacity: 0.8,
  },

  // Hidden receipt for image capture
  hiddenReceipt: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
  receiptCard: {
    width: 380,
    borderRadius: Radius.xl,
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#1D4ED8',
    overflow: 'hidden',
  },
  receiptSystemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
    zIndex: 1,
  },
  receiptSystemTitle: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  receiptCompanyName: {
    fontSize: 17,
    fontWeight: FontWeight.bold,
    color: '#A7F3D0',
    textAlign: 'center',
    marginBottom: 4,
    zIndex: 1,
  },
  receiptPaymentLabel: {
    fontSize: 15,
    fontWeight: FontWeight.semibold,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 8,
    zIndex: 1,
  },
  receiptDistPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
    zIndex: 1,
  },
  receiptDistPhoneLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: FontWeight.medium,
  },
  receiptDistPhoneValue: {
    fontSize: 16,
    color: '#A7F3D0',
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  receiptDivider: {
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 10,
    zIndex: 1,
  },
  receiptShopSection: {
    marginBottom: 6,
    zIndex: 1,
  },
  receiptInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
    zIndex: 1,
  },
  receiptInfoLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: FontWeight.medium,
    width: 75,
  },
  receiptInfoValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    textAlign: 'left',
  },
  receiptOrderbookerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    zIndex: 1,
  },
  receiptOrderbookerLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: FontWeight.medium,
  },
  receiptOrderbookerValue: {
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptAmountBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 1,
  },
  receiptAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  receiptAmountLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FontWeight.medium,
  },
  receiptAmountValue: {
    fontSize: 17,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptAmountSeparator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 3,
  },
  receiptRemainingRow: {
    backgroundColor: 'rgba(250,204,21,0.1)',
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  receiptThankYou: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
    zIndex: 1,
  },
  receiptThankText: {
    fontSize: 15,
    color: '#A7F3D0',
    fontWeight: FontWeight.semibold,
  },
  receiptHidayat: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    zIndex: 1,
  },
  receiptHidayatText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Confirmation Dialog Styles ──
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  confirmCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    ...Shadow.xl,
  },
  confirmIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  confirmIconWrapWarning: {
    backgroundColor: '#F59E0B',
  },
  confirmTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  confirmSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  confirmBtnYes: {
    borderRadius: Radius.md,
    width: '100%',
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  confirmBtnYesGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#25D366',
  },
  confirmBtnYesText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  confirmBtnNo: {
    borderRadius: Radius.md,
    width: '100%',
    overflow: 'hidden',
  },
  confirmBtnNoGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.danger,
  },
  confirmBtnNoText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
});
