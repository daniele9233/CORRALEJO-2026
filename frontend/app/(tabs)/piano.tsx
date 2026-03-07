import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS } from '../../src/theme';
import { api } from '../../src/api';
import { TrainingWeek } from '../../src/types';

export default function PianoScreen() {
  const router = useRouter();
  const [weeks, setWeeks] = useState<TrainingWeek[]>([]);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadPlan();
    }, [])
  );

  const loadPlan = async () => {
    try {
      const data = await api.getTrainingPlan();
      const allWeeks = data.weeks || [];
      setWeeks(allWeeks);
      const today = new Date().toISOString().split('T')[0];
      const currentIdx = allWeeks.findIndex((w: TrainingWeek) => w.week_start <= today && w.week_end >= today);
      setSelectedWeekIdx(currentIdx >= 0 ? currentIdx : 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (sessionIdx: number) => {
    const week = weeks[selectedWeekIdx];
    if (!week) return;
    const newVal = !week.sessions[sessionIdx].completed;
    try {
      await api.toggleSessionComplete(week.id, sessionIdx, newVal);
      const updated = [...weeks];
      updated[selectedWeekIdx] = {
        ...week,
        sessions: week.sessions.map((s, i) => i === sessionIdx ? { ...s, completed: newVal } : s),
      };
      setWeeks(updated);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.lime} /></View>
      </SafeAreaView>
    );
  }

  const week = weeks[selectedWeekIdx];
  const completedCount = week?.sessions?.filter(s => s.completed).length ?? 0;
  const totalSessions = week?.sessions?.length ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>PIANO</Text>
        <Text style={styles.pageSubtitle}>ALLENAMENTO</Text>
      </View>

      {/* Week Navigator */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          testID="prev-week-btn"
          onPress={() => setSelectedWeekIdx(Math.max(0, selectedWeekIdx - 1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-back" size={22} color={selectedWeekIdx > 0 ? COLORS.lime : COLORS.textMuted} />
        </TouchableOpacity>
        <View style={styles.weekNavCenter}>
          <Text style={styles.weekNavLabel}>SETTIMANA {week?.week_number}</Text>
          <Text style={styles.weekNavPhase}>{week?.phase}</Text>
          <Text style={styles.weekNavDates}>
            {formatDateShort(week?.week_start)} - {formatDateShort(week?.week_end)}
          </Text>
        </View>
        <TouchableOpacity
          testID="next-week-btn"
          onPress={() => setSelectedWeekIdx(Math.min(weeks.length - 1, selectedWeekIdx + 1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-forward" size={22} color={selectedWeekIdx < weeks.length - 1 ? COLORS.lime : COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${totalSessions > 0 ? (completedCount / totalSessions) * 100 : 0}%` }]} />
        </View>
        <Text style={styles.progressText}>{completedCount}/{totalSessions} completati • Target {week?.target_km} km</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.sessionsList}>
        {week?.sessions?.map((session, idx) => (
          <TouchableOpacity
            key={idx}
            testID={`session-${idx}`}
            style={[
              styles.sessionCard,
              { borderLeftColor: SESSION_COLORS[session.type] || COLORS.textMuted },
              session.completed && styles.sessionCompleted,
            ]}
            onPress={() => router.push({ pathname: '/workout-detail', params: { session: JSON.stringify(session), weekId: week.id, sessionIndex: idx.toString() } })}
          >
            <View style={styles.sessionRow}>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionDay}>{session.day}</Text>
                <Text style={[styles.sessionTitle, session.completed && styles.textCompleted]}>{session.title}</Text>
                <Text style={styles.sessionDesc} numberOfLines={2}>{session.description}</Text>
                <View style={styles.sessionMeta}>
                  {session.target_distance_km > 0 && (
                    <View style={styles.metaBadge}>
                      <Text style={styles.metaText}>{session.target_distance_km} km</Text>
                    </View>
                  )}
                  {session.target_pace && (
                    <View style={styles.metaBadge}>
                      <Text style={styles.metaText}>{session.target_pace}/km</Text>
                    </View>
                  )}
                  {session.target_duration_min > 0 && (
                    <View style={styles.metaBadge}>
                      <Text style={styles.metaText}>{session.target_duration_min} min</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity
                testID={`complete-btn-${idx}`}
                onPress={() => toggleComplete(idx)}
                style={[styles.checkBtn, session.completed && styles.checkBtnActive]}
              >
                <Ionicons
                  name={session.completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={28}
                  color={session.completed ? COLORS.lime : COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}

        {week?.notes && (
          <View style={styles.notesCard}>
            <Ionicons name="information-circle" size={18} color={COLORS.blue} />
            <Text style={styles.notesText}>{week.notes}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDateShort(dateStr?: string) {
  if (!dateStr) return '';
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  pageTitle: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  pageSubtitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800' },
  weekNav: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder, padding: SPACING.md,
  },
  navBtn: { padding: SPACING.sm },
  weekNavCenter: { flex: 1, alignItems: 'center' },
  weekNavLabel: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 1 },
  weekNavPhase: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '800', marginTop: 2 },
  weekNavDates: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  progressContainer: { marginHorizontal: SPACING.xl, marginTop: SPACING.md },
  progressBar: { height: 4, backgroundColor: COLORS.cardBorder, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.lime, borderRadius: 2 },
  progressText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 },
  sessionsList: { flex: 1, paddingTop: SPACING.md },
  sessionCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder, borderLeftWidth: 4,
  },
  sessionCompleted: { opacity: 0.6 },
  sessionRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sessionInfo: { flex: 1 },
  sessionDay: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  sessionTitle: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700', marginTop: 4 },
  textCompleted: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  sessionDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 4 },
  sessionMeta: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, flexWrap: 'wrap' },
  metaBadge: {
    backgroundColor: 'rgba(190, 242, 100, 0.1)', borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  metaText: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '600' },
  checkBtn: { padding: SPACING.sm, marginLeft: SPACING.sm },
  checkBtnActive: {},
  notesCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.sm,
    flexDirection: 'row', gap: SPACING.sm, backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
  },
  notesText: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.blue, lineHeight: 20 },
});
