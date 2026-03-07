import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SESSION_COLORS } from '../../src/theme';
import { api } from '../../src/api';
import { TrainingWeek, TrainingSession } from '../../src/types';

const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const DAYS_SHORT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

export default function CalendarioScreen() {
  const router = useRouter();
  const [weeks, setWeeks] = useState<TrainingWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const data = await api.getTrainingPlan();
      setWeeks(data.weeks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getSessionsForDate = (dateStr: string): TrainingSession[] => {
    for (const week of weeks) {
      for (const session of week.sessions) {
        if (session.date === dateStr) return [session];
      }
    }
    return [];
  };

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Monday = 0
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const today = new Date().toISOString().split('T')[0];

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const selectedSessions = selectedDate ? getSessionsForDate(selectedDate) : [];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.lime} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>CALENDARIO</Text>
        </View>

        {/* Month Navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity testID="prev-month-btn" onPress={prevMonth} style={styles.monthNavBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.lime} />
          </TouchableOpacity>
          <Text style={styles.monthName}>{MONTHS_IT[currentMonth]} {currentYear}</Text>
          <TouchableOpacity testID="next-month-btn" onPress={nextMonth} style={styles.monthNavBtn}>
            <Ionicons name="chevron-forward" size={22} color={COLORS.lime} />
          </TouchableOpacity>
        </View>

        {/* Day Headers */}
        <View style={styles.dayHeaders}>
          {DAYS_SHORT.map((d, i) => (
            <View key={i} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, idx) => {
            if (day === null) return <View key={`empty-${idx}`} style={styles.calendarCell} />;

            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const sessions = getSessionsForDate(dateStr);
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const sessionType = sessions[0]?.type;

            return (
              <TouchableOpacity
                key={dateStr}
                testID={`cal-day-${day}`}
                style={[
                  styles.calendarCell,
                  isToday && styles.todayCell,
                  isSelected && styles.selectedCell,
                ]}
                onPress={() => setSelectedDate(dateStr)}
              >
                <Text style={[
                  styles.dayNumber,
                  isToday && styles.todayText,
                  isSelected && styles.selectedText,
                ]}>{day}</Text>
                {sessions.length > 0 && (
                  <View style={[styles.sessionDot, { backgroundColor: SESSION_COLORS[sessionType || ''] || COLORS.textMuted }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Day Sessions */}
        {selectedDate && (
          <View style={styles.selectedSection}>
            <Text style={styles.selectedDateText}>{formatDateLong(selectedDate)}</Text>
            {selectedSessions.length > 0 ? selectedSessions.map((session, idx) => (
              <TouchableOpacity
                key={idx}
                testID={`cal-session-${idx}`}
                style={[styles.sessionCard, { borderLeftColor: SESSION_COLORS[session.type] || COLORS.textMuted }]}
                onPress={() => router.push({ pathname: '/workout-detail', params: { session: JSON.stringify(session) } })}
              >
                <Text style={[styles.sessionType, { color: SESSION_COLORS[session.type] || COLORS.textSecondary }]}>
                  {session.type?.toUpperCase().replace('_', ' ')}
                </Text>
                <Text style={styles.sessionTitle}>{session.title}</Text>
                <Text style={styles.sessionDesc}>{session.description}</Text>
                {session.target_distance_km > 0 && (
                  <Text style={styles.sessionKm}>{session.target_distance_km} km • {session.target_pace}/km</Text>
                )}
              </TouchableOpacity>
            )) : (
              <View style={styles.noSession}>
                <Text style={styles.noSessionText}>Nessun allenamento programmato</Text>
              </View>
            )}
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          {Object.entries(SESSION_COLORS).slice(0, 7).map(([key, color]) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{key.replace('_', ' ')}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDateLong(dateStr: string) {
  const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  pageTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800' },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
  },
  monthNavBtn: { padding: SPACING.sm },
  monthName: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700' },
  dayHeaders: { flexDirection: 'row', marginHorizontal: SPACING.xl, marginTop: SPACING.lg },
  dayHeaderCell: { flex: 1, alignItems: 'center', paddingBottom: SPACING.sm },
  dayHeaderText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: SPACING.xl },
  calendarCell: {
    width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: BORDER_RADIUS.sm, padding: 2,
  },
  todayCell: { backgroundColor: 'rgba(190, 242, 100, 0.15)' },
  selectedCell: { backgroundColor: COLORS.lime },
  dayNumber: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, fontWeight: '600' },
  todayText: { color: COLORS.lime, fontWeight: '800' },
  selectedText: { color: COLORS.limeDark, fontWeight: '800' },
  sessionDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  selectedSection: { marginHorizontal: SPACING.xl, marginTop: SPACING.xl },
  selectedDateText: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700', marginBottom: SPACING.md },
  sessionCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderLeftWidth: 4, marginBottom: SPACING.sm,
  },
  sessionType: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 1 },
  sessionTitle: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700', marginTop: 4 },
  sessionDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 4 },
  sessionKm: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '600', marginTop: SPACING.sm },
  noSession: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  noSessionText: { color: COLORS.textMuted, fontSize: FONT_SIZES.md },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md,
    marginHorizontal: SPACING.xl, marginTop: SPACING.xxl,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textTransform: 'capitalize' },
});
