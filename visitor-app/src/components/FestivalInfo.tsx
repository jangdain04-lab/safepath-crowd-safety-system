import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchPublicFestivalInfo,
  type FestivalInfo as FestivalInfoData,
} from '../services/api';

const COLORS = {
  text: '#111827',
  muted: '#8B95A1',
  mint: '#7BCBC6',
  line: '#F0F2F4',
  warning: '#F59E0B',
};

const DEFAULT_FESTIVAL_INFO: FestivalInfoData = {
  id: 0,
  title: '2026 인하대학교 축제 안내',
  date: '2026년 5월 13일',
  time: '오후 2시 - 오후 10시',
  place: '백년관 앞 광장',
  description: [
    '오후 2시부터 오후 10시까지 진행됩니다.',
    '백년관 버정길과 인경관 주차장 입구는 혼잡이 예상됩니다. 가능하면 우회 경로를 이용해주세요.',
    '혼잡한 구역에서는 천천히 이동하고, 위험 상황 발생 시 즉시 주변 스태프에게 알려주세요.',
  ],
  contacts: [
    { label: '행사 본부', phone: '02-1234-5678' },
    { label: '안전 관리팀', phone: '02-8765-4321' },
  ],
  cautions: [
    '혼잡한 곳에서는 밀지 마세요.',
    '어린이는 보호자와 함께 이동하세요.',
    '위험 상황 발생 시 신속히 대피하세요.',
    '실시간 혼잡도를 확인하며 이동하세요.',
  ],
};

function useResponsive() {
  const { width, height } = useWindowDimensions();
  const base = Math.min(width, height);
  const scale = Math.min(Math.max(base / 390, 0.88), 1.12);
  const horizontal = Math.max(22, Math.min(34, width * 0.08));
  return { scale, horizontal };
}

export function FestivalInfo({ navigation }: any) {
  const { scale, horizontal } = useResponsive();
  const [info, setInfo] = useState<FestivalInfoData>(DEFAULT_FESTIVAL_INFO);

  useEffect(() => {
    const loadFestivalInfo = async () => {
      try {
        setInfo(await fetchPublicFestivalInfo());
      } catch (err) {
        console.warn('Failed to load festival info', err);
      }
    };

    loadFestivalInfo();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: horizontal }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={23 * scale} color={COLORS.text} />
          <Text style={[styles.backText, { fontSize: 16 * scale }]}>뒤로</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: 25 * scale }]}>축제 정보</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: horizontal }]}
      >
        <Text style={[styles.mainTitle, { fontSize: 24 * scale }]}>{info.title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={17 * scale} color={COLORS.muted} />
            <Text style={[styles.metaText, { fontSize: 14 * scale }]}>{info.date}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={18 * scale} color={COLORS.muted} />
            <Text style={[styles.metaText, { fontSize: 14 * scale }]}>{info.time}</Text>
          </View>
        </View>

        <View style={[styles.placeCard, { marginTop: 28 * scale, marginBottom: 24 * scale }]}>
          <View style={styles.placeIcon}>
            <Ionicons name="location-outline" size={24 * scale} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.placeLabel, { fontSize: 16 * scale }]}>행사 장소</Text>
            <Text style={[styles.placeText, { fontSize: 15 * scale }]}>{info.place}</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { fontSize: 20 * scale }]}>주요 안내사항</Text>
        {info.description.map((item, index) => (
          <Text key={`description-${index}`} style={[styles.paragraph, { fontSize: 16 * scale }]}>
            {item}
          </Text>
        ))}

        {info.contacts.map((contact, index) => (
          <Text key={`contact-${index}`} style={[styles.contact, { fontSize: 16 * scale }]}>
            {contact.label}: {contact.phone}
          </Text>
        ))}

        <View style={[styles.noticeBox, { marginTop: 28 * scale }]}>
          <Text style={[styles.noticeTitle, { fontSize: 17 * scale }]}>주의사항</Text>
          {info.cautions.map((caution, index) => (
            <Text key={`caution-${index}`} style={[styles.noticeText, { fontSize: 15 * scale }]}>
              • {caution}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 22, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, marginBottom: 24 },
  backText: { color: COLORS.text, fontWeight: '900' },
  headerTitle: { color: COLORS.text, fontWeight: '900', letterSpacing: 0 },
  scroll: { paddingTop: 30, paddingBottom: 58 },
  mainTitle: { color: COLORS.text, fontWeight: '900', marginBottom: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metaText: { color: COLORS.muted, fontWeight: '600' },
  placeCard: {
    minHeight: 108,
    borderRadius: 16,
    backgroundColor: '#F5F7FA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 18,
  },
  placeIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.mint, alignItems: 'center', justifyContent: 'center' },
  placeLabel: { color: COLORS.text, fontWeight: '900', marginBottom: 8 },
  placeText: { color: '#566173', fontWeight: '500' },
  sectionTitle: { color: COLORS.text, fontWeight: '900', marginBottom: 26 },
  paragraph: { color: '#1F2937', lineHeight: 31, fontWeight: '500', marginBottom: 20 },
  contact: { color: '#1F2937', lineHeight: 29, fontWeight: '500' },
  noticeBox: { borderWidth: 1, borderColor: COLORS.warning, borderRadius: 16, backgroundColor: '#FFF9EF', paddingHorizontal: 24, paddingVertical: 24 },
  noticeTitle: { color: COLORS.text, fontWeight: '900', marginBottom: 14 },
  noticeText: { color: '#566173', lineHeight: 28, fontWeight: '500' },
});
