import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../components/Colors';
import { fetchZonesLive, sendEmergencyAlert } from '../../services/api';
import { getStoredAuthUser } from '../../services/authStorage';

type TargetMode = 'zone' | 'all';
type MessageType = 'evacuate' | 'warning' | 'custom';

const THEME = {
  primary: '#55CCC4',
  primaryLight: '#EFFFFD',
  dark: '#111827',
};

const ZONES = [
  { name: '백년관 버정길', status: 'danger' },
  { name: '자연과학대 앞', status: 'safe' },
  { name: '공대 흡연부스 옆', status: 'warning' },
  { name: '인경관 주차장 입구', status: 'safe' },
  { name: '공대-백년관 사이', status: 'warning' },
  { name: '백년관 잔디구장', status: 'safe' },
];

const MESSAGES = [
  {
    id: 'evacuate' as MessageType,
    title: '긴급 대피',
    desc: '즉시 해당 구역에서 대피해주세요',
    icon: 'warning-outline' as keyof typeof Ionicons.glyphMap,
    color: '#E93035',
    bg: '#FFF1F1',
    border: '#E93035',
  },
  {
    id: 'warning' as MessageType,
    title: '주의 경고',
    desc: '혼잡이 예상되니 주의해주세요',
    icon: 'notifications-outline' as keyof typeof Ionicons.glyphMap,
    color: '#F59E0B',
    bg: '#FFF8E8',
    border: '#F59E0B',
  },
  {
    id: 'custom' as MessageType,
    title: '커스텀 메시지',
    desc: '직접 작성한 메시지 전송',
    icon: 'paper-plane-outline' as keyof typeof Ionicons.glyphMap,
    color: THEME.primary,
    bg: THEME.primaryLight,
    border: THEME.primary,
  },
];

function getZoneColor(status: string) {
  if (status === 'danger') return '#D0453B';
  if (status === 'warning') return '#F59E0B';
  return '#16A34A';
}

