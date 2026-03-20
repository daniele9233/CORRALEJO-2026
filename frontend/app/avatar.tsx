import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';
import { api } from '../src/api';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Avatar body parts as styled components (SVG-like)
const TIER_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  beginner: { primary: '#6b7280', secondary: '#9ca3af', accent: '#d1d5db' },
  intermediate: { primary: '#3b82f6', secondary: '#60a5fa', accent: '#93c5fd' },
  advanced: { primary: '#f97316', secondary: '#fb923c', accent: '#fdba74' },
  elite: { primary: '#eab308', secondary: '#facc15', accent: '#fde047' },
};

const TIER_LABELS: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
  elite: 'Elite',
};

const PHASE_EMOJIS: Record<string, string> = {
  recovery: '🔄',
  development: '📈',
  specific: '🎯',
  peak: '🏆',
};

export default function AvatarScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [currentView, setCurrentView] = useState(0); // 0=front, 1=stats, 2=equipment, 3=museum
  const auraAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const views = ['Aspetto', 'Statistiche', 'Equipaggiamento', 'Museo'];

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => {
    // Aura pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(auraAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(auraAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();

    // Breathing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Pan gesture for view rotation
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 20,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 50) {
          setCurrentView(v => (v - 1 + views.length) % views.length);
        } else if (gs.dx < -50) {
          setCurrentView(v => (v + 1) % views.length);
        }
      },
    })
  ).current;

  const loadData = async () => {
    try {
      setLoading(true);
      const avatarData = await api.getAvatar();
      setData(avatarData);
    } catch (e) {
      console.error('Avatar load error:', e);
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
          <Ionicons name="alert-circle" size={48} color={COLORS.textMuted} />
          <Text style={styles.errorText}>Errore nel caricamento</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryText}>RIPROVA</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const tierColors = TIER_COLORS[data.equipment_tier] || TIER_COLORS.beginner;
  const auraColor = data.aura_color || '#666';

  const auraOpacity = auraAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });
  const auraScale = auraAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const renderAvatarBody = () => {
    const bodyColor = data.phase === 'recovery' ? '#8b7355' : data.phase === 'development' ? '#c4956a' : '#d4a574';
    const postureTransform = data.posture === 'fatigued' ? [{ rotate: '3deg' }] : data.posture === 'proud' ? [{ rotate: '-1deg' }] : [];

    return (
      <Animated.View style={[styles.avatarContainer, { transform: [{ scale: scaleAnim }] }]}>
        {/* Aura glow */}
        {data.aura !== 'off' && (
          <Animated.View style={[styles.auraRing, {
            borderColor: auraColor,
            opacity: auraOpacity,
            transform: [{ scale: auraScale }],
          }]} />
        )}

        {/* Avatar body */}
        <View style={[styles.avatarBody, { transform: postureTransform }]}>
          {/* Head */}
          <View style={[styles.head, { backgroundColor: bodyColor }]}>
            <View style={styles.hair} />
            {/* Eyes */}
            <View style={styles.eyeRow}>
              <View style={styles.eye}><View style={styles.pupil} /></View>
              <View style={styles.eye}><View style={styles.pupil} /></View>
            </View>
            {/* Mouth - expression based on posture */}
            <View style={[styles.mouth, {
              borderBottomWidth: data.posture === 'proud' ? 2 : 0,
              borderTopWidth: data.posture === 'fatigued' ? 2 : 0,
              borderColor: '#000',
              width: data.posture === 'proud' ? 14 : 10,
            }]} />
          </View>

          {/* Neck */}
          <View style={[styles.neck, { backgroundColor: bodyColor }]} />

          {/* Torso with outfit */}
          <View style={[styles.torso, { backgroundColor: tierColors.primary }]}>
            {/* Outfit details */}
            {data.equipment_tier === 'elite' && (
              <View style={styles.eliteStripe}>
                <View style={[styles.stripe, { backgroundColor: tierColors.accent }]} />
                <View style={[styles.stripe, { backgroundColor: tierColors.accent, marginTop: 2 }]} />
              </View>
            )}
            {data.equipment_tier === 'advanced' && (
              <View style={[styles.numberBadge, { backgroundColor: tierColors.accent }]}>
                <Text style={{ fontSize: 8, fontWeight: '900', color: '#000' }}>V{Math.round(data.vdot)}</Text>
              </View>
            )}
            {data.equipment_tier === 'beginner' && (
              <Text style={{ fontSize: 8, color: '#fff4', position: 'absolute', top: 12, alignSelf: 'center' }}>COTTON</Text>
            )}
          </View>

          {/* Arms */}
          <View style={[styles.leftArm, { backgroundColor: bodyColor }]} />
          <View style={[styles.rightArm, { backgroundColor: bodyColor }]} />

          {/* Shorts */}
          <View style={[styles.shorts, {
            backgroundColor: data.equipment_tier === 'elite' || data.equipment_tier === 'advanced'
              ? '#1a1a2e' : tierColors.secondary + '80',
          }]}>
            {(data.equipment_tier === 'elite' || data.equipment_tier === 'advanced') && (
              <View style={styles.splitLine} />
            )}
          </View>

          {/* Legs */}
          <View style={styles.legsContainer}>
            <View style={[styles.leg, { backgroundColor: bodyColor }]}>
              {/* Muscle definition for developed phase */}
              {data.phase !== 'recovery' && (
                <View style={[styles.muscle, { opacity: data.phase === 'peak' ? 0.4 : 0.2 }]} />
              )}
            </View>
            <View style={[styles.leg, { backgroundColor: bodyColor }]}>
              {data.phase !== 'recovery' && (
                <View style={[styles.muscle, { opacity: data.phase === 'peak' ? 0.4 : 0.2 }]} />
              )}
            </View>
          </View>

          {/* Shoes */}
          <View style={styles.shoesContainer}>
            <View style={[styles.shoe, { backgroundColor: tierColors.primary }]}>
              {data.equipment_tier === 'elite' && (
                <View style={[styles.carbonPlate, { backgroundColor: tierColors.accent }]} />
              )}
            </View>
            <View style={[styles.shoe, { backgroundColor: tierColors.primary }]}>
              {data.equipment_tier === 'elite' && (
                <View style={[styles.carbonPlate, { backgroundColor: tierColors.accent }]} />
              )}
            </View>
          </View>

          {/* Accessories */}
          {(data.equipment_tier === 'advanced' || data.equipment_tier === 'elite') && (
            <View style={[styles.watch, { backgroundColor: tierColors.accent }]} />
          )}
          {data.equipment_tier === 'elite' && (
            <View style={styles.sunglasses}>
              <View style={[styles.lens, { backgroundColor: '#333' }]} />
              <View style={[styles.lens, { backgroundColor: '#333' }]} />
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  const renderStats = () => (
    <View style={styles.statsPanel}>
      <View style={styles.statRow}>
        <Ionicons name="speedometer" size={20} color={COLORS.lime} />
        <Text style={styles.statLabel}>VDOT</Text>
        <Text style={styles.statValue}>{data.vdot}</Text>
      </View>
      <View style={styles.statRow}>
        <Ionicons name={data.posture_icon} size={20} color={data.posture === 'proud' ? '#22c55e' : data.posture === 'fatigued' ? '#ef4444' : '#f97316'} />
        <Text style={styles.statLabel}>Postura</Text>
        <Text style={styles.statValue}>{data.posture_label}</Text>
      </View>
      <View style={styles.statRow}>
        <Ionicons name="flame" size={20} color={auraColor} />
        <Text style={styles.statLabel}>Aura</Text>
        <Text style={[styles.statValue, { color: auraColor }]}>{data.aura_label}</Text>
      </View>
      <View style={styles.statRow}>
        <Ionicons name="fitness" size={20} color="#f97316" />
        <Text style={styles.statLabel}>Fase</Text>
        <Text style={styles.statValue}>{PHASE_EMOJIS[data.phase]} {data.phase_label}</Text>
      </View>
      <View style={styles.statRow}>
        <Ionicons name="warning" size={20} color={data.injury_risk < 30 ? '#22c55e' : data.injury_risk < 50 ? '#f97316' : '#ef4444'} />
        <Text style={styles.statLabel}>Injury Risk</Text>
        <Text style={[styles.statValue, { color: data.injury_risk < 30 ? '#22c55e' : data.injury_risk < 50 ? '#f97316' : '#ef4444' }]}>
          {data.injury_risk}%
        </Text>
      </View>
      <View style={styles.statRow}>
        <Ionicons name="calendar" size={20} color={COLORS.textMuted} />
        <Text style={styles.statLabel}>Ultima corsa</Text>
        <Text style={styles.statValue}>
          {data.days_since_run === 0 ? 'Oggi' : data.days_since_run === 1 ? 'Ieri' : `${data.days_since_run} giorni fa`}
        </Text>
      </View>
      <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
        <Ionicons name="analytics" size={20} color={COLORS.blue} />
        <Text style={styles.statLabel}>Totale</Text>
        <Text style={styles.statValue}>{data.total_km} km / {data.total_runs} corse</Text>
      </View>
    </View>
  );

  const renderEquipment = () => (
    <View style={styles.equipPanel}>
      <View style={[styles.tierBadge, { backgroundColor: tierColors.primary + '20', borderColor: tierColors.primary }]}>
        <Text style={[styles.tierLabel, { color: tierColors.primary }]}>
          {TIER_LABELS[data.equipment_tier]} — VDOT {data.vdot}
        </Text>
      </View>

      {[
        { icon: data.equipment.shoes_icon, label: 'Scarpe', value: data.equipment.shoes },
        { icon: data.equipment.outfit_icon, label: 'Outfit', value: data.equipment.outfit },
        { icon: data.equipment.accessories_icon, label: 'Accessori', value: data.equipment.accessories },
      ].map((item, i) => (
        <View key={i} style={styles.equipRow}>
          <View style={[styles.equipIcon, { backgroundColor: tierColors.primary + '20' }]}>
            <Ionicons name={item.icon as any} size={22} color={tierColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.equipLabel}>{item.label}</Text>
            <Text style={styles.equipValue}>{item.value}</Text>
          </View>
        </View>
      ))}

      {/* Next tier progress */}
      {data.equipment_tier !== 'elite' && (() => {
        const nextTier = data.equipment_tier === 'beginner' ? 40 : data.equipment_tier === 'intermediate' ? 45 : 50;
        const prevTier = data.equipment_tier === 'beginner' ? 0 : data.equipment_tier === 'intermediate' ? 40 : 45;
        const progress = Math.min(100, Math.max(0, ((data.vdot - prevTier) / (nextTier - prevTier)) * 100));
        const nextLabel = data.equipment_tier === 'beginner' ? 'Intermedio' : data.equipment_tier === 'intermediate' ? 'Avanzato' : 'Elite';

        return (
          <View style={styles.nextTierSection}>
            <Text style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
              Prossimo livello: <Text style={{ color: COLORS.text, fontWeight: '700' }}>{nextLabel} (VDOT {nextTier})</Text>
            </Text>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: tierColors.primary }]} />
            </View>
            <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
              {Math.round(progress)}% — mancano {(nextTier - data.vdot).toFixed(1)} punti VDOT
            </Text>
          </View>
        );
      })()}
    </View>
  );

  const renderMuseum = () => (
    <View style={styles.museumPanel}>
      {data.museum && data.museum.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACING.sm }}>
          {data.museum.map((snap: any, i: number) => {
            const tc = TIER_COLORS[snap.tier] || TIER_COLORS.beginner;
            const isLatest = i === data.museum.length - 1;
            return (
              <View key={snap.month} style={[styles.museumCard, {
                borderColor: isLatest ? '#f97316' : COLORS.cardBorder,
                borderWidth: isLatest ? 2 : 1,
              }]}>
                {/* Mini avatar */}
                <View style={[styles.miniAvatar, { borderColor: tc.primary }]}>
                  <View style={[styles.miniHead, { backgroundColor: '#d4a574' }]} />
                  <View style={[styles.miniTorso, { backgroundColor: tc.primary }]} />
                  <View style={styles.miniLegs}>
                    <View style={[styles.miniLeg, { backgroundColor: '#d4a574' }]} />
                    <View style={[styles.miniLeg, { backgroundColor: '#d4a574' }]} />
                  </View>
                  <View style={styles.miniShoes}>
                    <View style={[styles.miniShoe, { backgroundColor: tc.primary }]} />
                    <View style={[styles.miniShoe, { backgroundColor: tc.primary }]} />
                  </View>
                </View>

                <Text style={[styles.museumLabel, { color: isLatest ? '#f97316' : COLORS.text }]}>
                  {snap.label}
                </Text>
                <Text style={[styles.museumVdot, { color: tc.primary }]}>
                  VDOT {snap.vdot}
                </Text>
                <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
                  {TIER_LABELS[snap.tier]}
                </Text>
                {isLatest && (
                  <View style={{ backgroundColor: '#f97316', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginTop: 4 }}>
                    <Text style={{ fontSize: 7, color: '#fff', fontWeight: '800' }}>ATTUALE</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={{ alignItems: 'center', padding: SPACING.xl }}>
          <Ionicons name="images-outline" size={48} color={COLORS.textMuted} />
          <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: SPACING.sm, textAlign: 'center' }}>
            Il museo si riempie con il tempo.{'\n'}Ogni mese viene salvata un'istantanea del tuo avatar.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>AVATAR RUNNER</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* View selector tabs */}
        <View style={styles.viewTabs}>
          {views.map((v, i) => (
            <TouchableOpacity
              key={v}
              onPress={() => setCurrentView(i)}
              style={[styles.viewTab, currentView === i && styles.viewTabActive]}
            >
              <Text style={[styles.viewTabText, currentView === i && styles.viewTabTextActive]}>
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Swipe hint */}
        <Text style={styles.swipeHint}>
          Scorri per cambiare vista
        </Text>

        {/* Main content area with pan gesture */}
        <View {...panResponder.panHandlers} style={styles.contentArea}>
          {currentView === 0 && (
            <View style={styles.avatarView}>
              {renderAvatarBody()}

              {/* Tier label below avatar */}
              <View style={[styles.tierChip, { borderColor: tierColors.primary }]}>
                <Text style={[styles.tierChipText, { color: tierColors.primary }]}>
                  {TIER_LABELS[data.equipment_tier]} — VDOT {data.vdot}
                </Text>
              </View>

              {/* Aura status */}
              <View style={[styles.auraChip, { backgroundColor: auraColor + '15', borderColor: auraColor + '40' }]}>
                <View style={[styles.auraDot, { backgroundColor: auraColor }]} />
                <Text style={[styles.auraChipText, { color: auraColor }]}>{data.aura_label}</Text>
              </View>

              {/* Phase info */}
              <View style={styles.phaseInfo}>
                <Text style={{ fontSize: 24 }}>{PHASE_EMOJIS[data.phase]}</Text>
                <Text style={styles.phaseLabel}>{data.phase_label}</Text>
              </View>
            </View>
          )}

          {currentView === 1 && renderStats()}
          {currentView === 2 && renderEquipment()}
          {currentView === 3 && renderMuseum()}
        </View>

        {/* View dots */}
        <View style={styles.dotsContainer}>
          {views.map((_, i) => (
            <View key={i} style={[styles.dot, currentView === i && styles.dotActive]} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: FONT_SIZES.body, color: COLORS.textMuted, marginTop: SPACING.md },
  retryBtn: { marginTop: SPACING.md, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.md },
  retryText: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: '#000' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text, letterSpacing: 1 },

  viewTabs: {
    flexDirection: 'row', marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.md, overflow: 'hidden',
  },
  viewTab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
  },
  viewTabActive: { backgroundColor: COLORS.cardBorder },
  viewTabText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  viewTabTextActive: { color: COLORS.text },

  swipeHint: {
    fontSize: 10, color: COLORS.textMuted + '60', textAlign: 'center',
    marginTop: 4, fontStyle: 'italic',
  },

  contentArea: { minHeight: 450, marginTop: SPACING.md },

  // Avatar
  avatarView: { alignItems: 'center', paddingTop: SPACING.lg },
  avatarContainer: {
    width: 200, height: 300, alignItems: 'center', justifyContent: 'center',
  },
  auraRing: {
    position: 'absolute', width: 220, height: 320, borderRadius: 110,
    borderWidth: 3,
  },
  avatarBody: { alignItems: 'center' },
  head: { width: 40, height: 44, borderRadius: 20, position: 'relative' },
  hair: {
    position: 'absolute', top: -6, left: 2, right: 2, height: 20,
    backgroundColor: '#2d2d2d', borderTopLeftRadius: 18, borderTopRightRadius: 18,
  },
  eyeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 18 },
  eye: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  pupil: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#333', marginTop: 2, marginLeft: 2 },
  mouth: { width: 12, height: 4, borderRadius: 4, marginTop: 4, alignSelf: 'center' },

  neck: { width: 14, height: 8 },
  torso: { width: 56, height: 55, borderRadius: 6, position: 'relative', overflow: 'hidden' },
  eliteStripe: { position: 'absolute', top: 4, left: 4, right: 4 },
  stripe: { height: 2, borderRadius: 1 },
  numberBadge: {
    position: 'absolute', top: 8, alignSelf: 'center',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },

  leftArm: {
    position: 'absolute', left: -10, top: 60, width: 12, height: 45,
    borderRadius: 6, transform: [{ rotate: '15deg' }],
  },
  rightArm: {
    position: 'absolute', right: -10, top: 60, width: 12, height: 45,
    borderRadius: 6, transform: [{ rotate: '-15deg' }],
  },

  shorts: { width: 52, height: 22, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, position: 'relative' },
  splitLine: { position: 'absolute', left: '50%', top: 4, width: 1, height: 14, backgroundColor: '#fff3' },

  legsContainer: { flexDirection: 'row', gap: 8 },
  leg: { width: 16, height: 50, borderRadius: 8, position: 'relative', overflow: 'hidden' },
  muscle: { position: 'absolute', top: 8, left: 2, width: 12, height: 20, borderRadius: 6, backgroundColor: '#fff' },

  shoesContainer: { flexDirection: 'row', gap: 6, marginTop: -2 },
  shoe: { width: 22, height: 12, borderRadius: 4, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, position: 'relative' },
  carbonPlate: { position: 'absolute', bottom: 1, left: 2, right: 2, height: 3, borderRadius: 1 },

  watch: { position: 'absolute', right: -14, top: 82, width: 8, height: 10, borderRadius: 2 },
  sunglasses: {
    position: 'absolute', top: 18, flexDirection: 'row', gap: 2,
    left: '50%', marginLeft: -11,
  },
  lens: { width: 10, height: 6, borderRadius: 3 },

  tierChip: {
    marginTop: SPACING.lg, paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, borderWidth: 2,
  },
  tierChipText: { fontSize: 12, fontWeight: '800' },

  auraChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: SPACING.sm, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1,
  },
  auraDot: { width: 8, height: 8, borderRadius: 4 },
  auraChipText: { fontSize: 11, fontWeight: '700' },

  phaseInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  phaseLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },

  // Stats panel
  statsPanel: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
  },
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder + '40',
  },
  statLabel: { flex: 1, fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  statValue: { fontSize: 14, color: COLORS.text, fontWeight: '800' },

  // Equipment panel
  equipPanel: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
  },
  tierBadge: {
    alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, borderWidth: 2, marginBottom: SPACING.lg,
  },
  tierLabel: { fontSize: 14, fontWeight: '900' },

  equipRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder + '40',
  },
  equipIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  equipLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  equipValue: { fontSize: 14, color: COLORS.text, fontWeight: '700', marginTop: 2 },

  nextTierSection: {
    marginTop: SPACING.lg, padding: SPACING.md,
    backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.md,
  },
  progressBg: {
    height: 8, backgroundColor: COLORS.cardBorder, borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4 },

  // Museum panel
  museumPanel: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
  },
  museumCard: {
    width: 100, alignItems: 'center', padding: SPACING.md,
    backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
  },
  miniAvatar: {
    width: 40, height: 60, alignItems: 'center', borderWidth: 1,
    borderRadius: 8, padding: 4, marginBottom: 6,
  },
  miniHead: { width: 12, height: 12, borderRadius: 6 },
  miniTorso: { width: 18, height: 16, borderRadius: 3, marginTop: 1 },
  miniLegs: { flexDirection: 'row', gap: 2, marginTop: 1 },
  miniLeg: { width: 6, height: 14, borderRadius: 3 },
  miniShoes: { flexDirection: 'row', gap: 2, marginTop: -1 },
  miniShoe: { width: 8, height: 4, borderRadius: 2 },
  museumLabel: { fontSize: 10, fontWeight: '700' },
  museumVdot: { fontSize: 12, fontWeight: '800', marginTop: 2 },

  // Dots
  dotsContainer: {
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    marginVertical: SPACING.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cardBorder },
  dotActive: { backgroundColor: '#f97316', width: 20 },
});
