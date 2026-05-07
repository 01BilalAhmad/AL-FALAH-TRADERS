// Powered by OnSpace.AI
// Recovery Receipt — renders as a solid View (no LinearGradient) so captureRef works.
// After capturing as image, it's sent directly to shopkeeper's WhatsApp via Android Intent.
// Uses expo-intent-launcher to send image directly to specific WhatsApp contact.
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system';
import { formatPKR } from '@/utils/format';
import { Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

interface RecoveryReceiptProps {
  visible: boolean;
  shopName: string;
  shopPhone: string;
  openingBalance: number;
  recoveryAmount: number;
  remainingBalance: number;
  onClose: () => void;
}

/** Format phone number to international format (923001234567) */
function formatPhoneIntl(phone: string): string {
  let p = phone.trim().replace(/[^0-9]/g, '');
  if (p.startsWith('+')) p = p.substring(1);
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith('92')) p = '92' + p;
  return p.replace(/[^0-9]/g, '');
}

export function RecoveryReceipt({
  visible,
  shopName,
  shopPhone,
  openingBalance,
  recoveryAmount,
  remainingBalance,
  onClose,
}: RecoveryReceiptProps) {
  const receiptRef = useRef<View>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setIsCapturing(false);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.9);
      opacity.setValue(0);
    }
  }, [visible]);

  const today = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  /**
   * Send receipt image directly to shopkeeper's WhatsApp number.
   * Uses Android Intent to open WhatsApp directly with the image,
   * targeting the specific contact via WhatsApp's JID system.
   */
  const handleShareImage = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      // Wait for UI to render
      await new Promise(r => setTimeout(r, 300));

      // Step 1: Capture receipt as image
      const imageUri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });

      if (!imageUri) {
        throw new Error('Image capture returned empty URI');
      }

      console.log('[RecoveryReceipt] Image captured at:', imageUri);

      // Step 2: Send image directly to WhatsApp via Android Intent
      if (Platform.OS === 'android') {
        await sendImageToWhatsAppAndroid(imageUri, shopPhone);
      } else {
        // iOS fallback: use share sheet
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: `Share Receipt to ${shopName}`,
            UTI: 'public.png',
          });
        } else {
          throw new Error('Sharing not available');
        }
      }
    } catch (error: any) {
      console.error('[RecoveryReceipt] Share failed:', error);

      // Fallback: Open WhatsApp chat (text only, but at least goes to correct number)
      Alert.alert(
        'Image Share Failed',
        'Receipt image send nahi ho saka. WhatsApp chat kholen?',
        [
          {
            text: 'WhatsApp Chat Kholo',
            onPress: () => {
              // Open WhatsApp chat without pre-filled amounts (no fraud risk)
              if (shopPhone) {
                const phone = formatPhoneIntl(shopPhone);
                Linking.openURL(`https://wa.me/${phone}`);
              } else {
                Alert.alert('No Phone', 'Is shop ka phone number nahi hai.');
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * Android: Send image directly to WhatsApp using Intent.
   * Uses ACTION_SEND with WhatsApp package to skip share sheet.
   * Includes JID extra to target specific contact.
   */
  const sendImageToWhatsAppAndroid = async (imageUri: string, phone: string) => {
    try {
      // Convert file URI to content URI that WhatsApp can read
      let contentUri = imageUri;

      // If it's a file:// URI, we need to make it accessible
      if (imageUri.startsWith('file://')) {
        try {
          contentUri = await FileSystem.getContentUriAsync(imageUri);
        } catch {
          // If getContentUriAsync fails, try with the original URI
          contentUri = imageUri;
        }
      }

      // Format the WhatsApp JID (phone number in international format)
      const formattedPhone = phone ? formatPhoneIntl(phone) : '';
      const whatsappJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : '';

      // Build the Android Intent
      const intentParams: any = {
        action: 'android.intent.action.SEND',
        type: 'image/png',
        packageName: 'com.whatsapp',
        extra: {
          'android.intent.extra.STREAM': contentUri,
        },
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      };

      // Add JID to target specific contact (unofficial but works on most WhatsApp versions)
      if (whatsappJid) {
        intentParams.extra['jid'] = whatsappJid;
      }

      await IntentLauncher.startActivityAsync(
        'android.intent.action.SEND',
        intentParams
      );

      console.log('[RecoveryReceipt] WhatsApp intent launched successfully');
    } catch (intentError: any) {
      console.warn('[RecoveryReceipt] WhatsApp intent failed:', intentError.message);

      // If intent fails, try fallback: share sheet
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: `Share Receipt to ${shopName}`,
            UTI: 'public.png',
          });
        }
      } catch (shareError) {
        throw shareError;
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropFade, { opacity }]} />
      </Pressable>

      <View style={styles.center}>
        <Animated.View style={[styles.cardWrap, { transform: [{ scale }], opacity }]}>
          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>

          {/* ============================================= */}
          {/* RECEIPT — solid bg, NO LinearGradient          */}
          {/* so captureRef can capture it as image properly */}
          {/* ============================================= */}
          <View ref={receiptRef} collapsable={false} style={styles.receipt}>
            {/* Top gradient overlay */}
            <View style={styles.receiptGradientTop} />

            {/* Brand Header */}
            <View style={styles.receiptHeader}>
              <View style={styles.receiptLogoWrap}>
                <MaterialIcons name="account-balance" size={30} color="#FFFFFF" />
              </View>
              <View style={styles.receiptHeaderText}>
                <Text style={styles.receiptBrandName}>Al FALAH Credit System</Text>
                <Text style={styles.receiptSubtitle}>Payment Receipt</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.receiptDivider}>
              <View style={styles.receiptDividerLine} />
              <View style={styles.receiptDividerDot} />
              <View style={styles.receiptDividerLine} />
            </View>

            {/* Shop Name */}
            <View style={styles.receiptShopRow}>
              <MaterialIcons name="store" size={20} color="rgba(255,255,255,0.6)" />
              <Text style={styles.receiptShopLabel}>Shop</Text>
              <Text style={styles.receiptShopName}>{shopName}</Text>
            </View>

            {/* Date */}
            <View style={styles.receiptDateRow}>
              <MaterialIcons name="calendar-today" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={styles.receiptDate}>{today}</Text>
            </View>

            {/* Amounts Section */}
            <View style={styles.receiptAmounts}>
              {/* Opening Balance */}
              <View style={styles.receiptAmountRow}>
                <Text style={styles.receiptAmountLabel}>Opening Balance</Text>
                <Text style={styles.receiptAmountValue}>{formatPKR(openingBalance)}</Text>
              </View>

              <View style={styles.receiptAmountSeparator} />

              {/* Recovery Received */}
              <View style={styles.receiptAmountRow}>
                <Text style={styles.receiptAmountLabel}>Recovery Received</Text>
                <Text style={[styles.receiptAmountValue, { color: '#A7F3D0' }]}>
                  {formatPKR(recoveryAmount)}
                </Text>
              </View>

              <View style={styles.receiptAmountSeparator} />

              {/* Remaining Balance */}
              <View style={[styles.receiptAmountRow, styles.receiptRemainingRow]}>
                <Text style={[styles.receiptAmountLabel, { fontWeight: FontWeight.bold, color: '#FFFFFF' }]}>
                  Remaining Balance
                </Text>
                <Text style={[styles.receiptAmountValue, { color: '#FDE68A', fontSize: 24 }]}>
                  {formatPKR(remainingBalance)}
                </Text>
              </View>
            </View>

            {/* Thank You */}
            <View style={styles.receiptThankYou}>
              <MaterialIcons name="verified" size={18} color="#A7F3D0" />
              <Text style={styles.receiptThankText}>Thank you for your payment!</Text>
            </View>

            {/* Footer */}
            <View style={styles.receiptFooter}>
              <View style={styles.receiptFooterLine} />
              <Text style={styles.receiptFooterText}>Powered by Al FALAH Credit System</Text>
            </View>
          </View>

          {/* Share to WhatsApp Button */}
          <Pressable
            style={[styles.shareBtn, isCapturing && styles.shareBtnDisabled]}
            onPress={handleShareImage}
            disabled={isCapturing}
          >
            <View style={[styles.shareBtnInner, isCapturing && styles.shareBtnInnerDisabled]}>
              {isCapturing ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.shareBtnText}>Generating Receipt...</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="chat" size={22} color="#FFFFFF" />
                  <Text style={styles.shareBtnText}>Send Receipt to WhatsApp</Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    zIndex: 1,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 380,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: -4,
    right: 0,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== RECEIPT (Solid bg for captureRef) =====
  receipt: {
    borderRadius: Radius.xl,
    padding: 24,
    backgroundColor: '#1D4ED8',
    overflow: 'hidden',
    ...Shadow.lg,
  },
  receiptGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(5,150,105,0.5)',
    borderRadius: Radius.xl,
  },

  // Header
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  receiptLogoWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptHeaderText: {
    flex: 1,
  },
  receiptBrandName: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  receiptSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    fontWeight: FontWeight.medium,
  },

  // Divider
  receiptDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  receiptDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  receiptDividerDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ rotate: '45deg' }],
  },

  // Shop
  receiptShopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    zIndex: 1,
  },
  receiptShopLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: FontWeight.medium,
  },
  receiptShopName: {
    flex: 1,
    fontSize: 18,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    textAlign: 'right',
  },

  // Date
  receiptDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  receiptDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: FontWeight.medium,
  },

  // Amounts
  receiptAmounts: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.lg,
    padding: 18,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 1,
  },
  receiptAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  receiptAmountLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FontWeight.medium,
  },
  receiptAmountValue: {
    fontSize: 18,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptAmountSeparator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 4,
  },
  receiptRemainingRow: {
    backgroundColor: 'rgba(250,204,21,0.08)',
    marginHorizontal: -10,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    marginTop: 4,
  },

  // Thank You
  receiptThankYou: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  receiptThankText: {
    fontSize: 15,
    color: '#A7F3D0',
    fontWeight: FontWeight.semibold,
  },

  // Footer
  receiptFooter: {
    alignItems: 'center',
    zIndex: 1,
  },
  receiptFooterLine: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.sm,
  },
  receiptFooterText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: FontWeight.medium,
  },

  // Share Button
  shareBtn: {
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    ...Shadow.md,
  },
  shareBtnDisabled: {
    opacity: 0.7,
  },
  shareBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 16,
    backgroundColor: '#25D366', // WhatsApp green
  },
  shareBtnInnerDisabled: {
    backgroundColor: '#4B5563',
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
});
