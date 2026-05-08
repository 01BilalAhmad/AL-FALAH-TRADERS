// Bismillah Splash Screen — Shows "بسم الله الرحمن الرحیم" for 3 seconds on app startup
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface BismillahSplashProps {
  onFinish: () => void;
}

export function BismillahSplash({ onFinish }: BismillahSplashProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Fade in animation
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        {/* Bismillah Arabic Text */}
        <Text style={styles.bismillahText}>بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</Text>

        {/* Decorative line */}
        <View style={styles.decorativeLine}>
          <View style={styles.lineSegment} />
          <View style={styles.diamond} />
          <View style={styles.lineSegment} />
        </View>

        {/* App name */}
        <Text style={styles.appName}>Al FALAH Credit System</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1D4ED8',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  bismillahText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 52,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  decorativeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  lineSegment: {
    width: 40,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  diamond: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
    transform: [{ rotate: '45deg' }],
  },
  appName: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1,
  },
});
