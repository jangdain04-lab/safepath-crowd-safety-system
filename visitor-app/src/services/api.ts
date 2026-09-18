import type { Alert, CrowdZone, MissingChild, OrganizerAnnouncement } from '../data/mockData';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const DEFAULT_MAP_PATH = '/static/map.html';
const HEATMAP_MAP_URL = process.env.EXPO_PUBLIC_HEATMAP_MAP_URL ?? `${API_BASE_URL}/map`;
const HEATMAP_COUNT_URL = process.env.EXPO_PUBLIC_HEATMAP_COUNT_URL ?? `${API_BASE_URL}/count`;
const VISITOR_DEVICE_ID = 'visitor-app';
const INVITE_OWNER_EMAIL_KEY = 'safepath:visitor:settingsOwnerEmail';
export type NotificationRiskLevel = 'warning' | 'danger';

export function resolveBackendUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl) return `${API_BASE_URL}${DEFAULT_MAP_PATH}`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/')) return `${API_BASE_URL}${pathOrUrl}`;
  return pathOrUrl;
}

export interface FestivalContact {
  label: string;
  phone: string;
}

export interface FestivalInfo {
  id: number;
  title: string;
  date: string;
  time: string;
  place: string;
  description: string[];
  contacts: FestivalContact[];
  cautions: string[];
}

export interface PublicDeviceSettings {
  deviceId: string;
  pushToken?: string | null;
  platform?: string | null;
  minRiskLevel: NotificationRiskLevel;
}

export interface InviteVerifyResponse {
  valid: boolean;
  role?: string | null;
  settings_owner_email?: string | null;
  message: string;
}

type HeatmapCountItem = {
  count?: number;
  risk?: string;
  risk_en?: string;
  density?: number;
};

type HeatmapCountResponse = {
  data?: Record<string, HeatmapCountItem>;
};

function normalizePublicRiskLevel(level: string | null | undefined): CrowdZone['riskLevel'] {
  if (level === 'danger' || level === 'DANGER' || level === '위험') return 'danger';
  if (level === 'warning' || level === 'caution' || level === 'CAUTION' || level === '주의') return 'warning';
  return 'relaxed';
}

async function fetchHeatmapCounts(): Promise<Record<string, HeatmapCountItem>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${HEATMAP_COUNT_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'ngrok-skip-browser-warning': 'true',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) return {};

    const json = await response.json() as HeatmapCountResponse;
    return json.data ?? {};
  } catch (error) {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

async function getVisitorOwnerEmailQuery(prefix: '?' | '&' = '?'): Promise<string> {
  const ownerEmail = await AsyncStorage.getItem(INVITE_OWNER_EMAIL_KEY);
  return ownerEmail ? `${prefix}user_email=${encodeURIComponent(ownerEmail)}` : '';
}

export async function verifyInviteCode(code: string): Promise<InviteVerifyResponse> {
  const response = await fetch(`${API_BASE_URL}/public/invites/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error('초대코드를 확인하지 못했습니다.');
  }

  return response.json();
}

export async function fetchPublicLiveZones(): Promise<CrowdZone[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  const ownerQuery = await getVisitorOwnerEmailQuery('&');

  try {
    const [response, heatmapCounts] = await Promise.all([
      fetch(`${API_BASE_URL}/public/zones/live?t=${Date.now()}${ownerQuery}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }),
      fetchHeatmapCounts(),
    ]);

    if (!response.ok) {
      throw new Error('실시간 혼잡도 정보를 불러오지 못했습니다.');
    }

    const zones = await response.json() as CrowdZone[];

    return zones.map((zone) => {
      const heatmapItem = heatmapCounts[`cam${zone.id}`];
      const riskLevel = normalizePublicRiskLevel(heatmapItem?.risk_en ?? heatmapItem?.risk ?? zone.riskLevel);

      return {
        ...zone,
        peopleCount: heatmapItem?.count ?? zone.peopleCount,
        density: heatmapItem?.density ?? zone.density,
        riskLevel,
        videoUrl: zone.videoUrl ?? null,
      };
    });
  } finally {
    clearTimeout(timeout);
  }

  const response = await fetch(`${API_BASE_URL}/public/zones/live?t=${Date.now()}${ownerQuery}`, {
    cache: 'no-store',
    signal: controller.signal,
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error('실시간 혼잡도 정보를 불러오지 못했습니다.');
  }

  return response.json();
}

export async function fetchPublicAnnouncements(): Promise<OrganizerAnnouncement[]> {
  const response = await fetch(`${API_BASE_URL}/public/announcements?t=${Date.now()}`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });

  if (!response.ok) {
    throw new Error('공지사항을 불러오지 못했습니다.');
  }

  const announcements = await response.json();

  return announcements.map((item: Omit<OrganizerAnnouncement, 'timestamp'> & { timestamp: string }) => ({
    ...item,
    timestamp: new Date(item.timestamp),
  }));
}

