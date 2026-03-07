import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../src/theme';
import { api } from '../../src/api';
import { Profile, Supplement, Exercise, TestSchedule } from '../../src/types';

export default function ProfiloScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [tests, setTests] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profilo' | 'integratori' | 'esercizi' | 'test'>('profilo');

  const loadData = async () => {
    try {
      const [p, s, e, t] = await Promise.all([
        api.getProfile(), api.getSupplements(), api.getExercises(), api.getTests()
      ]);
      setProfile(p);
      setSupplements(s.supplements || []);
      setExercises(e.exercises || []);
      setTests(t);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.lime} /></View>
      </SafeAreaView>
    );
  }

  const tabs = [
    { key: 'profilo', label: 'PROFILO', icon: 'person' },
    { key: 'integratori', label: 'INTEGR.', icon: 'flask' },
    { key: 'esercizi', label: 'ESERCIZI', icon: 'barbell' },
    { key: 'test', label: 'TEST', icon: 'stopwatch' },
  ] as const;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.pageTitle}>PROFILO</Text>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            testID={`tab-${tab.key}`}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? COLORS.lime : COLORS.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'profilo' && profile && (
          <>
            {/* Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>ETÀ</Text>
                <Text style={styles.statValue}>{profile.age}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>PESO</Text>
                <Text style={styles.statValue}>{profile.weight_kg} kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>FC MAX</Text>
                <Text style={styles.statValue}>{profile.max_hr} bpm</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>KM MAX/SETT</Text>
                <Text style={styles.statValue}>{profile.max_weekly_km}</Text>
              </View>
            </View>

            {/* PBs */}
            <Text style={styles.sectionTitle}>PERSONAL BEST</Text>
            <View style={styles.pbGrid}>
              {Object.entries(profile.pbs || {}).map(([dist, pb]) => (
                <View key={dist} style={styles.pbCard}>
                  <Text style={styles.pbDist}>{dist.toUpperCase()}</Text>
                  <Text style={styles.pbTime}>{pb.time}</Text>
                  <Text style={styles.pbPace}>{pb.pace}/km</Text>
                  <Text style={styles.pbDate}>{pb.date}</Text>
                </View>
              ))}
            </View>

            {/* Injury */}
            <Text style={styles.sectionTitle}>INFORTUNIO</Text>
            <View style={styles.injuryCard}>
              <Ionicons name="medkit" size={20} color={COLORS.orange} />
              <View style={styles.injuryInfo}>
                <Text style={styles.injuryType}>{profile.injury?.type}</Text>
                <Text style={styles.injuryStatus}>{profile.injury?.status}</Text>
                <Text style={styles.injuryDetail}>{profile.injury?.details}</Text>
              </View>
            </View>

            {/* Mouth Tape */}
            <Text style={styles.sectionTitle}>MOUTH TAPE RUNNING</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoRecommendation}>{profile.mouth_tape?.recommendation}</Text>
              <Text style={styles.infoText}>{profile.mouth_tape?.benefits}</Text>
              <Text style={styles.infoProtocol}>Protocollo: {profile.mouth_tape?.protocol}</Text>
            </View>
          </>
        )}

        {activeTab === 'integratori' && (
          <>
            <Text style={styles.introText}>Piano integratori ottimizzato per il recupero da tendinopatia e prestazione in mezza maratona</Text>
            {supplements.map(supp => (
              <View key={supp.id} style={styles.suppCard}>
                <View style={styles.suppHeader}>
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(supp.category) + '20' }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(supp.category) }]}>{supp.category.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.suppName}>{supp.name}</Text>
                <Text style={styles.suppDosage}>{supp.dosage}</Text>
                <View style={styles.suppTimingRow}>
                  <Ionicons name="time" size={14} color={COLORS.lime} />
                  <Text style={styles.suppTiming}>{supp.timing}</Text>
                </View>
                <Text style={styles.suppPurpose}>{supp.purpose}</Text>
              </View>
            ))}
          </>
        )}

        {activeTab === 'esercizi' && (
          <>
            <Text style={styles.introText}>Protocollo di rinforzo muscolare - 4 volte/settimana</Text>
            {exercises.map(ex => (
              <View key={ex.id} style={styles.exCard}>
                <View style={styles.exHeader}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: ex.priority === 'alta' ? COLORS.red + '20' : COLORS.blue + '20' }]}>
                    <Text style={[styles.priorityText, { color: ex.priority === 'alta' ? COLORS.red : COLORS.blue }]}>
                      {ex.priority.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.exStatsRow}>
                  <View style={styles.exStatItem}>
                    <Text style={styles.exStatValue}>{ex.sets}x{ex.reps}</Text>
                    <Text style={styles.exStatLabel}>Serie x Rep</Text>
                  </View>
                  <View style={styles.exStatItem}>
                    <Text style={styles.exStatValue}>{ex.tempo}</Text>
                    <Text style={styles.exStatLabel}>Tempo</Text>
                  </View>
                  <View style={styles.exStatItem}>
                    <Text style={styles.exStatValue}>{ex.rest}</Text>
                    <Text style={styles.exStatLabel}>Recupero</Text>
                  </View>
                </View>
                <Text style={styles.exNotes}>{ex.notes}</Text>
              </View>
            ))}
          </>
        )}

        {activeTab === 'test' && (
          <>
            <View style={styles.testHeaderRow}>
              <Text style={styles.introText}>Test periodici ogni 6 settimane per verificare la condizione</Text>
              <TouchableOpacity
                testID="add-test-btn"
                style={styles.addTestBtn}
                onPress={() => router.push('/add-test')}
              >
                <Ionicons name="add" size={20} color={COLORS.limeDark} />
                <Text style={styles.addTestText}>AGGIUNGI</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSection}>PROGRAMMATI</Text>
            {(tests?.schedule || []).map((t: TestSchedule) => (
              <View key={t.id} style={[styles.testCard, t.completed && styles.testCompleted]}>
                <View style={styles.testRow}>
                  <View>
                    <Text style={styles.testDate}>{formatDate(t.scheduled_date)}</Text>
                    <Text style={styles.testType}>{t.test_type.replace(/_/g, ' ').toUpperCase()}</Text>
                  </View>
                  <Ionicons
                    name={t.completed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={t.completed ? COLORS.lime : COLORS.textMuted}
                  />
                </View>
                <Text style={styles.testDesc}>{t.description}</Text>
              </View>
            ))}

            {(tests?.results || []).length > 0 && (
              <>
                <Text style={styles.subSection}>RISULTATI</Text>
                {tests.results.map((r: any) => (
                  <View key={r.id} style={styles.resultCard}>
                    <Text style={styles.testDate}>{formatDate(r.date)}</Text>
                    <View style={styles.resultStats}>
                      <Text style={styles.resultValue}>{r.distance_km} km in {Math.floor(r.duration_minutes)}:{String(Math.round((r.duration_minutes % 1) * 60)).padStart(2, '0')}</Text>
                      <Text style={styles.resultPace}>{r.avg_pace}/km</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getCategoryColor(cat: string) {
  const map: Record<string, string> = {
    tendini: COLORS.orange, vitamine: COLORS.green, performance: COLORS.lime,
    minerali: COLORS.blue, anti_infiammatorio: COLORS.red,
  };
  return map[cat] || COLORS.textSecondary;
}

function formatDate(dateStr: string) {
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  tabBar: {
    flexDirection: 'row', marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder, padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
  },
  tabActive: { backgroundColor: 'rgba(190, 242, 100, 0.15)' },
  tabText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.lime },
  scrollContent: { paddingTop: SPACING.lg },
  introText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginHorizontal: SPACING.xl, marginBottom: SPACING.lg, lineHeight: 22 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
  },
  statCard: {
    width: '48%', backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder, flexGrow: 1,
  },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1 },
  statValue: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800', marginTop: 4 },
  sectionTitle: {
    fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2,
    marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, marginBottom: SPACING.md,
  },
  pbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginHorizontal: SPACING.xl },
  pbCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.2)',
    width: '48%', flexGrow: 1,
  },
  pbDist: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 1 },
  pbTime: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800', marginTop: 4 },
  pbPace: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  pbDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 },
  injuryCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.3)',
    flexDirection: 'row', gap: SPACING.md,
  },
  injuryInfo: { flex: 1 },
  injuryType: { fontSize: FONT_SIZES.md, color: COLORS.orange, fontWeight: '700' },
  injuryStatus: { fontSize: FONT_SIZES.sm, color: COLORS.text, marginTop: 4 },
  injuryDetail: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 4, lineHeight: 20 },
  infoCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  infoRecommendation: { fontSize: FONT_SIZES.md, color: COLORS.lime, fontWeight: '700' },
  infoText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 22 },
  infoProtocol: { fontSize: FONT_SIZES.sm, color: COLORS.blue, marginTop: SPACING.sm, fontStyle: 'italic' },
  suppCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  suppHeader: { marginBottom: SPACING.sm },
  categoryBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  categoryText: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 1 },
  suppName: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700' },
  suppDosage: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 4 },
  suppTimingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.sm },
  suppTiming: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '600' },
  suppPurpose: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: SPACING.sm, lineHeight: 20 },
  exCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700', flex: 1 },
  priorityBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  priorityText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  exStatsRow: { flexDirection: 'row', gap: SPACING.xl, marginTop: SPACING.md },
  exStatItem: {},
  exStatValue: { fontSize: FONT_SIZES.md, color: COLORS.lime, fontWeight: '700' },
  exStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  exNotes: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 20 },
  testHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
  },
  addTestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  addTestText: { fontSize: FONT_SIZES.xs, color: COLORS.limeDark, fontWeight: '700' },
  subSection: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 2,
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, marginTop: SPACING.md,
  },
  testCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  testCompleted: { opacity: 0.5 },
  testRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  testDate: { fontSize: FONT_SIZES.md, color: COLORS.orange, fontWeight: '700' },
  testType: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  testDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.sm },
  resultCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.2)',
  },
  resultStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm },
  resultValue: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700' },
  resultPace: { fontSize: FONT_SIZES.lg, color: COLORS.lime, fontWeight: '800' },
});
