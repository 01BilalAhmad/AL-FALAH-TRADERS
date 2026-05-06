// Al FALAH Credit System
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { Shop, CompanyBalance } from '@/services/api';
import { formatPKR } from '@/utils/format';

// Helper: get display balance for a shop based on the user's assigned company
export function getShopDisplayBalance(shop: Shop, companyId?: string): { balance: number; creditLimit: number } {
  if (companyId && shop.companyBalances && shop.companyBalances.length > 0) {
    const companyBal = shop.companyBalances.find((cb: CompanyBalance) => cb.companyId === companyId);
    if (companyBal) {
      return { balance: companyBal.balance, creditLimit: companyBal.creditLimit || shop.creditLimit };
    }
  }
  return { balance: shop.balance, creditLimit: shop.creditLimit };
}

interface ShopCardProps {
  shop: Shop;
  isVisited: boolean;
  hasRecovery?: boolean; // Whether recovery has been submitted for this shop today
  onCollect: () => void;
  onPress: () => void;
  onGpsVisit?: () => void;
  companyId?: string;
}

export const ShopCard = memo(function ShopCard({
  shop,
  isVisited,
  hasRecovery = false,
  onCollect,
  onPress,
  onGpsVisit,
  companyId,
}: ShopCardProps) {
  const { balance: displayBalance, creditLimit: displayCreditLimit } = getShopDisplayBalance(shop, companyId);
  const isOverLimit = displayBalance > displayCreditLimit;
  const rawUtilisation = displayCreditLimit > 0 ? (displayBalance / displayCreditLimit) * 100 : 0;
  const utilisation = Math.min(rawUtilisation, 100);
  const isApproachingLimit = !isOverLimit && rawUtilisation >= 90;
  const isZeroBalance = displayBalance === 0;
  const barColor = isOverLimit ? Colors.danger : rawUtilisation >= 90 ? Colors.secondary : utilisation > 80 ? Colors.secondary : Colors.primary;

  // Recovery submitted = blue accent, visited (GPS only) = lighter blue
  const showRecoveryAccent = hasRecovery;

  // Pulsing dot animation for 90%+ utilization
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (rawUtilisation >= 90) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.6,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [rawUtilisation >= 90]);

  const handleCall = () => {
    if (shop.phone) Linking.openURL(`tel:${shop.phone}`);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        showRecoveryAccent && styles.cardRecoverySubmitted,
        isVisited && !showRecoveryAccent && styles.cardVisited,
        isZeroBalance && !showRecoveryAccent && styles.cardZeroBalance,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      {/* Recovery submitted indicator - blue left stripe */}
      {showRecoveryAccent && <View style={styles.recoveryStripe} />}
      {/* Visited indicator - lighter blue stripe (only if no recovery) */}
      {isVisited && !showRecoveryAccent && <View style={styles.visitedStripe} />}

      {/* Top row: Avatar + Info + Balance */}
      <View style={styles.topRow}>
        <View style={[
          styles.shopAvatar,
          showRecoveryAccent && styles.shopAvatarRecovery,
          isVisited && !showRecoveryAccent && styles.shopAvatarVisited,
        ]}>
          <Text style={[
            styles.shopAvatarText,
            showRecoveryAccent && styles.shopAvatarTextRecovery,
            isVisited && !showRecoveryAccent && styles.shopAvatarTextVisited,
          ]}>
            {shop.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.shopInfo}>
          <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
          <Text style={styles.shopMeta} numberOfLines={1}>
            {shop.ownerName}  ·  {shop.area}
          </Text>
        </View>
        <View style={styles.balanceCol}>
          <Text style={[styles.balance, { color: displayBalance > 0 ? Colors.danger : Colors.success }]}>
            {formatPKR(displayBalance)}
          </Text>
          {showRecoveryAccent ? (
            <View style={styles.recoveryBadge}>
              <MaterialIcons name="check-circle" size={11} color="#FFFFFF" />
              <Text style={styles.recoveryBadgeText}>Recovery Added</Text>
            </View>
          ) : isVisited ? (
            <View style={styles.visitedBadge}>
              <MaterialIcons name="check-circle" size={11} color={Colors.primary} />
              <Text style={styles.visitedText}>Visited</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Over limit banner */}
      {isOverLimit ? (
        <View style={styles.overLimitBanner}>
          <Animated.View style={[styles.pulseDot, { transform: [{ scale: pulseAnim }] }]} />
          <MaterialIcons name="warning" size={13} color={Colors.danger} />
          <Text style={styles.overLimitText}>Over Credit Limit</Text>
        </View>
      ) : isApproachingLimit ? (
        <View style={styles.approachingLimitBanner}>
          <Animated.View style={[styles.pulseDotYellow, { transform: [{ scale: pulseAnim }] }]} />
          <MaterialIcons name="warning" size={13} color={Colors.secondary} />
          <Text style={styles.approachingLimitText}>Credit utilization at 90% — approaching limit</Text>
        </View>
      ) : isZeroBalance ? (
        <View style={styles.zeroBalanceBanner}>
          <MaterialIcons name="check-circle" size={13} color={Colors.success} />
          <Text style={styles.zeroBalanceText}>Balance Clear</Text>
        </View>
      ) : null}

      {/* Credit utilisation bar */}
      <View style={styles.creditRow}>
        <View style={styles.creditTrack}>
          <View style={[styles.creditFill, { width: `${utilisation}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={[styles.creditPct, { color: barColor }]}>
          {utilisation.toFixed(0)}%
        </Text>
      </View>
      <Text style={styles.creditLabel}>
        Credit: {formatPKR(displayBalance)} / {formatPKR(displayCreditLimit)}
      </Text>

      {/* Actions */}
      <View style={styles.actions}>
        {hasRecovery ? (
          // Already recovered today - show disabled button
          <View style={styles.recoveryDoneBtn}>
            <MaterialIcons name="check" size={16} color="#FFFFFF" />
            <Text style={styles.recoveryDoneBtnText}>Recovery Added</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.collectBtn,
              isZeroBalance && styles.collectBtnDisabled,
              pressed && !isZeroBalance && styles.collectBtnPressed,
            ]}
            onPress={onCollect}
            hitSlop={4}
            disabled={isZeroBalance}
          >
            <MaterialIcons name="payments" size={16} color={isZeroBalance ? Colors.textMuted : Colors.textInverse} />
            <Text style={[styles.collectBtnText, isZeroBalance && { color: Colors.textMuted }]}>
              {isZeroBalance ? 'No Balance' : 'Collect Recovery'}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.gpsBtn, isVisited && styles.gpsBtnVisited, pressed && styles.gpsBtnPressed]}
          onPress={onGpsVisit}
          hitSlop={4}
        >
          <MaterialIcons
            name={isVisited ? 'check-circle' : 'my-location'}
            size={18}
            color={isVisited ? Colors.primary : Colors.blue}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.callBtn, pressed && styles.callBtnPressed]}
          onPress={handleCall}
          hitSlop={4}
        >
          <MaterialIcons name="call" size={18} color={Colors.primary} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.detailBtn, pressed && styles.detailBtnPressed]}
          onPress={onPress}
          hitSlop={4}
        >
          <MaterialIcons name="info-outline" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    position: 'relative',
  },
  // Recovery submitted - blue accent card
  cardRecoverySubmitted: {
    borderColor: '#2563EB',
    borderWidth: 1.5,
    backgroundColor: '#F0F7FF',
  },
  cardVisited: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: '#FAFBFF',
  },
  cardZeroBalance: {
    opacity: 0.75,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  // Recovery submitted stripe - prominent blue
  recoveryStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#2563EB',
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  visitedStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingLeft: 2,
  },
  shopAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopAvatarRecovery: {
    backgroundColor: '#2563EB',
  },
  shopAvatarVisited: {
    backgroundColor: Colors.primary,
  },
  shopAvatarText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.primaryDark,
  },
  shopAvatarTextRecovery: {
    color: '#FFFFFF',
  },
  shopAvatarTextVisited: {
    color: Colors.textInverse,
  },
  shopInfo: {
    flex: 1,
  },
  shopName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  shopMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  balanceCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  balance: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  // Recovery submitted badge - blue filled
  recoveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#2563EB',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recoveryBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  visitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  visitedText: {
    fontSize: 10,
    color: Colors.primaryDark,
    fontWeight: FontWeight.semibold,
  },
  overLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dangerLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  overLimitText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  approachingLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondaryLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  approachingLimitText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.semibold,
    flex: 1,
  },
  zeroBalanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  zeroBalanceText: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  pulseDotYellow: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.secondary,
  },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 3,
    marginLeft: 2,
  },
  creditTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  creditFill: {
    height: 6,
    borderRadius: Radius.full,
  },
  creditPct: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    minWidth: 32,
    textAlign: 'right',
  },
  creditLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    marginLeft: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
    marginLeft: 2,
  },
  // Recovery already done - blue filled button
  recoveryDoneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
  },
  recoveryDoneBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: '#FFFFFF',
  },
  collectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
  },
  collectBtnDisabled: {
    backgroundColor: Colors.border,
  },
  collectBtnPressed: { opacity: 0.85 },
  collectBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textInverse,
  },
  gpsBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.blueLight,
  },
  gpsBtnVisited: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  gpsBtnPressed: { opacity: 0.7 },
  callBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  callBtnPressed: { opacity: 0.7 },
  detailBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  detailBtnPressed: { opacity: 0.7 },
});
