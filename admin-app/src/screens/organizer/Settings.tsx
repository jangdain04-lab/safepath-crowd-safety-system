import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { Colors } from '../../components/Colors';
import {
  fetchStaffInviteSettings,
  fetchVisitorInviteSettings,
  fetchEventSettings,
  PlaceSearchResult,
  resolveBackendUrl,
  saveEventSettings,
  saveStaffInviteSettings,
  saveVisitorInviteSettings,
  searchPlaces,
} from '../../services/api';
import {
  clearAuthSession,
  getStoredAuthUser,
  type StoredAuthUser,
} from '../../services/authStorage';
import {
  getOrganizerNotificationPreferences,
  saveOrganizerNotificationPreferences,
} from '../../services/notificationPreferences';

const THEME = {
  primary: '#55CCC4',
  primaryLight: '#E9FFFD',
  dark: '#111827',
};

const PLACE_COUNT = 10;
const SETTINGS_MAP_URL = resolveBackendUrl('/admin-map');
const COORDINATE_PATTERN = /\(([0-9.-]+),\s*([0-9.-]+)\)\s*$/;

type PlaceInfo = {
  eventRange: string;
  searchPlace: string;
  placeDisplayName: string;
  mapUrl?: string;
  cctvLocations: string[];
  placeNames: string[];
  roadAngles: string[];
  roadAreas: string[];
};

const initialPlaceInfo: PlaceInfo = {
  eventRange: '인하대학교 축제 구역',
  searchPlace: '인하대학교',
  placeDisplayName: '인하대학교 축제',
  mapUrl: SETTINGS_MAP_URL,
  cctvLocations: [
    '백년관 버정길 CCTV',
    '자연과학대 앞 CCTV',
    '공대 흡연부스 옆 CCTV',
    '인경관 주차장 입구 CCTV',
    '공대-백년관 사이 CCTV',
    '백년관 잔디구장 CCTV',
  ],
  placeNames: [
    '백년관 버정길',
    '자연과학대 앞',
    '공대 흡연부스 옆',
    '인경관 주차장 입구',
    '공대-백년관 사이',
    '백년관 잔디구장',
  ],
  roadAngles: ['90', '75', '60', '80', '70', '85'],
  roadAreas: ['120', '180', '145', '160', '135', '200'],
};

const emptyInitialPlaceInfo: PlaceInfo = {
  eventRange: '',
  searchPlace: '',
  placeDisplayName: '',
  mapUrl: SETTINGS_MAP_URL,
  cctvLocations: Array.from({ length: PLACE_COUNT }, () => ''),
  placeNames: Array.from({ length: PLACE_COUNT }, () => ''),
  roadAngles: Array.from({ length: PLACE_COUNT }, () => ''),
  roadAreas: Array.from({ length: PLACE_COUNT }, () => ''),
};

