import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';

const PHASE_DATA = [
  {
    name: 'Ripresa',
    weeks: 4,
    color: '#71717a',
    kmRange: '15-25 km/sett',
    workouts: 'Corsa lenta, camminate, cyclette',
    goal: 'Ripristino mobilita articolare, riadattamento tendini e legamenti',
  },
  {
    name: 'Base Aerobica',
    weeks: 8,
    color: '#3b82f6',
    kmRange: '25-40 km/sett',
    workouts: 'Corsa lenta, lungo progressivo, rinforzo',
    goal: 'Costruzione capillare, aumento mitocondri, efficienza lipidica',
  },
  {
    name: 'Sviluppo',
    weeks: 8,
    color: '#22c55e',
    kmRange: '35-50 km/sett',
    workouts: 'Tempo run, ripetute medie, lungo fino a 20km',
    goal: 'Innalzamento soglia anaerobica, aumento VO2max',
  },
  {
    name: 'Preparazione Specifica',
    weeks: 8,
    color: '#f97316',
    kmRange: '45-58 km/sett',
    workouts: 'Ripetute a passo gara, lungo specifico 22-24km',
    goal: 'Adattamento neuromuscolare al ritmo obiettivo HM',
  },
  {
    name: 'Picco',
    weeks: 7,
    color: '#ef4444',
    kmRange: '50-60 km/sett',
    workouts: 'Sedute ad alta intensita, simulazioni gara',
    goal: 'Massimizzazione performance, picco di forma',
  },
  {
    name: 'Tapering',
    weeks: 3,
    color: '#bef264',
    kmRange: '35-25 km/sett',
    workouts: 'Volume ridotto, brevi tocchi di velocita',
    goal: 'Supercompensazione, ricarica glicogeno, freschezza muscolare',
  },
];

const REFERENCES = [
  {
    icon: 'speedometer' as const,
    title: "Daniels' Running Formula",
    year: '2014',
    description:
      'Sistema VDOT: ritmi di allenamento derivati dalle prestazioni in gara. 5 zone (Easy, Marathon, Threshold, Interval, Repetition). Aggiornamento VDOT con la regola dei 2/3.',
  },
  {
    icon: 'map' as const,
    title: 'Pfitzinger & Douglas',
    year: '2009',
    description:
      '"Advanced Marathoning": lunghi progressivi fino a 24km per la mezza maratona. Volume massimo 55-60 km/sett per runner intermedi.',
  },
  {
    icon: 'analytics' as const,
    title: 'Seiler — Polarized Training',
    year: '2010',
    description:
      'Allenamento polarizzato: \u226580% corsa facile (Z1), \u22645% tempo (Z2), 15-20% alta intensita (Z3). Provato su atleti elite di endurance.',
  },
  {
    icon: 'pulse' as const,
    title: 'Foster — Training Monotony',
    year: '1998',
    description:
      'Monitoraggio monotonia e strain del carico. Monotonia > 2.0 = rischio sovrallenamento. Variare i carichi giornalieri.',
  },
  {
    icon: 'trending-down' as const,
    title: 'Mujika & Padilla — Tapering',
    year: '2003',
    description:
      'Tapering ottimale: ridurre il volume del 40-60%, mantenere l\'intensita, durata ideale 2-3 settimane.',
  },
  {
    icon: 'shield-checkmark' as const,
    title: 'ACSM — 10% Rule',
    year: '2013',
    description:
      'Regola del 10%: l\'incremento settimanale del volume non deve superare il 10% per prevenire infortuni.',
  },
  {
    icon: 'fitness' as const,
    title: 'Banister — Impulse-Response',
    year: '1975',
    description:
      'Modello Fitness-Fatigue: CTL (42 giorni) meno ATL (7 giorni) = TSB (Form). Base del monitoraggio supercompensazione.',
  },
];

