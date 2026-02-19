import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { DocumentListItem, Priority, DocumentFilter, DocumentSortOption } from '../types/document';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { useUser } from '../contexts/UserContext';
import { UserRole } from '../types/user';
import { Modal } from '../components/Modal';
import { translationWorkApi } from '../services/translationWorkApi';

const categories = ['전체', '웹사이트', '마케팅', '고객지원', '기술문서'];
const statuses = [
  '전체',
  '번역 대기',
  '번역 중',
  '검토 중',
  '승인 완료',
  '게시 완료',
];

// DocumentResponse를 DocumentListItem으로 변환
const convertToDocumentListItem = (doc: DocumentResponse): DocumentListItem => {
  // 진행률 계산 (임시로 0%, 나중에 버전 정보에서 계산)
  const progress = 0;
  
  // 마감일 계산 (임시로 createdAt 기준으로 계산, 나중에 deadline 필드 추가 필요)
  const createdAt = new Date(doc.createdAt);
  const now = new Date();
  const diffDays = Math.ceil((createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 - now.getTime()) / (1000 * 60 * 60 * 24));
  const deadline = diffDays > 0 ? `${diffDays}일 후` : '마감됨';
  
  // 우선순위 (임시로 기본값, 나중에 priority 필드 추가 필요)
  const priority = Priority.MEDIUM;
  
  // 카테고리 이름 (임시로 ID 사용, 나중에 카테고리 API로 이름 가져오기)
  const category = doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류';

  return {
    id: doc.id,
    title: doc.title,
    category,
    categoryId: doc.categoryId,
    estimatedLength: doc.estimatedLength,
    progress,
    deadline,
    priority,
    status: doc.status as DocumentState,
    lastModified: doc.updatedAt ? formatRelativeTime(doc.updatedAt) : undefined,
    assignedManager: doc.lastModifiedBy?.name,
    isFinal: false, // 나중에 버전 정보에서 가져오기
    originalUrl: doc.originalUrl,
  };
};

