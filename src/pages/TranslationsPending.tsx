import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { ProgressBar } from '../components/ProgressBar';
import { DocumentListItem, Priority, DocumentFilter, DocumentSortOption } from '../types/document';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { documentApi, DocumentResponse, DocumentVersionResponse } from '../services/documentApi';
import { categoryApi, CategoryResponse } from '../services/categoryApi';
import { LockStatusResponse } from '../services/translationWorkApi';

const priorities = ['전체', '높음', '보통', '낮음'];

/**
 * HTML에서 문단 수를 계산하는 함수
 * data-paragraph-index 속성이 있으면 그것을 사용하고, 없으면 문단 요소를 직접 찾아서 계산
 */
function countParagraphs(html: string): number {
  if (!html || html.trim().length === 0) {
    return 0;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    // data-paragraph-index 속성이 있는 요소들 찾기
    const indexedParagraphs = body.querySelectorAll('[data-paragraph-index]');
    if (indexedParagraphs.length > 0) {
      // 인덱스가 있으면 최대 인덱스 + 1이 문단 수
      let maxIndex = -1;
      indexedParagraphs.forEach((el) => {
        const indexStr = (el as HTMLElement).getAttribute('data-paragraph-index');
        if (indexStr) {
          const index = parseInt(indexStr, 10);
          if (!isNaN(index) && index > maxIndex) {
            maxIndex = index;
          }
        }
      });
      return maxIndex + 1;
    }

    // 인덱스가 없으면 문단 요소를 직접 찾아서 계산
    const paragraphSelectors = 'p, h1, h2, h3, h4, h5, h6, div, li, blockquote, article, section, figure, figcaption';
    const elements = body.querySelectorAll(paragraphSelectors);
    let count = 0;
    elements.forEach((el) => {
      const text = el.textContent?.trim();
      const hasImages = el.querySelectorAll('img').length > 0;
      if ((text && text.length > 0) || hasImages) {
        count++;
      }
    });
    return count;
  } catch (error) {
    console.error('문단 수 계산 실패:', error);
    return 0;
  }
}

/**
 * 진행률 계산 함수
 * @param completedParagraphs 완료된 문단 인덱스 배열
 * @param totalParagraphs 전체 문단 수
 * @returns 진행률 (0-100)
 */
function calculateProgress(completedParagraphs: number[] | undefined, totalParagraphs: number): number {
  if (!completedParagraphs || completedParagraphs.length === 0) {
    return 0;
  }
  if (totalParagraphs === 0) {
    return 0;
  }
  return Math.round((completedParagraphs.length / totalParagraphs) * 100);
}

