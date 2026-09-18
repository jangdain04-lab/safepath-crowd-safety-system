import hashlib
import json
import os
import re
import secrets
import urllib.parse
import urllib.request
import urllib.error
from types import SimpleNamespace
import networkx as nx

from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import crowd_predictor
from models import (
    AnalysisLog,
    User,
    Invite,
    Alert,
    EmergencyAlert,
    VisitorAlertState,
    VisitorReport,
    MissingChild,
    DeviceToken,
    Notice,
    Incident,
    IncidentStat,
    Zone,
    ZoneStaffing,
    Staff,
    StaffAssignment,
    ZoneDistance,
    FestivalInfo,
    RelocationApplication,
    EventSettings,
)
from schemas import AnalysisCreate


def hash_password(password: str):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def user_to_auth_response(user: User):
    settings_owner_email = None

    if user.provider == "invite" and user.provider_user_id:
        settings_owner_email = user.provider_user_id

    return {
        "access_token": secrets.token_urlsafe(32),
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "provider": user.provider,
            "onboarding_completed": user.onboarding_completed,
            "settings_owner_email": settings_owner_email,
        }
    }


def has_saved_event_settings(settings: EventSettings | None) -> bool:
    if settings is None:
        return False

    return any([
        bool((settings.event_range or "").strip()),
        bool((settings.search_place or "").strip()),
        bool((settings.place_display_name or "").strip()),
        bool(settings.cctv_locations),
        bool(settings.place_names),
        bool(settings.road_angles),
        bool(settings.road_areas),
    ])


def sync_user_onboarding_from_settings(db: Session, user: User):
    owner_email = (user.email or "").strip().lower()

    if not owner_email:
        return

    settings = (
        db.query(EventSettings)
        .filter(func.lower(EventSettings.owner_email) == owner_email)
        .order_by(EventSettings.id.asc())
        .first()
    )

    if has_saved_event_settings(settings) and user.onboarding_completed != 1:
        user.onboarding_completed = 1
        db.commit()
        db.refresh(user)


def migrate_legacy_provider_settings(db: Session, provider: str, user: User):
    owner_email = (user.email or "").strip().lower()

    if not owner_email:
        return

    existing = (
        db.query(EventSettings)
        .filter(func.lower(EventSettings.owner_email) == owner_email)
        .order_by(EventSettings.id.asc())
        .first()
    )

    if existing is not None:
        return

    legacy_email = f"{provider}@safepath.local"
    legacy = (
        db.query(EventSettings)
        .filter(func.lower(EventSettings.owner_email) == legacy_email)
        .order_by(EventSettings.id.asc())
        .first()
    )

    if legacy is None or not has_saved_event_settings(legacy):
        return

    legacy.owner_email = owner_email
    db.commit()
    db.refresh(legacy)


def verify_invite_code(db: Session, code: str):
    invite = db.query(Invite).filter(Invite.code == code).first()

    if invite is None:
        return {
            "valid": False,
            "role": None,
            "settings_owner_email": None,
            "message": "유효하지 않은 초대코드입니다."
        }

    if invite.is_active != 1:
        return {
            "valid": False,
            "role": invite.role,
            "settings_owner_email": normalize_owner_email(invite.owner_email),
            "message": "비활성화된 초대코드입니다."
        }

    return {
        "valid": True,
        "role": invite.role,
        "settings_owner_email": normalize_owner_email(invite.owner_email),
        "message": "사용 가능한 초대코드입니다."
    }


def verify_invite_code_for_role(db: Session, code: str, role: str):
    invite_result = verify_invite_code(db, code)

    if not invite_result["valid"]:
        return invite_result

    if invite_result["role"] != role:
        return {
            "valid": False,
            "role": invite_result["role"],
            "settings_owner_email": invite_result.get("settings_owner_email"),
            "message": "이 초대코드는 해당 앱에서 사용할 수 없습니다.",
        }

    invite = db.query(Invite).filter(Invite.code == code).first()

    if role in ("staff_viewer", "visitor") and not normalize_owner_email(invite.owner_email if invite else None):
        return {
            "valid": False,
            "role": role,
            "settings_owner_email": None,
            "message": "현재 관리자 계정에 연결되지 않은 이전 초대코드입니다.",
        }

    return invite_result


def get_invite_settings_for_role(db: Session, role: str, default_code: str, owner_email: str | None = None):
    normalized_owner_email = normalize_owner_email(owner_email)
    invite = (
        db.query(Invite)
        .filter(Invite.role == role)
        .filter(func.lower(Invite.owner_email) == normalized_owner_email if normalized_owner_email else Invite.owner_email.is_(None))
        .order_by(Invite.id.desc())
        .first()
    )

    if invite is None:
        code = default_code

        if normalized_owner_email:
            local_part = re.sub(r"[^A-Za-z0-9]", "", normalized_owner_email.split("@")[0]).upper()[:8]
            code = f"{default_code}-{local_part or 'USER'}"

        while db.query(Invite).filter(Invite.code == code).first() is not None:
            code = f"{default_code}-{secrets.token_hex(3).upper()}"

        invite = Invite(code=code, role=role, owner_email=normalized_owner_email, is_active=1)
        db.add(invite)
        db.commit()
        db.refresh(invite)

    return {
        "code": invite.code,
        "role": invite.role,
        "is_active": invite.is_active,
    }


def upsert_invite_settings_for_role(db: Session, data, role: str, owner_email: str | None = None):
    code = data.code.strip()
    normalized_owner_email = normalize_owner_email(owner_email)

    if not code:
        return "empty_code"

    existing_same_code = db.query(Invite).filter(Invite.code == code).first()
    invite = (
        db.query(Invite)
        .filter(Invite.role == role)
        .filter(func.lower(Invite.owner_email) == normalized_owner_email if normalized_owner_email else Invite.owner_email.is_(None))
        .order_by(Invite.id.desc())
        .first()
    )

    if (
        invite is None
        and existing_same_code is not None
        and existing_same_code.role == role
        and (
            normalize_owner_email(existing_same_code.owner_email) == normalized_owner_email
            or existing_same_code.owner_email is None
        )
    ):
        invite = existing_same_code

    if existing_same_code is not None and (invite is None or existing_same_code.id != invite.id):
        return "duplicate_code"

    if invite is None:
        invite = Invite(code=code, role=role, owner_email=normalized_owner_email, is_active=data.is_active)
        db.add(invite)
    else:
        invite.code = code
        invite.role = role
        invite.owner_email = normalized_owner_email
        invite.is_active = data.is_active

    db.commit()
    db.refresh(invite)

    return {
        "code": invite.code,
        "role": invite.role,
        "is_active": invite.is_active,
    }


def get_staff_invite_settings(db: Session, owner_email: str | None = None):
    return get_invite_settings_for_role(db, "staff_viewer", "STAFF2026", owner_email)


def upsert_staff_invite_settings(db: Session, data, owner_email: str | None = None):
    return upsert_invite_settings_for_role(db, data, "staff_viewer", owner_email)


def get_visitor_invite_settings(db: Session, owner_email: str | None = None):
    return get_invite_settings_for_role(db, "visitor", "VISITOR2026", owner_email)


def upsert_visitor_invite_settings(db: Session, data, owner_email: str | None = None):
    return upsert_invite_settings_for_role(db, data, "visitor", owner_email)


def join_with_invite_code(db: Session, data):
    invite_result = verify_invite_code_for_role(db, data.code, "staff_viewer")

    if not invite_result["valid"]:
        return None

    name = data.name.strip()

    if not name:
        return "empty_name"

    role = invite_result["role"] or "staff_viewer"
    invite = db.query(Invite).filter(Invite.code == data.code).first()
    settings_owner_email = normalize_owner_email(invite.owner_email) if invite else None
    email = f"invite_{secrets.token_urlsafe(12)}@staff.local"
    user = User(
        email=email,
        name=name,
        provider="invite",
        provider_user_id=settings_owner_email,
        role=role,
        onboarding_completed=1,
    )
    db.add(user)
    db.flush()

    staff = Staff(
        name=name,
        role="스태프",
        status="active",
        email=email,
    )
    db.add(staff)

    if invite:
        invite.used_by_user_id = user.id
        invite.used_at = datetime.now()

    db.commit()
    db.refresh(user)

    return user_to_auth_response(user)


def signup_user(db: Session, data):
    existing_user = db.query(User).filter(User.email == data.email).first()

    if existing_user:
        return None

    role = "organizer"

    if data.invite_code:
        invite_result = verify_invite_code_for_role(db, data.invite_code, "staff_viewer")

        if not invite_result["valid"]:
            return None

        role = invite_result["role"] or role

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
        provider="email",
        role=role,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    if data.invite_code:
        invite = db.query(Invite).filter(Invite.code == data.invite_code).first()

        if invite:
            invite.used_by_user_id = user.id
            invite.used_at = datetime.now()
            db.commit()

    return user_to_auth_response(user)


def login_user(db: Session, data):
    user = db.query(User).filter(User.email == data.email).first()

    if user is None:
        return None

    if user.password_hash != hash_password(data.password):
        return None

    sync_user_onboarding_from_settings(db, user)

    return user_to_auth_response(user)


def oauth_login_user(db: Session, provider: str, data):
    email = data.email or f"{provider}_{data.provider_user_id}@oauth.local"

    user = (
        db.query(User)
        .filter(User.provider == provider)
        .filter(User.provider_user_id == data.provider_user_id)
        .first()
    )

    if user is None:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        user = User(
            email=email,
            name=data.name,
            provider=provider,
            provider_user_id=data.provider_user_id,
            role="organizer",
        )
        db.add(user)
    else:
        user.provider = provider
        user.provider_user_id = data.provider_user_id
        if data.name:
            user.name = data.name

    db.commit()
    db.refresh(user)
    migrate_legacy_provider_settings(db, provider, user)
    sync_user_onboarding_from_settings(db, user)

    return user_to_auth_response(user)


