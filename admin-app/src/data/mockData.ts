// Mock data for crowd density simulation

export interface CrowdZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  density: number; // 0-100
  riskLevel: 'safe' | 'moderate' | 'warning' | 'danger';
  peopleCount: number;
}

export interface Alert {
  id: string;
  zoneId: string;
  zoneName: string;
  riskLevel: 'warning' | 'danger';
  timestamp: Date;
  message: string;
  read: boolean;
}

export interface Route {
  id: string;
  name: string;
  distance: number; // meters
  estimatedTime: number; // minutes
  crowdLevel: 'low' | 'medium' | 'high';
  waypoints: { lat: number; lng: number }[];
}

export interface Sector {
  id: string;
  name: string;
  density: number;
  status: 'safe' | 'warning' | 'critical';
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  sector: string;
  status: 'active' | 'break' | 'offline';
  phone: string;
}

export interface IncidentLog {
  id: string;
  timestamp: Date;
  sector: string;
  type: 'injury' | 'congestion' | 'evacuation' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  resolved: boolean;
}

// Initial mock zones
export const mockZones: CrowdZone[] = [
  { id: 'z1', name: '강남역 2번 출구', lat: 37.4979, lng: 127.0276, density: 85, riskLevel: 'danger', peopleCount: 1240 },
  { id: 'z2', name: '강남역 지하상가', lat: 37.4975, lng: 127.0280, density: 72, riskLevel: 'warning', peopleCount: 890 },
  { id: 'z3', name: '신논현역 광장', lat: 37.5045, lng: 127.0247, density: 45, riskLevel: 'moderate', peopleCount: 520 },
  { id: 'z4', name: '역삼역 1번 출구', lat: 37.5001, lng: 127.0364, density: 28, riskLevel: 'safe', peopleCount: 310 },
  { id: 'z5', name: '서초역 교차로', lat: 37.4837, lng: 127.0139, density: 58, riskLevel: 'moderate', peopleCount: 645 },
];

export const mockAlerts: Alert[] = [
  { id: 'a1', zoneId: 'z1', zoneName: '강남역 2번 출구', riskLevel: 'danger', timestamp: new Date(Date.now() - 5 * 60 * 1000), message: '위험 수준의 군중 밀집도가 감지되었습니다. 즉시 대피 경로를 확인하세요.', read: false },
  { id: 'a2', zoneId: 'z2', zoneName: '강남역 지하상가', riskLevel: 'warning', timestamp: new Date(Date.now() - 12 * 60 * 1000), message: '혼잡도가 경고 수준에 도달했습니다. 주의가 필요합니다.', read: false },
  { id: 'a3', zoneId: 'z3', zoneName: '신논현역 광장', riskLevel: 'warning', timestamp: new Date(Date.now() - 28 * 60 * 1000), message: '군중 이동 속도가 저하되고 있습니다.', read: true },
];

export const mockRoutes: Route[] = [
  { id: 'r1', name: '서초대로 우회 경로', distance: 850, estimatedTime: 11, crowdLevel: 'low', waypoints: [{ lat: 37.4979, lng: 127.0276 }, { lat: 37.4965, lng: 127.0290 }, { lat: 37.4950, lng: 127.0310 }] },
  { id: 'r2', name: '강남대로 남측 경로', distance: 1200, estimatedTime: 15, crowdLevel: 'medium', waypoints: [{ lat: 37.4979, lng: 127.0276 }, { lat: 37.4970, lng: 127.0260 }, { lat: 37.4955, lng: 127.0245 }] },
  { id: 'r3', name: '지하철 환승 경로', distance: 400, estimatedTime: 8, crowdLevel: 'low', waypoints: [{ lat: 37.4979, lng: 127.0276 }, { lat: 37.4980, lng: 127.0268 }] },
];

export const mockSectors: Sector[] = [
  { id: 'A', name: 'Sector A', density: 92, status: 'critical' },
  { id: 'B', name: 'Sector B', density: 45, status: 'safe' },
  { id: 'C', name: 'Sector C', density: 75, status: 'warning' },
  { id: 'D', name: 'Sector D', density: 38, status: 'safe' },
  { id: 'E', name: 'Sector E', density: 68, status: 'warning' },
];

export const mockStaff: Staff[] = [
  { id: 's1', name: '김민수', role: '안전요원', sector: 'A', status: 'active', phone: '010-1234-5678' },
  { id: 's2', name: '이지영', role: '의료요원', sector: 'B', status: 'active', phone: '010-2345-6789' },
  { id: 's3', name: '박철호', role: '안전요원', sector: 'C', status: 'break', phone: '010-3456-7890' },
  { id: 's4', name: '최수진', role: '경호요원', sector: 'A', status: 'active', phone: '010-4567-8901' },
  { id: 's5', name: '정대한', role: '안전요원', sector: 'D', status: 'active', phone: '010-5678-9012' },
  { id: 's6', name: '한소희', role: '의료요원', sector: 'E', status: 'offline', phone: '010-6789-0123' },
];

export const mockIncidentLogs: IncidentLog[] = [
  { id: 'l1', timestamp: new Date(Date.now() - 30 * 60 * 1000), sector: 'Sector A', type: 'congestion', severity: 'high', description: '입구 부근 극심한 혼잡 발생, 진입 통제 조치 완료', resolved: true },
  { id: 'l2', timestamp: new Date(Date.now() - 60 * 60 * 1000), sector: 'Sector C', type: 'injury', severity: 'medium', description: '관람객 1명 경미한 부상, 의료팀 처치 완료', resolved: true },
  { id: 'l3', timestamp: new Date(Date.now() - 15 * 60 * 1000), sector: 'Sector E', type: 'congestion', severity: 'medium', description: '화장실 앞 혼잡, 우회 안내 중', resolved: false },
];