export async function fetchPublicAlerts(): Promise<Alert[]> {
  const response = await fetch(`${API_BASE_URL}/public/alerts?device_id=${VISITOR_DEVICE_ID}&t=${Date.now()}`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });

  if (!response.ok) {
    throw new Error('위험 알림을 불러오지 못했습니다.');
  }

  const alerts = await response.json();

  return alerts.map((item: Omit<Alert, 'timestamp'> & { timestamp: string }) => ({
    ...item,
    timestamp: new Date(item.timestamp),
  }));
}

async function updatePublicAlertState(
  alertId: string,
  updates: { read?: boolean; pinned?: boolean; deleted?: boolean },
) {
  const endpoint = updates.deleted
    ? `${API_BASE_URL}/public/alerts/${alertId}`
    : updates.pinned !== undefined
      ? `${API_BASE_URL}/public/alerts/${alertId}/pin`
      : `${API_BASE_URL}/public/alerts/${alertId}/read`;

  const response = await fetch(endpoint, {
    method: updates.deleted ? 'DELETE' : 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device_id: VISITOR_DEVICE_ID,
      ...updates,
    }),
  });

  if (!response.ok) {
    throw new Error('알림 상태를 저장하지 못했습니다.');
  }
}

export function markPublicAlertRead(alertId: string) {
  return updatePublicAlertState(alertId, { read: true });
}

export function setPublicAlertPinned(alertId: string, pinned: boolean) {
  return updatePublicAlertState(alertId, { pinned });
}

export function deletePublicAlert(alertId: string) {
  return updatePublicAlertState(alertId, { deleted: true });
}

export interface VisitorReportPayload {
  type: 'current' | 'place' | 'organizer';
  zoneId?: string;
  zoneName?: string;
  memo?: string;
}

export async function createVisitorReport(payload: VisitorReportPayload) {
  const ownerQuery = await getVisitorOwnerEmailQuery('?');
  const response = await fetch(`${API_BASE_URL}/public/reports${ownerQuery}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      deviceId: VISITOR_DEVICE_ID,
    }),
  });

  if (!response.ok) {
    throw new Error('신고를 저장하지 못했습니다.');
  }

  return response.json();
}

export async function fetchPublicMissingChildren(): Promise<MissingChild[]> {
  const response = await fetch(`${API_BASE_URL}/public/missing-children`);

  if (!response.ok) {
    throw new Error('미아 정보를 불러오지 못했습니다.');
  }

  const children = await response.json();

  return children.map((item: Omit<MissingChild, 'lastSeenTime'> & { lastSeenTime: string }) => ({
    ...item,
    lastSeenTime: new Date(item.lastSeenTime),
  }));
}

export async function fetchPublicMissingChild(id: string): Promise<MissingChild> {
  const response = await fetch(`${API_BASE_URL}/public/missing-children/${id}`);

  if (!response.ok) {
    throw new Error('미아 상세 정보를 불러오지 못했습니다.');
  }

  const child = await response.json();

  return {
    ...child,
    lastSeenTime: new Date(child.lastSeenTime),
  };
}

export async function fetchPublicFestivalInfo(): Promise<FestivalInfo> {
  const response = await fetch(`${API_BASE_URL}/public/festival-info`);

  if (!response.ok) {
    throw new Error('축제 정보를 불러오지 못했습니다.');
  }

  return response.json();
}

export async function fetchPublicMapUrl(): Promise<string> {
  return HEATMAP_MAP_URL;
}

export async function registerPublicDevicePushToken(
  minRiskLevel: NotificationRiskLevel = 'warning',
  pushToken?: string,
): Promise<PublicDeviceSettings> {
  const response = await fetch(`${API_BASE_URL}/public/devices/push-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deviceId: VISITOR_DEVICE_ID,
      pushToken,
      platform: 'expo',
      minRiskLevel,
    }),
  });

  if (!response.ok) {
    throw new Error('기기 알림 설정을 등록하지 못했습니다.');
  }

  return response.json();
}

export async function fetchPublicNotificationSettings(): Promise<PublicDeviceSettings | null> {
  const response = await fetch(`${API_BASE_URL}/public/devices/${VISITOR_DEVICE_ID}/notification-settings`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('알림 설정을 불러오지 못했습니다.');
  }

  return response.json();
}

export async function updatePublicNotificationSettings(
  minRiskLevel: NotificationRiskLevel,
  pushToken?: string,
): Promise<PublicDeviceSettings> {
  const response = await fetch(`${API_BASE_URL}/public/devices/${VISITOR_DEVICE_ID}/notification-settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pushToken,
      minRiskLevel,
    }),
  });

  if (!response.ok) {
    throw new Error('알림 설정을 저장하지 못했습니다.');
  }

  return response.json();
}