OAUTH_CONFIGS = {
    "google": {
        "client_id_env": "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_endpoint": "https://oauth2.googleapis.com/token",
        "userinfo_endpoint": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scopes": ["openid", "profile", "email"],
    },
    "kakao": {
        "client_id_env": "KAKAO_CLIENT_ID",
        "client_secret_env": "KAKAO_CLIENT_SECRET",
        "authorization_endpoint": "https://kauth.kakao.com/oauth/authorize",
        "token_endpoint": "https://kauth.kakao.com/oauth/token",
        "userinfo_endpoint": "https://kapi.kakao.com/v2/user/me",
        "scopes": ["profile_nickname"],
    },
    "naver": {
        "client_id_env": "NAVER_CLIENT_ID",
        "client_secret_env": "NAVER_CLIENT_SECRET",
        "authorization_endpoint": "https://nid.naver.com/oauth2.0/authorize",
        "token_endpoint": "https://nid.naver.com/oauth2.0/token",
        "userinfo_endpoint": "https://openapi.naver.com/v1/nid/me",
        "scopes": [],
    },
}


def get_oauth_config(provider: str):
    config = OAUTH_CONFIGS.get(provider)

    if config is None:
        return None

    client_id = os.getenv(config["client_id_env"], "").strip()

    return {
        "provider": provider,
        "client_id": client_id,
        "authorization_endpoint": config["authorization_endpoint"],
        "scopes": config["scopes"],
    }


def _post_form(url: str, payload: dict, headers: dict | None = None):
    body = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            **(headers or {}),
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"HTTP Error {exc.code}: {detail}")


def _get_json(url: str, access_token: str):
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"HTTP Error {exc.code}: {detail}")


def _extract_oauth_profile(provider: str, userinfo: dict):
    if provider == "google":
        provider_user_id = str(userinfo.get("id") or userinfo.get("sub") or "")
        email = userinfo.get("email")
        name = userinfo.get("name")
    elif provider == "kakao":
        account = userinfo.get("kakao_account") or {}
        profile = account.get("profile") or {}
        provider_user_id = str(userinfo.get("id") or "")
        email = account.get("email")
        name = profile.get("nickname")
    elif provider == "naver":
        response = userinfo.get("response") or {}
        provider_user_id = str(response.get("id") or "")
        email = response.get("email")
        name = response.get("name") or response.get("nickname")
    else:
        provider_user_id = ""
        email = None
        name = None

    if not provider_user_id:
        raise ValueError("OAuth provider user id is missing")

    return SimpleNamespace(
        provider_user_id=provider_user_id,
        email=email,
        name=name,
    )


def oauth_callback_user(db: Session, provider: str, data):
    config = OAUTH_CONFIGS.get(provider)

    if config is None:
        return None

    client_id = os.getenv(config["client_id_env"], "").strip()
    client_secret = os.getenv(config["client_secret_env"], "").strip()

    if not client_id:
        raise ValueError(f"{config['client_id_env']} is not configured")

    token_payload = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": data.code,
        "redirect_uri": data.redirect_uri,
    }

    if data.code_verifier:
        token_payload["code_verifier"] = data.code_verifier

    if provider == "naver" and data.state:
        token_payload["state"] = data.state

    if client_secret:
        token_payload["client_secret"] = client_secret

    token = _post_form(config["token_endpoint"], token_payload)
    access_token = token.get("access_token")

    if not access_token:
        raise ValueError("OAuth access token is missing")

    userinfo = _get_json(config["userinfo_endpoint"], access_token)
    profile = _extract_oauth_profile(provider, userinfo)

    return oauth_login_user(db, provider, profile)



LIVE_ANALYSIS_STALE_SECONDS = 30


def is_live_analysis_log(log: AnalysisLog | None) -> bool:
    if log is None or log.created_at is None:
        return False

    now = datetime.now(log.created_at.tzinfo) if log.created_at.tzinfo else datetime.now()
    return (now - log.created_at).total_seconds() <= LIVE_ANALYSIS_STALE_SECONDS


def get_live_log_risk_level(log: AnalysisLog | None) -> str | None:
    if log is None:
        return None
    if log.people_count <= 0:
        return "safe"
    return log.risk_level


def calculate_risk_level(density: float, speed: float, people_count: int | None = None) -> str:
    if people_count is not None and people_count <= 0:
        return "safe"

    if density >= 5 or speed <= 0.4:
        return "danger"
    elif density >= 4 or speed <= 0.7:
        return "warning"
    elif density >= 3:
        return "warning"
    else:
        return "safe"


def convert_cv_status_to_risk_level(cv_status: str | None):
    if cv_status is None:
        return None

    normalized_status = cv_status.upper()

    if "DANGER" in normalized_status:
        return "danger"
    elif "CAUTION" in normalized_status:
        return "warning"
    elif "NORMAL" in normalized_status or "SAFE" in normalized_status:
        return "safe"

    return None

def create_analysis_log(db: Session, data: AnalysisCreate, commit: bool = True):
    previous_log = get_previous_analysis_log(db, data.zone_id)

    previous_risk_level = None
    if previous_log:
        previous_risk_level = previous_log.risk_level

    cv_risk_level = convert_cv_status_to_risk_level(data.cv_status)

    if data.people_count <= 0:
        current_risk_level = "safe"
    elif cv_risk_level is not None:
        current_risk_level = cv_risk_level
    else:
        current_risk_level = calculate_risk_level(data.density, data.speed, data.people_count)

    db_log = AnalysisLog(
        zone_id=data.zone_id,
        people_count=data.people_count,
        density=data.density,
        speed=data.speed,
        slope=data.slope,
        risk_level=current_risk_level,
        cv_status=data.cv_status,
        risk_score=data.risk_score,
        m_per_person=data.m_per_person
    )

    db.add(db_log)
    db.flush()

    update_incident_from_analysis(db, data.zone_id, data.people_count, data.speed, current_risk_level)

    if current_risk_level in ["warning", "danger"]:
        already_alerted = has_recent_same_alert(
            db=db,
            zone_id=data.zone_id,
            risk_level=current_risk_level,
            seconds=60
        )

        if not already_alerted:
            alert_message = f"{data.zone_id} 구역 {current_risk_level} 단계 발생"

            db_alert = Alert(
                zone_id=data.zone_id,
                risk_level=current_risk_level,
                message=alert_message
            )

            db.add(db_alert)

    if previous_risk_level in ["warning", "danger"] and current_risk_level in ["safe", "caution"]:
        clear_message = f"{data.zone_id} 구역 위험 해제"

        db_clear_alert = Alert(
            zone_id=data.zone_id,
            risk_level="clear",
            message=clear_message
        )

        db.add(db_clear_alert)

    if commit:
        db.commit()
        db.refresh(db_log)

    return db_log


def get_zone_display_name(db: Session, zone_id: str):
    zone = db.query(Zone).filter(Zone.zone_id == zone_id).first()
    return zone.zone_name if zone else zone_id


def get_open_incident(db: Session, zone_id: str):
    return (
        db.query(Incident)
        .filter(Incident.zone_id == zone_id)
        .filter(Incident.resolved == 0)
        .order_by(Incident.started_at.desc())
        .first()
    )


def close_stale_open_incidents(db: Session):
    open_incidents = (
        db.query(Incident)
        .filter(Incident.resolved == 0)
        .all()
    )

    changed = False
    now = datetime.now()

    for incident in open_incidents:
        latest_log = get_latest_by_zone(db, incident.zone_id)

        if latest_log is None or latest_log.created_at is None:
            ended_at = incident.started_at or incident.created_at or now
        elif is_live_analysis_log(latest_log) and get_live_log_risk_level(latest_log) == "danger":
            continue
        else:
            ended_at = latest_log.created_at

        started_at = incident.started_at or incident.created_at or ended_at

        if ended_at < started_at:
            ended_at = started_at

        incident.resolved = 1
        incident.ended_at = ended_at
        incident.duration_seconds = max(0, round((ended_at - started_at).total_seconds()))
        changed = True

    if changed:
        db.flush()


def calculate_speed_change(db: Session, zone_id: str, current_speed: float):
    previous_log = (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id == zone_id)
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .offset(1)
        .first()
    )

    if previous_log is None or previous_log.speed == 0:
        return 0

    return min(100, abs(round(((current_speed - previous_log.speed) / previous_log.speed) * 100)))


def has_persistent_danger(db: Session, zone_id: str, seconds: int = 30):
    latest_log = (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id == zone_id)
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .first()
    )

    if latest_log is None or latest_log.created_at is None:
        return False

    cutoff = datetime.now() - timedelta(seconds=seconds)

    return latest_log.created_at >= cutoff and get_live_log_risk_level(latest_log) == "danger"


def update_incident_from_analysis(
    db: Session,
    zone_id: str,
    people_count: int,
    speed: float,
    risk_level: str,
):
    open_incident = get_open_incident(db, zone_id)

    if people_count > 0 and risk_level == "danger":
        if open_incident is None:
            if not has_persistent_danger(db, zone_id):
                return

            sector = get_zone_display_name(db, zone_id)
            open_incident = Incident(
                zone_id=zone_id,
                sector=sector,
                gate=f"{zone_id} 구역",
                level="critical",
                peak_density=people_count,
                description=f"{sector} 구역 위험 수준 지속 감지",
                thumbnail_url="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=1200&auto=format&fit=crop",
                duration_seconds=0,
                resolved=0,
            )
            db.add(open_incident)
            db.flush()

        open_incident.peak_density = max(open_incident.peak_density, people_count)
        db.add(
            IncidentStat(
                incident_id=open_incident.id,
                density=people_count,
                speed_change=calculate_speed_change(db, zone_id, speed),
            )
        )

        return

    if open_incident is not None:
        now = datetime.now()
        started_at = open_incident.started_at or now

        open_incident.resolved = 1
        open_incident.ended_at = now
        open_incident.duration_seconds = max(0, round((now - started_at).total_seconds()))


