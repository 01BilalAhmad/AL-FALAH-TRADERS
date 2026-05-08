// Powered by OnSpace.AI
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { formatPKR } from '@/utils/format';

interface SuccessOverlayProps {
  visible: boolean;
  shopName: string;
  amount: number;
  isOffline?: boolean;
  onDismiss: () => void;
  onUndo?: () => void;
}

const UNDO_WINDOW_MS = 4000;

export function SuccessOverlay({ visible, shopName, amount, isOffline, onDismiss, onUndo }: SuccessOverlayProps) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const undoOpacity = useRef(new Animated.Value(1)).current;
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      // Reset undo state
      setShowUndo(!!onUndo);
      undoOpacity.setValue(1);

      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      // Auto-hide undo button after UNDO_WINDOW_MS
      if (onUndo) {
        undoTimerRef.current = setTimeout(() => {
          Animated.timing(undoOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => setShowUndo(false));
        }, UNDO_WINDOW_MS);
      }

      // Auto-dismiss overlay after 2.5s so SMS popup can appear quickly
      dismissTimerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(onDismiss);
      }, 2500);

      return () => {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    } else {
      scale.setValue(0.5);
      opacity.setValue(0);
      setShowUndo(false);
    }
  }, [visible]);

  const handleUndo = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    // Fade out quickly then call onUndo
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onUndo?.();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="check-circle" size={56} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Recovery Submitted!</Text>
          <Text style={styles.amount}>{formatPKR(amount)}</Text>
          <Text style={styles.shopName} numberOfLines={1}>
            from {shopName}
          </Text>
          <View style={styles.pendingBadge}>
            <MaterialIcons name="schedule" size={14} color={Colors.secondary} />
            <Text style={styles.pendingText}>
              {isOffline ? 'Saved offline — will sync when online' : 'Pending admin approval'}
            </Text>
          </View>

          {/* Undo Button */}
          {showUndo && onUndo ? (
            <Animated.View style={{ opacity: undoOpacity }}>
              <Pressable style={styles.undoButton} onPress={handleUndo}>
                <MaterialIcons name="undo" size={16} color={Colors.danger} />
                <Text style={styles.undoText}>Undo</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  amount: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    marginBottom: 4,
  },
  shopName: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.secondaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  pendingText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.dangerLight,
  },
  undoText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.danger,
  },
});
