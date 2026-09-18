import { getStoredAuthUser } from './authStorage';

export type FrontendRiskLevel = 'safe' | 'warning' | 'danger';

export type ZoneLive = {
  zone_id: string;
  zone_name: string;
  name: string;
  latitude: number;
  longitude: number;
  description?: string | null;
  people_count?: number | null;
  count: number;
  density?: number | null;
  speed?: number | null;
  slope?: number | null;
  risk_level: FrontendRiskLevel;
  level: FrontendRiskLevel;
  status: FrontendRiskLevel;
  updated_at?: string | null;
};

export type SendAlertPayload = {
  target_mode: 'zone' | 'all';
  target_zones: string[];
  message_type: 'evacuate' | 'warning' | 'custom';
  message: string;
};

export type EmergencyAlertHistory = SendAlertPayload & {
  id: number;
  created_at: string;
};

export type EventSettings = {
  eventRange: string;
  searchPlace: string;
  placeDisplayName: string;
  mapUrl?: string;
  cctvLocations: string[];
  placeNames: string[];
  roadAngles: string[];
  roadAreas: string[];
};

export type StaffMember = {
  id: number;
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  zone_id?: string | null;
  sector?: string | null;
};

export type StaffCreatePayload = {
  name: string;
  role: string;
  phone?: string;
  email?: string;
  zone_id?: string;
};

export type Notice = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
};

export type FestivalContact = {
  label: string;
  phone: string;
};

export type FestivalInfo = {
  id: number;
  title: string;
  date: string;
  time: string;
  place: string;
  description: string[];
  contacts: FestivalContact[];
  cautions: string[];
};

export type FestivalInfoPayload = Omit<FestivalInfo, 'id'>;

export type MissingChild = {
  id: string;
  name: string;
  age: number;
  imageUrl: string;
  description: string;
  lastSeenLocation: string;
  lastSeenTime: string;
  contactNumber: string;
  status: string;
};

export type MissingChildPayload = Omit<MissingChild, 'id'>;

export type RiskPrediction = {
  id: string;
  zone_id: string;
  sector: string;
  time: string;
  level: 'critical' | 'warning' | 'safe';
  progress: number;
  icon: string;
  values: number[];
};

export type RelocationRecommendation = {
  from_zone_id: string;
  to_zone_id: string;
  move_staff_count: number;
  distance_m: number;
  cost: number;
};

export type RelocationResponse = {
  total_supply: number;
  total_demand: number;
  flow_amount: number;
  shortage: number;
  recommendations: RelocationRecommendation[];
  message: string;
};

export type RelocationApplyResponse = {
  recommendation_id: number;
  from_zone_id: string;
  to_zone_id: string;
  requested_staff_count: number;
  moved_staff_count: number;
  moved_staff_ids: number[];
  status: string;
  message: string;
};

export type IncidentLog = {
  id: string;
  zone_id?: string;
  time: string;
  date: string;
  sector: string;
  gate: string;
  level: 'critical';
  density: number;
  duration: string;
  description: string;
  image: string;
  videoUrl?: string | null;
  stats: {
    time: string;
    density: number;
    speedChange: number;
  }[];
};

type NoticeResponse = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at?: string | null;
};

export type AuthUser = {
  id: number;
  email: string;
  name?: string | null;
  role: string;
  provider: string;
  onboarding_completed: number;
  settings_owner_email?: string | null;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

export type OAuthProvider = 'kakao' | 'naver' | 'google';

export type OAuthConfig = {
  provider: OAuthProvider;
  client_id: string;
  authorization_endpoint: string;
  scopes: string[];
};

export type InviteVerifyResponse = {
  valid: boolean;
  role?: string | null;
  message: string;
};

export type InviteSettings = {
  code: string;
  role: string;
  is_active: number;
};

export type PlaceSearchResult = {
  title: string;
  address: string;
  roadAddress: string;
  category: string;
  latitude: number;
  longitude: number;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const DEFAULT_MAP_PATH = '/static/map.html';
const HEATMAP_MAP_URL = process.env.EXPO_PUBLIC_HEATMAP_MAP_URL ?? `${API_BASE_URL}/map`;
const HEATMAP_COUNT_URL = process.env.EXPO_PUBLIC_HEATMAP_COUNT_URL ?? `${API_BASE_URL}/count`;
const REQUEST_TIMEOUT_MS = 2500;

export function getOAuthRedirectUri(provider: OAuthProvider): string {
  return `${API_BASE_URL}/auth/oauth/${provider}/redirect`;
}

export function resolveBackendUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl) return `${API_BASE_URL}${DEFAULT_MAP_PATH}`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/')) return `${API_BASE_URL}${pathOrUrl}`;
  return pathOrUrl;
}

function normalizeRiskLevel(level: string | null | undefined): FrontendRiskLevel {
  if (level === 'danger' || level === 'DANGER' || level === '위험') return 'danger';
  if (level === 'warning' || level === 'caution' || level === 'CAUTION' || level === '주의') return 'warning';
  return 'safe';
}

