from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import RedirectResponse
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from typing import List
import os
import json
import re
import shutil
import subprocess
import glob
import urllib.parse
import urllib.request
import uuid
from datetime import datetime

from database import engine, Base, get_db
from schemas import (
    AuthSignupRequest,
    AuthLoginRequest,
    AuthOAuthRequest,
    AuthOAuthCallbackRequest,
    AuthOAuthConfigResponse,
    AuthResponse,
    InviteVerifyRequest,
    InviteVerifyResponse,
    InviteSettingsResponse,
    InviteSettingsUpdate,
    InviteJoinRequest,
    AnalysisCreate,
    AnalysisBulkCreate,
    AnalysisResponse,
    CrowdDataInput,
    CrowdDataBulkInput,
    AlertCreate,
    AlertResponse,
    EmergencyAlertResponse,
    PublicAlertResponse,
    VisitorAlertStateUpdate,
    VisitorReportCreate,
    VisitorReportResponse,
    VisitorReportStatusUpdate,
    MissingChildCreate,
    PublicMissingChildResponse,
    FestivalInfoCreate,
    FestivalInfoResponse,
    NoticeCreate,
    NoticeUpdate,
    NoticeResponse,
    PublicAnnouncementResponse,
    ZoneCreate,
    ZoneResponse,
    ZoneLiveResponse,
    PublicZoneLiveResponse,
    ZoneMapResponse,
    ZoneHeatmapResponse,
    ZoneHistoryResponse,
    RiskPredictionResponse,
    IncidentResponse,
    IncidentVideoResponse,
    StaffingCreate,
    StaffingResponse,
    StaffCreate,
    StaffUpdate,
    StaffResponse,
    StaffAssignmentCreate,
    StaffAssignmentResponse,
    DeviceTokenCreate,
    DeviceTokenResponse,
    PublicDeviceTokenCreate,
    PublicDeviceTokenResponse,
    PublicNotificationSettingsUpdate,
    ZoneDistanceCreate,
    EventSettingsCreate,
    EventSettingsResponse,
    PlaceSearchResponse,
    RelocationResponse,
    RelocationApplyResponse
)

from crud import (
    signup_user,
    login_user,
    oauth_login_user,
    get_oauth_config,
    oauth_callback_user,
    verify_invite_code,
    verify_invite_code_for_role,
    get_staff_invite_settings,
    upsert_staff_invite_settings,
    get_visitor_invite_settings,
    upsert_visitor_invite_settings,
    join_with_invite_code,
    create_analysis_log,
    get_all_analysis_logs,
    get_latest_by_zone,
    get_current_status_all_zones,
    get_zone_history,
    get_all_alerts,
    create_manual_alerts,
    get_alert_history,
    mark_alert_as_read,
    get_unread_alerts,
    get_public_alerts,
    mark_public_alert_read,
    pin_public_alert,
    delete_public_alert,
    create_visitor_report,
    get_visitor_reports,
    update_visitor_report_status,
    create_missing_child,
    get_public_missing_children,
    get_public_missing_child,
    get_current_festival_info,
    upsert_festival_info,
    get_all_notices,
    get_public_announcements,
    create_notice,
    update_notice,
    delete_notice,
    create_zone,
    get_all_zones,
    get_live_zones_for_frontend,
    get_public_live_zones,
    get_map_current_status,
    get_zone_heatmap_data,
    get_risk_predictions,
    get_incidents,
    get_incident,
    get_incident_video_url,
    upsert_staffing,
    get_all_staffing,
    get_all_staff,
    create_staff,
    update_staff,
    delete_staff,
    assign_staff_to_zone,
    remove_staff_from_zone,
    upsert_device_token,
    upsert_public_device_token,
    get_public_notification_settings,
    update_public_notification_settings,
    create_zone_distance,
    get_current_event_settings,
    upsert_event_settings,
    recommend_staff_relocation,
    apply_relocation_recommendation
)

import crowd_predictor
import models

Base.metadata.create_all(bind=engine)

with engine.begin() as connection:
    connection.execute(text("DELETE FROM invites WHERE code = 'SAFEPATH'"))
    connection.execute(text("DELETE FROM invites WHERE code = 'STAFF2026' AND owner_email IS NULL"))


