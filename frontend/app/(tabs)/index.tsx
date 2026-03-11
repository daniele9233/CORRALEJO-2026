import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS, SESSION_ICONS } from '../../src/theme';
import { api } from '../../src/api';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

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

  const today = new Date().toISOString().split('T')[0];
  const sessions = currentWeek?.sessions ?? [];
  const todaySession = sessions.find((s: any) => s.date === today) ?? null;
  const completedCount = sessions.filter((s: any) => s.completed).length;
  const totalSessions = sessions.length;

  // Build 7-day timeline
  const weekTimeline = buildWeekTimeline(sessions, today);

  // Next upcoming workout (today or future, not completed, not rest)
  const nextWorkout = sessions.find(
    (s: any) => s.date > today && !s.completed && s.type !== 'riposo'
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={COLORS.lime}
          />
        }
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

        {/* ====== HERO: TODAY'S WORKOUT ====== */}
        <View style={styles.todayHeaderRow}>
          <Ionicons name="today" size={16} color={COLORS.lime} />
          <Text style={styles.todayHeaderLabel}>OGGI</Text>
          <Text style={styles.todayHeaderDate}>{formatDateFull(today)}</Text>
        </View>

        {todaySession ? (
          <TouchableOpacity
            style={[
              styles.heroCard,
              { borderLeftColor: SESSION_COLORS[todaySession.type] || COLORS.textMuted },
            ]}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/workout-detail',
                params: { session: JSON.stringify(todaySession) },
              })
            }
          >
            {/* Type row with icon */}
            <View style={styles.heroTopRow}>
              <View
                style={[
                  styles.heroIconCircle,
                  { backgroundColor: (SESSION_COLORS[todaySession.type] || COLORS.textMuted) + '25' },
                ]}
              >
                <Ionicons
                  name={(SESSION_ICONS[todaySession.type] || 'fitness') as any}
                  size={22}
                  color={SESSION_COLORS[todaySession.type] || COLORS.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.heroType,
                    { color: SESSION_COLORS[todaySession.type] || COLORS.textSecondary },
                  ]}
                >
                  {todaySession.type?.toUpperCase().replace('_', ' ')}
                </Text>
                {todaySession.completed && (
                  <View style={styles.heroDoneBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.lime} />
                    <Text style={styles.heroDoneText}>COMPLETATO</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Title & description */}
            <Text style={styles.heroTitle}>{todaySession.title}</Text>
            <Text style={styles.heroDesc} numberOfLines={3}>
              {todaySession.description}
            </Text>

            {/* Target badges */}
            {(todaySession.target_distance_km > 0 ||
              todaySession.target_pace ||
              todaySession.target_duration_min > 0) && (
              <View style={styles.heroTargets}>
                {todaySession.target_distance_km > 0 && (
                  <View style={styles.heroTargetBadge}>
                    <Ionicons name="navigate" size={14} color={COLORS.lime} />
                    <Text style={styles.heroTargetText}>
                      {todaySession.target_distance_km} km
                    </Text>
                  </View>
                )}
                {todaySession.target_pace && (
                  <View style={styles.heroTargetBadge}>
                    <Ionicons name="speedometer" size={14} color={COLORS.blue} />
                    <Text style={styles.heroTargetText}>
                      {todaySession.target_pace}/km
                    </Text>
                  </View>
                )}
                {todaySession.target_duration_min > 0 && (
                  <View style={styles.heroTargetBadge}>
                    <Ionicons name="time" size={14} color={COLORS.orange} />
                    <Text style={styles.heroTargetText}>
                      {todaySession.target_duration_min} min
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* CTA */}
            {!todaySession.completed && (
              <View style={styles.heroCTA}>
                <Text style={styles.heroCTAText}>VAI ALL'ALLENAMENTO</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.limeDark} />
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.restCard}>
            <Ionicons name="bed" size={32} color={COLORS.textMuted} />
            <Text style={styles.restTitle}>Giorno di Riposo</Text>
            <Text style={styles.restSubtitle}>
              Recupera le energie per la prossima sessione
            </Text>
            {nextWorkout && (
              <View style={styles.nextHintRow}>
                <Ionicons name="arrow-forward-circle" size={14} color={COLORS.lime} />
                <Text style={styles.nextHintText}>
                  Prossimo: {nextWorkout.title} — {formatDateShort(nextWorkout.date)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ====== WEEK TIMELINE ====== */}
        {currentWeek && (
          <View style={styles.weekCard}>
            <View style={styles.weekCardTop}>
              <Text style={styles.weekCardLabel}>
                SETTIMANA {currentWeek.week_number}
              </Text>
              <Text style={styles.weekCardPhase}>{currentWeek.phase}</Text>
            </View>

            {/* 7-day strip */}
            <View style={styles.tlStrip}>
              {weekTimeline.map((day: any, idx: number) => (
                <View key={idx} style={styles.tlCol}>
                  <Text
                    style={[
                      styles.tlDayLabel,
                      day.isToday && styles.tlDayLabelToday,
                    ]}
                  >
                    {day.name}
                  </Text>
                  <View
                    style={[
                      styles.tlDot,
                      day.session
                        ? {
                            backgroundColor:
                              SESSION_COLORS[day.session.type] || COLORS.textMuted,
                          }
                        : styles.tlDotEmpty,
                      day.isToday && styles.tlDotRing,
                    ]}
                  >
                    {day.session?.completed && (
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Week progress */}
            <View style={styles.weekProgressRow}>
              <View style={styles.weekProgressBar}>
                <View
                  style={[
                    styles.weekProgressFill,
                    {
                      width: `${
                        totalSessions > 0
                          ? (completedCount / totalSessions) * 100
                          : 0
                      }%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.weekProgressText}>
                {completedCount}/{totalSessions} completati • Target{' '}
                {currentWeek.target_km} km
              </Text>
            </View>
          </View>
        )}

        {/* ====== QUICK STATS ====== */}
        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{data?.this_week_km ?? 0}</Text>
            <Text style={styles.statLabel}>KM SETT.</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalKm}</Text>
            <Text style={styles.statLabel}>KM TOTALI</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {profile?.target_pace || '4:30'}
            </Text>
            <Text style={styles.statLabel}>PASSO OBJ</Text>
          </View>
        </View>

        {/* ====== WEEKLY KM CHART ====== */}
        <View style={styles.sectionHeader}>
          <Ionicons name="bar-chart" size={18} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>KM SETTIMANALI</Text>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartContainer}>
            {history.slice(-12).map((h: any, idx: number) => {
              const km = h.km ?? h.total_km ?? 0;
              const maxKm = Math.max(
                ...history.map((x: any) => x.km ?? x.total_km ?? 0),
                1
              );
              const height = (km / maxKm) * 100;
              const isLast = idx === history.slice(-12).length - 1;
              return (
                <View key={idx} style={styles.barWrapper}>
                  <Text style={styles.barValue}>
                    {km > 0 ? Math.round(km) : ''}
                  </Text>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(height, 3)}%`,
                        backgroundColor: isLast ? COLORS.lime : COLORS.blue,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* ====== RECENT RUNS ====== */}
        {recentRuns.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="footsteps" size={18} color={COLORS.lime} />
              <Text style={styles.sectionTitle}>ULTIME CORSE</Text>
            </View>

            {recentRuns.slice(0, 3).map((run: any) => (
              <TouchableOpacity
                key={run.id}
                style={styles.runCard}
                onPress={() =>
                  router.push({
                    pathname: '/run-detail',
                    params: { id: run.id },
                  })
                }
              >
                <View style={styles.runTop}>
                  <Text style={styles.runDate}>{formatDate(run.date)}</Text>
                  <Text
                    style={[
                      styles.runType,
                      {
                        color:
                          SESSION_COLORS[run.run_type] ||
                          COLORS.textSecondary,
                      },
                    ]}
                  >
                    {run.run_type?.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.runStats}>
                  <View style={styles.runStat}>
                    <Text style={styles.runStatValue}>
                      {run.distance_km} km
                    </Text>
                    <Text style={styles.runStatLabel}>Distanza</Text>
                  </View>
                  <View style={styles.runStat}>
                    <Text style={styles.runStatValue}>
                      {run.avg_pace}/km
                    </Text>
                    <Text style={styles.runStatLabel}>Passo</Text>
                  </View>
                  {run.avg_hr && (
                    <View style={styles.runStat}>
                      <Text style={styles.runStatValue}>
                        {run.avg_hr} bpm
                      </Text>
                      <Text style={styles.runStatLabel}>FC Media</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ====== NEXT TEST ====== */}
        {nextTest && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="stopwatch" size={18} color={COLORS.orange} />
              <Text style={styles.sectionTitle}>PROSSIMO TEST</Text>
            </View>
            <View style={styles.testCard}>
              <Text style={styles.testDate}>
                {formatDate(nextTest.scheduled_date)}
              </Text>
              <Text style={styles.testDesc}>{nextTest.description}</Text>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ──────── helpers ──────── */

function buildWeekTimeline(sessions: any[], today: string) {
  const dayMap: Record<string, any> = {};
  for (const s of sessions) {
    if (s.date) dayMap[s.date] = s;
  }
  const todayDate = new Date(today + 'T00:00:00');
  const dow = todayDate.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(todayDate);
  monday.setDate(monday.getDate() + mondayOffset);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    days.push({
      name: DAY_NAMES[i],
      date: ds,
      isToday: ds === today,
      session: dayMap[ds] || null,
    });
  }
  return days;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const months = [
    'Gen','Feb','Mar','Apr','Mag','Giu',
    'Lug','Ago','Set','Ott','Nov','Dic',
  ];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateFull(dateStr: string) {
  if (!dateStr) return '';
  const dayNames = [
    'Domenica','Lunedi','Martedi','Mercoledi',
    'Giovedi','Venerdi','Sabato',
  ];
  const months = [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
  ];
  const d = new Date(dateStr + 'T00:00:00');
  return `${dayNames[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDateShort(dateStr: string) {
  if (!dateStr) return '';
  const months = [
    'Gen','Feb','Mar','Apr','Mag','Giu',
    'Lug','Ago','Set','Ott','Nov','Dic',
  ];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/* ──────── styles ──────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  greeting: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lime,
    fontWeight: '700',
    letterSpacing: 2,
  },
  raceTitle: {
    fontSize: FONT_SIZES.xxl,
    color: COLORS.text,
    fontWeight: '800',
    marginTop: 2,
  },
  countdownBadge: {
    backgroundColor: COLORS.lime,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  countdownNumber: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '900',
    color: COLORS.limeDark,
  },
  countdownLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.limeDark,
    letterSpacing: 1,
  },

  /* today header */
  todayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  todayHeaderLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lime,
    fontWeight: '700',
    letterSpacing: 2,
  },
  todayHeaderDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },

  /* hero card */
  heroCard: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderLeftWidth: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  heroIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroType: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heroDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  heroDoneText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lime,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.text,
    fontWeight: '800',
    marginTop: SPACING.md,
  },
  heroDesc: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
  heroTargets: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    flexWrap: 'wrap',
  },
  heroTargetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(190, 242, 100, 0.1)',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  heroTargetText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  heroCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.lime,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.lg,
  },
  heroCTAText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.limeDark,
    fontWeight: '800',
    letterSpacing: 1,
  },

  /* rest card */
  restCard: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  restTitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: '700',
  },
  restSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  nextHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    backgroundColor: 'rgba(190, 242, 100, 0.08)',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  nextHintText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lime,
    fontWeight: '600',
  },

  /* week card */
  weekCard: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  weekCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  weekCardLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lime,
    fontWeight: '700',
    letterSpacing: 1,
  },
  weekCardPhase: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  /* timeline strip */
  tlStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  tlCol: { alignItems: 'center', flex: 1 },
  tlDayLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  tlDayLabelToday: { color: COLORS.lime, fontWeight: '800' },
  tlDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlDotEmpty: { backgroundColor: COLORS.cardBorder },
  tlDotRing: { borderWidth: 2, borderColor: COLORS.lime },

  /* week progress */
  weekProgressRow: { marginTop: 4 },
  weekProgressBar: {
    height: 4,
    backgroundColor: COLORS.cardBorder,
    borderRadius: 2,
    overflow: 'hidden',
  },
  weekProgressFill: {
    height: '100%',
    backgroundColor: COLORS.lime,
    borderRadius: 2,
  },
  weekProgressText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  /* quick stats */
  statsStrip: {
    flexDirection: 'row',
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.cardBorder,
  },

  /* section header */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xxl,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 2,
  },

  /* chart */
  chartCard: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 4,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barValue: { fontSize: 8, color: COLORS.textMuted, marginBottom: 2 },
  bar: { width: '80%', borderRadius: 3, minHeight: 3 },

  /* runs */
  runCard: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: SPACING.sm,
  },
  runTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  runDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  runType: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  runStats: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    gap: SPACING.xl,
  },
  runStat: {},
  runStatValue: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: '700',
  },
  runStatLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  /* test */
  testCard: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  testDate: {
    fontSize: FONT_SIZES.md,
    color: COLORS.orange,
    fontWeight: '700',
  },
  testDesc: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
});
