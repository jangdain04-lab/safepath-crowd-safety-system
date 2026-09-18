from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from sqlalchemy.sql import func
from database import Base


class AnalysisLog(Base):
    __tablename__ = "analysis_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    zone_id = Column(String(50), nullable=False)
    people_count = Column(Integer, nullable=False)
    density = Column(Float, nullable=False)
    speed = Column(Float, nullable=False)
    slope = Column(Float, nullable=True)

    risk_level = Column(String(20), nullable=False)

    cv_status = Column(String(50), nullable=True)
    risk_score = Column(Float, nullable=True)
    m_per_person = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    name = Column(String(100), nullable=True)
    provider = Column(String(50), nullable=False, default="email")
    provider_user_id = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, default="organizer")
    onboarding_completed = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Invite(Base):
    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    code = Column(String(100), unique=True, nullable=False)
    role = Column(String(50), nullable=False, default="organizer")
    owner_email = Column(String(255), nullable=True, index=True)
    is_active = Column(Integer, nullable=False, default=1)
    used_by_user_id = Column(Integer, nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Alert(Base):
    __tablename__ = "alerts"


    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    zone_id = Column(String(50), nullable=False)
    risk_level = Column(String(20), nullable=False)
    message = Column(String(255), nullable=False)
    is_read = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EmergencyAlert(Base):
    __tablename__ = "emergency_alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    target_mode = Column(String(20), nullable=False)
    target_zones = Column(JSON, nullable=False)
    message_type = Column(String(20), nullable=False)
    message = Column(String(1000), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class VisitorAlertState(Base):
    __tablename__ = "visitor_alert_states"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    device_id = Column(String(255), nullable=False, index=True)
    alert_id = Column(Integer, nullable=False, index=True)
    read = Column(Integer, nullable=False, default=0)
    pinned = Column(Integer, nullable=False, default=0)
    deleted = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class VisitorReport(Base):
    __tablename__ = "visitor_reports"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    type = Column(String(30), nullable=False)
    zone_id = Column(String(50), nullable=True)
    zone_name = Column(String(100), nullable=True)
    memo = Column(String(1000), nullable=True)
    device_id = Column(String(255), nullable=True)
    status = Column(String(30), nullable=False, default="pending")

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MissingChild(Base):
    __tablename__ = "missing_children"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    name = Column(String(100), nullable=False)
    age = Column(Integer, nullable=False)
    image_url = Column(String(1000), nullable=False)
    description = Column(String(1000), nullable=False)
    last_seen_location = Column(String(255), nullable=False)
    last_seen_time = Column(DateTime(timezone=True), nullable=False)
    contact_number = Column(String(50), nullable=False)
    status = Column(String(30), nullable=False, default="searching")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    token = Column(String(255), unique=True, nullable=False)
    device_id = Column(String(255), nullable=True, index=True)
    platform = Column(String(30), nullable=True)
    user_id = Column(Integer, nullable=True)
    min_risk_level = Column(String(20), nullable=False, default="warning")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Notice(Base):
    __tablename__ = "notices"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    title = Column(String(200), nullable=False)
    content = Column(String(1000), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    zone_id = Column(String(50), nullable=False)
    sector = Column(String(100), nullable=False)
    gate = Column(String(100), nullable=False, default="")
    level = Column(String(20), nullable=False, default="critical")
    peak_density = Column(Integer, nullable=False, default=0)
    description = Column(String(500), nullable=False)
    thumbnail_url = Column(String(1000), nullable=True)
    video_url = Column(String(1000), nullable=True)
    duration_seconds = Column(Integer, nullable=False, default=0)
    resolved = Column(Integer, nullable=False, default=0)

    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class IncidentStat(Base):
    __tablename__ = "incident_stats"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    incident_id = Column(Integer, nullable=False)
    density = Column(Integer, nullable=False)
    speed_change = Column(Integer, nullable=False, default=0)

    recorded_at = Column(DateTime(timezone=True), server_default=func.now())


class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    zone_id = Column(String(50), unique=True, nullable=False)
    zone_name = Column(String(100), nullable=False)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    grid_x = Column(Float, nullable=True)
    grid_y = Column(Float, nullable=True)

    description = Column(String(255), nullable=True)

class ZoneStaffing(Base):
    __tablename__ = "zone_staffing"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    zone_id = Column(String(50), unique=True, nullable=False)
    current_staff = Column(Integer, nullable=False, default=0)


class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    name = Column(String(100), nullable=False)
    role = Column(String(100), nullable=False)
    phone = Column(String(30), nullable=True)
    email = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    owner_email = Column(String(255), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StaffAssignment(Base):
    __tablename__ = "staff_assignments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    staff_id = Column(Integer, nullable=False)
    zone_id = Column(String(50), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ZoneDistance(Base):
    __tablename__ = "zone_distances"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    from_zone_id = Column(String(50), nullable=False)
    to_zone_id = Column(String(50), nullable=False)
    distance_m = Column(Float, nullable=False)


class FestivalInfo(Base):
    __tablename__ = "festival_info"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    title = Column(String(200), nullable=False)
    date = Column(String(100), nullable=False)
    time = Column(String(100), nullable=False)
    place = Column(String(255), nullable=False)
    description = Column(JSON, nullable=False)
    contacts = Column(JSON, nullable=False)
    cautions = Column(JSON, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RelocationApplication(Base):
    __tablename__ = "relocation_applications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    recommendation_id = Column(Integer, nullable=False)
    from_zone_id = Column(String(50), nullable=False)
    to_zone_id = Column(String(50), nullable=False)
    requested_staff_count = Column(Integer, nullable=False)
    moved_staff_count = Column(Integer, nullable=False)
    moved_staff_ids = Column(JSON, nullable=False)
    status = Column(String(30), nullable=False, default="applied")

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EventSettings(Base):
    __tablename__ = "event_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_email = Column(String(255), nullable=True, index=True)

    event_range = Column(String(255), nullable=False, default="")
    search_place = Column(String(100), nullable=False, default="")
    place_display_name = Column(String(100), nullable=False, default="")
    map_url = Column(String(500), nullable=False, default="/admin-map")

    cctv_locations = Column(JSON, nullable=False)
    place_names = Column(JSON, nullable=False)
    road_angles = Column(JSON, nullable=False)
    road_areas = Column(JSON, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