def get_all_analysis_logs(db: Session):
    return db.query(AnalysisLog).order_by(AnalysisLog.created_at.desc()).all()


def get_latest_by_zone(db: Session, zone_id: str):
    return (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id == zone_id)
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .first()
    )

def get_all_analysis_logs(db: Session):
    return db.query(AnalysisLog).order_by(AnalysisLog.created_at.desc()).all()


def get_latest_by_zone(db: Session, zone_id: str):
    return (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id == zone_id)
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .first()
    )

def get_current_status_all_zones(db: Session):
    subquery = (
        db.query(
            AnalysisLog.zone_id,
            func.max(AnalysisLog.id).label("latest_id")
        )
        .group_by(AnalysisLog.zone_id)
        .subquery()
    )

    return (
        db.query(AnalysisLog)
        .join(
            subquery,
            (AnalysisLog.zone_id == subquery.c.zone_id)
            & (AnalysisLog.id == subquery.c.latest_id)
        )
        .order_by(AnalysisLog.zone_id.asc())
        .all()
    )


def get_zone_history(db: Session, zone_id: str, limit: int = 100):
    return (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id == zone_id)
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .limit(limit)
        .all()
    )

def get_all_alerts(db: Session):
    return db.query(Alert).order_by(Alert.created_at.desc()).all()


def create_manual_alerts(db: Session, data):
    target_zones = ["all"] if data.target_mode == "all" else data.target_zones
    risk_level = "danger" if data.message_type == "evacuate" else "warning"

    history = EmergencyAlert(
        target_mode=data.target_mode,
        target_zones=target_zones,
        message_type=data.message_type,
        message=data.message
    )

    db.add(history)

    for zone_id in target_zones:
        alert = Alert(
            zone_id=zone_id,
            risk_level=risk_level,
            message=data.message
        )
        db.add(alert)

    db.commit()
    db.refresh(history)

    return history


def get_alert_history(db: Session):
    return db.query(EmergencyAlert).order_by(EmergencyAlert.created_at.desc()).all()

def has_recent_same_alert(
    db: Session,
    zone_id: str,
    risk_level: str,
    seconds: int = 60
) -> bool:
    recent_time = datetime.now() - timedelta(seconds=seconds)

    recent_alert = (
        db.query(Alert)
        .filter(Alert.zone_id == zone_id)
        .filter(Alert.risk_level == risk_level)
        .filter(Alert.created_at >= recent_time)
        .first()
    )

    return recent_alert is not None

def mark_alert_as_read(db: Session, alert_id: int):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()

    if alert is None:
        return None

    alert.is_read = 1
    db.commit()
    db.refresh(alert)

    return alert

def get_unread_alerts(db: Session):
    return (
        db.query(Alert)
        .filter(Alert.is_read == 0)
        .order_by(Alert.created_at.desc())
        .all()
    )


def normalize_public_alert_level(risk_level: str | None):
    if risk_level == "danger":
        return "danger"
    return "warning"


def get_alert_progress(risk_level: str | None):
    return 86 if risk_level == "danger" else 66


def get_or_create_visitor_alert_state(db: Session, device_id: str, alert_id: int):
    state = (
        db.query(VisitorAlertState)
        .filter(VisitorAlertState.device_id == device_id)
        .filter(VisitorAlertState.alert_id == alert_id)
        .first()
    )

    if state is None:
        state = VisitorAlertState(device_id=device_id, alert_id=alert_id)
        db.add(state)
        db.commit()
        db.refresh(state)

    return state


def get_public_alerts(db: Session, device_id: str = "visitor-app"):
    alerts = db.query(Alert).order_by(Alert.created_at.desc()).all()
    states = {
        state.alert_id: state
        for state in (
            db.query(VisitorAlertState)
            .filter(VisitorAlertState.device_id == device_id)
            .all()
        )
    }

    result = []

    for alert in alerts:
        state = states.get(alert.id)

        if state and state.deleted == 1:
            continue

        risk_level = normalize_public_alert_level(alert.risk_level)

        result.append({
            "id": str(alert.id),
            "zoneId": alert.zone_id,
            "zoneName": get_zone_name(db, alert.zone_id) if alert.zone_id != "all" else "전체 구역",
            "riskLevel": risk_level,
            "timestamp": alert.created_at,
            "message": alert.message,
            "read": bool(state.read) if state else False,
            "pinned": bool(state.pinned) if state else False,
            "progress": get_alert_progress(risk_level),
        })

    return result


def update_visitor_alert_state(db: Session, alert_id: int, data):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()

    if alert is None:
        return None

    state = get_or_create_visitor_alert_state(db, data.device_id, alert_id)

    if data.read is not None:
        state.read = 1 if data.read else 0
    if data.pinned is not None:
        state.pinned = 1 if data.pinned else 0
    if data.deleted is not None:
        state.deleted = 1 if data.deleted else 0

    db.commit()
    db.refresh(state)

    return state


def mark_public_alert_read(db: Session, alert_id: int, data):
    return update_visitor_alert_state(db, alert_id, data)


def pin_public_alert(db: Session, alert_id: int, data):
    return update_visitor_alert_state(db, alert_id, data)


def delete_public_alert(db: Session, alert_id: int, data):
    data.deleted = True
    return update_visitor_alert_state(db, alert_id, data)


def create_visitor_report(db: Session, data):
    report = VisitorReport(
        type=data.type,
        zone_id=data.zoneId,
        zone_name=data.zoneName,
        memo=data.memo,
        device_id=data.deviceId,
        status="pending",
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    return report


def get_visitor_reports(db: Session, status: str | None = None):
    query = db.query(VisitorReport)

    if status:
        query = query.filter(VisitorReport.status == status)

    return query.order_by(VisitorReport.created_at.desc()).all()


def update_visitor_report_status(db: Session, report_id: int, data):
    allowed_statuses = {"pending", "reviewing", "resolved", "dismissed"}

    if data.status not in allowed_statuses:
        return "invalid_status"

    report = db.query(VisitorReport).filter(VisitorReport.id == report_id).first()

    if report is None:
        return None

    report.status = data.status
    db.commit()
    db.refresh(report)

    return report


def missing_child_to_public_response(child: MissingChild):
    return {
        "id": f"mc{child.id}",
        "name": child.name,
        "age": child.age,
        "imageUrl": child.image_url,
        "description": child.description,
        "lastSeenLocation": child.last_seen_location,
        "lastSeenTime": child.last_seen_time,
        "contactNumber": child.contact_number,
        "status": child.status,
    }


def create_missing_child(db: Session, data):
    child = MissingChild(
        name=data.name,
        age=data.age,
        image_url=data.imageUrl,
        description=data.description,
        last_seen_location=data.lastSeenLocation,
        last_seen_time=data.lastSeenTime,
        contact_number=data.contactNumber,
        status=data.status or "searching",
    )

    db.add(child)
    db.commit()
    db.refresh(child)

    return missing_child_to_public_response(child)


def get_public_missing_children(db: Session):
    children = (
        db.query(MissingChild)
        .filter(MissingChild.status == "searching")
        .order_by(MissingChild.created_at.desc())
        .all()
    )

    return [missing_child_to_public_response(child) for child in children]


def get_public_missing_child(db: Session, child_id: str):
    numeric_id = child_id[2:] if child_id.startswith("mc") else child_id

    if not str(numeric_id).isdigit():
        return None

    child = db.query(MissingChild).filter(MissingChild.id == int(numeric_id)).first()

    if child is None:
        return None

    return missing_child_to_public_response(child)


def get_default_festival_info():
    return {
        "title": "2026 인하대학교 축제 안내",
        "date": "2026년 5월 13일",
        "time": "오후 2시 - 오후 10시",
        "place": "백년관 앞 광장",
        "description": [
            "오후 2시부터 오후 10시까지 진행됩니다.",
            "백년관 버정길과 인경관 주차장 입구는 혼잡이 예상됩니다. 가능하면 우회 경로를 이용해주세요.",
            "혼잡한 구역에서는 천천히 이동하고, 위험 상황 발생 시 즉시 주변 스태프에게 알려주세요.",
        ],
        "contacts": [
            {"label": "행사 본부", "phone": "02-1234-5678"},
            {"label": "안전 관리팀", "phone": "02-8765-4321"},
        ],
        "cautions": [
            "혼잡한 곳에서는 밀지 마세요.",
            "어린이는 보호자와 함께 이동하세요.",
            "위험 상황 발생 시 신속히 대피하세요.",
            "실시간 혼잡도를 확인하며 이동하세요.",
        ],
    }


def festival_info_to_response(info: FestivalInfo):
    return {
        "id": info.id,
        "title": info.title,
        "date": info.date,
        "time": info.time,
        "place": info.place,
        "description": info.description,
        "contacts": info.contacts,
        "cautions": info.cautions,
        "created_at": info.created_at,
        "updated_at": info.updated_at,
    }


def get_current_festival_info(db: Session):
    info = db.query(FestivalInfo).order_by(FestivalInfo.id.asc()).first()

    if info is None:
        defaults = get_default_festival_info()
        info = FestivalInfo(**defaults)
        db.add(info)
        db.commit()
        db.refresh(info)

    return festival_info_to_response(info)


def upsert_festival_info(db: Session, data):
    info = db.query(FestivalInfo).order_by(FestivalInfo.id.asc()).first()

    if info is None:
        info = FestivalInfo(
            title=data.title,
            date=data.date,
            time=data.time,
            place=data.place,
            description=data.description,
            contacts=[contact.model_dump() for contact in data.contacts],
            cautions=data.cautions,
        )
        db.add(info)
    else:
        info.title = data.title
        info.date = data.date
        info.time = data.time
        info.place = data.place
        info.description = data.description
        info.contacts = [contact.model_dump() for contact in data.contacts]
        info.cautions = data.cautions

    db.commit()
    db.refresh(info)

    return festival_info_to_response(info)


def get_all_notices(db: Session):
    return db.query(Notice).order_by(Notice.created_at.desc()).all()


def get_public_announcements(db: Session):
    notices = get_all_notices(db)
    announcements = []

    for index, notice in enumerate(notices):
        summary = notice.content.strip().replace("\n", " ")

        if len(summary) > 80:
            summary = f"{summary[:80]}..."

        announcements.append({
            "id": str(notice.id),
            "title": notice.title,
            "summary": summary,
            "content": notice.content,
            "timestamp": notice.created_at,
            "read": False,
            "pinned": index == 0,
        })

    return announcements


def create_notice(db: Session, data):
    notice = Notice(
        title=data.title,
        content=data.content
    )

    db.add(notice)
    db.commit()
    db.refresh(notice)

    return notice


def update_notice(db: Session, notice_id: int, data):
    notice = db.query(Notice).filter(Notice.id == notice_id).first()

    if notice is None:
        return None

    if data.title is not None:
        notice.title = data.title
    if data.content is not None:
        notice.content = data.content

    db.commit()
    db.refresh(notice)

    return notice


def delete_notice(db: Session, notice_id: int):
    notice = db.query(Notice).filter(Notice.id == notice_id).first()

    if notice is None:
        return None

    db.delete(notice)
    db.commit()

    return {"deleted": True}


def get_previous_analysis_log(db: Session, zone_id: str):
    return (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id == zone_id)
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .first()
    )

