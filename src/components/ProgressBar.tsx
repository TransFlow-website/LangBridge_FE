import React from 'react';
import { colors } from '../constants/designTokens';

interface ProgressBarProps {
  progress: number; // 0-100
  showLabel?: boolean;
  height?: number;
}

export function ProgressBar({ progress, showLabel = true, height = 8 }: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
      }}
    >
      <div
        style={{
          flex: 1,
          height: `${height}px`,
          backgroundColor: colors.primaryBackground,
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${clampedProgress}%`,
            height: '100%',
            backgroundColor: colors.secondaryText,
            transition: 'width 150ms ease',
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: colors.primaryText,
            minWidth: '40px',
            textAlign: 'right',
          }}
        >
          {clampedProgress}%
        </span>
      )}
    </div>
  );
}


