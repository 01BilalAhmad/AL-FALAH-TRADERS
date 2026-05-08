// Powered by OnSpace.AI
import React, { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from '@/utils/captureRef';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { PendingNotification } from '@/services/storage';
import { sendRecoverySms } from '@/utils/sendRecoverySms';
import { sendRecoveryWhatsapp } from '@/utils/sendRecoveryWhatsapp';
import { formatPKR } from '@/utils/format';

interface PendingMessagesSheetProps {
  visible: boolean;
  pendingList: PendingNotification[];
  onSendSms: (id: string) => void;
  onSendWhatsapp: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
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

  const handleSendSms = async (item: PendingNotification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await sendRecoverySms({
        shopPhone: item.shopPhone,
        shopName: item.shopName,
        openingBalance: item.openingBalance,
        recoveryAmount: item.recoveryAmount,
        remainingBalance: item.remainingBalance,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSendSms(item.id);
    } catch (err) {
      console.error('[PendingMessages] SMS error:', err);
      Alert.alert('Error', 'Failed to send SMS. Please try again.');
    }
  };

  const handleSendWhatsapp = async (item: PendingNotification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingId(item.id);
    try {
      // Build text message for shopkeeper
      const textMessage = buildPendingRecoveryText(item);

      // Try to capture receipt as image first
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
            console.log('[PendingMessages] Receipt image captured:', imageUri);
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
              await Sharing.shareAsync(imageUri, {
                mimeType: 'image/png',
                dialogTitle: `Share Receipt to ${item.shopName}`,
                UTI: 'public.png',
              });

              // After sharing image, also send text message to shopkeeper on WhatsApp
              // This ensures the shopkeeper receives BOTH image AND text
              try {
                await openWhatsAppWithText(item.shopPhone, textMessage);
              } catch (textErr) {
                console.warn('[PendingMessages] Could not send text after image share:', textErr);
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSendWhatsapp(item.id);
              setSendingId(null);
              return;
            }
          }
        } catch (captureErr) {
          console.warn('[PendingMessages] Image capture failed, falling back to text:', captureErr);
        }
      }

      // Fallback: Send text message via WhatsApp
      await sendRecoveryWhatsapp({
        shopPhone: item.shopPhone,
        shopName: item.shopName,
        openingBalance: item.openingBalance,
        recoveryAmount: item.recoveryAmount,
        remainingBalance: item.remainingBalance,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSendWhatsapp(item.id);
    } catch (err) {
      console.error('[PendingMessages] WhatsApp error:', err);
    }
    setSendingId(null);
  };

  /** Build recovery text message for pending notification */
  const buildPendingRecoveryText = (item: PendingNotification): string => {
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

  /** Open WhatsApp chat with text message to a phone number */
  const openWhatsAppWithText = async (phone: string, message: string): Promise<boolean> => {
    if (!phone || phone.trim().length === 0) return false;

    let formattedPhone = phone.trim().replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = formattedPhone.substring(1);
    }
    if (!formattedPhone.startsWith('92')) {
      formattedPhone = '92' + formattedPhone;
    }
    formattedPhone = formattedPhone.replace(/[^0-9]/g, '');

    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }
    } catch (e) {
      console.warn('[PendingMessages] Could not open WhatsApp with text:', e);
    }
    return false;
  };

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
          <View style={styles.receiptGradient} />
          <View style={styles.receiptHeader}>
            <View style={styles.receiptLogo}>
              <MaterialIcons name="account-balance" size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.receiptBrandName}>Al FALAH Credit System</Text>
              <Text style={styles.receiptBrandSub}>Payment Receipt</Text>
            </View>
          </View>
          <View style={styles.receiptSep} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptRowLabel}>Shop</Text>
            <Text style={styles.receiptRowValue}>{item.shopName}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptRowLabel}>Date</Text>
            <Text style={styles.receiptRowValue}>{today}</Text>
          </View>
          <View style={styles.receiptAmountBox}>
            <View style={styles.receiptAmtRow}>
              <Text style={styles.receiptAmtLabel}>Opening Balance</Text>
              <Text style={styles.receiptAmtVal}>{formatPKR(item.openingBalance)}</Text>
            </View>
            <View style={styles.receiptAmtSep} />
            <View style={styles.receiptAmtRow}>
              <Text style={styles.receiptAmtLabel}>Recovery Received</Text>
              <Text style={[styles.receiptAmtVal, { color: '#A7F3D0' }]}>{formatPKR(item.recoveryAmount)}</Text>
            </View>
            <View style={styles.receiptAmtSep} />
            <View style={[styles.receiptAmtRow, styles.receiptRemainingRow]}>
              <Text style={[styles.receiptAmtLabel, { color: '#FFFFFF', fontWeight: FontWeight.bold }]}>Remaining Balance</Text>
              <Text style={[styles.receiptAmtVal, { color: '#FDE68A', fontSize: 18 }]}>{formatPKR(item.remainingBalance)}</Text>
            </View>
          </View>
          <View style={styles.receiptThanksRow}>
            <MaterialIcons name="verified" size={12} color="#A7F3D0" />
            <Text style={styles.receiptThanksText}>Thank you! · Al FALAH Credit System</Text>
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
                  Send recovery notifications to these shops
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
              These shops have recovery recorded but no notification sent yet. Sending message is compulsory.
            </Text>
          </View>

          {/* List */}
          {pendingList.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="check-circle" size={48} color={Colors.success} />
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptySubtitle}>
                All recovery notifications have been sent
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

  // Hidden receipt for image capture
  // NOTE: opacity: 0 removed — it causes captureRef to capture blank images on Android
  hiddenReceipt: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
  receiptCard: {
    width: 320,
    borderRadius: Radius.xl,
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: '#1D4ED8',
    overflow: 'hidden',
  },
  receiptGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: 'rgba(5,150,105,0.5)',
    borderRadius: Radius.xl,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    zIndex: 1,
  },
  receiptLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptBrandName: {
    fontSize: 15,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptBrandSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },
  receiptSep: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 4,
    zIndex: 1,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    zIndex: 1,
  },
  receiptRowLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  receiptRowValue: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptAmountBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.md,
    padding: 8,
    marginTop: 2,
    marginBottom: 3,
    zIndex: 1,
  },
  receiptAmtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  receiptAmtLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  receiptAmtVal: {
    fontSize: 15,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptAmtSep: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 2,
  },
  receiptRemainingRow: {
    backgroundColor: 'rgba(250,204,21,0.08)',
    marginHorizontal: -6,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  receiptThanksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 1,
  },
  receiptThanksText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
});