def create_zone(db: Session, zone_data):
    existing_zone = (
        db.query(Zone)
        .filter(Zone.zone_id == zone_data.zone_id)
        .first()
    )

    if existing_zone:
        return existing_zone

    db_zone = Zone(
        zone_id=zone_data.zone_id,
        zone_name=zone_data.zone_name,
        latitude=zone_data.latitude,
        longitude=zone_data.longitude,
        grid_x=zone_data.grid_x,
        grid_y=zone_data.grid_y,
        description=zone_data.description
    )

    db.add(db_zone)
    db.commit()
    db.refresh(db_zone)

    return db_zone


def get_all_zones(db: Session):
    return db.query(Zone).order_by(Zone.zone_id.asc()).all()


def normalize_frontend_risk_level(risk_level: str | None) -> str:
    if risk_level == "danger":
        return "danger"
    if risk_level in ["warning", "caution"]:
        return "warning"
    if risk_level == "safe":
        return "safe"
    return "unknown"


def get_map_current_status(db: Session):
    zones = db.query(Zone).order_by(Zone.zone_id.asc()).all()

    result = []

    for zone in zones:
        latest_log = (
            db.query(AnalysisLog)
            .filter(AnalysisLog.zone_id == zone.zone_id)
            .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
            .first()
        )
        latest_log = latest_log if is_live_analysis_log(latest_log) else None

        if latest_log:
            risk_level = normalize_frontend_risk_level(get_live_log_risk_level(latest_log))

            result.append({
                "zone_id": zone.zone_id,
                "zone_name": zone.zone_name,
                "latitude": zone.latitude,
                "longitude": zone.longitude,
                "description": zone.description,
                "people_count": latest_log.people_count,
                "density": latest_log.density,
                "speed": latest_log.speed,
                "slope": latest_log.slope,
                "risk_level": risk_level,
                "updated_at": latest_log.created_at
            })
        else:
            result.append({
                "zone_id": zone.zone_id,
                "zone_name": zone.zone_name,
                "latitude": zone.latitude,
                "longitude": zone.longitude,
                "description": zone.description,
                "people_count": None,
                "density": None,
                "speed": None,
                "slope": None,
                "risk_level": "unknown",
                "updated_at": None
            })

    return result


COORDINATE_PATTERN = re.compile(r"\s*\(([0-9.-]+),\s*([0-9.-]+)\)\s*$")


def get_configured_cctv_name(value: str | None):
    has_coordinate = bool(COORDINATE_PATTERN.search(value or ""))
    cleaned = COORDINATE_PATTERN.sub("", value or "").strip()

    if not cleaned:
        return None

    default_names = {
        "백년관 버정길 CCTV",
        "자연과학대 앞 CCTV",
        "공대 흡연부스 옆 CCTV",
        "인경관 주차장 입구 CCTV",
        "공대-백년관 사이 CCTV",
        "백년관 잔디구장 CCTV",
    }

    if cleaned in default_names and not has_coordinate:
        return None

    if re.fullmatch(r"\d+번\s*CCTV", cleaned) and not has_coordinate:
        return None

    if re.fullmatch(r"\d+번\s*CCTV", cleaned) and not has_coordinate:
        return None

    return cleaned


def get_configured_cctv_coordinate(value: str | None):
    match = COORDINATE_PATTERN.search(value or "")

    if not match:
        return None

    try:
        return float(match.group(1)), float(match.group(2))
    except ValueError:
        return None


def get_cctv_candidate_zone_ids(index: int):
    letter = chr(ord("A") + index - 1) if 1 <= index <= 26 else str(index)

    return [
        str(index),
        letter,
        letter.lower(),
        f"cam{index}",
        f"CAM{index}",
        f"z{index}",
        f"Z{index}",
        f"cctv-{index}",
        f"CCTV-{index}",
        f"cctv{index}",
        f"CCTV{index}",
    ]


def get_latest_analysis_for_cctv(db: Session, index: int):
    candidate_zone_ids = get_cctv_candidate_zone_ids(index)

    return (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id.in_(candidate_zone_ids))
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .first()
    )


def get_live_zones_for_frontend(db: Session, user_email: str | None = None):
    settings = get_event_settings_query(db, user_email)

    configured_cctvs = []

    if settings and settings.cctv_locations:
        for index, location in enumerate(settings.cctv_locations, start=1):
            name = get_configured_cctv_name(location)

            if not name:
                continue

            coordinate = get_configured_cctv_coordinate(location)
            latest_log = get_latest_analysis_for_cctv(db, index)
            latest_log = latest_log if is_live_analysis_log(latest_log) else None
            risk_level = normalize_frontend_risk_level(get_live_log_risk_level(latest_log))
            latitude = coordinate[0] if coordinate else 0.0
            longitude = coordinate[1] if coordinate else 0.0

            configured_cctvs.append({
                "zone_id": str(index),
                "zone_name": name,
                "name": name,
                "latitude": latitude,
                "longitude": longitude,
                "description": settings.place_names[index - 1] if index - 1 < len(settings.place_names) else None,
                "people_count": latest_log.people_count if latest_log else 0,
                "count": latest_log.people_count if latest_log else 0,
                "density": latest_log.density if latest_log else None,
                "speed": latest_log.speed if latest_log else None,
                "slope": latest_log.slope if latest_log else None,
                "risk_level": risk_level,
                "level": risk_level,
                "status": risk_level if risk_level != "unknown" else "safe",
                "updated_at": latest_log.created_at if latest_log else None,
            })

    if configured_cctvs:
        return configured_cctvs

    zones = get_map_current_status(db)

    result = []

    for zone in zones:
        risk_level = normalize_frontend_risk_level(zone["risk_level"])
        people_count = zone["people_count"] if zone["people_count"] is not None else 0

        result.append({
            "zone_id": zone["zone_id"],
            "zone_name": zone["zone_name"],
            "name": zone["zone_name"],
            "latitude": zone["latitude"],
            "longitude": zone["longitude"],
            "description": zone["description"],
            "people_count": zone["people_count"],
            "count": people_count,
            "density": zone["density"],
            "speed": zone["speed"],
            "slope": zone["slope"],
            "risk_level": risk_level,
            "level": risk_level,
            "status": risk_level,
            "updated_at": zone["updated_at"]
        })

    return result


def normalize_public_risk_level(risk_level: str | None) -> str:
    normalized = normalize_frontend_risk_level(risk_level)

    if normalized == "safe":
        return "relaxed"
    if normalized in ["warning", "danger"]:
        return normalized
    return "relaxed"


def normalize_public_density(density: float | None, risk_level: str) -> float:
    if density is None:
        return {"danger": 85.0, "warning": 60.0, "relaxed": 25.0}.get(risk_level, 0.0)

    value = float(density)

    if 0 <= value <= 1:
        value *= 100

    return max(0.0, min(100.0, value))


def get_live_video_urls_for_owner(owner_email: str | None):
    normalized_owner_email = normalize_owner_email(owner_email)

    if normalized_owner_email == "sangwoo1260@naver.com":
        return {
            "1": "https://vdo.ninja/?view=vdavetermineb",
            "2": "https://vdo.ninja/?view=sitineuGSG",
            "3": "https://vdo.ninja/?view=Chidrentrackf",
            "4": "https://vdo.ninja/?view=startsameu",
        }

    return {}


def get_public_live_zones(db: Session, user_email: str | None = None):
    fallback_positions = [
        {"x": 29.0, "y": 42.0},
        {"x": 74.0, "y": 42.0},
        {"x": 27.0, "y": 72.0},
        {"x": 82.0, "y": 72.0},
        {"x": 53.0, "y": 55.0},
        {"x": 50.0, "y": 84.0},
    ]

    settings = get_public_event_settings_query(db, user_email)
    live_video_urls = get_live_video_urls_for_owner(settings.owner_email if settings else user_email)
    configured_cctvs = []

    configured_count = 0

    cctv_locations = settings.cctv_locations if settings and settings.cctv_locations else []
    place_names = settings.place_names if settings and settings.place_names else []

    if settings and cctv_locations:
        configured_count = len([location for location in cctv_locations if (location or "").strip()])

        for index in range(1, configured_count + 1):
            location = cctv_locations[index - 1] if index - 1 < len(cctv_locations) else ""
            place_name = (
                place_names[index - 1].strip()
                if index - 1 < len(place_names) and place_names[index - 1]
                else ""
            )
            cctv_name = get_configured_cctv_name(location)

            if not location:
                continue

            name = cctv_name or place_name or f"{index}번 CCTV"

            latest_log = get_latest_analysis_for_cctv(db, index)
            latest_log = latest_log if is_live_analysis_log(latest_log) else None
            risk_level = normalize_public_risk_level(get_live_log_risk_level(latest_log))
            fallback_position = fallback_positions[(index - 1) % len(fallback_positions)]

            configured_cctvs.append({
                "id": str(index),
                "name": name,
                "density": normalize_public_density(latest_log.density if latest_log else None, risk_level),
                "riskLevel": risk_level,
                "peopleCount": latest_log.people_count if latest_log else 0,
                "gridPos": fallback_position,
                "videoUrl": live_video_urls.get(str(index)),
            })

    if configured_count:
        return configured_cctvs

    return []


