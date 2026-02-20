import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { roleLevelToRole } from '../utils/hasAccess';
import { UserRole } from '../types/user';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Document, DashboardData } from '../types/dashboard';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { reviewApi, ReviewResponse } from '../services/reviewApi';
import { categoryApi, CategoryResponse } from '../services/categoryApi';
import { translationWorkApi } from '../services/translationWorkApi';
import { formatLastModifiedDate } from '../utils/dateUtils';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [data, setData] = useState<DashboardData>({
    pendingDocuments: [],
    workingDocuments: [],
    approvedDocuments: [],
    rejectedDocuments: [],
  });
  const [loading, setLoading] = useState(true);
  const [categoryMap, setCategoryMap] = useState<Map<number, string>>(new Map());
  const [favoriteStatus, setFavoriteStatus] = useState<Map<number, boolean>>(new Map());

  const userRole = useMemo(() => {
    if (!user) return null;
    return roleLevelToRole(user.roleLevel);
  }, [user]);

  const handleToggleFavorite = async (docId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const isFavorite = favoriteStatus.get(docId) || false;
      if (isFavorite) {
        await documentApi.removeFavorite(docId);
        setFavoriteStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(docId, false);
          return newMap;
        });
      } else {
        await documentApi.addFavorite(docId);
        setFavoriteStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(docId, true);
          return newMap;
        });
      }
    } catch (error) {
      console.error('찜 상태 변경 실패:', error);
      alert('찜 상태를 변경하는데 실패했습니다.');
    }
  };

  const isAdmin = useMemo(() => {
    return userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
  }, [userRole]);

  // 카테고리 목록 로드
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categoryList = await categoryApi.getAllCategories();
        const map = new Map<number, string>();
        categoryList.forEach(cat => {
          map.set(cat.id, cat.name);
        });
        setCategoryMap(map);
      } catch (error) {
        console.error('카테고리 목록 로드 실패:', error);
      }
    };
    loadCategories();
  }, []);

  // 대시보드 데이터 로드
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);

        // 1. 번역 대기 문서
        const pendingDocs = await documentApi.getAllDocuments({ status: 'PENDING_TRANSLATION' });
        const pendingDocuments: Document[] = pendingDocs.slice(0, 3).map(doc => ({
          id: doc.id,
          title: doc.title,
          category: doc.categoryId && categoryMap.has(doc.categoryId) 
            ? categoryMap.get(doc.categoryId)! 
            : (doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류'),
          estimatedVolume: doc.estimatedLength ? `약 ${doc.estimatedLength}자` : undefined,
          progress: 0,
        }));

        // 2. 내가 작업 중인 문서 (IN_TRANSLATION이면서 현재 사용자가 락을 보유한 문서만)
        const inTranslationDocs = await documentApi.getAllDocuments({ status: 'IN_TRANSLATION' });
        const myWorkingDocs: DocumentResponse[] = [];
        if (user?.id) {
          for (const doc of inTranslationDocs) {
            try {
              const lockStatus = await translationWorkApi.getLockStatus(doc.id);
              if (!lockStatus) continue;
              const lockedById = lockStatus.lockedBy?.id;
              const myId = user.id;
              const isMyLock = lockStatus.locked && lockStatus.canEdit &&
                lockedById !== undefined && myId !== undefined &&
                Number(lockedById) === Number(myId);
              if (isMyLock) myWorkingDocs.push(doc);
            } catch {
              // 락 조회 실패 시 해당 문서 제외
            }
          }
        }
        const workingDocuments: Document[] = myWorkingDocs.slice(0, 3).map(doc => ({
          id: doc.id,
          title: doc.title,
          category: doc.categoryId && categoryMap.has(doc.categoryId)
            ? categoryMap.get(doc.categoryId)!
            : (doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류'),
          lastModified: doc.updatedAt ? formatLastModifiedDate(doc.updatedAt) : undefined,
        }));

        // 3. 검토 대기 문서 (관리자만)
        let reviewPendingCount = 0;
        let latestReviewDocument: Document | undefined;
        if (isAdmin) {
          const reviewPendingDocs = await documentApi.getAllDocuments({ status: 'PENDING_REVIEW' });
          reviewPendingCount = reviewPendingDocs.length;
          if (reviewPendingDocs.length > 0) {
            const latestDoc = reviewPendingDocs[0];
            const reviews = await reviewApi.getAllReviews({ documentId: latestDoc.id, status: 'PENDING' });
            if (reviews.length > 0) {
              latestReviewDocument = {
                id: latestDoc.id,
                title: latestDoc.title,
                category: latestDoc.categoryId && categoryMap.has(latestDoc.categoryId)
                  ? categoryMap.get(latestDoc.categoryId)!
                  : (latestDoc.categoryId ? `카테고리 ${latestDoc.categoryId}` : '미분류'),
                translator: reviews[0].reviewer?.name,
              };
            }
          }
        }

        // 4. 승인된 문서 (관리자만) - APPROVED 상태의 문서 또는 APPROVED 리뷰가 있는 문서
        let approvedDocuments: Document[] = [];
        if (isAdmin) {
          try {
            // 방법 1: APPROVED 상태의 문서 가져오기
            const approvedDocs = await documentApi.getAllDocuments({ status: 'APPROVED' });
            console.log('✅ APPROVED 상태 문서:', approvedDocs.length, '개');
            
            // 방법 2: APPROVED 리뷰가 있는 문서도 확인
            const approvedReviews = await reviewApi.getAllReviews({ status: 'APPROVED' });
            console.log('✅ APPROVED 리뷰:', approvedReviews.length, '개');
            
            // 두 방법을 결합하여 중복 제거
            const approvedDocIds = new Set<number>();
            
            // APPROVED 상태 문서 추가
            approvedDocs.forEach(doc => approvedDocIds.add(doc.id));
            
            // APPROVED 리뷰가 있는 문서 추가
            approvedReviews.forEach(review => approvedDocIds.add(review.document.id));
            
            // 모든 승인된 문서 가져오기
            const allApprovedDocs = await Promise.all(
              Array.from(approvedDocIds).slice(0, 5).map(async (docId) => {
                try {
                  return await documentApi.getDocument(docId);
                } catch (error) {
                  console.error(`문서 ${docId} 조회 실패:`, error);
                  return null;
                }
              })
            );
            
            // 최신 순으로 정렬 (updatedAt 기준)
            approvedDocuments = allApprovedDocs
              .filter((doc): doc is DocumentResponse => doc !== null)
              .sort((a, b) => {
                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTime - aTime; // 최신순
              })
              .slice(0, 3)
              .map(doc => {
                const review = approvedReviews.find(r => r.document.id === doc.id);
                return {
                  id: doc.id,
                  title: doc.title,
                  category: doc.categoryId && categoryMap.has(doc.categoryId)
                    ? categoryMap.get(doc.categoryId)!
                    : (doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류'),
                  lastModified: review?.finalApprovalAt 
                    ? formatLastModifiedDate(review.finalApprovalAt)
                    : (doc.updatedAt ? formatLastModifiedDate(doc.updatedAt) : undefined),
                };
              });
            
            console.log('✅ 최종 승인된 문서:', approvedDocuments.length, '개');
          } catch (error) {
            console.error('승인된 문서 조회 실패:', error);
          }
        }

        // 5. 반려된 문서 (관리자만) - REJECTED 상태의 리뷰가 있는 문서들
        let rejectedDocuments: Document[] = [];
        if (isAdmin) {
          const rejectedReviews = await reviewApi.getAllReviews({ status: 'REJECTED' });
          const rejectedDocIds = new Set(rejectedReviews.map(r => r.document.id));
          const rejectedDocs = await Promise.all(
            Array.from(rejectedDocIds).slice(0, 3).map(async (docId) => {
              try {
                return await documentApi.getDocument(docId);
              } catch (error) {
                console.error(`문서 ${docId} 조회 실패:`, error);
                return null;
              }
            })
          );
          rejectedDocuments = rejectedDocs
            .filter((doc): doc is DocumentResponse => doc !== null)
            .map(doc => {
              const review = rejectedReviews.find(r => r.document.id === doc.id);
              return {
                id: doc.id,
                title: doc.title,
                category: doc.categoryId && categoryMap.has(doc.categoryId)
                  ? categoryMap.get(doc.categoryId)!
                  : (doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류'),
                lastModified: review?.reviewedAt ? formatLastModifiedDate(review.reviewedAt) : undefined,
              };
            });
        }

        setData({
          pendingDocuments,
          workingDocuments,
          reviewPendingCount,
          latestReviewDocument,
          approvedDocuments,
          rejectedDocuments,
        });
      } catch (error) {
        console.error('대시보드 데이터 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    // 카테고리 맵이 로드되거나 관리자가 아닌 경우 데이터 로드
    // 관리자인 경우 카테고리 맵이 없어도 데이터 로드 (카테고리 없이 표시)
    if (!isAdmin || categoryMap.size > 0) {
      loadDashboardData();
    } else if (isAdmin) {
      // 관리자인데 카테고리 맵이 아직 로드되지 않은 경우, 일단 데이터 로드 (카테고리 ID로 표시)
      loadDashboardData();
    }
  }, [isAdmin, categoryMap, user?.id]);

  // 찜 상태 로드
  useEffect(() => {
    const loadFavoriteStatus = async () => {
      try {
        const allDocIds = [
          ...data.pendingDocuments.map(d => d.id),
          ...data.workingDocuments.map(d => d.id),
          ...(data.approvedDocuments || []).map(d => d.id),
          ...(data.rejectedDocuments || []).map(d => d.id),
          ...(data.latestReviewDocument ? [data.latestReviewDocument.id] : []),
        ];
        const favoriteMap = new Map<number, boolean>();
        await Promise.all(
          allDocIds.map(async (docId) => {
            try {
              const isFavorite = await documentApi.isFavorite(docId);
              favoriteMap.set(docId, isFavorite);
            } catch (error) {
              console.warn(`문서 ${docId}의 찜 상태를 가져올 수 없습니다:`, error);
              favoriteMap.set(docId, false);
            }
          })
        );
        setFavoriteStatus(favoriteMap);
      } catch (error) {
        console.error('찜 상태 로드 실패:', error);
      }
    };
    if (data.pendingDocuments.length > 0 || data.workingDocuments.length > 0) {
      loadFavoriteStatus();
    }
  }, [data]);

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
                        backgroundColor: '#D3D3D3', // lightgray - 예전 버전 (카드 1용)
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: 1 }}>
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
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#696969',
                          fontFamily: 'system-ui, Pretendard, sans-serif',
                          marginLeft: '12px',
                          flexShrink: 0,
                          textAlign: 'right',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        {doc.estimatedVolume && (
                          <div>{doc.estimatedVolume}</div>
                        )}
                        <div>
                          {doc.progress !== undefined ? `${doc.progress}%` : '0%'} 완료
                        </div>
                      </div>
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
                번역하러 가기
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
                        backgroundColor: '#D3D3D3', // lightgray - 예전 버전 (카드 2용)
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: '13px',
                            color: '#000000',
                            fontFamily: 'system-ui, Pretendard, sans-serif',
                            fontWeight: 500,
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <button
                            onClick={(e) => handleToggleFavorite(doc.id, e)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '16px',
                              color: (favoriteStatus.get(doc.id) || false) ? '#FFD700' : '#C0C0C0',
                              transition: 'color 0.2s',
                            }}
                            title={(favoriteStatus.get(doc.id) || false) ? '찜 해제' : '찜 추가'}
                          >
                            {(favoriteStatus.get(doc.id) || false) ? '★' : '☆'}
                          </button>
                          <span>{doc.title}</span>
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#696969',
                            fontFamily: 'system-ui, Pretendard, sans-serif',
                          }}
                        >
                          {doc.category}
                        </div>
                      </div>
                      {doc.lastModified && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#696969',
                            fontFamily: 'system-ui, Pretendard, sans-serif',
                            marginLeft: '12px',
                            flexShrink: 0,
                            textAlign: 'right',
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
                      backgroundColor: '#D3D3D3', // lightgray - 예전 버전
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: 1 }}>
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
                    {data.latestReviewDocument.translator && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#696969',
                          fontFamily: 'system-ui, Pretendard, sans-serif',
                          marginLeft: '12px',
                          flexShrink: 0,
                          textAlign: 'right',
                        }}
                      >
                        {data.latestReviewDocument.translator}
                      </div>
                    )}
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

          {/* 카드 4: 승인된 문서 (관리자만) */}
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
                    승인된 문서
                  </h2>
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#696969',
                      fontFamily: 'system-ui, Pretendard, sans-serif',
                    }}
                  >
                    최근 승인된 번역 문서입니다
                  </p>
                </div>

                {data.approvedDocuments && data.approvedDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {data.approvedDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          padding: '12px',
                          border: '1px solid #C0C0C0',
                          borderRadius: '8px',
                          backgroundColor: '#D3D3D3',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ flex: 1 }}>
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
                            }}
                          >
                            {doc.category}
                          </div>
                        </div>
                        {doc.lastModified && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#696969',
                              fontFamily: 'system-ui, Pretendard, sans-serif',
                              marginLeft: '12px',
                              flexShrink: 0,
                              textAlign: 'right',
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
                    승인된 문서가 없습니다
                  </div>
                )}

                <Button
                  variant="secondary"
                  onClick={() => navigate('/documents?status=APPROVED')}
                  className="w-full"
                >
                  승인된 문서 보기
                </Button>
              </div>
            </Card>
          )}

          {/* 카드 5: 반려된 문서 (관리자만) */}
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
                    반려된 문서
                  </h2>
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#696969',
                      fontFamily: 'system-ui, Pretendard, sans-serif',
                    }}
                  >
                    최근 반려된 번역 문서입니다
                  </p>
                </div>

                {data.rejectedDocuments && data.rejectedDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {data.rejectedDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          padding: '12px',
                          border: '1px solid #C0C0C0',
                          borderRadius: '8px',
                          backgroundColor: '#D3D3D3',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ flex: 1 }}>
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
                            }}
                          >
                            {doc.category}
                          </div>
                        </div>
                        {doc.lastModified && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#696969',
                              fontFamily: 'system-ui, Pretendard, sans-serif',
                              marginLeft: '12px',
                              flexShrink: 0,
                              textAlign: 'right',
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
                    반려된 문서가 없습니다
                  </div>
                )}

                <Button
                  variant="secondary"
                  onClick={() => {
                    // 반려된 문서는 REJECTED 상태의 리뷰를 통해 확인
                    navigate('/reviews');
                  }}
                  className="w-full"
                >
                  반려된 문서 보기
                </Button>
              </div>
            </Card>
          )}

          {/* 카드 6: 번역 가이드 / 용어집 */}
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

              <div className="space-y-2">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/translation-guide')}
                  className="w-full"
                >
                  번역 가이드
                </Button>
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
        </div>
        
      </div>
    </div>
  );
};

export default Dashboard;



