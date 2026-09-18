import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { verifyInviteCode } from '../services/api';

const SPLASH_MS = 1300;
const INVITE_ACCEPTED_KEY = 'safepath:visitor:inviteAccepted';
const INVITE_OWNER_EMAIL_KEY = 'safepath:visitor:settingsOwnerEmail';
const VISITOR_LOGOUT_EVENT = 'safepath:visitor:logout';

export async function resetVisitorInviteSession() {
  await AsyncStorage.removeItem(INVITE_ACCEPTED_KEY);
  await AsyncStorage.removeItem(INVITE_OWNER_EMAIL_KEY);
  DeviceEventEmitter.emit(VISITOR_LOGOUT_EVENT);
}

const COLORS = {
  text: '#111827',
  muted: '#8B95A1',
  mint: '#7BCBC6',
  line: '#D1D5DB',
};

export function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showSplash, setShowSplash] = useState(true);
  const [inviteAccepted, setInviteAccepted] = useState(false);

  useEffect(() => {
    let mounted = true;
    const logoutSubscription = DeviceEventEmitter.addListener(
      VISITOR_LOGOUT_EVENT,
      () => {
        if (mounted) {
          setShowSplash(false);
          setInviteAccepted(false);
        }
      },
    );

    const prepare = async () => {
      try {
        const savedInviteAccepted = await AsyncStorage.getItem(INVITE_ACCEPTED_KEY);
        const savedOwnerEmail = await AsyncStorage.getItem(INVITE_OWNER_EMAIL_KEY);

        if (mounted && savedInviteAccepted === 'true' && savedOwnerEmail) {
          setInviteAccepted(true);
        } else if (savedInviteAccepted === 'true' && !savedOwnerEmail) {
          await AsyncStorage.removeItem(INVITE_ACCEPTED_KEY);
        }
      } catch (err) {
        console.warn('Failed to load invite state', err);
      } finally {
        setTimeout(() => {
          if (mounted) {
            setShowSplash(false);
          }
        }, SPLASH_MS);
      }
    };

    prepare();

    return () => {
      mounted = false;
      logoutSubscription.remove();
    };
  }, []);

  const completeInvite = async (settingsOwnerEmail?: string | null) => {
    setInviteAccepted(true);

    try {
      await AsyncStorage.setItem(INVITE_ACCEPTED_KEY, 'true');

      if (settingsOwnerEmail) {
        await AsyncStorage.setItem(INVITE_OWNER_EMAIL_KEY, settingsOwnerEmail);
      } else {
        await AsyncStorage.removeItem(INVITE_OWNER_EMAIL_KEY);
      }
    } catch (err) {
      console.warn('Failed to save invite state', err);
    }
  };

  if (showSplash) return <SplashScreen />;

  if (!inviteAccepted) {
    return (
      <InviteCodeScreen onComplete={completeInvite} />
    );
  }

  return <>{children}</>;
}

function SplashScreen() {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(
    Math.max(Math.min(width, height) / 390, 0.88),
    1.16,
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Text style={[styles.brand, { fontSize: 43 * scale }]}>
          SAFE<Text style={styles.brandMint}>PATH</Text>
        </Text>
      </View>

      <View
        style={[
          styles.splashLoader,
          {
            bottom: Math.max(36, height * 0.055),
          },
        ]}
      >
        <ActivityIndicator color={COLORS.mint} />
      </View>
    </SafeAreaView>
  );
}

function InviteCodeScreen({
  onComplete,
}: {
  onComplete: (settingsOwnerEmail?: string | null) => void;
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 390, 0.88), 1.12);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const submit = async () => {
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError('초대코드를 입력해주세요');
      return;
    }

    setError('');
    setIsChecking(true);

    try {
      const result = await verifyInviteCode(trimmedCode);

      if (!result.valid) {
        setError(result.message || '유효하지 않은 초대코드입니다.');
        return;
      }

      if (!result.settings_owner_email) {
        setError('관리자 계정에 연결되지 않은 초대코드입니다.');
        return;
      }

      onComplete(result.settings_owner_email);
    } catch (err) {
      setError(err instanceof Error ? err.message : '서버 연결을 확인해주세요.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inviteContainer}
      >
        <View style={styles.inviteTop}>
          <Text style={[styles.brand, { fontSize: 38 * scale, marginTop: 0 }]}>
            SAFE<Text style={styles.brandMint}>PATH</Text>
          </Text>

          <Text style={[styles.slogan, { fontSize: 28 * scale }]}>
            모두의 <Text style={styles.sloganMint}>안전한</Text> 길을 만들다.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.formTitle, { fontSize: 18 * scale }]}>
            초대코드를 입력해주세요
          </Text>

          <TextInput
            value={code}
            onChangeText={(value) => {
              setCode(value);
              if (error) setError('');
            }}
            placeholder="초대코드 입력란"
            placeholderTextColor="#7A7F87"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={submit}
            editable={!isChecking}
            style={[
              styles.input,
              {
                fontSize: 17 * scale,
              },
            ]}
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            activeOpacity={0.86}
            style={[
              styles.confirmButton,
              (!code.trim() || isChecking) && styles.confirmDisabled,
            ]}
            onPress={isChecking ? undefined : submit}
          >
            <Text style={styles.confirmText}>초대 코드 확인</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  splashLoader: {
    position: 'absolute',
    alignSelf: 'center',
  },

  brand: {
    color: COLORS.text,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 58,
  },

  brandMint: {
    color: COLORS.mint,
  },

  inviteContainer: {
    flex: 1,
    paddingHorizontal: 35,
    justifyContent: 'center',
  },

  inviteTop: {
    alignItems: 'center',
    marginBottom: 86,
  },

  slogan: {
    color: COLORS.text,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0,
    marginTop: 50,
  },

  sloganMint: {
    color: COLORS.mint,
  },

  form: {
    width: '100%',
    alignSelf: 'center',
  },

  formTitle: {
    color: COLORS.text,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 26,
  },

  input: {
    height: 64,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 18,
    color: COLORS.text,
    textAlign: 'center',
    fontWeight: '600',
    backgroundColor: '#fff',
  },

  errorText: {
    color: '#E24743',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 9,
    textAlign: 'center',
  },

  confirmButton: {
    height: 58,
    borderRadius: 10,
    backgroundColor: COLORS.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  confirmDisabled: {
    opacity: 0.68,
  },

  confirmText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },
});
