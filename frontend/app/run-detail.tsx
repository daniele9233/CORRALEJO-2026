import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS, SESSION_ICONS } from '../src/theme';
import { api } from '../src/api';
import { Run, AIAnalysis, RunSplit } from '../src/types';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function RunDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [planned, setPlanned] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [racePredictions, setRacePredictions] = useState<any>(null);
  const [predictionTrends, setPredictionTrends] = useState<any>(null);

  useEffect(() => {
    loadRun();
  }, [id]);

  const loadRun = async () => {
    try {
      const data = await api.getRun(id!);
      setRun(data.run);
      setAnalysis(data.analysis);
      setPlanned(data.planned_session ?? null);
      setRacePredictions(data.race_predictions ?? null);
      setPredictionTrends(data.prediction_trends ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const requestAnalysis = async () => {
    if (!run) return;
    setAnalyzing(true);
    try {
      const result = await api.analyzeRun(run.id);
      setAnalysis(result);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading || !run) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.lime} />
        </View>
      </SafeAreaView>
    );
  }

  // Compute deviations for the comparison card
  const comparison = planned ? buildComparison(run, planned) : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DETTAGLIO CORSA</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Run Header Card */}
        <View style={styles.mainCard}>
          <View style={styles.dateRow}>
            <Text style={styles.dateText}>{formatDate(run.date)}</Text>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor:
                    (SESSION_COLORS[run.run_type] || COLORS.textMuted) + '20',
                },
              ]}
            >
              <Text
                style={[
                  styles.typeText,
                  {
                    color:
                      SESSION_COLORS[run.run_type] || COLORS.textSecondary,
                  },
                ]}
              >
                {run.run_type?.toUpperCase()}
              </Text>
            </View>
          </View>
          {run.location && (
            <Text style={styles.location}>{run.location}</Text>
          )}

          <View style={styles.bigStats}>
            <View style={styles.bigStat}>
              <Text style={styles.bigValue}>{run.distance_km}</Text>
              <Text style={styles.bigUnit}>km</Text>
            </View>
            <View style={styles.bigStat}>
              <Text style={styles.bigValue}>{run.avg_pace}</Text>
              <Text style={styles.bigUnit}>/km</Text>
            </View>
            <View style={styles.bigStat}>
              <Text style={styles.bigValue}>
                {Math.floor(run.duration_minutes)}:
                {String(
                  Math.round((run.duration_minutes % 1) * 60)
                ).padStart(2, '0')}
              </Text>
              <Text style={styles.bigUnit}>tempo</Text>
            </View>
          </View>
        </View>

        {/* ====== PIANO VS REALTÀ ====== */}
        {planned && comparison && (
          <View style={styles.compCard}>
            <View style={styles.compHeader}>
              <Ionicons name="git-compare" size={18} color={COLORS.lime} />
              <Text style={styles.compTitle}>PIANO VS REALTÀ</Text>
            </View>

            {/* Planned session context */}
            <View style={styles.compPlannedRow}>
              <View
                style={[
                  styles.compPlannedIcon,
                  {
                    backgroundColor:
                      (SESSION_COLORS[planned.type] || COLORS.textMuted) +
                      '20',
                  },
                ]}
              >
                <Ionicons
                  name={(SESSION_ICONS[planned.type] || 'fitness') as any}
                  size={16}
                  color={SESSION_COLORS[planned.type] || COLORS.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.compPlannedType}>
                  Pianificato: {planned.type?.replace('_', ' ').toUpperCase()}
                </Text>
                <Text style={styles.compPlannedTitle}>{planned.title}</Text>
              </View>
              <View style={styles.compPhaseBadge}>
                <Text style={styles.compPhaseText}>{planned.phase}</Text>
              </View>
            </View>

            {/* Comparison rows */}
            <View style={styles.compGrid}>
              {/* Distance */}
              {comparison.distPlanned != null && (
                <View style={styles.compRow}>
                  <Text style={styles.compRowLabel}>Distanza</Text>
                  <View style={styles.compRowValues}>
                    <Text style={styles.compRowPlanned}>
                      {comparison.distPlanned} km
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.compRowActual}>
                      {run.distance_km} km
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.compDevBadge,
                      {
                        backgroundColor: getDeviationColor(
                          comparison.distDevPct,
                          'distance'
                        ) + '20',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.compDevText,
                        {
                          color: getDeviationColor(
                            comparison.distDevPct,
                            'distance'
                          ),
                        },
                      ]}
                    >
                      {comparison.distDevPct > 0 ? '+' : ''}
                      {comparison.distDevPct}%
                    </Text>
                  </View>
                </View>
              )}

              {/* Pace */}
              {comparison.pacePlanned && (
                <View style={styles.compRow}>
                  <Text style={styles.compRowLabel}>Passo</Text>
                  <View style={styles.compRowValues}>
                    <Text style={styles.compRowPlanned}>
                      {comparison.pacePlanned}/km
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.compRowActual}>
                      {run.avg_pace}/km
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.compDevBadge,
                      {
                        backgroundColor: getDeviationColor(
                          comparison.paceDevSecs,
                          'pace'
                        ) + '20',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.compDevText,
                        {
                          color: getDeviationColor(
                            comparison.paceDevSecs,
                            'pace'
                          ),
                        },
                      ]}
                    >
                      {comparison.paceDevSecs > 0 ? '+' : ''}
                      {comparison.paceDevSecs}s
                    </Text>
                  </View>
                </View>
              )}

              {/* Duration */}
              {comparison.durPlanned != null && comparison.durPlanned > 0 && (
                <View style={styles.compRow}>
                  <Text style={styles.compRowLabel}>Durata</Text>
                  <View style={styles.compRowValues}>
                    <Text style={styles.compRowPlanned}>
                      {comparison.durPlanned} min
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.compRowActual}>
                      {Math.round(run.duration_minutes)} min
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Week context */}
            <View style={styles.compWeekRow}>
              <Text style={styles.compWeekText}>
                Sett. {planned.week_number} • {planned.phase} •{' '}
                Target sett. {planned.target_km_week} km
                {planned.is_recovery_week ? ' • SCARICO' : ''}
              </Text>
            </View>
          </View>
        )}

        {/* No planned session notice */}
        {!planned && (
          <View style={styles.noplanCard}>
            <Ionicons
              name="alert-circle"
              size={18}
              color={COLORS.orange}
            />
            <Text style={styles.noplanText}>
              Nessuna sessione pianificata per questa data — corsa extra o
              fuori piano
            </Text>
          </View>
        )}

        {/* HR Stats */}
        {run.avg_hr && (
          <View style={styles.hrCard}>
            <Text style={styles.hrTitle}>FREQUENZA CARDIACA</Text>
            <View style={styles.hrStats}>
              <View style={styles.hrStatItem}>
                <Ionicons
                  name="heart"
                  size={18}
                  color={getHrColor(run.avg_hr_pct)}
                />
                <Text
                  style={[
                    styles.hrValue,
                    { color: getHrColor(run.avg_hr_pct) },
                  ]}
                >
                  {run.avg_hr}
                </Text>
                <Text style={styles.hrLabel}>bpm media</Text>
              </View>
              <View style={styles.hrStatItem}>
                <Ionicons
                  name="heart"
                  size={18}
                  color={getHrColor(run.max_hr_pct)}
                />
                <Text
                  style={[
                    styles.hrValue,
                    { color: getHrColor(run.max_hr_pct) },
                  ]}
                >
                  {run.max_hr}
                </Text>
                <Text style={styles.hrLabel}>bpm max</Text>
              </View>
              <View style={styles.hrStatItem}>
                <Text style={styles.hrValue}>{run.avg_hr_pct}%</Text>
                <Text style={styles.hrLabel}>% FC max</Text>
              </View>
              <View style={styles.hrStatItem}>
                <Text style={styles.hrValue}>{run.max_hr_pct}%</Text>
                <Text style={styles.hrLabel}>% FC max</Text>
              </View>
            </View>

            {/* HR Zone Bar */}
            <View style={styles.zoneBar}>
              <View
                style={[
                  styles.zone,
                  { flex: 1, backgroundColor: COLORS.hrZone1 },
                ]}
              />
              <View
                style={[
                  styles.zone,
                  { flex: 1, backgroundColor: COLORS.hrZone2 },
                ]}
              />
              <View
                style={[
                  styles.zone,
                  { flex: 1, backgroundColor: COLORS.hrZone3 },
                ]}
              />
              <View
                style={[
                  styles.zone,
                  { flex: 1, backgroundColor: COLORS.hrZone4 },
                ]}
              />
              <View
                style={[
                  styles.zone,
                  { flex: 1, backgroundColor: COLORS.hrZone5 },
                ]}
              />
            </View>
            <View style={styles.zoneLabels}>
              <Text style={styles.zoneLabel}>Z1</Text>
              <Text style={styles.zoneLabel}>Z2</Text>
              <Text style={styles.zoneLabel}>Z3</Text>
              <Text style={styles.zoneLabel}>Z4</Text>
              <Text style={styles.zoneLabel}>Z5</Text>
            </View>
          </View>
        )}

        {/* Splits per km */}
        {run.splits && run.splits.length > 0 && (() => {
          const avgPaceSecs = paceToSeconds(run.avg_pace);
          const splitPaces = run.splits.map(s => paceToSeconds(s.pace)).filter(s => s > 0);
          const maxPace = Math.max(...splitPaces);
          const minPace = Math.min(...splitPaces);
          const hasHr = run.splits.some(s => s.hr);
          const barMaxWidth = SCREEN_WIDTH - 80 - (hasHr ? 70 : 0);

          // Detect interval/ripetute: CV > 15%
          const paceAvg = splitPaces.reduce((a, b) => a + b, 0) / splitPaces.length;
          const paceStdDev = Math.sqrt(splitPaces.reduce((sum, p) => sum + Math.pow(p - paceAvg, 2), 0) / splitPaces.length);
          const paceCv = (paceStdDev / paceAvg) * 100;
          const isIntervals = paceCv > 15;

          return (
            <View style={styles.splitsCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <Ionicons name="bar-chart" size={18} color={COLORS.lime} />
                <Text style={styles.hrTitle}>SPLITS PER KM</Text>
              </View>
              <Text style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: SPACING.md, fontStyle: 'italic' }}>
                Media: {run.avg_pace}/km
              </Text>
              {isIntervals && (
                <View style={{ backgroundColor: COLORS.orange + '15', borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.md }}>
                  <Text style={{ fontSize: 10, color: COLORS.orange, fontStyle: 'italic' }}>
                    Possibile allenamento di ripetute (alta variabilit{'à'} nel passo, CV {paceCv.toFixed(0)}%)
                  </Text>
                </View>
              )}
              {run.splits.map((split, i) => {
                const secs = paceToSeconds(split.pace);
                if (secs <= 0) return null;
                const barPct = maxPace > 0 ? (secs / maxPace) : 0.5;
                const isFaster = secs < avgPaceSecs;
                const isSlower = secs > avgPaceSecs;
                const barColor = isFaster ? COLORS.green : isSlower ? COLORS.red : COLORS.textSecondary;

                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ width: 24, textAlign: 'center', fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700' }}>{split.km}</Text>
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <View style={{
                        width: `${Math.max(20, barPct * 100)}%`,
                        height: 24,
                        borderRadius: BORDER_RADIUS.sm,
                        backgroundColor: barColor + '60',
                        justifyContent: 'center',
                        paddingHorizontal: SPACING.sm,
                      }}>
                        <Text style={{ fontSize: FONT_SIZES.xs, fontWeight: '800', color: '#fff' }}>{split.pace}</Text>
                      </View>
                    </View>
                    <Text style={{ width: 60, textAlign: 'right', fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginLeft: 6 }}>
                      {split.hr != null ? `${split.hr} bpm` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* Pace Zones */}
        {run.splits && run.splits.length > 0 && (() => {
          const paceToSecs = (p: string) => {
            const pts = p.split(':');
            return pts.length === 2 ? parseInt(pts[0]) * 60 + parseInt(pts[1]) : 0;
          };
          const avgPaceSecs = paceToSecs(run.avg_pace || '');
          if (avgPaceSecs <= 0) return null;

          // Define pace zones relative to avg pace
          const zones = [
            { label: 'Z6', name: 'Sprint', range: `< ${Math.floor(avgPaceSecs * 0.75 / 60)}:${String(Math.round(avgPaceSecs * 0.75 % 60)).padStart(2, '0')}`, max: avgPaceSecs * 0.75, color: '#dc2626' },
            { label: 'Z5', name: 'Interval', range: `${Math.floor(avgPaceSecs * 0.75 / 60)}:${String(Math.round(avgPaceSecs * 0.75 % 60)).padStart(2, '0')}-${Math.floor(avgPaceSecs * 0.85 / 60)}:${String(Math.round(avgPaceSecs * 0.85 % 60)).padStart(2, '0')}`, max: avgPaceSecs * 0.85, color: '#f97316' },
            { label: 'Z4', name: 'Soglia', range: `${Math.floor(avgPaceSecs * 0.85 / 60)}:${String(Math.round(avgPaceSecs * 0.85 % 60)).padStart(2, '0')}-${Math.floor(avgPaceSecs * 0.95 / 60)}:${String(Math.round(avgPaceSecs * 0.95 % 60)).padStart(2, '0')}`, max: avgPaceSecs * 0.95, color: '#eab308' },
            { label: 'Z3', name: 'Ritmo', range: `${Math.floor(avgPaceSecs * 0.95 / 60)}:${String(Math.round(avgPaceSecs * 0.95 % 60)).padStart(2, '0')}-${Math.floor(avgPaceSecs * 1.05 / 60)}:${String(Math.round(avgPaceSecs * 1.05 % 60)).padStart(2, '0')}`, max: avgPaceSecs * 1.05, color: '#22c55e' },
            { label: 'Z2', name: 'Resistenza', range: `${Math.floor(avgPaceSecs * 1.05 / 60)}:${String(Math.round(avgPaceSecs * 1.05 % 60)).padStart(2, '0')}-${Math.floor(avgPaceSecs * 1.15 / 60)}:${String(Math.round(avgPaceSecs * 1.15 % 60)).padStart(2, '0')}`, max: avgPaceSecs * 1.15, color: '#3b82f6' },
            { label: 'Z1', name: 'Recupero', range: `> ${Math.floor(avgPaceSecs * 1.15 / 60)}:${String(Math.round(avgPaceSecs * 1.15 % 60)).padStart(2, '0')}`, max: Infinity, color: '#6b7280' },
          ];

          // Count splits in each zone
          const zoneCounts: { [key: string]: number } = {};
          zones.forEach(z => zoneCounts[z.label] = 0);

          for (const sp of run.splits) {
            const spSecs = paceToSecs(sp.pace);
            if (spSecs <= 0) continue;
            if (spSecs < avgPaceSecs * 0.75) zoneCounts['Z6']++;
            else if (spSecs < avgPaceSecs * 0.85) zoneCounts['Z5']++;
            else if (spSecs < avgPaceSecs * 0.95) zoneCounts['Z4']++;
            else if (spSecs < avgPaceSecs * 1.05) zoneCounts['Z3']++;
            else if (spSecs < avgPaceSecs * 1.15) zoneCounts['Z2']++;
            else zoneCounts['Z1']++;
          }

          const totalSplits = run.splits.length;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="speedometer" size={18} color={COLORS.blue} />
                <Text style={styles.cardTitle}>ZONE DI PASSO</Text>
              </View>
              <Text style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12, fontStyle: 'italic' }}>
                In base al passo medio di {run.avg_pace}/km
              </Text>
              {zones.map(z => {
                const count = zoneCounts[z.label];
                const pct = totalSplits > 0 ? Math.round((count / totalSplits) * 100) : 0;
                const showInside = pct >= 10;
                const showOutside = pct > 0 && pct < 10;
                return (
                  <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                    <View style={{ width: 24, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: z.color, fontWeight: '800' }}>{z.label}</Text>
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1, height: 20, backgroundColor: COLORS.bg, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{
                          height: 20,
                          width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`,
                          backgroundColor: z.color + '40',
                          borderRadius: 6,
                          justifyContent: 'center',
                          paddingHorizontal: 4,
                        }}>
                          {showInside && (
                            <Text numberOfLines={1} style={{ fontSize: 9, color: z.color, fontWeight: '800' }}>{pct}%</Text>
                          )}
                        </View>
                      </View>
                      {showOutside && (
                        <Text style={{ fontSize: 9, color: z.color, fontWeight: '800', marginLeft: 4, minWidth: 24 }}>{pct}%</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 9, color: COLORS.textMuted, width: 65 }}>{z.range}</Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* Cardiac Decoupling (Pa:Hr) - Friel */}
        {run.splits && run.splits.length >= 4 && (() => {
          // Check splits have HR data
          const splitsWithHr = run.splits.filter(s => s.hr && s.hr > 0 && paceToSeconds(s.pace) > 0);
          if (splitsWithHr.length < 4) return null;

          // Calculate pace coefficient of variation
          const paces = splitsWithHr.map(s => paceToSeconds(s.pace));
          const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
          const paceStdDev = Math.sqrt(paces.reduce((sum, p) => sum + Math.pow(p - avgPace, 2), 0) / paces.length);
          const paceCv = (paceStdDev / avgPace) * 100;

          // Need constant pace (CV < 10%) for valid decoupling
          const isConstantPace = paceCv < 10;

          if (!isConstantPace) {
            return (
              <View style={styles.decouplingCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 }}>
                  <Ionicons name="pulse" size={18} color={COLORS.textMuted} />
                  <Text style={styles.hrTitle}>EFFICIENZA AEROBICA</Text>
                </View>
                <Text style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: SPACING.sm }}>Pa:Hr — Friel</Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontStyle: 'italic' }}>
                  Corsa con passo variabile — il calcolo richiede un passo costante (es. corsa lenta)
                </Text>
                <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4 }}>
                  CV passo: {paceCv.toFixed(1)}%
                </Text>
              </View>
            );
          }

          // Split into halves
          const halfIdx = Math.floor(splitsWithHr.length / 2);
          const firstHalf = splitsWithHr.slice(0, halfIdx);
          const secondHalf = splitsWithHr.slice(halfIdx);

          const avgHrFirst = firstHalf.reduce((sum, s) => sum + (s.hr || 0), 0) / firstHalf.length;
          const avgHrSecond = secondHalf.reduce((sum, s) => sum + (s.hr || 0), 0) / secondHalf.length;
          const avgPaceFirst = firstHalf.reduce((sum, s) => sum + paceToSeconds(s.pace), 0) / firstHalf.length;
          const avgPaceSecond = secondHalf.reduce((sum, s) => sum + paceToSeconds(s.pace), 0) / secondHalf.length;

          const decoupling = ((avgHrSecond - avgHrFirst) / avgHrFirst) * 100;

          const getDecouplingColor = (d: number) => {
            if (d < 3.5) return COLORS.green;
            if (d < 5) return COLORS.orange;
            return COLORS.red;
          };

          const getDecouplingLabel = (d: number) => {
            if (d < 3.5) return 'Eccellente';
            if (d < 5) return 'Accettabile';
            if (d < 7.5) return 'Da migliorare';
            return 'Insufficiente';
          };

          const dc = Math.abs(decoupling);
          const dcColor = getDecouplingColor(dc);
          const formatPaceSecs = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

          return (
            <View style={styles.decouplingCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 }}>
                <Ionicons name="pulse" size={18} color={dcColor} />
                <Text style={styles.hrTitle}>EFFICIENZA AEROBICA</Text>
                <View style={{ marginLeft: 'auto', backgroundColor: dcColor + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: dcColor, fontWeight: '800' }}>
                    {getDecouplingLabel(dc)}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: SPACING.md }}>Pa:Hr — Friel</Text>

              {/* Big decoupling value */}
              <View style={{ alignItems: 'center', marginBottom: SPACING.md }}>
                <Text style={{ fontSize: 36, fontWeight: '900', color: dcColor }}>
                  {decoupling > 0 ? '+' : ''}{decoupling.toFixed(1)}%
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 }}>
                  drift frequenza cardiaca
                </Text>
              </View>

              {/* First vs Second half comparison */}
              <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                <View style={{ flex: 1, backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.xs }}>Prima met{'à'}</Text>
                  <Text style={{ fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '800' }}>{Math.round(avgHrFirst)} bpm</Text>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>{formatPaceSecs(avgPaceFirst)}/km</Text>
                  <Text style={{ fontSize: 9, color: COLORS.textMuted }}>km 1-{halfIdx}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.xs }}>Seconda met{'à'}</Text>
                  <Text style={{ fontSize: FONT_SIZES.lg, color: dcColor, fontWeight: '800' }}>{Math.round(avgHrSecond)} bpm</Text>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>{formatPaceSecs(avgPaceSecond)}/km</Text>
                  <Text style={{ fontSize: 9, color: COLORS.textMuted }}>km {halfIdx + 1}-{splitsWithHr.length}</Text>
                </View>
              </View>

              {/* Explanation */}
              <View style={{ marginTop: SPACING.md, backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm }}>
                <Text style={{ fontSize: 9, color: COLORS.green, marginBottom: 2 }}>{'<'} 3.5% = Base aerobica eccellente</Text>
                <Text style={{ fontSize: 9, color: COLORS.textSecondary, marginBottom: 2 }}>3.5-5% = Buona efficienza</Text>
                <Text style={{ fontSize: 9, color: COLORS.orange, marginBottom: 2 }}>5-7.5% = Base aerobica da migliorare</Text>
                <Text style={{ fontSize: 9, color: COLORS.red }}>{'>'} 7.5% = Efficienza insufficiente — serve pi{'ù'} volume a bassa intensit{'à'}</Text>
              </View>
              <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: SPACING.sm, textAlign: 'center' }}>
                CV passo: {paceCv.toFixed(1)}% (costante)
              </Text>
            </View>
          );
        })()}

        {/* Cadence + Elevation row */}
        {(run.avg_cadence || run.elevation_gain) && (
          <View style={styles.extraStatsCard}>
            {run.avg_cadence != null && (
              <View style={styles.extraStatItem}>
                <Ionicons name="footsteps" size={18} color={COLORS.blue} />
                <Text style={styles.extraStatValue}>{run.avg_cadence}</Text>
                <Text style={styles.extraStatLabel}>spm cadenza</Text>
              </View>
            )}
            {run.elevation_gain != null && (
              <View style={styles.extraStatItem}>
                <Ionicons name="trending-up" size={18} color={COLORS.orange} />
                <Text style={styles.extraStatValue}>{Math.round(run.elevation_gain)}</Text>
                <Text style={styles.extraStatLabel}>m dislivello</Text>
              </View>
            )}
          </View>
        )}

        {/* Notes */}
        {run.notes && (
          <View style={styles.notesCard}>
            <Ionicons
              name="document-text"
              size={18}
              color={COLORS.textSecondary}
            />
            <Text style={styles.notesText}>{run.notes}</Text>
          </View>
        )}

        {/* Race Predictions section removed */}

        {/* AI Analysis */}
        <View style={styles.aiSection}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={20} color={COLORS.lime} />
            <Text style={styles.aiTitle}>ANALISI AI COACH</Text>
          </View>

          {analysis ? (
            <View style={styles.aiCard}>
              <Text style={styles.aiText}>{analysis.analysis}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.sm }}>
                <Text style={styles.aiDate}>
                  {formatDateTime(analysis.created_at)}{analysis.ai_source === 'gemini' ? ' • Gemini AI' : analysis.ai_source === 'fallback' ? ' • Analisi algoritmica' : ''}
                </Text>
                <TouchableOpacity
                  onPress={requestAnalysis}
                  disabled={analyzing}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.lime + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                >
                  {analyzing ? (
                    <ActivityIndicator size="small" color={COLORS.lime} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={14} color={COLORS.lime} />
                      <Text style={{ fontSize: 10, color: COLORS.lime, fontWeight: '700' }}>RIGENERA</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              testID="analyze-btn"
              style={styles.analyzeBtn}
              onPress={requestAnalysis}
              disabled={analyzing}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color={COLORS.limeDark} />
              ) : (
                <>
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color={COLORS.limeDark}
                  />
                  <Text style={styles.analyzeBtnText}>
                    ANALIZZA CON CONTESTO PIANO
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ──────── helpers ──────── */

function paceToSeconds(pace: string): number {
  if (!pace) return 0;
  const parts = pace.split(':');
  if (parts.length !== 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function buildComparison(run: Run, planned: any) {
  const result: any = {};

  const pd = planned.target_distance_km;
  if (pd && pd > 0) {
    result.distPlanned = pd;
    result.distDevPct = Math.round(
      ((run.distance_km - pd) / pd) * 100 * 10
    ) / 10;
  }

  const pp = planned.target_pace;
  if (pp && pp !== 'max') {
    result.pacePlanned = pp;
    const plannedSecs = paceToSeconds(pp);
    const actualSecs = paceToSeconds(run.avg_pace);
    if (plannedSecs > 0 && actualSecs > 0) {
      result.paceDevSecs = actualSecs - plannedSecs;
    }
  }

  const pDur = planned.target_duration_min;
  if (pDur && pDur > 0) {
    result.durPlanned = pDur;
  }

  return result;
}

function getDeviationColor(value: number, type: 'pace' | 'distance'): string {
  if (type === 'pace') {
    // Negative = faster (good for quality), Positive = slower
    if (value <= -10) return COLORS.orange; // way too fast
    if (value < 0) return COLORS.green;     // slightly faster, ok
    if (value <= 5) return COLORS.textSecondary; // on target
    return COLORS.red;                       // too slow
  }
  // distance
  const abs = Math.abs(value);
  if (abs <= 10) return COLORS.green;       // on target
  if (abs <= 20) return COLORS.orange;      // moderate deviation
  return COLORS.red;                         // big deviation
}

function getHrColor(pct?: number) {
  if (!pct) return COLORS.text;
  if (pct < 70) return COLORS.hrZone1;
  if (pct < 80) return COLORS.hrZone2;
  if (pct < 87) return COLORS.hrZone3;
  if (pct < 93) return COLORS.hrZone4;
  return COLORS.hrZone5;
}

function formatDate(dateStr: string) {
  const months = [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
  ];
  const days = [
    'Domenica','Lunedi','Martedi','Mercoledi',
    'Giovedi','Venerdi','Sabato',
  ];
  const d = new Date(dateStr + 'T00:00:00');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateTime(isoStr: string) {
  const d = new Date(isoStr);
  const months = [
    'Gen','Feb','Mar','Apr','Mag','Giu',
    'Lug','Ago','Set','Ott','Nov','Dic',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ──────── styles ──────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 2,
  },

  /* main card */
  mainCard: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
  },
  typeBadge: {
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  typeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  location: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  bigStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.xl,
  },
  bigStat: { alignItems: 'center' },
  bigValue: {
    fontSize: FONT_SIZES.xxxl,
    color: COLORS.text,
    fontWeight: '900',
  },
  bigUnit: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  /* ── comparison card ── */
  compCard: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(190, 242, 100, 0.25)',
  },
  compHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  compTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lime,
    fontWeight: '700',
    letterSpacing: 2,
  },
  compPlannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  compPlannedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compPlannedType: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
  },
  compPlannedTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '700',
    marginTop: 1,
  },
  compPhaseBadge: {
    backgroundColor: 'rgba(190, 242, 100, 0.15)',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  compPhaseText: {
    fontSize: 9,
    color: COLORS.lime,
    fontWeight: '700',
    letterSpacing: 1,
  },

  compGrid: { gap: SPACING.md },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compRowLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
    width: 70,
  },
  compRowValues: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  compRowPlanned: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  compRowActual: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '700',
  },
  compDevBadge: {
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    minWidth: 50,
    alignItems: 'center',
  },
  compDevText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },

  compWeekRow: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  compWeekText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  /* no plan notice */
  noplanCard: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.2)',
  },
  noplanText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.orange,
    lineHeight: 20,
  },

  /* HR card */
  hrCard: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  hrTitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },
  hrStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hrStatItem: { alignItems: 'center', gap: 4 },
  hrValue: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.text,
    fontWeight: '800',
  },
  hrLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  zoneBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: SPACING.lg,
    gap: 2,
  },
  zone: { borderRadius: 3 },
  zoneLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
  },
  zoneLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },

  /* splits */
  splitsCard: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  decouplingCard: {
    marginHorizontal: SPACING.lg, marginBottom: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  splitKm: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
  },
  splitBar: {
    height: 24,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  splitPace: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
  },
  splitHr: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    width: 65,
    textAlign: 'right',
  },
  splitLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },

  /* pace zones card */
  card: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },

  /* extra stats (cadence, elevation) */
  extraStatsCard: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  extraStatItem: { alignItems: 'center', gap: 4 },
  extraStatValue: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.text,
    fontWeight: '800',
  },
  extraStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },

  /* notes */
  notesCard: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  notesText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
  },

  /* AI */
  aiSection: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.xxl,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  aiTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lime,
    fontWeight: '700',
    letterSpacing: 2,
  },
  aiCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(190, 242, 100, 0.2)',
  },
  aiText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  aiDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.lg,
  },
  analyzeBtn: {
    backgroundColor: COLORS.lime,
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  analyzeBtnText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.limeDark,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
