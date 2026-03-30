import React from 'react';
import { DocumentState } from '../types/translation';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_STYLES } from '../constants/documentStatusLabels';

interface StatusBadgeProps {
  status: DocumentState;
  /** 테이블 등 좁은 영역용 */
  compact?: boolean;
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const style = DOCUMENT_STATUS_STYLES[status];
  const label = DOCUMENT_STATUS_LABELS[status];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: compact ? '2px 5px' : '4px 8px',
        borderRadius: '4px',
        fontSize: compact ? '10px' : '12px',
        fontWeight: 500,
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {label}
    </span>
  );
}


