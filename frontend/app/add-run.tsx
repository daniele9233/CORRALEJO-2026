import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';
import { api } from '../src/api';

const RUN_TYPES = [
  { key: 'easy', label: 'Facile' },
  { key: 'long', label: 'Lungo' },
  { key: 'tempo', label: 'Tempo' },
  { key: 'intervals', label: 'Ripetute' },
  { key: 'progressive', label: 'Progressivo' },
  { key: 'race', label: 'Gara' },
  { key: 'test', label: 'Test' },
];

export default function AddRunScreen() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [distance, setDistance] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [paceMin, setPaceMin] = useState('');
  const [paceSec, setPaceSec] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [runType, setRunType] = useState('easy');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!distance || (!minutes && !paceMin)) {
      Alert.alert('Errore', 'Inserisci almeno distanza e durata o passo');
      return;
    }

    const distKm = parseFloat(distance);
    let durationMin = 0;
    let pace = '';

    if (minutes) {
      durationMin = parseInt(minutes) + (parseInt(seconds || '0') / 60);
      const totalSec = durationMin * 60 / distKm;
      pace = `${Math.floor(totalSec / 60)}:${String(Math.round(totalSec % 60)).padStart(2, '0')}`;
    } else if (paceMin) {
      const paceSecs = parseInt(paceMin) * 60 + parseInt(paceSec || '0');
      pace = `${paceMin}:${String(parseInt(paceSec || '0')).padStart(2, '0')}`;
      durationMin = (paceSecs * distKm) / 60;
    }

    const maxHrVal = maxHr ? parseInt(maxHr) : undefined;
    const avgHrVal = avgHr ? parseInt(avgHr) : undefined;

    setSaving(true);
    try {
      await api.createRun({
        date,
        distance_km: distKm,
        duration_minutes: Math.round(durationMin * 100) / 100,
        avg_pace: pace,
        avg_hr: avgHrVal,
        max_hr: maxHrVal,
        avg_hr_pct: avgHrVal ? Math.round((avgHrVal / 179) * 100) : undefined,
        max_hr_pct: maxHrVal ? Math.round((maxHrVal / 179) * 100) : undefined,
        run_type: runType,
        notes: notes || undefined,
        location: location || undefined,
      });
      router.back();
    } catch (e) {
      Alert.alert('Errore', 'Impossibile salvare la corsa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity testID="close-btn" onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>NUOVA CORSA</Text>
          <TouchableOpacity testID="save-btn" onPress={handleSave} style={styles.saveBtn} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? '...' : 'SALVA'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
          {/* Date */}
          <Text style={styles.label}>DATA</Text>
          <TextInput
            testID="date-input"
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textMuted}
          />

          {/* Distance */}
          <Text style={styles.label}>DISTANZA (KM)</Text>
          <TextInput
            testID="distance-input"
            style={styles.input}
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            placeholder="es. 10.5"
            placeholderTextColor={COLORS.textMuted}
          />

          {/* Duration */}
          <Text style={styles.label}>DURATA</Text>
          <View style={styles.row}>
            <TextInput
              testID="minutes-input"
              style={[styles.input, styles.halfInput]}
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              placeholder="Minuti"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.colon}>:</Text>
            <TextInput
              testID="seconds-input"
              style={[styles.input, styles.halfInput]}
              value={seconds}
              onChangeText={setSeconds}
              keyboardType="number-pad"
              placeholder="Secondi"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          {/* Or Pace */}
          <Text style={styles.orText}>OPPURE INSERISCI PASSO</Text>
          <View style={styles.row}>
            <TextInput
              testID="pace-min-input"
              style={[styles.input, styles.halfInput]}
              value={paceMin}
              onChangeText={setPaceMin}
              keyboardType="number-pad"
              placeholder="Min"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.colon}>:</Text>
            <TextInput
              testID="pace-sec-input"
              style={[styles.input, styles.halfInput]}
              value={paceSec}
              onChangeText={setPaceSec}
              keyboardType="number-pad"
              placeholder="Sec"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.paceUnit}>/km</Text>
          </View>

          {/* Heart Rate */}
          <Text style={styles.label}>FREQUENZA CARDIACA</Text>
          <View style={styles.row}>
            <TextInput
              testID="avg-hr-input"
              style={[styles.input, styles.halfInput]}
              value={avgHr}
              onChangeText={setAvgHr}
              keyboardType="number-pad"
              placeholder="FC Media"
              placeholderTextColor={COLORS.textMuted}
            />
            <TextInput
              testID="max-hr-input"
              style={[styles.input, styles.halfInput]}
              value={maxHr}
              onChangeText={setMaxHr}
              keyboardType="number-pad"
              placeholder="FC Max"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          {/* Run Type */}
          <Text style={styles.label}>TIPO DI CORSA</Text>
          <View style={styles.typeGrid}>
            {RUN_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                testID={`type-${t.key}`}
                style={[styles.typeChip, runType === t.key && styles.typeChipActive]}
                onPress={() => setRunType(t.key)}
              >
                <Text style={[styles.typeChipText, runType === t.key && styles.typeChipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Location */}
          <Text style={styles.label}>LUOGO</Text>
          <TextInput
            testID="location-input"
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="es. Roma"
            placeholderTextColor={COLORS.textMuted}
          />

          {/* Notes */}
          <Text style={styles.label}>NOTE</Text>
          <TextInput
            testID="notes-input"
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Come ti sei sentito?"
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 2 },
  saveBtn: {
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  saveBtnText: { fontSize: FONT_SIZES.sm, color: COLORS.limeDark, fontWeight: '800' },
  form: { paddingHorizontal: SPACING.xl },
  label: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700',
    letterSpacing: 1, marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.body, color: COLORS.text,
  },
  halfInput: { flex: 1 },
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  colon: { fontSize: FONT_SIZES.xl, color: COLORS.textMuted, fontWeight: '700' },
  paceUnit: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  orText: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600',
    textAlign: 'center', marginTop: SPACING.md,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typeChip: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  typeChipActive: { backgroundColor: COLORS.lime, borderColor: COLORS.lime },
  typeChipText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  typeChipTextActive: { color: COLORS.limeDark },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: SPACING.md },
});