def calculate_risk_score(risk_level: str, density: float | None, speed: float | None) -> float:
    if risk_level == "danger":
        base_score = 0.9
    elif risk_level == "warning":
        base_score = 0.7
    elif risk_level == "caution":
        base_score = 0.4
    elif risk_level == "safe":
        base_score = 0.1
    else:
        base_score = 0.0

    density_score = 0.0
    speed_score = 0.0

    if density is not None:
        density_score = min(density / 5.0, 1.0)

    if speed is not None:
        speed_score = max(0.0, min((1.2 - speed) / 1.2, 1.0))

    final_score = max(base_score, density_score, speed_score)

    return round(final_score, 2)

def get_zone_heatmap_data(db: Session):
    zones = db.query(Zone).order_by(Zone.zone_id.asc()).all()

    result = []

    for zone in zones:
        latest_log = (
            db.query(AnalysisLog)
            .filter(AnalysisLog.zone_id == zone.zone_id)
            .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
            .first()
        )
        latest_log = latest_log if is_live_analysis_log(latest_log) else None

        if latest_log:
            risk_level = normalize_frontend_risk_level(get_live_log_risk_level(latest_log))
            risk_score = calculate_risk_score(
                risk_level=risk_level,
                density=latest_log.density,
                speed=latest_log.speed
            )

            result.append({
                "zone_id": zone.zone_id,
                "zone_name": zone.zone_name,
                "latitude": zone.latitude,
                "longitude": zone.longitude,
                "risk_level": risk_level,
                "risk_score": risk_score,
                "people_count": latest_log.people_count,
                "density": latest_log.density,
                "speed": latest_log.speed,
                "updated_at": latest_log.created_at
            })

        else:
            result.append({
                "zone_id": zone.zone_id,
                "zone_name": zone.zone_name,
                "latitude": zone.latitude,
                "longitude": zone.longitude,
                "risk_level": "unknown",
                "risk_score": 0.0,
                "people_count": None,
                "density": None,
                "speed": None,
                "updated_at": None
            })

    return result


def get_prediction_level(progress: int, risk_level: str | None):
    if risk_level == "danger" or progress >= 75:
        return "critical"
    if risk_level == "warning" or progress >= 50:
        return "warning"
    return "safe"


def get_prediction_icon(values: list[int]):
    if len(values) < 2:
        return "pulse"

    diff = values[-1] - values[max(0, len(values) - 4)]

    if diff > 3:
        return "trending-up"
    if diff < -3:
        return "trending-down"
    return "pulse"


def build_prediction_values(logs: list[AnalysisLog]):
    chronological_logs = list(reversed(logs))
    values = [int(log.people_count) for log in chronological_logs[-6:]]

    if not values:
        values = [0]

    while len(values) < 6:
        values.insert(0, values[0])

    recent_trend = values[-1] - values[-2] if len(values) >= 2 else 0
    trend_step = max(-8, min(8, recent_trend))

    while len(values) < 10:
        next_value = max(0, values[-1] + trend_step)
        values.append(int(next_value))

    return values[-10:]


def get_risk_predictions(db: Session, zone_id: str | None = None):
    query = db.query(Zone).order_by(Zone.zone_id.asc())

    if zone_id is not None:
        query = query.filter(Zone.zone_id == zone_id)

    zones = query.all()
    result = []

    for index, zone in enumerate(zones):
        logs = (
            db.query(AnalysisLog)
            .filter(AnalysisLog.zone_id == zone.zone_id)
            .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
            .limit(10)
            .all()
        )

        if logs:
            values = build_prediction_values(logs)
            latest_log = logs[0]
            risk_level = normalize_frontend_risk_level(latest_log.risk_level)
            risk_score = latest_log.risk_score

            if risk_score is None:
                risk_score = calculate_risk_score(
                    risk_level=risk_level,
                    density=latest_log.density,
                    speed=latest_log.speed
                )

            progress = max(0, min(100, round(risk_score * 100)))
        else:
            values = [0] * 10
            risk_level = "safe"
            progress = 0

        level = get_prediction_level(progress, risk_level)
        time = "5분 후" if level == "critical" else "10분 후" if level == "warning" else "30분 후"

        result.append({
            "id": str(index + 1),
            "zone_id": zone.zone_id,
            "sector": zone.zone_name,
            "time": time,
            "level": level,
            "progress": progress,
            "icon": get_prediction_icon(values),
            "values": values,
        })

    result.sort(key=lambda item: item["progress"], reverse=True)

    return result


def get_risk_predictions(db: Session, zone_id: str | None = None, user_email: str | None = None):
    settings = get_event_settings_query(db, user_email)
    result = []

    if settings and settings.cctv_locations:
        for index, location in enumerate(settings.cctv_locations, start=1):
            current_zone_id = str(index)
            candidate_zone_ids = get_cctv_candidate_zone_ids(index)

            if zone_id is not None and zone_id not in candidate_zone_ids:
                continue

            cctv_name = get_configured_cctv_name(location)

            if not cctv_name:
                continue

            sector = (
                settings.place_names[index - 1]
                if index - 1 < len(settings.place_names) and settings.place_names[index - 1]
                else cctv_name
            )
            prediction = crowd_predictor.get_zone_prediction_for_candidates(candidate_zone_ids)
            values = crowd_predictor.build_app_values(prediction)
            level, progress, time = crowd_predictor.get_app_prediction_level(values)

            if prediction and prediction.get("status") == "collecting":
                time = "collecting"
                progress = min(progress, 10)

            result.append({
                "id": current_zone_id,
                "zone_id": current_zone_id,
                "sector": sector,
                "time": time,
                "level": level,
                "progress": progress,
                "icon": get_prediction_icon(values),
                "values": values,
            })

    result.sort(key=lambda item: item["progress"], reverse=True)

    return result


def format_incident_duration(seconds: int):
    minutes = seconds // 60
    remain_seconds = seconds % 60

    if minutes > 0:
        return f"{minutes}분 {remain_seconds:02d}초"

    return f"{remain_seconds}초"


def get_incident_video_url_for_owner(owner_email: str | None, zone_id: str | None):
    live_video_urls = get_live_video_urls_for_owner(owner_email)

    if not live_video_urls or not zone_id:
        return None

    for index in range(1, 27):
        if zone_id in get_cctv_candidate_zone_ids(index):
            return live_video_urls.get(str(index))

    return None


def get_incident_display_labels(db: Session, zone_id: str | None, owner_email: str | None = None):
    settings = get_event_settings_query(db, owner_email) if owner_email else None

    if settings and zone_id:
        for index, location in enumerate(settings.cctv_locations or [], start=1):
            if zone_id not in get_cctv_candidate_zone_ids(index):
                continue

            cctv_name = get_configured_cctv_name(location)
            place_name = (
                settings.place_names[index - 1]
                if index - 1 < len(settings.place_names or []) and settings.place_names[index - 1]
                else ""
            )

            if cctv_name or place_name:
                return {
                    "gate": cctv_name or place_name or f"{zone_id} 구역",
                    "sector": place_name or cctv_name or get_zone_display_name(db, zone_id),
                }

    return {
        "gate": incident_gate_fallback(zone_id),
        "sector": get_zone_display_name(db, zone_id) if zone_id else "",
    }


def incident_gate_fallback(zone_id: str | None):
    return f"{zone_id} 구역" if zone_id else ""


def incident_to_response(db: Session, incident: Incident, owner_email: str | None = None):
    stats = (
        db.query(IncidentStat)
        .filter(IncidentStat.incident_id == incident.id)
        .order_by(IncidentStat.recorded_at.asc())
        .all()
    )

    started_at = incident.started_at or incident.created_at or datetime.now()
    duration_seconds = incident.duration_seconds

    if incident.resolved == 0:
        duration_seconds = max(0, round((datetime.now() - started_at).total_seconds()))

    labels = get_incident_display_labels(db, incident.zone_id, owner_email)

    return {
        "id": str(incident.id),
        "zone_id": incident.zone_id,
        "time": started_at.strftime("%H:%M"),
        "date": started_at.strftime("%Y.%m.%d"),
        "sector": labels["sector"] or incident.sector,
        "gate": labels["gate"] or incident.gate,
        "level": incident.level,
        "density": incident.peak_density,
        "duration": format_incident_duration(duration_seconds),
        "description": incident.description,
        "image": incident.thumbnail_url or "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=1200&auto=format&fit=crop",
        "videoUrl": incident.video_url,
        "stats": [
            {
                "time": (stat.recorded_at or started_at).strftime("%H:%M"),
                "density": stat.density,
                "speedChange": stat.speed_change,
            }
            for stat in stats
        ],
    }


def get_configured_incident_zone_ids(db: Session, user_email: str | None = None):
    settings = get_event_settings_query(db, user_email) if user_email else None

    if settings is None or not settings.cctv_locations:
        return None

    zone_ids = []

    for index, location in enumerate(settings.cctv_locations, start=1):
        place_name = (
            settings.place_names[index - 1]
            if index - 1 < len(settings.place_names) and settings.place_names[index - 1]
            else ""
        )

        if get_configured_cctv_name(location) or place_name:
            zone_ids.extend(get_cctv_candidate_zone_ids(index))

    return zone_ids