export default function Settings() {
  const navigation = useNavigation();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const [placeSettingVisible, setPlaceSettingVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [inviteSettingVisible, setInviteSettingVisible] = useState(false);
  const [selectedStep, setSelectedStep] = useState(1);
  const [selectedNumber, setSelectedNumber] = useState(1);
  const [placeInfo, setPlaceInfo] = useState<PlaceInfo>(emptyInitialPlaceInfo);
  const [placeInfoLoadError, setPlaceInfoLoadError] = useState('');
  const [authUser, setAuthUser] = useState<StoredAuthUser | null>(null);
  const [staffInviteCode, setStaffInviteCode] = useState('');
  const [visitorInviteCode, setVisitorInviteCode] = useState('');
  const [savingStaffInviteCode, setSavingStaffInviteCode] = useState(false);
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [cctvCoordinates, setCctvCoordinates] = useState<Array<{ latitude: number; longitude: number } | null>>(
    Array.from({ length: PLACE_COUNT }, () => null),
  );
  const mapWebViewRef = useRef<WebViewType>(null);
  const selectedIndex = selectedNumber - 1;

  const parseStoredCoordinate = (value: string) => {
    const match = value.match(COORDINATE_PATTERN);

    if (!match) {
      return null;
    }

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return { latitude, longitude };
  };

  const getStoredCctvName = (value: string, fallback: string) => {
    return value.replace(COORDINATE_PATTERN, '').trim() || fallback;
  };

  const setCctvMarkerOnMap = (
    index: number,
    latitude: number,
    longitude: number,
  ) => {
    const script = `
      (function drawCctvMarker(retry) {
        if (window.setCctvMarker) {
          window.setCctvMarker(${JSON.stringify({ index, latitude, longitude })});
          return;
        }
        if (retry > 0) {
          setTimeout(function () { drawCctvMarker(retry - 1); }, 200);
        }
      })(10);
      true;
    `;

    mapWebViewRef.current?.injectJavaScript(script);
  };

  const restoreCctvMarkersAfterMapLoad = () => {
    cctvCoordinates.forEach((coordinate, index) => {
      if (coordinate) {
        setCctvMarkerOnMap(index + 1, coordinate.latitude, coordinate.longitude);
      }
    });
  };

  const updateCctvLocationFromMap = (latitude: number, longitude: number) => {
    setCctvCoordinates((prev) => {
      const updated = [...prev];
      updated[selectedIndex] = { latitude, longitude };
      return updated;
    });

    setPlaceInfo((prev) => {
      const updated = [...prev.cctvLocations];
      const currentName = getStoredCctvName(
        updated[selectedIndex] || '',
        '',
      );
      updated[selectedIndex] = currentName
        ? `${currentName} (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`
        : '';

      return {
        ...prev,
        cctvLocations: updated,
      };
    });

    setCctvMarkerOnMap(selectedNumber, latitude, longitude);
  };

  const handleMapMessage = (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);

      if (payload.type === 'place_search_result') {
        const displayName = payload.name || payload.address || placeInfo.searchPlace;

        setPlaceInfo((prev) => ({
          ...prev,
          eventRange: displayName,
          placeDisplayName: displayName,
        }));
        return;
      }

      if (payload.type === 'place_search_error') {
        Alert.alert('장소 검색 실패', payload.message || '장소를 찾지 못했습니다.');
        return;
      }

      if (payload.type === 'map_click' && selectedStep === 2) {
        updateCctvLocationFromMap(Number(payload.latitude), Number(payload.longitude));
      }
    } catch (error) {
      // Ignore unrelated WebView messages.
    }
  };

  const searchPlaceOnMap = async () => {
    const query = placeInfo.searchPlace.trim();

    if (!query) {
      Alert.alert('검색어 필요', '검색할 장소를 입력해주세요.');
      return;
    }

    try {
      setSearchingPlace(true);

      const results = await searchPlaces(query);
      setPlaceResults(results);

      if (results.length === 0) {
        Alert.alert('검색 결과 없음', '다른 장소명이나 주소로 다시 검색해주세요.');
      } else {
        selectPlaceResult(results[0]);
      }
    } catch (error) {
      Alert.alert('장소 검색 실패', '네이버 장소 검색 연결을 확인해주세요.');
    } finally {
      setSearchingPlace(false);
    }
  };

  const selectPlaceResult = (result: PlaceSearchResult) => {
    const address = result.roadAddress || result.address;
    const displayName = result.title || address;
    const query = address || displayName;

    setPlaceResults([]);
    setPlaceInfo((prev) => ({
      ...prev,
      searchPlace: displayName,
      placeDisplayName: displayName,
      eventRange: prev.eventRange || displayName,
    }));

    const script = `
      if (window.moveToCoordinates) {
        window.moveToCoordinates(${JSON.stringify({
          name: displayName,
          address: query,
          latitude: result.latitude,
          longitude: result.longitude,
        })});
      }
      true;
    `;

    mapWebViewRef.current?.injectJavaScript(script);
  };

  const updateArrayValue = (
    key: 'cctvLocations' | 'placeNames' | 'roadAngles' | 'roadAreas',
    index: number,
    value: string,
  ) => {
    setPlaceInfo((prev) => {
      const updated = [...prev[key]];
      updated[index] = value;

      return {
        ...prev,
        [key]: updated,
      };
    });
  };

  const loadPlaceInfo = async () => {
    try {
      const settings = await fetchEventSettings();
      setPlaceInfoLoadError('');
      setPlaceInfo({
        ...settings,
        mapUrl: SETTINGS_MAP_URL,
      });
      setCctvCoordinates(
        Array.from({ length: PLACE_COUNT }, (_, index) => (
          settings.cctvLocations[index]
            ? parseStoredCoordinate(settings.cctvLocations[index])
            : null
        )),
      );
    } catch (error) {
      console.warn('Failed to load event settings', error);
      setPlaceInfoLoadError('백엔드 장소 정보를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    loadPlaceInfo();
    getStoredAuthUser().then(setAuthUser);
    fetchStaffInviteSettings()
      .then((settings) => setStaffInviteCode(settings.code))
      .catch(() => setStaffInviteCode(''));
    fetchVisitorInviteSettings()
      .then((settings) => setVisitorInviteCode(settings.code))
      .catch(() => setVisitorInviteCode(''));
    getOrganizerNotificationPreferences().then((preferences) => {
      setNotificationsEnabled(preferences.pushEnabled);
      setSoundEnabled(preferences.soundEnabled);
      setDarkMode(preferences.darkMode);
    });
  }, []);

  useEffect(() => {
    if (placeSettingVisible) {
      loadPlaceInfo();
    }
  }, [placeSettingVisible]);

  const savePlaceInfo = async () => {
    try {
      const saved = await saveEventSettings({
        ...placeInfo,
        mapUrl: SETTINGS_MAP_URL,
        placeDisplayName: placeInfo.placeDisplayName || placeInfo.searchPlace,
        eventRange: placeInfo.eventRange || placeInfo.searchPlace,
        cctvLocations: placeInfo.cctvLocations.map((location, index) => {
          const coordinate = cctvCoordinates[index] || parseStoredCoordinate(location);
          const name = getStoredCctvName(location, '');

          if (!coordinate || !name) {
            return name;
          }

          return `${name} (${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)})`;
        }),
      });
      setPlaceInfo({
        ...saved,
        mapUrl: SETTINGS_MAP_URL,
      });
      Alert.alert('저장 완료', '장소 정보 설정이 수정되었습니다.');
      setPlaceSettingVisible(false);
    } catch (error) {
      Alert.alert('저장 실패', '백엔드 서버 연결을 확인해주세요.');
    }
  };

  const renderNumberTabs = () => (
    <View style={styles.cctvNumberTabs}>
      {Array.from({ length: PLACE_COUNT }, (_, index) => {
        const number = index + 1;
        const active = selectedNumber === number;

        return (
          <TouchableOpacity
            key={number}
            style={[styles.cctvNumberTab, active && styles.cctvNumberTabActive]}
            onPress={() => {
              setSelectedNumber(number);
              const coordinate = cctvCoordinates[index]
                || parseStoredCoordinate(placeInfo.cctvLocations[index] || '');

              if (coordinate) {
                setCctvMarkerOnMap(number, coordinate.latitude, coordinate.longitude);
              }
            }}
          >
            <Text style={[styles.cctvNumberText, active && styles.cctvNumberTextActive]}>
              {number}번
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const profileName = authUser?.name?.trim()
    || (authUser?.providerLabel ? `${authUser.providerLabel} 사용자` : '주최자');
  const profileEmail = authUser?.email?.trim() || '로그인 계정 정보 없음';
  const profileProvider = authUser?.providerLabel || authUser?.provider || '계정';
  const isReadOnlyUser = authUser?.role === 'staff_viewer';
  const profileRole = authUser?.role === 'organizer'
    ? '관리자'
    : isReadOnlyUser
      ? '읽기 전용 스태프'
      : (authUser?.role || '관리자');

  const saveStaffInviteCodeSetting = async () => {
    const staffCode = staffInviteCode.trim();
    const visitorCode = visitorInviteCode.trim();

    if (!staffCode || !visitorCode) {
      Alert.alert('초대코드 필요', '사용할 초대코드를 입력해주세요.');
      return;
    }

    try {
      setSavingStaffInviteCode(true);
      const [savedStaff, savedVisitor] = await Promise.all([
        saveStaffInviteSettings(staffCode),
        saveVisitorInviteSettings(visitorCode),
      ]);
      setStaffInviteCode(savedStaff.code);
      setVisitorInviteCode(savedVisitor.code);
      Alert.alert('저장 완료', '초대코드가 저장되었습니다.');
      setInviteSettingVisible(false);
    } catch (error) {
      Alert.alert('저장 실패', '초대코드가 중복되었거나 서버 연결에 실패했습니다.');
    } finally {
      setSavingStaffInviteCode(false);
    }
  };

  const handleLogout = async () => {
    await clearAuthSession();

    const resetToLogin = CommonActions.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });

    const rootNavigation = navigation.getParent('RootStack');

    if (rootNavigation) {
      rootNavigation.dispatch(resetToLogin);
      return;
    }

    navigation.dispatch(resetToLogin);
  };

  const handleNotificationsEnabledChange = async (value: boolean) => {
    setNotificationsEnabled(value);

    if (!value) {
      setSoundEnabled(false);
    }

    await saveOrganizerNotificationPreferences({
      pushEnabled: value,
      soundEnabled: value ? soundEnabled : false,
    });
  };

  const handleSoundEnabledChange = async (value: boolean) => {
    setSoundEnabled(value);

    await saveOrganizerNotificationPreferences({
      soundEnabled: value,
    });
  };

  const handleDarkModeChange = async (value: boolean) => {
    setDarkMode(value);

    await saveOrganizerNotificationPreferences({
      darkMode: value,
    });
  };

  const sections = [
    {
      title: '알림 설정',
      items: [
        {
          icon: 'notifications',
          label: '푸시 알림',
          type: 'toggle',
          value: notificationsEnabled,
          onChange: handleNotificationsEnabledChange,
        },
        {
          icon: 'volume-high',
          label: '알림음',
          type: 'toggle',
          value: soundEnabled,
          onChange: handleSoundEnabledChange,
        },
      ],
    },
    {
      title: '계정',
      items: [
        ...(!isReadOnlyUser ? [{
          icon: 'key',
          label: '초대코드 설정',
          type: 'link',
          onPress: () => setInviteSettingVisible(true),
        }] : []),
        {
          icon: 'shield-checkmark',
          label: '보안 설정',
          type: 'link',
          onPress: () => Alert.alert('준비 중'),
        },
      ],
    },
    {
      title: '앱 정보',
      items: [
        {
          icon: 'information-circle',
          label: '버전 정보',
          type: 'info',
          value: '1.0.0',
        },
        {
          icon: 'document-text',
          label: '개인정보처리방침',
          type: 'link',
          onPress: () => Alert.alert('준비 중'),
        },
      ],
    },
  ];

  if (inviteSettingVisible) {
    return (
      <View style={styles.placeScreen}>
        <View style={styles.placeHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setInviteSettingVisible(false)}
          >
            <Ionicons name="arrow-back" size={26} color={THEME.dark} />
          </TouchableOpacity>

          <View>
            <Text style={styles.placeHeaderTitle}>초대코드 설정</Text>
            <Text style={styles.placeHeaderSub}>읽기 전용 스태프 입장 코드를 관리합니다</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.placeScrollContent}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>스태프 초대코드</Text>
            <Text style={styles.editDesc}>
              이 코드로 입장한 사용자는 이름을 입력한 뒤 앱을 볼 수만 있고, 설정이나 발송 기능은 사용할 수 없습니다.
            </Text>

            <Text style={styles.inputLabel}>관리자용 초대코드</Text>
            <TextInput
              style={styles.input}
              value={staffInviteCode}
              onChangeText={setStaffInviteCode}
              placeholder="예: STAFF2026"
              placeholderTextColor="#AEB6C2"
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>관람객용 초대코드</Text>
            <TextInput
              style={styles.input}
              value={visitorInviteCode}
              onChangeText={setVisitorInviteCode}
              placeholder="예: VISITOR2026"
              placeholderTextColor="#AEB6C2"
              autoCapitalize="characters"
            />
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={savingStaffInviteCode ? undefined : saveStaffInviteCodeSetting}
          >
            <Text style={styles.saveButtonText}>
              {savingStaffInviteCode ? '저장 중...' : '저장하기'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (profileVisible) {
    return (
      <View style={styles.placeScreen}>
        <View style={styles.placeHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setProfileVisible(false)}
          >
            <Ionicons name="arrow-back" size={26} color={THEME.dark} />
          </TouchableOpacity>

          <View>
            <Text style={styles.placeHeaderTitle}>내 정보</Text>
            <Text style={styles.placeHeaderSub}>로그인 계정 정보를 확인합니다</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.placeScrollContent}>
          <View style={[styles.profileCard, styles.profileDetailCard]}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={34} color={THEME.primary} />
            </View>

            <View style={styles.profileTextWrap}>
              <Text style={styles.profileName}>{profileName}</Text>
              <Text style={styles.profileEmail}>{profileEmail}</Text>
              <Text style={styles.profileProvider}>{profileProvider}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={[styles.settingItem, styles.settingItemBorder]}>
              <View style={styles.settingLeft}>
                <View style={styles.iconBox}>
                  <Ionicons name="mail" size={20} color={THEME.primary} />
                </View>
                <Text style={styles.settingLabel}>이메일</Text>
              </View>
              <Text style={[styles.settingValue, styles.emailSettingValue]}>{profileEmail}</Text>
            </View>

            <View style={[styles.settingItem, styles.settingItemBorder]}>
              <View style={styles.settingLeft}>
                <View style={styles.iconBox}>
                  <Ionicons name="person-circle" size={20} color={THEME.primary} />
                </View>
                <Text style={styles.settingLabel}>권한</Text>
              </View>
              <Text style={styles.settingValue}>{profileRole}</Text>
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.iconBox}>
                  <Ionicons name="key" size={20} color={THEME.primary} />
                </View>
                <Text style={styles.settingLabel}>로그인 방식</Text>
              </View>
              <Text style={styles.settingValue}>{profileProvider}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (placeSettingVisible) {
    return (
      <View style={styles.placeScreen}>
        <View style={styles.placeHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setPlaceSettingVisible(false)}
          >
            <Ionicons name="arrow-back" size={26} color={THEME.dark} />
          </TouchableOpacity>

          <View>
            <Text style={styles.placeHeaderTitle}>장소 정보 설정</Text>
            <Text style={styles.placeHeaderSub}>Step 1~5 데이터를 수정합니다</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.placeScrollContent}
        >
          {placeInfoLoadError.length > 0 && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={20} color="#D0453B" />
              <Text style={styles.errorText}>{placeInfoLoadError}</Text>
            </View>
          )}

          <View style={styles.stepTabs}>
            {[1, 2, 3, 4, 5].map((step) => (
              <TouchableOpacity
                key={step}
                style={[
                  styles.stepTab,
                  selectedStep === step && styles.stepTabActive,
                ]}
                onPress={() => {
                  setSelectedStep(step);
                  setSelectedNumber(1);
                }}
              >
                <Text
                  style={[
                    styles.stepTabText,
                    selectedStep === step && styles.stepTabTextActive,
                  ]}
                >
                  {step}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.editCard}>
            {selectedStep === 1 && (
              <>
                <Text style={styles.editTitle}>STEP 1. 행사 장소 범위</Text>
                <Text style={styles.editDesc}>
                  지도에서 행사 장소를 확인하고 장소 이름과 범위를 수정합니다.
                </Text>

                <Text style={styles.inputLabel}>장소 검색</Text>
                <View style={styles.searchInputBox}>
                  <TextInput
                    style={styles.searchTextInput}
                    value={placeInfo.searchPlace}
                    onChangeText={(text) =>
                      setPlaceInfo((prev) => ({
                        ...prev,
                        searchPlace: text,
                        placeDisplayName: prev.placeDisplayName || text,
                      }))
                    }
                    placeholder="장소를 검색하세요"
                    placeholderTextColor="#AEB6C2"
                    returnKeyType="search"
                    onSubmitEditing={searchPlaceOnMap}
                  />
                  <TouchableOpacity onPress={searchPlaceOnMap} hitSlop={12}>
                    <Ionicons name="search-outline" size={22} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                {placeResults.length > 0 && (
                  <View style={styles.placeResultList}>
                    {placeResults.map((result, index) => (
                      <TouchableOpacity
                        key={`${result.title}-${result.roadAddress || result.address}-${index}`}
                        style={styles.placeResultItem}
                        onPress={() => selectPlaceResult(result)}
                      >
                        <Text style={styles.placeResultTitle}>{result.title}</Text>
                        <Text style={styles.placeResultAddress}>
                          {result.roadAddress || result.address}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {searchingPlace && (
                  <Text style={styles.searchingText}>장소를 검색하고 있습니다...</Text>
                )}

                <View style={styles.mapContainer}>
                  <WebView
                    ref={mapWebViewRef}
                    source={{
                      uri: SETTINGS_MAP_URL,
                      headers: {
                        'ngrok-skip-browser-warning': 'true',
                      },
                    }}
                    style={styles.webview}
                    javaScriptEnabled
                    domStorageEnabled
                    geolocationEnabled
                    originWhitelist={['*']}
                    mixedContentMode="always"
                    onMessage={handleMapMessage}
                    onLoadEnd={restoreCctvMarkersAfterMapLoad}
                  />
                </View>

                <Text style={styles.inputLabel}>장소 이름</Text>
                <TextInput
                  style={styles.input}
                  value={placeInfo.placeDisplayName}
                  onChangeText={(text) =>
                    setPlaceInfo((prev) => ({
                      ...prev,
                      placeDisplayName: text,
                    }))
                  }
                  placeholder="장소 이름을 입력하세요"
                  placeholderTextColor="#AEB6C2"
                />

                <Text style={styles.inputLabel}>행사 범위</Text>
                <TextInput
                  style={styles.input}
                  value={placeInfo.eventRange}
                  onChangeText={(text) =>
                    setPlaceInfo((prev) => ({
                      ...prev,
                      eventRange: text,
                    }))
                  }
                  placeholder="행사 장소 범위를 입력하세요"
                  placeholderTextColor="#AEB6C2"
                />
              </>
            )}

            {selectedStep === 2 && (
              <>
                <Text style={styles.editTitle}>STEP 2. CCTV 위치</Text>
                <Text style={styles.editDesc}>
                  지도에서 CCTV 위치를 확인하고 각 CCTV 이름을 수정합니다.
                </Text>

                {renderNumberTabs()}

                <Text style={styles.inputLabel}>{selectedNumber}번 CCTV 이름</Text>
                <TextInput
                  style={styles.input}
                  value={getStoredCctvName(
                    placeInfo.cctvLocations[selectedIndex] || '',
                    '',
                  )}
                  onChangeText={(text) =>
                    updateArrayValue('cctvLocations', selectedIndex, text)
                  }
                  placeholder="CCTV 이름을 입력하세요"
                  placeholderTextColor="#AEB6C2"
                />

                <View style={styles.mapContainer}>
                  <WebView
                    ref={mapWebViewRef}
                    source={{
                      uri: SETTINGS_MAP_URL,
                      headers: {
                        'ngrok-skip-browser-warning': 'true',
                      },
                    }}
                    style={styles.webview}
                    javaScriptEnabled
                    domStorageEnabled
                    geolocationEnabled
                    originWhitelist={['*']}
                    mixedContentMode="always"
                    onMessage={handleMapMessage}
                    onLoadEnd={restoreCctvMarkersAfterMapLoad}
                  />
                </View>
              </>
            )}

            {selectedStep === 3 && (
              <>
                <Text style={styles.editTitle}>STEP 3. 장소 이름</Text>
                <Text style={styles.editDesc}>
                  각 CCTV 또는 구역에 연결된 장소명을 수정합니다.
                </Text>

                {renderNumberTabs()}

                <Text style={styles.inputLabel}>{selectedNumber}번 장소</Text>
                <TextInput
                  style={styles.input}
                  value={placeInfo.placeNames[selectedIndex] || ''}
                  onChangeText={(text) =>
                    updateArrayValue('placeNames', selectedIndex, text)
                  }
                  placeholder="장소 이름을 입력하세요"
                  placeholderTextColor="#AEB6C2"
                />

                <View style={styles.mapContainer}>
                  <WebView
                    ref={mapWebViewRef}
                    source={{
                      uri: SETTINGS_MAP_URL,
                      headers: {
                        'ngrok-skip-browser-warning': 'true',
                      },
                    }}
                    style={styles.webview}
                    javaScriptEnabled
                    domStorageEnabled
                    geolocationEnabled
                    originWhitelist={['*']}
                    mixedContentMode="always"
                    onMessage={handleMapMessage}
                    onLoadEnd={restoreCctvMarkersAfterMapLoad}
                  />
                </View>
              </>
            )}

            {selectedStep === 4 && (
              <>
                <Text style={styles.editTitle}>STEP 4. 각 길의 각도</Text>
                <Text style={styles.editDesc}>
                  각 장소별 길의 각도 정보를 수정합니다.
                </Text>

                {renderNumberTabs()}

                <Text style={styles.inputLabel}>
                  {placeInfo.placeNames[selectedIndex] || `${selectedNumber}번 장소`} 각도
                </Text>
                <TextInput
                  style={styles.input}
                  value={placeInfo.roadAngles[selectedIndex] || ''}
                  onChangeText={(text) =>
                    updateArrayValue('roadAngles', selectedIndex, text)
                  }
                  placeholder="예: 90"
                  placeholderTextColor="#AEB6C2"
                  keyboardType="numeric"
                />
              </>
            )}

            {selectedStep === 5 && (
              <>
                <Text style={styles.editTitle}>STEP 5. 각 길의 면적</Text>
                <Text style={styles.editDesc}>
                  각 장소별 길의 면적 정보를 수정합니다.
                </Text>

                {renderNumberTabs()}

                <Text style={styles.inputLabel}>
                  {placeInfo.placeNames[selectedIndex] || `${selectedNumber}번 장소`} 면적
                </Text>
                <TextInput
                  style={styles.input}
                  value={placeInfo.roadAreas[selectedIndex] || ''}
                  onChangeText={(text) =>
                    updateArrayValue('roadAreas', selectedIndex, text)
                  }
                  placeholder="예: 120"
                  placeholderTextColor="#AEB6C2"
                  keyboardType="numeric"
                />
              </>
            )}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={savePlaceInfo}>
            <Text style={styles.saveButtonText}>저장하기</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={THEME.dark} />
        </TouchableOpacity>

        <View>
          <Text style={styles.title}>설정</Text>
          <Text style={styles.subtitle}>앱 환경 설정</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.85}
          onPress={() => setProfileVisible(true)}
        >
          <View style={styles.avatar}>
            <Ionicons name="person" size={34} color={THEME.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileEmail}>{profileEmail}</Text>
            <Text style={styles.profileProvider}>{profileProvider}</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={Colors.textMuted}
          />
        </TouchableOpacity>

        {!isReadOnlyUser && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>행사 설정</Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.placeSettingCard}
              onPress={() => setPlaceSettingVisible(true)}
            >
              <View style={styles.settingLeft}>
                <View style={styles.iconBox}>
                  <Ionicons name="map" size={22} color={THEME.primary} />
                </View>

                <View>
                  <Text style={styles.settingLabel}>장소 정보 설정</Text>
                  <Text style={styles.settingSub}>
                    Step 1~5 입력 정보를 수정합니다
                  </Text>
                </View>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        )}

        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            <View style={styles.sectionCard}>
              {section.items.map((item: any, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.settingItem,
                    i < section.items.length - 1 && styles.settingItemBorder,
                  ]}
                  onPress={item.type === 'link' ? item.onPress : undefined}
                  activeOpacity={item.type === 'link' ? 0.7 : 1}
                >
                  <View style={styles.settingLeft}>
                    <View style={styles.iconBox}>
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={THEME.primary}
                      />
                    </View>

                    <Text style={styles.settingLabel}>{item.label}</Text>
                  </View>

                  {item.type === 'toggle' && (
                    <View style={styles.switchWrap}>
                      <Switch
                        value={item.value}
                        onValueChange={isReadOnlyUser ? undefined : item.onChange}
                        disabled={isReadOnlyUser}
                        trackColor={{
                          false: Colors.border,
                          true: THEME.primary,
                        }}
                        thumbColor={Colors.white}
                      />
                    </View>
                  )}

                  {item.type === 'link' && (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={Colors.textMuted}
                    />
                  )}

                  {item.type === 'info' && (
                    <Text style={styles.settingValue}>{item.value}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.logoutSection}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() =>
              Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
                { text: '취소', style: 'cancel' },
                {
                  text: '로그아웃',
                  style: 'destructive',
                  onPress: handleLogout,
                },
              ])
            }
          >
            <Ionicons name="log-out" size={18} color={Colors.danger} />
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: Colors.white,
  },

  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '900',
    color: THEME.dark,
  },

  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    margin: 24,
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 28,
  },

  profileDetailCard: {
    margin: 0,
    marginBottom: 18,
    width: '100%',
  },

  profileTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: THEME.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileName: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.dark,
  },

  profileEmail: {
    fontSize: 17,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
    flexShrink: 1,
  },

  profileProvider: {
    fontSize: 13,
    color: THEME.primary,
    marginTop: 6,
    fontWeight: '800',
  },

  section: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 12,
    paddingLeft: 4,
  },

  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    overflow: 'hidden',
  },

  placeSettingCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingItem: {
    minHeight: 78,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: THEME.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },

  settingLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.dark,
  },

  settingSub: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 4,
  },

  settingValue: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },

  emailSettingValue: {
    flex: 1,
    marginLeft: 12,
    lineHeight: 21,
  },

  switchWrap: {
    width: 58,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    alignSelf: 'center',
  },

  logoutSection: {
    paddingHorizontal: 24,
    marginTop: 4,
  },

  logoutBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFF1F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  logoutText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },

  placeScreen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: Colors.white,
  },

  placeHeaderTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: THEME.dark,
  },

  placeHeaderSub: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },

  placeScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 120,
  },

  errorBox: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#FFF1F1',
    borderWidth: 1,
    borderColor: '#F3CFCF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#D0453B',
  },

  stepTabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 18,
    padding: 5,
    marginBottom: 22,
  },

  stepTab: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepTabActive: {
    backgroundColor: THEME.primary,
  },

  stepTabText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.textSecondary,
  },

  stepTabTextActive: {
    color: Colors.white,
  },

  cctvNumberTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },

  cctvNumberTab: {
    minWidth: 54,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  cctvNumberTabActive: {
    backgroundColor: THEME.primary,
  },

  cctvNumberText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.textSecondary,
  },

  cctvNumberTextActive: {
    color: Colors.white,
  },

  editCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
  },

  editTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 8,
  },

  editDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 8,
  },

  input: {
    height: 58,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.dark,
    marginBottom: 14,
  },

  searchInputBox: {
    height: 58,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  searchTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.dark,
  },

  placeResultList: {
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 14,
  },

  placeResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  placeResultTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: THEME.dark,
  },

  placeResultAddress: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 4,
  },

  searchingText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.primary,
    marginBottom: 14,
  },

  mapContainer: {
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  webview: {
    flex: 1,
  },

  saveButton: {
    height: 60,
    borderRadius: 18,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.white,
  },
});
