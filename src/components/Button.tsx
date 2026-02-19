import React, { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'disabled' | 'danger';

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  onClick,
  className = '',
  type = 'button',
  style,
}) => {
  const getButtonStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          background: '#696969',
          color: '#FFFFFF',
          border: 'none',
          cursor: 'pointer',
        };
      case 'secondary':
        return {
          background: 'transparent',
          color: '#696969',
          border: '1px solid #A9A9A9',
          cursor: 'pointer',
        };
      case 'disabled':
        return {
          background: '#DCDCDC',
          color: '#A9A9A9',
          border: 'none',
          cursor: 'not-allowed',
        };
      case 'danger':
        return {
          background: '#dc3545',
          color: '#FFFFFF',
          border: 'none',
          cursor: 'pointer',
        };
    }
  };

  const styles = getButtonStyles();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (variant !== 'disabled' && onClick) {
      onClick(e);
    }
  };

  const isDisabled = variant === 'disabled';

  return (
    <button
      type={type}
      onClick={handleClick}
      className={`rounded-lg transition-all duration-150 ${className}`}
      style={{
        background: styles.background,
        color: styles.color,
        border: styles.border,
        cursor: styles.cursor,
        padding: '8px 16px',
        fontSize: '13px',
        fontFamily: 'system-ui, Pretendard, sans-serif',
        fontWeight: 500,
        ...style,
      }}
      disabled={isDisabled}
    >
      {children}
    </button>
  );
};

