import React from 'react';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';

interface StatusBadgeProps {
  status: DocumentState;
}

const statusLabels: Record<DocumentState, string> = {
  DRAFT: '초안',
  PENDING_TRANSLATION: '번역 대기',
  IN_TRANSLATION: '번역 중',
  PENDING_REVIEW: '검토 중',
  APPROVED: '승인 완료',
  PUBLISHED: '게시 완료',
};

const statusStyles: Record<DocumentState, { bg: string; text: string }> = {
  DRAFT: { bg: '#DCDCDC', text: '#696969' },
  PENDING_TRANSLATION: { bg: '#DCDCDC', text: '#696969' },
  IN_TRANSLATION: { bg: '#C0C0C0', text: '#000000' },
  PENDING_REVIEW: { bg: '#A9A9A9', text: '#FFFFFF' },
  APPROVED: { bg: '#808080', text: '#FFFFFF' },
  PUBLISHED: { bg: '#808080', text: '#FFFFFF' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status];
  const label = statusLabels[status];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {label}
    </span>
  );
}


