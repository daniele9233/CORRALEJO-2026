import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../src/theme';
import { api } from '../../src/api';

const SCREEN_W = Dimensions.get('window').width;

export default function StatisticheScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const analytics = await api.getAnalytics();
      setData(analytics);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.lime} /></View>
      </SafeAreaView>
    );
  }

  const { vo2max, vo2max_target, user_max_hr, race_predictions, goal_gap_min, goal_progress_pct, weekly_volume, zone_distribution, anaerobic_threshold, best_efforts, totals } = data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.lime} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>STATISTICHE</Text>
        </View>

        {/* VO2max Ring Gauge with Target */}
        <View style={styles.vo2Card}>
          <View style={styles.vo2Ring}>
            <RingGauge value={vo2max || 0} max={60} size={120} color={getVo2Color(vo2max)} />
          </View>
          <View style={styles.vo2Info}>
            <Text style={styles.vo2Label}>VO2 MAX STIMATO</Text>
            <Text style={styles.vo2Value}>{vo2max || 'N/D'}</Text>
            <Text style={styles.vo2Unit}>ml/kg/min</Text>
            <Text style={styles.vo2Level}>{getVo2Level(vo2max)}</Text>
            <View style={styles.vo2TargetRow}>
              <Ionicons name="flag" size={14} color={COLORS.orange} />
              <Text style={styles.vo2TargetText}>Target 4:30/km: <Text style={styles.vo2TargetValue}>{vo2max_target || '~52'}</Text></Text>
            </View>
            {vo2max && vo2max_target && (
              <Text style={styles.vo2Gap}>Gap: {(vo2max_target - vo2max).toFixed(1)} ml/kg/min</Text>
            )}
          </View>
        </View>

        {/* Goal Progress */}
        <View style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <Ionicons name="flag" size={20} color={COLORS.lime} />
            <Text style={styles.goalTitle}>OBIETTIVO MEZZA MARATONA</Text>
          </View>
          <View style={styles.goalRow}>
            <View style={styles.goalStat}>
              <Text style={styles.goalStatLabel}>TARGET</Text>
              <Text style={styles.goalStatValue}>1:35:00</Text>
              <Text style={styles.goalStatSub}>4:30/km</Text>
            </View>
            <View style={styles.goalArrow}>
              <Ionicons name="arrow-forward" size={24} color={COLORS.textMuted} />
            </View>
            <View style={styles.goalStat}>
              <Text style={styles.goalStatLabel}>ATTUALE</Text>
              <Text style={[styles.goalStatValue, { color: COLORS.orange }]}>{data.current_hm_pred_str}</Text>
              <Text style={styles.goalStatSub}>{race_predictions?.['21.1km']?.predicted_pace}/km</Text>
            </View>
            <View style={styles.goalGap}>
              <Text style={styles.gapLabel}>GAP</Text>
              <Text style={styles.gapValue}>{goal_gap_min > 0 ? '+' : ''}{Math.floor(goal_gap_min)}:{String(Math.round(Math.abs(goal_gap_min % 1) * 60)).padStart(2, '0')}</Text>
            </View>
          </View>
          <View style={styles.goalProgressOuter}>
            <View style={[styles.goalProgressInner, { width: `${goal_progress_pct}%` }]} />
          </View>
          <Text style={styles.goalProgressText}>{goal_progress_pct}% verso l'obiettivo</Text>
        </View>

        {/* Race Predictions */}
        <SectionTitle icon="podium" title="PREVISIONI GARA" />
        <View style={styles.predGrid}>
          {Object.entries(race_predictions || {}).map(([dist, pred]: [string, any]) => {
            const isHM = dist === '21.1km';
            return (
              <View key={dist} style={[styles.predCard, isHM && styles.predCardHM]}>
                <Text style={styles.predDist}>{dist}</Text>
                <Text style={[styles.predTime, isHM && { color: COLORS.lime }]}>{pred.predicted_time_str}</Text>
                <Text style={styles.predPace}>{pred.predicted_pace}/km</Text>
              </View>
            );
          })}
        </View>

        {/* Anaerobic Threshold - Current vs Pre-Injury */}
        <SectionTitle icon="pulse" title="SOGLIA ANAEROBICA" />
        <View style={styles.atCard}>
          {/* Current */}
          <Text style={styles.atSubtitle}>ATTUALE</Text>
          <View style={styles.atRow}>
            <View style={styles.atItem}>
              <Ionicons name="heart" size={22} color={COLORS.red} />
              <Text style={styles.atValue}>{anaerobic_threshold?.current?.hr || 'N/D'}</Text>
              <Text style={styles.atLabel}>bpm</Text>
            </View>
            <View style={styles.atDivider} />
            <View style={styles.atItem}>
              <Ionicons name="speedometer" size={22} color={COLORS.blue} />
              <Text style={styles.atValue}>{anaerobic_threshold?.current?.pace || 'N/D'}</Text>
              <Text style={styles.atLabel}>/km</Text>
            </View>
            <View style={styles.atDivider} />
            <View style={styles.atItem}>
              <Ionicons name="fitness" size={22} color={COLORS.lime} />
              <Text style={styles.atValue}>{anaerobic_threshold?.current?.hr ? Math.round((anaerobic_threshold.current.hr / (user_max_hr || 180)) * 100) : 'N/D'}</Text>
              <Text style={styles.atLabel}>% FC max</Text>
            </View>
          </View>
          
          {/* Pre-Injury */}
          <View style={styles.atPreInjurySection}>
            <Text style={[styles.atSubtitle, { color: COLORS.orange }]}>PRE-INFORTUNIO (Nov 2025)</Text>
            <View style={styles.atRow}>
              <View style={styles.atItem}>
                <Ionicons name="heart" size={22} color={COLORS.orange} />
                <Text style={[styles.atValue, { color: COLORS.orange }]}>{anaerobic_threshold?.pre_injury?.hr || 149}</Text>
                <Text style={styles.atLabel}>bpm</Text>
              </View>
              <View style={styles.atDivider} />
              <View style={styles.atItem}>
                <Ionicons name="speedometer" size={22} color={COLORS.orange} />
                <Text style={[styles.atValue, { color: COLORS.orange }]}>{anaerobic_threshold?.pre_injury?.pace || '4:20'}</Text>
                <Text style={styles.atLabel}>/km</Text>
              </View>
              <View style={styles.atDivider} />
              <View style={styles.atItem}>
                <Ionicons name="fitness" size={22} color={COLORS.orange} />
                <Text style={[styles.atValue, { color: COLORS.orange }]}>{Math.round((149 / (user_max_hr || 180)) * 100)}</Text>
                <Text style={styles.atLabel}>% FC max</Text>
              </View>
            </View>
          </View>
        </View>

        {/* HR Zone Distribution with BPM Ranges */}
        <SectionTitle icon="heart-circle" title="ZONE FC (FC MAX: {user_max_hr || 180} BPM)" />
        <View style={styles.zoneCard}>
          {zone_distribution?.map((z: any, idx: number) => {
            const zoneColors = [COLORS.hrZone1, COLORS.hrZone2, COLORS.hrZone3, COLORS.hrZone4, COLORS.hrZone5];
            return (
              <View key={z.zone} style={styles.zoneRow}>
                <View style={styles.zoneLabel}>
                  <View style={[styles.zoneDot, { backgroundColor: zoneColors[idx] }]} />
                  <Text style={styles.zoneNameText}>{z.zone}</Text>
                </View>
                <View style={styles.zoneBpmRange}>
                  <Text style={styles.zoneBpmText}>{z.bpm_min}-{z.bpm_max}</Text>
                  <Text style={styles.zoneBpmUnit}>bpm</Text>
                </View>
                <View style={styles.zoneBarOuter}>
                  <View style={[styles.zoneBarInner, { width: `${Math.max(z.percentage, 3)}%`, backgroundColor: zoneColors[idx] }]} />
                </View>
                <Text style={styles.zonePct}>{z.percentage}%</Text>
              </View>
            );
          })}
          <View style={styles.zoneFooter}>
            <Text style={styles.zoneFooterText}>Z1: Recupero | Z2: Aerobica | Z3: Tempo | Z4: Soglia | Z5: Max</Text>
          </View>
        </View>

        {/* Weekly Volume Bars */}
        <SectionTitle icon="bar-chart" title="VOLUME SETTIMANALE (16 SETT)" />
        <View style={styles.chartCard}>
          <BarChart data={weekly_volume || []} />
        </View>

        {/* Best Efforts with Max HR */}
        <SectionTitle icon="trophy" title="MIGLIORI PRESTAZIONI" />
        <View style={styles.bestGrid}>
          {Object.entries(best_efforts || {}).map(([dist, eff]: [string, any]) => (
            <View key={dist} style={styles.bestCard}>
              <Text style={styles.bestDist}>{dist}</Text>
              <Text style={styles.bestPace}>{eff.pace}/km</Text>
              <Text style={styles.bestTime}>{Math.floor(eff.time)}:{String(Math.round((eff.time % 1) * 60)).padStart(2, '0')}</Text>
              <Text style={styles.bestDate}>{eff.date}</Text>
              {eff.avg_hr && (
                <View style={styles.bestHrRow}>
                  <Text style={styles.bestHrLabel}>FC media:</Text>
                  <Text style={styles.bestHr}>{eff.avg_hr}</Text>
                </View>
              )}
              {eff.max_hr && (
                <View style={styles.bestHrRow}>
                  <Text style={styles.bestHrLabel}>FC max:</Text>
                  <Text style={[styles.bestHr, { color: COLORS.red }]}>{eff.max_hr}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Totals */}
        <SectionTitle icon="stats-chart" title="TOTALI" />
        <View style={styles.totalsGrid}>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{totals?.total_runs}</Text>
            <Text style={styles.totalLabel}>CORSE</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{totals?.total_km}</Text>
            <Text style={styles.totalLabel}>KM TOTALI</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{totals?.total_time_hours}h</Text>
            <Text style={styles.totalLabel}>TEMPO</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{totals?.recent_30d_km}</Text>
            <Text style={styles.totalLabel}>KM 30 GIORNI</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ========== CHART COMPONENTS ==========

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={18} color={COLORS.lime} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function RingGauge({ value, max, size, color }: { value: number; max: number; size: number; color: string }) {
  const pct = Math.min(value / max, 1);
  const segments = 20;
  const activeSegments = Math.round(pct * segments);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size }}>
        {Array.from({ length: segments }).map((_, i) => {
          const angle = (i / segments) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const r = size / 2 - 8;
          const x = size / 2 + r * Math.cos(rad) - 4;
          const y = size / 2 + r * Math.sin(rad) - 4;
          const isActive = i < activeSegments;
          return (
            <View
              key={i}
              style={{
                position: 'absolute', left: x, top: y,
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: isActive ? color : COLORS.cardBorder,
              }}
            />
          );
        })}
      </View>
      <Text style={{ fontSize: 28, fontWeight: '900', color }}>{value}</Text>
    </View>
  );
}

function BarChart({ data }: { data: any[] }) {
  if (data.length === 0) return null;
  const maxKm = Math.max(...data.map(d => d.km), 1);
  const chartH = 100;

  return (
    <View>
      <View style={{ height: chartH, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {data.map((d, i) => {
          const h = (d.km / maxKm) * chartH;
          const isHigh = d.km > 30;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: chartH }}>
              <Text style={{ fontSize: 7, color: COLORS.textMuted, marginBottom: 1 }}>{d.km > 0 ? Math.round(d.km) : ''}</Text>
              <View style={{
                width: '85%', height: Math.max(h, 2), borderRadius: 3,
                backgroundColor: isHigh ? COLORS.lime : d.km > 10 ? COLORS.blue : COLORS.textMuted,
              }} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function getVo2Color(vo2: number | null) {
  if (!vo2) return COLORS.textMuted;
  if (vo2 >= 50) return COLORS.lime;
  if (vo2 >= 45) return COLORS.green;
  if (vo2 >= 40) return COLORS.blue;
  if (vo2 >= 35) return COLORS.orange;
  return COLORS.red;
}

function getVo2Level(vo2: number | null) {
  if (!vo2) return '';
  if (vo2 >= 55) return 'Eccellente';
  if (vo2 >= 50) return 'Ottimo';
  if (vo2 >= 45) return 'Buono';
  if (vo2 >= 40) return 'Medio';
  if (vo2 >= 35) return 'Sufficiente';
  return 'Da migliorare';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  pageTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.xl, marginTop: SPACING.xxl, marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 2 },

  // VO2max
  vo2Card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xl,
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  vo2Ring: {},
  vo2Info: { flex: 1 },
  vo2Label: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 2 },
  vo2Value: { fontSize: FONT_SIZES.hero, color: COLORS.text, fontWeight: '900', marginTop: 4 },
  vo2Unit: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  vo2Level: { fontSize: FONT_SIZES.md, color: COLORS.lime, fontWeight: '700', marginTop: 4 },
  vo2TargetRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.sm },
  vo2TargetText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  vo2TargetValue: { color: COLORS.orange, fontWeight: '700' },
  vo2Gap: { fontSize: FONT_SIZES.xs, color: COLORS.orange, marginTop: 2 },

  // Goal
  goalCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.2)',
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  goalTitle: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalStat: { alignItems: 'center' },
  goalStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1 },
  goalStatValue: { fontSize: FONT_SIZES.xl, color: COLORS.lime, fontWeight: '900', marginTop: 4 },
  goalStatSub: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  goalArrow: { paddingHorizontal: SPACING.sm },
  goalGap: { alignItems: 'center', backgroundColor: 'rgba(249, 115, 22, 0.15)', borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  gapLabel: { fontSize: FONT_SIZES.xs, color: COLORS.orange, fontWeight: '700' },
  gapValue: { fontSize: FONT_SIZES.lg, color: COLORS.orange, fontWeight: '900' },
  goalProgressOuter: { height: 8, backgroundColor: COLORS.cardBorder, borderRadius: 4, overflow: 'hidden', marginTop: SPACING.lg },
  goalProgressInner: { height: '100%', backgroundColor: COLORS.lime, borderRadius: 4 },
  goalProgressText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' },

  // Race predictions
  predGrid: { flexDirection: 'row', gap: SPACING.sm, marginHorizontal: SPACING.xl },
  predCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center',
  },
  predCardHM: { borderColor: 'rgba(190, 242, 100, 0.3)', backgroundColor: 'rgba(190, 242, 100, 0.05)' },
  predDist: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '700' },
  predTime: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '900', marginTop: 4 },
  predPace: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },

  // Anaerobic threshold
  atCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  atSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.sm, textAlign: 'center' },
  atRow: { flexDirection: 'row', alignItems: 'center' },
  atItem: { flex: 1, alignItems: 'center', gap: 2 },
  atDivider: { width: 1, height: 48, backgroundColor: COLORS.cardBorder },
  atValue: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '900' },
  atLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  atPreInjurySection: { marginTop: SPACING.lg, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },

  // HR Zones
  zoneCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder, gap: SPACING.sm,
  },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  zoneLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 50 },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  zoneNameText: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '700' },
  zoneBpmRange: { width: 70, flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  zoneBpmText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  zoneBpmUnit: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  zoneBarOuter: { flex: 1, height: 14, backgroundColor: COLORS.cardBorder, borderRadius: 7, overflow: 'hidden' },
  zoneBarInner: { height: '100%', borderRadius: 7 },
  zonePct: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '700', width: 36, textAlign: 'right' },
  zoneFooter: { marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  zoneFooterText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textAlign: 'center' },

  // Charts
  chartCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },

  // Best efforts
  bestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginHorizontal: SPACING.xl },
  bestCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.cardBorder,
    width: '31%', flexGrow: 1, alignItems: 'center',
  },
  bestDist: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 1 },
  bestPace: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '900', marginTop: 4 },
  bestTime: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  bestDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 },
  bestHrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  bestHrLabel: { fontSize: 9, color: COLORS.textMuted },
  bestHr: { fontSize: FONT_SIZES.xs, color: COLORS.orange, fontWeight: '600' },

  // Totals
  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginHorizontal: SPACING.xl },
  totalCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
    width: '48%', flexGrow: 1, alignItems: 'center',
  },
  totalValue: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '900' },
  totalLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1, marginTop: 4 },
});
