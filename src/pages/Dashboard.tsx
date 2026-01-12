import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { roleLevelToRole } from '../utils/hasAccess';
import { UserRole } from '../types/user';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Document, DashboardData } from '../types/dashboard';

// 더미 데이터
const mockDashboardData: DashboardData = {
  pendingDocuments: [
    { id: 1, title: '웹사이트 이용약관', category: '법률 문서', estimatedVolume: '약 2,000자' },
    { id: 2, title: '제품 사용 설명서', category: '기술 문서', estimatedVolume: '약 1,500자' },
    { id: 3, title: '고객 지원 가이드', category: '고객 서비스', estimatedVolume: '약 3,000자' },
  ],
  workingDocuments: [
    { id: 4, title: '마케팅 자료 번역', category: '마케팅', lastModified: '2시간 전' },
    { id: 5, title: '교육 자료 번역', category: '교육', lastModified: '1일 전' },
  ],
  reviewPendingCount: 5,
  latestReviewDocument: {
    id: 6,
    title: '공식 발표문',
    category: '공식 문서',
  },
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();

  const userRole = useMemo(() => {
    if (!user) return null;
    return roleLevelToRole(user.roleLevel);
  }, [user]);

  const isAdmin = useMemo(() => {
    return userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
  }, [userRole]);

  const data = mockDashboardData;

  return (
    <div
      className="p-8"
      style={{
        backgroundColor: '#DCDCDC',
        minHeight: '100vh',
      }}
    >
      <div className="max-w-7xl mx-auto">
        {/* 2열 그리드 (데스크톱), 1열 스택 (모바일) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 카드 1: 지금 번역이 필요한 문서 */}
          <Card priority="primary">
            <div className="space-y-4">
              <div>
                <h2
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#000000',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                    marginBottom: '4px',
                  }}
                >
                  지금 번역이 필요한 문서
                </h2>
                <p
                  style={{
                    fontSize: '12px',
                    color: '#696969',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                  }}
                >
                  즉시 참여 가능한 작업입니다
                </p>
              </div>

              {data.pendingDocuments.length > 0 ? (
                <div className="space-y-3">
                  {data.pendingDocuments.slice(0, 3).map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        padding: '12px',
                        border: '1px solid #C0C0C0',
                        borderRadius: '8px',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          color: '#000000',
                          fontFamily: 'system-ui, Pretendard, sans-serif',
                          fontWeight: 500,
                          marginBottom: '4px',
                        }}
                      >
                        {doc.title}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#696969',
                          fontFamily: 'system-ui, Pretendard, sans-serif',
                          marginBottom: '2px',
                        }}
                      >
                        {doc.category}
                      </div>
                      {doc.estimatedVolume && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#696969',
                            fontFamily: 'system-ui, Pretendard, sans-serif',
                          }}
                        >
                          {doc.estimatedVolume}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '13px',
                    color: '#696969',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                    padding: '20px 0',
                  }}
                >
                  현재 번역이 필요한 문서가 없습니다
                </div>
              )}

              <Button
                variant="primary"
                onClick={() => navigate('/translations/pending')}
                className="w-full"
              >
                번역 시작하기
              </Button>
            </div>
          </Card>

          {/* 카드 2: 내가 작업 중인 문서 */}
          <Card priority="normal">
            <div className="space-y-4">
              <div>
                <h2
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#000000',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                    marginBottom: '4px',
                  }}
                >
                  내가 작업 중인 문서
                </h2>
                {data.workingDocuments.length > 0 && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#696969',
                      fontFamily: 'system-ui, Pretendard, sans-serif',
                    }}
                  >
                    마지막 수정: {data.workingDocuments[0]?.lastModified || '정보 없음'}
                  </p>
                )}
              </div>

              {data.workingDocuments.length > 0 ? (
                <div className="space-y-3">
                  {data.workingDocuments.slice(0, 3).map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        padding: '12px',
                        border: '1px solid #C0C0C0',
                        borderRadius: '8px',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          color: '#000000',
                          fontFamily: 'system-ui, Pretendard, sans-serif',
                          fontWeight: 500,
                          marginBottom: '4px',
                        }}
                      >
                        {doc.title}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#696969',
                          fontFamily: 'system-ui, Pretendard, sans-serif',
                          marginBottom: '2px',
                        }}
                      >
                        {doc.category}
                      </div>
                      {doc.lastModified && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#696969',
                            fontFamily: 'system-ui, Pretendard, sans-serif',
                          }}
                        >
                          {doc.lastModified}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '13px',
                    color: '#696969',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                    padding: '20px 0',
                  }}
                >
                  현재 작업 중인 문서가 없습니다
                </div>
              )}
            </div>
          </Card>

          {/* 카드 3: 검토 대기 문서 (관리자만) */}
          {isAdmin && (
            <Card priority="normal">
              <div className="space-y-4">
                <div>
                  <h2
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#000000',
                      fontFamily: 'system-ui, Pretendard, sans-serif',
                      marginBottom: '4px',
                    }}
                  >
                    검토 대기 문서
                  </h2>
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#696969',
                      fontFamily: 'system-ui, Pretendard, sans-serif',
                    }}
                  >
                    대기 개수: {data.reviewPendingCount || 0}개
                  </p>
                </div>

                {data.latestReviewDocument ? (
                  <div
                    style={{
                      padding: '12px',
                      border: '1px solid #C0C0C0',
                      borderRadius: '8px',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#000000',
                        fontFamily: 'system-ui, Pretendard, sans-serif',
                        fontWeight: 500,
                        marginBottom: '4px',
                      }}
                    >
                      {data.latestReviewDocument.title}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#696969',
                        fontFamily: 'system-ui, Pretendard, sans-serif',
                      }}
                    >
                      {data.latestReviewDocument.category}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#696969',
                      fontFamily: 'system-ui, Pretendard, sans-serif',
                      padding: '20px 0',
                    }}
                  >
                    검토 대기 문서가 없습니다
                  </div>
                )}

                <Button
                  variant="secondary"
                  onClick={() => navigate('/reviews')}
                  className="w-full"
                >
                  검토하러 가기
                </Button>
              </div>
            </Card>
          )}

          {/* 카드 4: 번역 가이드 / 용어집 */}
          <Card priority="secondary">
            <div className="space-y-4">
              <div>
                <h2
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#000000',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                    marginBottom: '4px',
                  }}
                >
                  번역 가이드 / 용어집
                </h2>
                <p
                  style={{
                    fontSize: '12px',
                    color: '#696969',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                  }}
                >
                  번역 작업 시 참고할 용어집을 확인하세요
                </p>
              </div>

              <Button
                variant="secondary"
                onClick={() => navigate('/glossary')}
                className="w-full"
              >
                용어집 열기
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

