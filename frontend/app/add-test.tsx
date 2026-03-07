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

const TEST_TYPES = [
  { key: '6km_time_trial', label: '6km Time Trial' },
  { key: '10km_time_trial', label: '10km Time Trial' },
  { key: '15km_time_trial', label: '15km Time Trial' },
  { key: 'cooper_test', label: 'Test di Cooper' },
];

export default function AddTestScreen() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [testType, setTestType] = useState('6km_time_trial');
  const [distance, setDistance] = useState('6');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!distance || !minutes) {
      Alert.alert('Errore', 'Inserisci distanza e durata');
      return;
    }

    const distKm = parseFloat(distance);
    const durationMin = parseInt(minutes) + (parseInt(seconds || '0') / 60);
    const totalSec = durationMin * 60 / distKm;
    const pace = `${Math.floor(totalSec / 60)}:${String(Math.round(totalSec % 60)).padStart(2, '0')}`;

    setSaving(true);
    try {
      await api.createTest({
        date,
        test_type: testType,
        distance_km: distKm,
        duration_minutes: Math.round(durationMin * 100) / 100,
        avg_pace: pace,
        avg_hr: avgHr ? parseInt(avgHr) : undefined,
        max_hr: maxHr ? parseInt(maxHr) : undefined,
        notes: notes || undefined,
      });
      router.back();
    } catch (e) {
      Alert.alert('Errore', 'Impossibile salvare il test');
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
        <View style={styles.header}>
          <TouchableOpacity testID="close-test-btn" onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>NUOVO TEST</Text>
          <TouchableOpacity testID="save-test-btn" onPress={handleSave} style={styles.saveBtn} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? '...' : 'SALVA'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
          <Text style={styles.label}>DATA</Text>
          <TextInput
            testID="test-date-input"
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>TIPO DI TEST</Text>
          <View style={styles.typeGrid}>
            {TEST_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                testID={`test-type-${t.key}`}
                style={[styles.typeChip, testType === t.key && styles.typeChipActive]}
                onPress={() => {
                  setTestType(t.key);
                  if (t.key.includes('6km')) setDistance('6');
                  else if (t.key.includes('10km')) setDistance('10');
                  else if (t.key.includes('15km')) setDistance('15');
                }}
              >
                <Text style={[styles.typeChipText, testType === t.key && styles.typeChipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>DISTANZA (KM)</Text>
          <TextInput
            testID="test-distance-input"
            style={styles.input}
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>DURATA</Text>
          <View style={styles.row}>
            <TextInput
              testID="test-minutes-input"
              style={[styles.input, styles.halfInput]}
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              placeholder="Minuti"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.colon}>:</Text>
            <TextInput
              testID="test-seconds-input"
              style={[styles.input, styles.halfInput]}
              value={seconds}
              onChangeText={setSeconds}
              keyboardType="number-pad"
              placeholder="Secondi"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <Text style={styles.label}>FREQUENZA CARDIACA</Text>
          <View style={styles.row}>
            <TextInput
              testID="test-avg-hr-input"
              style={[styles.input, styles.halfInput]}
              value={avgHr}
              onChangeText={setAvgHr}
              keyboardType="number-pad"
              placeholder="FC Media"
              placeholderTextColor={COLORS.textMuted}
            />
            <TextInput
              testID="test-max-hr-input"
              style={[styles.input, styles.halfInput]}
              value={maxHr}
              onChangeText={setMaxHr}
              keyboardType="number-pad"
              placeholder="FC Max"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <Text style={styles.label}>NOTE</Text>
          <TextInput
            testID="test-notes-input"
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Sensazioni, condizioni..."
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