export default function EmergencyControl() {
  const [targetMode, setTargetMode] = useState<TargetMode>('zone');
  const [selectedMessage, setSelectedMessage] = useState<MessageType>('custom');
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [zones, setZones] = useState(ZONES);
  const [isReadOnlyUser, setIsReadOnlyUser] = useState(false);

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

        setZones(
          liveZones.map((zone) => ({
            name: zone.name,
            status: zone.status,
          })),
        );
      } catch (error) {
        console.warn('Failed to load alert zones', error);
      }
    };

    loadZones();
    const timer = setInterval(loadZones, 1000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const toggleZone = (zoneName: string) => {
    setSelectedZones((prev) =>
      prev.includes(zoneName)
        ? prev.filter((name) => name !== zoneName)
        : [...prev, zoneName]
    );
  };

  const handleTargetMode = (mode: TargetMode) => {
    setTargetMode(mode);

    if (mode === 'all') {
      setSelectedZones([]);
    }
  };

  const sendAlert = async (messageType: MessageType) => {
    if (isReadOnlyUser) {
      Alert.alert('읽기 전용 계정', '초대코드로 입장한 계정은 긴급 알림을 발송할 수 없습니다.');
      return;
    }

    const messageInfo = MESSAGES.find((message) => message.id === messageType);

    if (!messageInfo) return;

    if (targetMode === 'zone' && selectedZones.length === 0) {
      Alert.alert('구역을 선택해주세요', '알림을 보낼 구역을 1개 이상 선택해야 합니다.');
      return;
    }

    if (messageType === 'custom' && customMessage.trim().length === 0) {
      Alert.alert('메시지를 입력해주세요', '커스텀 메시지 내용을 작성해야 전송할 수 있습니다.');
      return;
    }

    const targetText =
      targetMode === 'all'
        ? '전체 참가자'
        : selectedZones.join(', ');

    const messageText =
      messageType === 'custom'
        ? customMessage.trim()
        : messageInfo.desc;

    try {
      await sendEmergencyAlert({
        target_mode: targetMode,
        target_zones: selectedZones,
        message_type: messageType,
        message: messageText,
      });

      Alert.alert(
        '알림 전송 완료',
        `[대상]\n${targetText}\n\n[메시지]\n${messageText}`
      );
    } catch (error) {
      Alert.alert('전송 실패', '백엔드 서버 연결을 확인해주세요.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>긴급 통제 센터</Text>
          <Text style={styles.subtitle}>원클릭 긴급 알림 발송</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>대상 선택</Text>

          <View style={styles.segmentRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.segmentButton,
                targetMode === 'zone' && styles.segmentButtonActive,
              ]}
              onPress={() => handleTargetMode('zone')}
            >
              <Ionicons
                name="warning-outline"
                size={22}
                color={targetMode === 'zone' ? Colors.white : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  targetMode === 'zone' && styles.segmentTextActive,
                ]}
              >
                특정 구역
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.segmentButton,
                targetMode === 'all' && styles.segmentButtonActive,
              ]}
              onPress={() => handleTargetMode('all')}
            >
              <Ionicons
                name="people-outline"
                size={22}
                color={targetMode === 'all' ? Colors.white : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  targetMode === 'all' && styles.segmentTextActive,
                ]}
              >
                전체 참가자
              </Text>
            </TouchableOpacity>
          </View>

          {targetMode === 'zone' && (
            <View style={styles.zonePanel}>
              <View style={styles.zonePanelHeader}>
                <Text style={styles.zonePanelTitle}>구역 선택 (복수 선택 가능)</Text>
                <Text style={styles.selectedCount}>{selectedZones.length}개 선택</Text>
              </View>

              <View style={styles.zoneGrid}>
                {zones.map((zone) => {
                  const selected = selectedZones.includes(zone.name);

                  return (
                    <TouchableOpacity
                      key={zone.name}
                      activeOpacity={0.85}
                      style={[
                        styles.zoneChip,
                        selected && styles.zoneChipSelected,
                      ]}
                      onPress={() => toggleZone(zone.name)}
                    >
                      <View
                        style={[
                          styles.zoneDot,
                          { backgroundColor: getZoneColor(zone.status) },
                        ]}
                      />

                      <Text
                        style={[
                          styles.zoneChipText,
                          selected && styles.zoneChipTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {zone.name}
                      </Text>

                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={THEME.primary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, styles.messageTitle]}>
            메시지 유형
          </Text>

          <View style={styles.messageList}>
            {MESSAGES.map((message) => {
              const selected = selectedMessage === message.id;

              return (
                <View key={message.id}>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => setSelectedMessage(message.id)}
                    style={[
                      styles.messageCard,
                      selected && {
                        borderColor: message.border,
                        backgroundColor: Colors.white,
                      },
                      !selected && styles.messageCardInactive,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageIconBox,
                        {
                          backgroundColor: selected ? message.bg : Colors.background,
                        },
                      ]}
                    >
                      <Ionicons
                        name={message.icon}
                        size={32}
                        color={selected ? message.color : Colors.textMuted}
                      />
                    </View>

                    <View style={styles.messageTextBlock}>
                      <Text
                        style={[
                          styles.messageCardTitle,
                          !selected && styles.inactiveText,
                        ]}
                      >
                        {message.title}
                      </Text>
                      <Text
                        style={[
                          styles.messageCardDesc,
                          !selected && styles.inactiveDesc,
                        ]}
                      >
                        {message.desc}
                      </Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[
                        styles.sendCircle,
                        {
                          backgroundColor: selected ? message.color : '#E5E9EF',
                        },
                      ]}
                      onPress={() => sendAlert(message.id)}
                    >
                      <Ionicons
                        name="paper-plane-outline"
                        size={24}
                        color={selected ? Colors.white : Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {message.id === 'custom' && selected && (
                    <View style={styles.customInputBox}>
                      <Text style={styles.customInputLabel}>전송할 메시지</Text>
                      <TextInput
                        style={styles.customInput}
                        value={customMessage}
                        onChangeText={setCustomMessage}
                        placeholder="예: 현재 해당 구역이 혼잡하니 우회 이동해주세요."
                        placeholderTextColor="#AEB6C2"
                        multiline
                        textAlignVertical="top"
                      />

                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.customSendButton}
                        onPress={() => sendAlert('custom')}
                      >
                        <Ionicons name="send-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.customSendButtonText}>
                          커스텀 메시지 전송
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const PRIMARY = '#55CCC4';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  scrollContent: {
    paddingBottom: 130,
  },

  header: {
    paddingHorizontal: 28,
    paddingTop: 76,
    paddingBottom: 34,
    backgroundColor: Colors.white,
  },

  title: {
    fontSize: 34,
    fontWeight: '900',
    color: THEME.dark,
    letterSpacing: -0.8,
  },

  subtitle: {
    marginTop: 10,
    fontSize: 17,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 16,
    letterSpacing: -0.5,
  },

  segmentRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },

  segmentButton: {
    flex: 1,
    height: 68,
    borderRadius: 20,
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  segmentButtonActive: {
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  segmentText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textSecondary,
  },

  segmentTextActive: {
    color: Colors.white,
  },

  zonePanel: {
    backgroundColor: Colors.background,
    borderRadius: 22,
    padding: 18,
    marginBottom: 34,
  },

  zonePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  zonePanelTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.textSecondary,
  },

  selectedCount: {
    fontSize: 13,
    fontWeight: '900',
    color: THEME.primary,
  },

  zoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  zoneChip: {
    width: '48%',
    minHeight: 54,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1.3,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  zoneChipSelected: {
    borderColor: THEME.primary,
    backgroundColor: THEME.primaryLight,
  },

  zoneDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  zoneChipText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: THEME.dark,
  },

  zoneChipTextSelected: {
    color: THEME.dark,
  },

  messageTitle: {
    marginTop: 0,
  },

  messageList: {
    gap: 14,
  },

  messageCard: {
    minHeight: 104,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  messageCardInactive: {
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },

  messageIconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },

  messageTextBlock: {
    flex: 1,
  },

  messageCardTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 7,
    letterSpacing: -0.4,
  },

  messageCardDesc: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  inactiveText: {
    color: Colors.textSecondary,
  },

  inactiveDesc: {
    color: Colors.textMuted,
  },

  sendCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  customInputBox: {
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: THEME.primaryLight,
    borderWidth: 1.5,
    borderColor: '#BCEFEB',
    padding: 18,
  },

  customInputLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 10,
  },

  customInput: {
    minHeight: 120,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#DDF8F5',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.dark,
    lineHeight: 22,
    marginBottom: 14,
  },

  customSendButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: THEME.primary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  customSendButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.white,
  },
});