def get_incidents(db: Session, date: str | None = None, q: str | None = None, user_email: str | None = None):
    close_stale_open_incidents(db)
    db.commit()

    query = db.query(Incident)
    configured_zone_ids = get_configured_incident_zone_ids(db, user_email)

    if user_email and configured_zone_ids is not None:
        if not configured_zone_ids:
            return []

        query = query.filter(Incident.zone_id.in_(configured_zone_ids))

    incidents = query.order_by(Incident.started_at.desc()).all()
    result = [incident_to_response(db, incident, user_email) for incident in incidents]

    if date:
        normalized_date = date.replace("-", ".")
        result = [incident for incident in result if incident["date"] == normalized_date]

    if q:
        keyword = q.lower()
        result = [
            incident
            for incident in result
            if keyword in incident["sector"].lower()
            or keyword in incident["gate"].lower()
            or keyword in incident["description"].lower()
        ]

    return result


def get_incident(db: Session, incident_id: int):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()

    if incident is None:
        return None

    return incident_to_response(db, incident)


def get_incident_video_url(db: Session, incident_id: int):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()

    if incident is None:
        return None

    return {
        "incident_id": incident.id,
        "video_url": incident.video_url,
    }

def risk_level_to_number(risk_level: str | None) -> int:
    if risk_level == "danger":
        return 3
    elif risk_level in ["warning", "caution"]:
        return 2
    elif risk_level == "safe":
        return 1
    return 1


def upsert_staffing(db: Session, data):
    staffing = (
        db.query(ZoneStaffing)
        .filter(ZoneStaffing.zone_id == data.zone_id)
        .first()
    )

    if staffing:
        staffing.current_staff = data.current_staff
    else:
        staffing = ZoneStaffing(
            zone_id=data.zone_id,
            current_staff=data.current_staff
        )
        db.add(staffing)

    db.commit()
    db.refresh(staffing)
    return staffing


def get_all_staffing(db: Session):
    return db.query(ZoneStaffing).order_by(ZoneStaffing.zone_id.asc()).all()


def get_zone_name(db: Session, zone_id: str | None):
    if zone_id is None:
        return None

    zone = db.query(Zone).filter(Zone.zone_id == zone_id).first()

    return zone.zone_name if zone else zone_id


def staff_to_response(db: Session, staff: Staff):
    assignment = (
        db.query(StaffAssignment)
        .filter(StaffAssignment.staff_id == staff.id)
        .order_by(StaffAssignment.id.desc())
        .first()
    )

    zone_id = assignment.zone_id if assignment else None

    return {
        "id": staff.id,
        "name": staff.name,
        "role": staff.role,
        "phone": staff.phone,
        "email": staff.email,
        "status": staff.status,
        "zone_id": zone_id,
        "sector": get_zone_name(db, zone_id),
        "created_at": staff.created_at,
        "updated_at": staff.updated_at,
    }


def sync_zone_staffing_count(db: Session, zone_id: str):
    count = (
        db.query(StaffAssignment)
        .filter(StaffAssignment.zone_id == zone_id)
        .count()
    )

    staffing = (
        db.query(ZoneStaffing)
        .filter(ZoneStaffing.zone_id == zone_id)
        .first()
    )

    if staffing:
        staffing.current_staff = count
    else:
        db.add(ZoneStaffing(zone_id=zone_id, current_staff=count))


def get_staff_query(db: Session, staff_id: int | None = None, owner_email: str | None = None):
    query = db.query(Staff)

    if staff_id is not None:
        query = query.filter(Staff.id == staff_id)

    normalized_owner_email = normalize_owner_email(owner_email)
    if normalized_owner_email:
        query = query.filter(func.lower(Staff.owner_email) == normalized_owner_email)

    return query


def get_all_staff(db: Session, owner_email: str | None = None):
    query = db.query(Staff)
    normalized_owner_email = normalize_owner_email(owner_email)

    if normalized_owner_email:
        query = query.filter(func.lower(Staff.owner_email) == normalized_owner_email)

    staff_members = query.order_by(Staff.id.asc()).all()

    return [staff_to_response(db, staff) for staff in staff_members]


def create_staff(db: Session, data, owner_email: str | None = None):
    normalized_owner_email = normalize_owner_email(owner_email)
    staff = Staff(
        name=data.name,
        role=data.role,
        phone=data.phone,
        email=data.email,
        status="active",
        owner_email=normalized_owner_email,
    )

    db.add(staff)
    db.flush()

    if data.zone_id:
        db.add(StaffAssignment(staff_id=staff.id, zone_id=data.zone_id))
        sync_zone_staffing_count(db, data.zone_id)

    db.commit()
    db.refresh(staff)

    return staff_to_response(db, staff)


def update_staff(db: Session, staff_id: int, data, owner_email: str | None = None):
    staff = get_staff_query(db, staff_id, owner_email).first()

    if staff is None:
        return None

    if data.name is not None:
        staff.name = data.name
    if data.role is not None:
        staff.role = data.role
    if data.phone is not None:
        staff.phone = data.phone
    if data.email is not None:
        staff.email = data.email
    if data.status is not None:
        staff.status = data.status

    if data.zone_id is not None:
        previous_assignment = (
            db.query(StaffAssignment)
            .filter(StaffAssignment.staff_id == staff.id)
            .order_by(StaffAssignment.id.desc())
            .first()
        )
        previous_zone_id = previous_assignment.zone_id if previous_assignment else None

        if previous_assignment:
            previous_assignment.zone_id = data.zone_id
        else:
            db.add(StaffAssignment(staff_id=staff.id, zone_id=data.zone_id))

        if previous_zone_id:
            sync_zone_staffing_count(db, previous_zone_id)
        sync_zone_staffing_count(db, data.zone_id)

    db.commit()
    db.refresh(staff)

    return staff_to_response(db, staff)


def delete_staff(db: Session, staff_id: int, owner_email: str | None = None):
    staff = get_staff_query(db, staff_id, owner_email).first()

    if staff is None:
        return None

    assignments = (
        db.query(StaffAssignment)
        .filter(StaffAssignment.staff_id == staff.id)
        .all()
    )
    affected_zone_ids = {assignment.zone_id for assignment in assignments}

    for assignment in assignments:
        db.delete(assignment)

    db.delete(staff)

    for zone_id in affected_zone_ids:
        sync_zone_staffing_count(db, zone_id)

    db.commit()

    return {"deleted": True}


def assign_staff_to_zone(db: Session, staff_id: int, zone_id: str, owner_email: str | None = None):
    staff = get_staff_query(db, staff_id, owner_email).first()

    if staff is None:
        return None

    assignment = (
        db.query(StaffAssignment)
        .filter(StaffAssignment.staff_id == staff_id)
        .order_by(StaffAssignment.id.desc())
        .first()
    )

    previous_zone_id = assignment.zone_id if assignment else None

    if assignment:
        assignment.zone_id = zone_id
    else:
        assignment = StaffAssignment(staff_id=staff_id, zone_id=zone_id)
        db.add(assignment)

    if previous_zone_id:
        sync_zone_staffing_count(db, previous_zone_id)
    sync_zone_staffing_count(db, zone_id)

    db.commit()
    db.refresh(assignment)

    return assignment


def remove_staff_from_zone(db: Session, staff_id: int, zone_id: str, owner_email: str | None = None):
    staff = get_staff_query(db, staff_id, owner_email).first()

    if staff is None:
        return None

    assignment = (
        db.query(StaffAssignment)
        .filter(StaffAssignment.staff_id == staff_id)
        .filter(StaffAssignment.zone_id == zone_id)
        .first()
    )

    if assignment is None:
        return None

    db.delete(assignment)
    db.flush()
    sync_zone_staffing_count(db, zone_id)
    db.commit()

    return {"deleted": True}


def upsert_device_token(db: Session, data):
    device_token = db.query(DeviceToken).filter(DeviceToken.token == data.token).first()

    if device_token:
        device_token.device_id = data.device_id
        device_token.platform = data.platform
        device_token.user_id = data.user_id
        device_token.min_risk_level = data.min_risk_level
    else:
        device_token = DeviceToken(
            token=data.token,
            device_id=data.device_id,
            platform=data.platform,
            user_id=data.user_id,
            min_risk_level=data.min_risk_level
        )
        db.add(device_token)

    db.commit()
    db.refresh(device_token)

    return device_token


def public_device_to_response(device_token: DeviceToken):
    return {
        "deviceId": device_token.device_id or device_token.token,
        "pushToken": device_token.token,
        "platform": device_token.platform,
        "minRiskLevel": device_token.min_risk_level,
        "updated_at": device_token.updated_at,
    }


def upsert_public_device_token(db: Session, data):
    allowed_levels = {"warning", "danger"}

    if data.minRiskLevel not in allowed_levels:
        return "invalid_level"

    push_token = data.pushToken or data.deviceId
    device_token = (
        db.query(DeviceToken)
        .filter(DeviceToken.device_id == data.deviceId)
        .first()
    )

    if device_token is None:
        device_token = db.query(DeviceToken).filter(DeviceToken.token == push_token).first()

    if device_token:
        device_token.token = push_token
        device_token.device_id = data.deviceId
        if data.platform:
            device_token.platform = data.platform
    else:
        device_token = DeviceToken(
            token=push_token,
            device_id=data.deviceId,
            platform=data.platform,
            min_risk_level=data.minRiskLevel,
        )
        db.add(device_token)

    db.commit()
    db.refresh(device_token)

    return public_device_to_response(device_token)


def get_public_notification_settings(db: Session, device_id: str):
    device_token = (
        db.query(DeviceToken)
        .filter(DeviceToken.device_id == device_id)
        .first()
    )

    if device_token is None:
        return None

    return public_device_to_response(device_token)


def update_public_notification_settings(db: Session, device_id: str, data):
    allowed_levels = {"warning", "danger"}

    if data.minRiskLevel not in allowed_levels:
        return "invalid_level"

    device_token = (
        db.query(DeviceToken)
        .filter(DeviceToken.device_id == device_id)
        .first()
    )

    if device_token is None:
        device_token = DeviceToken(
            token=data.pushToken or device_id,
            device_id=device_id,
            min_risk_level=data.minRiskLevel,
        )
        db.add(device_token)
    else:
        if data.pushToken:
            device_token.token = data.pushToken
        device_token.min_risk_level = data.minRiskLevel

    db.commit()
    db.refresh(device_token)

    return public_device_to_response(device_token)


