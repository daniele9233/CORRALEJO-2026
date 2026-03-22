import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Modal, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';
import { api } from '../src/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const BASE_CELL = 14;
const CELL_GAP = 2;
const DAYS_OF_WEEK = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const MONTH_NAMES = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// TRIMP color scale
function getTrimpColor(trimp: number, hasRun: boolean): string {
  if (!hasRun) return '#1a1a2e';
  if (trimp < 30) return '#1e3a5f';
  if (trimp < 60) return '#2d6a4f';
  if (trimp < 90) return '#f4a261';
  return '#e63946';
}

// HR zone border color
function getHrBorderColor(avgHr: number): string {
  if (!avgHr) return 'transparent';
  if (avgHr < 140) return '#3b82f6';
  if (avgHr < 155) return '#22c55e';
  if (avgHr < 170) return '#f97316';
  return '#ef4444';
}

// Cell size based on km
function getCellSize(km: number): number {
  if (km <= 0) return 12;
  if (km >= 20) return 18;
  return Math.round(12 + (km / 20) * 6);
}

interface DayData {
  date: string;
  km: number;
  trimp: number;
  avg_hr: number;
  avg_pace: string;
  run_type: string;
  has_run: boolean;
}

interface WeekSummary {
  weekNum: number;
  totalKm: number;
  totalRuns: number;
  totalTrimp: number;
  startDate: string;
  endDate: string;
}

interface HeatmapData {
  days: DayData[];
  current_streak: number;
  longest_streak: number;
  total_km_year: number;
  total_runs_year: number;
  monthly_totals: { month: string; km: number; runs: number }[];
}

