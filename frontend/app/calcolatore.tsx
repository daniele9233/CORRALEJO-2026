import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';

export default function CalcolatoreScreen() {
  // PB Input
  const [pbDistance, setPbDistance] = useState('6');
  const [pbMinutes, setPbMinutes] = useState('29');
  const [pbSeconds, setPbSeconds] = useState('00');
  const [predictions, setPredictions] = useState<any>(null);
  const [splits, setSplits] = useState<any[]>([]);

  // Converter
  const [paceMin, setPaceMin] = useState('4');
  const [paceSec, setPaceSec] = useState('45');
  const [speedKmh, setSpeedKmh] = useState('12.63');
  const [converterMode, setConverterMode] = useState<'pace' | 'speed'>('pace');

  // Calculate race predictions using Riegel formula
  const calculatePredictions = () => {
    const dist = parseFloat(pbDistance);
    const mins = parseInt(pbMinutes) || 0;
    const secs = parseInt(pbSeconds) || 0;
    const totalMins = mins + secs / 60;

    if (dist <= 0 || totalMins <= 0) return;

    const predictions: any = {};
    const distances = [
      { name: '5km', km: 5 },
      { name: '10km', km: 10 },
      { name: '15km', km: 15 },
      { name: '21.1km', km: 21.1 },
      { name: '42.2km', km: 42.195 },
    ];

    distances.forEach(({ name, km }) => {
      // Riegel formula: T2 = T1 × (D2/D1)^1.06
      const predTime = totalMins * Math.pow(km / dist, 1.06);
      const predPaceSecs = (predTime * 60) / km;
      const paceMin = Math.floor(predPaceSecs / 60);
      const paceSec = Math.round(predPaceSecs % 60);

      const hours = Math.floor(predTime / 60);
      const minutes = Math.floor(predTime % 60);
      const seconds = Math.round((predTime % 1) * 60);

      predictions[name] = {
        time: hours > 0 
          ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          : `${minutes}:${String(seconds).padStart(2, '0')}`,
        pace: `${paceMin}:${String(paceSec).padStart(2, '0')}`,
        totalMins: predTime,
      };
    });

    setPredictions(predictions);

    // Generate half marathon splits with negative split strategy
    const hmPred = predictions['21.1km'];
    if (hmPred) {
      const targetPaceSecs = (hmPred.totalMins * 60) / 21.1;
      // Negative split: first half 2% slower, second half 2% faster
      const firstHalfPace = targetPaceSecs * 1.02;
      const secondHalfPace = targetPaceSecs * 0.98;

      const newSplits: any[] = [];
      let cumulativeTime = 0;

      for (let km = 1; km <= 21; km++) {
        const kmPace = km <= 10 ? firstHalfPace : secondHalfPace;
        // Add some natural variation
        const variation = (Math.random() - 0.5) * 4; // ±2 sec variation
        const actualPace = kmPace + variation;
        cumulativeTime += actualPace;

        const paceMin = Math.floor(actualPace / 60);
        const paceSec = Math.round(actualPace % 60);
        const cumMins = Math.floor(cumulativeTime / 60);
        const cumSecs = Math.round(cumulativeTime % 60);

        newSplits.push({
          km,
          pace: `${paceMin}:${String(paceSec).padStart(2, '0')}`,
          cumulative: `${cumMins}:${String(cumSecs).padStart(2, '0')}`,
          isFirstHalf: km <= 10,
        });
      }

      // Add final 0.1km
      const finalPace = secondHalfPace * 0.1;
      cumulativeTime += finalPace;
      const cumMins = Math.floor(cumulativeTime / 60);
      const cumSecs = Math.round(cumulativeTime % 60);
      newSplits.push({
        km: 21.1,
        pace: '-',
        cumulative: `${Math.floor(cumMins / 60)}:${String(cumMins % 60).padStart(2, '0')}:${String(cumSecs).padStart(2, '0')}`,
        isFinish: true,
      });

      setSplits(newSplits);
    }
  };

  // Converter functions
  const convertPaceToSpeed = () => {
    const mins = parseInt(paceMin) || 0;
    const secs = parseInt(paceSec) || 0;
    const totalMins = mins + secs / 60;
    if (totalMins > 0) {
      const speed = 60 / totalMins;
      setSpeedKmh(speed.toFixed(2));
    }
  };

  const convertSpeedToPace = () => {
    const speed = parseFloat(speedKmh) || 0;
    if (speed > 0) {
      const paceInMins = 60 / speed;
      const mins = Math.floor(paceInMins);
      const secs = Math.round((paceInMins - mins) * 60);
      setPaceMin(String(mins));
      setPaceSec(String(secs).padStart(2, '0'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.pageTitle}>CALCOLATORE</Text>
            <Text style={styles.pageSubtitle}>PACE & RACE PREDICTOR</Text>
          </View>

          {/* Race Predictor Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calculator" size={18} color={COLORS.lime} />
              <Text style={styles.sectionTitle}>INSERISCI UN PB RECENTE</Text>
            </View>

            <View style={styles.inputCard}>
              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DISTANZA (km)</Text>
                  <TextInput
                    style={styles.input}
                    value={pbDistance}
                    onChangeText={setPbDistance}
                    keyboardType="decimal-pad"
                    placeholder="6"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>MINUTI</Text>
                  <TextInput
                    style={styles.input}
                    value={pbMinutes}
                    onChangeText={setPbMinutes}
                    keyboardType="number-pad"
                    placeholder="29"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>SECONDI</Text>
                  <TextInput
                    style={styles.input}
                    value={pbSeconds}
                    onChangeText={setPbSeconds}
                    keyboardType="number-pad"
                    placeholder="00"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.calculateBtn} onPress={calculatePredictions}>
                <Ionicons name="flash" size={18} color={COLORS.bg} />
                <Text style={styles.calculateBtnText}>CALCOLA PREVISIONI</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Predictions Results */}
          {predictions && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="podium" size={18} color={COLORS.lime} />
                <Text style={styles.sectionTitle}>PREVISIONI GARA</Text>
              </View>

              <View style={styles.predictionsGrid}>
                {Object.entries(predictions).map(([dist, pred]: [string, any]) => (
                  <View 
                    key={dist} 
                    style={[
                      styles.predictionCard,
                      dist === '21.1km' && styles.predictionCardHighlight
                    ]}
                  >
                    <Text style={styles.predDist}>{dist}</Text>
                    <Text style={[styles.predTime, dist === '21.1km' && { color: COLORS.lime }]}>
                      {pred.time}
                    </Text>
                    <Text style={styles.predPace}>{pred.pace}/km</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Negative Split Strategy */}
          {splits.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="trending-up" size={18} color={COLORS.lime} />
                <Text style={styles.sectionTitle}>NEGATIVE SPLIT STRATEGY</Text>
              </View>

              <View style={styles.splitInfo}>
                <Text style={styles.splitInfoText}>
                  Prima metà (km 1-10): leggermente più lento (+2%)
                </Text>
                <Text style={styles.splitInfoText}>
                  Seconda metà (km 11-21): accelera (-2%)
                </Text>
              </View>

              <View style={styles.splitsCard}>
                <View style={styles.splitsHeader}>
                  <Text style={styles.splitsHeaderText}>KM</Text>
                  <Text style={styles.splitsHeaderText}>PASSO</Text>
                  <Text style={styles.splitsHeaderText}>TEMPO</Text>
                </View>

                {splits.map((split, idx) => (
                  <View 
                    key={idx} 
                    style={[
                      styles.splitRow,
                      split.isFirstHalf && styles.splitRowFirst,
                      !split.isFirstHalf && !split.isFinish && styles.splitRowSecond,
                      split.isFinish && styles.splitRowFinish,
                    ]}
                  >
                    <Text style={[styles.splitText, split.isFinish && styles.splitTextFinish]}>
                      {split.km}
                    </Text>
                    <Text style={[styles.splitText, split.isFinish && styles.splitTextFinish]}>
                      {split.pace}
                    </Text>
                    <Text style={[styles.splitText, split.isFinish && styles.splitTextFinish]}>
                      {split.cumulative}
                    </Text>
                  </View>
                ))}

                <View style={styles.splitLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.blue }]} />
                    <Text style={styles.legendText}>Prima metà (conserva)</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.lime }]} />
                    <Text style={styles.legendText}>Seconda metà (spingi)</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Pace/Speed Converter */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="swap-horizontal" size={18} color={COLORS.lime} />
              <Text style={styles.sectionTitle}>CONVERTITORE PASSO ↔ VELOCITÀ</Text>
            </View>

            <View style={styles.converterCard}>
              {/* Pace Input */}
              <View style={styles.converterRow}>
                <Text style={styles.converterLabel}>PASSO</Text>
                <View style={styles.converterInputs}>
                  <TextInput
                    style={styles.converterInput}
                    value={paceMin}
                    onChangeText={setPaceMin}
                    keyboardType="number-pad"
                    placeholder="4"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.converterSeparator}>:</Text>
                  <TextInput
                    style={styles.converterInput}
                    value={paceSec}
                    onChangeText={setPaceSec}
                    keyboardType="number-pad"
                    placeholder="45"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.converterUnit}>/km</Text>
                </View>
                <TouchableOpacity style={styles.convertBtn} onPress={convertPaceToSpeed}>
                  <Ionicons name="arrow-down" size={20} color={COLORS.lime} />
                </TouchableOpacity>
              </View>

              <View style={styles.converterDivider} />

              {/* Speed Input */}
              <View style={styles.converterRow}>
                <Text style={styles.converterLabel}>VELOCITÀ</Text>
                <View style={styles.converterInputs}>
                  <TextInput
                    style={[styles.converterInput, { width: 80 }]}
                    value={speedKmh}
                    onChangeText={setSpeedKmh}
                    keyboardType="decimal-pad"
                    placeholder="12.63"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.converterUnit}>km/h</Text>
                </View>
                <TouchableOpacity style={styles.convertBtn} onPress={convertSpeedToPace}>
                  <Ionicons name="arrow-up" size={20} color={COLORS.lime} />
                </TouchableOpacity>
              </View>

              {/* Quick Reference */}
              <View style={styles.quickRef}>
                <Text style={styles.quickRefTitle}>RIFERIMENTI RAPIDI</Text>
                <View style={styles.quickRefGrid}>
                  {[
                    { pace: '4:00', speed: '15.00' },
                    { pace: '4:15', speed: '14.12' },
                    { pace: '4:30', speed: '13.33' },
                    { pace: '4:45', speed: '12.63' },
                    { pace: '5:00', speed: '12.00' },
                    { pace: '5:30', speed: '10.91' },
                    { pace: '6:00', speed: '10.00' },
                    { pace: '6:30', speed: '9.23' },
                  ].map((ref, idx) => (
                    <View key={idx} style={styles.quickRefItem}>
                      <Text style={styles.quickRefPace}>{ref.pace}/km</Text>
                      <Text style={styles.quickRefSpeed}>{ref.speed} km/h</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  pageTitle: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2 },
  pageSubtitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800' },

  section: { marginTop: SPACING.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 2 },

  inputCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  inputRow: { flexDirection: 'row', gap: SPACING.md },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4, letterSpacing: 1 },
  input: {
    backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, fontSize: FONT_SIZES.lg, color: COLORS.text,
    fontWeight: '700', textAlign: 'center', borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  calculateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginTop: SPACING.lg,
  },
  calculateBtnText: { fontSize: FONT_SIZES.md, color: COLORS.bg, fontWeight: '700' },

  predictionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginHorizontal: SPACING.xl },
  predictionCard: {
    width: '31%', flexGrow: 1, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center',
  },
  predictionCardHighlight: { borderColor: 'rgba(190, 242, 100, 0.3)', backgroundColor: 'rgba(190, 242, 100, 0.05)' },
  predDist: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700' },
  predTime: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '900', marginTop: 4 },
  predPace: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },

  splitInfo: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  splitInfoText: { fontSize: FONT_SIZES.sm, color: COLORS.blue, lineHeight: 20 },

  splitsCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  splitsHeader: {
    flexDirection: 'row', paddingBottom: SPACING.sm, marginBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  splitsHeaderText: { flex: 1, fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', textAlign: 'center' },
  splitRow: { flexDirection: 'row', paddingVertical: 6, borderRadius: 4, marginBottom: 2 },
  splitRowFirst: { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
  splitRowSecond: { backgroundColor: 'rgba(190, 242, 100, 0.1)' },
  splitRowFinish: { backgroundColor: 'rgba(249, 115, 22, 0.2)', marginTop: SPACING.sm },
  splitText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, textAlign: 'center' },
  splitTextFinish: { fontWeight: '700', color: COLORS.orange },
  splitLegend: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.xl, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },

  converterCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  converterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  converterLabel: { width: 70, fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700' },
  converterInputs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  converterInput: {
    width: 50, backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, fontSize: FONT_SIZES.lg, color: COLORS.text,
    fontWeight: '700', textAlign: 'center', borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  converterSeparator: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '700' },
  converterUnit: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginLeft: 4 },
  convertBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(190, 242, 100, 0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  converterDivider: { height: 1, backgroundColor: COLORS.cardBorder, marginVertical: SPACING.md },

  quickRef: { marginTop: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  quickRefTitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.sm, textAlign: 'center' },
  quickRefGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  quickRefItem: { width: '23%', flexGrow: 1, alignItems: 'center', padding: SPACING.sm, backgroundColor: COLORS.bg, borderRadius: BORDER_RADIUS.sm },
  quickRefPace: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700' },
  quickRefSpeed: { fontSize: 10, color: COLORS.textMuted },
});
