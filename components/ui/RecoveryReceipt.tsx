// Powered by OnSpace.AI
// Recovery Receipt — renders as a solid View (no LinearGradient) so captureRef works.
// After capturing as image, it's saved to gallery and shared to shopkeeper via WhatsApp.
// Receipt image persists so it can be re-sent later.
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
import * as Linking from 'expo-linking';
import * as MediaLibrary from 'expo-media-library';
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
  const [savedImageUri, setSavedImageUri] = useState<string | null>(null);
  const [imageSavedToGallery, setImageSavedToGallery] = useState(false);
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setIsCapturing(false);
      setSavedImageUri(null);
      setImageSavedToGallery(false);
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
   * Capture receipt as image and save to gallery.
   * Returns the gallery URI if successful.
   */
  const captureAndSaveToGallery = async (): Promise<string | null> => {
    if (!receiptRef.current) return null;

    // Wait for UI to fully render
    await new Promise(r => setTimeout(r, 800));

    // Step 1: Capture receipt as image
    let imageUri: string;
    try {
      imageUri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });
    } catch (captureErr) {
      console.error('[RecoveryReceipt] captureRef failed:', captureErr);
      throw new Error('Failed to capture receipt image');
    }

    if (!imageUri) {
      throw new Error('Image capture returned empty URI');
    }

    console.log('[RecoveryReceipt] Image captured at:', imageUri);

    // Ensure URI has file:// prefix for MediaLibrary
    const normalizedUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;

    // Step 2: Save image to device Gallery
    let savedAssetUri: string | null = null;
    try {
      // Request permissions — try with full access first, fallback to writeOnly
      let permResult = await MediaLibrary.requestPermissionsAsync(false); // false = full access
      console.log('[RecoveryReceipt] MediaLibrary permission status (full):', permResult.status);
      
      // If full access denied, try writeOnly (Android 13+)
      if (permResult.status !== 'granted') {
        permResult = await MediaLibrary.requestPermissionsAsync(true); // true = writeOnly
        console.log('[RecoveryReceipt] MediaLibrary permission status (writeOnly):', permResult.status);
      }

      if (permResult.status === 'granted') {
        const asset = await MediaLibrary.createAssetAsync(normalizedUri);
        // Create album for easy access
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
        savedAssetUri = asset.uri;
        setImageSavedToGallery(true);
        console.log('[RecoveryReceipt] Image saved to gallery:', asset.uri);
      } else if (permResult.status === 'limited') {
        // Limited access - try to save anyway
        try {
          const asset = await MediaLibrary.createAssetAsync(normalizedUri);
          savedAssetUri = asset.uri;
          setImageSavedToGallery(true);
          console.log('[RecoveryReceipt] Image saved with limited access:', asset.uri);
        } catch (limitedErr) {
          console.warn('[RecoveryReceipt] Could not save even with limited access:', limitedErr);
        }
      } else {
        console.warn('[RecoveryReceipt] MediaLibrary permission denied, status:', permResult.status);
        Alert.alert(
          'Gallery Permission Needed',
          'Please allow gallery access to save receipt images. You can still send via WhatsApp.',
          [{ text: 'OK' }]
        );
      }
    } catch (galleryErr: any) {
      console.warn('[RecoveryReceipt] Could not save to gallery:', galleryErr?.message || galleryErr);
    }

    return savedAssetUri || imageUri;
  };

  /**
   * First-time send: capture image, save to gallery, open WhatsApp
   */
  const handleShareImage = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      const uri = await captureAndSaveToGallery();
      if (uri) {
        setSavedImageUri(uri);
      }

      // Open WhatsApp chat directly to shopkeeper's number
      if (shopPhone) {
        const phone = formatPhoneIntl(shopPhone);
        const whatsappUrl = `https://wa.me/${phone}`;
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);

          if (imageSavedToGallery) {
            Alert.alert(
              'Receipt Ready!',
              `Receipt saved in Gallery (AlFalah Receipts)!\n\nWhatsApp chat opened for ${shopName}.\n\nTap attachment → Gallery → Select receipt → Send`,
              [{ text: 'OK' }]
            );
          } else {
            Alert.alert(
              'Receipt Ready',
              `WhatsApp chat opened for ${shopName}.\n\nAttach the receipt image from your Gallery to send it.`,
              [{ text: 'OK' }]
            );
          }
        } else {
          Alert.alert('WhatsApp Not Available', 'Please install WhatsApp to send receipt.');
        }
      } else {
        Alert.alert('No Phone Number', 'This shop has no phone number for WhatsApp.');
      }
    } catch (error: any) {
      console.error('[RecoveryReceipt] Share failed:', error);
      if (shopPhone) {
        const phone = formatPhoneIntl(shopPhone);
        Alert.alert(
          'Image Error',
          'Receipt image save nahi hua. WhatsApp chat kholen?',
          [
            { text: 'WhatsApp Kholo', onPress: () => Linking.openURL(`https://wa.me/${phone}`) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * Re-send: open WhatsApp directly (image already saved in gallery)
   */
  const handleResend = async () => {
    if (!shopPhone) {
      Alert.alert('No Phone Number', 'This shop has no phone number for WhatsApp.');
      return;
    }

    const phone = formatPhoneIntl(shopPhone);
    const whatsappUrl = `https://wa.me/${phone}`;
    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
      Alert.alert(
        'WhatsApp Opened',
        `WhatsApp chat opened for ${shopName}.\n\nTap attachment → Gallery → "AlFalah Receipts" → Select receipt → Send`,
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('WhatsApp Not Available', 'Please install WhatsApp.');
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

          {/* RECEIPT — solid bg so captureRef works */}
          <View ref={receiptRef} collapsable={false} style={styles.receipt}>
            {/* Top gradient overlay */}
            <View style={styles.receiptGradientTop} />

            {/* Brand Header */}
            <View style={styles.receiptHeader}>
              <View style={styles.receiptLogoWrap}>
                <MaterialIcons name="account-balance" size={28} color="#FFFFFF" />
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
              <MaterialIcons name="store" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.receiptShopLabel}>Shop</Text>
              <Text style={styles.receiptShopName}>{shopName}</Text>
            </View>

            {/* Date */}
            <View style={styles.receiptDateRow}>
              <MaterialIcons name="calendar-today" size={14} color="rgba(255,255,255,0.5)" />
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
                <Text style={[styles.receiptAmountValue, { color: '#FDE68A', fontSize: 22 }]}>
                  {formatPKR(remainingBalance)}
                </Text>
              </View>
            </View>

            {/* Thank You */}
            <View style={styles.receiptThankYou}>
              <MaterialIcons name="verified" size={16} color="#A7F3D0" />
              <Text style={styles.receiptThankText}>Thank you for your payment!</Text>
            </View>

            {/* Footer */}
            <View style={styles.receiptFooter}>
              <View style={styles.receiptFooterLine} />
              <Text style={styles.receiptFooterText}>Powered by Al FALAH Credit System</Text>
            </View>
          </View>

          {/* Buttons Row */}
          <View style={styles.buttonsRow}>
            {/* Save / Resend WhatsApp Button */}
            {savedImageUri ? (
              <Pressable
                style={styles.resendBtn}
                onPress={handleResend}
              >
                <View style={styles.resendBtnInner}>
                  <MaterialIcons name="chat" size={20} color="#FFFFFF" />
                  <Text style={styles.resendBtnText}>Re-send WhatsApp</Text>
                </View>
              </Pressable>
            ) : null}

            {/* Primary Send Button */}
            <Pressable
              style={[styles.shareBtn, isCapturing && styles.shareBtnDisabled]}
              onPress={handleShareImage}
              disabled={isCapturing}
            >
              <View style={[styles.shareBtnInner, isCapturing && styles.shareBtnInnerDisabled]}>
                {isCapturing ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.shareBtnText}>Saving...</Text>
                  </>
                ) : savedImageUri ? (
                  <>
                    <MaterialIcons name="save" size={20} color="#FFFFFF" />
                    <Text style={styles.shareBtnText}>Save Again</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="chat" size={22} color="#FFFFFF" />
                    <Text style={styles.shareBtnText}>Send Receipt</Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>

          {/* Gallery saved indicator */}
          {imageSavedToGallery ? (
            <View style={styles.savedIndicator}>
              <MaterialIcons name="check-circle" size={14} color="#A7F3D0" />
              <Text style={styles.savedText}>Receipt saved in Gallery (AlFalah Receipts)</Text>
            </View>
          ) : null}
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

  // ===== RECEIPT =====
  receipt: {
    borderRadius: Radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#1D4ED8',
    overflow: 'hidden',
    ...Shadow.lg,
  },
  receiptGradientTop: {
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
    gap: 10,
    marginBottom: 3,
    zIndex: 1,
  },
  receiptLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
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
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  receiptSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
    fontWeight: FontWeight.medium,
  },
  receiptDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
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
  receiptShopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 1,
    zIndex: 1,
  },
  receiptShopLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: FontWeight.medium,
  },
  receiptShopName: {
    flex: 1,
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    textAlign: 'left',
  },
  receiptDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
    zIndex: 1,
  },
  receiptDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: FontWeight.medium,
  },
  receiptAmounts: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.lg,
    padding: 8,
    marginBottom: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 1,
  },
  receiptAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  receiptAmountLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FontWeight.medium,
  },
  receiptAmountValue: {
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  receiptAmountSeparator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 1,
  },
  receiptRemainingRow: {
    backgroundColor: 'rgba(250,204,21,0.08)',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    marginTop: 2,
  },
  receiptThankYou: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 3,
    zIndex: 1,
  },
  receiptThankText: {
    fontSize: 13,
    color: '#A7F3D0',
    fontWeight: FontWeight.semibold,
  },
  receiptFooter: {
    alignItems: 'center',
    zIndex: 1,
  },
  receiptFooterLine: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 4,
  },
  receiptFooterText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: FontWeight.medium,
  },

  // ===== BUTTONS =====
  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  shareBtn: {
    flex: 1,
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
    paddingVertical: 14,
    backgroundColor: '#25D366',
  },
  shareBtnInnerDisabled: {
    backgroundColor: '#4B5563',
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  resendBtn: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    ...Shadow.md,
  },
  resendBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1D4ED8',
  },
  resendBtnText: {
    fontSize: 14,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  savedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  savedText: {
    fontSize: 12,
    color: '#A7F3D0',
    fontWeight: FontWeight.medium,
  },
});
