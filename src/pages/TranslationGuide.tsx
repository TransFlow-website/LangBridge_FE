import React from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useNavigate } from 'react-router-dom';

const TranslationGuide: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      className="p-8"
      style={{
        backgroundColor: '#DCDCDC',
        minHeight: '100vh',
      }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              marginBottom: '8px',
            }}
          >
            번역 가이드
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: '#696969',
              fontFamily: 'system-ui, Pretendard, sans-serif',
            }}
          >
            번역 작업 시 참고할 가이드라인입니다
          </p>
        </div>

        <div className="space-y-6">
          {/* 기본 원칙 */}
          <Card priority="normal">
            <div className="space-y-4">
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  marginBottom: '4px',
                }}
              >
                기본 원칙
              </h2>
              <div
                style={{
                  fontSize: '13px',
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  lineHeight: '1.6',
                }}
              >
                <p style={{ marginBottom: '12px' }}>
                  번역은 원문의 의미를 정확히 전달하면서도 자연스러운 한국어로 표현해야 합니다.
                </p>
                <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
                  <li style={{ marginBottom: '8px' }}>원문의 톤과 스타일을 유지합니다</li>
                  <li style={{ marginBottom: '8px' }}>문화적 맥락을 고려하여 번역합니다</li>
                  <li style={{ marginBottom: '8px' }}>용어집에 등록된 용어를 우선 사용합니다</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* 번역 프로세스 */}
          <Card priority="normal">
            <div className="space-y-4">
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  marginBottom: '4px',
                }}
              >
                번역 프로세스
              </h2>
              <div
                style={{
                  fontSize: '13px',
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  lineHeight: '1.6',
                }}
              >
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    1. 문서 선택
                  </div>
                  <div style={{ fontSize: '12px', color: '#696969' }}>
                    번역이 필요한 문서를 선택하고 작업을 시작합니다
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    2. 번역 작업
                  </div>
                  <div style={{ fontSize: '12px', color: '#696969' }}>
                    원문을 읽고 자연스러운 한국어로 번역합니다
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    3. 검토 및 수정
                  </div>
                  <div style={{ fontSize: '12px', color: '#696969' }}>
                    번역 내용을 다시 확인하고 필요한 경우 수정합니다
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    4. 제출
                  </div>
                  <div style={{ fontSize: '12px', color: '#696969' }}>
                    완료된 번역을 제출합니다
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* 용어집 사용 */}
          <Card priority="normal">
            <div className="space-y-4">
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  marginBottom: '4px',
                }}
              >
                용어집 사용
              </h2>
              <div
                style={{
                  fontSize: '13px',
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  lineHeight: '1.6',
                }}
              >
                <p style={{ marginBottom: '12px' }}>
                  용어집에 등록된 용어는 일관성 있게 사용해야 합니다. 번역 작업 전 용어집을 확인하세요.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/glossary')}
                  className="w-full"
                >
                  용어집 열기
                </Button>
              </div>
            </div>
          </Card>

          {/* 주의사항 */}
          <Card priority="normal">
            <div className="space-y-4">
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  marginBottom: '4px',
                }}
              >
                주의사항
              </h2>
              <div
                style={{
                  fontSize: '13px',
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  lineHeight: '1.6',
                }}
              >
                <ul style={{ paddingLeft: '20px' }}>
                  <li style={{ marginBottom: '8px' }}>
                    번역 중 의문이 생기면 용어집을 먼저 확인하세요
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    특수 용어나 고유명사는 원문을 함께 표기하는 것을 권장합니다
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    번역 완료 후 반드시 전체 내용을 다시 검토하세요
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TranslationGuide;