type HeatmapCountItem = {
  count?: number;
  risk?: string;
  risk_en?: string;
  density?: number;
  speed?: number;
  slope?: number;
};

type HeatmapCountResponse = {
  data?: Record<string, HeatmapCountItem>;
};

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...options?.headers,
      },
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`API connection failed: ${path}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = '';

    try {
      const errorBody = await response.json();
      detail = typeof errorBody.detail === 'string'
        ? errorBody.detail
        : JSON.stringify(errorBody);
    } catch (error) {
      detail = await response.text();
    }

    throw new Error(`API ${response.status}: ${detail || path}`);
  }

  return response.json();
}

async function getUserEmailQuery(prefix: '?' | '&' = '?'): Promise<string> {
  const user = await getStoredAuthUser();
  const email = (user?.settings_owner_email || user?.email)?.trim();

  return email ? `${prefix}user_email=${encodeURIComponent(email)}` : '';
}

export async function fetchZonesLive(): Promise<ZoneLive[]> {
  const userEmail = await getUserEmailQuery('&');
  const [zones, heatmapCounts] = await Promise.all([
    request<ZoneLive[]>(`/zones/live?t=${Date.now()}${userEmail}`),
    fetchHeatmapCounts(),
  ]);

  return zones.map((zone) => {
    const zoneId = String(zone.zone_id ?? '');
    const heatmapItem = heatmapCounts[`cam${zoneId}`];
    const level = normalizeRiskLevel(
      heatmapItem?.risk_en
      ?? heatmapItem?.risk
      ?? zone.risk_level
      ?? zone.status
      ?? zone.level,
    );
    const count = heatmapItem?.count ?? zone.count ?? zone.people_count ?? 0;

    return {
      ...zone,
      name: zone.name ?? zone.zone_name,
      count,
      people_count: count,
      density: heatmapItem?.density ?? zone.density,
      speed: heatmapItem?.speed ?? zone.speed,
      slope: heatmapItem?.slope ?? zone.slope,
      risk_level: level,
      level,
      status: level,
    };
  });
}

export async function loginWithEmail(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function signupWithEmail(
  email: string,
  password: string,
  inviteCode?: string,
): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      invite_code: inviteCode || undefined,
    }),
  });
}

export async function loginWithOAuth(provider: string): Promise<AuthResponse> {
  return request<AuthResponse>(`/auth/oauth/${provider}`, {
    method: 'POST',
    body: JSON.stringify({
      provider_user_id: `dev-${provider}`,
      email: `${provider}@safepath.local`,
      name: provider,
    }),
  });
}

export async function fetchOAuthConfig(provider: OAuthProvider): Promise<OAuthConfig> {
  return request<OAuthConfig>(`/auth/oauth/${provider}/config?t=${Date.now()}`);
}

export async function completeOAuthLogin(
  provider: OAuthProvider,
  payload: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  },
): Promise<AuthResponse> {
  return request<AuthResponse>(`/auth/oauth/${provider}/callback`, {
    method: 'POST',
    body: JSON.stringify({
      code: payload.code,
      redirect_uri: payload.redirectUri,
      code_verifier: payload.codeVerifier,
    }),
  });
}

export async function verifyInviteCode(code: string): Promise<InviteVerifyResponse> {
  return request<InviteVerifyResponse>('/invites/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function joinWithInviteCode(code: string, name: string): Promise<AuthResponse> {
  return request<AuthResponse>('/invites/join', {
    method: 'POST',
    body: JSON.stringify({ code, name }),
  });
}

export async function fetchStaffInviteSettings(): Promise<InviteSettings> {
  const userEmail = await getUserEmailQuery('&');
  return request<InviteSettings>(`/invites/staff?t=${Date.now()}${userEmail}`);
}

export async function saveStaffInviteSettings(code: string): Promise<InviteSettings> {
  const userEmail = await getUserEmailQuery();

  return request<InviteSettings>(`/invites/staff${userEmail}`, {
    method: 'PUT',
    body: JSON.stringify({
      code,
      role: 'staff_viewer',
      is_active: 1,
    }),
  });
}

export async function fetchVisitorInviteSettings(): Promise<InviteSettings> {
  const userEmail = await getUserEmailQuery('&');
  return request<InviteSettings>(`/invites/visitor?t=${Date.now()}${userEmail}`);
}

export async function saveVisitorInviteSettings(code: string): Promise<InviteSettings> {
  const userEmail = await getUserEmailQuery();

  return request<InviteSettings>(`/invites/visitor${userEmail}`, {
    method: 'PUT',
    body: JSON.stringify({
      code,
      role: 'visitor',
      is_active: 1,
    }),
  });
}

export async function sendEmergencyAlert(payload: SendAlertPayload) {
  return request<EmergencyAlertHistory>('/alerts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchEmergencyAlertHistory(): Promise<EmergencyAlertHistory[]> {
  return request<EmergencyAlertHistory[]>(`/alerts/history?t=${Date.now()}`);
}

export async function fetchEventSettings(): Promise<EventSettings> {
  const userEmail = await getUserEmailQuery('&');
  return request<EventSettings>(`/events/current?t=${Date.now()}${userEmail}`);
}

export async function fetchMapUrl(): Promise<string> {
  const userEmail = await getUserEmailQuery('&');
  const settings = await request<EventSettings>(`/map-config?t=${Date.now()}${userEmail}`);
  return resolveBackendUrl(settings.mapUrl);
}

export function fetchHeatmapMapUrl(): Promise<string> {
  return Promise.resolve(HEATMAP_MAP_URL);
}

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  return request<PlaceSearchResult[]>(`/places/search?query=${encodeURIComponent(query)}`);
}

export async function saveEventSettings(settings: EventSettings): Promise<EventSettings> {
  const userEmail = await getUserEmailQuery();

  return request<EventSettings>(`/events/current/settings${userEmail}`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function saveOnboardingSettings(
  settings: EventSettings,
  userEmail?: string | null,
): Promise<EventSettings> {
  const suffix = userEmail ? `?user_email=${encodeURIComponent(userEmail)}` : '';

  return request<EventSettings>(`/events/current/onboarding${suffix}`, {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export async function fetchStaff(): Promise<StaffMember[]> {
  const userEmail = await getUserEmailQuery();
  return request<StaffMember[]>(`/staff${userEmail}`);
}

export async function createStaff(payload: StaffCreatePayload): Promise<StaffMember> {
  const userEmail = await getUserEmailQuery();
  return request<StaffMember>(`/staff${userEmail}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function assignStaffToZone(staffId: number, zoneId: string) {
  const userEmail = await getUserEmailQuery();
  return request(`/sectors/${encodeURIComponent(zoneId)}/staff${userEmail}`, {
    method: 'POST',
    body: JSON.stringify({
      staff_id: staffId,
      zone_id: zoneId,
    }),
  });
}