export default function MetodologiaScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>METODOLOGIA</Text>
            <Text style={styles.subtitle}>La scienza dietro il tuo piano</Text>
          </View>
        </View>

        {/* Section 1: Periodizzazione */}
        <View style={styles.sectionHeader}>
          <Ionicons name="layers" size={22} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>Il Modello di Periodizzazione</Text>
        </View>
        <Text style={styles.sectionIntro}>
          Il piano e strutturato in 6 fasi progressive su 38 settimane, dalla ripresa post-infortunio
          fino al picco di forma per la mezza maratona obiettivo.
        </Text>

        {PHASE_DATA.map((phase) => (
          <View key={phase.name} style={[styles.phaseCard, { borderLeftColor: phase.color }]}>
            <View style={styles.phaseHeader}>
              <View style={[styles.phaseDot, { backgroundColor: phase.color }]} />
              <Text style={styles.phaseName}>{phase.name}</Text>
              <View style={styles.phaseWeeksBadge}>
                <Text style={styles.phaseWeeksText}>{phase.weeks} sett</Text>
              </View>
            </View>
            <View style={styles.phaseDetails}>
              <View style={styles.phaseRow}>
                <Ionicons name="speedometer-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.phaseDetailText}>{phase.kmRange}</Text>
              </View>
              <View style={styles.phaseRow}>
                <Ionicons name="barbell-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.phaseDetailText}>{phase.workouts}</Text>
              </View>
              <View style={styles.phaseRow}>
                <Ionicons name="body-outline" size={14} color={phase.color} />
                <Text style={[styles.phaseDetailText, { color: COLORS.text }]}>{phase.goal}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Section 2: Basi Scientifiche */}
        <View style={[styles.sectionHeader, { marginTop: SPACING.xxxl }]}>
          <Ionicons name="book" size={22} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>Basi Scientifiche</Text>
        </View>
        <Text style={styles.sectionIntro}>
          Ogni scelta del piano e supportata dalla letteratura scientifica sull'allenamento di endurance.
        </Text>

        {REFERENCES.map((ref) => (
          <View key={ref.title} style={styles.refCard}>
            <View style={styles.refIconWrap}>
              <Ionicons name={ref.icon} size={24} color={COLORS.lime} />
            </View>
            <View style={styles.refContent}>
              <Text style={styles.refTitle}>{ref.title}</Text>
              <Text style={styles.refYear}>{ref.year}</Text>
              <Text style={styles.refDesc}>{ref.description}</Text>
            </View>
          </View>
        ))}

        {/* Section 3: Perche l'Obiettivo e Raggiungibile */}
        <View style={[styles.sectionHeader, { marginTop: SPACING.xxxl }]}>
          <Ionicons name="rocket" size={22} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>Perche l'Obiettivo e Raggiungibile</Text>
        </View>

        <View style={styles.goalCard}>
          <View style={styles.goalRow}>
            <View style={styles.goalMetric}>
              <Text style={styles.goalValue}>~38</Text>
              <Text style={styles.goalLabel}>VDOT attuale</Text>
            </View>
            <Ionicons name="arrow-forward" size={24} color={COLORS.lime} style={{ marginHorizontal: SPACING.md }} />
            <View style={styles.goalMetric}>
              <Text style={[styles.goalValue, { color: COLORS.lime }]}>~45</Text>
              <Text style={styles.goalLabel}>VDOT obiettivo</Text>
            </View>
          </View>

          <View style={styles.goalDivider} />

          <View style={styles.goalPoint}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
            <Text style={styles.goalPointText}>
              Gap di 7 punti VDOT in 38 settimane = ~0.18 VDOT/settimana. La letteratura supporta miglioramenti di 0.15-0.25/settimana per atleti di ritorno.
            </Text>
          </View>

          <View style={styles.goalPoint}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
            <Text style={styles.goalPointText}>
              Gli atleti post-infortunio recuperano piu velocemente rispetto a partire da zero: memoria muscolare e adattamenti neurali accelerano il processo.
            </Text>
          </View>

          <View style={styles.goalPoint}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
            <Text style={styles.goalPointText}>
              Il VDOT pre-infortunio era probabilmente ~42-43 (picco Ott-Nov 2025). Servono solo +2-3 punti VDOT nuovi oltre il livello precedente.
            </Text>
          </View>

          <View style={styles.goalPoint}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
            <Text style={styles.goalPointText}>
              Il piano usa auto-adattamento: dopo ogni test o gara, i ritmi si ricalibrano automaticamente con la regola dei 2/3 di Daniels.
            </Text>
          </View>

          <View style={styles.goalHighlight}>
            <Text style={styles.goalHighlightText}>
              Obiettivo mezza maratona: 4:30/km {'\u2192'} ~1h35' finish
            </Text>
          </View>
        </View>

        {/* Section 4: Sistema di Adattamento Automatico */}
        <View style={[styles.sectionHeader, { marginTop: SPACING.xxxl }]}>
          <Ionicons name="sync" size={22} color={COLORS.lime} />
          <Text style={styles.sectionTitle}>Sistema di Adattamento Automatico</Text>
        </View>
        <Text style={styles.sectionIntro}>
          Il piano non e statico. Si adatta continuamente in base ai tuoi dati reali.
        </Text>

        <View style={styles.adaptCard}>
          <AdaptItem
            icon="refresh-circle"
            title="Ricalcolo VDOT"
            desc="Dopo ogni sync Strava, il VDOT viene ricalcolato e i ritmi aggiornati per tutte le settimane future."
          />
          <AdaptItem
            icon="warning"
            title="Rilevamento spike di carico"
            desc="Algoritmo basato su Impellizzeri (2020): identifica aumenti improvvisi del carico che aumentano il rischio infortunio."
          />
          <AdaptItem
            icon="pulse"
            title="Guardia monotonia"
            desc="Monitoraggio Foster (1998): se la monotonia supera 2.0, il sistema suggerisce di variare i carichi."
          />
          <AdaptItem
            icon="analytics"
            title="Controllo polarizzazione"
            desc="Verifica Seiler (2010): mantiene la distribuzione 80/5/15 tra zone facili, medie e intense."
          />
          <AdaptItem
            icon="shield"
            title="Limiti di volume per fase"
            desc="Ogni fase ha un tetto massimo di km settimanali per garantire una progressione sicura."
          />
          <AdaptItem
            icon="battery-charging"
            title="Settimane di recupero"
            desc="Ogni 4 settimane: riduzione del volume del 35% per favorire la supercompensazione."
          />
        </View>

        <View style={{ height: SPACING.xxxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AdaptItem({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.adaptItem}>
      <View style={styles.adaptIconWrap}>
        <Ionicons name={icon as any} size={20} color={COLORS.lime} />
      </View>
      <View style={styles.adaptText}>
        <Text style={styles.adaptTitle}>{title}</Text>
        <Text style={styles.adaptDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  /* Sections */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionIntro: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },

  /* Phase cards */
  phaseCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderLeftWidth: 4,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  phaseDot: {
    width: 10,
    height: 10,
    borderRadius: BORDER_RADIUS.full,
    marginRight: SPACING.sm,
  },
  phaseName: {
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  phaseWeeksBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  phaseWeeksText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  phaseDetails: {
    gap: SPACING.xs,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  phaseDetailText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },

  /* Reference cards */
  refCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  refIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: 'rgba(190, 242, 100, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refContent: {
    flex: 1,
  },
  refTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
    color: COLORS.text,
  },
  refYear: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lime,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  refDesc: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  /* Goal card */
  goalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: SPACING.xl,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  goalMetric: {
    alignItems: 'center',
  },
  goalValue: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '800',
    color: COLORS.text,
  },
  goalLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goalDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginBottom: SPACING.lg,
  },
  goalPoint: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  goalPointText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  goalHighlight: {
    backgroundColor: 'rgba(190, 242, 100, 0.1)',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    alignItems: 'center',
  },
  goalHighlightText: {
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
    color: COLORS.lime,
  },

  /* Adapt card */
  adaptCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: SPACING.lg,
  },
  adaptItem: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  adaptIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: 'rgba(190, 242, 100, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  adaptText: {
    flex: 1,
  },
  adaptTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  adaptDesc: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
