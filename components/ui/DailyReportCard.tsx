import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from '@/utils/captureRef';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import { Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { getTodayLabel, formatPKR } from '@/utils/format';


interface DailyReportProps {
  visible: boolean;
  onClose: () => void;
  shopsVisited: number;
  totalShops: number;
  totalRecovery: number;
  smsSent: number;
  whatsappSent: number;
  pendingMessages: number;
  orderbookerName: string;
}

export function DailyReportCard({
  visible,
  onClose,
  shopsVisited,
  totalShops,
  totalRecovery,
  smsSent,
  whatsappSent,
  pendingMessages,
  orderbookerName,
}: DailyReportProps) {
  const cardRef = useRef<View>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const totalMessages = smsSent + whatsappSent;
  const todayLabel = getTodayLabel();
  const visitPct = totalShops > 0 ? Math.round((shopsVisited / totalShops) * 100) : 0;

  const buildTextMessage = () => {
    return [
      `📋 *Al FALAH Credit System*`,
      `📊 Daily Recovery Report`,
      ``,
      `📅 ${todayLabel}`,
      `👤 ${orderbookerName}`,
      ``,
      `🏪 Shops: ${shopsVisited}/${totalShops} visited (${visitPct}%)`,
      `💰 Recovery: ${formatPKR(totalRecovery)}`,
      `📩 SMS Shops: ${smsSent} | WA Shops: ${whatsappSent}`,
      pendingMessages > 0 ? `⚠️ ${pendingMessages} pending` : '',
      ``,
      `_Powered by Al FALAH Credit System_`,
    ].filter(Boolean).join('\n');
  };

  const handleShareAsImage = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      // Small delay to ensure layout is rendered
      await new Promise(r => setTimeout(r, 300));

      // Capture the card as a PNG image
      const imageUri = await captureRef(cardRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });

      if (!imageUri) {
        throw new Error('Image capture returned empty URI');
      }

      console.log('[DailyReport] Image captured at:', imageUri);

      // Use expo-sharing to open share sheet (WhatsApp, etc.)
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Sharing not available on this device');
      }

      await Sharing.shareAsync(imageUri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Daily Report',
        UTI: 'public.png',
      });
    } catch (error: any) {
      console.error('[DailyReport] Image capture/share failed:', error);

      // Fallback: Share as text via WhatsApp directly
      Alert.alert(
        'Image Share Failed',
        'Picture share nahi hua. Kya WhatsApp pe text bhejna hai?',
        [
          {
            text: 'WhatsApp Text Bhejo',
            onPress: () => {
              const msg = encodeURIComponent(buildTextMessage());
              Linking.openURL(`https://wa.me/?text=${msg}`);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setIsCapturing(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.backdropFade} />
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? undefined : 'padding'}
        style={styles.keyboardWrap}
      >
        <ScrollView
          contentContainerStyle={styles.scrollCenter}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            {/* Close button */}
            <Pressable style={styles.closeTop} onPress={onClose} hitSlop={12}>
              <View style={styles.closeTopBtn}>
                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.9)" />
              </View>
            </Pressable>

            {/* ============================================= */}
            {/* REPORT CARD — solid bg so captureRef works   */}
            {/* ============================================= */}
            <View ref={cardRef} collapsable={false} style={styles.card}>
              {/* Gradient overlay — pure View, not LinearGradient */}
              <View style={styles.gradientOverlayTop} />
              <View style={styles.gradientOverlayBottom} />

              {/* Brand Header */}
              <View style={styles.brandRow}>
                <View style={styles.brandIcon}>
                  <MaterialIcons name="account-balance" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.brandTextWrap}>
                  <Text style={styles.brandName}>Al FALAH Credit System</Text>
                  <Text style={styles.brandSub}>Daily Recovery Report</Text>
                </View>
              </View>

              {/* Separator */}
              <View style={styles.separator}>
                <View style={styles.sepLine} />
                <View style={styles.sepDiamond} />
                <View style={styles.sepLine} />
              </View>

              {/* Date & Name */}
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <MaterialIcons name="calendar-today" size={18} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.infoText}>{todayLabel}</Text>
                </View>
                <View style={styles.infoRow}>
                  <MaterialIcons name="person-outline" size={18} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.infoText}>{orderbookerName}</Text>
                </View>
              </View>

              {/* Big Divider */}
              <View style={styles.bigDivider} />

              {/* Main Stat - Visit Progress — BIGGER */}
              <View style={styles.mainStatCard}>
                <View style={styles.mainStatLeft}>
                  <Text style={styles.mainStatValue}>{shopsVisited}/{totalShops}</Text>
                  <Text style={styles.mainStatLabel}>SHOPS VISITED</Text>
                </View>
                <View style={styles.mainStatRight}>
                  <View style={styles.progressCircle}>
                    <Text style={styles.progressCircleText}>{visitPct}%</Text>
                  </View>
                </View>
              </View>

              {/* Recovery Amount — MUCH BIGGER */}
              <View style={styles.recoveryHighlight}>
                <View style={styles.recoveryIconWrap}>
                  <MaterialIcons name="payments" size={28} color="#FDE68A" />
                </View>
                <View style={styles.recoveryTextWrap}>
                  <Text style={styles.recoveryLabel}>TOTAL RECOVERY</Text>
                  <Text style={styles.recoveryAmount}>{formatPKR(totalRecovery)}</Text>
                </View>
              </View>

              {/* Stats Row — BIGGER CARDS */}
              <View style={styles.statsRow}>
                <View style={styles.statBlock}>
                  <View style={[styles.statBlockIcon, { backgroundColor: 'rgba(96,165,250,0.25)' }]}>
                    <MaterialIcons name="sms" size={22} color="#93C5FD" />
                  </View>
                  <Text style={styles.statBlockValue}>{smsSent}</Text>
                  <Text style={styles.statBlockLabel}>SMS Shops</Text>
                </View>

                <View style={styles.statBlock}>
                  <View style={[styles.statBlockIcon, { backgroundColor: 'rgba(74,222,128,0.25)' }]}>
                    <MaterialIcons name="chat" size={22} color="#86EFAC" />
                  </View>
                  <Text style={styles.statBlockValue}>{whatsappSent}</Text>
                  <Text style={styles.statBlockLabel}>WA Shops</Text>
                </View>

                <View style={styles.statBlock}>
                  <View style={[styles.statBlockIcon, { backgroundColor: 'rgba(250,204,21,0.25)' }]}>
                    <MaterialIcons name="notifications-active" size={22} color="#FDE68A" />
                  </View>
                  <Text style={styles.statBlockValue}>{totalMessages}</Text>
                  <Text style={styles.statBlockLabel}>Total Shops</Text>
                </View>

                <View style={styles.statBlock}>
                  <View style={[styles.statBlockIcon, { backgroundColor: pendingMessages > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(167,243,208,0.25)' }]}>
                    <MaterialIcons
                      name={pendingMessages > 0 ? 'warning' : 'check-circle'}
                      size={22}
                      color={pendingMessages > 0 ? '#FCA5A5' : '#A7F3D0'}
                    />
                  </View>
                  <Text style={[styles.statBlockValue, pendingMessages > 0 && { color: '#FCA5A5' }]}>
                    {pendingMessages}
                  </Text>
                  <Text style={styles.statBlockLabel}>Pending</Text>
                </View>
              </View>

              {/* Pending Warning */}
              {pendingMessages > 0 ? (
                <View style={styles.pendingBanner}>
                  <MaterialIcons name="error-outline" size={18} color="#FDE68A" />
                  <Text style={styles.pendingBannerText}>
                    {pendingMessages} message{pendingMessages > 1 ? 's' : ''} pending — send now!
                  </Text>
                </View>
              ) : null}

              {/* Footer */}
              <View style={styles.footer}>
                <View style={styles.footerDivider} />
                <Text style={styles.footerText}>
                  {todayLabel} · Al FALAH Credit System
                </Text>
              </View>
            </View>

            {/* Share Button */}
            <Pressable
              style={[styles.shareBtn, isCapturing && styles.shareBtnDisabled]}
              onPress={handleShareAsImage}
              disabled={isCapturing}
            >
              <View style={[styles.shareBtnInner, isCapturing && styles.shareBtnInnerDisabled]}>
                {isCapturing ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.shareBtnText}>Generating Image...</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="share" size={22} color="#FFFFFF" />
                    <Text style={styles.shareBtnText}>Share as Picture</Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>
        </ScrollView>
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
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    zIndex: 1,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    position: 'relative',
  },
  closeTop: {
    position: 'absolute',
    top: -4,
    right: 0,
    zIndex: 10,
  },
  closeTopBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== REPORT CARD (Solid bg for captureRef) =====
  card: {
    borderRadius: Radius.xl,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#1D4ED8',
    overflow: 'hidden',
    ...Shadow.lg,
  },
  gradientOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(5,150,105,0.5)',
    borderRadius: Radius.xl,
  },
  gradientOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: Radius.xl,
  },

  // Brand
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  brandIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextWrap: {
    flex: 1,
  },
  brandName: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
    fontWeight: FontWeight.medium,
  },
  // Separator
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  sepLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  sepDiamond: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ rotate: '45deg' }],
  },
  // Info
  infoSection: {
    gap: 6,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: FontWeight.medium,
  },
  // Big Divider
  bigDivider: {
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  // Main Stat - Visited — BIGGER
  mainStatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: Radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 1,
  },
  mainStatLeft: {
    flex: 1,
  },
  mainStatValue: {
    fontSize: 36,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  mainStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  mainStatRight: {
    alignItems: 'center',
  },
  progressCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(167,243,208,0.2)',
    borderWidth: 3,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleText: {
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#A7F3D0',
  },
  // Recovery Highlight — MUCH BIGGER
  recoveryHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(250,204,21,0.25)',
    zIndex: 1,
  },
  recoveryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(250,204,21,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryTextWrap: {
    flex: 1,
  },
  recoveryLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
    marginBottom: 2,
  },
  recoveryAmount: {
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: '#FDE68A',
  },
  // Stats Row — BIGGER VERTICAL CARDS
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statBlockIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statBlockValue: {
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  statBlockLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  // Pending Warning
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.25)',
    zIndex: 1,
  },
  pendingBannerText: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: '#FDE68A',
    flex: 1,
  },
  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.xs,
    zIndex: 1,
  },
  footerDivider: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.sm,
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: FontWeight.medium,
  },

  // ===== Share Button =====
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
    backgroundColor: '#1D4ED8',
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