export async function unassignStaffFromZone(staffId: number, zoneId: string) {
  const userEmail = await getUserEmailQuery();
  return request(`/sectors/${encodeURIComponent(zoneId)}/staff/${staffId}${userEmail}`, {
    method: 'DELETE',
  });
}

export async function deleteStaff(staffId: number) {
  const userEmail = await getUserEmailQuery();
  return request(`/staff/${staffId}${userEmail}`, {
    method: 'DELETE',
  });
}

function formatNoticeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function mapNotice(notice: NoticeResponse): Notice {
  return {
    id: notice.id,
    title: notice.title,
    content: notice.content,
    createdAt: formatNoticeDate(notice.created_at),
  };
}

export async function fetchNotices(): Promise<Notice[]> {
  const notices = await request<NoticeResponse[]>(`/notices?t=${Date.now()}`);

  return notices.map(mapNotice);
}

export async function createNotice(payload: {
  title: string;
  content: string;
}): Promise<Notice> {
  const notice = await request<NoticeResponse>('/notices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return mapNotice(notice);
}

export async function updateNotice(
  noticeId: number,
  payload: {
    title: string;
    content: string;
  },
): Promise<Notice> {
  const notice = await request<NoticeResponse>(`/notices/${noticeId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return mapNotice(notice);
}

export async function deleteNotice(noticeId: number) {
  return request(`/notices/${noticeId}`, {
    method: 'DELETE',
  });
}

export async function fetchFestivalInfo(): Promise<FestivalInfo> {
  return request<FestivalInfo>(`/festival-info?t=${Date.now()}`);
}

export async function saveFestivalInfo(payload: FestivalInfoPayload): Promise<FestivalInfo> {
  return request<FestivalInfo>('/festival-info', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function createMissingChild(payload: MissingChildPayload): Promise<MissingChild> {
  return request<MissingChild>('/missing-children', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadMissingChildImage(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<{ imageUrl: string }> {
  const body = new FormData();
  body.append('file', file as unknown as Blob);

  const response = await fetch(`${API_BASE_URL}/uploads/missing-child-image`, {
    method: 'POST',
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchRiskPredictions(): Promise<RiskPrediction[]> {
  const userEmail = await getUserEmailQuery('&');
  return request<RiskPrediction[]>(`/predictions?t=${Date.now()}${userEmail}`);
}

export async function fetchRelocationRecommendations(): Promise<RelocationResponse> {
  const userEmail = await getUserEmailQuery('&');
  return request<RelocationResponse>(`/relocation/recommendations?t=${Date.now()}${userEmail}`);
}

export async function applyRelocationRecommendation(
  recommendationId: number,
): Promise<RelocationApplyResponse> {
  return request<RelocationApplyResponse>(`/relocations/${recommendationId}/apply`, {
    method: 'POST',
  });
}

export async function fetchIncidents(params?: {
  date?: string;
  q?: string;
}): Promise<IncidentLog[]> {
  const query = new URLSearchParams();
  const userEmail = await getUserEmailQuery('&');

  if (params?.date) {
    query.set('date', params.date);
  }

  if (params?.q) {
    query.set('q', params.q);
  }

  query.set('t', String(Date.now()));

  return request<IncidentLog[]>(`/incidents?${query.toString()}${userEmail}`);
}
