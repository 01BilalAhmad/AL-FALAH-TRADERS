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
  shopAddress?: string;
  shopOwnerName?: string;
  shopPhone: string;
  openingBalance: number;
  recoveryAmount: number;
  remainingBalance: number;
  companyName?: string;
  orderbookerName?: string;
  distributorPhone?: string;
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
  shopAddress,
  shopOwnerName,
  shopPhone,
  openingBalance,
  recoveryAmount,
  remainingBalance,
  companyName,
  orderbookerName,
  distributorPhone,
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
   * Re-send: recapture receipt image, save to gallery, open WhatsApp
   */
  const handleResend = async () => {
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
          Alert.alert(
            'Receipt Re-saved!',
            `New receipt image saved in Gallery (AlFalah Receipts)!\n\nWhatsApp chat opened for ${shopName}.\n\nTap attachment → Gallery → Select latest receipt → Send`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('WhatsApp Not Available', 'Please install WhatsApp.');
        }
      } else {
        Alert.alert('No Phone Number', 'This shop has no phone number for WhatsApp.');
      }
    } catch (error: any) {
      console.error('[RecoveryReceipt] Resend failed:', error);
      // Fallback: just open WhatsApp without new image
      if (shopPhone) {
        const phone = formatPhoneIntl(shopPhone);
        Alert.alert(
          'Image Error',
          'Receipt image dobara save nahi hua. WhatsApp chat kholen?',
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
            {/* ── 1. AL-FALAH CREDIT SYSTEM (System Header) ── */}
            <View style={styles.receiptSystemHeader}>
              <MaterialIcons name="account-balance" size={30} color="#FFFFFF" />
              <Text style={styles.receiptSystemTitle}>AL-FALAH CREDIT SYSTEM</Text>
            </View>

            {/* ── 2. Company Name ── */}
            <Text style={styles.receiptCompanyName}>{companyName || 'Al FALAH Credit System'}</Text>

            {/* ── 3. Payment Receipt ── */}
            <Text style={styles.receiptPaymentLabel}>Payment Receipt</Text>

            {/* ── 4. Distributor Number ── */}
            {distributorPhone ? (
              <View style={styles.receiptDistPhoneRow}>
                <MaterialIcons name="call" size={16} color="#A7F3D0" />
                <Text style={styles.receiptDistPhoneLabel}>Distributor No:</Text>
                <Text style={styles.receiptDistPhoneValue}>{distributorPhone}</Text>
              </View>
            ) : null}

            {/* ── Divider ── */}
            <View style={styles.receiptDivider} />

            {/* ── 5. Shop Details ── */}
            <View style={styles.receiptShopSection}>
              <View style={styles.receiptInfoRow}>
                <MaterialIcons name="store" size={18} color="rgba(255,255,255,0.6)" />
                <Text style={styles.receiptInfoLabel}>Shop:</Text>
                <Text style={styles.receiptInfoValue}>{shopName}</Text>
              </View>
              {shopAddress ? (
                <View style={styles.receiptInfoRow}>
                  <MaterialIcons name="location-on" size={18} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.receiptInfoLabel}>Address:</Text>
                  <Text style={styles.receiptInfoValue}>{shopAddress}</Text>
                </View>
              ) : null}
              {shopOwnerName ? (
                <View style={styles.receiptInfoRow}>
                  <MaterialIcons name="person" size={18} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.receiptInfoLabel}>Owner:</Text>
                  <Text style={styles.receiptInfoValue}>{shopOwnerName}</Text>
                </View>
              ) : null}
              <View style={styles.receiptInfoRow}>
                <MaterialIcons name="calendar-today" size={18} color="rgba(255,255,255,0.6)" />
                <Text style={styles.receiptInfoLabel}>Date:</Text>
                <Text style={styles.receiptInfoValue}>{today}</Text>
              </View>
            </View>

            {/* ── 6. Orderbooker Name ── */}
            {orderbookerName ? (
              <View style={styles.receiptOrderbookerSection}>
                <MaterialIcons name="badge" size={18} color="rgba(255,255,255,0.6)" />
                <Text style={styles.receiptOrderbookerLabel}>Orderbooker:</Text>
                <Text style={styles.receiptOrderbookerValue}>{orderbookerName}</Text>
              </View>
            ) : null}

            {/* ── 7. Balance Details ── */}
            <View style={styles.receiptAmounts}>
              {/* Opening Balance */}
              <View style={styles.receiptAmountRow}>
                <Text style={styles.receiptAmountLabel}>Opening Balance</Text>
                <Text style={styles.receiptAmountValue}>{formatPKR(openingBalance)}</Text>
              </View>

              <View style={styles.receiptAmountSeparator} />

              {/* Payment Received */}
              <View style={styles.receiptAmountRow}>
                <Text style={styles.receiptAmountLabel}>Payment Received</Text>
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
    maxWidth: 400,
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#1D4ED8',
    overflow: 'hidden',
    ...Shadow.lg,
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
  // Divider
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
  // Amounts section
  receiptAmounts: {
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
