import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
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
  getTimeAgo,
  type MissingChild,
  type OrganizerAnnouncement,
} from '../data/mockData';
import { fetchPublicAnnouncements, fetchPublicMissingChildren } from '../services/api';

const COLORS = {
  navy: '#151927',
  text: '#111827',
  muted: '#8B95A1',
  line: '#E5E8EC',
  mint: '#7BCBC6',
  orange: '#E4913D',
  chipBg: '#FFF4ED',
};

function useScale() {
  const { width, height } = useWindowDimensions();
  const base = Math.min(width, height);
  const scale = Math.min(Math.max(base / 390, 0.9), 1.18);
  const horizontal = Math.max(22, Math.min(34, width * 0.085));
  return { width, scale, horizontal };
}

export function Dashboard({ navigation }: any) {
  const { scale, horizontal } = useScale();
  const [selectedChild, setSelectedChild] = useState<MissingChild | null>(null);
  const [announcementListOpen, setAnnouncementListOpen] = useState(false);
  const [selectedAnnounce, setSelectedAnnounce] = useState<OrganizerAnnouncement | null>(null);
  const [announcements, setAnnouncements] = useState<OrganizerAnnouncement[]>([]);
  const [missingChildren, setMissingChildren] = useState<MissingChild[]>([]);
  const latestAnnouncement = announcements[0];

  const childCards = useMemo(() => missingChildren.slice(0, 2), [missingChildren]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [announcementItems, missingChildItems] = await Promise.all([
          fetchPublicAnnouncements(),
          fetchPublicMissingChildren(),
        ]);

        setAnnouncements(announcementItems);
        setMissingChildren(missingChildItems);
      } catch (err) {
        console.warn('Failed to load dashboard data', err);
      }
    };

    loadDashboardData();
    const timer = setInterval(loadDashboardData, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: horizontal, paddingBottom: 28 * scale }]}
      >
        <View style={[styles.brandBlock, { marginTop: 36 * scale, marginBottom: 28 * scale }]}>
          <Text style={[styles.logo, { fontSize: 34 * scale }]}>
            SAFE<Text style={styles.logoAccent}>PATH</Text>
          </Text>
          <Text style={[styles.subtitle, { fontSize: 15 * scale }]}>실시간 통합 안전관리 시스템</Text>
        </View>

        <SectionTitle title="주최자 공지" scale={scale} />
        <TouchableOpacity
          style={[styles.noticeCard, { marginBottom: 30 * scale }]}
          activeOpacity={0.86}
          onPress={() => latestAnnouncement && setAnnouncementListOpen(true)}
        >
          <View style={styles.noticeTopLine} />
          <View style={styles.noticeIcon}>
            <Ionicons name="megaphone-outline" size={24 * scale} color={COLORS.mint} />
          </View>
          <View style={styles.noticeContent}>
            <Text style={[styles.noticeTitle, { fontSize: 16 * scale }]}>{latestAnnouncement?.title ?? '등록된 공지사항이 없습니다.'}</Text>
            <Text style={[styles.noticeSummary, { fontSize: 15 * scale }]}>{latestAnnouncement?.summary ?? '새 공지가 등록되면 이곳에 표시됩니다.'}</Text>
            <View style={styles.noticeFooter}>
              <Text style={[styles.noticeTime, { fontSize: 14 * scale }]}>{latestAnnouncement ? getTimeAgo(latestAnnouncement.timestamp) : '-'}</Text>
              <Text style={[styles.noticeMore, { fontSize: 14 * scale }]}>자세히 보기 →</Text>
            </View>
          </View>
        </TouchableOpacity>

        <SectionTitle title="축제 정보" scale={scale} />
        <TouchableOpacity
          style={[styles.infoCard, { marginBottom: 30 * scale }]}
          onPress={() => navigation.navigate('FestivalInfo')}
          activeOpacity={0.86}
        >
          <View style={styles.infoIcon}>
            <Ionicons name="information-circle-outline" size={31 * scale} color={COLORS.mint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { fontSize: 16 * scale }]}>축제 정보 및 안내사항</Text>
            <Text style={[styles.infoText, { fontSize: 15 * scale }]}>행사 일정과 주의사항을 확인하세요</Text>
          </View>
        </TouchableOpacity>

        <SectionTitle title="미아 찾기" scale={scale} />
        {childCards.map((child) => (
          <TouchableOpacity
            key={child.id}
            style={[styles.childCard, { marginBottom: 14 * scale }]}
            activeOpacity={0.86}
            onPress={() => setSelectedChild(child)}
          >
            <Image source={{ uri: child.imageUrl }} style={[styles.childImage, { width: 82 * scale, height: 82 * scale }]} />
            <View style={styles.childBody}>
              <View style={styles.childNameRow}>
                <Text style={[styles.childName, { fontSize: 16 * scale }]}>{child.name}</Text>
                <Text style={[styles.childAge, { fontSize: 15 * scale }]}>{child.age}세</Text>
              </View>
              <MetaLine icon="location-outline" text={child.lastSeenLocation} scale={scale} />
              <MetaLine icon="time-outline" text={getTimeAgo(child.lastSeenTime)} scale={scale} />
            </View>
            <View style={styles.findingChip}>
              <Text style={[styles.findingText, { fontSize: 12 * scale }]}>찾는 중</Text>
            </View>
          </TouchableOpacity>
        ))}
        {childCards.length === 0 && (
          <View style={[styles.emptyState, { marginBottom: 14 * scale }]}>
            <Text style={[styles.emptyStateText, { fontSize: 15 * scale }]}>등록된 미아 정보가 없습니다.</Text>
          </View>
        )}
      </ScrollView>

      <AnnouncementListModal
        visible={announcementListOpen}
        announcements={announcements}
        onClose={() => setAnnouncementListOpen(false)}
        onSelect={(announcement) => {
          setAnnouncementListOpen(false);
          setSelectedAnnounce(announcement);
        }}
      />
      <AnnouncementModal item={selectedAnnounce} onClose={() => setSelectedAnnounce(null)} />
      <ChildModal child={selectedChild} onClose={() => setSelectedChild(null)} />
    </SafeAreaView>
  );
}

