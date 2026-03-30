import { DocumentState } from '../types/translation';

/** StatusBadge·목록 필터 공통 (표시 문구 단일 소스) */
export const DOCUMENT_STATUS_LABELS: Record<DocumentState, string> = {
  /** 저장 전·임시 문서 (API DRAFT) */
  DRAFT: '임시',
  /** 번역 대기 단계는 UI에서 '초안'으로 통일 (번역 대기 문구 미사용) */
  PENDING_TRANSLATION: '초안',
  IN_TRANSLATION: '번역 중',
  PENDING_REVIEW: '검토 중',
  APPROVED: '승인 완료',
  PUBLISHED: '게시 완료',
};

/** 필터/설정 UI 순서 (DRAFT는 목록에 거의 없어서 제외, PENDING_TRANSLATION=초안) */
export const DOCUMENT_STATUS_ORDER: DocumentState[] = [
  DocumentState.PENDING_TRANSLATION,
  DocumentState.IN_TRANSLATION,
  DocumentState.PENDING_REVIEW,
  DocumentState.APPROVED,
  DocumentState.PUBLISHED,
];

/** StatusBadge·필터 버튼 공통 배경/글자색 */
export const DOCUMENT_STATUS_STYLES: Record<DocumentState, { bg: string; text: string }> = {
  DRAFT: { bg: '#E5E7EB', text: '#4B5563' },
  PENDING_TRANSLATION: { bg: '#DBEAFE', text: '#1D4ED8' },
  IN_TRANSLATION: { bg: '#FFEDD5', text: '#C2410C' },
  PENDING_REVIEW: { bg: '#EDE9FE', text: '#5B21B6' },
  APPROVED: { bg: '#D1FAE5', text: '#047857' },
  PUBLISHED: { bg: '#CCFBF1', text: '#0F766E' },
};
