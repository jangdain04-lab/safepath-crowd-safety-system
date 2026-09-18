import cv2
import torch
import threading
import requests
import time
import sqlite3
import math
import os
from ultralytics import YOLO
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from queue import Queue

app = Flask(__name__)
CORS(app)

REAL_WIDTH_M = 10.0
SEND_INTERVAL = 1.0

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
BACKEND_ANALYSIS_BULK_URL = f"{BACKEND_BASE_URL}/analysis/bulk"
BACKEND_CROWD_BULK_URL = f"{BACKEND_BASE_URL}/crowd/data/bulk"

LOCAL_SERVER_PORT = 5001
DEBUG_TRANSMIT = True

ZONE_AREAS = {
    "cam1": 7.0,
    "cam2": 7.0,
    "cam3": 7.0,
    "cam4": 7.0,
}

ZONE_SLOPES = {
    "cam1": 5,
    "cam2": 10,
    "cam3": 5,
    "cam4": 5,
}

RISK_TABLE = {
    0: {"safe": 0.50, "danger": 0.20},
    5: {"safe": 0.68, "danger": 0.27},
    10: {"safe": 0.93, "danger": 0.37},
    15: {"safe": 1.27, "danger": 0.51},
    20: {"safe": 1.79, "danger": 0.72},
}

SPEED_SMOOTHING = 0.88
MAX_SPEED = 4.0
MIN_SPEED = 0.02

TRACK_TTL_SEC = 1.2
MIN_PERSON_BOX_AREA_RATIO = 0.00045
MIN_PERSON_HEIGHT_RATIO = 0.035

ZONE_NAMES = {"cam1": "1", "cam2": "2", "cam3": "3", "cam4": "4"}

MODEL_PATH = "yolo11m.pt"
CAMERA_INDEX = 1

CAPTURE_WIDTH = 1280
CAPTURE_HEIGHT = 720
CAPTURE_FPS = 30

YOLO_IMGSZ_GPU = 960
YOLO_IMGSZ_CPU = 640
YOLO_CONF = 0.12
YOLO_IOU = 0.55
YOLO_MAX_DET = 500

current_data = {
    "cam1": {"count": 0, "density": 0, "space": 7, "risk": "여유", "risk_en": "SAFE", "speed": 0, "slope": ZONE_SLOPES["cam1"], "area": ZONE_AREAS["cam1"]},
    "cam2": {"count": 0, "density": 0, "space": 7, "risk": "여유", "risk_en": "SAFE", "speed": 0, "slope": ZONE_SLOPES["cam2"], "area": ZONE_AREAS["cam2"]},
    "cam3": {"count": 0, "density": 0, "space": 7, "risk": "여유", "risk_en": "SAFE", "speed": 0, "slope": ZONE_SLOPES["cam3"], "area": ZONE_AREAS["cam3"]},
    "cam4": {"count": 0, "density": 0, "space": 7, "risk": "여유", "risk_en": "SAFE", "speed": 0, "slope": ZONE_SLOPES["cam4"], "area": ZONE_AREAS["cam4"]},
}

latest_frame = None
latest_boxes = []
latest_ids = []
frame_seq = 0
last_send_time = 0

lock = threading.Lock()
db_queue = Queue(maxsize=120)
http_session = requests.Session()

prev_centers = {}
prev_speeds = {}
track_state = {}


def init_db():
    conn = sqlite3.connect("crowd_data.db")
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone_id TEXT,
            people_count INTEGER,
            density REAL,
            speed REAL,
            slope REAL,
            area REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def calculate_risk(cam, count, speed):
    area = ZONE_AREAS[cam]
    slope = ZONE_SLOPES[cam]
    density = count / area
    space = area if count == 0 else area / count
    standard = RISK_TABLE.get(slope, RISK_TABLE[0])

    if space >= standard["safe"]:
        risk, risk_en = "여유", "SAFE"
    elif space <= standard["danger"]:
        risk, risk_en = "위험", "DANGER"
    else:
        risk, risk_en = "주의", "CAUTION"

    return {
        "count": count,
        "density": round(density, 3),
        "space": round(space, 2),
        "risk": risk,
        "risk_en": risk_en,
        "speed": round(speed, 2),
        "slope": slope,
        "area": area,
    }


def risk_to_backend_status(risk_en):
    if risk_en == "DANGER":
        return "danger"
    if risk_en == "CAUTION":
        return "warning"
    return "safe"


def enhance_frame(frame):
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def get_cam_from_point(px, py, w, h):
    mid_h, mid_w = h // 2, w // 2
    if py < mid_h:
        return "cam1" if px < mid_w else "cam2"
    return "cam3" if px < mid_w else "cam4"


