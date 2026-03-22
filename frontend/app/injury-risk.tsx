import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';
import { api } from '../src/api';

const RISK_COLORS = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f97316',
  critical: '#ef4444',
};

const STATUS_COLORS: Record<string, string> = {
  green: '#4ade80',
  lime: COLORS.lime,
  yellow: '#facc15',
  orange: '#f97316',
  red: '#ef4444',
};

const ENERGY_LABELS = ['', '😩 Esausto', '😓 Stanco', '😐 Normale', '😊 Bene', '🔥 Carico'];
const SLEEP_LABELS = ['', '😵 Pessimo', '😴 Scarso', '😐 Ok', '😌 Buono', '😇 Ottimo'];
const SORENESS_LABELS = ['', '🔴 Forte', '🟠 Moderato', '🟡 Leggero', '🟢 Minimo', '✅ Nessuno'];
const MOOD_LABELS = ['', '😞 Basso', '😕 Così così', '😐 Neutro', '🙂 Buono', '😁 Ottimo'];

function ScoreCircle({ score, color, emoji, status }: { score: number; color: string; emoji: string; status: string }) {
  const circumference = 2 * Math.PI * 52;
  const progress = (score / 100) * circumference;
  const dashArray = `${progress} ${circumference - progress}`;

  return (
    <View style={styles.circleContainer}>
      <View style={styles.svgCircle}>
        {/* Background circle */}
        <View style={[styles.circleTrack, { borderColor: color + '25' }]} />
        {/* Progress arc - simulated with border */}
        <View style={[styles.circleProgress, {
          borderColor: color,
          borderTopColor: score >= 25 ? color : 'transparent',
          borderRightColor: score >= 50 ? color : 'transparent',
          borderBottomColor: score >= 75 ? color : 'transparent',
          borderLeftColor: score >= 1 ? color : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }]} />
        <View style={styles.circleInner}>
          <Text style={{ fontSize: 28 }}>{emoji}</Text>
          <Text style={[styles.circleScore, { color }]}>{score}</Text>
          <Text style={[styles.circleStatus, { color }]}>{status}</Text>
        </View>
      </View>
    </View>
  );
}

