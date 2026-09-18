# SafePath — Real-time Crowd Safety Management System

> CCTV 기반 인파 데이터를 분석해 축제 현장의 혼잡도를 실시간으로 파악하고, **관리자 대응과 관람객 안전 안내를 연결하는 안전관리 시스템**입니다.

| 항목 | 내용 |
| --- | --- |
| Project | 산업경영공학 캡스톤디자인 |
| Period | 2025.12–2026.06 |
| Role | 서비스 기획 · UI/UX · Front-end · 발표 |
| Platform | 관리자 앱 · 관람객 앱 · Backend |
| Tech | React Native, Expo, TypeScript, FastAPI, MySQL, Python |

## 1. Problem

초기에는 스포츠 경기장을 대상으로 혼잡도와 우회 정보를 제공하는 서비스를 기획했습니다. 그러나 현장 피드백을 통해 경기장에서는 사용자가 혼잡 상황을 직접 확인할 수 있어 별도 서비스의 필요성이 낮다는 한계를 확인했습니다.

## 2. Decision

실시간 인파 분석이라는 핵심 기술은 유지하면서, 짧은 시간에 인파가 집중되고 즉각적인 대응이 필요한 **대학·지역축제**로 적용 대상을 전환했습니다.

```text
CCTV / Video
     ↓
Crowd Analysis
     ↓
FastAPI Backend
     ↓
Admin App ───────── Visitor App
현황·예측·대응        혼잡도·공지·알림
```

## 3. What I Did

- 경기장 중심 기획의 사용성 한계를 확인하고 **대학·지역축제로 적용 대상 전환 제안**
- 관리자와 관람객의 사용 목적을 구분해 서비스 구조 설계
- 관리자 앱 / 관람객 앱 UI·UX 설계
- React Native 기반 프론트엔드 구현
- 기능 흐름과 사용 시나리오 정리
- 최종 발표 및 시연 준비

> **Contribution Note**  
> 백엔드와 인파 분석 모듈은 팀 프로젝트의 통합 결과물입니다. 이 저장소에서는 전체 시스템 구조를 함께 보여주되, 제 담당 범위인 **서비스 기획·UI/UX·프론트엔드**를 명확히 구분했습니다.

## 4. Key Features

### Admin
- 구역별 실시간 혼잡 현황 확인
- 혼잡 추이 및 위험 예측 확인
- 인력 배치 및 구역 관리
- 긴급 알림·통제
- 사고 기록 및 운영 정보 관리

### Visitor
- 축제 정보 및 공지 확인
- 구역별 혼잡도·히트맵 확인
- 위험·운영 알림 확인
- 미아 정보 확인
- 현장 신고

## 5. Tech Stack

| Area | Stack |
| --- | --- |
| Mobile | React Native, Expo, TypeScript |
| Navigation / UI | React Navigation, React Native SVG |
| API | FastAPI, Pydantic |
| Database | MySQL, SQLAlchemy, PyMySQL |
| Analysis | NumPy, scikit-learn, statsmodels |
| Computer Vision | OpenCV, PyTorch, Ultralytics YOLO |

## 6. Repository Structure

```text
safepath-crowd-safety-system/
├── admin-app/       # 관리자용 프론트엔드 핵심 코드
├── visitor-app/     # 관람객용 프론트엔드 핵심 코드
├── backend/         # API·DB·예측·영상분석 핵심 코드
├── .gitignore
└── README.md
```

> 공개 포트폴리오용 저장소로 정리하면서 런타임 DB, 캐시, 테스트 영상, 대용량 모델 weight, 로컬 개발환경 파일과 일부 디자인 이미지 자산은 제외했습니다.

## 7. Getting Started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

`backend/.env.example`을 참고해 데이터베이스와 외부 API 환경변수를 설정합니다.

### Admin / Visitor App

```bash
cd admin-app   # or visitor-app
npm install
npx expo start
```

각 앱의 `.env.example`에서 API 주소를 확인할 수 있습니다.

## 8. What I Learned

이 프로젝트에서 가장 크게 배운 점은 **기능을 더하는 것보다 서비스를 실제로 필요로 하는 상황을 다시 정의하는 것이 중요하다**는 점이었습니다. 피드백을 근거로 적용 대상을 바꾸고, 분석 결과가 관리자 대응과 관람객 안내로 연결되도록 정보 구조를 설계했습니다.