export default function HeatmapScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<WeekSummary | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const result = await api.getHeatmap();
      setData(result);
      // Scroll to end (current week) after render
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      }, 300);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Build weekly grid from days
  const { weeks, monthLabels, weekSummaries, consecutiveRunDays, mutationMonths } = useMemo(() => {
    if (!data?.days?.length) return { weeks: [], monthLabels: [], weekSummaries: [], consecutiveRunDays: new Set<string>(), mutationMonths: new Set<string>() };

    const firstDate = new Date(data.days[0].date + 'T00:00:00');
    // Get the Monday of the first week
    const dayOfWeek = firstDate.getDay(); // 0=Sun, 1=Mon...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const firstMonday = new Date(firstDate);
    firstMonday.setDate(firstMonday.getDate() + mondayOffset);

    // Index days by date
    const dayMap = new Map<string, DayData>();
    for (const d of data.days) {
      dayMap.set(d.date, d);
    }

    // Find consecutive run days for streak visualization
    const consecutiveSet = new Set<string>();
    for (let i = 0; i < data.days.length; i++) {
      const d = data.days[i];
      if (!d.has_run) continue;
      const prev = i > 0 ? data.days[i - 1] : null;
      const next = i < data.days.length - 1 ? data.days[i + 1] : null;
      if ((prev && prev.has_run) || (next && next.has_run)) {
        consecutiveSet.add(d.date);
      }
    }

    // Mutation months: >20% more km than previous
    const mutationSet = new Set<string>();
    if (data.monthly_totals.length > 1) {
      for (let i = 1; i < data.monthly_totals.length; i++) {
        const prev = data.monthly_totals[i - 1].km;
        const curr = data.monthly_totals[i].km;
        if (prev > 0 && curr > prev * 1.2) {
          mutationSet.add(data.monthly_totals[i].month);
        }
      }
    }

    const weeksArr: DayData[][] = [];
    const labels: { weekIndex: number; label: string }[] = [];
    const summaries: WeekSummary[] = [];
    let current = new Date(firstMonday);
    const today = new Date();
    today.setHours(23, 59, 59);
    let lastMonth = -1;

    while (current <= today) {
      const week: DayData[] = [];
      let weekKm = 0, weekRuns = 0, weekTrimp = 0;
      let weekStart = '', weekEnd = '';
      for (let d = 0; d < 7; d++) {
        const ds = current.toISOString().slice(0, 10);
        if (d === 0) weekStart = ds;
        if (d === 6) weekEnd = ds;
        const dayData = dayMap.get(ds) || {
          date: ds, km: 0, trimp: 0, avg_hr: 0, avg_pace: '', run_type: '', has_run: false
        };
        week.push(dayData);
        weekKm += dayData.km;
        weekRuns += dayData.has_run ? 1 : 0;
        weekTrimp += dayData.trimp;

        // Month label
        const m = current.getMonth();
        if (m !== lastMonth) {
          labels.push({ weekIndex: weeksArr.length, label: MONTH_NAMES[m] });
          lastMonth = m;
        }
        current.setDate(current.getDate() + 1);
      }
      weeksArr.push(week);
      summaries.push({
        weekNum: weeksArr.length,
        totalKm: Math.round(weekKm * 10) / 10,
        totalRuns: weekRuns,
        totalTrimp: Math.round(weekTrimp),
        startDate: weekStart,
        endDate: weekEnd,
      });
    }

    return { weeks: weeksArr, monthLabels: labels, weekSummaries: summaries, consecutiveRunDays: consecutiveSet, mutationMonths: mutationSet };
  }, [data]);

  // Monthly bar chart max
  const maxMonthlyKm = useMemo(() => {
    if (!data?.monthly_totals?.length) return 1;
    return Math.max(...data.monthly_totals.map(m => m.km), 1);
  }, [data]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.lime} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Errore nel caricamento dei dati</Text>
          <TouchableOpacity onPress={loadData} style={styles.retryBtn}>
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formatDate = (ds: string) => {
    const d = new Date(ds + 'T00:00:00');
    return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const runTypeLabel = (t: string) => {
    const labels: Record<string, string> = {
      corsa_lenta: 'Corsa Lenta', lungo: 'Lungo', progressivo: 'Progressivo',
      ripetute: 'Ripetute', ripetute_salita: 'Ripetute Salita', test: 'Test',
      rinforzo: 'Rinforzo', cyclette: 'Cyclette', riposo: 'Riposo',
    };
    return labels[t] || t || '-';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>DNA DELLA CORSA</Text>
            <Text style={styles.headerSubtitle}>La tua impronta genetica di runner</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Year summary stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.total_km_year}</Text>
            <Text style={styles.statLabel}>km totali</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.total_runs_year}</Text>
            <Text style={styles.statLabel}>corse</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#f4a261' }]}>{data.current_streak}</Text>
            <Text style={styles.statLabel}>streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#e63946' }]}>{data.longest_streak}</Text>
            <Text style={styles.statLabel}>max streak</Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>Intensita TRIMP</Text>
          <View style={styles.legendRow}>
            {[
              { color: '#1a1a2e', label: 'Nessuna' },
              { color: '#1e3a5f', label: '<30' },
              { color: '#2d6a4f', label: '30-60' },
              { color: '#f4a261', label: '60-90' },
              { color: '#e63946', label: '90+' },
            ].map((item, i) => (
              <View key={i} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
                <Text style={styles.legendText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Heatmap Grid */}
        <View style={styles.heatmapContainer}>
          {/* Day labels (left side) */}
          <View style={styles.dayLabels}>
            <View style={{ height: 18 }} />
            {DAYS_OF_WEEK.map((d, i) => (
              <View key={i} style={[styles.dayLabelCell, { height: BASE_CELL + CELL_GAP }]}>
                {i % 2 === 0 && <Text style={styles.dayLabelText}>{d}</Text>}
              </View>
            ))}
          </View>

          {/* Scrollable grid */}
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.gridScroll}
            contentContainerStyle={styles.gridContent}
          >
            {/* Month labels */}
            <View style={styles.monthLabelsRow}>
              {weeks.map((_, wi) => {
                const label = monthLabels.find(ml => ml.weekIndex === wi);
                return (
                  <View key={wi} style={[styles.monthLabelCell, { width: BASE_CELL + CELL_GAP }]}>
                    {label && <Text style={styles.monthLabelText}>{label.label}</Text>}
                  </View>
                );
              })}
            </View>

            {/* Grid rows (Mon-Sun) */}
            {[0, 1, 2, 3, 4, 5, 6].map(dayIndex => (
              <View key={dayIndex} style={styles.gridRow}>
                {weeks.map((week, wi) => {
                  const day = week[dayIndex];
                  if (!day) return <View key={wi} style={{ width: BASE_CELL + CELL_GAP, height: BASE_CELL + CELL_GAP }} />;

                  const cellSize = getCellSize(day.km);
                  const bgColor = getTrimpColor(day.trimp, day.has_run);
                  const borderColor = getHrBorderColor(day.avg_hr);
                  const isConsecutive = consecutiveRunDays.has(day.date);
                  const monthKey = day.date.slice(0, 7);
                  const isMutation = mutationMonths.has(monthKey) && day.has_run;
                  const isToday = day.date === new Date().toISOString().slice(0, 10);

                  return (
                    <TouchableOpacity
                      key={wi}
                      onPress={() => {
                        if (day.has_run) {
                          setSelectedDay(day);
                          setSelectedWeek(null);
                        }
                      }}
                      onLongPress={() => {
                        setSelectedWeek(weekSummaries[wi]);
                        setSelectedDay(null);
                      }}
                      activeOpacity={0.7}
                      style={[
                        styles.cell,
                        {
                          width: BASE_CELL + CELL_GAP,
                          height: BASE_CELL + CELL_GAP,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.cellInner,
                          {
                            width: cellSize,
                            height: cellSize,
                            backgroundColor: bgColor,
                            borderColor: isMutation ? '#ffd700' : borderColor,
                            borderWidth: isMutation ? 1.5 : borderColor !== 'transparent' ? 1 : 0,
                            borderRadius: 3,
                          },
                          isConsecutive && day.has_run && styles.cellGlow,
                          isToday && styles.cellToday,
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Monthly km bar chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Km mensili</Text>
          <View style={styles.barChartContainer}>
            {data.monthly_totals.map((m, i) => {
              const heightPct = m.km / maxMonthlyKm;
              const monthIndex = parseInt(m.month.split('-')[1]) - 1;
              const monthKey = m.month;
              const isMutation = mutationMonths.has(monthKey);
              return (
                <View key={i} style={styles.barWrapper}>
                  <Text style={styles.barValue}>{m.km > 0 ? Math.round(m.km) : ''}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${Math.max(heightPct * 100, 2)}%`,
                          backgroundColor: isMutation ? '#ffd700' : '#3b82f6',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{MONTH_NAMES[monthIndex]}</Text>
                  <Text style={styles.barSubLabel}>{m.runs}x</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Mutation legend */}
        {mutationMonths.size > 0 && (
          <View style={styles.mutationInfo}>
            <View style={[styles.legendSwatch, { backgroundColor: '#ffd700', borderRadius: 3 }]} />
            <Text style={styles.mutationText}>
              Mutazione positiva: mese con +20% km rispetto al precedente
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Day detail modal */}
      <Modal visible={!!selectedDay} transparent animationType="fade" onRequestClose={() => setSelectedDay(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedDay(null)}>
          <View style={styles.modalCard}>
            {selectedDay && (
              <>
                <Text style={styles.modalDate}>{formatDate(selectedDay.date)}</Text>
                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Tipo</Text>
                  <Text style={styles.modalValue}>{runTypeLabel(selectedDay.run_type)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Distanza</Text>
                  <Text style={styles.modalValue}>{selectedDay.km} km</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Passo</Text>
                  <Text style={styles.modalValue}>{selectedDay.avg_pace || '-'}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>FC media</Text>
                  <Text style={styles.modalValue}>{selectedDay.avg_hr ? `${selectedDay.avg_hr} bpm` : '-'}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>TRIMP</Text>
                  <View style={[styles.trimpBadge, { backgroundColor: getTrimpColor(selectedDay.trimp, true) }]}>
                    <Text style={styles.trimpBadgeText}>{selectedDay.trimp}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Week summary modal */}
      <Modal visible={!!selectedWeek} transparent animationType="fade" onRequestClose={() => setSelectedWeek(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedWeek(null)}>
          <View style={styles.modalCard}>
            {selectedWeek && (
              <>
                <Text style={styles.modalDate}>Settimana {selectedWeek.weekNum}</Text>
                <Text style={styles.modalSubDate}>
                  {formatDate(selectedWeek.startDate)} - {formatDate(selectedWeek.endDate)}
                </Text>
                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Km totali</Text>
                  <Text style={styles.modalValue}>{selectedWeek.totalKm} km</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Corse</Text>
                  <Text style={styles.modalValue}>{selectedWeek.totalRuns}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>TRIMP totale</Text>
                  <Text style={styles.modalValue}>{selectedWeek.totalTrimp}</Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    marginBottom: SPACING.lg,
  },
  retryBtn: {
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  retryText: {
    color: COLORS.lime,
    fontWeight: '700',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '900',
    color: COLORS.lime,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Legend
  legendContainer: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  legendTitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  legendRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },

  // Heatmap
  heatmapContainer: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  dayLabels: {
    width: 18,
    marginRight: 2,
  },
  dayLabelCell: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayLabelText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    paddingRight: SPACING.lg,
  },
  monthLabelsRow: {
    flexDirection: 'row',
    height: 18,
  },
  monthLabelCell: {
    justifyContent: 'flex-end',
  },
  monthLabelText: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellInner: {
    // Dynamic styles applied inline
  },
  cellGlow: {
    shadowColor: '#bef264',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  cellToday: {
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },

  // Chart section
  chartSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  barChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    gap: 4,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 8,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  barTrack: {
    width: '80%',
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 3,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  barSubLabel: {
    fontSize: 8,
    color: COLORS.textMuted,
  },

  // Mutation info
  mutationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  mutationText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    flex: 1,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: SCREEN_WIDTH * 0.8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  modalDate: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '900',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  modalSubDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  modalDivider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: SPACING.md,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  modalLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  modalValue: {
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
    color: COLORS.text,
  },
  trimpBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  trimpBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: '#fff',
  },
});
