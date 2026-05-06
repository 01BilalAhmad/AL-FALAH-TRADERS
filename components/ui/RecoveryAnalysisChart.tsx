// Powered by OnSpace.AI - OPTIMIZED
import React, { memo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { ApiService } from '@/services/api';
import { formatPKR } from '@/utils/format';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - Spacing.md * 4;

type TabType = 'week' | 'month';

interface DayData {
  label: string;
  credit: number;
  recovery: number;
  date: string;
}

interface SummaryKPI {
  weekCredit: number;
  weekRecovery: number;
  weekEfficiency: number;
  monthCredit: number;
  monthRecovery: number;
  bestDay: string;
  bestDayAmount: number;
}

interface RecoveryAnalysisChartProps {
  userId: string;
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const RecoveryAnalysisChart = memo(function RecoveryAnalysisChart({
  userId,
}: RecoveryAnalysisChartProps) {
  const [activeTab, setActiveTab] = useState<TabType>('week');
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [monthData, setMonthData] = useState<DayData[]>([]);
  const [kpi, setKpi] = useState<SummaryKPI | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [userId]);

  async function loadData() {
    setLoading(true);
    try {
      const now = new Date();

      // === PARALLEL: Fetch ALL days at once (7 for week + 28 for month = 35 days) ===
      // Week: last 7 days
      const weekPromises: Promise<{ label: string; credit: number; recovery: number; date: string }>[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = dateToStr(d);
        const label = d.toLocaleDateString('en-PK', { weekday: 'short' }).slice(0, 3);
        weekPromises.push(
          Promise.all([
            ApiService.getTransactions({ createdBy: userId, type: 'recovery', date: dateStr, limit: 100 }),
            ApiService.getTransactions({ orderbookerId: userId, type: 'credit', date: dateStr, limit: 100 }),
          ]).then(([recRes, credRes]) => ({
            label,
            date: dateStr,
            recovery: recRes.transactions.reduce((s, t) => s + t.amount, 0),
            credit: credRes.transactions.reduce((s, t) => s + t.amount, 0),
          })).catch(() => ({ label, date: dateStr, recovery: 0, credit: 0 }))
        );
      }

      // Month: last 28 days grouped into 4 weeks
      const monthPromises: Promise<{ credit: number; recovery: number; date: string }>[] = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = dateToStr(d);
        monthPromises.push(
          Promise.all([
            ApiService.getTransactions({ createdBy: userId, type: 'recovery', date: dateStr, limit: 100 }),
            ApiService.getTransactions({ orderbookerId: userId, type: 'credit', date: dateStr, limit: 100 }),
          ]).then(([recRes, credRes]) => ({
            date: dateStr,
            recovery: recRes.transactions.reduce((s, t) => s + t.amount, 0),
            credit: credRes.transactions.reduce((s, t) => s + t.amount, 0),
          })).catch(() => ({ date: dateStr, recovery: 0, credit: 0 }))
        );
      }

      // Wait for ALL requests in parallel (was sequential before = 56 round trips)
      const [weekResults, monthResults] = await Promise.all([
        Promise.all(weekPromises),
        Promise.all(monthPromises),
      ]);

      // Process week data
      let wCredit = 0;
      let wRecovery = 0;
      let bestDay = '';
      let bestAmt = 0;
      for (const day of weekResults) {
        wCredit += day.credit;
        wRecovery += day.recovery;
        if (day.recovery > bestAmt) {
          bestAmt = day.recovery;
          bestDay = day.label;
        }
      }

      // Process month data into 4 weeks
      const weeks4: DayData[] = [];
      for (let w = 0; w < 4; w++) {
        let wkCredit = 0;
        let wkRecovery = 0;
        for (let d = 0; d < 7; d++) {
          const idx = w * 7 + d;
          if (idx < monthResults.length) {
            wkCredit += monthResults[idx].credit;
            wkRecovery += monthResults[idx].recovery;
          }
        }
        const startIdx = w * 7;
        weeks4.push({
          label: `W${w + 1}`,
          credit: wkCredit,
          recovery: wkRecovery,
          date: monthResults[startIdx]?.date || '',
        });
      }

      const mCredit = weeks4.reduce((s, w) => s + w.credit, 0);
      const mRecovery = weeks4.reduce((s, w) => s + w.recovery, 0);

      setWeekData(weekResults);
      setMonthData(weeks4);
      setKpi({
        weekCredit: wCredit,
        weekRecovery: wRecovery,
        weekEfficiency: wCredit > 0 ? Math.round((wRecovery / wCredit) * 100) : 0,
        monthCredit: mCredit,
        monthRecovery: mRecovery,
        bestDay,
        bestDayAmount: bestAmt,
      });
    } catch {
      setWeekData([]);
      setMonthData([]);
    } finally {
      setLoading(false);
    }
  }

  const currentData = activeTab === 'week' ? weekData : monthData;
  const maxVal = Math.max(...currentData.map((d) => Math.max(d.credit, d.recovery)), 1);
  const barGroupWidth = currentData.length > 0 ? Math.floor(CHART_WIDTH / currentData.length) : 60;

  const efficiencyColor =
    (kpi?.weekEfficiency ?? 0) >= 80
      ? Colors.primary
      : (kpi?.weekEfficiency ?? 0) >= 50
      ? Colors.secondary
      : Colors.danger;

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <LinearGradient
        colors={['#064E3B', '#1E40AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Recovery Analysis</Text>
            <Text style={styles.headerSub}>Credit vs Recovery breakdown</Text>
          </View>
          <View style={styles.headerIcon}>
            <MaterialIcons name="analytics" size={22} color="rgba(255,255,255,0.9)" />
          </View>
        </View>

        {/* KPI pills */}
        {kpi ? (
          <View style={styles.kpiRow}>
            <View style={styles.kpiPill}>
              <Text style={styles.kpiPillValue}>{formatPKR(kpi.weekRecovery)}</Text>
              <Text style={styles.kpiPillLabel}>Week Recovery</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiPill}>
              <Text style={[styles.kpiPillValue, { color: Colors.secondary }]}>
                {formatPKR(kpi.weekCredit)}
              </Text>
              <Text style={styles.kpiPillLabel}>Week Credit</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiPill}>
              <Text style={[styles.kpiPillValue, { color: efficiencyColor }]}>
                {kpi.weekEfficiency}%
              </Text>
              <Text style={styles.kpiPillLabel}>Efficiency</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {(['week', 'month'] as TabType[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'week' ? 'Last 7 Days' : 'Last 4 Weeks'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading analysis...</Text>
        </View>
      ) : (
        <View>
          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.secondary }]} />
              <Text style={styles.legendText}>Credit (debit)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.legendText}>Recovery (collected)</Text>
            </View>
          </View>

          {/* Static bar chart - no heavy animations */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll}>
            <View style={styles.chartArea}>
              {/* Y-axis labels */}
              <View style={styles.yAxis}>
                {[100, 75, 50, 25, 0].map((pct) => (
                  <Text key={pct} style={styles.yLabel}>
                    {pct === 0
                      ? '0'
                      : maxVal >= 100000
                      ? `${((maxVal * pct) / 100 / 1000).toFixed(0)}K`
                      : `${((maxVal * pct) / 100 / 1000).toFixed(1)}K`}
                  </Text>
                ))}
              </View>

              {/* Bars */}
              <View style={styles.barsContainer}>
                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map((pct) => (
                  <View
                    key={pct}
                    style={[styles.gridLine, { bottom: (pct / 100) * 120 }]}
                  />
                ))}

                {currentData.map((item, idx) => {
                  const creditPct = maxVal > 0 ? (item.credit / maxVal) * 100 : 0;
                  const recoveryPct = maxVal > 0 ? (item.recovery / maxVal) * 100 : 0;
                  return (
                    <View key={idx} style={[styles.barGroup, { width: barGroupWidth }]}>
                      <View style={styles.barPair}>
                        <View style={[styles.staticBar, { height: `${Math.max(creditPct, item.credit > 0 ? 6 : 2)}%`, backgroundColor: Colors.secondary }]} />
                        <View style={[styles.staticBar, { height: `${Math.max(recoveryPct, item.recovery > 0 ? 6 : 2)}%`, backgroundColor: Colors.primary }]} />
                      </View>
                      <Text style={styles.barGroupLabel}>{item.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Summary cards */}
          {kpi ? (
            <View style={styles.summaryCards}>
              <View style={[styles.summaryCard, { borderLeftColor: Colors.primary }]}>
                <MaterialIcons name="trending-up" size={18} color={Colors.primary} />
                <View style={styles.summaryCardBody}>
                  <Text style={styles.summaryCardValue}>{formatPKR(kpi.monthRecovery)}</Text>
                  <Text style={styles.summaryCardLabel}>Month Recovery</Text>
                </View>
              </View>
              <View style={[styles.summaryCard, { borderLeftColor: Colors.secondary }]}>
                <MaterialIcons name="credit-card" size={18} color={Colors.secondary} />
                <View style={styles.summaryCardBody}>
                  <Text style={styles.summaryCardValue}>{formatPKR(kpi.monthCredit)}</Text>
                  <Text style={styles.summaryCardLabel}>Month Credit</Text>
                </View>
              </View>
              {kpi.bestDay ? (
                <View style={[styles.summaryCard, { borderLeftColor: Colors.blue }]}>
                  <MaterialIcons name="star" size={18} color={Colors.blue} />
                  <View style={styles.summaryCardBody}>
                    <Text style={styles.summaryCardValue}>
                      {kpi.bestDay} · {formatPKR(kpi.bestDayAmount)}
                    </Text>
                    <Text style={styles.summaryCardLabel}>Best Day This Week</Text>
                  </View>
                </View>
              ) : null}

              {/* Efficiency meter */}
              <View style={styles.efficiencyCard}>
                <View style={styles.efficiencyHeader}>
                  <Text style={styles.efficiencyTitle}>Recovery Efficiency</Text>
                  <Text style={[styles.efficiencyPct, { color: efficiencyColor }]}>
                    {kpi.weekEfficiency}%
                  </Text>
                </View>
                <View style={styles.efficiencyTrack}>
                  <View
                    style={[
                      styles.efficiencyFill,
                      {
                        width: `${Math.min(kpi.weekEfficiency, 100)}%`,
                        backgroundColor: efficiencyColor,
                      },
                    ]}
                  />
                  <View style={[styles.efficiencyMarker, { left: '80%' }]}>
                    <Text style={styles.efficiencyMarkerLabel}>80%</Text>
                  </View>
                </View>
                <Text style={styles.efficiencyHint}>
                  {kpi.weekEfficiency >= 80
                    ? 'Excellent — well above target!'
                    : kpi.weekEfficiency >= 50
                    ? 'Good — keep pushing to reach 80% target'
                    : 'Needs improvement — focus on recoveries'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  headerGradient: {
    padding: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  kpiPill: {
    flex: 1,
    alignItems: 'center',
  },
  kpiDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  kpiPillValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#A7F3D0',
  },
  kpiPillLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tabRow: {
    flexDirection: 'row',
    padding: Spacing.sm,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primaryDark,
    fontWeight: FontWeight.bold,
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 0,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  chartScroll: {
    marginTop: Spacing.sm,
  },
  chartArea: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    alignItems: 'flex-end',
  },
  yAxis: {
    height: 140,
    justifyContent: 'space-between',
    width: 40,
    paddingBottom: 20,
  },
  yLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  barGroup: {
    alignItems: 'center',
    paddingBottom: 0,
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 2,
  },
  staticBar: {
    flex: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minWidth: 4,
  },
  barGroupLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: FontWeight.medium,
    height: 16,
  },
  loadingBox: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  summaryCards: {
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 4,
  },
  summaryCardBody: {
    flex: 1,
  },
  summaryCardValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  summaryCardLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  efficiencyCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  efficiencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  efficiencyTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  efficiencyPct: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  efficiencyTrack: {
    height: 12,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'visible',
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  efficiencyFill: {
    height: 12,
    borderRadius: Radius.full,
  },
  efficiencyMarker: {
    position: 'absolute',
    top: -16,
    transform: [{ translateX: -12 }],
  },
  efficiencyMarkerLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
  },
  efficiencyHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
