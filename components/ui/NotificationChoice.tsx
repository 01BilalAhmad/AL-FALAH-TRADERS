// Powered by OnSpace.AI
// Strict SMS System: WhatsApp opens directly to shop number, confirmation required after return
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from '@/utils/captureRef';
import * as MediaLibrary from 'expo-media-library';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { sendRecoverySms } from '@/utils/sendRecoverySms';
import { formatPKR } from '@/utils/format';

interface NotificationPayload {
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
}

export type NotificationMethod = 'sms' | 'whatsapp';

interface NotificationChoiceProps {
  visible: boolean;
  payload: NotificationPayload | null;
  onDone: (method: NotificationMethod) => void;
}

/** Format phone to international format for WhatsApp (923001234567) */
function formatPhoneIntl(phone: string): string {
  let p = phone.trim().replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith('92')) p = '92' + p;
  return p.replace(/[^0-9]/g, '');
}

export function NotificationChoice({ visible, payload, onDone }: NotificationChoiceProps) {
  const [sending, setSending] = useState(false);
  const [smsStatus, setSmsStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmWarning, setConfirmWarning] = useState(false);
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const receiptRef = useRef<View>(null);
  const whatsappOpenedAt = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const waitingForReturn = useRef(false);

  useEffect(() => {
    if (visible) {
      setSending(false);
      setSmsStatus('idle');
      setShowConfirm(false);
      setConfirmWarning(false);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.8);
      opacity.setValue(0);
      setShowConfirm(false);
      setConfirmWarning(false);
      waitingForReturn.current = false;
      whatsappOpenedAt.current = null;
    }
  }, [visible]);

  // Listen for app returning from WhatsApp
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active' &&
        waitingForReturn.current
      ) {
        // User returned from WhatsApp
        waitingForReturn.current = false;
        const timeSpent = whatsappOpenedAt.current ? Date.now() - whatsappOpenedAt.current : 0;
        whatsappOpenedAt.current = null;

        console.log('[NotificationChoice] Returned from WhatsApp, time spent:', timeSpent, 'ms');

        // Time detection: if < 3 seconds, likely didn't send
        const tooFast = timeSpent < 3000;
        setConfirmWarning(tooFast);
        setShowConfirm(true);
        setSending(false);
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  const today = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  /** Build recovery text message */
  const buildRecoveryText = (p: NotificationPayload): string => {
    let msg = `Al FALAH Credit System - Recovery Update\n\n`
      + `Dear ${p.shopName},\n\n`
      + `Your account has been updated:\n\n`
      + `Opening Balance: ${formatPKR(p.openingBalance)}\n`
      + `Recovery Received: ${formatPKR(p.recoveryAmount)}\n`
      + `Remaining Balance: ${formatPKR(p.remainingBalance)}\n\n`
      + `Date: ${today}\n`;
    if (p.distributorPhone) {
      msg += `\nDistributor No: ${p.distributorPhone}\n`;
    }
    msg += `\nThank you for your payment!\n`
      + `Al FALAH Credit System`;
    return msg;
  };

  /** Open WhatsApp chat directly to shop's number with pre-filled text */
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
      console.warn('[NotificationChoice] Could not open WhatsApp:', e);
      Alert.alert('Error', 'Could not open WhatsApp. Please try again.');
      return false;
    }
  };

  /** Save receipt image to gallery */
  const saveReceiptToGallery = async (): Promise<string | null> => {
    if (!receiptRef.current) return null;

    try {
      await new Promise(r => setTimeout(r, 300));
      const imageUri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });

      if (imageUri) {
        console.log('[NotificationChoice] Receipt image captured:', imageUri);
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync(true);
          if (status === 'granted') {
            const normalizedImgUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
            const asset = await MediaLibrary.createAssetAsync(normalizedImgUri);
            try {
              await MediaLibrary.createAlbumAsync('AlFalah Receipts', asset, false);
            } catch {
              try {
                const album = await MediaLibrary.getAlbumAsync('AlFalah Receipts');
                if (album) {
                  await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
                }
              } catch {}
            }
            console.log('[NotificationChoice] Receipt saved to gallery:', asset.uri);
          }
        } catch (galleryErr) {
          console.warn('[NotificationChoice] Could not save to gallery:', galleryErr);
        }
        return imageUri;
      }
    } catch (captureErr) {
      console.warn('[NotificationChoice] Image capture failed:', captureErr);
    }
    return null;
  };

  const handleSms = async () => {
    if (!payload) return;
    setSending(true);
    setSmsStatus('idle');
    try {
      const sent = await sendRecoverySms(payload);
      if (sent) {
        console.log('[NotificationChoice] SMS sent successfully');
        setSmsStatus('success');
        // Small delay to show success state before closing
        setTimeout(() => {
          onDone('sms');
        }, 800);
      } else {
        console.warn('[NotificationChoice] SMS failed to send');
        setSmsStatus('failed');
        // DON'T call onDone — keep in pending
        Alert.alert(
          'SMS Bhejne Mein Masla',
          'SMS bhej nahi saka. WhatsApp try karein ya dobara koshish karein.\n\nYe receipt Pending mein rahegi jab tak message send nahi hota.',
          [
            { text: 'WhatsApp Try Karo', onPress: () => { setSmsStatus('idle'); setSending(false); } },
            { text: 'Baad Mein Bhejunga', onPress: () => { setSmsStatus('idle'); setSending(false); } },
          ]
        );
      }
    } catch (err) {
      console.error('[NotificationChoice] SMS error:', err);
      setSmsStatus('failed');
      // DON'T call onDone — keep in pending
      Alert.alert(
        'SMS Error',
        'SMS bhejne mein error aaya. WhatsApp try karein.\n\nYe receipt Pending mein rahegi.',
        [
          { text: 'WhatsApp Try Karo', onPress: () => { setSmsStatus('idle'); setSending(false); } },
          { text: 'Baad Mein Bhejunga', onPress: () => { setSmsStatus('idle'); setSending(false); } },
        ]
      );
    }
    setSending(false);
  };

  const handleWhatsapp = async () => {
    if (!payload) return;
    setSending(true);

    try {
      // Step 1: Save receipt image to gallery (so OB can attach it in WhatsApp)
      await saveReceiptToGallery();

      // Step 2: Build text message
      const textMessage = buildRecoveryText(payload);

      // Step 3: Open WhatsApp directly to shop's number with pre-filled text
      const opened = await openWhatsAppDirect(payload.shopPhone, textMessage);

      if (opened) {
        // Record when WhatsApp was opened for time detection
        whatsappOpenedAt.current = Date.now();
        waitingForReturn.current = true;
        // Don't call onDone yet — wait for user to return from WhatsApp
        // AppState listener will handle the confirmation dialog
        console.log('[NotificationChoice] WhatsApp opened, waiting for return...');
      } else {
        // WhatsApp couldn't open — keep in pending
        setSending(false);
      }
    } catch (err) {
      console.error('[NotificationChoice] WhatsApp error:', err);
      setSending(false);
    }
  };

  /** User confirmed they sent the WhatsApp message */
  const handleConfirmSent = useCallback(() => {
    console.log('[NotificationChoice] User confirmed WhatsApp sent');
    setShowConfirm(false);
    onDone('whatsapp');
  }, [onDone]);

  /** User denied sending — keep in pending */
  const handleDenySent = useCallback(() => {
    console.log('[NotificationChoice] User denied sending — keeping in pending');
    setShowConfirm(false);
    setSending(false);
    // Close the modal but DON'T call onDone — receipt stays in pending
    onDone('_keep_pending' as NotificationMethod);
  }, [onDone]);

  if (!payload) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <Pressable style={styles.backdrop} disabled={sending}>
        <Animated.View style={[styles.backdropFade, { opacity }]} />
      </Pressable>

      <View style={styles.center}>
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          {/* Header icon */}
          <View style={styles.iconWrap}>
            <View style={styles.iconGradient}>
              <MaterialIcons name="notifications-active" size={28} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.title}>Send Recovery Notification</Text>
          <Text style={styles.subtitle}>
            Choose how to notify <Text style={styles.shopHighlight}>{payload.shopName}</Text>
          </Text>

          {/* Hidden Receipt View for Image Capture */}
          <View style={styles.hiddenReceipt}>
            <View ref={receiptRef} collapsable={false} style={styles.receiptCard}>
              {/* ── 1. AL-FALAH CREDIT SYSTEM (System Header) ── */}
              <View style={styles.receiptSystemHeader}>
                <MaterialIcons name="account-balance" size={30} color="#FFFFFF" />
                <Text style={styles.receiptSystemTitle}>AL-FALAH CREDIT SYSTEM</Text>
              </View>

              {/* ── 2. Company Name ── */}
              <Text style={styles.receiptCompanyName}>{payload.companyName || 'Al FALAH Credit System'}</Text>

              {/* ── 3. Payment Receipt ── */}
              <Text style={styles.receiptPaymentLabel}>Payment Receipt</Text>

              {/* ── 4. Distributor Number ── */}
              {payload.distributorPhone ? (
                <View style={styles.receiptDistPhoneRow}>
                  <MaterialIcons name="call" size={16} color="#A7F3D0" />
                  <Text style={styles.receiptDistPhoneLabel}>Distributor No:</Text>
                  <Text style={styles.receiptDistPhoneValue}>{payload.distributorPhone}</Text>
                </View>
              ) : null}

              {/* ── Divider ── */}
              <View style={styles.receiptDivider} />

              {/* ── 5. Shop Details ── */}
              <View style={styles.receiptShopSection}>
                <View style={styles.receiptInfoRow}>
                  <MaterialIcons name="store" size={18} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.receiptInfoLabel}>Shop:</Text>
                  <Text style={styles.receiptInfoValue}>{payload.shopName}</Text>
                </View>
                {payload.shopAddress ? (
                  <View style={styles.receiptInfoRow}>
                    <MaterialIcons name="location-on" size={18} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.receiptInfoLabel}>Address:</Text>
                    <Text style={styles.receiptInfoValue}>{payload.shopAddress}</Text>
                  </View>
                ) : null}
                {payload.shopOwnerName ? (
                  <View style={styles.receiptInfoRow}>
                    <MaterialIcons name="person" size={18} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.receiptInfoLabel}>Owner:</Text>
                    <Text style={styles.receiptInfoValue}>{payload.shopOwnerName}</Text>
                  </View>
                ) : null}
                <View style={styles.receiptInfoRow}>
                  <MaterialIcons name="calendar-today" size={18} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.receiptInfoLabel}>Date:</Text>
                  <Text style={styles.receiptInfoValue}>{today}</Text>
                </View>
              </View>

              {/* ── 6. Orderbooker Name ── */}
              {payload.orderbookerName ? (
                <View style={styles.receiptOrderbookerSection}>
                  <MaterialIcons name="badge" size={18} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.receiptOrderbookerLabel}>Orderbooker:</Text>
                  <Text style={styles.receiptOrderbookerValue}>{payload.orderbookerName}</Text>
                </View>
              ) : null}

              {/* ── 7. Balance Details ── */}
              <View style={styles.receiptAmountBox}>
                <View style={styles.receiptAmountRow}>
                  <Text style={styles.receiptAmountLabel}>Opening Balance</Text>
                  <Text style={styles.receiptAmountVal}>{formatPKR(payload.openingBalance)}</Text>
                </View>
                <View style={styles.receiptAmtSep} />
                <View style={styles.receiptAmountRow}>
                  <Text style={styles.receiptAmountLabel}>Payment Received</Text>
                  <Text style={[styles.receiptAmountVal, { color: '#A7F3D0' }]}>{formatPKR(payload.recoveryAmount)}</Text>
                </View>
                <View style={styles.receiptAmtSep} />
                <View style={[styles.receiptAmountRow, styles.receiptRemainingRow]}>
                  <Text style={[styles.receiptAmountLabel, { color: '#FFFFFF', fontWeight: FontWeight.bold }]}>Remaining Balance</Text>
                  <Text style={[styles.receiptAmountVal, { color: '#FDE68A', fontSize: 22 }]}>{formatPKR(payload.remainingBalance)}</Text>
                </View>
              </View>

              {/* ── 8. Thank You ── */}
              <View style={styles.receiptThankYou}>
                <MaterialIcons name="verified" size={18} color="#A7F3D0" />
                <Text style={styles.receiptThankText}>Thank you for your Payment!</Text>
              </View>

              {/* ── 9. Urdu Hidayat with Distributor Number ── */}
              <View style={styles.receiptHidayat}>
                <Text style={styles.receiptHidayatText}>
                  اگر آپ کو کسی بھی قسم کا کوئی فرق محسوس ہوتا ہے بیلنس میں تو اوپر دیے گئے نمبر پر لازمی رابطہ کریں شکریہ
                </Text>
              </View>
            </View>
          </View>

          {/* Shop info */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoDot} />
              <Text style={styles.infoLabel}>Recovery Amount</Text>
              <Text style={styles.infoValue}>
                Rs. {payload.recoveryAmount.toLocaleString()}
              </Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <View style={[styles.infoDot, { backgroundColor: '#FCA5A5' }]} />
              <Text style={styles.infoLabel}>Remaining Balance</Text>
              <Text style={[styles.infoValue, { color: Colors.danger }]}>
                Rs. {payload.remainingBalance.toLocaleString()}
              </Text>
            </View>
          </View>

          <Text style={styles.mandatoryNote}>
            * Notification is compulsory for every recovery
          </Text>

          {/* SMS Button */}
          <Pressable
            style={({ pressed }) => [styles.btnSms, pressed && styles.btnPressed]}
            onPress={handleSms}
            disabled={sending}
          >
            <View style={styles.btnGradient}>
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="sms" size={22} color="#FFFFFF" />
                  <View style={styles.btnTextWrap}>
                    <Text style={styles.btnTitle}>Send via SMS</Text>
                    <Text style={styles.btnSub}>Direct send from SIM (no app opens)</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
                </>
              )}
            </View>
          </Pressable>

          {/* WhatsApp Button */}
          <Pressable
            style={({ pressed }) => [styles.btnWhatsapp, pressed && styles.btnPressed]}
            onPress={handleWhatsapp}
            disabled={sending}
          >
            <View style={styles.btnWhatsappGradient}>
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="chat" size={22} color="#FFFFFF" />
                  <View style={styles.btnTextWrap}>
                    <Text style={styles.btnTitle}>Send via WhatsApp</Text>
                    <Text style={styles.btnSub}>Receipt picture + message on WhatsApp</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
                </>
              )}
            </View>
          </Pressable>

          {/* Gallery hint */}
          <View style={styles.galleryHint}>
            <MaterialIcons name="photo-library" size={14} color={Colors.textSecondary} />
            <Text style={styles.galleryHintText}>
              Receipt image gallery mein save ho gayi hai — WhatsApp mein attach karein
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* ── WhatsApp Confirmation Dialog ── */}
      <Modal visible={showConfirm} transparent animationType="fade">
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    zIndex: 1,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 380,
    ...Shadow.xl,
  },
  iconWrap: {
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  shopHighlight: {
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },

  // Gallery hint
  galleryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  galleryHintText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  // Hidden receipt for image capture
  // NOTE: opacity: 0 removed — it causes captureRef to capture blank images on Android
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
  // System header: AL-FALAH CREDIT SYSTEM
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
  // Company name
  receiptCompanyName: {
    fontSize: 17,
    fontWeight: FontWeight.bold,
    color: '#A7F3D0',
    textAlign: 'center',
    marginBottom: 4,
    zIndex: 1,
  },
  // Payment Receipt label
  receiptPaymentLabel: {
    fontSize: 15,
    fontWeight: FontWeight.semibold,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 8,
    zIndex: 1,
  },
  receiptDivider: {
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 10,
    zIndex: 1,
  },
  // Shop details section
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
  // Orderbooker section
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
  // Amount box
  receiptAmountBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.lg,
    padding: 14,
    marginTop: 4,
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
  receiptAmountVal: {
    fontSize: 17,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptAmtSep: {
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
  // Thank you section
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
  // Distributor phone row
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
  // Urdu Hidayat
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

  // Info card
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  infoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  infoLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 4,
  },
  mandatoryNote: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: Spacing.md,
    fontWeight: FontWeight.medium,
  },
  btnSms: {
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  btnWhatsapp: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.primary,
  },
  btnWhatsappGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#25D366',
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnTextWrap: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  btnTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  btnSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
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
