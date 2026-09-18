import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Colors } from '../../components/Colors';
import {
  assignStaffToZone,
  applyRelocationRecommendation,
  createStaff,
  deleteStaff,
  fetchRelocationRecommendations,
  fetchStaff,
  fetchZonesLive,
  RelocationRecommendation,
  RelocationResponse,
  StaffMember,
  unassignStaffFromZone,
} from '../../services/api';
import { getStoredAuthUser } from '../../services/authStorage';

const THEME = {
  primary: '#55CCC4',
  primaryLight: '#EFFFFD',
  dark: '#111827',
  safe: '#16A34A',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const MAP_URL = 'https://generous-maternity-smugness.ngrok-free.dev/map';

type Staff = {
  id?: number;
  name: string;
  role: string;
  sector: string;
  phone?: string | null;
  email?: string | null;
  zoneId?: string | null;
};

type Sector = {
  id: number;
  zoneId?: string;
  title: string;
  count: number;
  status: 'danger' | 'safe' | 'warning';
  people: Staff[];
};

type HeatmapMode = 'summary' | 'map';

const initialSectorStaff: Sector[] = [
  {
    id: 1,
    title: '백년관 버정길',
    count: 53,
    status: 'danger',
    people: [{ name: '김민수', role: '안전관리', sector: '백년관 버정길' }],
  },
  {
    id: 2,
    title: '자연과학대 앞',
    count: 28,
    status: 'safe',
    people: [
      { name: '이지은', role: '안전관리', sector: '자연과학대 앞' },
      { name: '박준호', role: '의료지원', sector: '자연과학대 앞' },
      { name: '최수진', role: '안전관리', sector: '자연과학대 앞' },
    ],
  },
  {
    id: 3,
    title: '공대 흡연부스 옆',
    count: 35,
    status: 'warning',
    people: [
      { name: '정다운', role: '안전관리', sector: '공대 흡연부스 옆' },
      { name: '강태영', role: '의료지원', sector: '공대 흡연부스 옆' },
    ],
  },
  {
    id: 4,
    title: '인경관 주차장 입구',
    count: 16,
    status: 'safe',
    people: [
      { name: '윤서연', role: '안전관리', sector: '인경관 주차장 입구' },
      { name: '한지훈', role: '안전관리', sector: '인경관 주차장 입구' },
    ],
  },
  {
    id: 5,
    title: '공대-백년관 사이',
    count: 44,
    status: 'danger',
    people: [
      { name: '임유진', role: '의료지원', sector: '공대-백년관 사이' },
      { name: '송민재', role: '안전관리', sector: '공대-백년관 사이' },
    ],
  },
  {
    id: 6,
    title: '백년관 잔디구장',
    count: 15,
    status: 'safe',
    people: [
      { name: '조서영', role: '안전관리', sector: '백년관 잔디구장' },
      { name: '배현우', role: '의료지원', sector: '백년관 잔디구장' },
      { name: '류지민', role: '안전관리', sector: '백년관 잔디구장' },
    ],
  },
];

const allStaff: Staff[] = [
  { name: '김민수', role: '안전관리', sector: '백년관 버정길' },
  { name: '이지은', role: '안전관리', sector: '자연과학대 앞' },
  { name: '박준호', role: '의료지원', sector: '자연과학대 앞' },
  { name: '최수진', role: '안전관리', sector: '자연과학대 앞' },
  { name: '정다운', role: '안전관리', sector: '공대 흡연부스 옆' },
  { name: '강태영', role: '의료지원', sector: '공대 흡연부스 옆' },
  { name: '윤서연', role: '안전관리', sector: '인경관 주차장 입구' },
  { name: '한지훈', role: '안전관리', sector: '인경관 주차장 입구' },
  { name: '임유진', role: '의료지원', sector: '공대-백년관 사이' },
  { name: '송민재', role: '안전관리', sector: '공대-백년관 사이' },
  { name: '조서영', role: '안전관리', sector: '백년관 잔디구장' },
  { name: '배현우', role: '의료지원', sector: '백년관 잔디구장' },
  { name: '류지민', role: '안전관리', sector: '백년관 잔디구장' },
];

function getLevelLabel(status: Sector['status']) {
  if (status === 'danger') return '위험';
  if (status === 'warning') return '주의';
  return '여유';
}

function getLevelColor(status: Sector['status']) {
  if (status === 'danger') return THEME.danger;
  if (status === 'warning') return THEME.warning;
  return THEME.safe;
}

function getLevelBg(status: Sector['status']) {
  if (status === 'danger') return '#FEE2E2';
  if (status === 'warning') return '#FEF3C7';
  return '#DCFCE7';
}

export default function SectorMonitoring() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSectorId, setSelectedSectorId] = useState<number | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('summary');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('안전관리');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffZoneId, setNewStaffZoneId] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);
  const [isReadOnlyUser, setIsReadOnlyUser] = useState(false);
  const [relocation, setRelocation] = useState<RelocationResponse | null>(null);
  const [loadingRelocation, setLoadingRelocation] = useState(false);
  const [applyingRelocationKey, setApplyingRelocationKey] = useState<string | null>(null);

  const selectedSector =
    sectors.find((sector) => sector.id === selectedSectorId) ?? null;
  const waitingStaff = staffList.filter((staff) => !staff.zoneId);

  const getSectorTitle = (zoneId: string) => (
    sectors.find((sector) => sector.zoneId === zoneId || String(sector.id) === zoneId)?.title
    ?? `${zoneId}구역`
  );

  const getSectorByZoneId = (zoneId: string) => (
    sectors.find((sector) => sector.zoneId === zoneId || String(sector.id) === zoneId)
  );

  const toScreenStaff = (staff: StaffMember): Staff => ({
    id: staff.id,
    name: staff.name,
    role: staff.role,
    sector: staff.sector ?? '미배치',
    phone: staff.phone,
    email: staff.email,
    zoneId: staff.zone_id,
  });

  const loadStaff = async () => {
    try {
      const staff = await fetchStaff();
      const mappedStaff = staff.map(toScreenStaff);

      setStaffList(mappedStaff);
      setSectors((prev) =>
        prev.map((sector) => ({
          ...sector,
          people: mappedStaff.filter(
            (person) =>
              person.zoneId === sector.zoneId ||
              person.sector === sector.title,
          ),
        })),
      );
    } catch (error) {
      console.warn('Failed to load staff', error);
    }
  };

  const loadRelocation = async () => {
    try {
      setLoadingRelocation(true);
      const result = await fetchRelocationRecommendations();
      setRelocation(result);
    } catch (error) {
      console.warn('Failed to load relocation recommendations', error);
      setRelocation({
        total_supply: 0,
        total_demand: 0,
        flow_amount: 0,
        shortage: 0,
        recommendations: [],
        message: '인력재배치 필요없음',
      });
    } finally {
      setLoadingRelocation(false);
    }
  };

  const handleApplyRelocation = async (
    recommendation: RelocationRecommendation,
    index: number,
  ) => {
    if (isReadOnlyUser) {
      Alert.alert('읽기 전용 계정', '초대코드로 입장한 계정은 인력 재배치를 적용할 수 없습니다.');
      return;
    }

    const key = `${recommendation.from_zone_id}-${recommendation.to_zone_id}-${index}`;

    try {
      setApplyingRelocationKey(key);
      await applyRelocationRecommendation(index + 1);
      await Promise.all([loadStaff(), loadRelocation()]);
      Alert.alert('재배치 완료', '권장 인력 재배치가 적용되었습니다.');
    } catch (error) {
      Alert.alert('재배치 실패', '인력 재배치를 적용하지 못했습니다.');
    } finally {
      setApplyingRelocationKey(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    getStoredAuthUser().then((user) => {
      if (mounted) {
        setIsReadOnlyUser(user?.role === 'staff_viewer');
      }
    });

    const loadZones = async () => {
      try {
        const liveZones = await fetchZonesLive();

        if (!mounted || liveZones.length === 0) return;

        setSectors((prev) =>
          liveZones.map((zone, index) => {
            const existing = prev.find(
              (sector) =>
                sector.title === zone.name ||
                String(sector.id) === zone.zone_id,
            );

            return {
              id: Number.isNaN(Number(zone.zone_id)) ? index + 1 : Number(zone.zone_id),
              zoneId: zone.zone_id,
              title: zone.name,
              count: zone.count,
              status: zone.status,
              people: existing?.people ?? [],
            };
          }),
        );
      } catch (error) {
        console.warn('Failed to load sector zones', error);
      }
    };

    loadZones();
    loadStaff();
    loadRelocation();
    const timer = setInterval(() => {
      loadZones();
      loadRelocation();
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const addStaffToSector = async (staff: Staff) => {
    if (isReadOnlyUser) {
      Alert.alert('읽기 전용 계정', '초대코드로 입장한 계정은 인력 배치를 수정할 수 없습니다.');
      return;
    }

    if (!selectedSector) return;
    if (!staff.id || !selectedSector.zoneId) return;

    const alreadyAdded = selectedSector.people.some(
      (person) => person.id === staff.id || person.name === staff.name
    );

    if (alreadyAdded) return;

    try {
      await assignStaffToZone(staff.id, selectedSector.zoneId);
      await loadStaff();
    } catch (error) {
      Alert.alert('배치 실패', '직원 배치를 저장하지 못했습니다.');
    }
  };

  const moveStaffToWaiting = async (staff: Staff) => {
    if (isReadOnlyUser) {
      Alert.alert('읽기 전용 계정', '초대코드로 입장한 계정은 인력 배치를 수정할 수 없습니다.');
      return;
    }

    if (!selectedSector?.zoneId || !staff.id) return;

    try {
      await unassignStaffFromZone(staff.id, selectedSector.zoneId);
      await Promise.all([loadStaff(), loadRelocation()]);
    } catch (error) {
      Alert.alert('대기 전환 실패', '직원을 대기 상태로 전환하지 못했습니다.');
    }
  };

  const removeStaff = (staff: Staff) => {
    if (isReadOnlyUser) {
      Alert.alert('읽기 전용 계정', '초대코드로 입장한 계정은 인력을 삭제할 수 없습니다.');
      return;
    }

    const staffId = staff.id;
    if (!staffId) return;

    Alert.alert(
      '인력 삭제',
      `${staff.name} 인력을 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteStaff(staffId);
              await Promise.all([loadStaff(), loadRelocation()]);
            } catch (error) {
              Alert.alert('삭제 실패', '인력을 삭제하지 못했습니다.');
            }
          },
        },
      ],
    );
  };

  const resetStaffForm = () => {
    setNewStaffName('');
    setNewStaffRole('안전관리');
    setNewStaffPhone('');
    setNewStaffEmail('');
    setNewStaffZoneId('');
  };

  const handleCreateStaff = async () => {
    if (isReadOnlyUser) {
      Alert.alert('읽기 전용 계정', '초대코드로 입장한 계정은 인력을 등록할 수 없습니다.');
      return;
    }

    if (!newStaffName.trim()) {
      Alert.alert('입력 필요', '직원 이름을 입력해주세요.');
      return;
    }

    try {
      setSavingStaff(true);
      await createStaff({
        name: newStaffName.trim(),
        role: newStaffRole.trim() || '안전관리',
        phone: newStaffPhone.trim(),
        email: newStaffEmail.trim(),
        zone_id: newStaffZoneId || undefined,
      });
      await loadStaff();
      resetStaffForm();
      setAddModalVisible(false);
      Alert.alert('등록 완료', '직원이 등록되었습니다.');
    } catch (error) {
      Alert.alert('등록 실패', '직원 정보를 저장하지 못했습니다.');
    } finally {
      setSavingStaff(false);
    }
  };

  if (selectedSector) {
    return (
      <View style={styles.detailScreen}>
        <View style={styles.detailHeader}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.backButton}
            onPress={() => setSelectedSectorId(null)}
          >
            <Ionicons name="arrow-back" size={25} color={THEME.dark} />
          </TouchableOpacity>

          <View style={styles.locationIcon}>
            <Ionicons name="location-outline" size={25} color="#FFFFFF" />
          </View>

          <Text style={styles.detailTitle}>{selectedSector.title} 인력 관리</Text>
        </View>

        <ScrollView
          style={styles.detailContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailScrollContent}
        >
          <View style={styles.detailSectionHeader}>
            <Text style={styles.detailSectionTitle}>현재 섹터 인원</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{selectedSector.people.length}명</Text>
            </View>
          </View>

          <View style={styles.currentStaffBox}>
            {selectedSector.people.length === 0 ? (
              <>
                <View style={styles.emptyIconBox}>
                  <Ionicons name="person-circle-outline" size={44} color="#AEB6C2" />
                </View>
                <Text style={styles.emptyTitle}>현재 배치된 인원이 없습니다</Text>
                <Text style={styles.emptySubtitle}>아래에서 직원을 선택하여 추가하세요</Text>
              </>
            ) : (
              selectedSector.people.map((person, index) => (
                <View key={`${person.name}-${index}`} style={styles.currentPersonRow}>
                  <View style={styles.detailPersonIcon}>
                    <Ionicons name="person-circle-outline" size={34} color="#8E98A8" />
                  </View>

                  <View style={styles.currentPersonInfo}>
                    <Text style={styles.detailPersonName}>{person.name}</Text>
                    <Text style={styles.detailPersonRole}>{person.role}</Text>
                  </View>

                  {!isReadOnlyUser && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.waitButton}
                      onPress={() => moveStaffToWaiting(person)}
                    >
                      <Text style={styles.waitButtonText}>대기</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>

          <Text style={styles.detailSectionTitle}>전체 직원 명단</Text>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={22} color="#AEB6C2" />
            <TextInput
              style={styles.searchInput}
              placeholder="이름 검색..."
              placeholderTextColor="#AEB6C2"
            />
          </View>

          {staffList.map((staff, index) => {
            const alreadyAdded = selectedSector.people.some(
              (person) => person.id === staff.id || person.name === staff.name
            );

            return (
              <View key={`${staff.name}-${index}`} style={styles.staffListCard}>
                <View style={[styles.checkBox, alreadyAdded && styles.checkBoxSelected]}>
                  {alreadyAdded && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                </View>

                <View style={styles.listPersonIcon}>
                  <Ionicons name="person-circle-outline" size={38} color="#8E98A8" />
                </View>

                <View style={styles.listPersonInfo}>
                  <Text style={styles.listPersonName}>{staff.name}</Text>
                  <Text style={styles.listPersonRole}>
                    {staff.role} · {staff.sector}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.smallDeleteButton}
                  onPress={() => removeStaff(staff)}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.smallAddButton,
                    alreadyAdded && styles.smallAddButtonDisabled,
                  ]}
                  disabled={alreadyAdded}
                  onPress={() => addStaffToSector(staff)}
                >
                  <Text style={styles.smallAddButtonText}>
                    {alreadyAdded ? '완료' : '추가'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.bottomFixedButtonWrap}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.completeButton}
            onPress={() => setSelectedSectorId(null)}
          >
            <Text style={styles.completeButtonText}>배치 완료</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.title}>인력 관리</Text>
          <Text style={styles.subtitle}>실시간 히트맵 및 배치 조정</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.modeButton,
                heatmapMode === 'summary' && styles.modeButtonActive,
              ]}
              onPress={() => setHeatmapMode('summary')}
            >
              <Ionicons
                name="grid-outline"
                size={18}
                color={heatmapMode === 'summary' ? '#FFFFFF' : '#8B95A1'}
              />
              <Text
                style={[
                  styles.modeButtonText,
                  heatmapMode === 'summary' && styles.modeButtonTextActive,
                ]}
              >
                요약 히트맵
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.modeButton,
                heatmapMode === 'map' && styles.modeButtonActive,
              ]}
              onPress={() => setHeatmapMode('map')}
            >
              <Ionicons
                name="map-outline"
                size={18}
                color={heatmapMode === 'map' ? '#FFFFFF' : '#8B95A1'}
              />
              <Text
                style={[
                  styles.modeButtonText,
                  heatmapMode === 'map' && styles.modeButtonTextActive,
                ]}
              >
                지도 히트맵
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>
            {heatmapMode === 'summary' ? '실시간 히트맵' : '실시간 지도 히트맵'}
          </Text>

          {heatmapMode === 'summary' ? (
            <View style={styles.homeHeatmapCard}>
              <View style={styles.homeHeatmapGrid}>
                {sectors.map((sector) => (
                  <View
                    key={sector.id}
                    style={[
                      styles.homeHeatmapItem,
                      { backgroundColor: getLevelBg(sector.status) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.homeHeatmapLevel,
                        { color: getLevelColor(sector.status) },
                      ]}
                    >
                      {getLevelLabel(sector.status)}
                    </Text>

                    <Text style={styles.homeHeatmapCount}>{sector.count}명</Text>

                    <Text style={styles.homeHeatmapName} numberOfLines={2}>
                      {sector.title}
                    </Text>

                    <View style={styles.homeStaffBadge}>
                      <Ionicons name="people-outline" size={14} color={THEME.primary} />
                      <Text style={styles.homeStaffBadgeText}>
                        {sector.people.length}명
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: THEME.safe }]} />
                  <Text style={styles.legendText}>여유</Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: THEME.warning }]} />
                  <Text style={styles.legendText}>주의</Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: THEME.danger }]} />
                  <Text style={styles.legendText}>위험</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mapHeatmapCard}>
              <View style={styles.mapBox}>
                <WebView
                  source={{ uri: MAP_URL }}
                  style={styles.map}
                  javaScriptEnabled
                  domStorageEnabled
                  geolocationEnabled
                  originWhitelist={['*']}
                  mixedContentMode="always"
                />

              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mapChipScroll}
              >
                {sectors.map((sector) => (
                  <View
                    key={sector.id}
                    style={[
                      styles.mapChip,
                      { borderColor: getLevelColor(sector.status) },
                    ]}
                  >
                    <View
                      style={[
                        styles.mapChipDot,
                        { backgroundColor: getLevelColor(sector.status) },
                      ]}
                    />
                    <Text style={styles.mapChipTitle} numberOfLines={1}>
                      {sector.title}
                    </Text>
                    <Text
                      style={[
                        styles.mapChipLevel,
                        { color: getLevelColor(sector.status) },
                      ]}
                    >
                      {getLevelLabel(sector.status)} · {sector.count}명
                    </Text>
                    <Text style={styles.mapChipStaff}>
                      직원 {sector.people.length}명
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>권장 인력 재배치</Text>
            {!!relocation?.recommendations.length && (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentBadgeText}>긴급</Text>
              </View>
            )}
          </View>

          {loadingRelocation && !relocation ? (
            <View style={styles.noRelocationCard}>
              <Ionicons name="sync-outline" size={30} color={THEME.primary} />
              <Text style={styles.noRelocationText}>인력재배치 확인 중</Text>
            </View>
          ) : relocation?.recommendations.length ? (
            relocation.recommendations.map((recommendation, index) => {
              const fromSector = getSectorByZoneId(recommendation.from_zone_id);
              const toSector = getSectorByZoneId(recommendation.to_zone_id);
              const fromTitle = fromSector?.title ?? getSectorTitle(recommendation.from_zone_id);
              const toTitle = toSector?.title ?? getSectorTitle(recommendation.to_zone_id);
              const fromStaffCount = fromSector?.people.length ?? 0;
              const toStaffCount = toSector?.people.length ?? 0;
              const afterStaffCount = toStaffCount + recommendation.move_staff_count;
              const relocationKey = `${recommendation.from_zone_id}-${recommendation.to_zone_id}-${index}`;
              const isApplying = applyingRelocationKey === relocationKey;

              return (
                <View key={relocationKey} style={styles.relocationCard}>
                  <View style={styles.relocationTop}>
                    <View style={styles.relocationIcon}>
                      <Ionicons name="warning-outline" size={34} color="#FFFFFF" />
                    </View>

                    <View style={styles.relocationTextBlock}>
                      <Text style={styles.relocationTitle}>인력 재배치 필요</Text>
                      <Text style={styles.relocationSubtitle}>{toTitle} 위험 수준 감지</Text>
                    </View>
                  </View>

                  <View style={styles.relocationDivider} />

                  <View style={styles.routeRow}>
                    <View style={styles.fromBox}>
                      <Text style={styles.routeLabelMint}>출발 구역</Text>
                      <Text style={styles.routePlace}>{fromTitle}</Text>
                      <Text style={styles.routeStaff}>{fromStaffCount}명 배치</Text>
                    </View>

                    <View style={styles.arrowBlock}>
                      <Ionicons name="arrow-forward" size={38} color={THEME.primary} />
                      <Text style={styles.moveCount}>{recommendation.move_staff_count}명</Text>
                    </View>

                    <View style={styles.toBox}>
                      <Text style={styles.routeLabelDanger}>도착 구역</Text>
                      <Text style={styles.routePlace}>{toTitle}</Text>
                      <Text style={styles.routeStaff}>{toStaffCount}명 배치</Text>
                    </View>
                  </View>

                  <View style={styles.staffChangeBox}>
                    <View style={styles.staffChangeItem}>
                      <Text style={styles.staffChangeLabel}>현재 인력</Text>
                      <Text style={styles.currentStaff}>{toStaffCount}명</Text>
                    </View>

                    <Ionicons name="arrow-forward" size={32} color="#9CA3AF" />

                    <View style={styles.staffChangeItem}>
                      <Text style={styles.staffChangeLabel}>재배치 후</Text>
                      <Text style={styles.afterStaff}>{afterStaffCount}명</Text>
                    </View>
                  </View>

                  {!isReadOnlyUser && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[styles.applyButton, isApplying && styles.applyButtonDisabled]}
                      disabled={isApplying}
                      onPress={() => handleApplyRelocation(recommendation, index)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
                      <Text style={styles.applyButtonText}>
                        {isApplying ? '재배치 적용 중' : '재배치 적용하기'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.noRelocationCard}>
              <Ionicons name="checkmark-circle-outline" size={34} color={THEME.safe} />
              <Text style={styles.noRelocationText}>인력재배치 필요없음</Text>
              {!!relocation?.message && (
                <Text style={styles.noRelocationSubText}>{relocation.message}</Text>
              )}
            </View>
          )}

          <View style={styles.staffSectionHeader}>
            <Text style={styles.staffSectionTitle}>전체 인력 관리</Text>

            {!isReadOnlyUser && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addButton}
                onPress={() => setAddModalVisible(true)}
              >
                <Ionicons name="add" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.staffCard}>
            <View style={styles.staffCardHeader}>
              <View style={styles.staffTitleRow}>
                <View style={[styles.statusDot, styles.waitingDot]} />
                <Text style={styles.staffLocation}>대기 인원</Text>
                <Text style={styles.staffCount}>({waitingStaff.length}명)</Text>
              </View>
            </View>

            {waitingStaff.length === 0 ? (
              <Text style={styles.emptyWaitingText}>대기 중인 인원이 없습니다</Text>
            ) : (
              waitingStaff.map((person, index) => (
                <View key={`waiting-${person.id ?? person.name}-${index}`} style={styles.personBox}>
                  <View style={styles.personIconBox}>
                    <Ionicons
                      name="person-circle-outline"
                      size={34}
                      color={THEME.primary}
                    />
                  </View>

                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{person.name}</Text>
                    <Text style={styles.personRole}>{person.role}</Text>
                  </View>

                  {!isReadOnlyUser && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.personDeleteButton}
                      onPress={() => removeStaff(person)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>

          {sectors.map((section) => (
            <View key={section.id} style={styles.staffCard}>
              <View style={styles.staffCardHeader}>
                <View style={styles.staffTitleRow}>
                  <View
                    style={[
                      styles.statusDot,
                      section.status === 'danger'
                        ? styles.dangerDot
                        : section.status === 'warning'
                          ? styles.warningDot
                          : styles.safeDot,
                    ]}
                  />
                  <Text style={styles.staffLocation}>{section.title}</Text>
                  <Text style={styles.staffCount}>({section.people.length}명)</Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.editButton}
                  onPress={() => setSelectedSectorId(section.id)}
                >
                  <Ionicons name="pencil-outline" size={24} color="#9AA3B2" />
                </TouchableOpacity>
              </View>

              {section.people.map((person, index) => (
                <View key={`${person.name}-${index}`} style={styles.personBox}>
                  <View style={styles.personIconBox}>
                    <Ionicons
                      name="person-circle-outline"
                      size={34}
                      color={THEME.primary}
                    />
                  </View>

                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{person.name}</Text>
                    <Text style={styles.personRole}>{person.role}</Text>
                  </View>

                  {!isReadOnlyUser && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.personDeleteButton}
                      onPress={() => removeStaff(person)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIcon}>
                <Ionicons name="add" size={34} color="#FFFFFF" />
              </View>

              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalTitle}>신규 직원 등록</Text>
                <Text style={styles.modalSubtitle}>전체 시스템에 추가</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.closeButton}
                onPress={() => setAddModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>이름</Text>
            <TextInput
              style={styles.input}
              value={newStaffName}
              onChangeText={setNewStaffName}
              placeholder="이름을 입력하세요"
              placeholderTextColor="#B6BEC9"
            />

            <Text style={styles.inputLabel}>역할</Text>
            <TextInput
              style={styles.input}
              value={newStaffRole}
              onChangeText={setNewStaffRole}
              placeholder="예: 안전관리"
              placeholderTextColor="#B6BEC9"
            />

            <Text style={styles.inputLabel}>전화번호</Text>
            <TextInput
              style={styles.input}
              value={newStaffPhone}
              onChangeText={setNewStaffPhone}
              placeholder="010-0000-0000"
              placeholderTextColor="#B6BEC9"
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>이메일</Text>
            <TextInput
              style={styles.input}
              value={newStaffEmail}
              onChangeText={setNewStaffEmail}
              placeholder="example@email.com"
              placeholderTextColor="#B6BEC9"
              keyboardType="email-address"
            />

            <Text style={styles.inputLabel}>초기 배치 섹터</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.zoneSelectRow}
            >
              {sectors.map((sector) => (
                <TouchableOpacity
                  key={sector.zoneId ?? sector.id}
                  activeOpacity={0.85}
                  style={[
                    styles.zoneSelectChip,
                    newStaffZoneId === sector.zoneId && styles.zoneSelectChipActive,
                  ]}
                  onPress={() => setNewStaffZoneId(sector.zoneId ?? '')}
                >
                  <Text
                    style={[
                      styles.zoneSelectText,
                      newStaffZoneId === sector.zoneId && styles.zoneSelectTextActive,
                    ]}
                  >
                    {sector.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.cancelButton}
                onPress={() => {
                  resetStaffForm();
                  setAddModalVisible(false);
                }}
              >
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.registerButton}
                onPress={handleCreateStaff}
                disabled={savingStaff}
              >
                <Text style={styles.registerButtonText}>
                  {savingStaff ? '등록 중...' : '직원 등록'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  scrollContent: {
    paddingBottom: 130,
  },

  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 28,
    paddingTop: 76,
    paddingBottom: 34,
  },

  title: {
    fontSize: 34,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 8,
    letterSpacing: -0.8,
  },

  subtitle: {
    fontSize: 17,
    color: '#9CA3AF',
    fontWeight: '600',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F4F6F8',
    borderRadius: 18,
    padding: 5,
    marginBottom: 22,
  },

  modeButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  modeButtonActive: {
    backgroundColor: THEME.primary,
  },

  modeButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#8B95A1',
  },

  modeButtonTextActive: {
    color: '#FFFFFF',
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.dark,
    letterSpacing: -0.5,
    marginBottom: 16,
  },

  homeHeatmapCard: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 18,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.045,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },

  homeHeatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  homeHeatmapItem: {
    width: '31%',
    minHeight: 148,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  homeHeatmapLevel: {
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 8,
  },

  homeHeatmapCount: {
    fontSize: 23,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 8,
  },

  homeHeatmapName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 10,
  },

  homeStaffBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  homeStaffBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: THEME.primary,
  },

  mapHeatmapCard: {
    backgroundColor: Colors.white,
    borderRadius: 26,
    padding: 14,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.045,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },

  mapBox: {
    height: 360,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginBottom: 14,
  },

  map: {
    flex: 1,
  },

  mapOverlayHeader: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },

  mapOverlayTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: THEME.dark,
  },

  liveBadge: {
    backgroundColor: THEME.danger,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  liveBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  mapChipScroll: {
    paddingVertical: 4,
    gap: 10,
  },

  mapChip: {
    width: 150,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginRight: 10,
  },

  mapChipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 8,
  },

  mapChipTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 5,
  },

  mapChipLevel: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
  },

  mapChipStaff: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8B95A1',
  },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 8,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  legendText: {
    fontSize: 14,
    color: '#8B95A1',
    fontWeight: '800',
  },

  urgentBadge: {
    backgroundColor: '#D6453D',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  urgentBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  relocationCard: {
    borderWidth: 2,
    borderColor: '#E0463E',
    backgroundColor: '#FFF1F1',
    borderRadius: 20,
    marginBottom: 34,
    overflow: 'hidden',
  },

  relocationTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 22,
    gap: 16,
  },

  relocationIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#D6453D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  relocationTextBlock: {
    flex: 1,
  },

  relocationTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 6,
  },

  relocationSubtitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#D6453D',
  },

  relocationDivider: {
    height: 1,
    backgroundColor: '#F2CACA',
  },

  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 18,
  },

  fromBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: THEME.primary,
    backgroundColor: THEME.primaryLight,
    borderRadius: 18,
    padding: 14,
  },

  toBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#D6453D',
    backgroundColor: '#FFF7F7',
    borderRadius: 18,
    padding: 14,
  },

  routeLabelMint: {
    color: THEME.primary,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },

  routeLabelDanger: {
    color: '#D6453D',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },

  routePlace: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 8,
  },

  routeStaff: {
    fontSize: 14,
    color: '#8B95A1',
    fontWeight: '800',
  },

  arrowBlock: {
    width: 64,
    alignItems: 'center',
  },

  moveCount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#D6453D',
    marginTop: 6,
  },

  staffChangeBox: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 18,
    marginBottom: 18,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  staffChangeItem: {
    alignItems: 'center',
  },

  staffChangeLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8B95A1',
    marginBottom: 5,
  },

  currentStaff: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D6453D',
  },

  afterStaff: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.primary,
  },

  applyButton: {
    height: 54,
    marginHorizontal: 18,
    marginBottom: 22,
    borderRadius: 14,
    backgroundColor: THEME.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },

  applyButtonDisabled: {
    opacity: 0.65,
  },

  applyButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  noRelocationCard: {
    minHeight: 128,
    marginBottom: 34,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },

  noRelocationText: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.safe,
  },

  noRelocationSubText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7B8493',
    textAlign: 'center',
  },

  staffSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  staffSectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.dark,
    letterSpacing: -0.5,
  },

  addButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },

  staffCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  staffCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  staffTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },

  dangerDot: {
    backgroundColor: THEME.danger,
  },

  warningDot: {
    backgroundColor: THEME.warning,
  },

  safeDot: {
    backgroundColor: THEME.safe,
  },

  staffLocation: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.dark,
  },

  staffCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8B95A1',
    marginLeft: 8,
  },

  editButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  personBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F7F9',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginTop: 10,
  },

  personIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1.5,
    borderColor: '#DDF8F5',
  },

  personInfo: {
    flex: 1,
  },

  personDeleteButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  personName: {
    fontSize: 17,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 4,
  },

  personRole: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9AA3B2',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'flex-end',
  },

  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 30,
    paddingTop: 30,
    paddingBottom: 32,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },

  modalIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },

  modalTitleBlock: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 6,
  },

  modalSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9AA3B2',
  },

  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9AA3B2',
    marginBottom: 8,
  },

  input: {
    height: 62,
    borderRadius: 14,
    backgroundColor: '#F8F9FB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.dark,
    marginBottom: 18,
  },

  zoneSelectRow: {
    gap: 8,
    paddingBottom: 18,
  },

  zoneSelectChip: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#F8F9FB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  zoneSelectChipActive: {
    backgroundColor: THEME.primaryLight,
    borderColor: THEME.primary,
  },

  zoneSelectText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.dark,
  },

  zoneSelectTextActive: {
    color: THEME.primary,
  },

  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },

  cancelButton: {
    flex: 1,
    height: 62,
    borderRadius: 14,
    backgroundColor: '#F6F7F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: THEME.dark,
  },

  registerButton: {
    flex: 1,
    height: 62,
    borderRadius: 14,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  registerButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  detailScreen: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },

  detailHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: 78,
    paddingHorizontal: 26,
    paddingBottom: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
  },

  backButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  locationIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  detailTitle: {
    flex: 1,
    fontSize: 25,
    fontWeight: '900',
    color: THEME.dark,
    letterSpacing: -0.6,
  },

  detailContainer: {
    flex: 1,
  },

  detailScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 130,
  },

  detailSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  detailSectionTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 14,
    letterSpacing: -0.4,
  },

  countBadge: {
    backgroundColor: THEME.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },

  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  currentStaffBox: {
    minHeight: 220,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    marginBottom: 32,
  },

  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F4F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#8B95A1',
    marginBottom: 8,
  },

  emptySubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#AEB6C2',
  },

  currentPersonRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FB',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },

  currentPersonInfo: {
    flex: 1,
  },

  detailPersonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  detailPersonName: {
    fontSize: 17,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 4,
  },

  detailPersonRole: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8B95A1',
  },

  waitButton: {
    width: 58,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  waitButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#6B7280',
  },

  searchBox: {
    height: 62,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 16,
  },

  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.dark,
  },

  staffListCard: {
    minHeight: 98,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E1E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  checkBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1.8,
    borderColor: '#DDE2E8',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkBoxSelected: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },

  waitingDot: {
    backgroundColor: '#8B95A1',
  },

  emptyWaitingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#AEB6C2',
    paddingVertical: 12,
  },

  listPersonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F4F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  listPersonInfo: {
    flex: 1,
  },

  listPersonName: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 5,
  },

  listPersonRole: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8B95A1',
  },

  smallAddButton: {
    width: 58,
    height: 44,
    borderRadius: 14,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  smallDeleteButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  smallAddButtonDisabled: {
    backgroundColor: '#C8D0D8',
  },

  smallAddButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  bottomFixedButtonWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 28,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEF0F3',
  },

  completeButton: {
    height: 70,
    borderRadius: 18,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  completeButtonText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
