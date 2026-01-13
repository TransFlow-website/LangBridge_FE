# 번역 작업 화면 구현 계획

## Phase 1: 기본 구조 및 의존성 설치

### 1.1 Tiptap 설치
```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
```

### 1.2 기본 페이지 구조 생성
- `src/pages/TranslationWork.tsx` 생성
- 3단 레이아웃 기본 구조
- 라우팅 추가: `/translations/:id/work`

## Phase 2: 백엔드 API 구현

### 2.1 락 관련 엔티티/테이블
```java
// DocumentLock 엔티티 또는 Document에 필드 추가
- documentId
- lockedBy (User)
- lockedAt
- handoverMemo (nullable)
- completedParagraphs (JSON, nullable)
```

### 2.2 락 API 컨트롤러
- `POST /api/documents/{id}/lock` - 락 획득
- `DELETE /api/documents/{id}/lock` - 락 해제 (관리자)
- `GET /api/documents/{id}/lock-status` - 락 상태 확인

### 2.3 작업 관련 API
- `POST /api/documents/{id}/handover` - 인계 요청
- `POST /api/documents/{id}/complete` - 번역 완료
- `PUT /api/documents/{id}/translation` - 임시 저장

## Phase 3: 프론트엔드 구현

### 3.1 Tiptap 에디터 통합
- 기본 에디터 설정
- HTML round-trip 지원
- 문단 단위 ID 추적

### 3.2 3단 레이아웃
- 원문 패널 (Read-only)
- AI 초벌 번역 패널 (Read-only)
- 내 번역 패널 (Editable)

### 3.3 락 시스템 통합
- 진입 시 락 획득
- 락 상태 표시
- 락 해제 처리

## Phase 4: 고급 기능

### 4.1 문단 동기화
- 하이라이트 동기화
- 스크롤 동기화

### 4.2 문단 완료 체크
- 체크박스 UI
- 진행률 자동 계산

### 4.3 인계 요청
- 인계 모달
- 인계 정보 저장

### 4.4 번역 완료
- 완료 처리
- 상태 변경

