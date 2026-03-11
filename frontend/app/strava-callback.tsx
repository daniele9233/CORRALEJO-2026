import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../src/theme';
import { api } from '../src/api';

export default function StravaCallbackScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setMessage('Nessun codice di autorizzazione ricevuto.');
      return;
    }
    exchangeCode(code);
  }, [code]);

  const exchangeCode = async (authCode: string) => {
    try {
      const result = await api.exchangeStravaCode(authCode);
      if (result.success) {
        setStatus('success');
        setMessage(result.message || 'Autorizzazione completata!');
        setTimeout(() => router.replace('/(tabs)/profilo'), 2000);
      } else {
        setStatus('error');
        setMessage('Scambio codice fallito.');
      }
    } catch (e: any) {
      setStatus('error');
      setMessage('Codice non valido o scaduto. Riprova.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#FC4C02" />
            <Text style={styles.title}>STRAVA</Text>
            <Text style={styles.subtitle}>Autorizzazione in corso...</Text>
          </>
        )}
        {status === 'success' && (
          <>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark" size={48} color={COLORS.lime} />
            </View>
            <Text style={styles.title}>CONNESSO</Text>
            <Text style={styles.subtitle}>{message}</Text>
            <Text style={styles.hint}>Reindirizzamento al profilo...</Text>
          </>
        )}
        {status === 'error' && (
          <>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <Ionicons name="close" size={48} color="#ef4444" />
            </View>
            <Text style={styles.title}>ERRORE</Text>
            <Text style={styles.subtitle}>{message}</Text>
            <Text style={styles.link} onPress={() => router.replace('/(tabs)/profilo')}>
              Torna al profilo
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(190, 242, 100, 0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl, color: COLORS.text, fontWeight: '900',
    marginTop: SPACING.lg, letterSpacing: 2,
  },
  subtitle: {
    fontSize: FONT_SIZES.body, color: COLORS.textSecondary,
    marginTop: SPACING.sm, textAlign: 'center', lineHeight: 22,
  },
  hint: {
    fontSize: FONT_SIZES.sm, color: COLORS.textMuted,
    marginTop: SPACING.lg,
  },
  link: {
    fontSize: FONT_SIZES.md, color: '#FC4C02', fontWeight: '700',
    marginTop: SPACING.xl, textDecorationLine: 'underline',
  },
});
