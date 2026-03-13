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

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 80;

interface ThresholdPoint {
  label: string;
  avg_pace: string;
  best_pace: string;
  pace_secs: number;
  avg_hr: number;
  runs_count: number;
}

interface RacePrediction {
  predicted_time_str: string;
  predicted_pace: string;
  based_on: string;
}

export default function ProgressiScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await api.getAnalytics();
      setAnalytics(data);
    } catch (e) {
      console.error(e);
      setError(true);
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

  if (error || !analytics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.errorText}>Errore nel caricamento</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryText}>RIPROVA</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { vo2max, vo2max_target, anaerobic_threshold, race_predictions, best_efforts, goal_progress_pct, target_hm_time_str, current_hm_pred_str } = analytics;
  const history: ThresholdPoint[] = anaerobic_threshold?.history || [];
  const currentAT = anaerobic_threshold?.current || {};
  const preInjuryAT = anaerobic_threshold?.pre_injury || {};

  // Build pace chart data: pre-injury + history points
  const pacePoints: { label: string; secs: number; hr: number; color: string }[] = [];
  if (preInjuryAT.pace) {
    const parts = preInjuryAT.pace.split(':');
    pacePoints.push({
      label: 'Pre-inf.',
      secs: parseInt(parts[0]) * 60 + parseInt(parts[1]),
      hr: preInjuryAT.hr || 0,
      color: COLORS.orange,
    });
  }
  for (const h of history) {
    pacePoints.push({
      label: h.label,
      secs: h.pace_secs,
      hr: h.avg_hr,
      color: COLORS.blue,
    });
  }

  const maxSecs = Math.max(...pacePoints.map(p => p.secs), 360);
  const minSecs = Math.min(...pacePoints.map(p => p.secs), 240);
  const range = maxSecs - minSecs || 60;
  const chartHeight = 160;

  const formatPace = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // VO2max progress bar
  const vo2maxPct = vo2max_target > 0 ? Math.min(100, (vo2max / vo2max_target) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.pageTitle}>PROGRESSI</Text>
          <Text style={styles.pageSubtitle}>VO2max · Soglia · Previsioni</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* VO2max Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="heart-circle" size={20} color={COLORS.red} />
            <Text style={styles.sectionTitle}>VO2MAX</Text>
          </View>
          <View style={styles.vo2Row}>
            <View style={styles.vo2Current}>
              <Text style={styles.vo2Value}>{vo2max}</Text>
              <Text style={styles.vo2Label}>attuale</Text>
            </View>
            <View style={styles.vo2Arrow}>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textMuted} />
            </View>
            <View style={styles.vo2Target}>
              <Text style={[styles.vo2Value, { color: COLORS.lime }]}>{vo2max_target}</Text>
              <Text style={styles.vo2Label}>target</Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${vo2maxPct}%` }]} />
          </View>
          <Text style={styles.progressPct}>{Math.round(vo2maxPct)}% del target</Text>
          <Text style={styles.vo2Note}>
            Si aggiorna automaticamente in base alle tue corse sincronizzate da Strava
          </Text>
        </View>

        {/* Soglia Anaerobica History */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trending-up" size={20} color={COLORS.orange} />
            <Text style={styles.sectionTitle}>SOGLIA ANAEROBICA</Text>
          </View>

          {/* Current vs Pre-injury comparison */}
          <View style={styles.comparisonRow}>
            <View style={[styles.comparisonCard, { borderColor: COLORS.orange + '40' }]}>
              <Text style={styles.comparisonLabel}>PRE-INFORTUNIO</Text>
              <Text style={[styles.comparisonPace, { color: COLORS.orange }]}>{preInjuryAT.pace || '--'}/km</Text>
              <Text style={styles.comparisonHr}>{preInjuryAT.hr || '--'} bpm</Text>
              <Text style={styles.comparisonDate}>{preInjuryAT.date || ''}</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
            <View style={[styles.comparisonCard, { borderColor: COLORS.lime + '40' }]}>
              <Text style={styles.comparisonLabel}>ATTUALE</Text>
              <Text style={[styles.comparisonPace, { color: COLORS.lime }]}>{currentAT.pace || '--'}/km</Text>
              <Text style={styles.comparisonHr}>{currentAT.hr || '--'} bpm</Text>
              <Text style={styles.comparisonDate}>Ultima stima</Text>
            </View>
          </View>

          {/* Pace Chart */}
          {pacePoints.length > 1 && (
            <View style={styles.chartArea}>
              <Text style={styles.chartLabel}>ANDAMENTO PASSO SOGLIA</Text>
              <View style={styles.chart}>
                {/* Y-axis labels */}
                <View style={styles.yAxis}>
                  <Text style={styles.yLabel}>{formatPace(minSecs)}</Text>
                  <Text style={styles.yLabel}>{formatPace(Math.round((minSecs + maxSecs) / 2))}</Text>
                  <Text style={styles.yLabel}>{formatPace(maxSecs)}</Text>
                </View>
                {/* Bars */}
                <View style={styles.chartBars}>
                  {pacePoints.map((p, i) => {
                    // Lower pace (fewer secs) = taller bar = better
                    const barH = Math.max(8, ((maxSecs - p.secs) / range) * chartHeight);
                    return (
                      <View key={i} style={styles.paceBarCol}>
                        <Text style={styles.paceBarValue}>{formatPace(p.secs)}</Text>
                        <View style={styles.paceBarTrack}>
                          <View style={[styles.paceBar, { height: barH, backgroundColor: p.color }]} />
                        </View>
                        <Text style={styles.paceBarLabel}>{p.label}</Text>
                        <Text style={styles.paceBarHr}>{p.hr} bpm</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              <Text style={styles.chartNote}>↑ Barre più alte = passo più veloce (meglio)</Text>
            </View>
          )}
        </View>

        {/* Race Predictions */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy" size={20} color={COLORS.lime} />
            <Text style={styles.sectionTitle}>PREVISIONI GARA</Text>
          </View>
          <Text style={styles.predBasedOn}>
            Basate sulla tua forma attuale (VO2max {vo2max})
          </Text>

          {race_predictions && Object.entries(race_predictions).map(([dist, pred]: [string, any]) => {
            const isGoal = dist === '21.1km';
            return (
              <View key={dist} style={[styles.predRow, isGoal && styles.predRowGoal]}>
                <View style={styles.predDist}>
                  <Text style={[styles.predDistText, isGoal && { color: COLORS.lime }]}>{dist}</Text>
                  {isGoal && <Text style={styles.goalBadge}>OBIETTIVO</Text>}
                </View>
                <View style={styles.predData}>
                  <Text style={styles.predTime}>{pred.predicted_time_str}</Text>
                  <Text style={styles.predPace}>{pred.predicted_pace}/km</Text>
                </View>
              </View>
            );
          })}

          {/* Goal progress */}
          <View style={styles.goalSection}>
            <Text style={styles.goalTitle}>Obiettivo Mezza Maratona</Text>
            <View style={styles.goalRow}>
              <Text style={styles.goalCurrent}>{current_hm_pred_str}</Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.textMuted} />
              <Text style={[styles.goalTarget, { color: COLORS.lime }]}>{target_hm_time_str}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.min(100, goal_progress_pct)}%` }]} />
            </View>
            <Text style={styles.progressPct}>{goal_progress_pct}% verso l'obiettivo</Text>
          </View>
        </View>

        {/* Best Efforts */}
        {best_efforts && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medal" size={20} color="#fbbf24" />
              <Text style={styles.sectionTitle}>MIGLIORI PRESTAZIONI</Text>
            </View>
            {Object.entries(best_efforts).map(([dist, effort]: [string, any]) => (
              <View key={dist} style={styles.effortRow}>
                <Text style={styles.effortDist}>{dist}</Text>
                <View style={styles.effortData}>
                  <Text style={styles.effortPace}>{effort.pace}/km</Text>
                  <Text style={styles.effortTime}>
                    {effort.time < 60
                      ? `${Math.floor(effort.time)}:${Math.round((effort.time % 1) * 60).toString().padStart(2, '0')}`
                      : `${Math.floor(effort.time / 60)}h${Math.round(effort.time % 60)}m`
                    }
                  </Text>
                </View>
                <View style={styles.effortMeta}>
                  <Text style={styles.effortHr}>{effort.avg_hr} bpm</Text>
                  <Text style={styles.effortDate}>{effort.date}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },
  errorText: { color: COLORS.textMuted, fontSize: FONT_SIZES.body },
  retryBtn: { backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm },
  retryText: { color: COLORS.bg, fontWeight: '800', fontSize: FONT_SIZES.sm },
  scrollContent: { paddingBottom: SPACING.xxl },

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

  // Section cards
  sectionCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '700', letterSpacing: 2 },

  // VO2max
  vo2Row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xl, marginBottom: SPACING.lg },
  vo2Current: { alignItems: 'center' },
  vo2Target: { alignItems: 'center' },
  vo2Arrow: { paddingHorizontal: SPACING.sm },
  vo2Value: { fontSize: 36, color: COLORS.text, fontWeight: '900' },
  vo2Label: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  vo2Note: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm, fontStyle: 'italic' },

  // Progress bar
  progressBarBg: {
    height: 8, backgroundColor: COLORS.cardBorder, borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8, backgroundColor: COLORS.lime, borderRadius: 4,
  },
  progressPct: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: SPACING.xs, textAlign: 'center' },

  // Comparison
  comparisonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  comparisonCard: {
    flex: 1, alignItems: 'center', padding: SPACING.md,
    backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  comparisonLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.xs },
  comparisonPace: { fontSize: FONT_SIZES.xl, fontWeight: '900' },
  comparisonHr: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  comparisonDate: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },

  // Pace chart
  chartArea: { marginTop: SPACING.sm },
  chartLabel: { fontSize: 9, color: COLORS.lime, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.md },
  chart: { flexDirection: 'row', height: 200 },
  yAxis: { width: 36, justifyContent: 'space-between', paddingVertical: 4 },
  yLabel: { fontSize: 8, color: COLORS.textMuted },
  chartBars: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  paceBarCol: { alignItems: 'center', flex: 1 },
  paceBarValue: { fontSize: 8, color: COLORS.textSecondary, marginBottom: 2 },
  paceBarTrack: { height: 160, justifyContent: 'flex-end', alignItems: 'center' },
  paceBar: { width: 20, borderRadius: 4, minHeight: 8 },
  paceBarLabel: { fontSize: 8, color: COLORS.textMuted, marginTop: 4 },
  paceBarHr: { fontSize: 7, color: COLORS.textMuted },
  chartNote: { fontSize: 9, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm, fontStyle: 'italic' },

  // Predictions
  predBasedOn: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginBottom: SPACING.md, fontStyle: 'italic' },
  predRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  predRowGoal: { backgroundColor: 'rgba(190, 242, 100, 0.05)', marginHorizontal: -SPACING.lg, paddingHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.sm },
  predDist: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  predDistText: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '700' },
  goalBadge: { fontSize: 8, color: COLORS.lime, fontWeight: '800', backgroundColor: COLORS.limeDark, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, letterSpacing: 1 },
  predData: { alignItems: 'flex-end' },
  predTime: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '800' },
  predPace: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },

  // Goal section
  goalSection: { marginTop: SPACING.lg, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  goalTitle: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '700', marginBottom: SPACING.sm },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  goalCurrent: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '800' },
  goalTarget: { fontSize: FONT_SIZES.lg, fontWeight: '800' },

  // Best efforts
  effortRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  effortDist: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '700', width: 55 },
  effortData: { flex: 1, marginLeft: SPACING.md },
  effortPace: { fontSize: FONT_SIZES.body, color: COLORS.lime, fontWeight: '800' },
  effortTime: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  effortMeta: { alignItems: 'flex-end' },
  effortHr: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  effortDate: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
});
