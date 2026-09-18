from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional


class AnalysisCreate(BaseModel):
    zone_id: str
    people_count: int
    density: float
    speed: float
    slope: Optional[float] = None
    
    cv_status: Optional[str] = None
    risk_score: Optional[float] = None
    m_per_person: Optional[float] = None


class CrowdDataInput(BaseModel):
    zone_id: str
    count: float
    timestamp: Optional[float] = None


class AnalysisBulkCreate(BaseModel):
    items: List[AnalysisCreate]


class CrowdDataBulkInput(BaseModel):
    items: List[CrowdDataInput]


class AnalysisResponse(BaseModel):
    id: int
    zone_id: str
    people_count: int
    density: float
    speed: float
    slope: Optional[float]
    risk_level: str

    cv_status: Optional[str]
    risk_score: Optional[float]
    m_per_person: Optional[float]
    
    created_at: datetime

    class Config:
        from_attributes = True

class AlertResponse(BaseModel):
    id: int
    zone_id: str
    risk_level: str
    message: str
    is_read: int
    created_at: datetime

    class Config:
        from_attributes = True

class ZoneCreate(BaseModel):
    zone_id: str
    zone_name: str
    latitude: float
    longitude: float
    grid_x: Optional[float] = None
    grid_y: Optional[float] = None
    description: Optional[str] = None


class ZoneMapResponse(BaseModel):
    zone_id: str
    zone_name: str
    latitude: float
    longitude: float
    grid_x: Optional[float] = None
    grid_y: Optional[float] = None
    description: Optional[str] = None

    people_count: Optional[int] = None
    density: Optional[float] = None
    speed: Optional[float] = None
    slope: Optional[float] = None
    risk_level: Optional[str] = None
    updated_at: Optional[datetime] = None


class ZoneResponse(BaseModel):
    zone_id: str
    zone_name: str
    latitude: float
    longitude: float
    grid_x: Optional[float] = None
    grid_y: Optional[float] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True


class PublicGridPosition(BaseModel):
    x: float
    y: float


class PublicZoneLiveResponse(BaseModel):
    id: str
    name: str
    density: float
    riskLevel: str
    peopleCount: int
    gridPos: PublicGridPosition
    videoUrl: Optional[str] = None


class AuthSignupRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    invite_code: Optional[str] = None


class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthOAuthRequest(BaseModel):
    provider_user_id: str
    email: Optional[str] = None
    name: Optional[str] = None


class AuthOAuthConfigResponse(BaseModel):
    provider: str
    client_id: str
    authorization_endpoint: str
    scopes: List[str] = Field(default_factory=list)


class AuthOAuthCallbackRequest(BaseModel):
    code: str
    redirect_uri: str
    code_verifier: Optional[str] = None
    state: Optional[str] = None


class AuthUserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    role: str
    provider: str
    onboarding_completed: int
    settings_owner_email: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUserResponse


class InviteVerifyRequest(BaseModel):
    code: str


class InviteVerifyResponse(BaseModel):
    valid: bool
    role: Optional[str] = None
    settings_owner_email: Optional[str] = None
    message: str


class InviteSettingsResponse(BaseModel):
    code: str
    role: str
    is_active: int


class InviteSettingsUpdate(BaseModel):
    code: str
    role: str = "staff_viewer"
    is_active: int = 1


class InviteJoinRequest(BaseModel):
    code: str
    name: str


class AlertCreate(BaseModel):
    target_mode: str
    target_zones: List[str] = []
    message_type: str
    message: str


class EmergencyAlertResponse(BaseModel):
    id: int
    target_mode: str
    target_zones: List[str]
    message_type: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class PublicAlertResponse(BaseModel):
    id: str
    zoneId: str
    zoneName: str
    riskLevel: str
    timestamp: datetime
    message: str
    read: bool
    pinned: bool = False
    progress: int


class VisitorAlertStateUpdate(BaseModel):
    device_id: str = "visitor-app"
    read: Optional[bool] = None
    pinned: Optional[bool] = None
    deleted: Optional[bool] = None


class VisitorReportCreate(BaseModel):
    type: str
    zoneId: Optional[str] = None
    zoneName: Optional[str] = None
    memo: Optional[str] = None
    deviceId: Optional[str] = None


class VisitorReportResponse(BaseModel):
    id: int
    type: str
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    memo: Optional[str] = None
    device_id: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class VisitorReportStatusUpdate(BaseModel):
    status: str


class PublicMissingChildResponse(BaseModel):
    id: str
    name: str
    age: int
    imageUrl: str
    description: str
    lastSeenLocation: str
    lastSeenTime: datetime
    contactNumber: str
    status: str


class MissingChildCreate(BaseModel):
    name: str
    age: int
    imageUrl: str
    description: str
    lastSeenLocation: str
    lastSeenTime: datetime
    contactNumber: str
    status: str = "searching"


class FestivalContact(BaseModel):
    label: str
    phone: str


class FestivalInfoBase(BaseModel):
    title: str
    date: str
    time: str
    place: str
    description: List[str] = Field(default_factory=list)
    contacts: List[FestivalContact] = Field(default_factory=list)
    cautions: List[str] = Field(default_factory=list)


