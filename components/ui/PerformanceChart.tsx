// Powered by OnSpace.AI
import React, { memo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { ApiService } from '@/services/api';
import { formatPKR } from '@/utils/format';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_W = SCREEN_WIDTH - Spacing.md * 4;

interface DailyData {
  label: string;
  amount: number;
}

interface PerformanceChartProps {
  userId: string;
}

export const PerformanceChart = memo(function PerformanceChart({ userId }: PerformanceChartProps) {
  const [data, setData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalWeek, setTotalWeek] = useState(0);
  const [totalMonth, setTotalMonth] = useState(0);
  const [trend, setTrend] = useState<'up' | 'down' | 'flat'>('flat');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadData();
  }, [userId]);

  useEffect(() => {
    if (!loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [loading]);

  async function loadData() {
    setLoading(true);
    try {
      const now = new Date();
      const days: DailyData[] = [];
      let weekTotal = 0;

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-PK', { weekday: 'short' }).slice(0, 3);
        try {
          const res = await ApiService.getTransactions({
            createdBy: userId,
            type: 'recovery',
            date: dateStr,
            limit: 200,
          });
          const dayTotal = res.transactions.reduce((s, t) => s + t.amount, 0);
          days.push({ label, amount: dayTotal });
          weekTotal += dayTotal;
        } catch {
          days.push({ label, amount: 0 });
        }
      }

      // Trend: compare last 3 days vs first 3
      const first3 = days.slice(0, 3).reduce((s, d) => s + d.amount, 0);
      const last3 = days.slice(4).reduce((s, d) => s + d.amount, 0);
      setTrend(last3 > first3 * 1.1 ? 'up' : last3 < first3 * 0.9 ? 'down' : 'flat');

      // Month total
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      try {
        const monthRes = await ApiService.getTransactions({
          createdBy: userId,
          type: 'recovery',
          date: firstOfMonth,
          limit: 500,
        });
        setTotalMonth(monthRes.transactions.reduce((s, t) => s + t.amount, 0));
      } catch {
        setTotalMonth(0);
      }

      setData(days);
      setTotalWeek(weekTotal);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  const chartValues = data.map((d) => Math.max(d.amount, 0));
  const hasData = chartValues.some((v) => v > 0);
  const chartLabels = data.map((d) => d.label);
  const maxVal = Math.max(...chartValues, 1);

  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'trending-flat';
  const trendColor = trend === 'up' ? '#A7F3D0' : trend === 'down' ? '#FCA5A5' : 'rgba(255,255,255,0.7)';

  return (
    <View style={styles.card}>
      {/* Gradient header strip */}
      <LinearGradient
        colors={['#2563EB', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerStrip}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerLabel}>Recovery Trend</Text>
            <Text style={styles.headerSub}>Last 7 days</Text>
          </View>
          <View style={styles.trendChip}>
            <MaterialIcons name={trendIcon} size={15} color={trendColor} />
            <Text style={[styles.trendLabel, { color: trendColor }]}>
              {trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Steady'}
            </Text>
          </View>
        </View>

        {/* Inline KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{formatPKR(totalWeek)}</Text>
            <Text style={styles.kpiLabel}>This Week</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: '#FDE68A' }]}>{formatPKR(totalMonth)}</Text>
            <Text style={styles.kpiLabel}>This Month</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            {totalWeek > 0 ? (
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={styles.activeDot} />
              </Animated.View>
            ) : (
              <View style={[styles.activeDot, { backgroundColor: '#6B7280' }]} />
            )}
            <Text style={styles.kpiLabel}>{totalWeek > 0 ? 'Active' : 'No activity'}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Chart body */}
      <View style={styles.chartBody}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : !hasData ? (
          <View style={styles.emptyBox}>
            <MaterialIcons name="bar-chart" size={40} color={Colors.borderLight} />
            <Text style={styles.emptyText}>No recoveries this week</Text>
          </View>
        ) : (
          <LineChart
            data={{
              labels: chartLabels,
              datasets: [
                {
                  data: chartValues,
                  color: (opacity = 1) => `rgba(5,150,105,${opacity})`,
                  strokeWidth: 2.5,
                },
              ],
            }}
            width={CHART_W}
            height={150}
            yAxisLabel=""
            yAxisSuffix=""
            formatYLabel={(v) => {
              const n = parseFloat(v);
              if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
              if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
              return String(Math.round(n));
            }}
            chartConfig={{
              backgroundColor: Colors.surface,
              backgroundGradientFrom: Colors.surface,
              backgroundGradientTo: Colors.surface,
              backgroundGradientFromOpacity: 0,
              backgroundGradientToOpacity: 0,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
              labelColor: () => Colors.textMuted,
              style: { borderRadius: 8 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: Colors.primaryDark,
                fill: Colors.surface,
              },
              propsForBackgroundLines: {
                stroke: Colors.borderLight,
                strokeWidth: 1,
              },
              fillShadowGradientFrom: Colors.primary,
              fillShadowGradientFromOpacity: 0.25,
              fillShadowGradientTo: Colors.surface,
              fillShadowGradientToOpacity: 0,
            }}
            bezier
            style={styles.chart}
            withInnerLines
            withOuterLines={false}
            withVerticalLines={false}
            withShadow
          />
        )}
      </View>

      {/* Day-by-day micro bars */}
      {hasData && !loading ? (
        <View style={styles.microBars}>
          {data.map((item, idx) => {
            const pct = maxVal > 0 ? item.amount / maxVal : 0;
            const isToday = idx === data.length - 1;
            return (
              <View key={idx} style={styles.microBarCol}>
                <View style={styles.microBarTrack}>
                  <View
                    style={[
                      styles.microBarFill,
                      {
                        height: `${Math.max(pct * 100, item.amount > 0 ? 8 : 2)}%`,
                        backgroundColor: isToday ? Colors.primary : Colors.primaryLight,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.microBarLabel, isToday && styles.microBarLabelToday]}>
                  {item.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadow.md,
  },
  headerStrip: {
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
  },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trendLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  kpiDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  kpiValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  kpiLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#A7F3D0',
  },
  chartBody: {
    padding: Spacing.sm,
    paddingBottom: 0,
  },
  chart: {
    borderRadius: Radius.md,
  },
  loadingBox: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  emptyBox: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  microBars: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  microBarCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  microBarTrack: {
    width: '100%',
    height: 24,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  microBarFill: {
    borderRadius: 3,
  },
  microBarLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  microBarLabelToday: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
});
