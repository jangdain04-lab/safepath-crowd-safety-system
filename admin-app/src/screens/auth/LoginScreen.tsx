import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  EventSettings,
  fetchEventSettings,
  fetchOAuthConfig,
  getOAuthRedirectUri,
  AuthResponse,
  joinWithInviteCode,
  loginWithEmail,
  OAuthProvider,
  signupWithEmail,
  verifyInviteCode,
} from '../../services/api';
import { markStoredOnboardingCompleted, saveAuthSession } from '../../services/authStorage';

WebBrowser.maybeCompleteAuthSession();

type AuthMode = 'login' | 'signup';
type SocialProvider = OAuthProvider;

function hasConfiguredEventSettings(settings: EventSettings): boolean {
  return Boolean(
    settings.eventRange?.trim() ||
    settings.searchPlace?.trim() ||
    settings.placeDisplayName?.trim() ||
    settings.cctvLocations?.some((value) => value.trim()) ||
    settings.placeNames?.some((value) => value.trim()) ||
    settings.roadAngles?.some((value) => value.trim()) ||
    settings.roadAreas?.some((value) => value.trim()),
  );
}

function authFromOAuthRedirect(url: string, provider: OAuthProvider): AuthResponse | null {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    if (params.get('oauth') !== 'success') {
      return null;
    }

    const accessToken = params.get('access_token');
    const email = params.get('email');

    if (!accessToken || !email) {
      return null;
    }

    return {
      access_token: accessToken,
      token_type: params.get('token_type') || 'bearer',
      user: {
        id: Number(params.get('user_id') || 0),
        email,
        name: params.get('name') || null,
        role: params.get('role') || 'organizer',
        provider: (params.get('provider') || provider) as OAuthProvider,
        onboarding_completed: Number(params.get('onboarding_completed') || 0),
      },
    };
  } catch (error) {
    return null;
  }
}

const SOCIAL_META: Record<
  SocialProvider,
  { label: string; mark: string; bg: string; fg: string; border?: string }
> = {
  kakao: { label: '카카오', mark: 'K', bg: '#FEE500', fg: '#3A1D1D' },
  naver: { label: '네이버', mark: 'N', bg: '#03C75A', fg: '#FFFFFF' },
  google: { label: '구글', mark: 'G', bg: '#FFFFFF', fg: '#4285F4', border: '#E5E7EB' },
};