function SectionTitle({ title, scale }: { title: string; scale: number }) {
  return <Text style={[styles.sectionTitle, { fontSize: 23 * scale, marginBottom: 18 * scale }]}>{title}</Text>;
}

function MetaLine({ icon, text, scale }: { icon: keyof typeof Ionicons.glyphMap; text: string; scale: number }) {
  return (
    <View style={styles.metaLine}>
      <Ionicons name={icon} size={19 * scale} color="#A5ACB8" />
      <Text style={[styles.metaText, { fontSize: 15 * scale }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function AnnouncementModal({ item, onClose }: { item: OrganizerAnnouncement | null; onClose: () => void }) {
  if (!item) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modal}>
        <ModalHeader title="주최자 공지" onClose={onClose} />
        <ScrollView style={styles.modalBody}>
          <Text style={styles.modalTitle}>{item.title}</Text>
          <Text style={styles.modalSub}>{getTimeAgo(item.timestamp)}</Text>
          <Text style={styles.modalText}>{item.content}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function AnnouncementListModal({
  visible,
  announcements,
  onClose,
  onSelect,
}: {
  visible: boolean;
  announcements: OrganizerAnnouncement[];
  onClose: () => void;
  onSelect: (announcement: OrganizerAnnouncement) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modal}>
        <ModalHeader title="주최자 공지" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.announcementListBody}>
          <Text style={styles.listLeadTitle}>공지사항</Text>
          <Text style={styles.listLeadText}>최신 공지와 이전 안내를 한 번에 확인하세요.</Text>
          {announcements.map((announcement) => (
            <TouchableOpacity
              key={announcement.id}
              activeOpacity={0.86}
              style={styles.announcementListCard}
              onPress={() => onSelect(announcement)}
            >
              <View style={styles.announcementListIcon}>
                <Ionicons name="megaphone-outline" size={21} color={COLORS.mint} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.announcementListTitleRow}>
                  <Text style={styles.announcementListTitle}>{announcement.title}</Text>
                  {!announcement.read && <View style={styles.listUnreadDot} />}
                </View>
                <Text style={styles.announcementListSummary} numberOfLines={2}>
                  {announcement.summary}
                </Text>
                <Text style={styles.announcementListTime}>{getTimeAgo(announcement.timestamp)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#B4BCC7" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ChildModal({ child, onClose }: { child: MissingChild | null; onClose: () => void }) {
  if (!child) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modal}>
        <ModalHeader title="미아 정보" onClose={onClose} />
        <ScrollView style={styles.modalBody}>
          <Image source={{ uri: child.imageUrl }} style={styles.detailImage} />
          <Text style={styles.modalTitle}>{child.name} ({child.age}세)</Text>
          <Text style={styles.modalText}>특징: {child.description}</Text>
          <Text style={styles.modalText}>마지막 목격: {child.lastSeenLocation}</Text>
          <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${child.contactNumber}`)}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.callText}>{child.contactNumber} 연락하기</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.modalHeader}>
      <TouchableOpacity onPress={onClose}>
        <Ionicons name="chevron-down" size={25} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.modalHeaderTitle}>{title}</Text>
      <View style={{ width: 25 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1 },
  brandBlock: {},
  logo: { fontWeight: '900', letterSpacing: 0, color: COLORS.navy },
  logoAccent: { color: COLORS.mint },
  subtitle: { color: COLORS.muted, marginTop: 7, fontWeight: '500' },
  sectionTitle: { color: COLORS.text, fontWeight: '900', letterSpacing: 0 },
  emptyState: {
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    backgroundColor: '#F8FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  emptyStateText: { color: COLORS.muted, fontWeight: '800', textAlign: 'center' },
  noticeCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    minHeight: 154,
    padding: 22,
    paddingTop: 24,
    flexDirection: 'row',
    gap: 18,
    shadowColor: '#111827',
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: 'hidden',
  },
  noticeTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: COLORS.mint },
  noticeIcon: { width: 56, height: 56, borderRadius: 15, backgroundColor: '#F2FAF9', alignItems: 'center', justifyContent: 'center' },
  noticeContent: { flex: 1 },
  noticeTitle: { color: COLORS.text, fontWeight: '900', marginBottom: 14 },
  noticeSummary: { color: '#5F6C80', lineHeight: 26, marginBottom: 17, fontWeight: '500' },
  noticeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noticeTime: { color: '#ADB5BD' },
  noticeMore: { color: COLORS.mint, fontWeight: '900' },
  infoCard: {
    minHeight: 92,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#E3E6EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    gap: 18,
    backgroundColor: '#fff',
  },
  infoIcon: { width: 62, height: 62, borderRadius: 18, backgroundColor: '#F2FAF9', alignItems: 'center', justifyContent: 'center' },
  infoTitle: { color: COLORS.text, fontWeight: '900', marginBottom: 8 },
  infoText: { color: COLORS.muted, fontWeight: '700' },
  childCard: {
    minHeight: 124,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    gap: 18,
    shadowColor: '#111827',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  childImage: { borderRadius: 14, backgroundColor: '#EDF1F4' },
  childBody: { flex: 1, justifyContent: 'center' },
  childNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14 },
  childName: { color: COLORS.text, fontWeight: '900' },
  childAge: { color: '#7B8493', fontWeight: '700' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  metaText: { color: '#9BA3AF', fontWeight: '500', flex: 1 },
  findingChip: { backgroundColor: COLORS.chipBg, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  findingText: { color: COLORS.orange, fontWeight: '900' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F2F4F6' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  modalBody: { padding: 22 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 8 },
  modalSub: { fontSize: 14, color: COLORS.muted, marginBottom: 20 },
  modalText: { fontSize: 16, lineHeight: 25, color: '#4B5563', marginBottom: 12 },
  announcementListBody: { padding: 22, paddingBottom: 36 },
  listLeadTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 8 },
  listLeadText: { fontSize: 15, lineHeight: 23, color: COLORS.muted, marginBottom: 20 },
  announcementListCard: {
    minHeight: 108,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EEF1F4',
    padding: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  announcementListIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F2FAF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementListTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  announcementListTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: COLORS.text },
  listUnreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.mint },
  announcementListSummary: { fontSize: 14, lineHeight: 21, color: '#667085', marginBottom: 9 },
  announcementListTime: { fontSize: 13, color: '#ADB5BD', fontWeight: '600' },
  detailImage: { width: '100%', height: 240, borderRadius: 20, marginBottom: 20 },
  callButton: { height: 52, backgroundColor: COLORS.mint, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  callText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