def is_valid_person_box(box, frame_w, frame_h):
    x1, y1, x2, y2 = box
    bw = max(0, x2 - x1)
    bh = max(0, y2 - y1)

    if bw <= 0 or bh <= 0:
        return False

    area_ratio = (bw * bh) / float(frame_w * frame_h)
    height_ratio = bh / float(frame_h)

    return area_ratio >= MIN_PERSON_BOX_AREA_RATIO and height_ratio >= MIN_PERSON_HEIGHT_RATIO


@app.route("/analysis", methods=["POST"])
def save_analysis():
    data = request.get_json()
    conn = sqlite3.connect("crowd_data.db")
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO analysis (zone_id, people_count, density, speed, slope, area)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        data["zone_id"],
        data["people_count"],
        data["density"],
        data["speed"],
        data["slope"],
        data["area"],
    ))
    conn.commit()
    conn.close()
    return jsonify({"status": "saved"})


@app.route("/map")
def serve_map():
    return send_from_directory(r"C:\Users\ime\Desktop", "map.html")


@app.route("/count")
def get_counts():
    return jsonify({"areas": ZONE_AREAS, "slopes": ZONE_SLOPES, "data": current_data})


def run_server():
    app.run(host="0.0.0.0", port=LOCAL_SERVER_PORT, threaded=True, debug=False)


def db_worker():
    while True:
        data = db_queue.get()

        if DEBUG_TRANSMIT:
            print("[전송 직전]", data["analysis_items"])

        try:
            r = http_session.post(
                BACKEND_ANALYSIS_BULK_URL,
                json={"items": data["analysis_items"]},
                timeout=2.5,
            )
            print("[analysis bulk 전송]", len(data["analysis_items"]), "개", r.status_code)
        except Exception as e:
            print("[analysis bulk 전송 실패]", e)

        try:
            r = http_session.post(
                BACKEND_CROWD_BULK_URL,
                json={"items": data["crowd_items"]},
                timeout=2.5,
            )
            print("[crowd bulk 전송]", len(data["crowd_items"]), "개", r.status_code)
        except Exception as e:
            print("[crowd bulk 전송 실패]", e)

        db_queue.task_done()


def ai_worker(model, device):
    global latest_boxes, latest_ids, last_send_time, current_data

    last_processed_seq = -1
    yolo_imgsz = YOLO_IMGSZ_GPU if device == "cuda" else YOLO_IMGSZ_CPU

    while True:
        with lock:
            if latest_frame is None or frame_seq == last_processed_seq:
                frame = None
            else:
                frame = latest_frame.copy()
                last_processed_seq = frame_seq

        if frame is None:
            time.sleep(0.005)
            continue

        h, w, _ = frame.shape
        meter_per_pixel = REAL_WIDTH_M / w
        now_time = time.time()
        input_frame = enhance_frame(frame)

        results = model.track(
            input_frame,
            imgsz=yolo_imgsz,
            conf=YOLO_CONF,
            iou=YOLO_IOU,
            max_det=YOLO_MAX_DET,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],
            agnostic_nms=True,
            verbose=False,
        )[0]

        visible_boxes = []
        visible_ids = []
        instant_counts = {"cam1": 0, "cam2": 0, "cam3": 0, "cam4": 0}
        speeds = {"cam1": [], "cam2": [], "cam3": [], "cam4": []}

        if results.boxes is not None and len(results.boxes) > 0:
            boxes_np = results.boxes.xyxy.cpu().numpy()
            ids_np = (
                results.boxes.id.cpu().numpy().astype(int)
                if results.boxes.id is not None
                else [-1] * len(boxes_np)
            )

            for box, tid in zip(boxes_np, ids_np):
                if not is_valid_person_box(box, w, h):
                    continue

                x1, y1, x2, y2 = box
                foot_x = (x1 + x2) / 2
                foot_y = y2
                cam = get_cam_from_point(foot_x, foot_y, w, h)

                visible_boxes.append(box)
                visible_ids.append(tid)

                if tid != -1:
                    track_state[tid] = {"cam": cam, "last_seen": now_time, "box": box}
                    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

                    if tid in prev_centers:
                        px, py, pt = prev_centers[tid]
                        dt = now_time - pt

                        if dt > 0.05:
                            dist_px = math.sqrt((cx - px) ** 2 + (cy - py) ** 2)
                            raw_speed = (dist_px * meter_per_pixel) / dt

                            if raw_speed < MIN_SPEED:
                                raw_speed = 0

                            if raw_speed < MAX_SPEED:
                                if tid in prev_speeds:
                                    speed_mps = SPEED_SMOOTHING * prev_speeds[tid] + (1 - SPEED_SMOOTHING) * raw_speed
                                else:
                                    speed_mps = raw_speed

                                if speed_mps < MIN_SPEED:
                                    speed_mps = 0

                                prev_speeds[tid] = speed_mps
                                speeds[cam].append(speed_mps)

                    prev_centers[tid] = (cx, cy, now_time)
                else:
                    instant_counts[cam] += 1

        counts = {"cam1": 0, "cam2": 0, "cam3": 0, "cam4": 0}
        expired_ids = []

        for tid, state in track_state.items():
            if now_time - state["last_seen"] <= TRACK_TTL_SEC:
                counts[state["cam"]] += 1
            else:
                expired_ids.append(tid)

        for tid in expired_ids:
            track_state.pop(tid, None)
            prev_centers.pop(tid, None)
            prev_speeds.pop(tid, None)

        for cam in counts:
            counts[cam] += instant_counts[cam]

        for cam in counts:
            if counts[cam] == 0:
                avg_speed = 0
            elif speeds[cam]:
                avg_speed = sum(speeds[cam]) / len(speeds[cam])
            else:
                avg_speed = current_data[cam]["speed"] * 0.85
                if avg_speed < MIN_SPEED:
                    avg_speed = 0

            current_data[cam] = calculate_risk(cam, counts[cam], avg_speed)

        if DEBUG_TRANSMIT:
            print("[CV count]", {cam: current_data[cam]["count"] for cam in counts})

        with lock:
            latest_boxes = visible_boxes
            latest_ids = visible_ids

        if now_time - last_send_time >= SEND_INTERVAL:
            analysis_items = []
            crowd_items = []

            for cam in counts:
                zone_id = ZONE_NAMES[cam]
                info = current_data[cam]

                analysis_items.append({
                    "zone_id": zone_id,
                    "people_count": info["count"],
                    "density": info["density"],
                    "speed": info["speed"],
                    "slope": info["slope"],
                    "cv_status": risk_to_backend_status(info["risk_en"]),
                    "risk_score": 1.0 if info["risk_en"] == "DANGER" else 0.65 if info["risk_en"] == "CAUTION" else 0.2,
                    "m_per_person": info["space"],
                })

                crowd_items.append({
                    "zone_id": zone_id,
                    "count": info["count"],
                    "timestamp": now_time,
                })

            if not db_queue.full():
                db_queue.put({
                    "analysis_items": analysis_items,
                    "crowd_items": crowd_items,
                })

            last_send_time = now_time