class FestivalInfoCreate(FestivalInfoBase):
    pass


class FestivalInfoResponse(FestivalInfoBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NoticeCreate(BaseModel):
    title: str
    content: str


class NoticeUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class NoticeResponse(BaseModel):
    id: int
    title: str
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PublicAnnouncementResponse(BaseModel):
    id: str
    title: str
    summary: str
    content: str
    timestamp: datetime
    read: bool = False
    pinned: bool = False


class ZoneLiveResponse(BaseModel):
    zone_id: str
    zone_name: str
    name: str
    latitude: float
    longitude: float
    description: Optional[str] = None

    people_count: Optional[int] = None
    count: int
    density: Optional[float] = None
    speed: Optional[float] = None
    slope: Optional[float] = None
    risk_level: str
    level: str
    status: str
    updated_at: Optional[datetime] = None

class ZoneHeatmapResponse(BaseModel):
    zone_id: str
    zone_name: str
    latitude: float
    longitude: float

    risk_level: str
    risk_score: float

    people_count: Optional[int] = None
    density: Optional[float] = None
    speed: Optional[float] = None
    cv_status: Optional[str] = None
    m_per_person: Optional[float] = None
    updated_at: Optional[datetime] = None


class ZoneHistoryResponse(BaseModel):
    id: int
    zone_id: str
    people_count: int
    density: float
    speed: float
    slope: Optional[float]
    risk_level: str
    cv_status: Optional[str]
    risk_score: Optional[float]
    m_per_person: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True


class RiskPredictionResponse(BaseModel):
    id: str
    zone_id: str
    sector: str
    time: str
    level: str
    progress: int
    icon: str
    values: List[int]


class IncidentStatResponse(BaseModel):
    time: str
    density: int
    speedChange: int


class IncidentResponse(BaseModel):
    id: str
    time: str
    date: str
    sector: str
    gate: str
    level: str
    density: int
    duration: str
    description: str
    image: str
    videoUrl: Optional[str] = None
    stats: List[IncidentStatResponse]


class IncidentVideoResponse(BaseModel):
    incident_id: int
    video_url: Optional[str] = None


class StaffingCreate(BaseModel):
    zone_id: str
    current_staff: int


class StaffingResponse(BaseModel):
    zone_id: str
    current_staff: int

    class Config:
        from_attributes = True


class StaffCreate(BaseModel):
    name: str
    role: str
    phone: Optional[str] = None
    email: Optional[str] = None
    zone_id: Optional[str] = None


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    zone_id: Optional[str] = None


class StaffResponse(BaseModel):
    id: int
    name: str
    role: str
    phone: Optional[str] = None
    email: Optional[str] = None
    status: str
    zone_id: Optional[str] = None
    sector: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class StaffAssignmentCreate(BaseModel):
    staff_id: int
    zone_id: str


class StaffAssignmentResponse(BaseModel):
    id: int
    staff_id: int
    zone_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DeviceTokenCreate(BaseModel):
    token: str
    device_id: Optional[str] = None
    platform: Optional[str] = None
    user_id: Optional[int] = None
    min_risk_level: str = "warning"


class DeviceTokenResponse(BaseModel):
    id: int
    token: str
    device_id: Optional[str] = None
    platform: Optional[str] = None
    user_id: Optional[int] = None
    min_risk_level: str = "warning"
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PublicDeviceTokenCreate(BaseModel):
    deviceId: str
    pushToken: Optional[str] = None
    platform: Optional[str] = None
    minRiskLevel: str = "warning"


class PublicNotificationSettingsUpdate(BaseModel):
    pushToken: Optional[str] = None
    minRiskLevel: str


class PublicDeviceTokenResponse(BaseModel):
    deviceId: str
    pushToken: Optional[str] = None
    platform: Optional[str] = None
    minRiskLevel: str
    updated_at: Optional[datetime] = None


class ZoneDistanceCreate(BaseModel):
    from_zone_id: str
    to_zone_id: str
    distance_m: float


class EventSettingsBase(BaseModel):
    eventRange: str = ""
    searchPlace: str = ""
    placeDisplayName: str = ""
    mapUrl: str = "/admin-map"
    cctvLocations: List[str] = Field(default_factory=list)
    placeNames: List[str] = Field(default_factory=list)
    roadAngles: List[str] = Field(default_factory=list)
    roadAreas: List[str] = Field(default_factory=list)


class EventSettingsCreate(EventSettingsBase):
    pass


class EventSettingsResponse(EventSettingsBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class PlaceSearchResponse(BaseModel):
    title: str
    address: str
    roadAddress: str = ""
    category: str = ""
    latitude: float
    longitude: float


class RelocationRecommendation(BaseModel):
    from_zone_id: str
    to_zone_id: str
    move_staff_count: int
    distance_m: float
    cost: float


class RelocationResponse(BaseModel):
    total_supply: int
    total_demand: int
    flow_amount: int
    shortage: int
    recommendations: list[RelocationRecommendation]
    message: str


class RelocationApplyResponse(BaseModel):
    recommendation_id: int
    from_zone_id: str
    to_zone_id: str
    requested_staff_count: int
    moved_staff_count: int
    moved_staff_ids: List[int]
    status: str
    message: str
