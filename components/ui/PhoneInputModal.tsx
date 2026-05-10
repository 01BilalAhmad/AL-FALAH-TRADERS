// Al FALAH Credit System - Phone Input Modal
// Shows when a shop has no phone number saved after recovery submission
// Also allows adding/editing the shop owner's name
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { Shop } from '@/services/api';
import { ApiService } from '@/services/api';
import { StorageService } from '@/services/storage';

interface PhoneInputModalProps {
  visible: boolean;
  shop: Shop | null;
  onPhoneSaved: (phone: string, ownerName?: string) => void;
  onSkip: () => void;
}

export function PhoneInputModal({ visible, shop, onPhoneSaved, onSkip }: PhoneInputModalProps) {
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPhone('');
      setOwnerName(shop?.ownerName || '');
      setError('');
      setSaving(false);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const validatePhone = (p: string): boolean => {
    const cleaned = p.replace(/[\s\-()]/g, '');
    // Pakistan formats: 03XXXXXXXXX (11 digits) or +923XXXXXXXXX (13 digits) or 923XXXXXXXXX (12 digits)
    return /^(?:\+?92|0)3\d{9}$/.test(cleaned);
  };

  const formatPhoneDisplay = (p: string): string => {
    const cleaned = p.replace(/[^\d+]/g, '');
    return cleaned;
  };

  const handleSave = async () => {
    if (!shop) return;

    const cleaned = phone.replace(/[\s\-()]/g, '');

    if (!cleaned) {
      setError('Phone number is required');
      return;
    }

    if (!validatePhone(cleaned)) {
      setError('Enter valid Pakistan number (e.g. 03XXXXXXXXX)');
      return;
    }

    setError('');
    setSaving(true);

    try {
      // Normalize to 03XX format for storage
      let normalized = cleaned;
      if (normalized.startsWith('+92')) {
        normalized = '0' + normalized.substring(3);
      } else if (normalized.startsWith('92') && !normalized.startsWith('0')) {
        normalized = '0' + normalized.substring(2);
      }

      const trimmedOwner = ownerName.trim();

      // Update the shop object locally so it reflects immediately
      shop.phone = normalized;
      if (trimmedOwner) {
        shop.ownerName = trimmedOwner;
      }

      // Always save to local shops cache first (so app refresh doesn't lose the number)
      await StorageService.updateShopPhoneInCache(shop.id, normalized, trimmedOwner || undefined);

      // Try to save to server
      try {
        await ApiService.updateShopPhone(shop.id, normalized, trimmedOwner || undefined);
      } catch (apiErr: any) {
        // API call failed (likely offline) — queue it for later sync
        console.warn('[PhoneInputModal] API save failed (offline?), queuing for sync:', apiErr?.message);
        await StorageService.addOfflinePhoneUpdate({
          shopId: shop.id,
          phone: normalized,
          ownerName: trimmedOwner || undefined,
          createdAt: new Date().toISOString(),
        });
      }

      onPhoneSaved(normalized, trimmedOwner || undefined);
    } catch (e: any) {
      setError(e.message || 'Failed to save number. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!shop) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.backdropFade, { opacity: opacityAnim }]} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.center}
      >
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <MaterialIcons name="phone-android" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Add Phone Number</Text>
            <Text style={styles.subtitle}>
              <Text style={styles.shopName}>{shop.name}</Text> has no phone number saved.
              Add a number to send recovery notification via SMS or WhatsApp.
            </Text>
          </View>

          {/* Owner Name Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Owner Name</Text>
            <View style={styles.ownerInputWrap}>
              <MaterialIcons name="person" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.ownerInput}
                value={ownerName}
                onChangeText={(text) => {
                  setOwnerName(text);
                }}
                placeholder="e.g. Muhammad Ali"
                placeholderTextColor={Colors.textMuted}
                maxLength={50}
              />
              {ownerName ? (
                <Pressable onPress={() => setOwnerName('')} style={styles.clearBtn} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Phone Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
              <View style={styles.countryCode}>
                <Text style={styles.countryCodeText}>+92</Text>
              </View>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(text) => {
                  setPhone(formatPhoneDisplay(text));
                  setError('');
                }}
                placeholder="3XX XXXXXXX"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
                maxLength={12}
                autoFocus
              />
              {phone ? (
                <Pressable onPress={() => setPhone('')} style={styles.clearBtn} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={14} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.hintText}>
              Enter shopkeeper's WhatsApp or phone number. Owner name and phone will be saved to the database.
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                (saving || !phone) && styles.saveBtnDisabled,
                pressed && !saving && phone && styles.saveBtnPressed,
              ]}
              onPress={handleSave}
              disabled={saving || !phone}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Save & Send Notification</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.skipBtn, pressed && styles.skipBtnPressed]}
              onPress={onSkip}
              disabled={saving}
            >
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
    padding: Spacing.lg,
    zIndex: 1,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 400,
    ...Shadow.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  shopName: {
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  inputSection: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  ownerInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    ...Shadow.sm,
  },
  ownerInput: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  inputWrapError: {
    borderColor: Colors.danger,
  },
  countryCode: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  countryCodeText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.primaryDark,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  clearBtn: {
    padding: Spacing.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    marginLeft: 4,
  },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  hintText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    lineHeight: 16,
  },
  buttons: {
    gap: Spacing.sm,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.border,
  },
  saveBtnPressed: {
    opacity: 0.85,
  },
  saveBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  skipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  skipBtnPressed: {
    opacity: 0.7,
  },
  skipBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
});
