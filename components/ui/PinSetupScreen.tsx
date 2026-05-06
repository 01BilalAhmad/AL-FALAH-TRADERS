// Powered by OnSpace.AI
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { SecureStorageService } from '@/services/secureStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PinSetupScreenProps {
  onPinSet: () => void;
}

type Step = 'enter' | 'confirm';

export function PinSetupScreen({ onPinSet }: PinSetupScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('enter');
  const [enteredPin, setEnteredPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [shakeAnim] = useState(new Animated.Value(0));

  const currentPin = step === 'enter' ? enteredPin : confirmPin;
  const setCurrentPin = step === 'enter' ? setEnteredPin : setConfirmPin;

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -1,
        duration: 100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const handleNumberPress = useCallback(
    (num: string) => {
      if (currentPin.length >= 4) return;
      setError('');
      const newPin = currentPin + num;
      setCurrentPin(newPin);

      if (newPin.length === 4) {
        if (step === 'enter') {
          // Move to confirm step
          setTimeout(() => setStep('confirm'), 200);
        } else {
          // Confirm step — check match
          if (newPin === enteredPin) {
            // PINs match — save and callback
            SecureStorageService.savePin(newPin).then(() => {
              onPinSet();
            });
          } else {
            // Mismatch — shake and reset
            setError('PINs do not match. Try again.');
            triggerShake();
            setConfirmPin('');
            setTimeout(() => setStep('enter'), 600);
            setEnteredPin('');
          }
        }
      }
    },
    [currentPin, step, enteredPin, setCurrentPin, onPinSet, triggerShake]
  );

  const handleBackspace = useCallback(() => {
    if (currentPin.length === 0) return;
    setCurrentPin(currentPin.slice(0, -1));
    setError('');
  }, [currentPin, setCurrentPin]);

  const shakeTranslate = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-12, 0, 12],
  });

  const renderPinIndicator = (index: number) => {
    const filled = index < currentPin.length;
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
    const isZero = num === '0';
    return (
      <Pressable
        key={num}
        style={({ pressed }) => [
          styles.numBtn,
          isZero && styles.numBtnZero,
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
          <MaterialIcons name={step === 'enter' ? 'lock-outline' : 'lock'} size={36} color="#FFFFFF" />
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {step === 'enter' ? 'Create PIN' : 'Confirm PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'enter'
            ? 'Choose a 4-digit PIN to secure your app'
            : 'Re-enter your PIN to confirm'}
        </Text>

        {/* PIN Dots */}
        <Animated.View
          style={[styles.pinDotsRow, { transform: [{ translateX: shakeTranslate }] }]}
        >
          {[0, 1, 2, 3].map(renderPinIndicator)}
        </Animated.View>

        {/* Error message */}
        {error ? (
          <View style={styles.errorWrap}>
            <MaterialIcons name="error-outline" size={16} color={Colors.dangerLight} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.errorPlaceholder} />
        )}

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, step === 'enter' && styles.stepDotActive]} />
          <View style={[styles.stepDot, step === 'confirm' && styles.stepDotActive]} />
        </View>

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
    lineHeight: 20,
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
  errorPlaceholder: {
    height: 40,
    marginBottom: Spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  stepDotActive: {
    backgroundColor: '#FFFFFF',
    width: 24,
    borderRadius: 4,
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
  numBtnZero: {
    // same as others
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
