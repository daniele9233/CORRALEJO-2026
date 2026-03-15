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

// ---- Pace Line Chart Component ----
const LINE_CHART_HEIGHT = 180;
const LINE_CHART_PADDING = 40;

function PaceLineChart({ data }: { data: any[] }) {
  if (!data || data.length < 2) return null;

  // Get all pace values to determine scale
  const allSecs: number[] = [];
  for (const d of data) {
    if (d.easy_pace_secs) allSecs.push(d.easy_pace_secs);
    if (d.tempo_pace_secs) allSecs.push(d.tempo_pace_secs);
    if (d.fast_pace_secs) allSecs.push(d.fast_pace_secs);
  }
  if (allSecs.length === 0) return null;

  const maxSecs = Math.max(...allSecs) + 15;
  const minSecs = Math.min(...allSecs) - 15;
  const range = maxSecs - minSecs || 60;

  const chartW = SCREEN_WIDTH - 80 - LINE_CHART_PADDING;
  const stepX = chartW / Math.max(data.length - 1, 1);

  const toY = (secs: number) => {
    // Higher secs = slower = higher Y (top is faster)
    return ((secs - minSecs) / range) * LINE_CHART_HEIGHT;
  };

  const formatPace = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatWeek = (w: string) => {
    try {
      const parts = w.split('-');
      return `${parts[2]}/${parts[1]}`;
    } catch { return w; }
  };

  // Build SVG-like paths using Views
  const zones = [
    { key: 'easy_pace_secs', color: '#4ade80' },
    { key: 'tempo_pace_secs', color: '#facc15' },
    { key: 'fast_pace_secs', color: '#f87171' },
  ];

  // Only show last 12 weeks max
  const displayData = data.slice(-12);
  const displayStepX = chartW / Math.max(displayData.length - 1, 1);

  return (
    <View style={{ height: LINE_CHART_HEIGHT + 40, marginTop: SPACING.sm }}>
      {/* Y-axis labels */}
      <View style={{ position: 'absolute', left: 0, top: 0, height: LINE_CHART_HEIGHT, justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{formatPace(minSecs)}</Text>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{formatPace(Math.round((minSecs + maxSecs) / 2))}</Text>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{formatPace(maxSecs)}</Text>
      </View>

      {/* Chart area */}
      <View style={{ marginLeft: LINE_CHART_PADDING, height: LINE_CHART_HEIGHT, position: 'relative' }}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((pct, i) => (
          <View key={i} style={{
            position: 'absolute', top: pct * LINE_CHART_HEIGHT,
            left: 0, right: 0, height: 1,
            backgroundColor: COLORS.cardBorder, opacity: 0.5,
          }} />
        ))}

        {/* Data points and lines */}
        {zones.map(zone => {
          const points = displayData
            .map((d, i) => d[zone.key] ? { x: i * displayStepX, y: toY(d[zone.key]), secs: d[zone.key] } : null)
            .filter(Boolean) as { x: number; y: number; secs: number }[];

          if (points.length < 2) return null;

          return (
            <React.Fragment key={zone.key}>
              {/* Lines between points */}
              {points.map((p, i) => {
                if (i === 0) return null;
                const prev = points[i - 1];
                const dx = p.x - prev.x;
                const dy = p.y - prev.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                return (
                  <View key={`${zone.key}-line-${i}`} style={{
                    position: 'absolute',
                    left: prev.x,
                    top: prev.y,
                    width: length,
                    height: 2,
                    backgroundColor: zone.color,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: 'left center',
                    opacity: 0.8,
                  }} />
                );
              })}
              {/* Dots */}
              {points.map((p, i) => (
                <View key={`${zone.key}-dot-${i}`} style={{
                  position: 'absolute',
                  left: p.x - 3,
                  top: p.y - 3,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: zone.color,
                }} />
              ))}
            </React.Fragment>
          );
        })}
      </View>

      {/* X-axis labels */}
      <View style={{ marginLeft: LINE_CHART_PADDING, flexDirection: 'row', marginTop: 4 }}>
        {displayData.map((d, i) => (
          <Text key={i} style={{
            position: 'absolute',
            left: i * displayStepX - 14,
            fontSize: 7,
            color: COLORS.textMuted,
            width: 30,
            textAlign: 'center',
          }}>
            {i % Math.max(1, Math.floor(displayData.length / 5)) === 0 ? formatWeek(d.week) : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---- Cadence Line Chart Component ----
function CadenceLineChart({ data }: { data: { month: string; avg_cadence: number; runs_count: number }[] }) {
  if (!data || data.length < 2) return null;

  const cadences = data.map(d => d.avg_cadence);
  const maxCad = Math.max(...cadences, 185) + 5;
  const minCad = Math.min(...cadences, 170) - 5;
  const rangeCad = maxCad - minCad || 20;
  const cadChartH = 140;
  const cadChartW = CHART_WIDTH - 40;
  const stepX = cadChartW / Math.max(data.length - 1, 1);

  const toY = (v: number) => cadChartH - ((v - minCad) / rangeCad) * cadChartH;

  // Target line at 180 spm
  const targetY = toY(180);

  const fmtMonth = (m: string) => {
    try { const p = m.split('-'); return `${p[1]}/${p[0].slice(2)}`; } catch { return m; }
  };

  return (
    <View style={{ height: cadChartH + 30, marginTop: SPACING.sm }}>
      {/* Y-axis labels */}
      <View style={{ position: 'absolute', left: 0, top: 0, height: cadChartH, justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{maxCad}</Text>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{Math.round((minCad + maxCad) / 2)}</Text>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{minCad}</Text>
      </View>

      {/* Chart area */}
      <View style={{ marginLeft: 36, height: cadChartH, position: 'relative' }}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((pct, i) => (
          <View key={i} style={{
            position: 'absolute', top: pct * cadChartH,
            left: 0, right: 0, height: 1,
            backgroundColor: COLORS.cardBorder, opacity: 0.5,
          }} />
        ))}

        {/* Target line at 180 spm */}
        {targetY >= 0 && targetY <= cadChartH && (
          <>
            <View style={{
              position: 'absolute', top: targetY,
              left: 0, right: 0, height: 1,
              backgroundColor: COLORS.lime, opacity: 0.6,
              borderStyle: 'dashed',
            }} />
            <Text style={{
              position: 'absolute', top: targetY - 12, right: 0,
              fontSize: 8, color: COLORS.lime, fontWeight: '700',
            }}>180</Text>
          </>
        )}

        {/* Lines between points */}
        {data.map((d, i) => {
          if (i === 0) return null;
          const prev = data[i - 1];
          const x1 = (i - 1) * stepX, y1 = toY(prev.avg_cadence);
          const x2 = i * stepX, y2 = toY(d.avg_cadence);
          const dx = x2 - x1, dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View key={`cline-${i}`} style={{
              position: 'absolute', left: x1, top: y1,
              width: length, height: 2, backgroundColor: COLORS.blue,
              transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center', opacity: 0.8,
            }} />
          );
        })}

        {/* Dots + values */}
        {data.map((d, i) => (
          <React.Fragment key={`cdot-${i}`}>
            <View style={{
              position: 'absolute', left: i * stepX - 4, top: toY(d.avg_cadence) - 4,
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: d.avg_cadence >= 180 ? COLORS.lime : COLORS.blue,
            }} />
            <Text style={{
              position: 'absolute', left: i * stepX - 10, top: toY(d.avg_cadence) - 18,
              fontSize: 8, color: COLORS.text, fontWeight: '700', width: 24, textAlign: 'center',
            }}>{d.avg_cadence}</Text>
          </React.Fragment>
        ))}
      </View>

      {/* X-axis labels */}
      <View style={{ marginLeft: 36, flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <Text key={i} style={{
            position: 'absolute', left: i * stepX - 14, fontSize: 7,
            color: COLORS.textMuted, width: 30, textAlign: 'center',
          }}>
            {i % Math.max(1, Math.floor(data.length / 6)) === 0 ? fmtMonth(d.month) : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function ProgressiScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [cadenceHistory, setCadenceHistory] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      setError(false);
      const [data, cadenceData] = await Promise.all([
        api.getAnalytics(),
        api.getCadenceHistory().catch(() => ({ cadence_history: [] })),
      ]);
      setAnalytics(data);
      setCadenceHistory(cadenceData.cadence_history || []);
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

  const { vo2max, vo2max_target, vo2max_history, anaerobic_threshold, race_predictions, best_efforts, goal_progress_pct, target_hm_time_str, current_hm_pred_str } = analytics;
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

          {/* VO2max History Chart */}
          {vo2max_history && vo2max_history.length >= 2 && (() => {
            const points = vo2max_history.slice(-12);
            const vdots = points.map((p: any) => p.vdot);
            const maxV = Math.max(...vdots) + 2;
            const minV = Math.min(...vdots) - 2;
            const rangeV = maxV - minV || 5;
            const vo2ChartH = 120;
            const vo2ChartW = CHART_WIDTH - 40;
            const stepX = vo2ChartW / Math.max(points.length - 1, 1);

            const toY = (v: number) => vo2ChartH - ((v - minV) / rangeV) * vo2ChartH;
            const fmtDate = (d: string) => { try { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0].slice(2)}`; } catch { return d; } };

            return (
              <View style={{ marginTop: SPACING.lg }}>
                <Text style={styles.chartLabel}>ANDAMENTO VO2MAX</Text>
                <View style={{ height: vo2ChartH + 30, marginTop: SPACING.sm }}>
                  <View style={{ position: 'absolute', left: 0, top: 0, height: vo2ChartH, justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{maxV.toFixed(1)}</Text>
                    <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{((minV + maxV) / 2).toFixed(1)}</Text>
                    <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{minV.toFixed(1)}</Text>
                  </View>
                  <View style={{ marginLeft: 36, height: vo2ChartH, position: 'relative' }}>
                    {[0, 0.5, 1].map((pct, i) => (
                      <View key={i} style={{ position: 'absolute', top: pct * vo2ChartH, left: 0, right: 0, height: 1, backgroundColor: COLORS.cardBorder, opacity: 0.5 }} />
                    ))}
                    {points.map((p: any, i: number) => {
                      if (i === 0) return null;
                      const prev = points[i - 1];
                      const x1 = (i - 1) * stepX, y1 = toY(prev.vdot);
                      const x2 = i * stepX, y2 = toY(p.vdot);
                      const dx = x2 - x1, dy = y2 - y1;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <View key={`line-${i}`} style={{
                          position: 'absolute', left: x1, top: y1,
                          width: length, height: 2, backgroundColor: COLORS.red,
                          transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center', opacity: 0.8,
                        }} />
                      );
                    })}
                    {points.map((p: any, i: number) => (
                      <React.Fragment key={`dot-${i}`}>
                        <View style={{
                          position: 'absolute', left: i * stepX - 4, top: toY(p.vdot) - 4,
                          width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red,
                        }} />
                        <Text style={{
                          position: 'absolute', left: i * stepX - 12, top: toY(p.vdot) - 18,
                          fontSize: 8, color: COLORS.text, fontWeight: '700', width: 26, textAlign: 'center',
                        }}>{p.vdot}</Text>
                      </React.Fragment>
                    ))}
                  </View>
                  <View style={{ marginLeft: 36, flexDirection: 'row', marginTop: 4 }}>
                    {points.map((p: any, i: number) => (
                      <Text key={i} style={{
                        position: 'absolute', left: i * stepX - 14, fontSize: 7,
                        color: COLORS.textMuted, width: 30, textAlign: 'center',
                      }}>
                        {i % Math.max(1, Math.floor(points.length / 5)) === 0 ? fmtDate(p.date) : ''}
                      </Text>
                    ))}
                  </View>
                </View>
                <Text style={styles.chartNote}>↑ Linea che sale = VO2max migliora</Text>
              </View>
            );
          })()}
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

        {/* Pace Progression Line Chart */}
        {analytics.pace_progression && analytics.pace_progression.length > 2 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="analytics" size={20} color={COLORS.blue} />
              <Text style={styles.sectionTitle}>ANDAMENTO PACES</Text>
            </View>
            <Text style={styles.predBasedOn}>Ritmi medi per zona, settimana per settimana</Text>
            <PaceLineChart data={analytics.pace_progression} />
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} />
                <Text style={styles.legendText}>Easy</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#facc15' }]} />
                <Text style={styles.legendText}>Tempo</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#f87171' }]} />
                <Text style={styles.legendText}>Fast</Text>
              </View>
            </View>
            <Text style={styles.chartNote}>↓ Linee che scendono = passo più veloce (meglio)</Text>
          </View>
        )}

        {/* Cadence Trend */}
        {cadenceHistory.length >= 2 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="footsteps" size={20} color={COLORS.blue} />
              <Text style={styles.sectionTitle}>CADENZA</Text>
            </View>
            <Text style={styles.predBasedOn}>
              Media mensile (spm) — target: 180 passi/min
            </Text>
            <CadenceLineChart data={cadenceHistory} />
            <Text style={styles.chartNote}>
              Punti verdi = cadenza a target (180+) — Linea tratteggiata = obiettivo
            </Text>
          </View>
        )}

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

  // Legend
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.lg, marginTop: SPACING.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
});
