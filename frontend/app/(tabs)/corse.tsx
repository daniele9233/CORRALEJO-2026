import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS } from '../../src/theme';
import { api } from '../../src/api';
import { Run } from '../../src/types';

export default function CorseScreen() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRuns = async () => {
    try {
      const data = await api.getRuns();
      setRuns(data.runs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadRuns();
    }, [])
  );

  const totalKm = runs.reduce((sum, r) => sum + r.distance_km, 0);
  const avgPace = runs.length > 0 ? runs.reduce((sum, r) => {
    const parts = r.avg_pace.split(':');
    return sum + parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
  }, 0) / runs.length : 0;

  const renderRun = ({ item }: { item: Run }) => (
    <TouchableOpacity
      testID={`run-card-${item.id}`}
      style={styles.runCard}
      onPress={() => router.push({ pathname: '/run-detail', params: { id: item.id } })}
    >
      <View style={styles.runHeader}>
        <View>
          <Text style={styles.runDate}>{formatDate(item.date)}</Text>
          {item.location && <Text style={styles.runLocation}>{item.location}</Text>}
        </View>
        <View style={[styles.typeBadge, { backgroundColor: (SESSION_COLORS[item.run_type] || COLORS.textMuted) + '20' }]}>
          <Text style={[styles.typeText, { color: SESSION_COLORS[item.run_type] || COLORS.textSecondary }]}>
            {item.run_type?.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.runStats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.distance_km}</Text>
          <Text style={styles.statUnit}>km</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.avg_pace}</Text>
          <Text style={styles.statUnit}>/km</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{Math.floor(item.duration_minutes)}:{String(Math.round((item.duration_minutes % 1) * 60)).padStart(2, '0')}</Text>
          <Text style={styles.statUnit}>tempo</Text>
        </View>
        {item.avg_hr && (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: getHrColor(item.avg_hr_pct) }]}>{item.avg_hr}</Text>
            <Text style={styles.statUnit}>bpm</Text>
          </View>
        )}
      </View>

      {item.notes && (
        <Text style={styles.runNotes} numberOfLines={2}>{item.notes}</Text>
      )}

      <View style={styles.runFooter}>
        <Text style={styles.analyzeHint}>Tocca per dettagli e analisi AI</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.lime} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>LE MIE</Text>
          <Text style={styles.pageSubtitle}>CORSE</Text>
        </View>
        <TouchableOpacity
          testID="add-run-btn"
          style={styles.addBtn}
          onPress={() => router.push('/add-run')}
        >
          <Ionicons name="add" size={24} color={COLORS.limeDark} />
        </TouchableOpacity>
      </View>

      {/* Summary Stats */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{runs.length}</Text>
          <Text style={styles.summaryLabel}>CORSE</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalKm.toFixed(1)}</Text>
          <Text style={styles.summaryLabel}>KM TOTALI</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.floor(avgPace / 60)}:{String(Math.round(avgPace % 60)).padStart(2, '0')}</Text>
          <Text style={styles.summaryLabel}>PASSO MEDIO</Text>
        </View>
      </View>

      <FlatList
        data={runs}
        renderItem={renderRun}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRuns(); }} tintColor={COLORS.lime} />
        }
      />
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
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg,
  },
  pageTitle: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  pageSubtitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800' },
  addBtn: {
    backgroundColor: COLORS.lime, width: 44, height: 44,
    borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row', marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder, padding: SPACING.lg,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800' },
  summaryLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  listContent: { paddingTop: SPACING.lg, paddingBottom: 40 },
  runCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  runHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  runDate: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '600' },
  runLocation: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  typeBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  typeText: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 1 },
  runStats: { flexDirection: 'row', marginTop: SPACING.md, gap: SPACING.xl },
  statItem: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  statValue: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800' },
  statUnit: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  runNotes: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: SPACING.sm, fontStyle: 'italic' },
  runFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.cardBorder,
  },
  analyzeHint: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
});
