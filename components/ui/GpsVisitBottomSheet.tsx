// Powered by OnSpace.AI
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { Shop } from '@/services/api';

interface GpsVisitBottomSheetProps {
  visible: boolean;
  shop: Shop | null;
  onClose: () => void;
  onVisitMarked: (shopId: string, gpsLat: number, gpsLng: number, address: string) => void;
}

function getOsmStaticUrl(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=600x260&markers=${lat},${lng},red`;
}

function GpsSuccessPulse() {
  const scale = React.useRef(new Animated.Value(0.5)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[successStyles.container, { opacity, transform: [{ scale }] }]}>
      <View style={successStyles.ring1} />
      <View style={successStyles.ring2} />
      <View style={successStyles.iconWrap}>
        <MaterialIcons name="check" size={36} color={Colors.primary} />
      </View>
      <Text style={successStyles.title}>GPS Visit Marked!</Text>
      <Text style={successStyles.subtitle}>Your location has been recorded</Text>
    </Animated.View>
  );
}
const successStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  ring1: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primaryLight,
    opacity: 0.4,
  },
  ring2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight,
    opacity: 0.6,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
    zIndex: 1,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});

type VisitState = 'idle' | 'capturing' | 'success';

export function GpsVisitBottomSheet({
  visible,
  shop,
  onClose,
  onVisitMarked,
}: GpsVisitBottomSheetProps) {
  const [visitState, setVisitState] = useState<VisitState>('idle');
  const [gpsLat, setGpsLat] = useState<number | undefined>();
  const [gpsLng, setGpsLng] = useState<number | undefined>();
  const [gpsAddress, setGpsAddress] = useState<string | undefined>();
  const [mapLoading, setMapLoading] = useState(false);

  const reset = useCallback(() => {
    setVisitState('idle');
    setGpsLat(undefined);
    setGpsLng(undefined);
    setGpsAddress(undefined);
    setMapLoading(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (visible && shop) {
      reset();
      // Auto-capture GPS when sheet opens
      captureGPS();
    }
  }, [visible, shop]);

  const captureGPS = async () => {
    setVisitState('capturing');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for GPS visit.');
        setVisitState('idle');
        return;
      }

      let loc: Location.LocationObject | null = null;

      // Try with Balanced accuracy first, then fall back to Low
      for (const accuracy of [Location.Accuracy.Balanced, Location.Accuracy.Low]) {
        try {
          loc = await Location.getCurrentPositionAsync({
            accuracy,
            timeInterval: 15000,
          });
          break; // success — exit loop
        } catch (e) {
          console.warn(`[GPS] Failed with accuracy ${accuracy}, retrying...`, e);
        }
      }

      if (!loc) {
        // Final fallback: try getting last known position
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown) {
            loc = lastKnown;
          }
        } catch { /* ignore */ }
      }

      if (!loc) {
        Alert.alert('GPS Error', 'Could not get location. Please ensure GPS is enabled and you are outdoors, then try again.');
        setVisitState('idle');
        return;
      }

      setGpsLat(loc.coords.latitude);
      setGpsLng(loc.coords.longitude);
      setMapLoading(true);

      // Reverse geocoding is optional — may fail offline
      let address = '';
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geo) {
          const parts = [geo.street, geo.district, geo.city].filter(Boolean);
          address = parts.join(', ');
          setGpsAddress(address);
        }
      } catch {
        // Offline: skip address, coordinates are enough
        setGpsAddress(undefined);
      }

      setVisitState('success');
      if (shop) {
        onVisitMarked(shop.id, loc.coords.latitude, loc.coords.longitude, address);
      }
    } catch {
      Alert.alert('GPS Error', 'Could not get location. Make sure GPS is enabled and try again.');
      setVisitState('idle');
    }
  };

  if (!shop) return null;

  const mapUrl = gpsLat && gpsLng ? getOsmStaticUrl(gpsLat, gpsLng) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <LinearGradient
            colors={['#2563EB', '#1D4ED8', '#1E40AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerBubble1} />
            <View style={styles.headerBubble2} />
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.shopAvatarWrap}>
                  <Text style={styles.shopAvatarText}>{shop.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.title}>GPS Store Visit</Text>
                  <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
                </View>
              </View>
              <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.9)" />
              </Pressable>
            </View>
          </LinearGradient>

          <View style={styles.content}>
            {visitState === 'capturing' ? (
              <View style={styles.capturingContainer}>
                <View style={styles.capturingPulseWrap}>
                  <View style={styles.capturingOuter} />
                  <View style={styles.capturingInner} />
                  <ActivityIndicator size="large" color={Colors.primary} />
                </View>
                <Text style={styles.capturingTitle}>Getting your location...</Text>
                <Text style={styles.capturingSubtitle}>
                  Please wait while we capture your GPS coordinates
                </Text>
              </View>
            ) : visitState === 'success' && gpsLat && gpsLng ? (
              <View style={styles.successContainer}>
                <GpsSuccessPulse />

                {/* Map */}
                <View style={styles.mapContainer}>
                  {mapLoading ? (
                    <View style={styles.mapLoader}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.mapLoaderText}>Loading map...</Text>
                    </View>
                  ) : null}
                  {mapUrl ? (
                    <Image
                      source={{ uri: mapUrl }}
                      style={[styles.mapImage, mapLoading && { opacity: 0 }]}
                      contentFit="cover"
                      transition={300}
                      onLoad={() => setMapLoading(false)}
                      onError={() => setMapLoading(false)}
                    />
                  ) : null}
                  <View style={styles.mapPinOverlay}>
                    <View style={styles.mapPin}>
                      <MaterialIcons name="location-on" size={28} color={Colors.danger} />
                    </View>
                  </View>
                  <View style={styles.mapZoomBadge}>
                    <MaterialIcons name="satellite-alt" size={12} color={Colors.textInverse} />
                    <Text style={styles.mapZoomText}>GPS Captured</Text>
                  </View>
                </View>

                {/* Coordinates */}
                <View style={styles.coordsCard}>
                  <View style={styles.coordsRow}>
                    <MaterialIcons name="gps-fixed" size={16} color={Colors.primary} />
                    <Text style={styles.coordsText}>
                      {gpsLat.toFixed(5)}, {gpsLng.toFixed(5)}
                    </Text>
                  </View>
                  {gpsAddress ? (
                    <View style={styles.addressRow}>
                      <MaterialIcons name="place" size={14} color={Colors.textSecondary} />
                      <Text style={styles.addressText} numberOfLines={2}>{gpsAddress}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Done button */}
                <Pressable
                  style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
                  onPress={handleClose}
                >
                  <MaterialIcons name="check-circle" size={20} color={Colors.textInverse} />
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.idleContainer}>
                <Pressable
                  style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
                  onPress={captureGPS}
                >
                  <MaterialIcons name="my-location" size={28} color={Colors.primary} />
                  <Text style={styles.retryBtnTitle}>Retry GPS Capture</Text>
                  <Text style={styles.retryBtnSub}>Tap to get your current location</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  keyboardView: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    maxHeight: '85%',
    ...Shadow.lg,
  },
  handle: {
    width: 44,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  // Header
  headerGradient: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    overflow: 'hidden',
  },
  headerBubble1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -40,
    right: -20,
  },
  headerBubble2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -20,
    left: -10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  shopAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopAvatarText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  shopName: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
    maxWidth: 200,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Content
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.lg,
  },
  // Capturing state
  capturingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },
  capturingPulseWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  capturingOuter: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  capturingInner: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  capturingTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  capturingSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
  },
  // Success state
  successContainer: {
    paddingTop: Spacing.md,
  },
  mapContainer: {
    height: 180,
    backgroundColor: '#E5E7EB',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
    position: 'relative',
    ...Shadow.md,
  },
  mapLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    gap: Spacing.xs,
    zIndex: 1,
  },
  mapLoaderText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  mapPin: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 4,
    ...Shadow.md,
  },
  mapZoomBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.85)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mapZoomText: {
    fontSize: 11,
    color: Colors.textInverse,
    fontWeight: FontWeight.semibold,
  },
  coordsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  coordsText: {
    fontSize: FontSize.sm,
    color: Colors.primaryDark,
    fontWeight: FontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  addressText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    marginTop: Spacing.lg,
    ...Shadow.md,
  },
  doneBtnPressed: { opacity: 0.88 },
  doneBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  // Idle/retry
  idleContainer: {
    paddingVertical: Spacing.xl,
  },
  retryBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  retryBtnPressed: { opacity: 0.85 },
  retryBtnTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  retryBtnSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
});
