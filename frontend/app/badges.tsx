import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';
import { api } from '../src/api';

const SCREEN_WIDTH = Dimensions.get('window').width;

const CAT_COLORS: Record<string, string> = {
  distance: '#3b82f6',
  consistency: '#22c55e',
  improvement: '#f97316',
  training: '#a855f7',
  half_marathon: '#ef4444',
  science: '#06b6d4',
  speed: '#eab308',
  fun: '#ec4899',
};

export default function BadgesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const result = await api.getBadges();
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Errore nel caricamento</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryText}>RIPROVA</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { categories, total, unlocked } = data;
  const catOrder = ['distance', 'consistency', 'improvement', 'training', 'half_marathon', 'science', 'speed', 'fun'];

  // Extract Passerotto badge from any category
  let passerottoBadge: any = null;
  if (categories) {
    for (const catKey of Object.keys(categories)) {
      const cat = categories[catKey];
      if (cat?.badges) {
        const found = cat.badges.find((b: any) => b.id === 'passerotto');
        if (found) {
          passerottoBadge = found;
          // Remove from normal list so it doesn't appear twice
          cat.badges = cat.badges.filter((b: any) => b.id !== 'passerotto');
        }
      }
    }
  }

  const formatProgress = (badge: any) => {
    if (badge.unlocked) return null;
    const { progress, target, cat } = badge;

    // Distance badges: show km
    if (cat === 'distance') {
      return `${Math.round(progress)} / ${target} km`;
    }
    // Speed badges: show time in seconds
    if (cat === 'speed' && target > 1) {
      if (progress > 0 && progress < 9999) {
        const pMin = Math.floor(progress / 60);
        const pSec = progress % 60;
        const tMin = Math.floor(target / 60);
        const tSec = target % 60;
        return `${pMin}:${pSec.toString().padStart(2, '0')} / ${tMin}:${tSec.toString().padStart(2, '0')}`;
      }
      return `— / ${Math.floor(target / 60)}:${(target % 60).toString().padStart(2, '0')}`;
    }
    // VDOT badges
    if (badge.id === 'vdot_50') {
      return `VDOT ${progress || 0} / ${target}`;
    }
    if (badge.id.startsWith('vdot_plus')) {
      return `+${progress} / +${target}`;
    }
    // Count badges
    if (target > 1) {
      return `${progress} / ${target}`;
    }
    return null;
  };

  const getProgressPct = (badge: any) => {
    if (badge.unlocked) return 100;
    const { progress, target, cat } = badge;
    if (target <= 0) return 0;

    // Speed: lower is better (time in seconds)
    if (cat === 'speed' && target > 1) {
      if (progress <= 0 || progress >= 9999) return 0;
      // Progress is current time, target is time to beat
      // Closer to target = better
      const ratio = target / progress;
      return Math.min(99, Math.max(0, Math.round(ratio * 100)));
    }

    return Math.min(99, Math.max(0, Math.round((progress / target) * 100)));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>BADGE E TROFEI</Text>
            <Text style={styles.subtitle}>La tua collezione di traguardi</Text>
          </View>
        </View>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryCircle}>
            <Text style={styles.summaryCount}>{unlocked}</Text>
            <Text style={styles.summaryTotal}>/ {total}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: SPACING.lg }}>
            <Text style={styles.summaryLabel}>Badge sbloccati</Text>
            <View style={styles.summaryBar}>
              <View style={[styles.summaryBarFill, { width: `${Math.round((unlocked / total) * 100)}%` }]} />
            </View>
            <Text style={styles.summaryPct}>{Math.round((unlocked / total) * 100)}% completato</Text>
          </View>
        </View>

        {/* === PASSEROTTO — Badge Leggendario === */}
        {passerottoBadge && (() => {
          const isUnlocked = passerottoBadge.unlocked;
          const progress = passerottoBadge.progress || 0;
          const target = passerottoBadge.target || 2;
          const pct = isUnlocked ? 100 : Math.round((progress / target) * 100);

          // Determine sub-conditions text
          // progress field: 0 = none, 1 = one of two, 2 = both
          const conditionLines = [
            { label: '5K sotto i 20 minuti', done: progress >= 1 },
            { label: '10K sotto i 4:15/km', done: progress >= 2 },
          ];

          return (
            <View style={{
              marginBottom: SPACING.xl,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: isUnlocked ? '#FFD700' : '#FFD70040',
              backgroundColor: isUnlocked ? '#FFD70008' : COLORS.card,
              padding: SPACING.lg,
              shadowColor: isUnlocked ? '#FFD700' : '#000',
              shadowOpacity: isUnlocked ? 0.4 : 0.2,
              shadowRadius: isUnlocked ? 20 : 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: isUnlocked ? 12 : 4,
            }}>
              {/* Top label */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
                <View style={{
                  backgroundColor: '#FFD70020',
                  paddingHorizontal: 10, paddingVertical: 3,
                  borderRadius: 12, borderWidth: 1, borderColor: '#FFD70050',
                }}>
                  <Text style={{ fontSize: 9, color: '#FFD700', fontWeight: '900', letterSpacing: 1.5 }}>
                    BADGE LEGGENDARIO
                  </Text>
                </View>
              </View>

              {/* Main content */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* Big icon */}
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: isUnlocked ? '#FFD70025' : COLORS.bg,
                  borderWidth: 2,
                  borderColor: isUnlocked ? '#FFD700' : '#FFD70030',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: SPACING.lg,
                }}>
                  <Text style={{ fontSize: 36 }}>{isUnlocked ? '🐦' : '🔒'}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 20, fontWeight: '900', color: isUnlocked ? '#FFD700' : COLORS.text,
                    letterSpacing: 0.5, marginBottom: 4,
                  }}>
                    PASSEROTTO
                  </Text>
                  <Text style={{
                    fontSize: 11, color: COLORS.textSecondary, lineHeight: 16, marginBottom: SPACING.sm,
                  }}>
                    {isUnlocked
                      ? 'Hai dimostrato di essere un vero runner. Questo badge è per pochi.'
                      : 'Il badge più ambito. Raggiungi entrambi i traguardi per sbloccarlo.'}
                  </Text>

                  {/* Conditions checklist */}
                  {conditionLines.map((cond, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                      <Ionicons
                        name={cond.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={cond.done ? '#22c55e' : '#555'}
                      />
                      <Text style={{
                        fontSize: 11, marginLeft: 6,
                        color: cond.done ? '#22c55e' : COLORS.textMuted,
                        fontWeight: cond.done ? '700' : '400',
                        textDecorationLine: cond.done ? 'line-through' : 'none',
                      }}>
                        {cond.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Progress bar */}
              {!isUnlocked && (
                <View style={{ marginTop: SPACING.md }}>
                  <View style={{
                    height: 6, borderRadius: 3, backgroundColor: COLORS.bg,
                    overflow: 'hidden',
                  }}>
                    <View style={{
                      height: 6, borderRadius: 3, width: `${pct}%`,
                      backgroundColor: '#FFD700',
                    }} />
                  </View>
                  <Text style={{
                    fontSize: 9, color: '#FFD700', fontWeight: '700',
                    textAlign: 'right', marginTop: 3,
                  }}>
                    {progress}/{target} condizioni
                  </Text>
                </View>
              )}

              {/* Unlocked celebration */}
              {isUnlocked && (
                <View style={{
                  marginTop: SPACING.md, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#FFD70015', borderRadius: 8, padding: SPACING.sm,
                }}>
                  <Text style={{ fontSize: 16 }}>🏆</Text>
                  <Text style={{
                    fontSize: 12, color: '#FFD700', fontWeight: '800',
                    marginLeft: SPACING.sm, letterSpacing: 0.5,
                  }}>
                    SBLOCCATO — Sei un Passerotto!
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Categories */}
        {catOrder.map(catKey => {
          const cat = categories[catKey];
          if (!cat) return null;
          const badges = cat.badges || [];
          const catUnlocked = badges.filter((b: any) => b.unlocked).length;
          const catColor = CAT_COLORS[catKey] || COLORS.lime;
          const isExpanded = expandedCat === catKey || expandedCat === null;

          return (
            <View key={catKey} style={styles.catSection}>
              <TouchableOpacity
                style={styles.catHeader}
                onPress={() => setExpandedCat(expandedCat === catKey ? null : catKey)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.catTitle}>{cat.label}</Text>
                  <Text style={[styles.catCount, { color: catColor }]}>
                    {catUnlocked} / {badges.length} sbloccati
                  </Text>
                </View>
                <View style={[styles.catCountBadge, { backgroundColor: catColor + '20' }]}>
                  <Text style={[styles.catCountText, { color: catColor }]}>{catUnlocked}/{badges.length}</Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={COLORS.textMuted}
                  style={{ marginLeft: SPACING.sm }}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.badgeGrid}>
                  {badges.map((badge: any) => {
                    const progressStr = formatProgress(badge);
                    const pct = getProgressPct(badge);

                    return (
                      <View
                        key={badge.id}
                        style={[
                          styles.badgeCard,
                          badge.unlocked && { borderColor: catColor + '60', backgroundColor: catColor + '08' },
                        ]}
                      >
                        {/* Icon */}
                        <View style={[
                          styles.badgeIcon,
                          { backgroundColor: badge.unlocked ? catColor + '20' : COLORS.bg },
                          !badge.unlocked && { opacity: 0.4 },
                        ]}>
                          <Text style={{ fontSize: 24 }}>{badge.icon}</Text>
                        </View>

                        {/* Name */}
                        <Text
                          style={[
                            styles.badgeName,
                            !badge.unlocked && { color: COLORS.textMuted },
                          ]}
                          numberOfLines={2}
                        >
                          {badge.name}
                        </Text>

                        {/* Description */}
                        <Text style={styles.badgeDesc} numberOfLines={2}>{badge.desc}</Text>

                        {/* Status */}
                        {badge.unlocked ? (
                          <View style={[styles.unlockedBadge, { backgroundColor: catColor + '20' }]}>
                            <Ionicons name="checkmark-circle" size={12} color={catColor} />
                            <Text style={[styles.unlockedText, { color: catColor }]}>SBLOCCATO</Text>
                          </View>
                        ) : (
                          <View style={{ width: '100%', marginTop: SPACING.xs }}>
                            {progressStr && (
                              <Text style={styles.progressText}>{progressStr}</Text>
                            )}
                            <View style={styles.progressBarBg}>
                              <View style={[styles.progressBarFill, {
                                width: `${pct}%`,
                                backgroundColor: pct > 0 ? catColor + '80' : 'transparent',
                              }]} />
                            </View>
                          </View>
                        )}

                        {/* Lock overlay */}
                        {!badge.unlocked && (
                          <View style={styles.lockIcon}>
                            <Ionicons name="lock-closed" size={10} color={COLORS.textMuted} />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_WIDTH = (SCREEN_WIDTH - SPACING.lg * 2 - SPACING.sm) / 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: SPACING.lg },
  errorText: { color: COLORS.textMuted, fontSize: FONT_SIZES.body, marginBottom: SPACING.md },
  retryBtn: { backgroundColor: COLORS.lime + '20', paddingHorizontal: 20, paddingVertical: 10, borderRadius: BORDER_RADIUS.md },
  retryText: { color: COLORS.lime, fontWeight: '800', fontSize: FONT_SIZES.sm },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text, letterSpacing: 1 },
  subtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: 2 },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  summaryCircle: {
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 3, borderColor: COLORS.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryCount: { fontSize: 24, fontWeight: '900', color: COLORS.lime },
  summaryTotal: { fontSize: 10, color: COLORS.textMuted, marginTop: -2 },
  summaryLabel: { fontSize: FONT_SIZES.body, color: COLORS.text, fontWeight: '700' },
  summaryBar: {
    height: 6, backgroundColor: COLORS.bg, borderRadius: 3,
    marginTop: SPACING.sm, overflow: 'hidden',
  },
  summaryBarFill: { height: 6, backgroundColor: COLORS.lime, borderRadius: 3 },
  summaryPct: { fontSize: 10, color: COLORS.textMuted, marginTop: 4 },

  catSection: { marginBottom: SPACING.lg },
  catHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, paddingHorizontal: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  catTitle: { fontSize: FONT_SIZES.body, fontWeight: '800', color: COLORS.text },
  catCount: { fontSize: FONT_SIZES.xs, fontWeight: '700', marginTop: 2 },
  catCountBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  catCountText: { fontSize: 11, fontWeight: '900' },

  badgeGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SPACING.sm, marginTop: SPACING.sm,
  },
  badgeCard: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    position: 'relative',
  },
  badgeIcon: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  badgeName: {
    fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.text,
    textAlign: 'center', marginBottom: 4,
  },
  badgeDesc: {
    fontSize: 9, color: COLORS.textMuted, textAlign: 'center',
    marginBottom: SPACING.sm, lineHeight: 13,
  },
  unlockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  unlockedText: { fontSize: 9, fontWeight: '900' },
  progressText: { fontSize: 9, color: COLORS.textMuted, textAlign: 'center', marginBottom: 4 },
  progressBarBg: {
    height: 4, backgroundColor: COLORS.bg, borderRadius: 2,
    overflow: 'hidden', width: '100%',
  },
  progressBarFill: { height: 4, borderRadius: 2 },
  lockIcon: {
    position: 'absolute', top: 6, right: 6,
  },
});
