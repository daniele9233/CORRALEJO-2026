import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../src/theme';
import { api } from '../../src/api';
import { Profile, Supplement, Exercise, TestSchedule } from '../../src/types';

export default function ProfiloScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [tests, setTests] = useState<any>(null);
  const [medals, setMedals] = useState<any>({});
  const [stravaProfile, setStravaProfile] = useState<any>(null);
  const [stravaError, setStravaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profilo' | 'medaglie' | 'integratori' | 'esercizi' | 'test'>('profilo');
  const [editModal, setEditModal] = useState(false);
  const [editAge, setEditAge] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editMaxHr, setEditMaxHr] = useState('');
  const [editMaxWeeklyKm, setEditMaxWeeklyKm] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [stravaCodeModal, setStravaCodeModal] = useState(false);
  const [stravaCode, setStravaCode] = useState('');
  const [stravaAuthUrl, setStravaAuthUrl] = useState('');
  const [exchanging, setExchanging] = useState(false);
  const [stravaActivities, setStravaActivities] = useState<any[]>([]);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [p, s, e, t, m] = await Promise.all([
        api.getProfile(), api.getSupplements(), api.getExercises(), api.getTests(), api.getMedals()
      ]);
      setProfile(p);
      setSupplements(s.supplements || []);
      setExercises(e.exercises || []);
      setTests(t);
      setMedals(m.medals || {});

      try {
        const sp = await api.getStravaProfile();
        setStravaProfile(sp);
      } catch {
        setStravaError('Strava non raggiungibile');
      }
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message || 'Errore caricamento profilo');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleEditProfile = async () => {
    const updates: any = {};
    if (editAge && parseInt(editAge) > 0) updates.age = parseInt(editAge);
    if (editWeight && parseFloat(editWeight) > 0) updates.weight_kg = parseFloat(editWeight);
    if (editMaxHr && parseInt(editMaxHr) > 0) updates.max_hr = parseInt(editMaxHr);
    if (editMaxWeeklyKm && parseInt(editMaxWeeklyKm) > 0) updates.max_weekly_km = parseInt(editMaxWeeklyKm);
    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    try {
      const updated = await api.updateProfile(updates);
      setProfile(updated);
      setEditModal(false);
      setEditAge('');
      setEditWeight('');
      setEditMaxHr('');
      setEditMaxWeeklyKm('');
    } catch {
      Alert.alert('Errore', 'Impossibile aggiornare il profilo');
    } finally {
      setSaving(false);
    }
  };

  const handleStravaSync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncStrava();
      if (result.needs_reauth) {
        // Need to re-authorize - show auth flow
        const authData = await api.getStravaAuthUrl();
        setStravaAuthUrl(authData.url);
        setStravaCodeModal(true);
      } else {
        // Build message: sync summary + adaptation result if any
        let alertTitle = 'Strava Sync';
        let alertMsg = result.message || `Sincronizzate ${result.synced} nuove corse`;
        if (result.adaptation && result.adaptation.adapted) {
          alertTitle = 'Sync + Piano Aggiornato';
          alertMsg += `\n\n${result.adaptation.message}`;
        }
        Alert.alert(alertTitle, alertMsg);
        loadData();
      }
    } catch {
      Alert.alert('Errore', 'Errore durante la sincronizzazione');
    } finally {
      setSyncing(false);
    }
  };

  const handleStravaAuth = async () => {
    try {
      const authData = await api.getStravaAuthUrl();
      setStravaAuthUrl(authData.url);
      // Try to open in system browser (deep link will handle the callback)
      const canOpen = await Linking.canOpenURL(authData.url);
      if (canOpen) {
        await Linking.openURL(authData.url);
      } else {
        // Fallback: show manual code modal
        setStravaCodeModal(true);
      }
    } catch {
      Alert.alert('Errore', 'Impossibile ottenere URL autorizzazione');
    }
  };

  const handleExchangeCode = async () => {
    if (!stravaCode.trim()) return;
    setExchanging(true);
    try {
      const result = await api.exchangeStravaCode(stravaCode.trim());
      if (result.success) {
        Alert.alert('Strava', result.message);
        setStravaCodeModal(false);
        setStravaCode('');
        loadData();
      }
    } catch (e: any) {
      Alert.alert('Errore', 'Codice non valido o scaduto. Riprova con un nuovo codice.');
    } finally {
      setExchanging(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.lime} /></View>
      </SafeAreaView>
    );
  }

  if (loadError || !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="cloud-offline" size={48} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textSecondary, fontSize: 16, marginTop: 16, textAlign: 'center', paddingHorizontal: 32 }}>
            {loadError || 'Impossibile caricare il profilo'}
          </Text>
          <TouchableOpacity onPress={() => { setLoading(true); setLoadError(null); loadData(); }} style={{ marginTop: 20, backgroundColor: COLORS.lime, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 }}>
            <Text style={{ color: COLORS.limeDark, fontWeight: '700', fontSize: 14 }}>RIPROVA</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const tabs = [
    { key: 'profilo', label: 'PROFILO', icon: 'person' },
    { key: 'medaglie', label: 'MEDAGLIE', icon: 'medal' },
    { key: 'integratori', label: 'INTEGR.', icon: 'flask' },
    { key: 'esercizi', label: 'ESERC.', icon: 'barbell' },
    { key: 'test', label: 'TEST', icon: 'stopwatch' },
  ] as const;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.pageTitle}>PROFILO</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBarContent}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            testID={`tab-${tab.key}`}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.key ? COLORS.lime : COLORS.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'profilo' && profile && (
          <>
            {/* Strava Connection */}
            <View style={styles.stravaCard}>
              <View style={styles.stravaHeader}>
                <View style={styles.stravaLogo}>
                  <Ionicons name="fitness" size={18} color="#FC4C02" />
                </View>
                <View style={styles.stravaInfo}>
                  <Text style={styles.stravaTitle}>STRAVA</Text>
                  {stravaProfile ? (
                    <Text style={styles.stravaName}>{stravaProfile.name} • Connesso</Text>
                  ) : (
                    <Text style={styles.stravaDisconnected}>{stravaError || 'Non connesso'}</Text>
                  )}
                </View>
                <TouchableOpacity
                  testID="strava-sync-btn"
                  style={styles.syncBtn}
                  onPress={handleStravaSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color={COLORS.limeDark} />
                  ) : (
                    <>
                      <Ionicons name="sync" size={14} color={COLORS.limeDark} />
                      <Text style={styles.syncText}>SYNC</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.stravaActions}>
                <TouchableOpacity
                  testID="strava-auth-btn"
                  style={styles.stravaAuthBtn}
                  onPress={handleStravaAuth}
                >
                  <Ionicons name="key" size={14} color="#FC4C02" />
                  <Text style={styles.stravaAuthText}>Autorizza Strava</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.stravaAuthBtn, { borderColor: COLORS.cardBorder }]}
                  onPress={() => {
                    api.getStravaAuthUrl().then(d => {
                      setStravaAuthUrl(d.url);
                      setStravaCodeModal(true);
                    }).catch(() => Alert.alert('Errore', 'Impossibile ottenere URL'));
                  }}
                >
                  <Ionicons name="code-working" size={14} color={COLORS.textMuted} />
                  <Text style={[styles.stravaAuthText, { color: COLORS.textMuted }]}>Codice manuale</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.stravaNote}>
                Clicca "Autorizza Strava" per aprire il browser e autorizzare automaticamente. Se il redirect non funziona, usa "Codice manuale".
              </Text>
            </View>

            {/* Stats with Edit */}
            <View style={styles.statsHeader}>
              <Text style={styles.sectionTitle}>DATI PERSONALI</Text>
              <TouchableOpacity testID="edit-profile-btn" onPress={() => {
                setEditAge(String(profile.age));
                setEditWeight(String(profile.weight_kg));
                setEditMaxHr(String(profile.max_hr || 180));
                setEditMaxWeeklyKm(String(profile.max_weekly_km || 60));
                setEditModal(true);
              }}>
                <Ionicons name="pencil" size={18} color={COLORS.lime} />
              </TouchableOpacity>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>ETÀ</Text>
                <Text style={styles.statValue}>{profile.age}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>PESO</Text>
                <Text style={styles.statValue}>{profile.weight_kg} kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>FC MAX</Text>
                <Text style={styles.statValue}>{profile.max_hr || 180} bpm</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>KM MAX/SETT</Text>
                <Text style={styles.statValue}>{profile.max_weekly_km || 60}</Text>
              </View>
            </View>

            {/* PBs */}
            <Text style={styles.sectionTitle}>PERSONAL BEST</Text>
            <View style={styles.pbGrid}>
              {Object.entries(profile.pbs || {}).map(([dist, pb]) => (
                <View key={dist} style={styles.pbCard}>
                  <Text style={styles.pbDist}>{dist.toUpperCase()}</Text>
                  <Text style={styles.pbTime}>{pb.time}</Text>
                  <Text style={styles.pbPace}>{pb.pace}/km</Text>
                  <Text style={styles.pbDate}>{pb.date}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {activeTab === 'medaglie' && (
          <>
            {/* Badge e Trofei link */}
            <TouchableOpacity
              onPress={() => router.push('/badges')}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: '#f9731610', borderRadius: BORDER_RADIUS.md,
                padding: SPACING.lg, marginBottom: SPACING.lg,
                borderWidth: 1, borderColor: '#f9731640',
              }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <Text style={{ fontSize: 28 }}>🏆</Text>
                <View>
                  <Text style={{ fontSize: FONT_SIZES.body, fontWeight: '900', color: COLORS.text }}>Badge e Trofei</Text>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>100+ badge da sbloccare</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#f97316" />
            </TouchableOpacity>

            <Text style={styles.introText}>Sistema medaglie a 6 livelli: Warm-up, Bronzo, Argento, Oro, Platino, Elite</Text>
            {Object.entries(medals).map(([dist, medal]: [string, any]) => {
              const status = medal.status || 'locked';
              const targets = medal.targets || {};
              const medalEmojis: Record<string, string> = {
                'warmup': '🏃',
                'bronzo': '🥉',
                'argento': '🥈',
                'oro': '🥇',
                'platino': '💎',
                'elite': '👑',
                'locked': '🔒'
              };
              const medalLabels: Record<string, string> = {
                'warmup': 'WARM-UP',
                'bronzo': 'BRONZO',
                'argento': 'ARGENTO',
                'oro': 'ORO',
                'platino': 'PLATINO',
                'elite': 'ELITE',
                'locked': 'DA SBLOCCARE'
              };
              const medalColors: Record<string, string> = {
                'warmup': COLORS.textMuted,
                'bronzo': '#CD7F32',
                'argento': '#C0C0C0',
                'oro': '#FFD700',
                'platino': '#E5E4E2',
                'elite': COLORS.lime,
                'locked': COLORS.textMuted
              };
              const isLocked = status === 'locked';
              return (
                <View key={dist} style={[styles.medalCard, { borderColor: medalColors[status] + '40' }]}>
                  <View style={styles.medalHeader}>
                    <View style={styles.medalIconContainer}>
                      <Text style={styles.medalIcon}>{medalEmojis[status] || '🔒'}</Text>
                    </View>
                    <View style={styles.medalInfo}>
                      <Text style={styles.medalDist}>{dist.toUpperCase()}</Text>
                      <Text style={[styles.medalStatus, { color: medalColors[status] }]}>
                        {medalLabels[status] || 'DA SBLOCCARE'}
                      </Text>
                      {medal.best_time_str && (
                        <Text style={styles.medalBestTime}>PB: {medal.best_time_str} ({medal.best_pace || 'N/A'}/km)</Text>
                      )}
                    </View>
                  </View>
                  
                  {/* All 6 targets */}
                  <View style={styles.medalTargetsGrid}>
                    {['warmup', 'bronzo', 'argento', 'oro', 'platino', 'elite'].map((level) => {
                      const target = targets[level];
                      if (!target) return null;
                      const isAchieved = ['warmup', 'bronzo', 'argento', 'oro', 'platino', 'elite'].indexOf(status) >= ['warmup', 'bronzo', 'argento', 'oro', 'platino', 'elite'].indexOf(level);
                      const isNext = medal.next_level === level;
                      return (
                        <View key={level} style={[styles.medalTargetItem, isAchieved && styles.medalTargetAchieved, isNext && styles.medalTargetNext]}>
                          <Text style={styles.medalTargetEmoji}>{medalEmojis[level]}</Text>
                          <Text style={[styles.medalTargetTime, isAchieved && { color: COLORS.lime }]}>{target.time}</Text>
                          <Text style={styles.medalTargetPaceSmall}>{target.pace}/km</Text>
                        </View>
                      );
                    })}
                  </View>
                  
                  {/* Gap to next level */}
                  {medal.gap_to_next_secs && medal.next_level && (
                    <View style={styles.medalGapRow}>
                      <Text style={styles.medalGapLabel}>Per {medalLabels[medal.next_level]}:</Text>
                      <Text style={styles.medalGapValue}>
                        -{Math.floor(medal.gap_to_next_secs / 60)}:{String(Math.abs(medal.gap_to_next_secs % 60)).padStart(2, '0')}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {activeTab === 'integratori' && (
          <>
            <Text style={styles.introText}>Piano integratori ottimizzato per il recupero da tendinopatia e prestazione in mezza maratona</Text>
            {supplements.map(supp => (
              <View key={supp.id} style={styles.suppCard}>
                <View style={styles.suppHeader}>
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(supp.category) + '20' }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(supp.category) }]}>{supp.category.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.suppName}>{supp.name}</Text>
                <Text style={styles.suppDosage}>{supp.dosage}</Text>
                <View style={styles.suppTimingRow}>
                  <Ionicons name="time" size={14} color={COLORS.lime} />
                  <Text style={styles.suppTiming}>{supp.timing}</Text>
                </View>
                <Text style={styles.suppPurpose}>{supp.purpose}</Text>
              </View>
            ))}
          </>
        )}

        {activeTab === 'esercizi' && (
          <>
            <Text style={styles.introText}>Protocollo di rinforzo muscolare - 4 volte/settimana</Text>
            {exercises.map(ex => (
              <View key={ex.id} style={styles.exCard}>
                <View style={styles.exHeader}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: ex.priority === 'alta' ? COLORS.red + '20' : COLORS.blue + '20' }]}>
                    <Text style={[styles.priorityText, { color: ex.priority === 'alta' ? COLORS.red : COLORS.blue }]}>
                      {ex.priority.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.exStatsRow}>
                  <View style={styles.exStatItem}>
                    <Text style={styles.exStatValue}>{ex.sets}x{ex.reps}</Text>
                    <Text style={styles.exStatLabel}>Serie x Rep</Text>
                  </View>
                  <View style={styles.exStatItem}>
                    <Text style={styles.exStatValue}>{ex.tempo}</Text>
                    <Text style={styles.exStatLabel}>Tempo</Text>
                  </View>
                  <View style={styles.exStatItem}>
                    <Text style={styles.exStatValue}>{ex.rest}</Text>
                    <Text style={styles.exStatLabel}>Recupero</Text>
                  </View>
                </View>
                <Text style={styles.exNotes}>{ex.notes}</Text>
              </View>
            ))}
          </>
        )}

        {activeTab === 'test' && (
          <>
            <View style={styles.testHeaderRow}>
              <Text style={styles.introText}>Test periodici ogni 6 settimane per verificare la condizione</Text>
              <TouchableOpacity
                testID="add-test-btn"
                style={styles.addTestBtn}
                onPress={() => router.push('/add-test')}
              >
                <Ionicons name="add" size={20} color={COLORS.limeDark} />
                <Text style={styles.addTestText}>AGGIUNGI</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSection}>PROGRAMMATI</Text>
            {(tests?.schedule || []).map((t: TestSchedule) => (
              <View key={t.id} style={[styles.testCard, t.completed && styles.testCompleted]}>
                <View style={styles.testRow}>
                  <View>
                    <Text style={styles.testDate}>{formatDate(t.scheduled_date)}</Text>
                    <Text style={styles.testType}>{t.test_type.replace(/_/g, ' ').toUpperCase()}</Text>
                  </View>
                  <Ionicons
                    name={t.completed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={t.completed ? COLORS.lime : COLORS.textMuted}
                  />
                </View>
                <Text style={styles.testDesc}>{t.description}</Text>
              </View>
            ))}

            {(tests?.results || []).length > 0 && (
              <>
                <Text style={styles.subSection}>RISULTATI</Text>
                {tests.results.map((r: any) => (
                  <View key={r.id} style={styles.resultCard}>
                    <Text style={styles.testDate}>{formatDate(r.date)}</Text>
                    <View style={styles.resultStats}>
                      <Text style={styles.resultValue}>{r.distance_km} km in {Math.floor(r.duration_minutes)}:{String(Math.round((r.duration_minutes % 1) * 60)).padStart(2, '0')}</Text>
                      <Text style={styles.resultPace}>{r.avg_pace}/km</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>MODIFICA PROFILO</Text>

            <Text style={styles.modalLabel}>ETÀ</Text>
            <TextInput
              testID="edit-age-input"
              style={styles.modalInput}
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="number-pad"
              placeholder="Età"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.modalLabel}>PESO (KG)</Text>
            <TextInput
              testID="edit-weight-input"
              style={styles.modalInput}
              value={editWeight}
              onChangeText={setEditWeight}
              keyboardType="decimal-pad"
              placeholder="Peso in kg"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.modalLabel}>FC MAX (BPM)</Text>
            <TextInput
              testID="edit-maxhr-input"
              style={styles.modalInput}
              value={editMaxHr}
              onChangeText={setEditMaxHr}
              keyboardType="number-pad"
              placeholder="FC massima"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.modalLabel}>KM MAX SETTIMANALI</Text>
            <TextInput
              testID="edit-maxkm-input"
              style={styles.modalInput}
              value={editMaxWeeklyKm}
              onChangeText={setEditMaxWeeklyKm}
              keyboardType="number-pad"
              placeholder="Km massimi settimanali"
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity testID="cancel-edit-btn" style={styles.modalCancelBtn} onPress={() => setEditModal(false)}>
                <Text style={styles.modalCancelText}>ANNULLA</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-edit-btn" style={styles.modalSaveBtn} onPress={handleEditProfile} disabled={saving}>
                <Text style={styles.modalSaveText}>{saving ? '...' : 'SALVA'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Strava Auth Code Modal */}
      <Modal visible={stravaCodeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>AUTORIZZA STRAVA</Text>

            <Text style={styles.stravaStep}>1. Apri questo URL nel browser:</Text>
            <View style={styles.urlBox}>
              <Text style={styles.urlText} selectable>{stravaAuthUrl}</Text>
            </View>

            <Text style={styles.stravaStep}>2. Autorizza l'app su Strava</Text>
            <Text style={styles.stravaStep}>3. Dall'URL di redirect copia il valore dopo "code="</Text>

            <Text style={styles.modalLabel}>CODICE DI AUTORIZZAZIONE</Text>
            <TextInput
              testID="strava-code-input"
              style={styles.modalInput}
              value={stravaCode}
              onChangeText={setStravaCode}
              placeholder="Incolla qui il codice..."
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity testID="cancel-strava-btn" style={styles.modalCancelBtn} onPress={() => { setStravaCodeModal(false); setStravaCode(''); }}>
                <Text style={styles.modalCancelText}>ANNULLA</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="exchange-code-btn" style={styles.modalSaveBtn} onPress={handleExchangeCode} disabled={exchanging || !stravaCode.trim()}>
                <Text style={styles.modalSaveText}>{exchanging ? 'SCAMBIO...' : 'AUTORIZZA'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getCategoryColor(cat: string) {
  const map: Record<string, string> = {
    tendini: COLORS.orange, vitamine: '#22c55e', performance: COLORS.lime,
    minerali: '#3b82f6', anti_infiammatorio: '#ef4444',
  };
  return map[cat] || '#a1a1aa';
}

function formatDate(dateStr: string) {
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '800', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  tabBarScroll: { flexGrow: 0, marginTop: SPACING.lg },
  tabBarContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  tab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  tabActive: { backgroundColor: 'rgba(190, 242, 100, 0.15)', borderColor: 'rgba(190, 242, 100, 0.3)' },
  tabText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.lime },
  scrollContent: { paddingTop: SPACING.lg },
  introText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginHorizontal: SPACING.xl, marginBottom: SPACING.lg, lineHeight: 22, flex: 1 },

  // Strava
  stravaCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: '#FC4C0240',
  },
  stravaHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stravaLogo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FC4C0220', alignItems: 'center', justifyContent: 'center' },
  stravaInfo: { flex: 1 },
  stravaTitle: { fontSize: FONT_SIZES.xs, color: '#FC4C02', fontWeight: '700', letterSpacing: 2 },
  stravaName: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '600', marginTop: 2 },
  stravaDisconnected: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: 2 },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  syncText: { fontSize: FONT_SIZES.xs, color: COLORS.limeDark, fontWeight: '700' },
  stravaNote: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.sm, lineHeight: 18 },
  stravaActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  stravaAuthBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FC4C0215', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: '#FC4C0240',
  },
  stravaAuthText: { fontSize: FONT_SIZES.xs, color: '#FC4C02', fontWeight: '700' },
  stravaStep: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 20 },
  urlBox: {
    backgroundColor: COLORS.inputBg, borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm, marginTop: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  urlText: { fontSize: FONT_SIZES.xs, color: '#FC4C02', lineHeight: 16 },

  // Stats
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: SPACING.xl, marginBottom: SPACING.md },
  sectionTitle: {
    fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '700', letterSpacing: 2,
    marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, marginBottom: SPACING.md,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginHorizontal: SPACING.xl },
  statCard: {
    width: '48%', backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder, flexGrow: 1,
  },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1 },
  statValue: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800', marginTop: 4 },

  // PBs
  pbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginHorizontal: SPACING.xl },
  pbCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.2)', width: '48%', flexGrow: 1,
  },
  pbDist: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 1 },
  pbTime: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '800', marginTop: 4 },
  pbPace: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  pbDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 },

  // Injury
  injuryCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.3)', flexDirection: 'row', gap: SPACING.md,
  },
  injuryInfo: { flex: 1 },
  injuryType: { fontSize: FONT_SIZES.md, color: COLORS.orange, fontWeight: '700' },
  injuryStatus: { fontSize: FONT_SIZES.sm, color: COLORS.text, marginTop: 4 },
  injuryDetail: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 4, lineHeight: 20 },

  // Info Card
  infoCard: {
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  infoRecommendation: { fontSize: FONT_SIZES.md, color: COLORS.lime, fontWeight: '700' },
  infoText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 22 },
  infoProtocol: { fontSize: FONT_SIZES.sm, color: '#3b82f6', marginTop: SPACING.sm, fontStyle: 'italic' },

  // Medals
  medalCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  medalGold: { borderColor: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.08)' },
  medalSilver: { borderColor: 'rgba(190, 242, 100, 0.3)', backgroundColor: 'rgba(190, 242, 100, 0.05)' },
  medalHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  medalIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  medalIcon: { fontSize: 28 },
  medalInfo: { flex: 1 },
  medalDist: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: '900' },
  medalStatus: { fontSize: FONT_SIZES.xs, color: COLORS.lime, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  medalTargets: { flexDirection: 'row', gap: SPACING.xxl, marginTop: SPACING.lg },
  medalTarget: { alignItems: 'center' },
  medalTargetLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1 },
  medalTargetValue: { fontSize: FONT_SIZES.xl, color: '#fbbf24', fontWeight: '800', marginTop: 4 },
  medalTargetPace: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  medalProgress: { marginTop: SPACING.md },
  medalProgressBar: { height: 6, backgroundColor: COLORS.cardBorder, borderRadius: 3, overflow: 'hidden' },
  medalProgressFill: { height: '100%', backgroundColor: COLORS.lime, borderRadius: 3 },
  medalBestTime: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  medalTargetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.md },
  medalTargetItem: { 
    width: '31%', alignItems: 'center', padding: SPACING.sm, 
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: BORDER_RADIUS.md, 
    borderWidth: 1, borderColor: 'transparent',
  },
  medalTargetAchieved: { backgroundColor: 'rgba(190, 242, 100, 0.1)', borderColor: 'rgba(190, 242, 100, 0.2)' },
  medalTargetNext: { borderColor: COLORS.orange, borderStyle: 'dashed' },
  medalTargetEmoji: { fontSize: 18 },
  medalTargetTime: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '700', marginTop: 2 },
  medalTargetPaceSmall: { fontSize: 9, color: COLORS.textMuted },
  medalGapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  medalGapLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  medalGapValue: { fontSize: FONT_SIZES.md, color: COLORS.orange, fontWeight: '700' },

  // Supplements
  suppCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  suppHeader: { marginBottom: SPACING.sm },
  categoryBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  categoryText: { fontSize: FONT_SIZES.xs, fontWeight: '700', letterSpacing: 1 },
  suppName: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700' },
  suppDosage: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 4 },
  suppTimingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.sm },
  suppTiming: { fontSize: FONT_SIZES.sm, color: COLORS.lime, fontWeight: '600' },
  suppPurpose: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: SPACING.sm, lineHeight: 20 },

  // Exercises
  exCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700', flex: 1 },
  priorityBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  priorityText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  exStatsRow: { flexDirection: 'row', gap: SPACING.xl, marginTop: SPACING.md },
  exStatItem: {},
  exStatValue: { fontSize: FONT_SIZES.md, color: COLORS.lime, fontWeight: '700' },
  exStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  exNotes: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 20 },

  // Tests
  testHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginHorizontal: SPACING.xl, marginBottom: SPACING.md,
  },
  addTestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.lime, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  addTestText: { fontSize: FONT_SIZES.xs, color: COLORS.limeDark, fontWeight: '700' },
  subSection: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 2,
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, marginTop: SPACING.md,
  },
  testCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  testCompleted: { opacity: 0.5 },
  testRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  testDate: { fontSize: FONT_SIZES.md, color: COLORS.orange, fontWeight: '700' },
  testType: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  testDesc: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.sm },
  resultCard: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(190, 242, 100, 0.2)',
  },
  resultStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm },
  resultValue: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '700' },
  resultPace: { fontSize: FONT_SIZES.lg, color: COLORS.lime, fontWeight: '800' },

  // Edit Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl, width: '100%', maxWidth: 340,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  modalTitle: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '800', letterSpacing: 1, marginBottom: SPACING.lg },
  modalLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1, marginTop: SPACING.md, marginBottom: SPACING.sm },
  modalInput: {
    backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.body, color: COLORS.text,
  },
  modalButtons: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xxl },
  modalCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: BORDER_RADIUS.full, paddingVertical: SPACING.md, alignItems: 'center',
  },
  modalCancelText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '700' },
  modalSaveBtn: {
    flex: 1, backgroundColor: COLORS.lime,
    borderRadius: BORDER_RADIUS.full, paddingVertical: SPACING.md, alignItems: 'center',
  },
  modalSaveText: { fontSize: FONT_SIZES.sm, color: COLORS.limeDark, fontWeight: '800' },
});
