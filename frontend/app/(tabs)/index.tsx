import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS } from '../../src/theme';
import { api } from '../../src/api';

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const dashboard = await api.getDashboard();
      setData(dashboard);
    } catch (e) {
      console.error('Dashboard error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.lime} />
        </View>
      </SafeAreaView>
    );
  }

  const profile = data?.profile;
  const currentWeek = data?.current_week;
  const daysToRace = data?.days_to_race ?? 0;
  const totalKm = data?.total_km_logged ?? 0;
  const recentRuns = data?.recent_runs ?? [];
  const history = data?.weekly_history ?? [];
  const nextTest = data?.next_test;

  const todaySessions = currentWeek?.sessions?.filter((s: any) => {
    const today = new Date().toISOString().split('T')[0];
    return s.date === today;
  }) ?? [];

  const maxHistoryKm = Math.max(...history.map((h: any) => h.total_km), 1);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.lime} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>MEZZA MARATONA</Text>
            <Text style={styles.raceTitle}>Fuerteventura 2026</Text>
          </View>
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownNumber}>{daysToRace}</Text>
            <Text style={styles.countdownLabel}>GIORNI</Text>
          </View>
        </View>

        {/* Target Card */}
        <View style={styles.targetCard}>
          <View style={styles.targetRow}>
            <View style={styles.targetItem}>
              <Text style={styles.targetLabel}>OBIETTIVO</Text>
              <Text style={styles.targetValue}>{profile?.target_time || '1:35:00'}</Text>
            </View>
            <View style={styles.targetDivider} />
            <View style={styles.targetItem}>
              <Text style={styles.targetLabel}>PASSO</Text>
              <Text style={styles.targetValue}>{profile?.target_pace || '4:30'}/km</Text>
            </View>
            <View style={styles.targetDivider} />
            <View style={styles.targetItem}>
              <Text style={styles.targetLabel}>KM TOTALI</Text>
              <Text style={styles.targetValue}>{totalKm}</Text>
            </View>
          </View>
        </View>

        {/* Current Phase */}
        {currentWeek && (
          <View style={styles.phaseCard}>
            <View style={styles.phaseHeader}>
              <Ionicons name="flag" size={18} color={COLORS.lime} />
              <Text style={styles.phaseLabel}>FASE ATTUALE</Text>
            </View>
            <Text style={styles.phaseName}>{currentWeek.phase}</Text>
            <Text style={styles.phaseDesc}>{currentWeek.phase_description}</Text>
            <View style={styles.weekInfo}>
              <Text style={styles.weekText}>Settimana {currentWeek.week_number} • Target {currentWeek.target_km} km</Text>
            </View>
          </View>
        )}

        {/* Today's Workout */}
        <View style={styles.sectionHeader}>
          <Ionicons name="today" size={18} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>ALLENAMENTO DI OGGI</Text>
        </View>

        {todaySessions.length > 0 ? todaySessions.map((session: any, idx: number) => (
          <TouchableOpacity
            key={idx}
            testID={`today-session-${idx}`}
            style={[styles.sessionCard, { borderLeftColor: SESSION_COLORS[session.type] || COLORS.textMuted }]}
            onPress={() => router.push({ pathname: '/workout-detail', params: { session: JSON.stringify(session) } })}
          >
            <View style={styles.sessionTop}>
              <Text style={[styles.sessionType, { color: SESSION_COLORS[session.type] || COLORS.textSecondary }]}>
                {session.type?.toUpperCase().replace('_', ' ')}
              </Text>
              {session.completed && <Ionicons name="checkmark-circle" size={20} color={COLORS.lime} />}
            </View>
            <Text style={styles.sessionTitle}>{session.title}</Text>
            <Text style={styles.sessionDesc}>{session.description}</Text>
            {session.target_distance_km > 0 && (
              <View style={styles.sessionMeta}>
                <Text style={styles.sessionMetaText}>{session.target_distance_km} km</Text>
                {session.target_pace && <Text style={styles.sessionMetaText}> • {session.target_pace}/km</Text>}
              </View>
            )}
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyCard}>
            <Ionicons name="bed" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Nessun allenamento per oggi</Text>
          </View>
        )}

        {/* Weekly History Chart */}
        <View style={styles.sectionHeader}>
          <Ionicons name="bar-chart" size={18} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>KM SETTIMANALI</Text>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartContainer}>
            {history.slice(-12).map((h: any, idx: number) => {
              const height = (h.total_km / maxHistoryKm) * 100;
              return (
                <View key={idx} style={styles.barWrapper}>
                  <Text style={styles.barValue}>{Math.round(h.total_km)}</Text>
                  <View style={[styles.bar, { height: `${Math.max(height, 3)}%`, backgroundColor: h.total_km > 30 ? COLORS.lime : COLORS.blue }]} />
                </View>
              );
            })}
          </View>
        </View>

        {/* Recent Runs */}
        <View style={styles.sectionHeader}>
          <Ionicons name="footsteps" size={18} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>ULTIME CORSE</Text>
        </View>

        {recentRuns.slice(0, 3).map((run: any, idx: number) => (
          <TouchableOpacity
            key={run.id}
            testID={`recent-run-${idx}`}
            style={styles.runCard}
            onPress={() => router.push({ pathname: '/run-detail', params: { id: run.id } })}
          >
            <View style={styles.runTop}>
              <Text style={styles.runDate}>{formatDate(run.date)}</Text>
              <Text style={[styles.runType, { color: SESSION_COLORS[run.run_type] || COLORS.textSecondary }]}>
                {run.run_type?.toUpperCase()}
              </Text>
            </View>
            <View style={styles.runStats}>
              <View style={styles.runStat}>
                <Text style={styles.runStatValue}>{run.distance_km} km</Text>
                <Text style={styles.runStatLabel}>Distanza</Text>
              </View>
              <View style={styles.runStat}>
                <Text style={styles.runStatValue}>{run.avg_pace}/km</Text>
                <Text style={styles.runStatLabel}>Passo</Text>
              </View>
              {run.avg_hr && (
                <View style={styles.runStat}>
                  <Text style={styles.runStatValue}>{run.avg_hr} bpm</Text>
                  <Text style={styles.runStatLabel}>FC Media</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}

        {/* Next Test */}
        {nextTest && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="stopwatch" size={18} color={COLORS.orange} />
              <Text style={styles.sectionTitle}>PROSSIMO TEST</Text>
            </View>
            <View style={styles.testCard}>
              <Text style={styles.testDate}>{formatDate(nextTest.scheduled_date)}</Text>
              <Text style={styles.testDesc}>{nextTest.description}</Text>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md,
  },
  greeting: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  raceTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800', marginTop: 2 },
  countdownBadge: {
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, alignItems: 'center',
  },
  countdownNumber: { fontSize: FONT_SIZES.xxl, fontWeight: '900', color: COLORS.limeDark },
  countdownLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.limeDark, letterSpacing: 1 },
  targetCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  targetRow: { flexDirection: 'row', alignItems: 'center' },
  targetItem: { flex: 1, alignItems: 'center' },
  targetDivider: { width: 1, height: 36, backgroundColor: COLORS.cardBorder },
  targetLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  targetValue: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '800' },
  phaseCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.2)',
  },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  phaseLabel: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  phaseName: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800', marginTop: SPACING.sm },
  phaseDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 4 },
  weekInfo: { marginTop: SPACING.md, backgroundColor: 'rgba(190, 242, 100, 0.08)', borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm },
  weekText: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.xl, marginTop: SPACING.xxl, marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 2 },
  sessionCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder, borderLeftWidth: 4, marginBottom: SPACING.sm,
  },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionType: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 1 },
  sessionTitle: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700', marginTop: SPACING.xs },
  sessionDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 4 },
  sessionMeta: { flexDirection: 'row', marginTop: SPACING.sm },
  sessionMetaText: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '600' },
  emptyCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.xxl,
    borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center', gap: SPACING.sm,
  },
  emptyText: { fontSize: FONT_SIZES.md, color: COLORS.textMuted },
  chartCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  barWrapper: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  barValue: { fontSize: 8, color: COLORS.textMuted, marginBottom: 2 },
  bar: { width: '80%', borderRadius: 3, minHeight: 3 },
  runCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: SPACING.sm,
  },
  runTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  runDate: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  runType: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 1 },
  runStats: { flexDirection: 'row', marginTop: SPACING.md, gap: SPACING.xl },
  runStat: {},
  runStatValue: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700' },
  runStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  testCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  testDate: { fontSize: FONT_SIZES.md, color: COLORS.orange, fontWeight: '700' },
  testDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 4 },
});
