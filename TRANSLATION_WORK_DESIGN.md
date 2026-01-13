# 번역 작업 화면 & 고유 락 기반 작업 흐름 설계

## 1. 화면 레이아웃 구조

### 3단 고정 레이아웃 (좌 → 우)

```
┌─────────────────────────────────────────────────────────────────┐
│ [상단 고정 바] 락 상태 표시 + 진행률 + 액션 버튼                │
├──────────────┬──────────────┬───────────────────────────────────┤
│              │              │                                   │
│   원문       │  AI 초벌     │   내 번역                         │
│ (Version 0)  │  번역        │  (Working Version)                │
│              │ (Version 1)  │                                   │
│  Read-only   │  Read-only   │  Editable (Tiptap)                │
│              │              │                                   │
│              │              │                                   │
│              │              │                                   │
│              │              │                                   │
│              │              │                                   │
└──────────────┴──────────────┴───────────────────────────────────┘
```

### 컬럼 비율
- 원문: 33%
- AI 초벌 번역: 33%
- 내 번역: 34%

### 상단 고정 바 구성
- **락 상태 배지**: "현재 당신이 이 문서를 번역 중입니다" (녹색 배지)
- **진행률**: 문단 완료 기준 자동 계산 (예: "15/50 문단 완료 (30%)")
- **액션 버튼**: [인계 요청] [번역 완료] [임시 저장]

## 2. 에디터 기술 스택

### Tiptap (ProseMirror 기반)
- **이유**: HTML round-trip 지원, 문단 단위 식별 용이, 안정적인 붙여넣기
- **필수 확장**:
  - `Document` - 기본 문서 구조
  - `Paragraph` - 문단 단위
  - `Heading` - 제목
  - `Bold`, `Italic` - 기본 서식
  - `History` - Undo/Redo
  - `Placeholder` - 플레이스홀더
  - 커스텀 확장: 문단 ID 추적

### 초기 상태
- AI 초벌 번역 내용이 그대로 복사되어 편집 가능한 상태로 시작
- 빈 화면이 아님

## 3. 문단 단위 UX

### 동기화 하이라이트
- 좌/중/우 3개 패널에서 같은 문단이 하이라이트됨
- 마우스 호버 또는 스크롤 위치 기반
- 하이라이트 색상: `rgba(192, 192, 192, 0.3)` (silver 30%)

### 스크롤 동기화
- 한 패널 스크롤 시 다른 패널도 동일한 비율로 스크롤
- `scrollTop` 비율 계산 기반

### 문단 완료 체크
- 각 문단 옆에 체크박스
- 체크 시 진행률 자동 증가
- 완료된 문단은 시각적으로 구분 (배경색 변경)

## 4. 고유 락 시스템

### 락 획득 시점
- 번역 작업 화면 진입 시 즉시 락 획득
- API: `POST /api/documents/{id}/lock`

### 락 해제 시점
1. **인계 요청**: `POST /api/documents/{id}/handover`
2. **번역 완료**: `POST /api/documents/{id}/complete`
3. **관리자 강제 해제**: `DELETE /api/documents/{id}/lock` (관리자만)

### 락 상태 표시
- 상단 고정 배지: "🔒 현재 당신이 이 문서를 번역 중입니다"
- 다른 사용자가 접근 시: "⚠️ 이 문서는 다른 봉사자가 작업 중입니다 (읽기 전용)"

## 5. 작업 진행 시나리오

### A. 한 사람이 끝까지 번역
1. 봉사자 진입 → 락 획득
2. 문단 단위 편집 및 완료 체크
3. 진행률 자동 증가
4. [번역 완료] 클릭
5. 문서 상태 → `PENDING_REVIEW`
6. 락 해제

### B. 중간에 인계
1. 봉사자 진입 → 락 획득
2. 일부 문단 완료
3. [인계 요청] 클릭
4. 인계 정보 입력:
   - 완료한 문단 범위 (예: "1-15번 문단 완료")
   - 남은 작업 메모
   - 주의 용어/표현 메모 (선택)
5. 락 해제
6. 문서 상태 → `PENDING_TRANSLATION` (이어하기 가능)
7. 다음 봉사자 진입 시 기존 작업 상태 그대로 이어서 작업

## 6. 백엔드 API 설계

### 락 관련 API
```
POST   /api/documents/{id}/lock
  - 락 획득
  - 응답: { locked: true, lockedBy: { id, name }, lockedAt: timestamp }

DELETE /api/documents/{id}/lock
  - 락 해제 (관리자만)
  - 응답: { success: true }

GET    /api/documents/{id}/lock-status
  - 락 상태 확인
  - 응답: { locked: true/false, lockedBy: {...}, canEdit: true/false }
```

### 작업 관련 API
```
POST   /api/documents/{id}/handover
  - 인계 요청
  - 요청: { completedParagraphs: [1,2,3...], memo: "...", terms: "..." }
  - 응답: { success: true }

POST   /api/documents/{id}/complete
  - 번역 완료
  - 요청: { content: "HTML", completedParagraphs: [...] }
  - 응답: { success: true, status: "PENDING_REVIEW" }

PUT    /api/documents/{id}/translation
  - 작업 중 임시 저장
  - 요청: { content: "HTML", completedParagraphs: [...] }
  - 응답: { success: true }
```

## 7. 데이터베이스 스키마 추가

### DocumentLock 테이블 (또는 Document에 필드 추가)
```sql
- document_id (FK)
- locked_by (FK to User)
- locked_at (timestamp)
- handover_memo (text, nullable)
- completed_paragraphs (JSON, nullable)
```

### DocumentVersion에 작업 정보 추가
```sql
- completed_paragraphs (JSON) - 완료된 문단 ID 배열
- progress_percentage (int) - 진행률
```

## 8. 구현 우선순위

### Phase 1 (MVP)
1. ✅ 3단 레이아웃 기본 구조
2. ✅ Tiptap 에디터 통합
3. ✅ 락 획득/해제 API
4. ✅ 기본 편집 및 저장

### Phase 2
5. ✅ 문단 단위 동기화 하이라이트
6. ✅ 스크롤 동기화
7. ✅ 문단 완료 체크

### Phase 3
8. ✅ 인계 요청 기능
9. ✅ 번역 완료 처리
10. ✅ 진행률 자동 계산