function FactorBar({ label, score, icon }: { label: string; score: number; icon: string }) {
  const color = score >= 75 ? '#4ade80' : score >= 50 ? COLORS.lime : score >= 30 ? '#facc15' : '#f97316';
  return (
    <View style={styles.factorBarRow}>
      <Text style={{ fontSize: 16, width: 24 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.factorBarHeader}>
          <Text style={styles.factorBarLabel}>{label}</Text>
          <Text style={[styles.factorBarScore, { color }]}>{score}</Text>
        </View>
        <View style={styles.factorBarTrack}>
          <View style={[styles.factorBarFill, { width: `${Math.min(100, score)}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

function SliderRow({ label, value, options, onSelect }: {
  label: string; value: number; options: string[]; onSelect: (v: number) => void;
}) {
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.sliderOptions}>
        {[1, 2, 3, 4, 5].map(v => (
          <TouchableOpacity
            key={v}
            onPress={() => onSelect(v)}
            style={[
              styles.sliderBtn,
              value === v && styles.sliderBtnActive,
              value === v && { borderColor: v <= 2 ? '#f97316' : v === 3 ? '#facc15' : '#4ade80' },
            ]}
          >
            <Text style={[
              styles.sliderBtnText,
              value === v && { color: v <= 2 ? '#f97316' : v === 3 ? '#facc15' : '#4ade80' },
            ]}>{v}</Text>
            <Text style={styles.sliderBtnLabel} numberOfLines={1}>
              {options[v] || ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RiskGauge({ score, label }: { score: number; label: string }) {
  const color = score <= 30 ? RISK_COLORS.low
    : score <= 55 ? RISK_COLORS.medium
    : score <= 75 ? RISK_COLORS.high
    : RISK_COLORS.critical;
  const riskLabel = score <= 30 ? 'BASSO'
    : score <= 55 ? 'MODERATO'
    : score <= 75 ? 'ALTO'
    : 'CRITICO';

  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${Math.min(100, score)}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.gaugeLabels}>
        <Text style={[styles.gaugeScore, { color }]}>{score}/100</Text>
        <Text style={[styles.gaugeRisk, { color }]}>{riskLabel}</Text>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
    </View>
  );
}

export default function InjuryRiskScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [injuryData, setInjuryData] = useState<any>(null);
  const [recoveryData, setRecoveryData] = useState<any>(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'recovery' | 'injury'>('recovery');

  // Check-in form state
  const [energy, setEnergy] = useState(3);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [muscleSoreness, setMuscleSoreness] = useState(3);
  const [mood, setMood] = useState(3);

  useFocusEffect(
    useCallback(() => { loadData(); }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      setError(false);
      const [injury, recovery] = await Promise.all([
        api.getInjuryRisk(),
        api.getRecoveryScore(),
      ]);
      setInjuryData(injury);
      setRecoveryData(recovery);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const saveCheckin = async () => {
    try {
      setSaving(true);
      await api.saveRecoveryCheckin({
        energy,
        sleep_quality: sleepQuality,
        muscle_soreness: muscleSoreness,
        mood,
      });
      setShowCheckin(false);
      // Reload to get updated score
      const recovery = await api.getRecoveryScore();
      setRecoveryData(recovery);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
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

  if (error) {
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

  const r = recoveryData;
  const d = injuryData;
  const statusColor = STATUS_COLORS[r?.status_color] || COLORS.lime;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>RECOVERY & RISK</Text>
          <Text style={styles.pageSubtitle}>Recupero e prevenzione infortuni</Text>
        </View>
      </View>

      {/* Tab selector */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recovery' && styles.tabActive]}
          onPress={() => setActiveTab('recovery')}
        >
          <Text style={[styles.tabText, activeTab === 'recovery' && styles.tabTextActive]}>
            💪 Recovery
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'injury' && styles.tabActive]}
          onPress={() => setActiveTab('injury')}
        >
          <Text style={[styles.tabText, activeTab === 'injury' && styles.tabTextActive]}>
            🛡️ Injury Risk
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'recovery' && r && (
          <>
            {/* Recovery Score Circle */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="fitness" size={22} color={statusColor} />
                <Text style={styles.cardTitle}>RECOVERY SCORE</Text>
              </View>

              <ScoreCircle
                score={r.overall_score}
                color={statusColor}
                emoji={r.emoji}
                status={r.status}
              />

              <Text style={[styles.recommendationText, { color: statusColor }]}>
                {r.recommendation}
              </Text>

              {/* Suggested workout */}
              <View style={styles.suggestedRow}>
                <Ionicons name="barbell-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.suggestedText}>
                  Oggi: <Text style={{ color: COLORS.text, fontWeight: '700' }}>{r.suggested_workout}</Text>
                </Text>
              </View>

              {/* Check-in button */}
              <TouchableOpacity
                style={[styles.checkinBtn, { borderColor: statusColor }]}
                onPress={() => setShowCheckin(true)}
              >
                <Ionicons name={r.has_checkin ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={statusColor} />
                <Text style={[styles.checkinBtnText, { color: statusColor }]}>
                  {r.has_checkin ? 'Aggiorna Check-in' : 'Check-in Mattutino'}
                </Text>
              </TouchableOpacity>

              {!r.has_checkin && (
                <Text style={styles.checkinHint}>
                  Completa il check-in per uno score più accurato (+60% precisione)
                </Text>
              )}
            </View>

            {/* Objective Factors */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="analytics" size={20} color={COLORS.blue} />
                <Text style={styles.cardTitle}>FATTORI OGGETTIVI</Text>
              </View>

              {r.factors && (
                <>
                  <FactorBar
                    icon="🛌"
                    label={`Riposo (${r.factors.rest?.hours_since_last || 0}h dall'ultimo)`}
                    score={r.factors.rest?.score || 0}
                  />
                  <FactorBar
                    icon="📊"
                    label={`Carico recente (ratio: ${r.factors.load?.ratio || 0})`}
                    score={r.factors.load?.score || 0}
                  />
                  <FactorBar
                    icon="📈"
                    label="Forma fisica (TSB)"
                    score={r.factors.tsb?.score || 0}
                  />
                  <FactorBar
                    icon="❤️‍🔥"
                    label="Intensità ultimo allenamento"
                    score={r.factors.intensity?.score || 0}
                  />
                </>
              )}
            </View>

            {/* Subjective Factors (if check-in done) */}
            {r.subjective && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="person" size={20} color={COLORS.orange} />
                  <Text style={styles.cardTitle}>IL TUO CHECK-IN</Text>
                </View>
                <View style={styles.subjectiveGrid}>
                  <View style={styles.subjectiveItem}>
                    <Text style={styles.subjectiveEmoji}>{ENERGY_LABELS[r.subjective.energy || 3].split(' ')[0]}</Text>
                    <Text style={styles.subjectiveLabel}>Energia</Text>
                    <Text style={styles.subjectiveValue}>{r.subjective.energy}/5</Text>
                  </View>
                  <View style={styles.subjectiveItem}>
                    <Text style={styles.subjectiveEmoji}>{SLEEP_LABELS[r.subjective.sleep_quality || 3].split(' ')[0]}</Text>
                    <Text style={styles.subjectiveLabel}>Sonno</Text>
                    <Text style={styles.subjectiveValue}>{r.subjective.sleep_quality}/5</Text>
                  </View>
                  <View style={styles.subjectiveItem}>
                    <Text style={styles.subjectiveEmoji}>{SORENESS_LABELS[r.subjective.muscle_soreness || 3].split(' ')[0]}</Text>
                    <Text style={styles.subjectiveLabel}>Dolori</Text>
                    <Text style={styles.subjectiveValue}>{r.subjective.muscle_soreness}/5</Text>
                  </View>
                  <View style={styles.subjectiveItem}>
                    <Text style={styles.subjectiveEmoji}>{MOOD_LABELS[r.subjective.mood || 3].split(' ')[0]}</Text>
                    <Text style={styles.subjectiveLabel}>Umore</Text>
                    <Text style={styles.subjectiveValue}>{r.subjective.mood}/5</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Check-in history */}
            {r.checkin_history && r.checkin_history.length > 1 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="calendar" size={20} color={COLORS.textSecondary} />
                  <Text style={styles.cardTitle}>STORICO CHECK-IN</Text>
                </View>
                {r.checkin_history.slice(0, 7).map((c: any, i: number) => {
                  const avg = Math.round(((c.energy || 3) + (c.sleep_quality || 3) + (c.muscle_soreness || 3) + (c.mood || 3)) / 4 * 20);
                  const col = avg >= 75 ? '#4ade80' : avg >= 50 ? COLORS.lime : avg >= 30 ? '#facc15' : '#f97316';
                  return (
                    <View key={i} style={styles.historyRow}>
                      <Text style={styles.historyDate}>{c.date?.slice(5) || ''}</Text>
                      <View style={styles.historyBarTrack}>
                        <View style={[styles.historyBarFill, { width: `${avg}%`, backgroundColor: col }]} />
                      </View>
                      <Text style={[styles.historyScore, { color: col }]}>{avg}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {activeTab === 'injury' && d && (
          <>
            {/* Overall Risk Score */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="shield-checkmark" size={22} color={
                  d.overall_score <= 30 ? RISK_COLORS.low
                  : d.overall_score <= 55 ? RISK_COLORS.medium
                  : d.overall_score <= 75 ? RISK_COLORS.high
                  : RISK_COLORS.critical
                } />
                <Text style={styles.cardTitle}>RISCHIO COMPLESSIVO</Text>
              </View>
              <RiskGauge score={d.overall_score} label="Score basato su carico, intensità e storico infortuni" />
            </View>

            {/* Risk Factors */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="analytics" size={20} color={COLORS.blue} />
                <Text style={styles.cardTitle}>FATTORI DI RISCHIO</Text>
              </View>
              {d.factors && d.factors.map((f: any, i: number) => (
                <View key={i} style={styles.factorRow}>
                  <View style={styles.factorInfo}>
                    <Text style={styles.factorName}>{f.name}</Text>
                    <Text style={styles.factorDesc}>{f.description}</Text>
                  </View>
                  <View style={[styles.factorBadge, {
                    backgroundColor: (f.score <= 30 ? RISK_COLORS.low
                      : f.score <= 55 ? RISK_COLORS.medium
                      : f.score <= 75 ? RISK_COLORS.high
                      : RISK_COLORS.critical) + '20'
                  }]}>
                    <Text style={[styles.factorScore, {
                      color: f.score <= 30 ? RISK_COLORS.low
                        : f.score <= 55 ? RISK_COLORS.medium
                        : f.score <= 75 ? RISK_COLORS.high
                        : RISK_COLORS.critical
                    }]}>{f.score}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Alerts */}
            {d.alerts && d.alerts.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="warning" size={20} color={COLORS.orange} />
                  <Text style={styles.cardTitle}>AVVISI</Text>
                </View>
                {d.alerts.map((a: any, i: number) => (
                  <View key={i} style={[styles.alertRow, {
                    borderLeftColor: a.level === 'critical' ? RISK_COLORS.critical
                      : a.level === 'high' ? RISK_COLORS.high
                      : a.level === 'medium' ? RISK_COLORS.medium
                      : RISK_COLORS.low
                  }]}>
                    <Ionicons
                      name={a.level === 'critical' ? 'alert-circle' : a.level === 'high' ? 'warning' : 'information-circle'}
                      size={18}
                      color={a.level === 'critical' ? RISK_COLORS.critical
                        : a.level === 'high' ? RISK_COLORS.high
                        : RISK_COLORS.medium}
                    />
                    <Text style={styles.alertText}>{a.message}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Weekly Load History */}
            {d.weekly_load_history && d.weekly_load_history.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="bar-chart" size={20} color={COLORS.lime} />
                  <Text style={styles.cardTitle}>CARICO SETTIMANALE</Text>
                </View>
                <View style={styles.loadChart}>
                  {d.weekly_load_history.slice(-8).map((w: any, i: number) => {
                    const maxKm = Math.max(...d.weekly_load_history.slice(-8).map((x: any) => x.km || 1));
                    const barH = Math.max(8, ((w.km || 0) / maxKm) * 120);
                    const isOverload = w.increase_pct && w.increase_pct > 20;
                    return (
                      <View key={i} style={styles.loadBarCol}>
                        <Text style={[styles.loadBarValue, isOverload && { color: RISK_COLORS.high }]}>
                          {Math.round(w.km)}
                        </Text>
                        <View style={styles.loadBarTrackV}>
                          <View style={[styles.loadBar, {
                            height: barH,
                            backgroundColor: isOverload ? RISK_COLORS.high : COLORS.lime,
                          }]} />
                        </View>
                        <Text style={styles.loadBarLabel}>{w.week_label || ''}</Text>
                        {w.increase_pct !== undefined && w.increase_pct !== null && (
                          <Text style={[styles.loadPct, {
                            color: w.increase_pct > 20 ? RISK_COLORS.high
                              : w.increase_pct > 10 ? RISK_COLORS.medium
                              : RISK_COLORS.low
                          }]}>
                            {w.increase_pct > 0 ? '+' : ''}{Math.round(w.increase_pct)}%
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.chartNote}>Barre arancioni = aumento &gt;20% (rischio sovraccarico)</Text>
              </View>
            )}

            {/* Recommendations */}
            {d.recommendations && d.recommendations.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="bulb" size={20} color={COLORS.lime} />
                  <Text style={styles.cardTitle}>RACCOMANDAZIONI</Text>
                </View>
                {d.recommendations.map((rec: string, i: number) => (
                  <View key={i} style={styles.recRow}>
                    <Text style={styles.recBullet}>•</Text>
                    <Text style={styles.recText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Check-in Modal */}
      <Modal visible={showCheckin} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>☀️ Check-in Mattutino</Text>
              <TouchableOpacity onPress={() => setShowCheckin(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Come ti senti oggi? (30 secondi)</Text>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              <SliderRow
                label="⚡ Energia"
                value={energy}
                options={ENERGY_LABELS}
                onSelect={setEnergy}
              />
              <SliderRow
                label="😴 Sonno"
                value={sleepQuality}
                options={SLEEP_LABELS}
                onSelect={setSleepQuality}
              />
              <SliderRow
                label="💪 Dolori muscolari"
                value={muscleSoreness}
                options={SORENESS_LABELS}
                onSelect={setMuscleSoreness}
              />
              <SliderRow
                label="🧠 Umore"
                value={mood}
                options={MOOD_LABELS}
                onSelect={setMood}
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saveCheckin}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.bg} />
              ) : (
                <Text style={styles.saveBtnText}>SALVA CHECK-IN</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  pageTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '900', letterSpacing: 1 },
  pageSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: 2 },

  tabRow: {
    flexDirection: 'row', marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden',
  },
  tab: { flex: 1, paddingVertical: SPACING.sm + 2, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.lime + '20' },
  tabText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.lime, fontWeight: '800' },

  card: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  cardTitle: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '700', letterSpacing: 2 },

  // Score Circle
  circleContainer: { alignItems: 'center', paddingVertical: SPACING.md },
  svgCircle: { width: 140, height: 140, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  circleTrack: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    borderWidth: 8, top: 5, left: 5,
  },
  circleProgress: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    borderWidth: 8, top: 5, left: 5,
  },
  circleInner: { alignItems: 'center' },
  circleScore: { fontSize: 36, fontWeight: '900', marginTop: -2 },
  circleStatus: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 2, marginTop: -2 },

  recommendationText: {
    textAlign: 'center', fontSize: FONT_SIZES.body, fontWeight: '600',
    marginTop: SPACING.md, lineHeight: 22,
  },
  suggestedRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginTop: SPACING.md, paddingTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.cardBorder,
  },
  suggestedText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },

  checkinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, marginTop: SPACING.lg, paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
  },
  checkinBtnText: { fontSize: FONT_SIZES.body, fontWeight: '700' },
  checkinHint: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textAlign: 'center',
    marginTop: SPACING.sm, fontStyle: 'italic',
  },

  // Factor bars
  factorBarRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  factorBarHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4,
  },
  factorBarLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  factorBarScore: { fontSize: FONT_SIZES.xs, fontWeight: '800' },
  factorBarTrack: {
    height: 6, backgroundColor: COLORS.cardBorder, borderRadius: 3, overflow: 'hidden',
  },
  factorBarFill: { height: 6, borderRadius: 3 },

  // Subjective grid
  subjectiveGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  subjectiveItem: { alignItems: 'center', gap: 4 },
  subjectiveEmoji: { fontSize: 28 },
  subjectiveLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  subjectiveValue: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '700' },

  // History
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  historyDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, width: 40 },
  historyBarTrack: {
    flex: 1, height: 8, backgroundColor: COLORS.cardBorder, borderRadius: 4, overflow: 'hidden',
  },
  historyBarFill: { height: 8, borderRadius: 4 },
  historyScore: { fontSize: FONT_SIZES.xs, fontWeight: '800', width: 28, textAlign: 'right' },

  // Injury Risk styles (kept from original)
  gaugeContainer: { marginTop: SPACING.sm },
  gaugeTrack: { height: 12, backgroundColor: COLORS.cardBorder, borderRadius: 6, overflow: 'hidden' },
  gaugeFill: { height: 12, borderRadius: 6 },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm },
  gaugeScore: { fontSize: FONT_SIZES.xxl, fontWeight: '900' },
  gaugeRisk: { fontSize: FONT_SIZES.body, fontWeight: '800', alignSelf: 'flex-end' },
  gaugeLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.xs, fontStyle: 'italic' },

  factorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  factorInfo: { flex: 1, marginRight: SPACING.md },
  factorName: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '700' },
  factorDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  factorBadge: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  factorScore: { fontSize: FONT_SIZES.body, fontWeight: '900' },

  alertRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    paddingVertical: SPACING.md, paddingLeft: SPACING.md,
    borderLeftWidth: 3, marginBottom: SPACING.xs,
  },
  alertText: { fontSize: FONT_SIZES.sm, color: COLORS.text, flex: 1, lineHeight: 20 },

  loadChart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 170, marginTop: SPACING.sm },
  loadBarCol: { alignItems: 'center', flex: 1 },
  loadBarValue: { fontSize: 9, color: COLORS.textSecondary, marginBottom: 2 },
  loadBarTrackV: { height: 130, justifyContent: 'flex-end', alignItems: 'center' },
  loadBar: { width: 22, borderRadius: 4 },
  loadBarLabel: { fontSize: 7, color: COLORS.textMuted, marginTop: 3, textAlign: 'center' },
  loadPct: { fontSize: 8, fontWeight: '700', marginTop: 1 },
  chartNote: { fontSize: 9, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm, fontStyle: 'italic' },

  recRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  recBullet: { color: COLORS.lime, fontSize: FONT_SIZES.body, fontWeight: '700' },
  recText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl, paddingBottom: 40,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '900' },
  modalSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginBottom: SPACING.lg },

  sliderRow: { marginBottom: SPACING.xl },
  sliderLabel: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '700', marginBottom: SPACING.sm },
  sliderOptions: { flexDirection: 'row', gap: 6 },
  sliderBtn: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
    borderColor: COLORS.cardBorder, backgroundColor: COLORS.bg,
  },
  sliderBtnActive: { backgroundColor: COLORS.bg },
  sliderBtnText: { fontSize: FONT_SIZES.lg, color: COLORS.textMuted, fontWeight: '800' },
  sliderBtnLabel: { fontSize: 8, color: COLORS.textMuted, marginTop: 2 },

  saveBtn: {
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md + 2, alignItems: 'center', marginTop: SPACING.lg,
  },
  saveBtnText: { color: COLORS.bg, fontWeight: '900', fontSize: FONT_SIZES.body, letterSpacing: 1 },
});
