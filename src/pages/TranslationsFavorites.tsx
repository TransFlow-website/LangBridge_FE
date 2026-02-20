import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { DocumentListItem, Priority, DocumentSortOption } from '../types/document';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { categoryApi, CategoryResponse } from '../services/categoryApi';
import { translationWorkApi } from '../services/translationWorkApi';
import { useUser } from '../contexts/UserContext';
import { formatLastModifiedDate } from '../utils/dateUtils';

// DocumentResponse를 DocumentListItem으로 변환
const convertToDocumentListItem = (
  doc: DocumentResponse,
  categoryMap?: Map<number, string>
): DocumentListItem => {
  const category = doc.categoryId && categoryMap
    ? (categoryMap.get(doc.categoryId) || `카테고리 ${doc.categoryId}`)
    : (doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류');

  return {
    id: doc.id,
    title: doc.title,
    category,
    categoryId: doc.categoryId,
    estimatedLength: doc.estimatedLength,
    progress: doc.status === 'APPROVED' ? 100 : 0,
    deadline: '정보 없음',
    priority: Priority.MEDIUM,
    status: doc.status as DocumentState,
    lastModified: doc.updatedAt ? formatLastModifiedDate(doc.updatedAt) : undefined,
    assignedManager: doc.lastModifiedBy?.name,
    isFinal: false,
    originalUrl: doc.originalUrl,
  };
};

export default function TranslationsFavorites() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<DocumentSortOption>({
    field: 'lastModified',
    order: 'desc',
  });
  const [categoryMap, setCategoryMap] = useState<Map<number, string>>(new Map());
  const [favoriteStatus, setFavoriteStatus] = useState<Map<number, boolean>>(new Map());

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

  // 찜한 문서 목록 로드
  useEffect(() => {
    const fetchFavoriteDocuments = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('📋 찜한 문서 조회 시작...');
        
        const response = await documentApi.getFavoriteDocuments();
        console.log('✅ 찜한 문서 목록 조회 성공:', response.length, '개');
        
        let converted = response.map((doc) => convertToDocumentListItem(doc, categoryMap));
        // IN_TRANSLATION 문서는 락 정보로 현재 작업자·내 락 여부 설정
        if (user?.id) {
          converted = await Promise.all(
            converted.map(async (item) => {
              if (item.status !== 'IN_TRANSLATION') return item;
              try {
                const lockStatus = await translationWorkApi.getLockStatus(item.id);
                if (!lockStatus?.lockedBy) return item;
                const lockedById = lockStatus.lockedBy.id;
                const isMyLock = lockStatus.locked && lockStatus.canEdit &&
                  lockedById !== undefined && Number(lockedById) === Number(user.id);
                return {
                  ...item,
                  currentWorker: lockStatus.lockedBy.name,
                  isMyLock,
                };
              } catch {
                return item;
              }
            })
          );
        }
        setDocuments(converted);
        
        // 모든 문서가 찜 상태임을 설정
        const favoriteMap = new Map<number, boolean>();
        converted.forEach(doc => {
          favoriteMap.set(doc.id, true);
        });
        setFavoriteStatus(favoriteMap);
      } catch (error) {
        console.error('❌ 찜한 문서 목록 조회 실패:', error);
        if (error instanceof Error) {
          setError(`찜한 문서 목록을 불러오는데 실패했습니다: ${error.message}`);
        } else {
          setError('찜한 문서 목록을 불러오는데 실패했습니다.');
        }
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    if (categoryMap.size > 0 || documents.length === 0) {
      fetchFavoriteDocuments();
    }
  }, [categoryMap, user?.id]);

  // 정렬
  const sortedDocuments = useMemo(() => {
    let sorted = [...documents];

    sorted.sort((a, b) => {
      if (sortOption.field === 'lastModified') {
        const aTime = a.lastModified || '';
        const bTime = b.lastModified || '';
        return sortOption.order === 'asc'
          ? aTime.localeCompare(bTime)
          : bTime.localeCompare(aTime);
      } else if (sortOption.field === 'title') {
        return sortOption.order === 'asc'
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
      return 0;
    });

    return sorted;
  }, [documents, sortOption]);

  const handleStartTranslation = (doc: DocumentListItem) => {
    navigate(`/translations/${doc.id}/work`, { state: { from: '/translations/favorites' } });
  };

  const handleViewDetail = (doc: DocumentListItem) => {
    navigate(`/documents/${doc.id}?from=favorites`);
  };

  const handleToggleFavorite = async (doc: DocumentListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await documentApi.removeFavorite(doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      setFavoriteStatus(prev => {
        const newMap = new Map(prev);
        newMap.delete(doc.id);
        return newMap;
      });
    } catch (error) {
      console.error('찜 해제 실패:', error);
      alert('찜 해제에 실패했습니다.');
    }
  };

  // 상태 텍스트 변환
  const getStatusText = (status: DocumentState) => {
    const statusMap: Record<DocumentState, string> = {
      'DRAFT': '초안',
      'PENDING_TRANSLATION': '번역 대기',
      'IN_TRANSLATION': '번역 중',
      'PENDING_REVIEW': '검토 대기',
      'APPROVED': '번역 완료',
      'PUBLISHED': '공개됨',
    };
    return statusMap[status] || status;
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
      key: 'status',
      label: '상태',
      width: '10%',
      render: (item) => {
        let statusColor = colors.primaryText;
        let statusWeight = 400;
        if (item.status === 'IN_TRANSLATION') {
          statusColor = '#FF6B00';
          statusWeight = 600;
        } else if (item.status === 'APPROVED') {
          statusColor = '#28A745';
          statusWeight = 600;
        }
        return (
          <span style={{ color: statusColor, fontSize: '12px', fontWeight: statusWeight }}>
            {getStatusText(item.status)}
          </span>
        );
      },
    },
    {
      key: 'category',
      label: '카테고리',
      width: '8%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>{item.category}</span>
      ),
    },
    {
      key: 'lastModified',
      label: '최근 수정',
      width: '10%',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.lastModified || '-'}
        </span>
      ),
    },
    {
      key: 'currentWorker',
      label: '작업자',
      width: '10%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.currentWorker || '-'}
        </span>
      ),
    },
    {
      key: 'currentVersion',
      label: '현재 버전',
      width: '8%',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.currentVersionNumber ? `v${item.currentVersionNumber}` : '-'}
        </span>
      ),
    },
    {
      key: 'estimatedLength',
      label: '예상 분량',
      width: '10%',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.estimatedLength ? `${item.estimatedLength.toLocaleString()}자` : '-'}
        </span>
      ),
    },
    {
      key: 'action',
      label: '액션',
      width: '20%',
      align: 'right',
      render: (item) => {
        const isPending = item.status === 'PENDING_TRANSLATION';
        const isApproved = item.status === 'APPROVED';
        const isInTranslationMine = item.status === 'IN_TRANSLATION' && item.isMyLock;
        const isInTranslationOther = item.status === 'IN_TRANSLATION' && !item.isMyLock;
        const canStartOrContinue = isPending || isInTranslationMine;
        
        return (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={(e) => {
                if (e) e.stopPropagation();
                handleViewDetail(item);
              }}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              상세보기
            </Button>
            {canStartOrContinue && (
              <Button
                variant="primary"
                onClick={(e) => {
                  if (e) e.stopPropagation();
                  handleStartTranslation(item);
                }}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                {isPending ? '번역 시작' : '이어하기'}
              </Button>
            )}
            {isInTranslationOther && (
              <span style={{ fontSize: '12px', color: '#FF6B00', fontWeight: 600 }}>
                번역 중 {item.currentWorker ? `(${item.currentWorker})` : ''}
              </span>
            )}
            {isApproved && (
              <span style={{ fontSize: '12px', color: '#28A745', fontWeight: 600 }}>완료</span>
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
          maxWidth: '1400px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 600,
              color: colors.primaryText,
              margin: 0,
            }}
          >
            찜한 문서
          </h1>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: colors.primaryText }}>
            로딩 중...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#F5F5F5',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              color: colors.primaryText,
              marginBottom: '16px',
            }}
          >
            ⚠️ {error}
          </div>
        ) : sortedDocuments.length === 0 ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: colors.secondaryText,
            }}
          >
            찜한 문서가 없습니다.
          </div>
        ) : (
          <Table
            data={sortedDocuments}
            columns={columns}
          />
        )}
      </div>
    </div>
  );
}