// DocumentResponse를 DocumentListItem으로 변환
const convertToDocumentListItem = (
  doc: DocumentResponse & { lockInfo?: LockStatusResponse | null; originalVersion?: DocumentVersionResponse | null },
  categoryMap?: Map<number, string>
): DocumentListItem => {
  // 진행률 계산
  let progress = 0;
  
  if (doc.status === 'APPROVED') {
    progress = 100; // 완료된 문서는 100%
  } else if (doc.status === 'IN_TRANSLATION') {
    // IN_TRANSLATION 상태인 경우 진행률 계산
    if (doc.originalVersion?.content) {
      const totalParagraphs = countParagraphs(doc.originalVersion.content);
      if (totalParagraphs > 0) {
        // completedParagraphs가 있으면 사용, 없으면 0%
        const completedCount = doc.lockInfo?.completedParagraphs?.length || 0;
        progress = Math.round((completedCount / totalParagraphs) * 100);
        console.log(`📊 문서 ${doc.id} 진행률 계산:`, {
          status: doc.status,
          totalParagraphs,
          completedCount,
          progress,
          hasLockInfo: !!doc.lockInfo,
          hasCompletedParagraphs: !!doc.lockInfo?.completedParagraphs,
        });
      } else {
        console.warn(`⚠️ 문서 ${doc.id}: 문단 수가 0입니다.`);
      }
    } else {
      console.warn(`⚠️ 문서 ${doc.id}: ORIGINAL 버전을 찾을 수 없습니다.`);
    }
  }
  // PENDING_TRANSLATION 상태는 기본값 0% 유지
  
  // 마감일 계산 (임시로 createdAt 기준으로 계산, 나중에 deadline 필드 추가 필요)
  const createdAt = new Date(doc.createdAt);
  const now = new Date();
  const diffDays = Math.ceil((createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 - now.getTime()) / (1000 * 60 * 60 * 24));
  const deadline = diffDays > 0 ? `${diffDays}일 후` : '마감됨';
  
  // 우선순위 (임시로 기본값, 나중에 priority 필드 추가 필요)
  const priority = Priority.MEDIUM;
  
  // 카테고리 이름 (카테고리 맵에서 조회)
  const category = doc.categoryId && categoryMap
    ? (categoryMap.get(doc.categoryId) || `카테고리 ${doc.categoryId}`)
    : (doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류');

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

export default function TranslationsPending() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedPriority, setSelectedPriority] = useState<string>('전체');
  const [sortOption, setSortOption] = useState<DocumentSortOption>({
    field: 'deadline',
    order: 'asc',
  });
  const [categoryMap, setCategoryMap] = useState<Map<number, string>>(new Map());
  const [categories, setCategories] = useState<string[]>(['전체']);
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
        setCategories(['전체', ...categoryList.map(cat => cat.name)]);
        console.log('✅ 카테고리 목록 로드 완료:', categoryList.length, '개');
      } catch (error) {
        console.error('카테고리 목록 로드 실패:', error);
      }
    };
    loadCategories();
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

  // API에서 문서 목록 가져오기
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('📋 번역 대기 문서 조회 시작...');
        
        // 모든 문서를 가져온 후 프론트엔드에서 필터링 (더 안전함)
        const response = await documentApi.getAllDocuments();
        console.log('✅ 문서 목록 조회 성공:', response.length, '개');
        console.log('📊 문서 상태 분포:', {
          전체: response.length,
          PENDING_TRANSLATION: response.filter((d) => d.status === 'PENDING_TRANSLATION').length,
          IN_TRANSLATION: response.filter((d) => d.status === 'IN_TRANSLATION').length,
          기타: response.filter((d) => !['PENDING_TRANSLATION', 'IN_TRANSLATION'].includes(d.status)).length,
        });
        
        // PENDING_TRANSLATION, IN_TRANSLATION, APPROVED 상태 모두 포함
        const pendingDocs = response.filter(
          (doc) => doc.status === 'PENDING_TRANSLATION' || doc.status === 'IN_TRANSLATION' || doc.status === 'APPROVED'
        );
        console.log('📌 번역 대기/진행 중/완료 문서:', pendingDocs.length, '개');
        
        // 각 문서에 락 정보 및 ORIGINAL 버전 추가
        const docsWithLockInfo = await Promise.all(
          pendingDocs.map(async (doc) => {
            let lockInfo = null;
            let originalVersion = null;

            // IN_TRANSLATION 상태인 경우 락 정보 가져오기
            if (doc.status === 'IN_TRANSLATION') {
              try {
                const { translationWorkApi } = await import('../services/translationWorkApi');
                lockInfo = await translationWorkApi.getLockStatus(doc.id);
                console.log(`🔒 문서 ${doc.id} 락 정보:`, {
                  locked: lockInfo?.locked,
                  hasCompletedParagraphs: !!lockInfo?.completedParagraphs,
                  completedCount: lockInfo?.completedParagraphs?.length || 0,
                });
              } catch (error) {
                console.warn(`문서 ${doc.id}의 락 정보를 가져올 수 없습니다:`, error);
              }
            }

            // 진행률 계산을 위해 ORIGINAL 버전 가져오기
            try {
              const versions = await documentApi.getDocumentVersions(doc.id);
              originalVersion = versions.find(v => v.versionType === 'ORIGINAL') || null;
              if (originalVersion) {
                console.log(`📄 문서 ${doc.id} ORIGINAL 버전:`, {
                  versionId: originalVersion.id,
                  hasContent: !!originalVersion.content,
                  contentLength: originalVersion.content?.length || 0,
                });
              } else {
                console.warn(`⚠️ 문서 ${doc.id}: ORIGINAL 버전을 찾을 수 없습니다. 버전 목록:`, versions.map(v => v.versionType));
              }
            } catch (error) {
              console.warn(`문서 ${doc.id}의 버전 정보를 가져올 수 없습니다:`, error);
            }

            return {
              ...doc,
              lockInfo,
              originalVersion,
            };
          })
        );
        
        const converted = docsWithLockInfo.map((doc) => {
          const item = convertToDocumentListItem(doc, categoryMap);
          // 락 정보 및 버전 정보 추가
          if (doc.lockInfo && doc.lockInfo.lockedBy) {
            item.currentWorker = doc.lockInfo.lockedBy.name;
          }
          if (doc.currentVersionId) {
            item.currentVersionId = doc.currentVersionId;
          }
          return item;
        });
        setDocuments(converted);
        
        if (converted.length === 0 && response.length > 0) {
          console.warn('⚠️ 번역 대기 문서가 없습니다. 다른 상태의 문서만 존재합니다.');
        }
      } catch (error) {
        console.error('❌ 문서 목록 조회 실패:', error);
        if (error instanceof Error) {
          console.error('에러 메시지:', error.message);
          console.error('에러 스택:', error.stack);
          setError(`문서 목록을 불러오는데 실패했습니다: ${error.message}`);
        } else {
          setError('문서 목록을 불러오는데 실패했습니다.');
        }
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [categoryMap]);

  // 필터링 및 정렬
  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = [...documents];

    // 카테고리 필터
    if (selectedCategory !== '전체') {
      filtered = filtered.filter((doc) => doc.category === selectedCategory);
    }

    // 우선순위 필터
    if (selectedPriority !== '전체') {
      const priorityMap: Record<string, Priority> = {
        높음: Priority.HIGH,
        보통: Priority.MEDIUM,
        낮음: Priority.LOW,
      };
      filtered = filtered.filter((doc) => doc.priority === priorityMap[selectedPriority]);
    }

    // 정렬
    filtered.sort((a, b) => {
      if (sortOption.field === 'deadline') {
        // 마감일 임박순 (간단히 숫자로 변환)
        const aDays = parseInt(a.deadline?.replace('일 후', '') || '999');
        const bDays = parseInt(b.deadline?.replace('일 후', '') || '999');
        return sortOption.order === 'asc' ? aDays - bDays : bDays - aDays;
      } else if (sortOption.field === 'progress') {
        return sortOption.order === 'asc' ? a.progress - b.progress : b.progress - a.progress;
      }
      return 0;
    });

    return filtered;
  }, [documents, selectedCategory, selectedPriority, sortOption]);

  const handleStartTranslation = (doc: DocumentListItem) => {
    // IN_TRANSLATION 상태이고 현재 작업자가 아닌 경우 경고
    if (doc.status === 'IN_TRANSLATION' && doc.currentWorker) {
      alert(`이 문서는 현재 ${doc.currentWorker}님이 작업 중입니다.`);
      return;
    }
    // 번역 작업 화면으로 이동
    navigate(`/translations/${doc.id}/work`);
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
          statusColor = '#FF6B00'; // 주황색
          statusWeight = 600;
        } else if (item.status === 'APPROVED') {
          statusColor = '#28A745'; // 초록색
          statusWeight = 600;
        }
        
        return (
          <span style={{ 
            color: statusColor, 
            fontSize: '12px',
            fontWeight: statusWeight,
          }}>
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
        <span style={{ 
          color: item.status === 'IN_TRANSLATION' ? '#FF6B00' : colors.primaryText, 
          fontSize: '12px',
          fontWeight: item.status === 'IN_TRANSLATION' ? 500 : 400,
        }}>
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
          {item.currentVersionId ? `v${item.currentVersionId}` : '-'}
        </span>
      ),
    },
    {
      key: 'progress',
      label: '작업 진행률',
      width: '12%',
      render: (item) => <ProgressBar progress={item.progress} />,
    },
    {
      key: 'action',
      label: '액션',
      width: '17%',
      align: 'right',
      render: (item) => {
        const isInTranslation = item.status === 'IN_TRANSLATION';
        const isApproved = item.status === 'APPROVED';
        const isDisabled = isInTranslation || isApproved;
        
        return (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button
              variant={isDisabled ? 'disabled' : (item.progress === 0 ? 'primary' : 'secondary')}
              onClick={(e) => {
                if (e) {
                  e.stopPropagation();
                }
                if (!isDisabled) {
                  handleStartTranslation(item);
                }
              }}
              style={{ 
                fontSize: '12px', 
                padding: '6px 12px',
                ...(isApproved ? {
                  background: '#28A745',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'default',
                } : {})
              }}
            >
              {isApproved ? '완료' : (item.progress === 0 ? '번역 시작' : '이어하기')}
            </Button>
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
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#000000',
            marginBottom: '24px',
          }}
        >
          번역 대기 문서
        </h1>
        <div style={{ 
          fontSize: '13px', 
          color: colors.secondaryText, 
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#F8F9FA',
          borderRadius: '4px',
        }}>
          번역 대기 및 번역 중인 문서를 확인할 수 있습니다. 번역 중인 문서는 다른 봉사자가 작업 중이므로 접근할 수 없습니다.
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
              {priorities.map((pri) => (
                <option key={pri} value={pri}>
                  {pri}
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
              <option value="deadline-asc">마감일 임박순</option>
              <option value="progress-asc">진행률 낮은 순</option>
              <option value="progress-desc">진행률 높은 순</option>
            </select>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div
            style={{
              padding: '16px',
              marginBottom: '16px',
              backgroundColor: '#F5F5F5',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              color: colors.primaryText,
              fontSize: '13px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

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
              // 행 클릭 시 상세 화면으로 이동 (나중에 구현)
              console.log('문서 클릭:', item.id);
            }}
            emptyMessage="번역 대기 문서가 없습니다. 새 번역 등록에서 문서를 생성하거나, 기존 문서의 상태를 '번역 대기'로 변경해주세요."
          />
        )}
      </div>
    </div>
  );
}