def create_zone_distance(db: Session, data):
    distance = ZoneDistance(
        from_zone_id=data.from_zone_id,
        to_zone_id=data.to_zone_id,
        distance_m=data.distance_m
    )

    db.add(distance)
    db.commit()
    db.refresh(distance)

    return distance


def get_default_event_settings():
    return {
        "eventRange": "인하대학교 축제 구역",
        "searchPlace": "인하대학교",
        "placeDisplayName": "인하대학교 축제",
        "mapUrl": "/admin-map",
        "cctvLocations": [
            "백년관 버정길 CCTV",
            "자연과학대 앞 CCTV",
            "공대 흡연부스 옆 CCTV",
            "인경관 주차장 입구 CCTV",
            "공대-백년관 사이 CCTV",
            "백년관 잔디구장 CCTV",
        ],
        "placeNames": [
            "백년관 버정길",
            "자연과학대 앞",
            "공대 흡연부스 옆",
            "인경관 주차장 입구",
            "공대-백년관 사이",
            "백년관 잔디구장",
        ],
        "roadAngles": ["90", "75", "60", "80", "70", "85"],
        "roadAreas": ["120", "180", "145", "160", "135", "200"],
    }


def event_settings_to_response(settings: EventSettings):
    return {
        "id": settings.id,
        "eventRange": settings.event_range,
        "searchPlace": settings.search_place,
        "placeDisplayName": settings.place_display_name,
        "mapUrl": settings.map_url or "/admin-map",
        "cctvLocations": settings.cctv_locations,
        "placeNames": settings.place_names,
        "roadAngles": settings.road_angles,
        "roadAreas": settings.road_areas,
        "created_at": settings.created_at,
        "updated_at": settings.updated_at,
    }


def normalize_owner_email(user_email: str | None) -> str | None:
    if user_email is None:
        return None

    value = user_email.strip().lower()
    return value or None


def get_event_settings_query(db: Session, user_email: str | None = None):
    owner_email = normalize_owner_email(user_email)

    if owner_email:
        return (
            db.query(EventSettings)
            .filter(func.lower(EventSettings.owner_email) == owner_email)
            .order_by(EventSettings.id.asc())
            .first()
        )

    return (
        db.query(EventSettings)
        .filter(EventSettings.owner_email.is_(None))
        .order_by(EventSettings.id.asc())
        .first()
    )


def get_public_event_settings_query(db: Session, user_email: str | None = None):
    owner_email = normalize_owner_email(user_email)
    settings = get_event_settings_query(db, owner_email) if owner_email else None

    if has_public_cctv_settings(settings):
        return settings

    if owner_email:
        return settings

    candidates = (
        db.query(EventSettings)
        .filter(EventSettings.owner_email.isnot(None))
        .order_by(EventSettings.updated_at.desc(), EventSettings.id.desc())
        .all()
    )

    for candidate in candidates:
        if has_public_cctv_settings(candidate):
            return candidate

    return get_event_settings_query(db, None)


def has_public_cctv_settings(settings: EventSettings | None) -> bool:
    if settings is None or not settings.cctv_locations:
        return False

    return any(
        bool((location or "").strip()) and not re.match(r"^\d+번\s*CCTV$", (location or "").strip())
        for location in settings.cctv_locations
    )


def get_current_event_settings(db: Session, user_email: str | None = None):
    settings = get_event_settings_query(db, user_email)

    if settings:
        return event_settings_to_response(settings)

    defaults = get_default_event_settings()
    settings = EventSettings(
        owner_email=normalize_owner_email(user_email),
        event_range=defaults["eventRange"],
        search_place=defaults["searchPlace"],
        place_display_name=defaults["placeDisplayName"],
        map_url=defaults["mapUrl"],
        cctv_locations=defaults["cctvLocations"],
        place_names=defaults["placeNames"],
        road_angles=defaults["roadAngles"],
        road_areas=defaults["roadAreas"],
    )

    db.add(settings)
    db.commit()
    db.refresh(settings)

    return event_settings_to_response(settings)


def upsert_event_settings(db: Session, data, user_email: str | None = None):
    owner_email = normalize_owner_email(user_email)
    settings = get_event_settings_query(db, owner_email) if owner_email else get_event_settings_query(db, None)

    if owner_email and settings and settings.owner_email is None:
        settings = None

    if settings is None:
        settings = EventSettings(
            owner_email=owner_email,
            event_range=data.eventRange,
            search_place=data.searchPlace,
            place_display_name=data.placeDisplayName,
            map_url=data.mapUrl,
            cctv_locations=data.cctvLocations,
            place_names=data.placeNames,
            road_angles=data.roadAngles,
            road_areas=data.roadAreas,
        )
        db.add(settings)
    else:
        settings.event_range = data.eventRange
        settings.search_place = data.searchPlace
        settings.place_display_name = data.placeDisplayName
        settings.map_url = data.mapUrl
        settings.cctv_locations = data.cctvLocations
        settings.place_names = data.placeNames
        settings.road_angles = data.roadAngles
        settings.road_areas = data.roadAreas

    db.commit()
    db.refresh(settings)

    if user_email:
        user = db.query(User).filter(func.lower(User.email) == normalize_owner_email(user_email)).first()

        if user:
            user.onboarding_completed = 1
            db.commit()

    return event_settings_to_response(settings)


def get_distance_between_zones(db: Session, from_zone_id: str, to_zone_id: str) -> float:
    distance = (
        db.query(ZoneDistance)
        .filter(ZoneDistance.from_zone_id == from_zone_id)
        .filter(ZoneDistance.to_zone_id == to_zone_id)
        .first()
    )

    if distance:
        return distance.distance_m

    reverse_distance = (
        db.query(ZoneDistance)
        .filter(ZoneDistance.from_zone_id == to_zone_id)
        .filter(ZoneDistance.to_zone_id == from_zone_id)
        .first()
    )

    if reverse_distance:
        return reverse_distance.distance_m

    return 999999.0


def get_min_required_staff(risk_level: str) -> int:
    if risk_level == "danger":
        return 2
    elif risk_level in ["warning", "caution"]:
        return 1
    else:
        return 0


def calculate_relocation_cost(
    distance_m: float,
    current_risk_number: int,
    predicted_risk_number: int,
    w_dist: float = 1,
    w_danger: float = 3,
    w_predict: float = 2
) -> float:
    return (
        distance_m * w_dist
        - current_risk_number * w_danger
        - predicted_risk_number * w_predict
    )


def recommend_staff_relocation(db: Session):
    zones = db.query(Zone).order_by(Zone.zone_id.asc()).all()

    supply_zones = []
    demand_zones = []

    for zone in zones:
        latest_log = get_latest_by_zone(db, zone.zone_id)

        if latest_log:
            risk_level = latest_log.risk_level
            current_risk_number = risk_level_to_number(risk_level)

            if latest_log.risk_score is not None:
                predicted_risk_number = max(1, min(3, round(latest_log.risk_score * 3)))
            else:
                predicted_risk_number = current_risk_number
        else:
            risk_level = "safe"
            current_risk_number = 1
            predicted_risk_number = 1

        staffing = (
            db.query(ZoneStaffing)
            .filter(ZoneStaffing.zone_id == zone.zone_id)
            .first()
        )

        current_staff = staffing.current_staff if staffing else 0
        min_required_staff = get_min_required_staff(risk_level)

        diff = current_staff - min_required_staff

        if diff > 0:
            supply_zones.append({
                "zone_id": zone.zone_id,
                "supply": diff
            })
        elif diff < 0:
            demand_zones.append({
                "zone_id": zone.zone_id,
                "demand": abs(diff),
                "current_risk_number": current_risk_number,
                "predicted_risk_number": predicted_risk_number
            })

    total_supply = sum(zone["supply"] for zone in supply_zones)
    total_demand = sum(zone["demand"] for zone in demand_zones)
    flow_amount = min(total_supply, total_demand)

    if flow_amount == 0:
        return {
            "total_supply": total_supply,
            "total_demand": total_demand,
            "flow_amount": flow_amount,
            "shortage": max(0, total_demand - total_supply),
            "recommendations": [],
            "message": "재배치가 필요하지 않습니다."
        }

    possible_moves = []

    for supply in supply_zones:
        for demand in demand_zones:
            distance_m = get_distance_between_zones(
                db,
                supply["zone_id"],
                demand["zone_id"]
            )

            cost = calculate_relocation_cost(
                distance_m=distance_m,
                current_risk_number=demand["current_risk_number"],
                predicted_risk_number=demand["predicted_risk_number"]
            )

            possible_moves.append({
                "from_zone_id": supply["zone_id"],
                "to_zone_id": demand["zone_id"],
                "distance_m": distance_m,
                "cost": cost
            })

    possible_moves.sort(key=lambda x: x["cost"])

    remaining_supply = {
        zone["zone_id"]: zone["supply"]
        for zone in supply_zones
    }

    remaining_demand = {
        zone["zone_id"]: zone["demand"]
        for zone in demand_zones
    }

    recommendations = []

    for move in possible_moves:
        from_zone_id = move["from_zone_id"]
        to_zone_id = move["to_zone_id"]

        available_supply = remaining_supply[from_zone_id]
        needed_demand = remaining_demand[to_zone_id]

        if available_supply <= 0 or needed_demand <= 0:
            continue

        move_staff_count = min(available_supply, needed_demand)

        recommendations.append({
            "from_zone_id": from_zone_id,
            "to_zone_id": to_zone_id,
            "move_staff_count": move_staff_count,
            "distance_m": move["distance_m"],
            "cost": round(move["cost"], 2)
        })

        remaining_supply[from_zone_id] -= move_staff_count
        remaining_demand[to_zone_id] -= move_staff_count

    shortage = max(0, total_demand - total_supply)

    if shortage > 0:
        message = f"재배치 추천 완료. 단, {shortage}명의 추가 인력이 부족합니다."
    else:
        message = "재배치 추천 완료. 모든 수요를 충족할 수 있습니다."

    return {
        "total_supply": total_supply,
        "total_demand": total_demand,
        "flow_amount": flow_amount,
        "shortage": shortage,
        "recommendations": recommendations,
        "message": message
    }


