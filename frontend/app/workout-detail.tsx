import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS } from '../src/theme';

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { session: sessionStr } = useLocalSearchParams<{ session: string }>();

  let session: any = {};
  try {
    session = JSON.parse(sessionStr || '{}');
  } catch {}

  const typeColor = SESSION_COLORS[session.type] || COLORS.textSecondary;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DETTAGLIO</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Main Info */}
        <View style={[styles.mainCard, { borderLeftColor: typeColor }]}>
          <Text style={styles.dayText}>{session.day}</Text>
          <Text style={styles.dateText}>{formatDate(session.date)}</Text>

          <View style={[styles.typeBadge, { backgroundColor: typeColor + '20' }]}>
            <Text style={[styles.typeText, { color: typeColor }]}>
              {session.type?.toUpperCase().replace('_', ' ')}
            </Text>
          </View>

          <Text style={styles.title}>{session.title}</Text>
          <Text style={styles.description}>{session.description}</Text>
        </View>

        {/* Stats */}
        {(session.target_distance_km > 0 || session.target_pace || session.target_duration_min > 0) && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>OBIETTIVI SESSIONE</Text>
            <View style={styles.statsGrid}>
              {session.target_distance_km > 0 && (
                <View style={styles.statItem}>
                  <Ionicons name="navigate" size={20} color={COLORS.lime} />
                  <Text style={styles.statValue}>{session.target_distance_km} km</Text>
                  <Text style={styles.statLabel}>Distanza</Text>
                </View>
              )}
              {session.target_pace && (
                <View style={styles.statItem}>
                  <Ionicons name="speedometer" size={20} color={COLORS.blue} />
                  <Text style={styles.statValue}>{session.target_pace}/km</Text>
                  <Text style={styles.statLabel}>Passo Target</Text>
                </View>
              )}
              {session.target_duration_min > 0 && (
                <View style={styles.statItem}>
                  <Ionicons name="time" size={20} color={COLORS.orange} />
                  <Text style={styles.statValue}>{session.target_duration_min} min</Text>
                  <Text style={styles.statLabel}>Durata</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Tips based on type */}
        <View style={styles.tipsCard}>
          <Ionicons name="bulb" size={20} color={COLORS.orange} />
          <View style={styles.tipsContent}>
            <Text style={styles.tipsTitle}>CONSIGLI</Text>
            <Text style={styles.tipsText}>{getTypeTips(session.type)}</Text>
          </View>
        </View>

        {/* Completion Status */}
        <View style={[styles.statusCard, session.completed ? styles.statusCompleted : styles.statusPending]}>
          <Ionicons
            name={session.completed ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={session.completed ? COLORS.lime : COLORS.textMuted}
          />
          <Text style={[styles.statusText, session.completed && styles.statusTextCompleted]}>
            {session.completed ? 'Completato' : 'Da completare'}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getTypeTips(type: string): string {
  const tips: Record<string, string> = {
    corsa_lenta: 'Mantieni un ritmo confortevole dove puoi parlare facilmente. La FC dovrebbe restare sotto il 75% della massima. Questo tipo di corsa costruisce la base aerobica.',
    lungo: 'Parti piano e, se previsto, accelera negli ultimi km. Porta acqua se oltre i 60 minuti. Fondamentale per la resistenza in mezza maratona.',
    ripetute: 'Riscaldamento adeguato di almeno 2km. Rispetta i recuperi. La qualità conta più della quantità. Se non riesci a mantenere il passo, fermati.',
    progressivo: 'Inizia lento e aumenta gradualmente il ritmo. Non partire troppo forte. L\'ultimo km dovrebbe essere il più veloce.',
    rinforzo: 'Esegui tutti gli esercizi con il giusto tempo di esecuzione. La fase eccentrica è fondamentale per il tendine d\'Achille. Non saltare nessun esercizio.',
    cyclette: 'Mantieni una resistenza bassa-media. L\'obiettivo è il recupero attivo, non l\'affaticamento. Pedala tra 70-90 RPM.',
    riposo: 'Il riposo è parte dell\'allenamento. Il corpo si rafforza durante il recupero, non durante lo sforzo. Stretching leggero consentito.',
  };
  return tips[type] || 'Esegui l\'allenamento come descritto. Ascolta il tuo corpo e adatta se necessario.';
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 2 },
  mainCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.cardBorder, borderLeftWidth: 4,
  },
  dayText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  dateText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 2 },
  typeBadge: {
    borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    alignSelf: 'flex-start', marginTop: SPACING.lg,
  },
  typeText: { fontSize: FONT_SIZES.sm, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800', marginTop: SPACING.md },
  description: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 24 },
  statsCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  statsTitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.lg },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: SPACING.sm },
  statValue: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800' },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  tipsCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: 'rgba(249, 115, 22, 0.08)', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, flexDirection: 'row', gap: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.2)',
  },
  tipsContent: { flex: 1 },
  tipsTitle: { fontSize: FONT_SIZES.xs, color: COLORS.orange, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.sm },
  tipsText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, lineHeight: 22 },
  statusCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1,
  },
  statusPending: { backgroundColor: COLORS.card, borderColor: COLORS.cardBorder },
  statusCompleted: { backgroundColor: 'rgba(190, 242, 100, 0.08)', borderColor: 'rgba(190, 242, 100, 0.3)' },
  statusText: { fontSize: FONT_SIZES.lg, color: COLORS.textMuted, fontWeight: '700' },
  statusTextCompleted: { color: COLORS.lime },
});
