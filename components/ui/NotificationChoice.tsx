// Powered by OnSpace.AI
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from '@/utils/captureRef';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import * as MediaLibrary from 'expo-media-library';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { sendRecoverySms } from '@/utils/sendRecoverySms';
import { sendRecoveryWhatsapp } from '@/utils/sendRecoveryWhatsapp';
import { formatPKR } from '@/utils/format';
import { Platform } from 'react-native';

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

export function NotificationChoice({ visible, payload, onDone }: NotificationChoiceProps) {
  const [sending, setSending] = useState(false);
  const [smsStatus, setSmsStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const receiptRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setSending(false);
      setSmsStatus('idle');
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.8);
      opacity.setValue(0);
    }
  }, [visible]);

  const today = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

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
        Alert.alert(
          'SMS Failed',
          'Could not send SMS directly. Please try WhatsApp or send manually from your messaging app.',
          [
            { text: 'Try WhatsApp', onPress: () => { setSmsStatus('idle'); } },
            { text: 'OK', onPress: () => { setSmsStatus('idle'); onDone('sms'); } },
          ]
        );
      }
    } catch (err) {
      console.error('[NotificationChoice] SMS error:', err);
      setSmsStatus('failed');
      Alert.alert(
        'SMS Error',
        'An error occurred while sending SMS. Please try WhatsApp or send manually.',
        [
          { text: 'Try WhatsApp', onPress: () => { setSmsStatus('idle'); } },
          { text: 'OK', onPress: () => { setSmsStatus('idle'); onDone('sms'); } },
        ]
      );
    }
    setSending(false);
  };

  const handleWhatsapp = async () => {
    if (!payload) return;
    setSending(true);
    try {
      // Build text message for shopkeeper
      const textMessage = buildRecoveryText(payload);

      // First try to capture receipt as image, save to gallery, and share via WhatsApp
      if (receiptRef.current) {
        try {
          await new Promise(r => setTimeout(r, 300));
          const imageUri = await captureRef(receiptRef, {
            format: 'png',
            quality: 1.0,
            result: 'tmpfile',
          });

          if (imageUri) {
            console.log('[NotificationChoice] Receipt image captured:', imageUri);

            // Save to Gallery first
            try {
              const { status } = await MediaLibrary.requestPermissionsAsync(true);
              if (status === 'granted') {
                // Ensure URI has file:// prefix
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
              } else {
                console.warn('[NotificationChoice] MediaLibrary permission denied for gallery save');
              }
            } catch (galleryErr) {
              console.warn('[NotificationChoice] Could not save to gallery:', galleryErr);
            }

            // Share image via native share sheet
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
              await Sharing.shareAsync(imageUri, {
                mimeType: 'image/png',
                dialogTitle: `Share Receipt to ${payload.shopName}`,
                UTI: 'public.png',
              });

              // After sharing image, also send text message to shopkeeper on WhatsApp
              // This ensures the shopkeeper receives BOTH image AND text
              try {
                await openWhatsAppWithText(payload.shopPhone, textMessage);
              } catch (textErr) {
                console.warn('[NotificationChoice] Could not send text after image share:', textErr);
              }

              onDone('whatsapp');
              setSending(false);
              return;
            }
          }
        } catch (captureErr) {
          console.warn('[NotificationChoice] Image capture failed, falling back to text:', captureErr);
        }
      }

      // Fallback: Send text message via WhatsApp deep link (with image failed)
      await sendRecoveryWhatsapp(payload);
    } catch (err) {
      console.error('[NotificationChoice] WhatsApp error:', err);
    }
    setSending(false);
    onDone('whatsapp');
  };

  /** Build recovery text message */
  const buildRecoveryText = (p: NotificationPayload): string => {
    return `Al FALAH Credit System - Recovery Update\n\n`
      + `Dear ${p.shopName},\n\n`
      + `Your account has been updated:\n\n`
      + `Opening Balance: ${formatPKR(p.openingBalance)}\n`
      + `Recovery Received: ${formatPKR(p.recoveryAmount)}\n`
      + `Remaining Balance: ${formatPKR(p.remainingBalance)}\n\n`
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
      console.warn('[NotificationChoice] Could not open WhatsApp with text:', e);
    }
    return false;
  };

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
        </Animated.View>
      </View>
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
});
