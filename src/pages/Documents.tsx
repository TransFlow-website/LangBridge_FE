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

export default function Documents() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedStatus, setSelectedStatus] = useState<string>('전체');
  const [selectedManager, setSelectedManager] = useState<string>('전체');
  const [sortOption, setSortOption] = useState<DocumentSortOption>({
    field: 'lastModified',
    order: 'desc',
  });
  const [favoriteStatus, setFavoriteStatus] = useState<Map<number, boolean>>(new Map());

  // API에서 문서 목록 가져오기
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        const response = await documentApi.getAllDocuments();
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
  }, []);

  // 찜 상태 로드
  useEffect(() => {
    const loadFavoriteStatus = async () => {
      try {
        const favoriteMap = new Map<number, boolean>();
        await Promise.all(
          documents.map(async (doc) => {
            try {
              const isFavorite = await documentApi.isFavorite(doc.id);
              favoriteMap.set(doc.id, isFavorite);
            } catch (error) {
              console.warn(`문서 ${doc.id}의 찜 상태를 가져올 수 없습니다:`, error);
              favoriteMap.set(doc.id, false);
            }
          })
        );
        setFavoriteStatus(favoriteMap);
      } catch (error) {
        console.error('찜 상태 로드 실패:', error);
      }
    };
    if (documents.length > 0) {
      loadFavoriteStatus();
    }
  }, [documents]);

  // 필터링 및 정렬
  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = [...documents];

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
  }, [documents, selectedCategory, selectedStatus, selectedManager, sortOption]);

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
            <span style={{ fontWeight: 500, color: '#000000' }}>{item.title}</span>
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
      key: 'action',
      label: '액션',
      width: '9%',
      align: 'right',
      render: (item, index) => (
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
      ),
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
      </div>
    </div>
  );
}

