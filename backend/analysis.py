import cv2
from ultralytics import YOLO
import numpy as np
import torch
import threading
import time
from flask import Flask, jsonify
from flask_cors import CORS

# =========================================================
# 1. Flask 백엔드 서버 설정
# =========================================================
app = Flask(__name__)
CORS(app)

# 외부(모바일 앱, 웹 등)로 내보낼 실시간 데이터 보관소
api_data = {
    "count": 0,
    "status": "NORMAL (GREEN)",
    "m_per_person": 0.0
}

@app.route('/count')
def get_count():
    return jsonify(api_data)

def run_server():
    import logging 
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.run(host='0.0.0.0', port=5000, threaded=True)

threading.Thread(target=run_server, daemon=True).start()


# =========================================================
# 2. 모델 로드 및 OBS 가상 카메라 설정 🌟(수정된 부분)
# =========================================================
device = 'cuda' if torch.cuda.is_available() else 'cpu'
model = YOLO('yolo11s.pt').to(device)
if device == 'cuda': model.model.half()

# 유튜브 대신 OBS 가상 카메라(또는 웹캠) 불러오기
# 노트북 기본 캠이 0번이라면, OBS 가상 카메라는 보통 1번입니다. (안 나오면 0, 1, 2 바꿔보세요)
stream = cv2.VideoCapture(1, cv2.CAP_DSHOW)

# [로딩/지연 제거 핵심] 실시간 방송과 싱크를 맞추기 위해 버퍼 최소화
stream.set(cv2.CAP_PROP_BUFFERSIZE, 1)

# FPS 설정 (라이브 캠은 FPS를 0으로 읽어올 수 있어서 방어 코드 추가)
fps = stream.get(cv2.CAP_PROP_FPS)
VIDEO_FPS = fps if fps > 0 else 30.0
FRAME_DURATION = 1.0 / VIDEO_FPS


# =========================================================
# 3. 평지(0도) 기준 프레임워크 설정 (m2/인)
# =========================================================
THRESHOLD_GREEN_TO_YELLOW = 0.5  
THRESHOLD_YELLOW_TO_RED = 0.25   

REAL_WIDTH = 8   
REAL_HEIGHT = 21 
ROI_AREA_M2 = REAL_WIDTH * REAL_HEIGHT  


# =========================================================
# 4. 전역 공유 데이터 및 ROI 설정
# =========================================================
shared_frame = None
shared_results = {'boxes': [], 'ids': []}
lock = threading.Lock()

ret, first_frame = stream.read()
if not ret: raise RuntimeError("OBS 가상 카메라 영상을 불러올 수 없습니다. OBS에서 '가상 카메라 시작'을 눌렀는지 확인하세요.")

roi_rect = cv2.selectROI("1. Zone Selection", first_frame, False)
cv2.destroyWindow("1. Zone Selection")
rx, ry, rw, rh = roi_rect


# =========================================================
# 5. AI 분석 스레드
# =========================================================
def ai_worker():
    global shared_results
    while True:
        with lock:
            if shared_frame is None: continue
            working_frame = shared_frame[ry:ry + rh, rx:rx + rw].copy()

        results = model.track(
            working_frame, imgsz=640, conf=0.1, persist=True,
            tracker="bytetrack.yaml", classes=[0], verbose=False
        )[0]

        with lock:
            if results.boxes is not None and results.boxes.id is not None:
                shared_results['boxes'] = results.boxes.xyxy.cpu().numpy()
                shared_results['ids'] = results.boxes.id.cpu().numpy().astype(int)
            else:
                shared_results['boxes'] = []
                shared_results['ids'] = []

threading.Thread(target=ai_worker, daemon=True).start()


# =========================================================
# 6. 메인 루프 (영상 출력 및 위험도 계산)
# =========================================================
while True:
    start_time = time.time()
    ret, frame = stream.read()
    if not ret: break

    with lock:
        shared_frame = frame.copy()
        curr_boxes = shared_results['boxes']
        curr_ids = shared_results['ids']

    display_crop = frame[ry:ry + rh, rx:rx + rw].copy()

    # [위험도 계산 로직]
    current_count = len(curr_ids)

    if current_count > 0:
        m_per_person = ROI_AREA_M2 / current_count
        if m_per_person < THRESHOLD_YELLOW_TO_RED:
            status, color = "DANGER (RED)", (0, 0, 255)
        elif m_per_person < THRESHOLD_GREEN_TO_YELLOW:
            status, color = "CAUTION (YELLOW)", (0, 255, 255)
        else:
            status, color = "NORMAL (GREEN)", (0, 255, 0)
    else:
        m_per_person = float('inf')
        status, color = "NORMAL (GREEN)", (0, 255, 0)

    # 🌟 Flask 서버 변수에 갱신
    api_data["count"] = current_count
    api_data["status"] = status.split(" ")[0]
    api_data["m_per_person"] = round(m_per_person, 2) if current_count > 0 else 0.0

    # 시각화 (대시보드 UI)
    for box, tid in zip(curr_boxes, curr_ids):
        x1, y1, x2, y2 = map(int, box)
        cv2.rectangle(display_crop, (x1, y1), (x2, y2), color, 2)
        cv2.putText(display_crop, f"ID:{tid}", (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

    overlay = display_crop.copy()
    cv2.rectangle(overlay, (0, 0), (280, 100), (0, 0, 0), -1)
    display_crop = cv2.addWeighted(overlay, 0.6, display_crop, 0.4, 0)

    cv2.putText(display_crop, f"STATUS: {status}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    cv2.putText(display_crop, f"Area: {ROI_AREA_M2:.1f} m2", (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(display_crop, f"M(0): {m_per_person:.2f} m2/person", (10, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(display_crop, f"People Count: {current_count}", (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    cv2.imshow("Crowd Safety Framework (Flat Ground)", display_crop)

    # FPS 유지
    elapsed = time.time() - start_time
    if elapsed < FRAME_DURATION:
        time.sleep(FRAME_DURATION - elapsed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

stream.release()
cv2.destroyAllWindows()