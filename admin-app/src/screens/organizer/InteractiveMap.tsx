import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../components/Colors';

const ZONES = [
  {
    id: 'A',
    name: '백년관 버정길',
    count: 51,
    level: 'danger',
    color: '#D0453B',
    bg: '#E9B8B8',
    staff: 1,
  },
  {
    id: 'B',
    name: '자연과학대 앞',
    count: 28,
    level: 'safe',
    color: '#4FA85D',
    bg: '#D8EBDC',
    staff: 3,
  },
  {
    id: 'C',
    name: '공대 흡연부스 옆',
    count: 37,
    level: 'warning',
    color: '#E5A331',
    bg: '#F3E5CC',
    staff: 2,
  },
  {
    id: 'D',
    name: '인경관 주차장 입구',
    count: 17,
    level: 'safe',
    color: '#4FA85D',
    bg: '#D8EBDC',
    staff: 2,
  },
  {
    id: 'E',
    name: '공대-백년관 사이',
    count: 33,
    level: 'warning',
    color: '#E5A331',
    bg: '#F3E5CC',
    staff: 2,
  },
  {
    id: 'F',
    name: '백년관 잔디구장',
    count: 24,
    level: 'safe',
    color: '#4FA85D',
    bg: '#D8EBDC',
    staff: 3,
  },
];

const STAFF_GROUPS = [
  {
    zone: '백년관 버정길',
    count: 1,
    status: 'danger',
    members: [{ name: '김민수', role: '안전관리' }],
  },
  {
    zone: '자연과학대 앞',
    count: 3,
    status: 'safe',
    members: [
      { name: '이지은', role: '안전관리' },
      { name: '박준호', role: '의료지원' },
      { name: '최수진', role: '안전관리' },
    ],
  },
  {
    zone: '공대 흡연부스 옆',
    count: 2,
    status: 'warning',
    members: [
      { name: '정다운', role: '안전관리' },
      { name: '강태영', role: '의료지원' },
    ],
  },
  {
    zone: '인경관 주차장 입구',
    count: 2,
    status: 'safe',
    members: [
      { name: '윤서연', role: '안전관리' },
      { name: '한지훈', role: '안전관리' },
    ],
  },
  {
    zone: '공대-백년관 사이',
    count: 2,
    status: 'danger',
    members: [
      { name: '임유진', role: '의료지원' },
      { name: '송민재', role: '안전관리' },
    ],
  },
  {
    zone: '백년관 잔디구장',
    count: 3,
    status: 'safe',
    members: [
      { name: '조서영', role: '안전관리' },
      { name: '배현우', role: '의료지원' },
      { name: '류지민', role: '안전관리' },
    ],
  },
];

const getStatusColor = (status: string) => {
  if (status === 'danger') return '#D0453B';
  if (status === 'warning') return '#E5A331';
  return '#4FA85D';
};

