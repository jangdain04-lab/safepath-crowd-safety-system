export type RiskLevel = 'relaxed' | 'warning' | 'danger';

export interface CrowdZone {
  id: string;
  name: string;
  density: number;
  riskLevel: RiskLevel;
  peopleCount: number;
  gridPos: { x: number; y: number };
  videoUrl?: string | null;
}

export interface Alert {
  id: string;
  zoneId: string;
  zoneName: string;
  riskLevel: 'warning' | 'danger';
  timestamp: Date;
  message: string;
  read: boolean;
  pinned?: boolean;
  progress: number;
}

export interface MissingChild {
  id: string;
  name: string;
  age: number;
  imageUrl: string;
  description: string;
  lastSeenLocation: string;
  lastSeenTime: Date;
  contactNumber: string;
}

export interface OrganizerAnnouncement {
  id: string;
  title: string;
  summary: string;
  content: string;
  timestamp: Date;
  read: boolean;
  pinned?: boolean;
}

export const mockZones: CrowdZone[] = [
  { id: 'z1', name: '백년관 비정길', density: 92, riskLevel: 'danger', peopleCount: 45, gridPos: { x: 29, y: 42 } },
  { id: 'z2', name: '자연과학대 앞', density: 62, riskLevel: 'warning', peopleCount: 23, gridPos: { x: 74, y: 42 } },
  { id: 'z3', name: '공대 흡연부스 옆', density: 28, riskLevel: 'relaxed', peopleCount: 19, gridPos: { x: 27, y: 72 } },
  { id: 'z4', name: '인경관 주차장 입구', density: 88, riskLevel: 'danger', peopleCount: 55, gridPos: { x: 82, y: 72 } },
  { id: 'z5', name: '공대-백년관 사이', density: 84, riskLevel: 'danger', peopleCount: 54, gridPos: { x: 53, y: 55 } },
  { id: 'z6', name: '백년관 잔디구장', density: 18, riskLevel: 'relaxed', peopleCount: 8, gridPos: { x: 50, y: 84 } },
];

export const mockAlerts: Alert[] = [
  {
    id: 'a1',
    zoneId: 'z1',
    zoneName: '백년관 비정길',
    riskLevel: 'danger',
    timestamp: new Date(Date.now() - 6 * 60 * 1000),
    message: '매우 높은 인구 밀도가 감지되었습니다. 우회 경로를 이용하세요.',
    read: false,
    pinned: true,
    progress: 86,
  },
  {
    id: 'a2',
    zoneId: 'z4',
    zoneName: '인경관 주차장 입구',
    riskLevel: 'danger',
    timestamp: new Date(Date.now() - 13 * 60 * 1000),
    message: '위험 수준의 혼잡도입니다. 대체 경로를 추천합니다.',
    read: false,
    progress: 84,
  },
  {
    id: 'a3',
    zoneId: 'z2',
    zoneName: '자연과학대 앞',
    riskLevel: 'warning',
    timestamp: new Date(Date.now() - 26 * 60 * 1000),
    message: '혼잡도가 증가하고 있습니다. 주의가 필요합니다.',
    read: true,
    progress: 66,
  },
];

export const mockMissingChildren: MissingChild[] = [
  {
    id: 'mc1',
    name: '송소희',
    age: 5,
    imageUrl: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=400&h=400&fit=crop',
    description: '흰색 셔츠, 베이지색 바지',
    lastSeenLocation: '백년관 버정길',
    lastSeenTime: new Date(Date.now() - 15 * 60000),
    contactNumber: '010-1234-5678',
  },
  {
    id: 'mc2',
    name: '박종식',
    age: 7,
    imageUrl: 'https://images.unsplash.com/photo-1625363051343-f8d65b8803ce?w=400&h=400&fit=crop',
    description: '검은색 모자, 회색 티셔츠',
    lastSeenLocation: '자연과학대 앞',
    lastSeenTime: new Date(Date.now() - 30 * 60000),
    contactNumber: '010-8765-4321',
  },
];

export const mockAnnouncements: OrganizerAnnouncement[] = [
  {
    id: '1',
    title: '백년관 인근 혼잡 예상',
    summary: '백년관 인근 촬영팀 도착으로 혼잡이 예상됩니다. 가능하면 우회해주세요.',
    content:
      '백년관 인근 촬영팀 도착으로 혼잡이 예상됩니다. 가능하면 우회해주세요.\n\n행사장 진입 동선이 일시적으로 좁아질 수 있으니, 백년관 비정길 대신 광장 외곽 통로를 이용해 주세요.',
    timestamp: new Date(Date.now() - 10 * 60000),
    read: false,
    pinned: true,
  },
  {
    id: '2',
    title: '우천 대비 공연장 이동 안내',
    summary: '오후 소나기 가능성으로 일부 야외 부스 운영 시간이 조정될 수 있습니다.',
    content:
      '오후 소나기 가능성이 있어 야외 부스 운영 시간이 일부 조정될 수 있습니다.\n\n안내 방송과 현장 스태프의 유도에 따라 이동해 주세요. 우산 사용 시 주변 관람객과 충분한 거리를 유지해 주세요.',
    timestamp: new Date(Date.now() - 34 * 60000),
    read: true,
  },
  {
    id: '3',
    title: '미아 보호소 운영 위치 안내',
    summary: '미아 보호소는 백년관 앞 종합안내소 오른편에서 운영됩니다.',
    content:
      '미아 보호소는 백년관 앞 종합안내소 오른편에서 운영됩니다.\n\n아이를 잃어버렸거나 보호 중인 아동을 발견한 경우, 즉시 가까운 운영요원에게 알려주세요.',
    timestamp: new Date(Date.now() - 58 * 60000),
    read: true,
  },
];

export function getRiskColor(level: RiskLevel): string {
  return { relaxed: '#5DBB88', warning: '#ECA12D', danger: '#E24743' }[level];
}

export function getRiskBg(level: RiskLevel): string {
  return { relaxed: '#DDF4E9', warning: '#FFF3CE', danger: '#F8D6D9' }[level];
}

export function getRiskText(level: RiskLevel): string {
  return { relaxed: '여유', warning: '주의', danger: '위험' }[level];
}

export function getTimeAgo(ts: Date): string {
  const minutes = Math.floor((Date.now() - ts.getTime()) / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function simulateDataUpdate(zones: CrowdZone[]): CrowdZone[] {
  return zones.map((zone) => {
    const change = Math.floor(Math.random() * 7) - 3;
    const density = Math.max(0, Math.min(100, zone.density + change));
    const riskLevel: RiskLevel = density >= 75 ? 'danger' : density >= 45 ? 'warning' : 'relaxed';
    return { ...zone, density, riskLevel };
  });
}
