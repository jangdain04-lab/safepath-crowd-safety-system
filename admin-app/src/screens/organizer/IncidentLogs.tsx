import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../components/Colors';
import { fetchEventSettings, fetchIncidents, IncidentLog } from '../../services/api';

type IncidentZoneConfig = {
  zoneId: string;
  cctvName: string;
  placeName: string;
};

const COORDINATE_PATTERN = /\s*\([-+]?\d+(?:\.\d+)?,\s*[-+]?\d+(?:\.\d+)?\)\s*$/;

function getConfiguredCctvName(value?: string | null) {
  const raw = value || '';
  const hasCoordinate = COORDINATE_PATTERN.test(raw);
  const cleaned = raw.replace(COORDINATE_PATTERN, '').trim();

  if (!cleaned) return null;
  if (/^\d+번\s*CCTV$/.test(cleaned) && !hasCoordinate) return null;

  return cleaned;
}

function hasConfiguredCctv(value?: string | null) {
  return Boolean((value || '').trim());
}

function applyIncidentZones(
  sourceIncidents: IncidentLog[],
  zoneConfigs: IncidentZoneConfig[],
) {
  if (zoneConfigs.length === 0 || sourceIncidents.length === 0) return [];

  const zonesById = new Map(zoneConfigs.map((zone) => [zone.zoneId, zone]));

  return sourceIncidents
    .map((base) => {
      if (!base.zone_id) return base;

      const zone = zonesById.get(String(base.zone_id));

      if (!zone) return null;

      return {
        ...base,
        gate: zone.cctvName,
        sector: zone.placeName,
        description: `${zone.cctvName} 구역 위험 수준 지속 감지`,
      };
    })
    .filter((incident): incident is IncidentLog => incident !== null);
}

const INCIDENTS: IncidentLog[] = [
  {
    id: '1',
    time: '14:32',
    date: '2026.04.08',
    sector: 'Sector A',
    gate: 'Gate 1',
    level: 'critical',
    density: 458,
    duration: '8분 37초',
    description: '급격한 인원 증가로 인한 위험 상황',
    image:
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=1200&auto=format&fit=crop',
    stats: [
      { time: '14:28', density: 286, speedChange: 12 },
      { time: '14:30', density: 341, speedChange: 24 },
      { time: '14:32', density: 458, speedChange: 43 },
      { time: '14:34', density: 421, speedChange: 31 },
    ],
  },
  {
    id: '2',
    time: '12:45',
    date: '2026.04.08',
    sector: 'Sector A',
    gate: 'Gate 1',
    level: 'critical',
    density: 390,
    duration: '5분 22초',
    description: '출입구 병목 현상',
    image:
      'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=1200&auto=format&fit=crop',
    stats: [
      { time: '12:41', density: 244, speedChange: 15 },
      { time: '12:43', density: 318, speedChange: 29 },
      { time: '12:45', density: 390, speedChange: 38 },
      { time: '12:47', density: 352, speedChange: 22 },
    ],
  },
  {
    id: '3',
    time: '22:15',
    date: '2026.04.07',
    sector: 'Sector B',
    gate: 'Gate 2',
    level: 'critical',
    density: 476,
    duration: '11분 08초',
    description: '퇴장 시 급격한 밀집',
    image:
      'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?q=80&w=1200&auto=format&fit=crop',
    stats: [
      { time: '22:10', density: 301, speedChange: 18 },
      { time: '22:12', density: 386, speedChange: 31 },
      { time: '22:15', density: 476, speedChange: 46 },
      { time: '22:18', density: 438, speedChange: 35 },
    ],
  },
];

const DANGER = '#D0453B';
const DANGER_LIGHT = '#FFF3F3';
const PRIMARY = '#55CCC4';
const PRIMARY_LIGHT = '#EFFFFD';
const DARK = '#111827';
const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateKey(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildVideoPlayerHtml(videoUrl: string) {
  const safeUrl = escapeHtml(videoUrl);
  const jsUrl = JSON.stringify(videoUrl);

  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
#wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  text-align: center;
}
video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
#message {
  padding: 24px;
  font-size: 16px;
  line-height: 1.5;
}
</style>
</head>
<body>
<div id="wrap">
  <video id="player" controls playsinline webkit-playsinline preload="metadata">
  </video>
  <div id="message" style="display:none;">녹화 영상을 불러오지 못했습니다.<br>서버 주소 또는 ngrok 연결을 확인해주세요.</div>
