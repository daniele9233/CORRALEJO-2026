import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';
import { api } from '../src/api';
import { TrainingWeek } from '../src/types';

const PHASE_COLORS: Record<string, string> = {
  'Ripresa': '#71717a',
  'Base Aerobica': '#3b82f6',
  'Sviluppo': '#22c55e',
  'Preparazione Specifica': '#f97316',
  'Picco': '#ef4444',
  'Tapering': '#bef264',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const BAR_WIDTH = 28;

export default function PeriodizzazioneScreen() {
  const router = useRouter();
  const [weeks, setWeeks] = useState<TrainingWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadPlan();
    }, [])
  );

  const loadPlan = async () => {
    try {
      const data = await api.getTrainingPlan();
      setWeeks(data.weeks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.lime} />
        </View>
      </SafeAreaView>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const currentWeekIdx = weeks.findIndex(
    w => w.week_start <= today && w.week_end >= today
  );
  const maxKm = Math.max(...weeks.map(w => w.target_km || 0), 1);

  // Group weeks by phase for the legend
  const phases: { key: string; color: string; weekRange: string; count: number }[] = [];
  let lastPhase = '';
  for (const w of weeks) {
    if (w.phase !== lastPhase) {
      phases.push({
        key: w.phase,
        color: PHASE_COLORS[w.phase] || COLORS.textMuted,
        weekRange: `S${w.week_number}`,
        count: 1,
      });
      lastPhase = w.phase;
    } else {
      const p = phases[phases.length - 1];
      p.weekRange = `S${phases[phases.length - 1].weekRange.split('-')[0].replace('S', '')}-S${w.week_number}`;
      p.count++;
    }
  }

  // Compute completed km per week (count completed sessions' target distances)
  const getWeekCompletedKm = (w: TrainingWeek) => {
    return (w.sessions || [])
      .filter(s => s.completed && s.target_distance_km)
      .reduce((sum, s) => sum + (s.target_distance_km || 0), 0);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.pageTitle}>PERIODIZZAZIONE</Text>
          <Text style={styles.pageSubtitle}>{weeks.length} settimane di piano</Text>
        </View>
      </View>

      {/* Legend */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legendScroll} contentContainerStyle={styles.legendContent}>
        {phases.map((p, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: p.color }]} />
            <Text style={styles.legendLabel}>{p.key}</Text>
            <Text style={styles.legendWeeks}>({p.count}s)</Text>
          </View>
        ))}
      </ScrollView>

      {/* Chart */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Current week summary */}
        {currentWeekIdx >= 0 && (
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>SETTIMANA CORRENTE</Text>
            <View style={styles.currentRow}>
              <Text style={styles.currentWeekNum}>S{weeks[currentWeekIdx].week_number}</Text>
              <View style={styles.currentDivider} />
              <View style={{ flex: 1 }}>
                <Text style={styles.currentPhase}>{weeks[currentWeekIdx].phase}</Text>
                <Text style={styles.currentTarget}>{weeks[currentWeekIdx].target_km} km target</Text>
              </View>
              {weeks[currentWeekIdx].is_recovery_week && (
                <View style={styles.recoveryBadge}>
                  <Text style={styles.recoveryText}>RECOVERY</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Bar chart */}
        <Text style={styles.chartTitle}>KM SETTIMANALI TARGET</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartContainer}>
          {weeks.map((w, idx) => {
            const barHeight = Math.max(4, (w.target_km / maxKm) * 150);
            const color = PHASE_COLORS[w.phase] || COLORS.textMuted;
            const isCurrent = idx === currentWeekIdx;
            const isPast = currentWeekIdx >= 0 && idx < currentWeekIdx;
            const completedKm = getWeekCompletedKm(w);
            const completedHeight = w.target_km > 0
              ? Math.max(0, (completedKm / maxKm) * 150)
              : 0;

            return (
              <View key={w.id || idx} style={styles.barColumn}>
                <Text style={[styles.barKm, isCurrent && { color: COLORS.lime, fontWeight: '800' }]}>
                  {Math.round(w.target_km)}
                </Text>
                <View style={[styles.barTrack, { height: 150 }]}>
                  {/* Target bar */}
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: isPast ? color + '40' : color,
                        borderWidth: isCurrent ? 2 : 0,
                        borderColor: COLORS.lime,
                      },
                    ]}
                  />
                  {/* Completed overlay */}
                  {isPast && completedHeight > 0 && (
                    <View
                      style={[
                        styles.barCompleted,
                        {
                          height: Math.min(completedHeight, barHeight),
                          backgroundColor: color,
                        },
                      ]}
                    />
                  )}
                </View>
                <Text style={[styles.barLabel, isCurrent && { color: COLORS.lime, fontWeight: '800' }]}>
                  {w.week_number}
                </Text>
                {isCurrent && <View style={styles.currentIndicator} />}
                {w.is_recovery_week && (
                  <View style={styles.recoveryDot} />
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Phase breakdown */}
        <Text style={styles.chartTitle}>FASI DEL PIANO</Text>
        {phases.map((p, i) => {
          const phaseWeeks = weeks.filter(w => w.phase === p.key);
          const totalKm = Math.round(phaseWeeks.reduce((sum, w) => sum + w.target_km, 0));
          const avgKm = phaseWeeks.length > 0 ? Math.round(totalKm / phaseWeeks.length) : 0;
          const completedWeeks = phaseWeeks.filter(w => {
            const allDone = (w.sessions || []).every(
              s => s.completed || s.type === 'riposo' || s.type === 'rinforzo'
            );
            return allDone && currentWeekIdx >= 0 && weeks.indexOf(w) < currentWeekIdx;
          }).length;

          return (
            <View key={i} style={[styles.phaseCard, { borderLeftColor: p.color }]}>
              <View style={styles.phaseRow}>
                <View style={[styles.phaseDot, { backgroundColor: p.color }]} />
                <Text style={styles.phaseName}>{p.key}</Text>
                <Text style={styles.phaseWeekRange}>{p.weekRange}</Text>
              </View>
              <View style={styles.phaseStats}>
                <View style={styles.phaseStat}>
                  <Text style={styles.phaseStatValue}>{p.count}</Text>
                  <Text style={styles.phaseStatLabel}>sett.</Text>
                </View>
                <View style={styles.phaseStat}>
                  <Text style={styles.phaseStatValue}>{totalKm}</Text>
                  <Text style={styles.phaseStatLabel}>km tot</Text>
                </View>
                <View style={styles.phaseStat}>
                  <Text style={styles.phaseStatValue}>{avgKm}</Text>
                  <Text style={styles.phaseStatLabel}>km/sett</Text>
                </View>
                <View style={styles.phaseStat}>
                  <Text style={[styles.phaseStatValue, { color: COLORS.lime }]}>{completedWeeks}/{p.count}</Text>
                  <Text style={styles.phaseStatLabel}>fatte</Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  pageTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '900', letterSpacing: 1 },
  pageSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: 2 },
  scrollContent: { paddingBottom: SPACING.xxl },

  // Legend
  legendScroll: { flexGrow: 0, marginBottom: SPACING.md },
  legendContent: { paddingHorizontal: SPACING.xl, gap: SPACING.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600' },
  legendWeeks: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },

  // Current week card
  currentCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.3)',
  },
  currentLabel: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  currentWeekNum: { fontSize: 32, color: COLORS.text, fontWeight: '900' },
  currentDivider: { width: 2, height: 36, backgroundColor: COLORS.cardBorder, borderRadius: 1 },
  currentPhase: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '700' },
  currentTarget: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  recoveryBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  recoveryText: { fontSize: 9, color: '#3b82f6', fontWeight: '700', letterSpacing: 1 },

  // Chart
  chartTitle: {
    fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2,
    marginHorizontal: SPACING.xl, marginTop: SPACING.xl, marginBottom: SPACING.md,
  },
  chartContainer: {
    paddingHorizontal: SPACING.xl, alignItems: 'flex-end', gap: 2,
  },
  barColumn: { alignItems: 'center', width: BAR_WIDTH },
  barKm: { fontSize: 9, color: COLORS.textMuted, marginBottom: 2, textAlign: 'center', width: BAR_WIDTH },
  barTrack: { justifyContent: 'flex-end', alignItems: 'center' },
  bar: {
    width: BAR_WIDTH - 4, borderRadius: 2, minHeight: 4,
  },
  barCompleted: {
    width: BAR_WIDTH - 4, borderRadius: 2,
    position: 'absolute', bottom: 0,
  },
  barLabel: { fontSize: 8, color: COLORS.textMuted, marginTop: 2 },
  currentIndicator: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.lime, marginTop: 2,
  },
  recoveryDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#3b82f6', marginTop: 1,
  },

  // Phase breakdown
  phaseCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderLeftWidth: 4,
  },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  phaseDot: { width: 10, height: 10, borderRadius: 5 },
  phaseName: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '700', flex: 1 },
  phaseWeekRange: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  phaseStats: { flexDirection: 'row', marginTop: SPACING.md },
  phaseStat: { flex: 1, alignItems: 'center' },
  phaseStatValue: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '800' },
  phaseStatLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
});
