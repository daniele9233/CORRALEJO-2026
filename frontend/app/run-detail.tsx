import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS } from '../src/theme';
import { api } from '../src/api';
import { Run, AIAnalysis } from '../src/types';

export default function RunDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadRun();
  }, [id]);

  const loadRun = async () => {
    try {
      const data = await api.getRun(id!);
      setRun(data.run);
      setAnalysis(data.analysis);
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
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.lime} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
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
            <View style={[styles.typeBadge, { backgroundColor: (SESSION_COLORS[run.run_type] || COLORS.textMuted) + '20' }]}>
              <Text style={[styles.typeText, { color: SESSION_COLORS[run.run_type] || COLORS.textSecondary }]}>
                {run.run_type?.toUpperCase()}
              </Text>
            </View>
          </View>
          {run.location && <Text style={styles.location}>{run.location}</Text>}

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
              <Text style={styles.bigValue}>{Math.floor(run.duration_minutes)}:{String(Math.round((run.duration_minutes % 1) * 60)).padStart(2, '0')}</Text>
              <Text style={styles.bigUnit}>tempo</Text>
            </View>
          </View>
        </View>

        {/* HR Stats */}
        {run.avg_hr && (
          <View style={styles.hrCard}>
            <Text style={styles.hrTitle}>FREQUENZA CARDIACA</Text>
            <View style={styles.hrStats}>
              <View style={styles.hrStatItem}>
                <Ionicons name="heart" size={18} color={getHrColor(run.avg_hr_pct)} />
                <Text style={[styles.hrValue, { color: getHrColor(run.avg_hr_pct) }]}>{run.avg_hr}</Text>
                <Text style={styles.hrLabel}>bpm media</Text>
              </View>
              <View style={styles.hrStatItem}>
                <Ionicons name="heart" size={18} color={getHrColor(run.max_hr_pct)} />
                <Text style={[styles.hrValue, { color: getHrColor(run.max_hr_pct) }]}>{run.max_hr}</Text>
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
              <View style={[styles.zone, { flex: 1, backgroundColor: COLORS.hrZone1 }]} />
              <View style={[styles.zone, { flex: 1, backgroundColor: COLORS.hrZone2 }]} />
              <View style={[styles.zone, { flex: 1, backgroundColor: COLORS.hrZone3 }]} />
              <View style={[styles.zone, { flex: 1, backgroundColor: COLORS.hrZone4 }]} />
              <View style={[styles.zone, { flex: 1, backgroundColor: COLORS.hrZone5 }]} />
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

        {/* Notes */}
        {run.notes && (
          <View style={styles.notesCard}>
            <Ionicons name="document-text" size={18} color={COLORS.textSecondary} />
            <Text style={styles.notesText}>{run.notes}</Text>
          </View>
        )}

        {/* AI Analysis */}
        <View style={styles.aiSection}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={20} color={COLORS.lime} />
            <Text style={styles.aiTitle}>ANALISI AI COACH</Text>
          </View>

          {analysis ? (
            <View style={styles.aiCard}>
              <Text style={styles.aiText}>{analysis.analysis}</Text>
              <Text style={styles.aiDate}>Analizzata il {formatDateTime(analysis.created_at)}</Text>
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
                  <Ionicons name="sparkles" size={20} color={COLORS.limeDark} />
                  <Text style={styles.analyzeBtnText}>ANALIZZA QUESTA CORSA</Text>
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

function getHrColor(pct?: number) {
  if (!pct) return COLORS.text;
  if (pct < 70) return COLORS.hrZone1;
  if (pct < 80) return COLORS.hrZone2;
  if (pct < 87) return COLORS.hrZone3;
  if (pct < 93) return COLORS.hrZone4;
  return COLORS.hrZone5;
}

function formatDate(dateStr: string) {
  const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateTime(isoStr: string) {
  const d = new Date(isoStr);
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 2 },
  mainCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '600' },
  typeBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  typeText: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 1 },
  location: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: 4 },
  bigStats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: SPACING.xl },
  bigStat: { alignItems: 'center' },
  bigValue: { fontSize: FONT_SIZES.xxxl, color: COLORS.text, fontWeight: '900' },
  bigUnit: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: 2 },
  hrCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  hrTitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.md },
  hrStats: { flexDirection: 'row', justifyContent: 'space-between' },
  hrStatItem: { alignItems: 'center', gap: 4 },
  hrValue: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800' },
  hrLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  zoneBar: {
    flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden',
    marginTop: SPACING.lg, gap: 2,
  },
  zone: { borderRadius: 3 },
  zoneLabels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  zoneLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  notesCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
    flexDirection: 'row', gap: SPACING.sm,
  },
  notesText: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.textSecondary, fontStyle: 'italic', lineHeight: 22 },
  aiSection: { marginHorizontal: SPACING.xl, marginTop: SPACING.xxl },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  aiTitle: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  aiCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.2)',
  },
  aiText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, lineHeight: 24 },
  aiDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.lg },
  analyzeBtn: {
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.lg, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: SPACING.sm,
  },
  analyzeBtnText: { fontSize: FONT_SIZES.md, color: COLORS.limeDark, fontWeight: '800', letterSpacing: 1 },
});
