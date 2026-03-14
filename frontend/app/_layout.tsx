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
  }

  const pushToken = await Notifications.getExpoPushTokenAsync({
    projectId: 'b6eee442-2a97-4b31-803f-21db08504ca3',
  });
  try {
    await api.registerPushToken(pushToken.data);
  } catch (e) {
    console.log('Push token registration failed:', e);
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

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications();
    checkForOTAUpdate();
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