W_DIST = 1
W_DANGER = 3
W_PREDICT = 2
MIN_STAFF_BY_DANGER = {1: 0, 2: 1, 3: 2}


def calculate_relocation_cost(
    distance_m: float,
    current_risk_number: int,
    predicted_risk_number: int,
    w_dist: float = W_DIST,
    w_danger: float = W_DANGER,
    w_predict: float = W_PREDICT
) -> float:
    return (
        distance_m * w_dist
        - current_risk_number * w_danger
        - predicted_risk_number * w_predict
    )


def get_relocation_zone_definitions(db: Session, user_email: str | None = None):
    settings = get_event_settings_query(db, user_email)
    zones = []

    if settings and settings.cctv_locations:
        for index, location in enumerate(settings.cctv_locations, start=1):
            name = get_configured_cctv_name(location)

            if not name:
                continue

            zone_id = str(index)
            zones.append({
                "zone_id": zone_id,
                "zone_name": (
                    settings.place_names[index - 1]
                    if index - 1 < len(settings.place_names) and settings.place_names[index - 1]
                    else name
                ),
                "candidate_zone_ids": [
                    *get_cctv_candidate_zone_ids(index),
                ],
            })

    if zones:
        return zones

    return [
        {
            "zone_id": zone.zone_id,
            "zone_name": zone.zone_name,
            "candidate_zone_ids": [zone.zone_id],
        }
        for zone in db.query(Zone).order_by(Zone.zone_id.asc()).all()
    ]


def get_latest_by_candidate_zone_ids(db: Session, candidate_zone_ids: list[str]):
    return (
        db.query(AnalysisLog)
        .filter(AnalysisLog.zone_id.in_(candidate_zone_ids))
        .order_by(AnalysisLog.created_at.desc(), AnalysisLog.id.desc())
        .first()
    )


def get_staffing_by_candidate_zone_ids(db: Session, candidate_zone_ids: list[str]) -> int:
    staffing = (
        db.query(ZoneStaffing)
        .filter(ZoneStaffing.zone_id.in_(candidate_zone_ids))
        .order_by(ZoneStaffing.id.asc())
        .first()
    )

    return staffing.current_staff if staffing else 0


def get_predicted_risk_number(candidate_zone_ids: list[str], fallback: int) -> int:
    prediction = crowd_predictor.get_zone_prediction_for_candidates(candidate_zone_ids)

    if prediction is None:
        return fallback

    values = crowd_predictor.build_app_values(prediction)
    level, _, _ = crowd_predictor.get_app_prediction_level(values)

    if level == "critical":
        return 3
    if level == "warning":
        return 2
    return 1


def get_supply_demand(zones: dict) -> tuple[dict, dict]:
    supply_zones = {}
    demand_zones = {}

    for zone_id, info in zones.items():
        min_staff = MIN_STAFF_BY_DANGER[info["danger"]]
        diff = info["staff"] - min_staff

        if diff > 0:
            supply_zones[zone_id] = diff
        elif diff < 0:
            demand_zones[zone_id] = abs(diff)

    return supply_zones, demand_zones


def build_flow_graph(zones: dict, distances: dict, supply_zones: dict, demand_zones: dict):
    graph = nx.DiGraph()
    total_supply = sum(supply_zones.values())
    total_demand = sum(demand_zones.values())
    flow_amount = min(total_supply, total_demand)

    graph.add_node("source", demand=-flow_amount)
    graph.add_node("sink", demand=flow_amount)

    for zone_id, supply in supply_zones.items():
        graph.add_edge("source", zone_id, capacity=supply, weight=0)

    for zone_id, demand in demand_zones.items():
        graph.add_edge(zone_id, "sink", capacity=demand, weight=0)

    for supply_zone_id, supply in supply_zones.items():
        for demand_zone_id in demand_zones:
            distance_m = distances.get((supply_zone_id, demand_zone_id), 999999.0)
            cost = calculate_relocation_cost(
                distance_m=distance_m,
                current_risk_number=zones[demand_zone_id]["danger"],
                predicted_risk_number=zones[demand_zone_id]["predict"],
            )
            graph.add_edge(
                supply_zone_id,
                demand_zone_id,
                capacity=supply,
                weight=int(round(cost)),
                distance_m=distance_m,
                raw_cost=cost,
            )

    return graph, total_supply, total_demand, flow_amount


def recommend_staff_relocation(db: Session, user_email: str | None = None):
    zone_definitions = get_relocation_zone_definitions(db, user_email)
    zones = {}

    for zone in zone_definitions:
        latest_log = get_latest_by_candidate_zone_ids(db, zone["candidate_zone_ids"])
        latest_log = latest_log if is_live_analysis_log(latest_log) else None
        current_risk_number = risk_level_to_number(get_live_log_risk_level(latest_log) or "safe")
        predicted_risk_number = get_predicted_risk_number(
            zone["candidate_zone_ids"],
            current_risk_number,
        )

        zones[zone["zone_id"]] = {
            "danger": current_risk_number,
            "predict": predicted_risk_number,
            "staff": get_staffing_by_candidate_zone_ids(db, zone["candidate_zone_ids"]),
            "name": zone["zone_name"],
        }

    supply_zones, demand_zones = get_supply_demand(zones)
    total_supply = sum(supply_zones.values())
    total_demand = sum(demand_zones.values())
    flow_amount = min(total_supply, total_demand)

    if flow_amount == 0:
        return {
            "total_supply": total_supply,
            "total_demand": total_demand,
            "flow_amount": flow_amount,
            "shortage": max(0, total_demand - total_supply),
            "recommendations": [],
            "message": "재배치가 필요하지 않습니다."
        }

    distances = {}

    for supply_zone_id in supply_zones:
        for demand_zone_id in demand_zones:
            distances[(supply_zone_id, demand_zone_id)] = get_distance_between_zones(
                db,
                supply_zone_id,
                demand_zone_id,
            )

    graph, _, _, _ = build_flow_graph(zones, distances, supply_zones, demand_zones)

    try:
        flow = nx.min_cost_flow(graph)
    except nx.NetworkXUnfeasible:
        return {
            "total_supply": total_supply,
            "total_demand": total_demand,
            "flow_amount": 0,
            "shortage": max(0, total_demand - total_supply),
            "recommendations": [],
            "message": "최적 인력 재배치 계산에 실패했습니다."
        }

    recommendations = []

    for supply_zone_id in supply_zones:
        for demand_zone_id in demand_zones:
            move_staff_count = flow.get(supply_zone_id, {}).get(demand_zone_id, 0)

            if move_staff_count <= 0:
                continue

            edge = graph[supply_zone_id][demand_zone_id]
            recommendations.append({
                "from_zone_id": supply_zone_id,
                "to_zone_id": demand_zone_id,
                "move_staff_count": move_staff_count,
                "distance_m": edge["distance_m"],
                "cost": round(edge["raw_cost"], 2)
            })

    recommendations.sort(key=lambda item: item["cost"])
    shortage = max(0, total_demand - total_supply)

    if shortage > 0:
        message = f"재배치 추천 완료. 총 {shortage}명의 추가 인력이 부족합니다."
    else:
        message = "재배치 추천 완료. 모든 수요를 충족할 수 있습니다."

    return {
        "total_supply": total_supply,
        "total_demand": total_demand,
        "flow_amount": flow_amount,
        "shortage": shortage,
        "recommendations": recommendations,
        "message": message
    }


def apply_relocation_recommendation(db: Session, recommendation_id: int):
    relocation = recommend_staff_relocation(db)
    recommendations = relocation["recommendations"]
    index = recommendation_id - 1

    if index < 0 or index >= len(recommendations):
        return None

    recommendation = recommendations[index]
    from_zone_id = recommendation["from_zone_id"]
    to_zone_id = recommendation["to_zone_id"]
    requested_count = recommendation["move_staff_count"]

    assignments = (
        db.query(StaffAssignment)
        .filter(StaffAssignment.zone_id == from_zone_id)
        .order_by(StaffAssignment.id.asc())
        .limit(requested_count)
        .all()
    )

    moved_staff_ids = []

    for assignment in assignments:
        assignment.zone_id = to_zone_id
        moved_staff_ids.append(assignment.staff_id)

    sync_zone_staffing_count(db, from_zone_id)
    sync_zone_staffing_count(db, to_zone_id)

    application = RelocationApplication(
        recommendation_id=recommendation_id,
        from_zone_id=from_zone_id,
        to_zone_id=to_zone_id,
        requested_staff_count=requested_count,
        moved_staff_count=len(moved_staff_ids),
        moved_staff_ids=moved_staff_ids,
        status="applied" if moved_staff_ids else "no_staff_available"
    )

    db.add(application)
    db.commit()

    return {
        "recommendation_id": recommendation_id,
        "from_zone_id": from_zone_id,
        "to_zone_id": to_zone_id,
        "requested_staff_count": requested_count,
        "moved_staff_count": len(moved_staff_ids),
        "moved_staff_ids": moved_staff_ids,
        "status": application.status,
        "message": "재배치가 적용되었습니다." if moved_staff_ids else "이동할 수 있는 직원이 없습니다."
    }
def get_default_event_settings():
    return {
        "eventRange": "",
        "searchPlace": "",
        "placeDisplayName": "",
        "mapUrl": "/admin-map",
        "cctvLocations": [],
        "placeNames": [],
        "roadAngles": [],
        "roadAreas": [],
    }
