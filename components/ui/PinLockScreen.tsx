// Powered by OnSpace.AI
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { SecureStorageService } from '@/services/secureStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MAX_WRONG_ATTEMPTS = 5;

interface PinLockScreenProps {
  onUnlock: () => void;
  onForceLogout: () => void;
}

export function PinLockScreen({ onUnlock, onForceLogout }: PinLockScreenProps) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [shakeAnim] = useState(new Animated.Value(0));

  // Check biometric availability on mount
  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricAvailable(hasHardware && isEnrolled);
    })();

    // Load current wrong attempt count
    SecureStorageService.getWrongAttempts().then(setWrongAttempts);
  }, []);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -1,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -0.5,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const handleWrongPin = useCallback(async () => {
    const newCount = await SecureStorageService.incrementWrongAttempts();
    setWrongAttempts(newCount);
    setError(`Wrong PIN. ${newCount} of ${MAX_WRONG_ATTEMPTS} attempts.`);
    triggerShake();
    setPin('');

    if (newCount >= MAX_WRONG_ATTEMPTS) {
      // Force logout after max attempts
      Alert.alert(
        'Too Many Attempts',
        'You have entered the wrong PIN 5 times. Please log in again with your credentials.',
        [
          {
            text: 'OK',
            onPress: () => {
              SecureStorageService.clearAll().then(() => {
                onForceLogout();
              });
            },
          },
        ],
        { cancelable: false }
      );
    }
  }, [triggerShake, onForceLogout]);

  const handleNumberPress = useCallback(
    (num: string) => {
      if (pin.length >= 4) return;
      setError('');
      const newPin = pin + num;
      setPin(newPin);

      if (newPin.length === 4) {
        // Verify PIN
        SecureStorageService.getPin().then(async (storedPin) => {
          if (newPin === storedPin) {
            // Correct PIN
            await SecureStorageService.resetWrongAttempts();
            setWrongAttempts(0);
            onUnlock();
          } else {
            // Wrong PIN
            handleWrongPin();
          }
        });
      }
    },
    [pin, onUnlock, handleWrongPin]
  );

  const handleBackspace = useCallback(() => {
    if (pin.length === 0) return;
    setPin(pin.slice(0, -1));
    setError('');
  }, [pin]);

  const handleBiometric = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Al Falah',
        fallbackLabel: 'Use PIN',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        await SecureStorageService.resetWrongAttempts();
        setWrongAttempts(0);
        onUnlock();
      }
    } catch {
      // Biometric failed, user can still use PIN
    }
  }, [onUnlock]);

  const shakeTranslate = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-14, 0, 14],
  });

  const renderPinIndicator = (index: number) => {
    const filled = index < pin.length;
    return (
      <View
        key={index}
        style={[
          styles.pinDotOutline,
          filled && styles.pinDotFilled,
          error ? styles.pinDotError : null,
        ]}
      >
        {filled && <View style={[styles.pinDotInner, error && styles.pinDotInnerError]} />}
      </View>
    );
  };

  const renderNumberButton = (num: string) => {
    return (
      <Pressable
        key={num}
        style={({ pressed }) => [
          styles.numBtn,
          pressed && styles.numBtnPressed,
        ]}
        onPress={() => handleNumberPress(num)}
        android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true }}
      >
        <Text style={styles.numBtnText}>{num}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={['#2563EB', '#1E40AF', '#064E3B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative circles */}
      <View style={styles.bubble1} />
      <View style={styles.bubble2} />

      {/* Content */}
      <View style={styles.content}>
        {/* Lock Icon */}
        <View style={styles.lockIconWrap}>
          <MaterialIcons name="lock" size={36} color="#FFFFFF" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Enter PIN</Text>
        <Text style={styles.subtitle}>Enter your 4-digit PIN to unlock</Text>

        {/* PIN Dots */}
        <Animated.View
          style={[styles.pinDotsRow, { transform: [{ translateX: shakeTranslate }] }]}
        >
          {[0, 1, 2, 3].map(renderPinIndicator)}
        </Animated.View>

        {/* Error / Attempt info */}
        {error ? (
          <View style={styles.errorWrap}>
            <MaterialIcons name="error-outline" size={16} color={Colors.dangerLight} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : wrongAttempts > 0 ? (
          <Text style={styles.attemptHint}>
            {wrongAttempts} of {MAX_WRONG_ATTEMPTS} attempts used
          </Text>
        ) : (
          <View style={styles.errorPlaceholder} />
        )}

        {/* Biometric Button */}
        {isBiometricAvailable ? (
          <Pressable
            style={({ pressed }) => [
              styles.biometricBtn,
              pressed && styles.biometricBtnPressed,
            ]}
            onPress={handleBiometric}
          >
            <MaterialIcons name="fingerprint" size={24} color="#FFFFFF" />
            <Text style={styles.biometricBtnText}>Use Fingerprint</Text>
          </Pressable>
        ) : null}

        {/* Number pad */}
        <View style={styles.numpad}>
          <View style={styles.numpadRow}>
            {['1', '2', '3'].map(renderNumberButton)}
          </View>
          <View style={styles.numpadRow}>
            {['4', '5', '6'].map(renderNumberButton)}
          </View>
          <View style={styles.numpadRow}>
            {['7', '8', '9'].map(renderNumberButton)}
          </View>
          <View style={styles.numpadRow}>
            <View style={styles.numBtnPlaceholder} />
            {renderNumberButton('0')}
            <Pressable
              style={({ pressed }) => [
                styles.numBtn,
                pressed && styles.numBtnPressed,
              ]}
              onPress={handleBackspace}
              android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true }}
            >
              <MaterialIcons name="backspace" size={26} color={Colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const NUM_BTN_SIZE = Math.min(72, (SCREEN_WIDTH - 80) / 3 - 8);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bubble1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -100,
    right: -80,
  },
  bubble2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: 80,
    left: -60,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  lockIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  pinDotOutline: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotFilled: {
    borderColor: '#FFFFFF',
  },
  pinDotError: {
    borderColor: Colors.dangerLight,
  },
  pinDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  pinDotInnerError: {
    backgroundColor: Colors.dangerLight,
  },
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.dangerLight,
    fontWeight: FontWeight.medium,
  },
  attemptHint: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: Spacing.md,
  },
  errorPlaceholder: {
    height: 40,
    marginBottom: Spacing.md,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.lg,
  },
  biometricBtnPressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  biometricBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: '#FFFFFF',
  },
  numpad: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  numpadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  numBtn: {
    width: NUM_BTN_SIZE,
    height: NUM_BTN_SIZE,
    borderRadius: NUM_BTN_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  numBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  numBtnText: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  numBtnPlaceholder: {
    width: NUM_BTN_SIZE,
    height: NUM_BTN_SIZE,
  },
});