init_db()

threading.Thread(target=run_server, daemon=True).start()
threading.Thread(target=db_worker, daemon=True).start()

device = "cuda" if torch.cuda.is_available() else "cpu"
model = YOLO(MODEL_PATH).to(device)

try:
    model.fuse()
except Exception:
    pass

if device == "cuda":
    model.model.half()
    torch.backends.cudnn.benchmark = True

threading.Thread(target=ai_worker, args=(model, device), daemon=True).start()

cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)

if not cap.isOpened():
    print("카메라 열기 실패.")
    raise SystemExit

cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAPTURE_WIDTH)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAPTURE_HEIGHT)
cap.set(cv2.CAP_PROP_FPS, CAPTURE_FPS)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

window_name = "AI Crowd Control System"
cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
cv2.resizeWindow(window_name, int(CAPTURE_WIDTH // 2), int(CAPTURE_HEIGHT // 2))

while cap.isOpened():
    success, frame = cap.read()

    if not success:
        break

    h, w, _ = frame.shape
    mid_h, mid_w = h // 2, w // 2

    with lock:
        latest_frame = frame.copy()
        frame_seq += 1
        boxes = list(latest_boxes)
        ids = list(latest_ids)

    display = frame.copy()

    cv2.line(display, (mid_w, 0), (mid_w, h), (255, 255, 255), 2)
    cv2.line(display, (0, mid_h), (w, mid_h), (255, 255, 255), 2)

    for box, tid in zip(boxes, ids):
        x1, y1, x2, y2 = map(int, box)
        cv2.rectangle(display, (x1, y1), (x2, y2), (255, 0, 0), 2)

        if tid != -1:
            cv2.putText(
                display,
                f"ID:{tid}",
                (x1, max(15, y1 - 5)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (255, 0, 0),
                1,
            )

    cv2.putText(display, f"1: {current_data['cam1']['count']} / {current_data['cam1']['risk_en']} / {current_data['cam1']['speed']}m/s / {current_data['cam1']['slope']}deg",
                (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    cv2.putText(display, f"2: {current_data['cam2']['count']} / {current_data['cam2']['risk_en']} / {current_data['cam2']['speed']}m/s / {current_data['cam2']['slope']}deg",
                (mid_w + 20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    cv2.putText(display, f"3: {current_data['cam3']['count']} / {current_data['cam3']['risk_en']} / {current_data['cam3']['speed']}m/s / {current_data['cam3']['slope']}deg",
                (20, mid_h + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    cv2.putText(display, f"4: {current_data['cam4']['count']} / {current_data['cam4']['risk_en']} / {current_data['cam4']['speed']}m/s / {current_data['cam4']['slope']}deg",
                (mid_w + 20, mid_h + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    cv2.imshow(window_name, display)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