export default function LoginScreen({ navigation }: any) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [selectedProvider, setSelectedProvider] = useState<SocialProvider>('kakao');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteStep, setInviteStep] = useState<'code' | 'name'>('code');
  const [authError, setAuthError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState('');

  const closeInviteModal = () => {
    setInviteOpen(false);
    setInviteStep('code');
    setInviteCode('');
    setInviteName('');
    setInviteError('');
  };

  const goNext = async (onboardingCompleted?: number) => {
    if (onboardingCompleted === 1) {
      navigation.replace('MainTabs');
      return;
    }

    try {
      const settings = await fetchEventSettings();

      if (hasConfiguredEventSettings(settings)) {
        await markStoredOnboardingCompleted();
        navigation.replace('MainTabs');
        return;
      }
    } catch (error) {
      // If settings cannot be verified, continue with the first-time setup flow.
    }

    navigation.replace('Onboarding');
  };

  const openEmailAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthError('');
    setAuthOpen(true);
  };

  const openSocialAuth = (provider: SocialProvider) => {
    setSelectedProvider(provider);
    setSocialOpen(true);
  };

  const submitEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setAuthError('');

    try {
      const auth = authMode === 'login'
        ? await loginWithEmail(email.trim(), password)
        : await signupWithEmail(email.trim(), password);

      await saveAuthSession(auth);

      setAuthOpen(false);
      await goNext(auth.user.onboarding_completed);
    } catch (err) {
      setAuthError(
        authMode === 'login'
          ? '로그인에 실패했습니다. 계정 정보를 확인해주세요.'
          : '회원가입에 실패했습니다. 이메일 또는 비밀번호를 확인해주세요.',
      );
    } finally {
      setLoading(false);
    }
  };

  const submitInviteCode = async () => {
    const code = inviteCode.trim();

    if (!code) {
      setInviteError('초대코드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setInviteError('');

    try {
      const result = await verifyInviteCode(code);

      if (!result.valid) {
        setInviteError(result.message || '유효하지 않은 초대코드입니다.');
        return;
      }

      setInviteStep('name');
    } catch (err) {
      setInviteError('서버 연결을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const submitInviteJoin = async () => {
    const code = inviteCode.trim();
    const name = inviteName.trim();

    if (!name) {
      setInviteError('이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    setInviteError('');

    try {
      const auth = await joinWithInviteCode(code, name);
      await saveAuthSession(auth);
      closeInviteModal();
      navigation.replace('MainTabs');
    } catch (err) {
      setInviteError('입장 처리에 실패했습니다. 초대코드와 이름을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const submitOAuth = async () => {
    const provider = selectedProvider;
    setLoading(true);
    setLoadingProvider(provider);

    try {
      const config = await fetchOAuthConfig(provider);
      const providerRedirectUri = getOAuthRedirectUri(provider);
      const appReturnUri = AuthSession.makeRedirectUri();
      console.log(`[OAuth] ${provider} provider redirect URI: ${providerRedirectUri}`);
      console.log(`[OAuth] ${provider} app return URI: ${appReturnUri}`);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.client_id,
        redirect_uri: providerRedirectUri,
        state: appReturnUri,
      });

      if (config.scopes.length > 0) {
        params.set('scope', config.scopes.join(' '));
      }

      const result = await WebBrowser.openAuthSessionAsync(
        `${config.authorization_endpoint}?${params.toString()}`,
        appReturnUri,
      );

      if (result.type !== 'success') {
        return;
      }

      const auth = authFromOAuthRedirect(result.url, provider);

      if (!auth) {
        throw new Error('OAuth redirect did not include auth session');
      }

      await saveAuthSession(auth);
      setSocialOpen(false);
      await goNext(auth.user.onboarding_completed);
    } catch (err) {
      Alert.alert(
        '로그인 실패',
        '소셜 계정 연결에 실패했습니다. 백엔드 OAuth 환경변수와 개발자 콘솔 Redirect URI 설정을 확인해주세요.',
      );
    } finally {
      setLoading(false);
      setLoadingProvider('');
    }
  };

  const socialMeta = SOCIAL_META[selectedProvider];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 38, fontWeight: '900', color: '#111827', marginBottom: 18 }}>
          SAFE<Text style={{ color: '#55CCC4' }}>PATH</Text>
        </Text>

        <Text style={styles.slogan}>
          모두의 <Text style={styles.accent}>안전한</Text> 길을 만들다
        </Text>

        <TouchableOpacity
          style={[styles.emailBtn, loading && styles.disabledButton]}
          disabled={loading}
          onPress={() => openEmailAuth('login')}
        >
          <Text style={styles.emailBtnText}>이메일로 로그인</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signupBtn, loading && styles.disabledButton]}
          disabled={loading}
          onPress={() => openEmailAuth('signup')}
        >
          <Text style={styles.signupBtnText}>이메일로 회원가입</Text>
        </TouchableOpacity>

        <View style={styles.socialRow}>
          {(Object.keys(SOCIAL_META) as SocialProvider[]).map((provider) => {
            const item = SOCIAL_META[provider];

            return (
              <TouchableOpacity
                key={provider}
                style={[
                  styles.socialBtn,
                  { backgroundColor: item.bg },
                  item.border ? { borderWidth: 2, borderColor: item.border } : null,
                  loading && styles.disabledButton,
                ]}
                activeOpacity={0.72}
                disabled={loading}
                onPress={() => openSocialAuth(provider)}
              >
                {loadingProvider === provider ? (
                  <ActivityIndicator color={item.fg} />
                ) : (
                  <Text style={[styles.socialMark, { color: item.fg }]}>{item.mark}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={() => setInviteOpen(true)}>
          <Text style={styles.inviteText}>초대코드를 받으셨나요?</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={authOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setAuthOpen(false)}>
          <Pressable style={styles.modalCard}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setAuthOpen(false)}>
              <Ionicons name="close" size={28} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>
              {authMode === 'login' ? '이메일 로그인' : '이메일 회원가입'}
            </Text>
            <Text style={styles.modalDesc}>
              관리자 계정 정보를 입력해주세요.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="이메일"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="비밀번호"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {!!authError && <Text style={styles.errorText}>{authError}</Text>}

            <TouchableOpacity
              style={[styles.modalButton, loading && styles.disabledButton]}
              onPress={loading ? undefined : submitEmailAuth}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>
                  {authMode === 'login' ? '로그인' : '회원가입'}
                </Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={socialOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSocialOpen(false)}>
          <Pressable style={styles.modalCard}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSocialOpen(false)}>
              <Ionicons name="close" size={28} color="#9CA3AF" />
            </TouchableOpacity>

            <View style={[styles.socialLargeIcon, { backgroundColor: socialMeta.bg }]}>
              <Text style={[styles.socialLargeMark, { color: socialMeta.fg }]}>
                {socialMeta.mark}
              </Text>
            </View>

            <Text style={styles.modalTitle}>{socialMeta.label} 계정 연결</Text>
            <Text style={styles.modalDesc}>
              {socialMeta.label} 계정으로 관리자 앱에 연결합니다.
            </Text>

            <TouchableOpacity
              style={[styles.modalButton, loading && styles.disabledButton]}
              onPress={loading ? undefined : submitOAuth}
            >
              {loading && loadingProvider === selectedProvider ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>
                  {socialMeta.label}로 계속하기
                </Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={inviteOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeInviteModal}>
          <Pressable style={styles.modalCard}>
            <TouchableOpacity style={styles.closeBtn} onPress={closeInviteModal}>
              <Ionicons name="close" size={28} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>
              {inviteStep === 'code' ? '초대코드 입력' : '이름 입력'}
            </Text>
            <Text style={styles.modalDesc}>
              {inviteStep === 'code'
                ? '총관리자에게 받은\n초대코드를 입력해주세요.'
                : '현장 인력 관리에 표시될\n이름을 입력해주세요.'}
            </Text>

            {inviteStep === 'code' ? (
              <TextInput
                style={styles.modalInput}
                placeholder="초대코드 입력"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                value={inviteCode}
                onChangeText={setInviteCode}
              />
            ) : (
              <TextInput
                style={styles.modalInput}
                placeholder="이름 입력"
                placeholderTextColor="#9CA3AF"
                value={inviteName}
                onChangeText={setInviteName}
              />
            )}

            {!!inviteError && <Text style={styles.errorText}>{inviteError}</Text>}

            <TouchableOpacity
              style={[styles.modalButton, loading && styles.disabledButton]}
              onPress={loading ? undefined : inviteStep === 'code' ? submitInviteCode : submitInviteJoin}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>
                  {inviteStep === 'code' ? '초대코드 확인' : '입장하기'}
                </Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 48,
    paddingVertical: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 138,
    height: 138,
    resizeMode: 'contain',
    marginBottom: 38,
  },
  slogan: {
    fontSize: 26,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 72,
  },
  accent: {
    color: '#55CCC4',
  },
  emailBtn: {
    width: '100%',
    height: 58,
    borderRadius: 10,
    backgroundColor: '#55CCC4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emailBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  signupBtn: {
    width: '100%',
    height: 58,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#55CCC4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  signupBtnText: {
    color: '#55AAA5',
    fontSize: 16,
    fontWeight: '900',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 22,
    marginBottom: 38,
  },
  socialBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialMark: {
    fontSize: 25,
    fontWeight: '900',
  },
  inviteText: {
    color: '#8B95A1',
    fontSize: 14,
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 42,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingTop: 34,
    paddingBottom: 28,
    alignItems: 'stretch',
  },
  closeBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 2,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 18,
    textAlign: 'center',
  },
  modalDesc: {
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 30,
    color: '#111827',
    marginBottom: 26,
  },
  modalInput: {
    height: 58,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  errorText: {
    color: '#E24743',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  modalButton: {
    height: 58,
    borderRadius: 10,
    backgroundColor: '#55CCC4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  socialLargeIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  socialLargeMark: {
    fontSize: 34,
    fontWeight: '900',
  },
});