def ensure_runtime_columns():
    inspector = inspect(engine)
    zone_columns = {column["name"] for column in inspector.get_columns("zones")}
    device_columns = {column["name"] for column in inspector.get_columns("device_tokens")}
    event_columns = {column["name"] for column in inspector.get_columns("event_settings")}
    invite_columns = {column["name"] for column in inspector.get_columns("invites")}
    staff_columns = {column["name"] for column in inspector.get_columns("staff")}

    with engine.begin() as connection:
        if "grid_x" not in zone_columns:
            connection.execute(text("ALTER TABLE zones ADD COLUMN grid_x FLOAT NULL"))
        if "grid_y" not in zone_columns:
            connection.execute(text("ALTER TABLE zones ADD COLUMN grid_y FLOAT NULL"))
        if "device_id" not in device_columns:
            connection.execute(text("ALTER TABLE device_tokens ADD COLUMN device_id VARCHAR(255) NULL"))
        if "min_risk_level" not in device_columns:
            connection.execute(text("ALTER TABLE device_tokens ADD COLUMN min_risk_level VARCHAR(20) NOT NULL DEFAULT 'warning'"))
        if "map_url" not in event_columns:
            connection.execute(text("ALTER TABLE event_settings ADD COLUMN map_url VARCHAR(500) NOT NULL DEFAULT '/admin-map'"))
        if "owner_email" not in event_columns:
            connection.execute(text("ALTER TABLE event_settings ADD COLUMN owner_email VARCHAR(255) NULL"))
        if "owner_email" not in invite_columns:
            connection.execute(text("ALTER TABLE invites ADD COLUMN owner_email VARCHAR(255) NULL"))
        if "owner_email" not in staff_columns:
            connection.execute(text("ALTER TABLE staff ADD COLUMN owner_email VARCHAR(255) NULL"))


ensure_runtime_columns()

app = FastAPI()
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
UPLOAD_DIR = STATIC_DIR / "uploads" / "missing-children"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
INCIDENT_RECORDING_DIR = STATIC_DIR / "incident-recordings"
INCIDENT_RECORDING_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def find_ffmpeg_executable() -> str | None:
    ffmpeg = os.getenv("FFMPEG_PATH") or shutil.which("ffmpeg")

    if ffmpeg and Path(ffmpeg).exists():
        return ffmpeg

    candidates = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
        r"C:\Users\관리자\AppData\Local\Microsoft\WinGet\Packages\*\ffmpeg.exe",
        r"C:\Users\관리자\AppData\Local\Microsoft\WinGet\Packages\*\bin\ffmpeg.exe",
        r"C:\Users\관리자\Downloads\ffmpeg-*-essentials_build\ffmpeg-*-essentials_build\bin\ffmpeg.exe",
        r"C:\Users\관리자\Downloads\ffmpeg*\bin\ffmpeg.exe",
        r"C:\Users\관리자\Desktop\ffmpeg*\bin\ffmpeg.exe",
    ]

    for pattern in candidates:
        for path in glob.glob(pattern):
            if Path(path).exists():
                return path

    return None


def convert_recording_for_ios(source_path: Path, target_path: Path) -> bool:
    """Convert OpenCV mp4 recordings into an iPhone/WebView friendly mp4."""
    ffmpeg = find_ffmpeg_executable()

    if not ffmpeg:
        print("[recording convert 실패] ffmpeg를 찾지 못했습니다. FFMPEG_PATH 또는 PATH 설정을 확인하세요.")
        return False

    command = [
        ffmpeg,
        "-y",
        "-i",
        str(source_path),
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        str(target_path),
    ]

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
            check=False,
        )
    except Exception as exc:
        print(f"[recording convert 실패] ffmpeg 실행 오류: {exc}")
        return False

    success = result.returncode == 0 and target_path.exists() and target_path.stat().st_size > 0

    if not success:
        stderr = result.stderr.decode("utf-8", errors="ignore")[-1200:]
        print(f"[recording convert 실패] returncode={result.returncode} stderr={stderr}")

    return success

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 단계에서는 전체 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Crowd Safety Backend is running"}


@app.post("/uploads/missing-child-image")
async def upload_missing_child_image(
    request: Request,
    file: UploadFile = File(...)
):
    allowed_types = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
        "image/heif": ".heif",
    }

    content_type = (file.content_type or "").lower()
    extension = allowed_types.get(content_type)

    if extension is None:
        original_suffix = Path(file.filename or "").suffix.lower()
        if original_suffix in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}:
            extension = ".jpg" if original_suffix == ".jpeg" else original_suffix
        else:
            raise HTTPException(status_code=400, detail="Only image files are allowed")

    contents = await file.read()

    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image file is too large")

    filename = f"{uuid.uuid4().hex}{extension}"
    target_path = UPLOAD_DIR / filename
    target_path.write_bytes(contents)

    base_url = str(request.base_url).rstrip("/")

    return {
        "imageUrl": f"{base_url}/static/uploads/missing-children/{filename}",
    }


