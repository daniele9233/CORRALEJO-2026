import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal,
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
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [dayModalVisible, setDayModalVisible] = useState(false);

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

  const handleDayPress = (session: any) => {
    setSelectedDay(session);
    setDayModalVisible(true);
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

  // Get calendar data for current month
  const getCalendarData = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday start
    
    const days: any[] = [];
    // Empty cells before first day
    for (let i = 0; i < startDay; i++) {
      days.push({ empty: true });
    }
    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      // Find session for this date
      let session = null;
      let weekData = null;
      for (const w of weeks) {
        const found = w.sessions?.find(s => s.date === dateStr);
        if (found) {
          session = found;
          weekData = w;
          break;
        }
      }
      days.push({
        day: d,
        date: dateStr,
        session,
        weekData,
        isToday: dateStr === today.toISOString().split('T')[0],
      });
    }
    return { days, monthName: MONTHS_IT[month], year };
  };

  const calendarData = getCalendarData();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.pageTitle}>PIANO</Text>
            <Text style={styles.pageSubtitle}>ALLENAMENTO</Text>
          </View>
          <TouchableOpacity 
            style={styles.viewToggle} 
            onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
          >
            <Ionicons name={viewMode === 'list' ? 'calendar' : 'list'} size={24} color={COLORS.lime} />
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'calendar' ? (
        // CALENDAR VIEW
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.calendarContainer}>
            <Text style={styles.calendarMonth}>{calendarData.monthName} {calendarData.year}</Text>
            <View style={styles.calendarHeader}>
              {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => (
                <Text key={d} style={styles.calendarDayHeader}>{d}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {calendarData.days.map((d, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.calendarDay,
                    d.empty && styles.calendarDayEmpty,
                    d.isToday && styles.calendarDayToday,
                    d.session && { backgroundColor: (SESSION_COLORS[d.session.type] || COLORS.textMuted) + '30' },
                  ]}
                  onPress={() => d.session && handleDayPress({ ...d.session, weekData: d.weekData })}
                  disabled={d.empty || !d.session}
                >
                  {!d.empty && (
                    <>
                      <Text style={[
                        styles.calendarDayNum,
                        d.isToday && styles.calendarDayNumToday,
                        d.session?.completed && styles.calendarDayCompleted,
                      ]}>
                        {d.day}
                      </Text>
                      {d.session && (
                        <View style={[styles.calendarDot, { backgroundColor: SESSION_COLORS[d.session.type] || COLORS.textMuted }]} />
                      )}
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Legend */}
            <View style={styles.legendContainer}>
              <Text style={styles.legendTitle}>LEGENDA</Text>
              <View style={styles.legendGrid}>
                {Object.entries(SESSION_COLORS).map(([type, color]) => (
                  <View key={type} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendText}>{type.replace('_', ' ')}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        // LIST VIEW
        <>
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
              {week?.is_recovery_week && (
                <View style={styles.recoveryBadge}>
                  <Text style={styles.recoveryText}>SCARICO</Text>
                </View>
              )}
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
                    <Text style={styles.sessionDay}>{session.day} - {formatDateShort(session.date)}</Text>
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
        </>
      )}

      {/* Day Detail Modal */}
      <Modal visible={dayModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ALLENAMENTO</Text>
              <TouchableOpacity onPress={() => setDayModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            {selectedDay && (
              <>
                <Text style={styles.modalDate}>{selectedDay.day} - {formatDateShort(selectedDay.date)}</Text>
                <View style={[styles.modalTypeBadge, { backgroundColor: (SESSION_COLORS[selectedDay.type] || COLORS.textMuted) + '30' }]}>
                  <View style={[styles.modalTypeDot, { backgroundColor: SESSION_COLORS[selectedDay.type] || COLORS.textMuted }]} />
                  <Text style={[styles.modalTypeText, { color: SESSION_COLORS[selectedDay.type] || COLORS.textMuted }]}>
                    {selectedDay.type?.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modalSessionTitle}>{selectedDay.title}</Text>
                <Text style={styles.modalDesc}>{selectedDay.description}</Text>
                <View style={styles.modalStats}>
                  {selectedDay.target_distance_km > 0 && (
                    <View style={styles.modalStat}>
                      <Ionicons name="navigate" size={20} color={COLORS.lime} />
                      <Text style={styles.modalStatValue}>{selectedDay.target_distance_km} km</Text>
                    </View>
                  )}
                  {selectedDay.target_pace && (
                    <View style={styles.modalStat}>
                      <Ionicons name="speedometer" size={20} color={COLORS.blue} />
                      <Text style={styles.modalStatValue}>{selectedDay.target_pace}/km</Text>
                    </View>
                  )}
                  {selectedDay.target_duration_min > 0 && (
                    <View style={styles.modalStat}>
                      <Ionicons name="time" size={20} color={COLORS.orange} />
                      <Text style={styles.modalStatValue}>{selectedDay.target_duration_min} min</Text>
                    </View>
                  )}
                </View>
                {selectedDay.weekData && (
                  <View style={styles.modalWeekInfo}>
                    <Text style={styles.modalWeekLabel}>Settimana {selectedDay.weekData.week_number} • {selectedDay.weekData.phase}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.modalBtn}
                  onPress={() => {
                    setDayModalVisible(false);
                    // Navigate to full detail
                    router.push({ pathname: '/workout-detail', params: { session: JSON.stringify(selectedDay), weekId: selectedDay.weekData?.id, sessionIndex: '0' } });
                  }}
                >
                  <Text style={styles.modalBtnText}>VEDI DETTAGLI</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

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
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  pageSubtitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800' },
  viewToggle: { padding: SPACING.sm, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.md },
  
  // Calendar styles
  calendarContainer: { marginHorizontal: SPACING.xl, marginTop: SPACING.lg },
  calendarMonth: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.md },
  calendarHeader: { flexDirection: 'row', marginBottom: SPACING.sm },
  calendarDayHeader: { flex: 1, textAlign: 'center', fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDay: {
    width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: BORDER_RADIUS.sm, marginBottom: 4,
  },
  calendarDayEmpty: { backgroundColor: 'transparent' },
  calendarDayToday: { borderWidth: 2, borderColor: COLORS.lime },
  calendarDayNum: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '600' },
  calendarDayNumToday: { color: COLORS.lime, fontWeight: '800' },
  calendarDayCompleted: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  calendarDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  
  // Legend
  legendContainer: { marginTop: SPACING.xl, padding: SPACING.lg, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg },
  legendTitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.sm },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, textTransform: 'capitalize' },

  // Week Navigator
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
  recoveryBadge: { backgroundColor: 'rgba(249, 115, 22, 0.2)', borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2, marginTop: 4 },
  recoveryText: { fontSize: FONT_SIZES.xs, color: COLORS.orange, fontWeight: '700' },
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

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  modalDate: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  modalTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'flex-start', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md },
  modalTypeDot: { width: 10, height: 10, borderRadius: 5 },
  modalTypeText: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  modalSessionTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800', marginBottom: SPACING.sm },
  modalDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.lg },
  modalStats: { flexDirection: 'row', gap: SPACING.xl, marginBottom: SPACING.lg },
  modalStat: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  modalStatValue: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700' },
  modalWeekInfo: { backgroundColor: COLORS.cardBorder, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  modalWeekLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center' },
  modalBtn: { backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, alignItems: 'center' },
  modalBtnText: { fontSize: FONT_SIZES.md, color: COLORS.limeDark, fontWeight: '700' },
});
