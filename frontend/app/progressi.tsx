import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, PanResponder, GestureResponderEvent,
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


// ---- Pace Line Chart Component ----
const LINE_CHART_HEIGHT = 180;
const LINE_CHART_PADDING = 40;

function PaceLineChart({ data }: { data: any[] }) {
  const [paceTooltip, setPaceTooltip] = useState<{ x: number; easy: string; tempo: string; fast: string; week: string } | null>(null);
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
      <View
        style={{ marginLeft: LINE_CHART_PADDING, height: LINE_CHART_HEIGHT, position: 'relative' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          const touchX = e.nativeEvent.locationX;
          const idx = Math.round(touchX / displayStepX);
          const clamped = Math.max(0, Math.min(idx, displayData.length - 1));
          const d = displayData[clamped];
          setPaceTooltip({
            x: clamped * displayStepX,
            easy: d.easy_pace_secs ? formatPace(d.easy_pace_secs) : '-',
            tempo: d.tempo_pace_secs ? formatPace(d.tempo_pace_secs) : '-',
            fast: d.fast_pace_secs ? formatPace(d.fast_pace_secs) : '-',
            week: formatWeek(d.week),
          });
        }}
        onResponderMove={(e) => {
          const touchX = e.nativeEvent.locationX;
          const idx = Math.round(touchX / displayStepX);
          const clamped = Math.max(0, Math.min(idx, displayData.length - 1));
          const d = displayData[clamped];
          setPaceTooltip({
            x: clamped * displayStepX,
            easy: d.easy_pace_secs ? formatPace(d.easy_pace_secs) : '-',
            tempo: d.tempo_pace_secs ? formatPace(d.tempo_pace_secs) : '-',
            fast: d.fast_pace_secs ? formatPace(d.fast_pace_secs) : '-',
            week: formatWeek(d.week),
          });
        }}
        onResponderRelease={() => setPaceTooltip(null)}
      >
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
        {/* Tooltip */}
        {paceTooltip && (
          <View style={{
            position: 'absolute',
            left: Math.max(0, Math.min(paceTooltip.x - 40, chartW - 80)),
            top: 5,
            backgroundColor: COLORS.card,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: COLORS.lime,
            zIndex: 10,
          }}>
            <Text style={{ fontSize: 8, color: COLORS.textMuted, fontWeight: '700' }}>{paceTooltip.week}</Text>
            <Text style={{ fontSize: 9, color: '#4ade80' }}>Easy: {paceTooltip.easy}</Text>
            <Text style={{ fontSize: 9, color: '#facc15' }}>Tempo: {paceTooltip.tempo}</Text>
            <Text style={{ fontSize: 9, color: '#f87171' }}>Fast: {paceTooltip.fast}</Text>
          </View>
        )}
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
  const [cadTooltip, setCadTooltip] = useState<{ x: number; value: number; month: string } | null>(null);
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
      <View
        style={{ marginLeft: 36, height: cadChartH, position: 'relative' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          const touchX = e.nativeEvent.locationX;
          const idx = Math.round(touchX / stepX);
          const clamped = Math.max(0, Math.min(idx, data.length - 1));
          setCadTooltip({ x: clamped * stepX, value: data[clamped].avg_cadence, month: fmtMonth(data[clamped].month) });
        }}
        onResponderMove={(e) => {
          const touchX = e.nativeEvent.locationX;
          const idx = Math.round(touchX / stepX);
          const clamped = Math.max(0, Math.min(idx, data.length - 1));
          setCadTooltip({ x: clamped * stepX, value: data[clamped].avg_cadence, month: fmtMonth(data[clamped].month) });
        }}
        onResponderRelease={() => setCadTooltip(null)}
      >
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
        {/* Tooltip */}
        {cadTooltip && (
          <View style={{
            position: 'absolute',
            left: Math.max(0, Math.min(cadTooltip.x - 35, cadChartW - 70)),
            top: toY(cadTooltip.value) - 45,
            backgroundColor: COLORS.card,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: COLORS.blue,
            zIndex: 10,
          }}>
            <Text style={{ fontSize: 10, color: COLORS.blue, fontWeight: '800' }}>{cadTooltip.value} spm</Text>
            <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{cadTooltip.month}</Text>
          </View>
        )}
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

// ---- Decoupling Line Chart Component ----
const DECOUPLING_CHART_HEIGHT = 180;

function DecouplingLineChart({ data }: { data: any[] }) {
  const [decTooltip, setDecTooltip] = useState<{ x: number; value: number; week: string; pace: string; dist: number } | null>(null);
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.decoupling_pct);
  // Scale: show from -1 to max+2, minimum range up to 10
  const minVal = Math.min(...values, -1);
  const maxVal = Math.max(...values, 10) + 2;
  const range = maxVal - minVal || 10;

  const chartW = SCREEN_WIDTH - 80 - 40;
  const stepX = chartW / Math.max(data.length - 1, 1);

  // Inverted: lower value = better = higher on chart
  const toY = (val: number) => {
    return ((val - minVal) / range) * DECOUPLING_CHART_HEIGHT;
  };

  const fmtWeek = (w: string) => {
    try {
      const parts = w.split('-');
      return `${parts[2]}/${parts[1]}`;
    } catch { return w; }
  };

  const dotColor = (val: number) => {
    if (val < 3.5) return '#22c55e';
    if (val < 5) return '#facc15';
    if (val < 7.5) return '#f97316';
    return '#ef4444';
  };

  // Zone backgrounds (green < 3.5, yellow 3.5-5, orange 5-7.5, red > 7.5)
  const zones = [
    { from: minVal, to: 3.5, color: '#22c55e10' },
    { from: 3.5, to: 5, color: '#facc1510' },
    { from: 5, to: 7.5, color: '#f9731610' },
    { from: 7.5, to: maxVal, color: '#ef444410' },
  ];

  // Target line at 5%
  const targetY = toY(5);

  return (
    <View style={{ height: DECOUPLING_CHART_HEIGHT + 40, marginTop: SPACING.sm }}>
      {/* Y-axis labels */}
      <View style={{ position: 'absolute', left: 0, top: 0, height: DECOUPLING_CHART_HEIGHT, justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{maxVal.toFixed(0)}%</Text>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{((minVal + maxVal) / 2).toFixed(0)}%</Text>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{minVal.toFixed(0)}%</Text>
      </View>

      {/* Chart area */}
      <View
        style={{ marginLeft: 40, height: DECOUPLING_CHART_HEIGHT, position: 'relative' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          const touchX = e.nativeEvent.locationX;
          const idx = Math.round(touchX / stepX);
          const clamped = Math.max(0, Math.min(idx, data.length - 1));
          const d = data[clamped];
          setDecTooltip({
            x: clamped * stepX,
            value: d.decoupling_pct,
            week: d.week,
            pace: d.avg_pace,
            dist: d.distance_km,
          });
        }}
        onResponderRelease={() => setTimeout(() => setDecTooltip(null), 2000)}
      >
        {/* Zone backgrounds */}
        {zones.map((z, i) => {
          const top = toY(z.to);
          const bottom = toY(z.from);
          const height = Math.abs(bottom - top);
          if (height <= 0) return null;
          return (
            <View key={`dzone-${i}`} style={{
              position: 'absolute', left: 0, right: 0,
              top: Math.min(top, bottom), height,
              backgroundColor: z.color,
            }} />
          );
        })}

        {/* Target line at 5% */}
        <View style={{
          position: 'absolute', left: 0, right: 0,
          top: targetY, height: 1,
          borderWidth: 1, borderColor: '#f97316', borderStyle: 'dashed', opacity: 0.5,
        }} />

        {/* Lines between dots */}
        {data.map((d, i) => {
          if (i === 0) return null;
          const prev = data[i - 1];
          const x1 = (i - 1) * stepX, y1 = toY(prev.decoupling_pct);
          const x2 = i * stepX, y2 = toY(d.decoupling_pct);
          const dx = x2 - x1, dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View key={`dline-${i}`} style={{
              position: 'absolute', left: x1, top: y1,
              width: length, height: 2,
              backgroundColor: COLORS.textSecondary,
              transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center', opacity: 0.4,
            }} />
          );
        })}

        {/* Dots */}
        {data.map((d, i) => (
          <React.Fragment key={`ddot-${i}`}>
            <View style={{
              position: 'absolute', left: i * stepX - 5, top: toY(d.decoupling_pct) - 5,
              width: 10, height: 10, borderRadius: 5,
              backgroundColor: dotColor(d.decoupling_pct),
            }} />
            <Text style={{
              position: 'absolute', left: i * stepX - 14, top: toY(d.decoupling_pct) - 18,
              fontSize: 8, color: COLORS.text, fontWeight: '700', width: 30, textAlign: 'center',
            }}>{d.decoupling_pct.toFixed(1)}</Text>
          </React.Fragment>
        ))}

        {/* Tooltip */}
        {decTooltip && (
          <View style={{
            position: 'absolute',
            left: Math.max(0, Math.min(decTooltip.x - 40, chartW - 80)),
            top: toY(decTooltip.value) - 52,
            backgroundColor: COLORS.card,
            borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
            borderWidth: 1, borderColor: dotColor(decTooltip.value), zIndex: 10,
          }}>
            <Text style={{ fontSize: 10, color: dotColor(decTooltip.value), fontWeight: '800' }}>
              {decTooltip.value.toFixed(1)}%
            </Text>
            <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
              {decTooltip.pace}/km - {decTooltip.dist}km
            </Text>
            <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{fmtWeek(decTooltip.week)}</Text>
          </View>
        )}
      </View>

      {/* X-axis labels */}
      <View style={{ marginLeft: 40, flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <Text key={i} style={{
            position: 'absolute', left: i * stepX - 14, fontSize: 7,
            color: COLORS.textMuted, width: 30, textAlign: 'center',
          }}>
            {i % Math.max(1, Math.floor(data.length / 8)) === 0 ? fmtWeek(d.week) : ''}
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
  const [decouplingHistory, setDecouplingHistory] = useState<any[]>([]);
  const [fitnessData, setFitnessData] = useState<any>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('tutti');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: string; label: string } | null>(null);
  const [ffTouchIdx, setFfTouchIdx] = useState<number | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      setError(false);
      const [data, cadenceData, decouplingData, fitData] = await Promise.all([
        api.getAnalytics(),
        api.getCadenceHistory().catch(() => ({ cadence_history: [] })),
        api.getDecouplingHistory().catch(() => ({ decoupling_history: [] })),
        api.getFitnessFreshness().catch(() => ({ fitness_freshness: [], current: {} })),
      ]);
      setAnalytics(data);
      setCadenceHistory(cadenceData.cadence_history || []);
      setDecouplingHistory(decouplingData.decoupling_history || []);
      setFitnessData(fitData);
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

  const { vo2max, vo2max_target, vo2max_history, anaerobic_threshold, best_efforts, goal_progress_pct, target_hm_time_str, current_hm_pred_str } = analytics;
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} scrollEnabled={scrollEnabled}>

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
                  <View
                    style={{ marginLeft: 36, height: vo2ChartH, position: 'relative' }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) => {
                      const touchX = e.nativeEvent.locationX;
                      const idx = Math.round(touchX / stepX);
                      const clamped = Math.max(0, Math.min(idx, points.length - 1));
                      const p = points[clamped];
                      setTooltip({ x: clamped * stepX + 36, y: toY(p.vdot), value: `${p.vdot}`, label: fmtDate(p.date) });
                    }}
                    onResponderMove={(e) => {
                      const touchX = e.nativeEvent.locationX;
                      const idx = Math.round(touchX / stepX);
                      const clamped = Math.max(0, Math.min(idx, points.length - 1));
                      const p = points[clamped];
                      setTooltip({ x: clamped * stepX + 36, y: toY(p.vdot), value: `${p.vdot}`, label: fmtDate(p.date) });
                    }}
                    onResponderRelease={() => setTooltip(null)}
                  >
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
                    {/* Tooltip */}
                    {tooltip && (
                      <View style={{
                        position: 'absolute',
                        left: Math.max(0, Math.min(tooltip.x - 36 - 35, vo2ChartW - 70)),
                        top: Math.max(0, tooltip.y - 45),
                        backgroundColor: COLORS.card,
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderWidth: 1,
                        borderColor: COLORS.lime,
                        zIndex: 10,
                      }}>
                        <Text style={{ fontSize: 10, color: COLORS.lime, fontWeight: '800' }}>{tooltip.value}</Text>
                        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>{tooltip.label}</Text>
                      </View>
                    )}
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

        {/* Decoupling Trend */}
        {decouplingHistory.length >= 2 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="pulse" size={20} color="#f97316" />
              <Text style={styles.sectionTitle}>EFFICIENZA AEROBICA (TREND)</Text>
            </View>
            <Text style={styles.predBasedOn}>
              Decoupling cardiaco per settimana — corse steady (CV passo {'<'}10%, {'\u2265'}4km)
            </Text>
            <DecouplingLineChart data={decouplingHistory} />
            <Text style={styles.chartNote}>
              {'<'} 3.5% = Eccellente | 3.5-5% = Buona | 5-7.5% = Da migliorare | {'>'} 7.5% = Insufficiente
            </Text>
            <Text style={[styles.chartNote, { marginTop: 2 }]}>
              Linea tratteggiata = target 5% — Valori bassi = migliore efficienza aerobica
            </Text>
          </View>
        )}

        {/* HR Zone Distribution (Seiler 2010) */}
        {analytics.hr_zone_distribution && analytics.hr_zone_distribution.total_runs_with_hr >= 3 && (() => {
          const zd = analytics.hr_zone_distribution;
          const zones = [
            { key: 'z1_pct', label: 'Z1', sublabel: 'Recovery', color: '#3b82f6', pct: zd.z1_pct },
            { key: 'z2_pct', label: 'Z2', sublabel: 'Easy', color: '#22c55e', pct: zd.z2_pct },
            { key: 'z3_pct', label: 'Z3', sublabel: 'Tempo', color: '#facc15', pct: zd.z3_pct },
            { key: 'z4_pct', label: 'Z4', sublabel: 'VO2max', color: '#f97316', pct: zd.z4_pct },
            { key: 'z5_pct', label: 'Z5', sublabel: 'Sprint', color: '#ef4444', pct: zd.z5_pct },
          ];
          const polScore = zd.polarization_score;
          const polColor = polScore >= 80 ? COLORS.green : polScore >= 70 ? COLORS.orange : COLORS.red;
          const maxPct = Math.max(...zones.map(z => z.pct), 1);

          return (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="heart" size={20} color="#ef4444" />
                <Text style={styles.sectionTitle}>DISTRIBUZIONE ZONE HR</Text>
              </View>
              <Text style={styles.predBasedOn}>
                Ultime 4 settimane ({zd.total_runs_with_hr} corse) — target: 80% Z1-Z2 (Seiler 2010)
              </Text>

              {/* Zone bars - all tracks aligned to same width */}
              <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
                {zones.map(z => {
                  const barW = Math.max(2, z.pct);
                  return (
                  <View key={z.key} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                    <View style={{ width: 28, alignItems: 'center' }}>
                      <Text style={{ fontSize: FONT_SIZES.xs, color: z.color, fontWeight: '800' }}>{z.label}</Text>
                    </View>
                    <View style={{ flex: 1, height: 22, backgroundColor: '#1a1a2e', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a3e' }}>
                      <View style={{
                        height: 20,
                        width: `${barW}%`,
                        backgroundColor: z.color + '50',
                        borderRadius: 5,
                        justifyContent: 'center',
                        paddingLeft: 6,
                      }}>
                        {z.pct >= 10 && (
                          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '800' }}>{z.pct}%</Text>
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, color: z.color, fontWeight: '800', width: 30, textAlign: 'right' }}>{z.pct}%</Text>
                    <Text style={{ fontSize: 9, color: COLORS.textMuted, width: 48 }}>{z.sublabel}</Text>
                  </View>
                  );
                })}
              </View>

              {/* Polarization score */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                marginTop: SPACING.lg, gap: SPACING.sm,
                backgroundColor: polColor + '10', borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
              }}>
                <Text style={{ fontSize: FONT_SIZES.body, color: polColor, fontWeight: '900' }}>
                  Polarizzazione: {polScore}%
                </Text>
                {zd.is_polarized && (
                  <View style={{ backgroundColor: COLORS.green + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, color: COLORS.green, fontWeight: '800' }}>80/20 OK</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 9, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xs, fontStyle: 'italic' }}>
                Z1+Z2 = allenamento facile • Z4+Z5 = alta intensità • Seiler: ≥80% facile
              </Text>
            </View>
          );
        })()}

        {/* Fitness & Freshness — Strava-style */}
        {fitnessData && fitnessData.fitness_freshness && fitnessData.fitness_freshness.length > 0 && (() => {
          const ff = fitnessData.fitness_freshness;
          const curr = fitnessData.current || {};

          const formColors: Record<string, string> = {
            green: '#22c55e',
            yellow: '#eab308',
            orange: '#f97316',
            red: '#ef4444',
          };
          const formColor = formColors[curr.form_color] || COLORS.textMuted;

          // Chart dimensions
          const FF_CHART_H = 200;
          const FF_CHART_PAD_L = 30;
          const FF_CHART_PAD_R = 10;
          const ffChartW = SCREEN_WIDTH - 64 - FF_CHART_PAD_L - FF_CHART_PAD_R;

          // Determine scale from all data
          const allVals = ff.flatMap((p: any) => [p.ctl, p.atl]);
          const maxY = Math.max(...allVals, 10) * 1.15;
          const stepX = ffChartW / Math.max(ff.length - 1, 1);

          const toChartY = (val: number) => FF_CHART_H - (Math.max(val, 0) / maxY) * FF_CHART_H;

          // Month labels for x-axis
          const MONTH_NAMES_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
          const monthLabels: { idx: number; label: string }[] = [];
          let lastMonth = '';
          ff.forEach((p: any, i: number) => {
            const m = p.date?.slice(0, 7);
            if (m && m !== lastMonth) {
              lastMonth = m;
              const parts = m.split('-');
              const yr = parts[0].slice(2);
              const mo = parseInt(parts[1]) - 1;
              monthLabels.push({ idx: i, label: `${MONTH_NAMES_SHORT[mo]}` + (mo === 0 ? `\n${parts[0]}` : '') });
            }
          });

          // Y-axis gridlines
          const yStep = Math.ceil(maxY / 5 / 10) * 10;
          const yGridLines: number[] = [];
          for (let v = 0; v <= maxY; v += yStep) yGridLines.push(v);

          return (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="fitness" size={20} color="#f97316" />
                <Text style={styles.sectionTitle}>FITNESS & FRESHNESS</Text>
              </View>

              {/* 3 big status cards — Strava style */}
              <View style={{ flexDirection: 'row', marginBottom: SPACING.lg, gap: SPACING.md }}>
                {/* Condizione Fisica */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36, color: '#f97316', fontWeight: '900', lineHeight: 40 }}>{curr.ctl}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316' }} />
                    <Text style={{ fontSize: 9, color: '#f97316', fontWeight: '700' }}>CONDIZIONE</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: '#f97316', fontWeight: '700' }}>FISICA</Text>
                  {curr.ctl_trend !== undefined && curr.ctl_trend !== 0 && (
                    <Text style={{ fontSize: 10, color: curr.ctl_trend > 0 ? '#22c55e' : '#ef4444', fontWeight: '800', marginTop: 2 }}>
                      {curr.ctl_trend > 0 ? '+' : ''}{curr.ctl_trend}
                    </Text>
                  )}
                </View>

                {/* Affaticamento */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36, color: '#9ca3af', fontWeight: '900', lineHeight: 40 }}>{curr.atl}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#9ca3af' }} />
                    <Text style={{ fontSize: 9, color: '#9ca3af', fontWeight: '700' }}>AFFATICAMENTO</Text>
                  </View>
                </View>

                {/* Forma Fisica */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36, color: formColor, fontWeight: '900', lineHeight: 40 }}>{curr.tsb}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: formColor }} />
                    <Text style={{ fontSize: 9, color: formColor, fontWeight: '700' }}>FORMA</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: formColor, fontWeight: '700' }}>FISICA</Text>
                  <View style={{ backgroundColor: formColor + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 3 }}>
                    <Text style={{ fontSize: 8, color: formColor, fontWeight: '800' }}>{curr.form_status?.toUpperCase()}</Text>
                  </View>
                </View>
              </View>

              {/* Interactive Strava-style chart with touch */}
              {(() => {
                // Include TSB in scale calculation
                const allTsbVals = ff.map((p: any) => p.tsb);
                const minTsb = Math.min(...allTsbVals, 0);
                const maxAll = Math.max(maxY, 10);
                const totalRange = maxAll - Math.min(minTsb, -10);
                const zeroLineY = (maxAll / totalRange) * FF_CHART_H;

                const toY = (val: number) => FF_CHART_H - ((val - Math.min(minTsb, -10)) / totalRange) * FF_CHART_H;

                // Touch handler — disables parent scroll while dragging
                const handleTouchStart = (evt: any) => {
                  setScrollEnabled(false);
                  const touchX = evt.nativeEvent.locationX - FF_CHART_PAD_L;
                  const idx = Math.round(touchX / stepX);
                  setFfTouchIdx(Math.max(0, Math.min(ff.length - 1, idx)));
                };
                const handleTouchMove = (evt: any) => {
                  const touchX = evt.nativeEvent.locationX - FF_CHART_PAD_L;
                  const idx = Math.round(touchX / stepX);
                  setFfTouchIdx(Math.max(0, Math.min(ff.length - 1, idx)));
                };
                const handleTouchEnd = () => {
                  setScrollEnabled(true);
                  setFfTouchIdx(null);
                };

                const touchedPoint = ffTouchIdx !== null ? ff[ffTouchIdx] : null;
                const DAYS = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
                const formatTouchDate = (dateStr: string) => {
                  const d = new Date(dateStr + 'T00:00:00');
                  const day = DAYS[d.getDay()];
                  const dd = d.getDate();
                  const mm = d.getMonth() + 1;
                  return `${day} ${dd}/${mm.toString().padStart(2, '0')}`;
                };

                return (
                  <View
                    style={{ height: FF_CHART_H + 40, marginBottom: SPACING.sm }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderTerminationRequest={() => false}
                    onResponderGrant={handleTouchStart}
                    onResponderMove={handleTouchMove}
                    onResponderRelease={handleTouchEnd}
                  >
                    {/* Tooltip on touch */}
                    {touchedPoint && ffTouchIdx !== null && (
                      <View style={{
                        position: 'absolute', top: -50, zIndex: 20,
                        left: Math.min(Math.max(FF_CHART_PAD_L + ffTouchIdx * stepX - 70, 4), ffChartW - 100),
                        backgroundColor: '#1a1a2e', borderRadius: 8, padding: 8,
                        borderWidth: 1, borderColor: '#333',
                        shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6,
                      }}>
                        <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700', marginBottom: 3 }}>
                          {formatTouchDate(touchedPoint.date)}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <Text style={{ fontSize: 9, color: '#f97316', fontWeight: '600' }}>
                            {touchedPoint.ctl} Cond.
                          </Text>
                          <Text style={{ fontSize: 9, color: '#9ca3af', fontWeight: '600' }}>
                            {touchedPoint.atl} Affat.
                          </Text>
                          <Text style={{ fontSize: 9, color: touchedPoint.tsb >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                            {touchedPoint.tsb} Forma
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Y-axis labels + gridlines */}
                    {yGridLines.map((val, i) => (
                      <React.Fragment key={`yg-${i}`}>
                        <View style={{
                          position: 'absolute', left: FF_CHART_PAD_L, right: FF_CHART_PAD_R,
                          top: toY(val), height: 1,
                          backgroundColor: COLORS.cardBorder, opacity: 0.3,
                        }} />
                        <Text style={{
                          position: 'absolute', left: 0, top: toY(val) - 6,
                          fontSize: 8, color: COLORS.textMuted, width: FF_CHART_PAD_L - 4, textAlign: 'right',
                        }}>{val}</Text>
                      </React.Fragment>
                    ))}

                    {/* Zero line (baseline) */}
                    <View style={{
                      position: 'absolute', left: FF_CHART_PAD_L, right: FF_CHART_PAD_R,
                      top: toY(0), height: 1,
                      backgroundColor: '#555', opacity: 0.6,
                    }} />

                    {/* TSB area fill (green above 0, red below 0) */}
                    {ff.map((point: any, i: number) => {
                      if (i === 0) return null;
                      const x1 = FF_CHART_PAD_L + (i - 1) * stepX;
                      const x2 = FF_CHART_PAD_L + i * stepX;
                      const prev = ff[i - 1];
                      const avgTsb = (prev.tsb + point.tsb) / 2;
                      const y0 = toY(0);
                      const yVal = toY(avgTsb);
                      if (avgTsb >= 0) {
                        return (
                          <View key={`tsb-fill-${i}`} style={{
                            position: 'absolute', left: x1, top: yVal,
                            width: x2 - x1 + 1, height: Math.max(y0 - yVal, 0),
                            backgroundColor: '#22c55e10',
                          }} />
                        );
                      } else {
                        return (
                          <View key={`tsb-fill-${i}`} style={{
                            position: 'absolute', left: x1, top: y0,
                            width: x2 - x1 + 1, height: Math.max(yVal - y0, 0),
                            backgroundColor: '#ef444410',
                          }} />
                        );
                      }
                    })}

                    {/* ATL area (grey filled under line) */}
                    {ff.length > 1 && ff.map((point: any, i: number) => {
                      if (i === 0) return null;
                      const prev = ff[i - 1];
                      const x1 = FF_CHART_PAD_L + (i - 1) * stepX;
                      const x2 = FF_CHART_PAD_L + i * stepX;
                      const y1 = toY(prev.atl);
                      const y2 = toY(point.atl);
                      const avgYa = (y1 + y2) / 2;
                      const barH = FF_CHART_H - avgYa;
                      return (
                        <View key={`atl-fill-${i}`} style={{
                          position: 'absolute', left: x1, top: avgYa,
                          width: x2 - x1 + 1, height: Math.max(barH, 0),
                          backgroundColor: '#9ca3af12',
                        }} />
                      );
                    })}

                    {/* ATL line (grey) */}
                    {ff.map((point: any, i: number) => {
                      if (i === 0) return null;
                      const prev = ff[i - 1];
                      const x1 = FF_CHART_PAD_L + (i - 1) * stepX;
                      const x2 = FF_CHART_PAD_L + i * stepX;
                      const y1 = toY(prev.atl);
                      const y2 = toY(point.atl);
                      const dx = x2 - x1, dy = y2 - y1;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <View key={`atl-${i}`} style={{
                          position: 'absolute', left: x1, top: y1,
                          width: length, height: 1.5,
                          backgroundColor: '#9ca3af',
                          transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center',
                          opacity: 0.6,
                        }} />
                      );
                    })}

                    {/* CTL line (orange, thicker) */}
                    {ff.map((point: any, i: number) => {
                      if (i === 0) return null;
                      const prev = ff[i - 1];
                      const x1 = FF_CHART_PAD_L + (i - 1) * stepX;
                      const x2 = FF_CHART_PAD_L + i * stepX;
                      const y1 = toY(prev.ctl);
                      const y2 = toY(point.ctl);
                      const dx = x2 - x1, dy = y2 - y1;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <View key={`ctl-${i}`} style={{
                          position: 'absolute', left: x1, top: y1,
                          width: length, height: 2.5,
                          backgroundColor: '#f97316',
                          transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center',
                        }} />
                      );
                    })}

                    {/* TSB line (Forma Fisica — green/red dashed) */}
                    {ff.map((point: any, i: number) => {
                      if (i === 0) return null;
                      const prev = ff[i - 1];
                      const x1 = FF_CHART_PAD_L + (i - 1) * stepX;
                      const x2 = FF_CHART_PAD_L + i * stepX;
                      const y1 = toY(prev.tsb);
                      const y2 = toY(point.tsb);
                      const dx = x2 - x1, dy = y2 - y1;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      const avgTsb = (prev.tsb + point.tsb) / 2;
                      const lineColor = avgTsb >= 0 ? '#22c55e' : '#ef4444';
                      return (
                        <View key={`tsb-${i}`} style={{
                          position: 'absolute', left: x1, top: y1,
                          width: length, height: 2,
                          backgroundColor: lineColor,
                          transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center',
                          opacity: 0.8,
                        }} />
                      );
                    })}

                    {/* Touch vertical line */}
                    {ffTouchIdx !== null && (
                      <View style={{
                        position: 'absolute',
                        left: FF_CHART_PAD_L + ffTouchIdx * stepX,
                        top: 0, width: 1, height: FF_CHART_H,
                        backgroundColor: '#ffffff60', zIndex: 10,
                      }} />
                    )}

                    {/* Last point dots + values */}
                    {ff.length > 0 && ffTouchIdx === null && (() => {
                      const last = ff[ff.length - 1];
                      const x = FF_CHART_PAD_L + (ff.length - 1) * stepX;
                      return (
                        <>
                          {/* CTL dot */}
                          <View style={{
                            position: 'absolute', left: x - 4, top: toY(last.ctl) - 4,
                            width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316',
                            borderWidth: 2, borderColor: '#fff', zIndex: 3,
                          }} />
                          <Text style={{
                            position: 'absolute', left: x + 8, top: toY(last.ctl) - 7,
                            fontSize: 9, color: '#f97316', fontWeight: '800',
                          }}>{last.ctl}</Text>

                          {/* ATL dot */}
                          <View style={{
                            position: 'absolute', left: x - 3, top: toY(last.atl) - 3,
                            width: 6, height: 6, borderRadius: 3, backgroundColor: '#9ca3af',
                            zIndex: 3,
                          }} />
                          <Text style={{
                            position: 'absolute', left: x + 8, top: toY(last.atl) - 7,
                            fontSize: 9, color: '#9ca3af', fontWeight: '800',
                          }}>{last.atl}</Text>

                          {/* TSB dot */}
                          <View style={{
                            position: 'absolute', left: x - 3, top: toY(last.tsb) - 3,
                            width: 6, height: 6, borderRadius: 3,
                            backgroundColor: last.tsb >= 0 ? '#22c55e' : '#ef4444',
                            zIndex: 3,
                          }} />
                          <Text style={{
                            position: 'absolute', left: x + 8, top: toY(last.tsb) - 7,
                            fontSize: 9, color: last.tsb >= 0 ? '#22c55e' : '#ef4444', fontWeight: '800',
                          }}>{last.tsb}</Text>
                        </>
                      );
                    })()}

                    {/* Touch point dots */}
                    {ffTouchIdx !== null && touchedPoint && (() => {
                      const x = FF_CHART_PAD_L + ffTouchIdx * stepX;
                      return (
                        <>
                          <View style={{
                            position: 'absolute', left: x - 4, top: toY(touchedPoint.ctl) - 4,
                            width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316',
                            borderWidth: 2, borderColor: '#fff', zIndex: 15,
                          }} />
                          <View style={{
                            position: 'absolute', left: x - 4, top: toY(touchedPoint.atl) - 4,
                            width: 8, height: 8, borderRadius: 4, backgroundColor: '#9ca3af',
                            borderWidth: 2, borderColor: '#fff', zIndex: 15,
                          }} />
                          <View style={{
                            position: 'absolute', left: x - 4, top: toY(touchedPoint.tsb) - 4,
                            width: 8, height: 8, borderRadius: 4,
                            backgroundColor: touchedPoint.tsb >= 0 ? '#22c55e' : '#ef4444',
                            borderWidth: 2, borderColor: '#fff', zIndex: 15,
                          }} />
                        </>
                      );
                    })()}

                    {/* Current values at end of lines (Strava-style) */}
                    {ff.length > 0 && !touchedPoint && (() => {
                      const last = ff[ff.length - 1];
                      const endX = FF_CHART_PAD_L + (ff.length - 1) * stepX + 4;
                      return (
                        <>
                          <Text style={{ position: 'absolute', left: endX, top: toY(last.ctl) - 6, fontSize: 9, color: '#f97316', fontWeight: '800' }}>{last.ctl}</Text>
                          <View style={{ position: 'absolute', left: endX - 7, top: toY(last.ctl) - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#f97316', borderWidth: 1.5, borderColor: '#fff' }} />
                          <Text style={{ position: 'absolute', left: endX, top: toY(last.atl) - 6, fontSize: 9, color: '#9ca3af', fontWeight: '800' }}>{last.atl}</Text>
                          <View style={{ position: 'absolute', left: endX - 7, top: toY(last.atl) - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#9ca3af', borderWidth: 1.5, borderColor: '#fff' }} />
                        </>
                      );
                    })()}

                    {/* X-axis month labels — evenly spaced, no overlap */}
                    <View style={{ position: 'absolute', top: FF_CHART_H + 6, left: FF_CHART_PAD_L, right: FF_CHART_PAD_R }}>
                      {(() => {
                        // Calculate how many labels fit without overlapping (min 42px per label)
                        const minSpacePx = 42;
                        const totalW = ffChartW;
                        const maxFit = Math.max(1, Math.floor(totalW / minSpacePx));
                        const showEvery = Math.max(1, Math.ceil(monthLabels.length / maxFit));
                        return monthLabels.map((ml, i) => {
                          if (i % showEvery !== 0 && i !== monthLabels.length - 1) return null;
                          // Skip last if too close to previous shown
                          if (i === monthLabels.length - 1 && i % showEvery !== 0) {
                            const prevShownIdx = Math.floor(i / showEvery) * showEvery;
                            const prevX = monthLabels[prevShownIdx].idx * stepX;
                            const thisX = ml.idx * stepX;
                            if (thisX - prevX < minSpacePx) return null;
                          }
                          const x = ml.idx * stepX;
                          return (
                            <Text key={`ml-${i}`} style={{
                              position: 'absolute', left: x - 18,
                              fontSize: 9, color: COLORS.textMuted, width: 38, textAlign: 'center',
                              fontWeight: '500',
                            }}>{ml.label}</Text>
                          );
                        });
                      })()}
                    </View>
                  </View>
                );
              })()}

              {/* Legend — 3 items now */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACING.lg, marginTop: SPACING.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: '#f97316' }} />
                  <Text style={{ fontSize: 9, color: COLORS.textMuted }}>Condizione fisica</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: '#9ca3af' }} />
                  <Text style={{ fontSize: 9, color: COLORS.textMuted }}>Affaticamento</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: '#22c55e' }} />
                  <Text style={{ fontSize: 9, color: COLORS.textMuted }}>Forma fisica</Text>
                </View>
              </View>

              {/* Simple interpretation — no jargon */}
              <View style={{ marginTop: SPACING.md, backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 16 }}>
                  {curr.tsb > 10
                    ? '💪 Sei fresco e pronto per dare il massimo. Ottimo momento per un test o una gara!'
                    : curr.tsb > -10
                    ? '⚖️ Equilibrio tra allenamento e recupero. Continua così per migliorare costantemente.'
                    : curr.tsb > -25
                    ? '😓 Il corpo sta assorbendo il carico degli allenamenti. Considera un giorno di recupero attivo.'
                    : '🔴 Attenzione: il carico è molto alto. Rischio sovrallenamento — serve riposo!'}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Best Efforts - Medals */}
        {best_efforts && Object.keys(best_efforts).length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trophy" size={20} color="#fbbf24" />
              <Text style={styles.sectionTitle}>BEST EFFORTS</Text>
            </View>
            <Text style={styles.predBasedOn}>I tuoi record personali dal 2026</Text>
            {Object.entries(best_efforts).map(([dist, effort]: [string, any], idx: number) => {
              const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
              const medalColor = idx < 3 ? medalColors[idx] : COLORS.textMuted;
              return (
                <View key={dist} style={[styles.effortRow, { gap: SPACING.sm }]}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: medalColor + '20',
                    borderWidth: 2, borderColor: medalColor,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 14 }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.effortDist, { width: 'auto' }]}>{dist}</Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{effort.date}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.effortPace}>{effort.pace}/km</Text>
                    <Text style={styles.effortTime}>
                      {effort.time < 60
                        ? `${Math.floor(effort.time)}:${Math.round((effort.time % 1) * 60).toString().padStart(2, '0')}`
                        : `${Math.floor(effort.time / 60)}h${Math.round(effort.time % 60)}m`
                      }
                    </Text>
                    {effort.avg_hr > 0 && (
                      <Text style={styles.effortHr}>{effort.avg_hr} bpm</Text>
                    )}
                  </View>
                </View>
              );
            })}
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
