import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { colors } from '../constants/designTokens';
import { authApi } from '../services/authApi';

export default function Home() {
  const navigate = useNavigate();
  const { user, loading, refreshUser } = useUser();
  const [searchParams] = useSearchParams();
  const [loginError, setLoginError] = useState<string | null>(null);

  // OAuth 콜백 처리: 에러만 처리 (토큰은 UserContext에서 처리)
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      setLoginError('로그인에 실패했습니다. 다시 시도해주세요.');
      // URL에서 에러 파라미터 제거
      window.history.replaceState({}, document.title, '/');
    }
  }, [searchParams]);

  // 로그인된 사용자는 자동으로 대시보드로 리다이렉트
  useEffect(() => {
    const token = searchParams.get('token');
    
    // 로딩 중이면 대기
    if (loading) {
      console.log('⏳ 사용자 정보 로딩 중...');
      return;
    }

    // 사용자 정보가 로드된 경우
    if (user) {
      console.log('✅ 사용자 정보 로드 완료:', user.email);
      
      // OAuth 콜백인 경우 URL 정리
      if (token) {
        window.history.replaceState({}, document.title, '/');
      }
      
      // 리다이렉트
      console.log('🚀 대시보드로 리다이렉트...');
      navigate('/dashboard', { replace: true });
    } else {
      console.log('ℹ️ 사용자 정보가 없습니다.');
    }
  }, [user, loading, navigate, searchParams]);

  // Google OAuth 로그인
  const handleGoogleLogin = () => {
    // 백엔드 OAuth2 엔드포인트로 리다이렉트
    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    window.location.href = `${apiBaseUrl}/oauth2/authorization/google`;
  };

  // 로딩 중이거나 이미 로그인된 경우 아무것도 표시하지 않음
  if (loading || user) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.primaryBackground,
        padding: '24px',
      }}
    >
      {/* 서비스 로고/이름 */}
      <div
        style={{
          marginBottom: '48px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: colors.primaryText,
            margin: 0,
            letterSpacing: '-0.5px',
          }}
        >
          LangBridge
        </h1>
      </div>

      {/* 에러 메시지 */}
      {loginError && (
        <div
          style={{
            marginBottom: '24px',
            padding: '12px 16px',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            color: colors.primaryText,
            fontSize: '13px',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          ⚠️ {loginError}
        </div>
      )}

      {/* Google 로그인 버튼 */}
      <button
        onClick={handleGoogleLogin}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 24px',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: '6px',
          color: colors.primaryText,
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'background-color 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = colors.sidebarBackground;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = colors.surface;
        }}
      >
        {/* Google 아이콘 (SVG) */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        <span>Google 계정으로 로그인</span>
      </button>
    </div>
  );
}