export default function InteractiveMap() {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.title}>인력 관리</Text>
          <Text style={styles.subtitle}>실시간 히트맵 및 배치 조정</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>실시간 히트맵</Text>

          <View style={styles.heatmapCard}>
            <View style={styles.grid}>
              {ZONES.map(zone => (
                <View
                  key={zone.id}
                  style={[styles.zoneCard, { backgroundColor: zone.bg }]}
                >
                  <Text style={[styles.zoneName, { color: zone.color }]}>
                    {zone.name}
                  </Text>

                  <Text style={styles.zoneCount}>{zone.count}명</Text>

                  <View style={styles.staffDots}>
                    {Array.from({ length: zone.staff }).map((_, idx) => (
                      <View key={idx} style={styles.staffDot}>
                        <Ionicons name="person" size={8} color="#5B73F2" />
                      </View>
                    ))}
                  </View>

                  <View style={styles.staffBadge}>
                    <Ionicons name="people-outline" size={11} color="#5B73F2" />
                    <Text style={styles.staffBadgeText}>{zone.staff}명</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4FA85D' }]} />
              <Text style={styles.legendText}>여유</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#E5A331' }]} />
              <Text style={styles.legendText}>주의</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#D0453B' }]} />
              <Text style={styles.legendText}>위험</Text>
            </View>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>권장 인력 재배치</Text>
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentText}>긴급</Text>
            </View>
          </View>

          <View style={styles.reassignCard}>
            <View style={styles.reassignHeader}>
              <View style={styles.warningIcon}>
                <Ionicons name="warning-outline" size={24} color="white" />
              </View>

              <View>
                <Text style={styles.reassignTitle}>인력 재배치 필요</Text>
                <Text style={styles.reassignSubtitle}>
                  백년관 버정길 위험 수준 감지
                </Text>
              </View>
            </View>

            <View style={styles.reassignBody}>
              <View style={[styles.routeBox, styles.fromBox]}>
                <Text style={styles.routeLabelBlue}>출발 구역</Text>
                <Text style={styles.routeTitle}>자연과학대 앞</Text>
                <Text style={styles.routeSub}>3명 배치</Text>
              </View>

              <View style={styles.arrowBox}>
                <Ionicons name="arrow-forward" size={26} color="#5B73F2" />
                <Text style={styles.moveCount}>2명</Text>
              </View>

              <View style={[styles.routeBox, styles.toBox]}>
                <Text style={styles.routeLabelRed}>도착 구역</Text>
                <Text style={styles.routeTitle}>백년관 버정길</Text>
                <Text style={styles.routeSub}>1명 배치</Text>
              </View>
            </View>

            <View style={styles.changeBox}>
              <View style={styles.changeItem}>
                <Text style={styles.changeLabel}>현재 인력</Text>
                <Text style={styles.beforeNum}>1명</Text>
              </View>

              <Ionicons name="arrow-forward" size={24} color={Colors.textSecondary} />

              <View style={styles.changeItem}>
                <Text style={styles.changeLabel}>재배치 후</Text>
                <Text style={styles.afterNum}>3명</Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.85} style={styles.actionButton}>
              <Ionicons name="people-outline" size={21} color="white" />
              <Text style={styles.actionButtonText}>재배치 실행</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>전체 인력 관리</Text>
            <TouchableOpacity activeOpacity={0.85} style={styles.addButton}>
              <Ionicons name="add" size={28} color="white" />
            </TouchableOpacity>
          </View>

          {STAFF_GROUPS.map(group => (
            <View key={group.zone} style={styles.staffGroupCard}>
              <View style={styles.staffGroupHeader}>
                <View style={styles.staffGroupTitleWrap}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: getStatusColor(group.status) },
                    ]}
                  />
                  <Text style={styles.staffGroupTitle}>{group.zone}</Text>
                  <Text style={styles.staffGroupCount}>({group.count}명)</Text>
                </View>

                <TouchableOpacity>
                  <Ionicons name="pencil-outline" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {group.members.map(member => (
                <View key={member.name} style={styles.memberCard}>
                  <View style={styles.avatar}>
                    <Ionicons name="person-circle-outline" size={32} color="#5B73F2" />
                  </View>

                  <View>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberRole}>{member.role}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const PRIMARY = '#5B73F2';
const DANGER = '#D0453B';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  header: {
    paddingHorizontal: 28,
    paddingTop: 76,
    paddingBottom: 30,
    backgroundColor: Colors.white,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 24,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.35,
  },
  heatmapCard: {
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  zoneCard: {
    width: '31.5%',
    height: 100,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingTop: 12,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  zoneName: {
    fontSize: 10.5,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  zoneCount: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '700',
  },
  staffDots: {
    position: 'absolute',
    bottom: 26,
    flexDirection: 'row',
    gap: 4,
  },
  staffDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#5B73F2',
  },
  staffBadge: {
    position: 'absolute',
    bottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  staffBadgeText: {
    fontSize: 10,
    color: PRIMARY,
    fontWeight: '900',
  },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginTop: 14,
    marginBottom: 26,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
  },

  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  urgentBadge: {
    backgroundColor: DANGER,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  urgentText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '900',
  },

  reassignCard: {
    borderWidth: 1.5,
    borderColor: DANGER,
    backgroundColor: '#FFF3F3',
    borderRadius: 18,
    marginBottom: 28,
    overflow: 'hidden',
    shadowColor: DANGER,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  reassignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F5CFCF',
  },
  warningIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: DANGER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reassignTitle: {
    fontSize: 17,
    color: Colors.text,
    fontWeight: '900',
  },
  reassignSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: DANGER,
    fontWeight: '800',
  },
  reassignBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
  },
  routeBox: {
    flex: 1,
    height: 92,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  fromBox: {
    borderWidth: 1.5,
    borderColor: PRIMARY,
    backgroundColor: '#F2F6FF',
  },
  toBox: {
    borderWidth: 1.5,
    borderColor: DANGER,
    backgroundColor: '#FFF8F8',
  },
  routeLabelBlue: {
    fontSize: 11,
    color: PRIMARY,
    fontWeight: '900',
    marginBottom: 8,
  },
  routeLabelRed: {
    fontSize: 11,
    color: DANGER,
    fontWeight: '900',
    marginBottom: 8,
  },
  routeTitle: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '900',
    marginBottom: 8,
  },
  routeSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  arrowBox: {
    width: 62,
    alignItems: 'center',
  },
  moveCount: {
    marginTop: 5,
    fontSize: 12,
    color: DANGER,
    fontWeight: '900',
  },
  changeBox: {
    marginHorizontal: 18,
    marginBottom: 18,
    backgroundColor: Colors.background,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeItem: {
    alignItems: 'center',
    flex: 1,
  },
  changeLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
  },
  beforeNum: {
    fontSize: 24,
    color: DANGER,
    fontWeight: '900',
  },
  afterNum: {
    fontSize: 24,
    color: PRIMARY,
    fontWeight: '900',
  },
  actionButton: {
    marginHorizontal: 18,
    marginBottom: 18,
    height: 54,
    borderRadius: 15,
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: PRIMARY,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
  },

  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  staffGroupCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    backgroundColor: Colors.white,
  },
  staffGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  staffGroupTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
  staffGroupTitle: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '900',
  },
  staffGroupCount: {
    marginLeft: 6,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  memberCard: {
    marginTop: 12,
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '900',
  },
  memberRole: {
    marginTop: 3,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
});