import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthResponse, AuthUser, OAuthProvider } from './api';

const AUTH_TOKEN_KEY = 'safepath.authToken';
const AUTH_USER_KEY = 'safepath.authUser';

export type StoredAuthUser = AuthUser & {
  providerLabel?: string;
};

const PROVIDER_LABELS: Record<OAuthProvider | 'email' | string, string> = {
  email: '이메일 계정',
  kakao: '카카오 계정',
  naver: '네이버 계정',
  google: '구글 계정',
};

export async function saveAuthSession(auth: AuthResponse) {
  await AsyncStorage.multiSet([
    [AUTH_TOKEN_KEY, auth.access_token],
    [AUTH_USER_KEY, JSON.stringify({
      ...auth.user,
      providerLabel: PROVIDER_LABELS[auth.user.provider] ?? auth.user.provider,
    })],
  ]);
}

export async function markStoredOnboardingCompleted() {
  const currentUser = await getStoredAuthUser();

  if (!currentUser) return;

  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify({
    ...currentUser,
    onboarding_completed: 1,
  }));
}

export async function saveOAuthProviderSession(provider: OAuthProvider) {
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;
  const fallbackUser: StoredAuthUser = {
    id: 0,
    email: `${provider}@safepath.local`,
    name: providerLabel,
    role: 'organizer',
    provider,
    providerLabel,
    onboarding_completed: 0,
  };

  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(fallbackUser));
}

export async function getStoredAuthUser(): Promise<StoredAuthUser | null> {
  const raw = await AsyncStorage.getItem(AUTH_USER_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredAuthUser;
  } catch (error) {
    return null;
  }
}

export async function clearAuthSession() {
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, AUTH_USER_KEY]);
}
