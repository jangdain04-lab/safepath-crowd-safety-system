import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_PREFERENCES_KEY = 'safepath.organizer.notificationPreferences';

export type OrganizerNotificationPreferences = {
  pushEnabled: boolean;
  soundEnabled: boolean;
  darkMode: boolean;
};

export const DEFAULT_ORGANIZER_NOTIFICATION_PREFERENCES: OrganizerNotificationPreferences = {
  pushEnabled: true,
  soundEnabled: true,
  darkMode: false,
};

export async function getOrganizerNotificationPreferences(): Promise<OrganizerNotificationPreferences> {
  const raw = await AsyncStorage.getItem(NOTIFICATION_PREFERENCES_KEY);

  if (!raw) {
    return DEFAULT_ORGANIZER_NOTIFICATION_PREFERENCES;
  }

  try {
    return {
      ...DEFAULT_ORGANIZER_NOTIFICATION_PREFERENCES,
      ...JSON.parse(raw),
    };
  } catch (error) {
    return DEFAULT_ORGANIZER_NOTIFICATION_PREFERENCES;
  }
}

export async function saveOrganizerNotificationPreferences(
  preferences: Partial<OrganizerNotificationPreferences>,
) {
  const current = await getOrganizerNotificationPreferences();
  const next = {
    ...current,
    ...preferences,
  };

  await AsyncStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(next));

  return next;
}

export async function shouldReceiveOrganizerNotification() {
  const preferences = await getOrganizerNotificationPreferences();
  return preferences.pushEnabled;
}

export async function shouldPlayOrganizerNotificationSound() {
  const preferences = await getOrganizerNotificationPreferences();
  return preferences.pushEnabled && preferences.soundEnabled;
}