// 상대 시간 포맷팅 (예: "2시간 전")
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}분 전`;
  } else if (diffHours < 24) {
    return `${diffHours}시간 전`;
  } else {
    return `${diffDays}일 전`;
  }
};

// 검색 결과 하이라이트 컴포넌트
const HighlightText: React.FC<{ text: string; searchTerm: string }> = ({ text, searchTerm }) => {
  if (!searchTerm) return <>{text}</>;
  
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '0 2px' }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

export default function Documents() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedStatus, setSelectedStatus] = useState<string>('전체');
  const [selectedManager, setSelectedManager] = useState<string>('전체');
  const [selectedPriority, setSelectedPriority] = useState<string>('전체');
  const [selectedAuthor, setSelectedAuthor] = useState<string>('전체');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [sortOption, setSortOption] = useState<DocumentSortOption>({
    field: 'lastModified',
    order: 'desc',
  });
  const [favoriteStatus, setFavoriteStatus] = useState<Map<number, boolean>>(new Map());
  const [lockStatuses, setLockStatuses] = useState<Map<number, { locked: boolean; lockedBy?: string; lockedAt?: string }>>(new Map());
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [lockReleaseModalOpen, setLockReleaseModalOpen] = useState<boolean>(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentListItem | null>(null);
  const isAdmin = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;

  // API에서 문서 목록 가져오기
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        // 검색어가 있으면 백엔드 검색 API 사용
        const params: { status?: string; categoryId?: number; title?: string } = {};
        if (searchTerm.trim()) {
          params.title = searchTerm.trim();
        }
        // 상태 필터
        if (selectedStatus !== '전체') {
          const statusMap: Record<string, string> = {
            '번역 대기': 'PENDING_TRANSLATION',
            '번역 중': 'IN_TRANSLATION',
            '검토 중': 'PENDING_REVIEW',
            '승인 완료': 'APPROVED',
            '게시 완료': 'PUBLISHED',
          };
          params.status = statusMap[selectedStatus] || selectedStatus;
        }
        // 카테고리 필터
        if (selectedCategory !== '전체') {
          // 카테고리 이름을 ID로 변환 (임시로 1 사용, 나중에 카테고리 API로 가져오기)
          params.categoryId = 1;
        }
        
        const response = await documentApi.getAllDocuments(params);
        const converted = response.map(convertToDocumentListItem);
        setDocuments(converted);
        
        // 관리자 목록 추출 (중복 제거)
        const uniqueManagers = Array.from(
          new Set(converted.map((doc) => doc.assignedManager).filter(Boolean))
        );
        // managers 상태는 나중에 필요하면 추가
      } catch (error) {
        console.error('문서 목록 조회 실패:', error);
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [searchTerm, selectedStatus, selectedCategory]);

  // 찜 상태 및 락 상태 로드
  useEffect(() => {
    const loadStatuses = async () => {
      try {
        const favoriteMap = new Map<number, boolean>();
        const lockMap = new Map<number, { locked: boolean; lockedBy?: string; lockedAt?: string }>();
        
        await Promise.all(
          documents.map(async (doc) => {
            try {
              const [isFavorite, lockStatus] = await Promise.all([
                documentApi.isFavorite(doc.id).catch(() => false),
                translationWorkApi.getLockStatus(doc.id).catch(() => ({ locked: false, canEdit: false })),
              ]);
              favoriteMap.set(doc.id, isFavorite);
              lockMap.set(doc.id, {
                locked: lockStatus.locked,
                lockedBy: lockStatus.lockedBy?.name,
                lockedAt: lockStatus.lockedAt,
              });
            } catch (error) {
              console.warn(`문서 ${doc.id}의 상태를 가져올 수 없습니다:`, error);
              favoriteMap.set(doc.id, false);
              lockMap.set(doc.id, { locked: false });
            }
          })
        );
        setFavoriteStatus(favoriteMap);
        setLockStatuses(lockMap);
      } catch (error) {
        console.error('상태 로드 실패:', error);
      }
    };
    if (documents.length > 0) {
      loadStatuses();
    }
  }, [documents]);

  // 필터링 및 정렬
  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = [...documents];

    // 검색은 백엔드에서 처리하므로 프론트엔드에서는 추가 필터링만 수행

    // 카테고리 필터
    if (selectedCategory !== '전체') {
      filtered = filtered.filter((doc) => doc.category === selectedCategory);
    }

    // 상태 필터
    if (selectedStatus !== '전체') {
      const statusMap: Record<string, DocumentState> = {
        '번역 대기': DocumentState.PENDING_TRANSLATION,
        '번역 중': DocumentState.IN_TRANSLATION,
        '검토 중': DocumentState.PENDING_REVIEW,
        '승인 완료': DocumentState.APPROVED,
        '게시 완료': DocumentState.PUBLISHED,
      };
      filtered = filtered.filter((doc) => doc.status === statusMap[selectedStatus]);
    }

    // 담당자 필터
    if (selectedManager !== '전체') {
      filtered = filtered.filter((doc) => doc.assignedManager === selectedManager);
    }

    // 우선순위 필터
    if (selectedPriority !== '전체') {
      const priorityMap: Record<string, Priority> = {
        '높음': Priority.HIGH,
        '중간': Priority.MEDIUM,
        '낮음': Priority.LOW,
      };
      filtered = filtered.filter((doc) => doc.priority === priorityMap[selectedPriority]);
    }

    // 작성자 필터 (createdBy 정보가 필요하므로 임시로 담당자로 대체)
    if (selectedAuthor !== '전체') {
      filtered = filtered.filter((doc) => doc.assignedManager === selectedAuthor);
    }

    // 날짜 범위 필터
    if (dateRangeStart) {
      const startDate = new Date(dateRangeStart);
      filtered = filtered.filter((doc) => {
        // 문서의 createdAt을 사용 (실제로는 DocumentResponse에서 가져와야 함)
        // 임시로 모든 문서 통과
        return true;
      });
    }
    if (dateRangeEnd) {
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((doc) => {
        // 문서의 createdAt을 사용
        return true;
      });
    }

    // 정렬
    filtered.sort((a, b) => {
      if (sortOption.field === 'lastModified') {
        // 마지막 수정 시점 정렬 (간단히 시간 문자열로 비교)
        const aTime = a.lastModified || '';
        const bTime = b.lastModified || '';
        return sortOption.order === 'asc'
          ? aTime.localeCompare(bTime)
          : bTime.localeCompare(aTime);
      } else if (sortOption.field === 'progress') {
        return sortOption.order === 'asc' ? a.progress - b.progress : b.progress - a.progress;
      } else if (sortOption.field === 'title') {
        return sortOption.order === 'asc'
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
      return 0;
    });

    return filtered;
  }, [documents, selectedCategory, selectedStatus, selectedManager, selectedPriority, selectedAuthor, searchTerm, dateRangeStart, dateRangeEnd, sortOption]);

  const handleManage = (doc: DocumentListItem) => {
    // 문서 관리 화면으로 이동 (나중에 구현)
    console.log('문서 관리:', doc.id);
    // navigate(`/documents/${doc.id}/manage`);
  };

  const handleToggleFavorite = async (doc: DocumentListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const isFavorite = favoriteStatus.get(doc.id) || false;
      if (isFavorite) {
        await documentApi.removeFavorite(doc.id);
        setFavoriteStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(doc.id, false);
          return newMap;
        });
      } else {
        await documentApi.addFavorite(doc.id);
        setFavoriteStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(doc.id, true);
          return newMap;
        });
      }
    } catch (error) {
      console.error('찜 상태 변경 실패:', error);
      alert('찜 상태를 변경하는데 실패했습니다.');
    }
  };

  const handleDeleteClick = (doc: DocumentListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDocument(doc);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedDocument) return;
    try {
      await documentApi.deleteDocument(selectedDocument.id);
      setDocuments(prev => prev.filter(doc => doc.id !== selectedDocument.id));
      setDeleteModalOpen(false);
      setSelectedDocument(null);
      alert('문서가 삭제되었습니다.');
    } catch (error) {
      console.error('문서 삭제 실패:', error);
      alert('문서 삭제에 실패했습니다.');
    }
  };

  const handleLockReleaseClick = (doc: DocumentListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDocument(doc);
    setLockReleaseModalOpen(true);
  };

  const handleLockReleaseConfirm = async () => {
    if (!selectedDocument) return;
    try {
      await translationWorkApi.releaseLockByAdmin(selectedDocument.id);
      setLockStatuses(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedDocument.id, { locked: false });
        return newMap;
      });
      setLockReleaseModalOpen(false);
      setSelectedDocument(null);
      alert('문서 락이 해제되었습니다.');
    } catch (error) {
      console.error('락 해제 실패:', error);
      alert('락 해제에 실패했습니다.');
    }
  };

  const isLockOld = (lockedAt?: string): boolean => {
    if (!lockedAt) return false;
    const lockDate = new Date(lockedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - lockDate.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 24; // 24시간 이상
  };

  const handleExport = async (doc: DocumentListItem) => {
    try {
      // 문서 상세 정보 가져오기
      const documentDetail = await documentApi.getDocument(doc.id);
      
      // 현재 버전 가져오기
      let content = '';
      try {
        const currentVersion = await documentApi.getCurrentVersion(doc.id);
        content = currentVersion.content;
      } catch (error) {
        console.warn('버전 정보를 가져올 수 없습니다:', error);
        content = '내용을 불러올 수 없습니다.';
      }

      // HTML 형식으로 내보내기
      const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentDetail.title}</title>
  <style>
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 {
      color: #333;
      border-bottom: 2px solid #696969;
      padding-bottom: 10px;
    }
    .metadata {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .metadata p {
      margin: 5px 0;
      font-size: 14px;
      color: #666;
    }
    .content {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${documentDetail.title}</h1>
  <div class="metadata">
    <p><strong>원문 언어:</strong> ${documentDetail.sourceLang}</p>
    <p><strong>번역 언어:</strong> ${documentDetail.targetLang}</p>
    <p><strong>상태:</strong> ${documentDetail.status}</p>
    <p><strong>생성일:</strong> ${new Date(documentDetail.createdAt).toLocaleString('ko-KR')}</p>
    <p><strong>수정일:</strong> ${new Date(documentDetail.updatedAt).toLocaleString('ko-KR')}</p>
    ${documentDetail.originalUrl ? `<p><strong>원본 URL:</strong> <a href="${documentDetail.originalUrl}" target="_blank">${documentDetail.originalUrl}</a></p>` : ''}
  </div>
  <div class="content">
    ${content}
  </div>
</body>
</html>
      `;

      // Blob 생성 및 다운로드
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${documentDetail.title.replace(/[^a-z0-9가-힣]/gi, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('문서가 HTML 형식으로 내보내졌습니다.');
    } catch (error) {
      console.error('문서 내보내기 실패:', error);
      alert('문서 내보내기에 실패했습니다.');
    }
  };

  const columns: TableColumn<DocumentListItem>[] = [
    {
      key: 'title',
      label: '문서 제목',
      width: '25%',
      render: (item) => {
        const isFavorite = favoriteStatus.get(item.id) || false;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={(e) => handleToggleFavorite(item, e)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '18px',
                color: isFavorite ? '#FFD700' : '#C0C0C0',
                transition: 'color 0.2s',
              }}
              title={isFavorite ? '찜 해제' : '찜 추가'}
            >
              {isFavorite ? '★' : '☆'}
            </button>
            <span style={{ fontWeight: 500, color: '#000000' }}>
              <HighlightText text={item.title} searchTerm={searchTerm} />
            </span>
          </div>
        );
      },
    },
    {
      key: 'category',
      label: '카테고리',
      width: '10%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>{item.category}</span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: '12%',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'progress',
      label: '작업 진행률',
      width: '12%',
      render: (item) => <ProgressBar progress={item.progress} />,
    },
    {
      key: 'lastModified',
      label: '마지막 수정',
      width: '12%',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.lastModified || '-'}
        </span>
      ),
    },
    {
      key: 'assignedManager',
      label: '담당 관리자',
      width: '12%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.assignedManager || '-'}
        </span>
      ),
    },
    {
      key: 'isFinal',
      label: 'Final',
      width: '8%',
      align: 'center',
      render: (item) => (
        <span style={{ color: item.isFinal ? colors.primaryText : colors.secondaryText }}>
          {item.isFinal ? '✓' : '-'}
        </span>
      ),
    },
    {
      key: 'lockStatus',
      label: '락 상태',
      width: '10%',
      render: (item) => {
        const lockStatus = lockStatuses.get(item.id);
        if (!lockStatus?.locked) return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>;
        const isOld = isLockOld(lockStatus.lockedAt);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: isOld ? '#dc3545' : colors.primaryText, fontSize: '12px', fontWeight: isOld ? 600 : 400 }}>
              {lockStatus.lockedBy || '알 수 없음'}
            </span>
            {isOld && (
              <span style={{ color: '#dc3545', fontSize: '11px' }}>오래된 락</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'action',
      label: '액션',
      width: isAdmin ? '20%' : '12%',
      align: 'right',
      render: (item, index) => {
        const lockStatus = lockStatuses.get(item.id);
        const isLocked = lockStatus?.locked;
        const isOldLock = isLockOld(lockStatus?.lockedAt);
        
        return (
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={(e) => {
                if (e) {
                  e.stopPropagation();
                }
                handleManage(item);
              }}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              관리
            </Button>
            <Button
              variant="secondary"
              onClick={(e) => {
                if (e) {
                  e.stopPropagation();
                }
                handleExport(item);
              }}
              style={{ fontSize: '12px', padding: '6px 12px' }}
              title="문서 내보내기"
            >
              내보내기
            </Button>
            {isAdmin && (
              <>
                {isLocked && (
                  <Button
                    variant={isOldLock ? 'danger' : 'secondary'}
                    onClick={(e) => handleLockReleaseClick(item, e)}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                    title={isOldLock ? '오래된 락 회수' : '락 강제 해제'}
                  >
                    락 해제
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={(e) => handleDeleteClick(item, e)}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  삭제
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: colors.primaryBackground,
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#000000',
            marginBottom: '24px',
          }}
        >
          전체 문서
        </h1>

        {/* 검색 바 */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="문서 제목 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '14px',
                backgroundColor: colors.surface,
                color: '#000000',
              }}
            />
            <Button
              variant="secondary"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              {showAdvancedFilters ? '고급 필터 숨기기' : '고급 필터'}
            </Button>
          </div>

          {/* 고급 필터 */}
          {showAdvancedFilters && (
            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap',
                paddingTop: '12px',
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', color: colors.primaryText }}>날짜 범위:</label>
                <input
                  type="date"
                  value={dateRangeStart}
                  onChange={(e) => setDateRangeStart(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '13px',
                  }}
                />
                <span style={{ fontSize: '13px', color: colors.primaryText }}>~</span>
                <input
                  type="date"
                  value={dateRangeEnd}
                  onChange={(e) => setDateRangeEnd(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', color: colors.primaryText }}>우선순위:</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '13px',
                    backgroundColor: colors.surface,
                    color: '#000000',
                    cursor: 'pointer',
                  }}
                >
                  <option value="전체">전체</option>
                  <option value="높음">높음</option>
                  <option value="중간">중간</option>
                  <option value="낮음">낮음</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 필터/정렬 바 */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: colors.primaryText }}>카테고리:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: colors.surface,
                color: '#000000',
                cursor: 'pointer',
              }}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: colors.primaryText }}>상태:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: colors.surface,
                color: '#000000',
                cursor: 'pointer',
              }}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: colors.primaryText }}>담당자:</label>
            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: colors.surface,
                color: '#000000',
                cursor: 'pointer',
              }}
            >
              <option value="전체">전체</option>
              {Array.from(new Set(documents.map((doc) => doc.assignedManager).filter(Boolean))).map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: colors.primaryText }}>작성자:</label>
            <select
              value={selectedAuthor}
              onChange={(e) => setSelectedAuthor(e.target.value)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: colors.surface,
                color: '#000000',
                cursor: 'pointer',
              }}
            >
              <option value="전체">전체</option>
              {Array.from(new Set(documents.map((doc) => doc.assignedManager).filter(Boolean))).map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: colors.primaryText }}>정렬:</label>
            <select
              value={`${sortOption.field}-${sortOption.order}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortOption({ field: field as any, order: order as 'asc' | 'desc' });
              }}
              style={{
                padding: '6px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: colors.surface,
                color: '#000000',
                cursor: 'pointer',
              }}
            >
              <option value="lastModified-desc">최근 수정순</option>
              <option value="lastModified-asc">오래된 수정순</option>
              <option value="progress-desc">진행률 높은 순</option>
              <option value="progress-asc">진행률 낮은 순</option>
              <option value="title-asc">제목 가나다순</option>
            </select>
          </div>
        </div>

        {/* 테이블 */}
        {loading ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: colors.primaryText,
              fontSize: '13px',
            }}
          >
            로딩 중...
          </div>
        ) : (
          <Table
            columns={columns}
            data={filteredAndSortedDocuments}
            onRowClick={(item) => {
              // 행 클릭 시 문서 상세 관리 화면으로 이동 (나중에 구현)
              console.log('문서 클릭:', item.id);
              // navigate(`/documents/${item.id}`);
            }}
            emptyMessage="문서가 없습니다."
          />
        )}

        {/* 삭제 확인 모달 */}
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedDocument(null);
          }}
          title="문서 삭제 확인"
          onConfirm={handleDeleteConfirm}
          confirmText="삭제"
          cancelText="취소"
          variant="danger"
        >
          <p>
            정말로 "{selectedDocument?.title}" 문서를 삭제하시겠습니까?
            <br />
            이 작업은 되돌릴 수 없습니다.
          </p>
        </Modal>

        {/* 락 해제 확인 모달 */}
        <Modal
          isOpen={lockReleaseModalOpen}
          onClose={() => {
            setLockReleaseModalOpen(false);
            setSelectedDocument(null);
          }}
          title="문서 락 강제 해제"
          onConfirm={handleLockReleaseConfirm}
          confirmText="해제"
          cancelText="취소"
          variant="danger"
        >
          <p>
            "{selectedDocument?.title}" 문서의 락을 강제로 해제하시겠습니까?
            {selectedDocument && lockStatuses.get(selectedDocument.id)?.lockedBy && (
              <>
                <br />
                현재 락 보유자: {lockStatuses.get(selectedDocument.id)?.lockedBy}
              </>
            )}
          </p>
        </Modal>
      </div>
    </div>
  );
}