@app.get("/places/search", response_model=List[PlaceSearchResponse])
def search_places(query: str):
    keyword = query.strip()

    if not keyword:
        return []

    client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
    client_secret = os.getenv("NAVER_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail="Naver place search is not configured")

    url = "https://openapi.naver.com/v1/search/local.json?" + urllib.parse.urlencode({
        "query": keyword,
        "display": 8,
        "start": 1,
        "sort": "random",
    })
    request = urllib.request.Request(url)
    request.add_header("X-Naver-Client-Id", client_id)
    request.add_header("X-Naver-Client-Secret", client_secret)

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Naver place search failed: {exc}") from exc

    results = []

    for item in payload.get("items", []):
        title = re.sub(r"<[^>]+>", "", item.get("title", "")).replace("&amp;", "&").strip()
        address = item.get("address", "").strip()
        road_address = item.get("roadAddress", "").strip()
        mapx = item.get("mapx")
        mapy = item.get("mapy")

        if not title and not address and not road_address:
            continue

        try:
            longitude = int(mapx) / 10000000
            latitude = int(mapy) / 10000000
        except (TypeError, ValueError):
            continue

        results.append({
            "title": title or road_address or address,
            "address": address,
            "roadAddress": road_address,
            "category": item.get("category", ""),
            "latitude": latitude,
            "longitude": longitude,
        })

    return results


@app.get("/admin-map", response_class=HTMLResponse)
def admin_onboarding_map():
    client_id = os.getenv("NAVER_MAP_CLIENT_ID", "").strip()

    if not client_id:
        return HTMLResponse(
            """
            <!doctype html>
            <html lang="ko">
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <style>
                  html, body { width: 100%; height: 100%; margin: 0; }
                  body {
                    display: grid;
                    place-items: center;
                    background: #eef3f5;
                    color: #111827;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    font-size: 14px;
                  }
                </style>
              </head>
              <body>네이버 지도 Client ID가 설정되지 않았습니다.</body>
            </html>
            """,
            status_code=503,
        )

    return HTMLResponse(f"""
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, #map {{
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: #eef3f5;
      }}
    </style>
    <script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId={client_id}&submodules=geocoder"></script>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const map = new naver.maps.Map('map', {{
        center: new naver.maps.LatLng(37.3396, 127.2664),
        zoom: 16,
        minZoom: 14,
        maxZoom: 20,
        scaleControl: false,
        logoControl: false,
        mapDataControl: false,
        zoomControl: false,
      }});

      let searchMarker = null;
      const cctvMarkers = {{}};

      function sendToApp(payload) {{
        if (window.ReactNativeWebView) {{
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }}
      }}

      function moveToPlace(place) {{
        const latitude = Number(place.y);
        const longitude = Number(place.x);
        const position = new naver.maps.LatLng(latitude, longitude);

        map.setCenter(position);
        map.setZoom(17);

        if (searchMarker) {{
          searchMarker.setMap(null);
        }}

        searchMarker = new naver.maps.Marker({{
          map,
          position,
        }});

        sendToApp({{
          type: 'place_search_result',
          name: place.roadAddress || place.jibunAddress || place.englishAddress || '',
          address: place.roadAddress || place.jibunAddress || '',
          latitude,
          longitude,
        }});
      }}

      window.searchPlace = function(query) {{
        const keyword = String(query || '').trim();

        if (!keyword) {{
          sendToApp({{ type: 'place_search_error', message: '검색어를 입력해주세요.' }});
          return;
        }}

        naver.maps.Service.geocode({{ query: keyword }}, function(status, response) {{
          if (status !== naver.maps.Service.Status.OK) {{
            sendToApp({{ type: 'place_search_error', message: '장소 검색에 실패했습니다.' }});
            return;
          }}

          const result = response.v2 && response.v2.addresses && response.v2.addresses[0];

          if (!result) {{
            sendToApp({{ type: 'place_search_error', message: '검색 결과가 없습니다.' }});
            return;
          }}

          moveToPlace(result);
        }});
      }};

      window.moveToCoordinates = function(place) {{
        const latitude = Number(place && place.latitude);
        const longitude = Number(place && place.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {{
          sendToApp({{ type: 'place_search_error', message: '선택한 장소의 좌표가 없습니다.' }});
          return;
        }}

        const position = new naver.maps.LatLng(latitude, longitude);

        map.setCenter(position);
        map.setZoom(17);

        if (searchMarker) {{
          searchMarker.setMap(null);
        }}

        searchMarker = new naver.maps.Marker({{
          map,
          position,
        }});

        sendToApp({{
          type: 'place_search_result',
          name: place.name || place.address || '',
          address: place.address || '',
          latitude,
          longitude,
        }});
      }};

      window.setCctvMarker = function(cctv) {{
        const index = Number(cctv && cctv.index);
        const latitude = Number(cctv && cctv.latitude);
        const longitude = Number(cctv && cctv.longitude);
        const label = String((cctv && cctv.label) || '').trim();

        if (!Number.isFinite(index) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {{
          return;
        }}

        const position = new naver.maps.LatLng(latitude, longitude);

        map.setCenter(position);
        map.setZoom(17);

        if (cctvMarkers[index]) {{
          cctvMarkers[index].setMap(null);
        }}

        cctvMarkers[index] = new naver.maps.Marker({{
          map,
          position,
          icon: {{
            content: '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">'
              + '<div style="width:34px;height:34px;border-radius:17px;background:#111827;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;box-shadow:0 8px 18px rgba(17,24,39,.28);">' + index + '</div>'
              + (label ? '<div style="max-width:120px;padding:4px 7px;border-radius:10px;background:rgba(255,255,255,.94);color:#111827;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 14px rgba(17,24,39,.14);">' + label.replace(/[&<>"']/g, function(ch) {{ return ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}})[ch]; }}) + '</div>' : '')
              + '</div>',
            anchor: new naver.maps.Point(17, 17),
          }},
        }});
      }};

      window.setCctvMarkers = function(cctvs) {{
        if (!Array.isArray(cctvs)) {{
          return;
        }}

        cctvs.forEach(function(cctv) {{
          window.setCctvMarker(cctv);
        }});
      }};

      naver.maps.Event.addListener(map, 'click', function(event) {{
        const payload = {{
          type: 'map_click',
          latitude: event.coord.lat(),
          longitude: event.coord.lng(),
        }};

        sendToApp(payload);
      }});
    </script>
  </body>
</html>
    """)


@app.post("/auth/signup", response_model=AuthResponse)
def signup(
    data: AuthSignupRequest,
    db: Session = Depends(get_db)
):
    result = signup_user(db, data)

    if result is None:
        raise HTTPException(status_code=400, detail="Signup failed")

    return result


@app.post("/auth/login", response_model=AuthResponse)
def login(
    data: AuthLoginRequest,
    db: Session = Depends(get_db)
):
    result = login_user(db, data)

    if result is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return result


@app.post("/auth/oauth/{provider}", response_model=AuthResponse)
def oauth_login(
    provider: str,
    data: AuthOAuthRequest,
    db: Session = Depends(get_db)
):
    return oauth_login_user(db, provider, data)


@app.get("/auth/oauth/{provider}/config", response_model=AuthOAuthConfigResponse)
def oauth_config(provider: str):
    config = get_oauth_config(provider)

    if config is None:
        raise HTTPException(status_code=404, detail="Unsupported OAuth provider")

    if not config["client_id"]:
        raise HTTPException(status_code=503, detail=f"{provider} OAuth client id is not configured")

    return config


@app.post("/auth/oauth/{provider}/callback", response_model=AuthResponse)
def oauth_callback(
    provider: str,
    data: AuthOAuthCallbackRequest,
    db: Session = Depends(get_db)
):
    try:
        result = oauth_callback_user(db, provider, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OAuth provider request failed: {exc}")

    if result is None:
        raise HTTPException(status_code=404, detail="Unsupported OAuth provider")

    return result


@app.get("/auth/oauth/{provider}/redirect", response_class=HTMLResponse)
def oauth_redirect_landing(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        raise HTTPException(status_code=400, detail=error)

    if code:
        redirect_uri = f"{request.url.scheme}://{request.url.netloc}/auth/oauth/{provider}/redirect"
        callback_data = AuthOAuthCallbackRequest(
            code=code,
            redirect_uri=redirect_uri,
            code_verifier=None,
            state=state,
        )

        try:
            auth_result = oauth_callback_user(db, provider, callback_data)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"OAuth provider request failed: {exc}")

        if state and (state.startswith("exp://") or state.startswith("safepath://")):
            separator = "&" if "?" in state else "?"
            user = auth_result["user"]
            params = urllib.parse.urlencode({
                "oauth": "success",
                "access_token": auth_result["access_token"],
                "token_type": auth_result.get("token_type", "bearer"),
                "user_id": user["id"],
                "email": user["email"],
                "name": user.get("name") or "",
                "role": user["role"],
                "provider": user["provider"],
                "onboarding_completed": user["onboarding_completed"],
            })
            return RedirectResponse(f"{state}{separator}{params}")

    return """
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SafePath OAuth</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #f8fafc;
            color: #111827;
          }
          main {
            width: min(360px, calc(100vw - 40px));
            padding: 28px;
            border-radius: 16px;
            background: #fff;
            box-shadow: 0 18px 45px rgba(15,23,42,.12);
            text-align: center;
          }
          h1 { margin: 0 0 12px; font-size: 22px; }
          p { margin: 0; color: #6b7280; line-height: 1.6; }
        </style>
      </head>
      <body>
        <main>
          <h1>로그인 인증 완료</h1>
          <p>앱으로 돌아가는 중입니다. 창이 자동으로 닫히지 않으면 앱으로 돌아가주세요.</p>
        </main>
      </body>
    </html>
    """


@app.post("/invites/verify", response_model=InviteVerifyResponse)
def verify_invite(
    data: InviteVerifyRequest,
    db: Session = Depends(get_db)
):
    return verify_invite_code_for_role(db, data.code, "staff_viewer")


@app.get("/invites/staff", response_model=InviteSettingsResponse)
def read_staff_invite_settings(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_staff_invite_settings(db, user_email)


@app.put("/invites/staff", response_model=InviteSettingsResponse)
def save_staff_invite_settings(
    data: InviteSettingsUpdate,
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    result = upsert_staff_invite_settings(db, data, user_email)

    if result == "empty_code":
        raise HTTPException(status_code=400, detail="Invite code is required")
    if result == "duplicate_code":
        raise HTTPException(status_code=400, detail="Invite code already exists")

    return result


@app.get("/invites/visitor", response_model=InviteSettingsResponse)
def read_visitor_invite_settings(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_visitor_invite_settings(db, user_email)


@app.put("/invites/visitor", response_model=InviteSettingsResponse)
def save_visitor_invite_settings(
    data: InviteSettingsUpdate,
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    result = upsert_visitor_invite_settings(db, data, user_email)

    if result == "empty_code":
        raise HTTPException(status_code=400, detail="Invite code is required")
    if result == "duplicate_code":
        raise HTTPException(status_code=400, detail="Invite code already exists")

    return result


@app.post("/invites/join", response_model=AuthResponse)
def join_invite(
    data: InviteJoinRequest,
    db: Session = Depends(get_db)
):
    result = join_with_invite_code(db, data)

    if result == "empty_name":
        raise HTTPException(status_code=400, detail="Name is required")
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid invite code")

    return result


@app.post("/public/invites/verify", response_model=InviteVerifyResponse)
def verify_public_invite(
    data: InviteVerifyRequest,
    db: Session = Depends(get_db)
):
    return verify_invite_code_for_role(db, data.code, "visitor")


@app.post("/analysis", response_model=AnalysisResponse)
def receive_analysis_data(
    data: AnalysisCreate,
    db: Session = Depends(get_db)
):
    return create_analysis_log(db, data)


@app.post("/analysis/bulk", response_model=List[AnalysisResponse])
def receive_analysis_data_bulk(
    data: AnalysisBulkCreate,
    db: Session = Depends(get_db)
):
    logs = [create_analysis_log(db, item, commit=False) for item in data.items]
    db.commit()

    for log in logs:
        db.refresh(log)

    return logs


@app.get("/analysis", response_model=List[AnalysisResponse])
def read_analysis_logs(db: Session = Depends(get_db)):
    return get_all_analysis_logs(db)


@app.get("/zones/{zone_id}/latest", response_model=AnalysisResponse)
def read_latest_zone_status(
    zone_id: str,
    db: Session = Depends(get_db)
):
    return get_latest_by_zone(db, zone_id)


@app.get("/zones/{zone_id}/history", response_model=List[ZoneHistoryResponse])
def read_zone_history(
    zone_id: str,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    return get_zone_history(db, zone_id, limit)

@app.get("/zones/current", response_model=List[AnalysisResponse])
def read_current_status_all_zones(db: Session = Depends(get_db)):
    return get_current_status_all_zones(db)

@app.get("/alerts", response_model=List[AlertResponse])
def read_alerts(db: Session = Depends(get_db)):
    return get_all_alerts(db)


@app.post("/alerts", response_model=EmergencyAlertResponse)
def send_manual_alert(
    data: AlertCreate,
    db: Session = Depends(get_db)
):
    return create_manual_alerts(db, data)


@app.get("/alerts/history", response_model=List[EmergencyAlertResponse])
def read_alert_history(db: Session = Depends(get_db)):
    return get_alert_history(db)


@app.get("/alerts/unread", response_model=List[AlertResponse])
def read_unread_alerts(db: Session = Depends(get_db)):
    return get_unread_alerts(db)


@app.get("/public/alerts", response_model=List[PublicAlertResponse])
def read_public_alerts(
    device_id: str = "visitor-app",
    db: Session = Depends(get_db)
):
    return get_public_alerts(db, device_id)


@app.patch("/public/alerts/{alert_id}/read")
def read_public_alert(
    alert_id: int,
    data: VisitorAlertStateUpdate,
    db: Session = Depends(get_db)
):
    result = mark_public_alert_read(db, alert_id, data)

    if result is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"updated": True}


@app.patch("/public/alerts/{alert_id}/pin")
def pin_visitor_alert(
    alert_id: int,
    data: VisitorAlertStateUpdate,
    db: Session = Depends(get_db)
):
    result = pin_public_alert(db, alert_id, data)

    if result is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"updated": True}


@app.delete("/public/alerts/{alert_id}")
def delete_visitor_alert(
    alert_id: int,
    data: VisitorAlertStateUpdate,
    db: Session = Depends(get_db)
):
    result = delete_public_alert(db, alert_id, data)

    if result is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"deleted": True}


@app.post("/public/reports", response_model=VisitorReportResponse)
def register_visitor_report(
    data: VisitorReportCreate,
    db: Session = Depends(get_db)
):
    return create_visitor_report(db, data)


@app.get("/reports", response_model=List[VisitorReportResponse])
def read_visitor_reports(
    status: str | None = None,
    db: Session = Depends(get_db)
):
    return get_visitor_reports(db, status)


@app.patch("/reports/{report_id}/status", response_model=VisitorReportResponse)
def edit_visitor_report_status(
    report_id: int,
    data: VisitorReportStatusUpdate,
    db: Session = Depends(get_db)
):
    result = update_visitor_report_status(db, report_id, data)

    if result == "invalid_status":
        raise HTTPException(
            status_code=400,
            detail="status must be one of pending, reviewing, resolved, dismissed",
        )

    if result is None:
        raise HTTPException(status_code=404, detail="Report not found")

    return result


@app.get("/public/missing-children", response_model=List[PublicMissingChildResponse])
def read_public_missing_children(db: Session = Depends(get_db)):
    return get_public_missing_children(db)


@app.post("/missing-children", response_model=PublicMissingChildResponse)
def register_missing_child(
    data: MissingChildCreate,
    db: Session = Depends(get_db)
):
    return create_missing_child(db, data)


@app.get("/public/missing-children/{child_id}", response_model=PublicMissingChildResponse)
def read_public_missing_child(
    child_id: str,
    db: Session = Depends(get_db)
):
    child = get_public_missing_child(db, child_id)

    if child is None:
        raise HTTPException(status_code=404, detail="Missing child not found")

    return child


@app.get("/public/festival-info", response_model=FestivalInfoResponse)
def read_public_festival_info(db: Session = Depends(get_db)):
    return get_current_festival_info(db)


@app.get("/public/map-config", response_model=EventSettingsResponse)
def read_public_map_config(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_current_event_settings(db, user_email)


@app.get("/map-config", response_model=EventSettingsResponse)
def read_map_config(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_current_event_settings(db, user_email)


@app.get("/festival-info", response_model=FestivalInfoResponse)
def read_festival_info(db: Session = Depends(get_db)):
    return get_current_festival_info(db)


@app.put("/festival-info", response_model=FestivalInfoResponse)
def save_festival_info(
    data: FestivalInfoCreate,
    db: Session = Depends(get_db)
):
    return upsert_festival_info(db, data)


@app.patch("/alerts/{alert_id}/read", response_model=AlertResponse)
def read_alert(
    alert_id: int,
    db: Session = Depends(get_db)
):
    return mark_alert_as_read(db, alert_id)


@app.get("/notices", response_model=List[NoticeResponse])
def read_notices(db: Session = Depends(get_db)):
    return get_all_notices(db)


@app.get("/public/announcements", response_model=List[PublicAnnouncementResponse])
def read_public_announcements(db: Session = Depends(get_db)):
    return get_public_announcements(db)


@app.post("/notices", response_model=NoticeResponse)
def register_notice(
    data: NoticeCreate,
    db: Session = Depends(get_db)
):
    return create_notice(db, data)


@app.patch("/notices/{notice_id}", response_model=NoticeResponse)
def edit_notice(
    notice_id: int,
    data: NoticeUpdate,
    db: Session = Depends(get_db)
):
    notice = update_notice(db, notice_id, data)

    if notice is None:
        raise HTTPException(status_code=404, detail="Notice not found")

    return notice


@app.delete("/notices/{notice_id}")
def remove_notice(
    notice_id: int,
    db: Session = Depends(get_db)
):
    result = delete_notice(db, notice_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Notice not found")

    return result


@app.post("/zones", response_model=ZoneMapResponse)
def register_zone(
    zone_data: ZoneCreate,
    db: Session = Depends(get_db)
):
    zone = create_zone(db, zone_data)

    return {
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
    }


@app.get("/zones", response_model=List[ZoneResponse])
def read_zones(db: Session = Depends(get_db)):
    return get_all_zones(db)


@app.get("/zones/live", response_model=List[ZoneLiveResponse])
def read_live_zones(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_live_zones_for_frontend(db, user_email)


@app.get("/public/zones/live", response_model=List[PublicZoneLiveResponse])
def read_public_live_zones(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_public_live_zones(db, user_email)


@app.get("/zones/map/current", response_model=List[ZoneMapResponse])
def read_map_current_status(db: Session = Depends(get_db)):
    return get_map_current_status(db)

@app.get("/zones/heatmap", response_model=List[ZoneHeatmapResponse])
def read_zone_heatmap(db: Session = Depends(get_db)):
    return get_zone_heatmap_data(db)


@app.get("/predictions", response_model=List[RiskPredictionResponse])
def read_risk_predictions(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_risk_predictions(db, user_email=user_email)


@app.get("/zones/{zone_id}/predictions", response_model=List[RiskPredictionResponse])
def read_zone_risk_predictions(
    zone_id: str,
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_risk_predictions(db, zone_id, user_email)


@app.post("/crowd/data")
def receive_crowd_data(data: CrowdDataInput):
    return crowd_predictor.push_crowd_data(
        zone_id=data.zone_id,
        count=data.count,
        timestamp=data.timestamp,
    )


@app.post("/crowd/data/bulk")
def receive_crowd_data_bulk(data: CrowdDataBulkInput):
    results = []

    for item in data.items:
        results.append(crowd_predictor.push_crowd_data(
            zone_id=item.zone_id,
            count=item.count,
            timestamp=item.timestamp,
        ))

    return {"items": results}


@app.get("/crowd/predict/{zone_id}")
def read_crowd_prediction(zone_id: str):
    try:
        return crowd_predictor.predict_zone(zone_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/crowd/accuracy/{zone_id}")
def read_crowd_accuracy(zone_id: str):
    try:
        return crowd_predictor.get_accuracy(zone_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found")


@app.get("/crowd/accuracy/{zone_id}/detail")
def read_crowd_accuracy_detail(zone_id: str):
    try:
        return crowd_predictor.get_accuracy_detail(zone_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found")


@app.get("/crowd/all")
def read_all_crowd_zones():
    return crowd_predictor.get_all_zones_summary()


@app.delete("/crowd/reset/{zone_id}")
def reset_crowd_zone(zone_id: str):
    return crowd_predictor.reset_zone(zone_id)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "crowd_zones": [
            zone["zone_id"]
            for zone in crowd_predictor.get_all_zones_summary()
        ],
    }


@app.get("/incidents", response_model=List[IncidentResponse])
def read_incidents(
    date: str | None = None,
    q: str | None = None,
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_incidents(db, date, q, user_email)


def parse_optional_iso_datetime(value: str | None):
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None)
    except ValueError:
        return None


def get_recording_target_incident(
    db: Session,
    zone_id: str,
    started_dt: datetime | None,
    ended_dt: datetime | None,
):
    open_incident = (
        db.query(models.Incident)
        .filter(models.Incident.zone_id == zone_id)
        .filter(models.Incident.level == "critical")
        .filter(models.Incident.resolved == 0)
        .order_by(models.Incident.id.desc())
        .first()
    )

    if open_incident is not None:
        return open_incident

    latest_incident = (
        db.query(models.Incident)
        .filter(models.Incident.zone_id == zone_id)
        .filter(models.Incident.level == "critical")
        .order_by(models.Incident.id.desc())
        .first()
    )

    if latest_incident is None:
        return None

    recording_time = ended_dt or started_dt

    if recording_time is None:
        return latest_incident

    incident_time = latest_incident.ended_at or latest_incident.started_at or latest_incident.created_at

    if incident_time is None:
        return latest_incident

    if abs((recording_time - incident_time).total_seconds()) <= 15 * 60:
        return latest_incident

    return None


@app.post("/incidents/recording")
async def upload_incident_recording(
    request: Request,
    zone_id: str = Form(...),
    started_at: str = Form(""),
    ended_at: str = Form(""),
    peak_count: int = Form(0),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content_type = (file.content_type or "").lower()
    original_suffix = Path(file.filename or "").suffix.lower()

    if content_type not in {"video/mp4", "application/octet-stream"} and original_suffix != ".mp4":
        raise HTTPException(status_code=400, detail="Only mp4 recordings are allowed")

    contents = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Recording file is empty")

    if len(contents) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Recording file is too large")

    safe_zone_id = re.sub(r"[^a-zA-Z0-9_-]+", "_", zone_id.strip() or "unknown")
    recording_id = uuid.uuid4().hex
    raw_filename = f"incident_{safe_zone_id}_{recording_id}_raw.mp4"
    converted_filename = f"incident_{safe_zone_id}_{recording_id}.mp4"
    raw_path = INCIDENT_RECORDING_DIR / raw_filename
    converted_path = INCIDENT_RECORDING_DIR / converted_filename

    raw_path.write_bytes(contents)

    if convert_recording_for_ios(raw_path, converted_path):
        filename = converted_filename
    else:
        filename = raw_filename

    base_url = str(request.base_url).rstrip("/")
    video_url = f"{base_url}/static/incident-recordings/{filename}"

    started_dt = parse_optional_iso_datetime(started_at)
    ended_dt = parse_optional_iso_datetime(ended_at)
    duration_seconds = 0

    if started_dt and ended_dt:
        duration_seconds = max(0, int((ended_dt - started_dt).total_seconds()))

    incident = get_recording_target_incident(db, zone_id, started_dt, ended_dt)

    if incident is None:
        incident = models.Incident(
            zone_id=zone_id,
            sector=zone_id,
            gate=zone_id,
            level="critical",
            peak_density=max(0, peak_count),
            description=f"{zone_id} 구역 위험 감지 녹화",
            video_url=video_url,
            duration_seconds=duration_seconds,
            started_at=started_dt,
            ended_at=ended_dt,
        )
        db.add(incident)
    else:
        incident.video_url = video_url
        incident.peak_density = max(incident.peak_density or 0, peak_count)
        if started_dt:
            incident.started_at = started_dt
        if ended_dt:
            incident.ended_at = ended_dt
            incident.resolved = 1
        if duration_seconds:
            incident.duration_seconds = duration_seconds

    db.commit()
    db.refresh(incident)

    return {
        "id": incident.id,
        "zoneId": incident.zone_id,
        "videoUrl": video_url,
    }


@app.get("/incidents/{incident_id}", response_model=IncidentResponse)
def read_incident(
    incident_id: int,
    db: Session = Depends(get_db)
):
    incident = get_incident(db, incident_id)

    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    return incident


@app.get("/incidents/{incident_id}/video-url", response_model=IncidentVideoResponse)
def read_incident_video_url(
    incident_id: int,
    db: Session = Depends(get_db)
):
    video = get_incident_video_url(db, incident_id)

    if video is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    return video


@app.post("/staffing", response_model=StaffingResponse)
def register_staffing(
    data: StaffingCreate,
    db: Session = Depends(get_db)
):
    return upsert_staffing(db, data)


@app.get("/staffing", response_model=List[StaffingResponse])
def read_staffing(db: Session = Depends(get_db)):
    return get_all_staffing(db)


@app.get("/staff", response_model=List[StaffResponse])
def read_staff(
    user_email: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    return get_all_staff(db, user_email)


@app.post("/staff", response_model=StaffResponse)
def register_staff(
    data: StaffCreate,
    user_email: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    return create_staff(db, data, user_email)


@app.patch("/staff/{staff_id}", response_model=StaffResponse)
def edit_staff(
    staff_id: int,
    data: StaffUpdate,
    user_email: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    return update_staff(db, staff_id, data, user_email)


@app.delete("/staff/{staff_id}")
def remove_staff(
    staff_id: int,
    user_email: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    return delete_staff(db, staff_id, user_email)


@app.post("/sectors/{zone_id}/staff", response_model=StaffAssignmentResponse)
def assign_staff(
    zone_id: str,
    data: StaffAssignmentCreate,
    user_email: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    return assign_staff_to_zone(db, data.staff_id, zone_id, user_email)


@app.delete("/sectors/{zone_id}/staff/{staff_id}")
def unassign_staff(
    zone_id: str,
    staff_id: int,
    user_email: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    return remove_staff_from_zone(db, staff_id, zone_id, user_email)


@app.post("/devices/push-token", response_model=DeviceTokenResponse)
def register_device_token(
    data: DeviceTokenCreate,
    db: Session = Depends(get_db)
):
    return upsert_device_token(db, data)


@app.post("/public/devices/push-token", response_model=PublicDeviceTokenResponse)
def register_public_device_token(
    data: PublicDeviceTokenCreate,
    db: Session = Depends(get_db)
):
    result = upsert_public_device_token(db, data)

    if result == "invalid_level":
        raise HTTPException(status_code=400, detail="minRiskLevel must be warning or danger")

    return result


@app.get("/public/devices/{device_id}/notification-settings", response_model=PublicDeviceTokenResponse)
def read_public_device_notification_settings(
    device_id: str,
    db: Session = Depends(get_db)
):
    result = get_public_notification_settings(db, device_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Device settings not found")

    return result


@app.patch("/public/devices/{device_id}/notification-settings", response_model=PublicDeviceTokenResponse)
def update_public_device_notification_settings(
    device_id: str,
    data: PublicNotificationSettingsUpdate,
    db: Session = Depends(get_db)
):
    result = update_public_notification_settings(db, device_id, data)

    if result == "invalid_level":
        raise HTTPException(status_code=400, detail="minRiskLevel must be warning or danger")

    return result


@app.post("/zone-distances")
def register_zone_distance(
    data: ZoneDistanceCreate,
    db: Session = Depends(get_db)
):
    return create_zone_distance(db, data)


@app.get("/events/current", response_model=EventSettingsResponse)
def read_current_event_settings(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return get_current_event_settings(db, user_email)


@app.put("/events/current/settings", response_model=EventSettingsResponse)
def update_current_event_settings(
    data: EventSettingsCreate,
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return upsert_event_settings(db, data, user_email)


@app.post("/events/current/onboarding", response_model=EventSettingsResponse)
def save_onboarding_event_settings(
    data: EventSettingsCreate,
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return upsert_event_settings(db, data, user_email)


@app.get("/relocation/recommendations", response_model=RelocationResponse)
def read_relocation_recommendations(
    user_email: str | None = None,
    db: Session = Depends(get_db)
):
    return recommend_staff_relocation(db, user_email)


@app.post("/relocations/{recommendation_id}/apply", response_model=RelocationApplyResponse)
def apply_relocation(
    recommendation_id: int,
    db: Session = Depends(get_db)
):
    result = apply_relocation_recommendation(db, recommendation_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Relocation recommendation not found")

    return result