</div>
<script>
(function () {
  const video = document.getElementById('player');
  const message = document.getElementById('message');
  const videoUrl = ${jsUrl};

  async function loadVideo() {
    try {
      const response = await fetch(videoUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error('empty video');
      }

      video.src = URL.createObjectURL(blob);
      video.load();
    } catch (error) {
      video.style.display = 'none';
      message.style.display = 'block';
    }
  }

  video.addEventListener('error', function () {
    video.style.display = 'none';
    message.style.display = 'block';
  });

  loadVideo();
})();
</script>
</body>
</html>`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.replace(/-/g, '.').split('.').map((item) => Number(item));

  if (!year || !month || !day) return new Date();

  return new Date(year, month - 1, day);
}

function getCalendarCells(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  for (let index = 0; index < startDay; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function isDangerIncident(incident: IncidentLog) {
  return incident.level === 'critical' && incident.density > 0;
}

export default function IncidentLogs() {
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(parseDateKey(formatDateKey(new Date())));
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentLog | null>(null);
  const [selectedVideoIncident, setSelectedVideoIncident] = useState<IncidentLog | null>(null);
  const [incidents, setIncidents] = useState<IncidentLog[]>([]);

  useFocusEffect(
    useCallback(() => {
      const today = formatDateKey(new Date());
      setSelectedDate(today);
      setCalendarMonth(parseDateKey(today));
    }, []),
  );

  useEffect(() => {
    let mounted = true;

    const loadIncidents = async () => {
      try {
        const [settings, serverIncidents] = await Promise.all([
          fetchEventSettings(),
          fetchIncidents(),
        ]);

        if (!mounted) return;

        const zoneCount = Math.max(
          settings.cctvLocations.length,
          settings.placeNames.length,
        );
        const zoneConfigs = Array.from({ length: zoneCount })
          .map((_, index) => {
            const location = settings.cctvLocations[index] || '';
            const placeName = (settings.placeNames[index] || '').trim();

            if (!hasConfiguredCctv(location) && !placeName) return null;

            const cctvName =
              getConfiguredCctvName(location) || placeName || `${index + 1}번 CCTV`;

            return {
              zoneId: String(index + 1),
              cctvName,
              placeName: placeName || cctvName,
            };
          })
          .filter((zone): zone is IncidentZoneConfig => zone !== null);
        const visibleIncidents = applyIncidentZones(serverIncidents, zoneConfigs);

        const dangerIncidents = visibleIncidents.filter(isDangerIncident);

        setIncidents(dangerIncidents);
      } catch (error) {
        console.warn('Failed to load incidents', error);
      }
    };

    loadIncidents();
    const timer = setInterval(loadIncidents, 10000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const dangerIncidents = useMemo(
    () => incidents.filter(isDangerIncident),
    [incidents],
  );
  const dates = useMemo(
    () => Array.from(new Set(dangerIncidents.map((inc) => inc.date))),
    [dangerIncidents],
  );
  const dateSet = useMemo(() => new Set(dates), [dates]);
  const calendarCells = useMemo(() => getCalendarCells(calendarMonth), [calendarMonth]);
  const calendarTitle = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;

  const filtered = dangerIncidents.filter((inc) => {
    const matchesDate = inc.date === selectedDate;
    const matchesSearch =
      !search ||
      inc.sector.toLowerCase().includes(search.toLowerCase()) ||
      inc.gate.toLowerCase().includes(search.toLowerCase()) ||
      inc.description.toLowerCase().includes(search.toLowerCase());

    return matchesDate && matchesSearch;
  });

  if (selectedIncident) {
    const dangerRows = selectedIncident.stats;

    return (
      <View style={styles.statsScreen}>
        <View style={styles.statsHeader}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.backButton}
            onPress={() => setSelectedIncident(null)}
          >
            <Ionicons name="arrow-back" size={25} color={DARK} />
          </TouchableOpacity>

          <View style={styles.statsHeaderIcon}>
            <Ionicons name="warning-outline" size={25} color={Colors.white} />
          </View>

          <Text style={styles.statsTitle}>위험 감지 기록</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.statsScrollContent}
        >
          <View style={styles.statsSummaryCard}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>위험</Text>
            </View>

            <Text style={styles.statsIncidentTitle}>
              {selectedIncident.gate} · {selectedIncident.sector}
            </Text>
            <Text style={styles.statsDescription}>
              위험 상태가 감지된 시간과 인원수입니다.
            </Text>
            <Text style={styles.statsDateText}>
              {selectedIncident.date} {selectedIncident.time} · {selectedIncident.duration}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>위험했던 시간과 인원수</Text>

          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <Text style={styles.statTime}>{selectedIncident.time}</Text>
              <Text style={styles.statValue}>{selectedIncident.density}명</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );

    return (
      <View style={styles.statsScreen}>
        <View style={styles.statsHeader}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.backButton}
            onPress={() => setSelectedIncident(null)}
          >
            <Ionicons name="arrow-back" size={25} color={DARK} />
          </TouchableOpacity>

          <View style={styles.statsHeaderIcon}>
            <Ionicons name="analytics-outline" size={25} color={Colors.white} />
          </View>

          <Text style={styles.statsTitle}>사건 통계 기록</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.statsScrollContent}
        >
          <View style={styles.statsSummaryCard}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>위험</Text>
            </View>

            <Text style={styles.statsIncidentTitle}>
              {selectedIncident.gate} · {selectedIncident.sector}
            </Text>
            <Text style={styles.statsDescription}>
              {selectedIncident.description}
            </Text>
            <Text style={styles.statsDateText}>
              {selectedIncident.date} {selectedIncident.time} · {selectedIncident.duration}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>시간별 밀집도</Text>

          <View style={styles.statsCard}>
            {dangerRows.map((item, index) => (
              <View key={`density-${item.time}-${index}`} style={styles.statRow}>
                <Text style={styles.statTime}>{item.time}</Text>

                <View style={styles.statBarBg}>
                  <View
                    style={[
                      styles.densityStatBar,
                      { width: '0%' },
                    ]}
                  />
                </View>

                <Text style={styles.statValue}>{item.density}명</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>급격한 속도 변화율</Text>

          <View style={styles.statsCard}>
            {dangerRows.map((item, index) => (
              <View key={`speed-${item.time}-${index}`} style={styles.statRow}>
                <Text style={styles.statTime}>{item.time}</Text>

                <View style={styles.statBarBg}>
                  <View
                    style={[
                      styles.speedStatBar,
                      {
                        width: `${Math.min(
                          100,
                          0,
                        )}%`,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.statValue}>{item.speedChange}%</Text>
              </View>
            ))}
          </View>

          <View style={styles.statsInfoBox}>
            <Ionicons name="information-circle-outline" size={24} color={PRIMARY} />
            <Text style={styles.statsInfoText}>
              밀집도와 속도 변화율이 동시에 높아진 시점은 위험도 상승 구간으로 판단됩니다.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>사건 기록</Text>
            <View style={styles.badgeMini}>
              <Text style={styles.badgeMiniText}>위험 {filtered.length}</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>자동 녹화 영상 및 로그</Text>
        </View>

        <View style={styles.content}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.dateButton}
            onPress={() => setDateModalVisible(true)}
          >
            <View style={styles.dateButtonLeft}>
              <Ionicons name="calendar-outline" size={22} color={PRIMARY} />
              <Text style={styles.dateButtonText}>{selectedDate}</Text>
            </View>
            <Text style={styles.dateButtonSub}>날짜 변경</Text>
          </TouchableOpacity>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={22} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="게이트 또는 구역 검색..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <View style={styles.dateGroup}>
            <Text style={styles.dateLabel}>{selectedDate}</Text>

            {filtered.map((inc, index) => {
              const isLast = index === filtered.length - 1;

              return (
                <View key={inc.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineDotOuter}>
                      <View style={styles.timelineDotInner} />
                    </View>
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>

                  <View style={styles.incidentCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>위험</Text>
                      </View>

                      <View style={styles.timeRow}>
                        <Ionicons
                          name="time-outline"
                          size={18}
                          color={Colors.textSecondary}
                        />
                        <Text style={styles.timeText}>
                          {inc.date} {inc.time}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.cardTitle}>
                      {inc.gate} · {inc.sector}
                    </Text>

                    <Text style={styles.description}>{inc.description}</Text>

                    <View style={styles.densityBox}>
                      <View>
                        <Text style={styles.densityLabel}>최고 밀집도</Text>
                        <View style={styles.densityBarBg}>
                          <View
                            style={[
                              styles.densityBarFill,
                              {
                                width: `${Math.min(
                                  100,
                                  Math.round(inc.density / 5),
                                )}%` as any,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      <Text style={styles.densityValue}>{inc.density}명</Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.recordButton}
                      onPress={() => setSelectedIncident(inc)}
                    >
                      <Ionicons
                        name="stats-chart-outline"
                        size={20}
                        color={Colors.white}
                      />
                      <Text style={styles.recordButtonText}>사건 기록 보기</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[
                        styles.videoButton,
                        !inc.videoUrl && styles.videoButtonDisabled,
                      ]}
                      disabled={!inc.videoUrl}
                      onPress={() => setSelectedVideoIncident(inc)}
                    >
                      <Ionicons
                        name="videocam-outline"
                        size={20}
                        color={Colors.white}
                      />
                      <Text style={styles.videoButtonText}>녹화 영상 보기</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Ionicons
                name="document-text-outline"
                size={42}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>해당 날짜의 기록이 없습니다.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={dateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dateModal}>
            <Text style={styles.dateModalTitle}>날짜 선택</Text>

            <View style={styles.calendarHeader}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.calendarNavButton}
                onPress={() => {
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                  );
                }}
              >
                <Ionicons name="chevron-back" size={22} color={DARK} />
              </TouchableOpacity>

              <Text style={styles.calendarMonthText}>{calendarTitle}</Text>

              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.calendarNavButton}
                onPress={() => {
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                  );
                }}
              >
                <Ionicons name="chevron-forward" size={22} color={DARK} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEK_DAYS.map((day) => (
                <Text key={day} style={styles.weekText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((date, index) => {
                const dateKey = date ? formatDateKey(date) : '';
                const isSelected = dateKey === selectedDate;
                const hasRecord = date ? dateSet.has(dateKey) : false;

                return (
                  <TouchableOpacity
                    key={`${dateKey || 'empty'}-${index}`}
                    activeOpacity={date ? 0.85 : 1}
                    disabled={!date}
                    style={[
                      styles.calendarDay,
                      isSelected && styles.calendarDaySelected,
                    ]}
                    onPress={() => {
                      if (!date) return;
                      setSelectedDate(dateKey);
                      setCalendarMonth(parseDateKey(dateKey));
                      setDateModalVisible(false);
                    }}
                  >
                    {date && (
                      <>
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                        {hasRecord && <View style={styles.recordDot} />}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.modalCloseButton}
              onPress={() => setDateModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(selectedVideoIncident)}
        animationType="slide"
        onRequestClose={() => setSelectedVideoIncident(null)}
      >
        <View style={styles.videoModalRoot}>
          <View style={styles.videoModalHeader}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.videoModalClose}
              onPress={() => setSelectedVideoIncident(null)}
            >
              <Ionicons name="close" size={26} color={DARK} />
            </TouchableOpacity>
            <View style={styles.videoModalTitleWrap}>
              <Text style={styles.videoModalTitle}>녹화 영상</Text>
              <Text style={styles.videoModalSubTitle}>
                {selectedVideoIncident
                  ? `${selectedVideoIncident.gate} · ${selectedVideoIncident.time}`
                  : ''}
              </Text>
            </View>
          </View>

          {selectedVideoIncident?.videoUrl ? (
            <WebView
              style={styles.videoPlayer}
              originWhitelist={['*']}
              source={{ html: buildVideoPlayerHtml(selectedVideoIncident.videoUrl) }}
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
            />
          ) : (
            <View style={styles.videoEmpty}>
              <Ionicons name="videocam-off-outline" size={42} color={Colors.textMuted} />
              <Text style={styles.videoEmptyText}>저장된 녹화 영상이 없습니다.</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  scrollContent: {
    paddingBottom: 108,
  },

  header: {
    paddingHorizontal: 28,
    paddingTop: 76,
    paddingBottom: 34,
    backgroundColor: Colors.white,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  title: {
    fontSize: 34,
    fontWeight: '900',
    color: DARK,
    letterSpacing: -0.8,
  },

  badgeMini: {
    backgroundColor: '#FDECEC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginTop: 3,
  },

  badgeMiniText: {
    color: DANGER,
    fontSize: 15,
    fontWeight: '900',
  },

  subtitle: {
    marginTop: 10,
    fontSize: 17,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  dateButton: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: PRIMARY_LIGHT,
    borderWidth: 1.5,
    borderColor: '#BCEFEB',
    paddingHorizontal: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dateButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  dateButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: DARK,
  },

  dateButtonSub: {
    fontSize: 14,
    fontWeight: '800',
    color: PRIMARY,
  },

  searchBox: {
    height: 62,
    borderRadius: 17,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 10,
    marginBottom: 24,
  },

  searchInput: {
    flex: 1,
    fontSize: 17,
    color: DARK,
    fontWeight: '600',
  },

  dateGroup: {
    marginTop: 2,
  },

  dateLabel: {
    fontSize: 22,
    color: Colors.textSecondary,
    fontWeight: '900',
    marginBottom: 14,
  },

  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 22,
  },

  timelineRail: {
    width: 34,
    alignItems: 'center',
  },

  timelineDotOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: DANGER,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 2,
  },

  timelineDotInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: DANGER,
  },

  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginTop: 4,
  },

  incidentCard: {
    flex: 1,
    backgroundColor: DANGER_LIGHT,
    borderWidth: 1,
    borderColor: '#F3CFCF',
    borderRadius: 22,
    padding: 18,
    shadowColor: DANGER,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  badge: {
    backgroundColor: DANGER,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 12,
  },

  badgeText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '900',
  },

  timeRow: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },

  timeText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '800',
  },

  cardTitle: {
    fontSize: 23,
    color: DARK,
    fontWeight: '900',
    marginBottom: 8,
  },

  description: {
    fontSize: 17,
    color: DARK,
    fontWeight: '600',
    marginBottom: 14,
    lineHeight: 24,
  },

  imageWrap: {
    height: 142,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: Colors.background,
  },

  image: {
    width: '100%',
    height: '100%',
  },

  durationBadge: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  durationText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '900',
  },

  densityBox: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  densityLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '900',
    marginBottom: 9,
  },

  densityBarBg: {
    width: 190,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },

  densityBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: DANGER,
  },

  densityValue: {
    fontSize: 28,
    color: DANGER,
    fontWeight: '900',
  },

  recordButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: DANGER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },

  recordButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
  },

  videoButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: PRIMARY,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  videoButtonDisabled: {
    backgroundColor: Colors.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },

  videoButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
  },

  empty: {
    alignItems: 'center',
    paddingTop: 70,
  },

  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  dateModal: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: Colors.white,
    padding: 24,
  },

  dateModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: DARK,
    marginBottom: 18,
  },

  dateOption: {
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dateOptionSelected: {
    borderColor: PRIMARY,
    backgroundColor: PRIMARY_LIGHT,
  },

  dateOptionText: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textSecondary,
  },

  dateOptionTextSelected: {
    color: DARK,
    fontWeight: '900',
  },

  calendarHeader: {
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  calendarNavButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  calendarMonthText: {
    fontSize: 18,
    fontWeight: '900',
    color: DARK,
  },

  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },

  weekText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
    color: Colors.textMuted,
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },

  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },

  calendarDaySelected: {
    backgroundColor: PRIMARY,
  },

  calendarDayText: {
    fontSize: 16,
    fontWeight: '900',
    color: DARK,
  },

  calendarDayTextSelected: {
    color: Colors.white,
  },

  recordDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: DANGER,
    marginTop: 4,
  },

  modalCloseButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  modalCloseText: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.white,
  },

  videoModalRoot: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  videoModalHeader: {
    paddingTop: 62,
    paddingHorizontal: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
    flexDirection: 'row',
    alignItems: 'center',
  },

  videoModalClose: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  videoModalTitleWrap: {
    flex: 1,
  },

  videoModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: DARK,
  },

  videoModalSubTitle: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textSecondary,
  },

  videoPlayer: {
    flex: 1,
    backgroundColor: '#000',
  },

  videoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  videoEmptyText: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  statsScreen: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },

  statsHeader: {
    backgroundColor: Colors.white,
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

  statsHeaderIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  statsTitle: {
    flex: 1,
    fontSize: 25,
    fontWeight: '900',
    color: DARK,
    letterSpacing: -0.6,
  },

  statsScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 120,
  },

  statsSummaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 28,
  },

  statsIncidentTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: DARK,
    marginTop: 14,
    marginBottom: 8,
  },

  statsDescription: {
    fontSize: 17,
    fontWeight: '700',
    color: DARK,
    marginBottom: 8,
  },

  statsDateText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: DARK,
    marginBottom: 14,
    letterSpacing: -0.4,
  },

  statsCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 28,
  },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  statTime: {
    width: 54,
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textSecondary,
  },

  statBarBg: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.background,
    overflow: 'hidden',
    marginHorizontal: 12,
  },

  densityStatBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: DANGER,
  },

  speedStatBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: PRIMARY,
  },

  statValue: {
    width: 58,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '900',
    color: DARK,
  },

  statsInfoBox: {
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#BCEFEB',
    flexDirection: 'row',
    gap: 10,
  },

  statsInfoText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: DARK,
    lineHeight: 22,
  },
});
