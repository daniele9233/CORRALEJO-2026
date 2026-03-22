import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { COLORS } from '../src/theme';
import { api } from '../src/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications() {
  if (!Device.isDevice) return;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
    await Notifications.setNotificationChannelAsync('daily-reminder', {
      name: 'Reminder giornaliero',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('smart-alerts', {
      name: 'Badge e avvisi intelligenti',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const pushToken = await Notifications.getExpoPushTokenAsync({
    projectId: '1a7ea756-e936-4b37-b3d9-fd1e35b66331',
  });
  try {
    await api.registerPushToken(pushToken.data);
  } catch (e) {
    console.log('Push token registration failed:', e);
  }
}

async function scheduleDailyReminder() {
  try {
    // Cancel existing daily reminders to avoid duplicates
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of existing) {
      if (notif.content.data?.type === 'daily-reminder') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    // Fetch today's session from the API
    let title = 'Buongiorno! Sessione di oggi';
    let body = 'Apri l\'app per vedere il tuo allenamento';
    try {
      const dashboard = await api.getDashboard();
      const todaySession = dashboard?.today_session;
      if (todaySession) {
        const sessionType = todaySession.type || '';
        const sessionTitle = todaySession.title || todaySession.type || 'Allenamento';
        const distance = todaySession.target_distance_km ? `${todaySession.target_distance_km}km` : '';
        const pace = todaySession.target_pace ? `@ ${todaySession.target_pace}/km` : '';

        if (sessionType === 'riposo') {
          title = '😴 Giorno di riposo';
          body = 'Recupera le energie per la prossima sessione. Il tuo corpo sta costruendo!';
        } else if (sessionType === 'ripetute' || sessionType === 'interval') {
          title = `🔥 Oggi: ${sessionTitle}`;
          body = `${[distance, pace].filter(Boolean).join(' ')} — Riscaldati bene prima delle ripetute!`;
        } else if (sessionType === 'lungo' || sessionType === 'long') {
          title = `🏃 Oggi: ${sessionTitle}`;
          body = `${[distance, pace].filter(Boolean).join(' ')} — Corsa lunga, parti piano e gestisci le energie`;
        } else if (sessionType === 'soglia' || sessionType === 'tempo') {
          title = `⚡ Oggi: ${sessionTitle}`;
          body = `${[distance, pace].filter(Boolean).join(' ')} — Mantieni il ritmo in soglia, non strafare`;
        } else if (sessionType === 'progressivo') {
          title = `📈 Oggi: ${sessionTitle}`;
          body = `${[distance, pace].filter(Boolean).join(' ')} — Parti lento e chiudi forte!`;
        } else {
          title = `🏃 Oggi: ${sessionTitle}`;
          body = [distance, pace].filter(Boolean).join(' ') || 'Apri l\'app per i dettagli';
        }
      }
    } catch (e) {
      // Use default message if API fails
    }

    // Schedule daily at 7:00 AM
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'daily-reminder' },
        ...(Platform.OS === 'android' ? { channelId: 'daily-reminder' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 7,
        minute: 0,
      },
    });
  } catch (e) {
    console.log('Daily reminder scheduling failed:', e);
  }
}

async function checkForOTAUpdate() {
  if (__DEV__) return; // Skip in development
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      Alert.alert(
        'Aggiornamento disponibile',
        "L'app è stata aggiornata. Riavvio in corso...",
        [{ text: 'OK', onPress: () => Updates.reloadAsync() }]
      );
    }
  } catch (e) {
    console.log('OTA update check failed:', e);
  }
}

async function autoSyncStrava() {
  try {
    // Check if Strava is connected first
    const profile = await api.getStravaProfile();
    if (profile?.athlete) {
      // Strava is connected — sync in background
      console.log('Auto-sync Strava: avvio...');
      const result = await api.syncStrava();
      if (result?.synced > 0) {
        console.log(`Auto-sync Strava: ${result.synced} nuove corse importate`);
      } else {
        console.log('Auto-sync Strava: nessuna nuova corsa');
      }
    }
  } catch (e) {
    // Silently fail — don't block app startup
    console.log('Auto-sync Strava skipped:', e);
  }
}

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications();
    scheduleDailyReminder();
    checkForOTAUpdate();
    // Auto-sync Strava all'avvio (non blocca l'app)
    autoSyncStrava();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-run"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen name="run-detail" />
        <Stack.Screen name="workout-detail" />
        <Stack.Screen name="strava-callback" options={{ headerShown: false }} />
        <Stack.Screen name="periodizzazione" />
        <Stack.Screen name="progressi" />
        <Stack.Screen name="calcolatore" />
        <Stack.Screen name="injury-risk" />
        <Stack.Screen
          name="add-test"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </>
  );
}
