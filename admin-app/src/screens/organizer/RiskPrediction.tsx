import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Polyline,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import { Colors } from '../../components/Colors';
import { fetchEventSettings, fetchRiskPredictions } from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const THEME = {
  primary: '#55CCC4',
  dark: '#111827',
};

const CARD_MARGIN = 24;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2;
const CHART_WIDTH = CARD_WIDTH - 40;
const CHART_HEIGHT = 230;

type RiskLevel = 'critical' | 'warning' | 'safe';

interface PredictionItem {
  id: string;
  zoneId?: string;
  sector: string;
  time: string;
  level: RiskLevel;
  progress: number;
  icon: keyof typeof Ionicons.glyphMap;
  values: number[];
}

const COORDINATE_PATTERN = /\s*\([-+]?\d+(?:\.\d+)?,\s*[-+]?\d+(?:\.\d+)?\)\s*$/;

function getConfiguredCctvName(value?: string | null) {
  const raw = value || '';
  const hasCoordinate = COORDINATE_PATTERN.test(raw);
  const cleaned = raw.replace(COORDINATE_PATTERN, '').trim();

  if (!cleaned) return null;
  if (/^\d+번\s*CCTV$/.test(cleaned) && !hasCoordinate) return null;

  return cleaned;
}

function applyPredictionPlaces(
  sourcePredictions: PredictionItem[],
  placeNames: string[],
) {
  if (placeNames.length === 0) return [];

  return placeNames.map((placeName, index) => {
    const base = sourcePredictions[index];

    return {
      id: `${base?.id ?? 'collecting'}-${index + 1}`,
      zoneId: base?.zoneId,
      sector: placeName,
      time: base?.time ?? '수집 중',
      level: base?.level ?? 'safe',
      progress: base?.progress ?? 0,
      icon: base?.icon ?? 'pulse',
      values: base?.values?.length ? base.values : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
  });
}

function getLevelText(level: RiskLevel) {
  if (level === 'critical') return '위험';
  if (level === 'warning') return '주의';
  return '양호';
}

function getLevelColor(level: RiskLevel) {
  if (level === 'critical') return '#E93035';
  if (level === 'warning') return '#F59E0B';
  return '#16A34A';
}

function getLevelBg(level: RiskLevel) {
  if (level === 'critical') return '#FFF1F1';
  if (level === 'warning') return '#FFF8E8';
  return '#ECFDF3';
}

function getLevelBorder(level: RiskLevel) {
  if (level === 'critical') return '#F6CACA';
  if (level === 'warning') return '#F6E2A9';
  return '#BFEFD1';
}

function PredictionChart({
  color,
  values,
}: {
  color: string;
  values: number[];
}) {
  const leftPad = 38;
  const rightPad = 18;
  const topPad = 22;
  const bottomPad = 34;

  const graphW = CHART_WIDTH - leftPad - rightPad;
  const graphH = CHART_HEIGHT - topPad - bottomPad;

  const max = 70;
  const currentIndex = 5;

  const getX = (index: number) =>
    leftPad + (index / (values.length - 1)) * graphW;

  const getY = (value: number) =>
    topPad + graphH - (value / max) * graphH;

  const pastPoints = values
    .slice(0, currentIndex + 1)
    .map((v, i) => `${getX(i)},${getY(v)}`)
    .join(' ');

  const futurePoints = values
    .slice(currentIndex)
    .map((v, i) => `${getX(i + currentIndex)},${getY(v)}`)
    .join(' ');

  const currentX = getX(currentIndex);

  return (
    <View style={styles.chartWrap}>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {[0, 20, 40, 60].map(v => {
          const y = getY(v);

          return (
            <React.Fragment key={v}>
              <Line
                x1={leftPad}
                y1={y}
                x2={CHART_WIDTH - rightPad}
                y2={y}
                stroke="#E4E7EB"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <SvgText
                x={leftPad - 12}
                y={y + 4}
                fontSize="10"
                fill="#8B95A1"
                textAnchor="end"
              >
                {v}
              </SvgText>
            </React.Fragment>
          );
        })}

        <Line
          x1={currentX}
          y1={topPad}
          x2={currentX}
          y2={CHART_HEIGHT - bottomPad}
          stroke="#8B95A1"
          strokeWidth="2"
          strokeDasharray="6 6"
        />

        <SvgText
          x={currentX}
          y={topPad - 5}
          fontSize="9"
          fill="#8B95A1"
          textAnchor="middle"
        >
          현재
        </SvgText>

        <Polyline
          points={pastPoints}
          fill="none"
          stroke={THEME.primary}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <Polyline
          points={futurePoints}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="6 6"
        />

        {['25분전', '15분전', '5분전', '현재', '+5분', '+10분', '+20분'].map(
          (label, i) => {
            const mappedIndex =
              i === 0 ? 0 :
              i === 1 ? 2 :
              i === 2 ? 4 :
              i === 3 ? 5 :
              i === 4 ? 6 :
              i === 5 ? 7 : 9;

            return (
              <SvgText
                key={label}
                x={getX(mappedIndex)}
                y={CHART_HEIGHT - 10}
                fontSize="10"
                fill="#8B95A1"
                textAnchor="middle"
              >
                {label}
              </SvgText>
            );
          },
        )}
      </Svg>

      <View style={styles.legendDivider} />

      <View style={styles.chartLegendRow}>
        <View style={styles.chartLegendItem}>
          <View style={[styles.legendLine, { backgroundColor: THEME.primary }]} />
          <Text style={styles.chartLegendText}>과거 데이터</Text>
        </View>

        <View style={styles.chartLegendItem}>
          <View style={[styles.legendDashed, { borderColor: color }]} />
          <Text style={styles.chartLegendText}>예측 데이터</Text>
        </View>
      </View>
    </View>
  );
}

export default function RiskPrediction({ navigation }: any) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadPredictions = async () => {
      try {
        const [settings, serverPredictions] = await Promise.all([
          fetchEventSettings(),
          fetchRiskPredictions(),
        ]);

        if (!mounted) return;

        const configuredPlaceNames = settings.cctvLocations
          .map((location, index) => {
            const cctvName = getConfiguredCctvName(location);

            if (!cctvName) return null;

            return settings.placeNames[index] || cctvName;
          })
          .filter((placeName): placeName is string => Boolean(placeName));
        const normalizedPredictions = serverPredictions.map((item) => ({
            id: item.id,
            zoneId: item.zone_id,
            sector: item.sector,
            time: item.time,
            level: item.level,
            progress: item.progress,
            icon: item.icon as keyof typeof Ionicons.glyphMap,
            values: item.values,
          }));
        const visiblePredictions = applyPredictionPlaces(
          normalizedPredictions,
          configuredPlaceNames,
        );

        setPredictions(visiblePredictions);

        setExpandedId((current) => {
          if (current && visiblePredictions.some((item) => item.id === current)) {
            return current;
          }

          return visiblePredictions[0]?.id ?? null;
        });
      } catch (error) {
        console.warn('Failed to load risk predictions', error);
      }
    };

    loadPredictions();
    const timer = setInterval(loadPredictions, 10000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={THEME.dark} />
        </TouchableOpacity>

        <View>
          <Text style={styles.title}>위험 예측</Text>
          <Text style={styles.subtitle}>구역별 인구 밀도 추세 예측</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>위험 예측 그래프</Text>

        {predictions.map(item => {
          const color = getLevelColor(item.level);

          return (
            <View
              key={item.id}
              style={[
                styles.predictionCard,
                {
                  backgroundColor: getLevelBg(item.level),
                  borderColor: getLevelBorder(item.level),
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <View style={styles.predictionHeader}>
                  <View style={styles.predictionTitleRow}>
                    <Ionicons name={item.icon} size={20} color={color} />
                    <View>
                      <Text style={styles.predictionTitle}>{item.sector}</Text>
                      <Text style={styles.predictionSub}>
                        {item.time} {getLevelText(item.level)} 예상
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.percentBadge, { backgroundColor: color }]}>
                    <Text style={styles.percentBadgeText}>{item.progress}%</Text>
                  </View>
                </View>

                <View style={styles.predictionBar}>
                  <View
                    style={[
                      styles.predictionFill,
                      {
                        width: `${item.progress}%` as any,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>
              </TouchableOpacity>

              {expandedId === item.id && (
                <PredictionChart color={color} values={item.values} />
              )}
            </View>
          );
        })}

        <View style={{ height: 80 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  scrollContent: {
    paddingBottom: 110,
  },

  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '900',
    color: THEME.dark,
    letterSpacing: -0.8,
  },

  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.dark,
    letterSpacing: -0.5,
    marginBottom: 16,
  },

  predictionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },

  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  predictionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },

  predictionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.dark,
    marginBottom: 4,
  },

  predictionSub: {
    fontSize: 13,
    color: '#8B95A1',
    fontWeight: '700',
  },

  percentBadge: {
    minWidth: 58,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  percentBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  predictionBar: {
    marginTop: 14,
    height: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    overflow: 'hidden',
  },

  predictionFill: {
    height: '100%',
    borderRadius: 999,
  },

  chartWrap: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 12,
    alignItems: 'center',
  },

  legendDivider: {
    height: 1,
    width: '100%',
    backgroundColor: Colors.border,
    marginTop: 6,
    marginBottom: 12,
  },

  chartLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
    paddingBottom: 14,
  },

  chartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  legendLine: {
    width: 22,
    height: 3,
    borderRadius: 999,
  },

  legendDashed: {
    width: 22,
    height: 0,
    borderTopWidth: 3,
    borderStyle: 'dashed',
  },

  chartLegendText: {
    fontSize: 12,
    color: '#8B95A1',
    fontWeight: '700',
  },
});
