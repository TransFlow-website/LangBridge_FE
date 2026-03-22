import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DocumentListItem, Priority, DocumentFilter, DocumentSortOption } from '../types/document';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { documentApi, DocumentResponse, DocumentVersionResponse } from '../services/documentApi';
import { categoryApi, CategoryResponse } from '../services/categoryApi';
import { translationWorkApi, LockStatusResponse } from '../services/translationWorkApi';
import { formatLastModifiedDate } from '../utils/dateUtils';
import { StatusBadge } from '../components/StatusBadge';
import { useUser } from '../contexts/UserContext';
import { UserRole } from '../types/user';

/** 문서 리스트: 전체 / 진행 중 / 완료 */
const PENDING_PAGE_STATUSES = [
  { value: '전체', label: '전체' },
  { value: 'IN_PROGRESS', label: '진행 중' },
  { value: 'DONE', label: '완료' },
];

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
        const completedCount = doc.completedParagraphs?.length || 0;
        progress = Math.round((completedCount / totalParagraphs) * 100);
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
    lastModified: doc.updatedAt ? formatLastModifiedDate(doc.updatedAt) : undefined,
    assignedManager: doc.lastModifiedBy?.name,
    isFinal: !!(doc as DocumentResponse).currentVersionIsFinal,
    originalUrl: doc.originalUrl,
  };
};

export default function TranslationsPending() {
  const navigate = useNavigate();
  const { user } = useUser();
  const isAdmin = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedStatus, setSelectedStatus] = useState<string>('전체');
  const [sortOption, setSortOption] = useState<DocumentSortOption>({
    field: 'lastModified',
    order: 'desc',
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
        
        // 원문만 조회(sourcesOnly): 복사본 생성 후에도 원문이 리스트에서 사라지지 않도록
        const response = await documentApi.getAllDocuments({ sourcesOnly: true });
        console.log('✅ 문서 목록 조회 성공(원문만):', response.length, '개');
        console.log('📊 문서 상태 분포:', {
          전체: response.length,
          PENDING_TRANSLATION: response.filter((d) => d.status === 'PENDING_TRANSLATION').length,
          IN_TRANSLATION: response.filter((d) => d.status === 'IN_TRANSLATION').length,
          기타: response.filter((d) => !['PENDING_TRANSLATION', 'IN_TRANSLATION'].includes(d.status)).length,
        });
        
        // 번역 관련 상태 문서만 (원문은 이미 sourcesOnly로만 옴)
        const pendingDocs = response.filter((doc) =>
          ['PENDING_TRANSLATION', 'IN_TRANSLATION', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED'].includes(doc.status)
        );
        console.log('📌 번역 관련 문서(원본만):', pendingDocs.length, '개');
        
        // 각 문서에 ORIGINAL 버전 추가 (락 제거됨, completedParagraphs는 문서 응답에 포함)
        const docsWithLockInfo = await Promise.all(
          pendingDocs.map(async (doc) => {
            let originalVersion = null;
            let currentVersionNumber: number | null = null;

            // 진행률 계산을 위해 ORIGINAL 버전 가져오기
            try {
              const versions = await documentApi.getDocumentVersions(doc.id);
              originalVersion = versions.find(v => v.versionType === 'ORIGINAL') || null;
              if (doc.currentVersionId) {
                const currentVer = versions.find(v => v.id === doc.currentVersionId);
                currentVersionNumber = currentVer?.versionNumber ?? null;
              }
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
              lockInfo: null as LockStatusResponse | null,
              originalVersion,
              currentVersionNumber,
            };
          })
        );
        
        const converted = docsWithLockInfo.map((doc) => {
          const item = convertToDocumentListItem(doc, categoryMap);
          // 작업자: 문서 생성자 또는 마지막 수정자 (락 제거됨)
          if (['PENDING_REVIEW', 'APPROVED', 'PUBLISHED'].includes(doc.status) && doc.lastModifiedBy?.name) {
            item.currentWorker = doc.lastModifiedBy.name;
          } else if (doc.status === 'IN_TRANSLATION' && doc.createdBy?.name) {
            item.currentWorker = doc.createdBy.name;
          }
          if (doc.currentVersionId) item.currentVersionId = doc.currentVersionId;
          if (doc.currentVersionNumber != null) item.currentVersionNumber = doc.currentVersionNumber;
          if (doc.currentVersionIsFinal != null) item.isFinal = doc.currentVersionIsFinal;
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

  type RowItem = DocumentListItem & { isCopyRow?: boolean; sourceDocumentId?: number; isLoadingRow?: boolean; createdById?: number; rowNumber?: number; hasHandoverRequest?: boolean };

  // 필터링 및 정렬
  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = [...documents];

    // 카테고리 필터
    if (selectedCategory !== '전체') {
      filtered = filtered.filter((doc) => doc.category === selectedCategory);
    }

    // 상태 필터: 작업 다 된 것 / 아직 작업 중인 문서
    if (selectedStatus === 'DONE') {
      filtered = filtered.filter((doc) => doc.status === 'APPROVED' || doc.status === 'PUBLISHED');
    } else if (selectedStatus === 'IN_PROGRESS') {
      filtered = filtered.filter((doc) =>
        ['PENDING_TRANSLATION', 'IN_TRANSLATION', 'PENDING_REVIEW'].includes(doc.status)
      );
    }

    // 정렬 (최근 수정순 등, 마감일 제외)
    filtered.sort((a, b) => {
      if (sortOption.field === 'lastModified') {
        const aTime = a.lastModified || '';
        const bTime = b.lastModified || '';
        return sortOption.order === 'asc' ? aTime.localeCompare(bTime) : bTime.localeCompare(aTime);
      } else if (sortOption.field === 'title') {
        return sortOption.order === 'asc'
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
      return 0;
    });

    return filtered;
  }, [documents, selectedCategory, selectedStatus, sortOption]);

  const [startTranslationLoading, setStartTranslationLoading] = useState(false);
  const [continueTranslationLoading, setContinueTranslationLoading] = useState(false);
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<number>>(new Set());
  const [copiesBySourceId, setCopiesBySourceId] = useState<Map<number, DocumentListItem[]>>(new Map());
  /** 해당 원문의 복사본(수정 중인 사람들의 문서) 로딩 중인 원문 ID */
  const [loadingCopySourceIds, setLoadingCopySourceIds] = useState<Set<number>>(new Set());

  const tableData: RowItem[] = useMemo(() => {
    const rows: RowItem[] = [];
    for (const item of filteredAndSortedDocuments) {
      rows.push({ ...item, isCopyRow: false });
      if (expandedSourceIds.has(item.id)) {
        const copies = copiesBySourceId.get(item.id); // 로딩 중이면 아직 키가 없어 undefined
        const isLoading = loadingCopySourceIds.has(item.id);
        if (isLoading && copies === undefined) {
          rows.push({
            id: -item.id,
            title: '이 문서를 수정 중인 문서 불러오는 중…',
            isCopyRow: true,
            sourceDocumentId: item.id,
            isLoadingRow: true,
            rowNumber: 1,
          } as RowItem);
        } else if (Array.isArray(copies)) {
          if (copies.length === 0) {
            rows.push({
              id: -item.id,
              title: '이 원문을 수정 중인 문서가 없습니다.',
              isCopyRow: true,
              sourceDocumentId: item.id,
              isLoadingRow: true,
              rowNumber: 1,
            } as RowItem);
          } else {
            copies.forEach((copy, idx) => {
              rows.push({ ...copy, isCopyRow: true, sourceDocumentId: item.id, rowNumber: idx + 1 });
            });
          }
        }
      }
    }
    return rows;
  }, [filteredAndSortedDocuments, expandedSourceIds, copiesBySourceId, loadingCopySourceIds]);

  const toggleSourceExpand = useCallback(async (sourceId: number) => {
    const isCurrentlyExpanded = expandedSourceIds.has(sourceId);
    if (isCurrentlyExpanded) {
      setExpandedSourceIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
      return;
    }
    // 펼치자마자 확장하고, 복사본(이 문서를 수정하고 있는 사람들의 문서) 로드
    setExpandedSourceIds((prev) => new Set(prev).add(sourceId));
    if (!copiesBySourceId.has(sourceId)) {
      setLoadingCopySourceIds((prev) => new Set(prev).add(sourceId));
      try {
        const copies = await documentApi.getCopiesBySourceId(sourceId);
        const withMeta = copies.map((doc) => {
          const listItem = convertToDocumentListItem(
            { ...doc, originalVersion: undefined, lockInfo: null as LockStatusResponse | null },
            categoryMap
          );
          if (doc.createdBy?.name) listItem.currentWorker = doc.createdBy.name;
          if (doc.createdBy?.id != null) (listItem as RowItem).createdById = doc.createdBy.id;
          (listItem as RowItem).hasHandoverRequest = !!doc.latestHandover;
          if (doc.currentVersionId) listItem.currentVersionId = doc.currentVersionId;
          if (doc.currentVersionNumber != null) listItem.currentVersionNumber = doc.currentVersionNumber;
          if (doc.currentVersionIsFinal != null) listItem.isFinal = doc.currentVersionIsFinal;
          return listItem;
        });
        setCopiesBySourceId((prev) => {
          const m = new Map(prev);
          m.set(sourceId, withMeta);
          return m;
        });
      } catch (e) {
        console.warn('이 문서를 수정 중인 문서 목록 조회 실패:', sourceId, e);
        setCopiesBySourceId((prev) => {
          const m = new Map(prev);
          m.set(sourceId, []);
          return m;
        });
      } finally {
        setLoadingCopySourceIds((prev) => {
          const next = new Set(prev);
          next.delete(sourceId);
          return next;
        });
      }
    }
  }, [expandedSourceIds, copiesBySourceId, categoryMap]);

  const handleStartTranslation = async (doc: DocumentListItem) => {
    if (startTranslationLoading) return;

    if (doc.status === 'APPROVED' || doc.status === 'PUBLISHED') {
      const proceed = window.confirm(
        '이 문서는 이미 번역이 완료된 문서입니다. 그래도 원문 기준으로 새 번역 작업을 시작하시겠습니까?'
      );
      if (!proceed) return;
    }

    // 이미 내가 이 문서의 복사본을 가지고 있는지 확인
    try {
      const myCopy = await documentApi.getMyCopyBySourceId(doc.id);
      if (myCopy) {
        const proceed = window.confirm(
          '이미 이 문서의 번역을 진행 중입니다. 이어하기를 사용해주세요. 그래도 새로 번역을 시작하시겠습니까?'
        );
        if (!proceed) return;
      }
    } catch (err) {
      console.warn('내 복사본 조회 실패 (번역 시작 계속 진행):', err);
    }

    setStartTranslationLoading(true);
    try {
      const res = await translationWorkApi.startTranslation(doc.id);
      navigate(`/translations/${res.id}/work`, { state: { from: '/translations/pending' } });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '번역 시작에 실패했습니다.';
      alert(msg);
    } finally {
      setStartTranslationLoading(false);
    }
  };

  const handleContinueTranslation = async (doc: DocumentListItem) => {
    if (continueTranslationLoading) return;
    setContinueTranslationLoading(true);
    try {
      const newDoc = await documentApi.copyForContinuation(doc.id);
      navigate(`/translations/${newDoc.id}/work`, { state: { from: '/translations/pending' } });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '이어서 새로 번역하기에 실패했습니다.';
      alert(msg);
    } finally {
      setContinueTranslationLoading(false);
    }
  };

  const handleViewDetail = (doc: DocumentListItem) => {
    navigate(`/documents/${doc.id}?from=pending`);
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

  const expandColumn: TableColumn<RowItem> = {
    key: 'expand',
    label: '',
    width: '36px',
    render: (item) => {
      if (item.isCopyRow || (item as RowItem).isLoadingRow) {
        return <span style={{ display: 'inline-block', width: 20, marginLeft: 8 }} />;
      }
      const expanded = expandedSourceIds.has(item.id);
      const loading = loadingCopySourceIds.has(item.id);
      const copies = copiesBySourceId.get(item.id);
      const count = copies?.length ?? 0;
      return (
        <span style={{ display: 'flex', alignItems: 'center', color: colors.primaryText }}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          {expanded && loading && (
            <span style={{ fontSize: '11px', marginLeft: 4, color: colors.secondaryText }}>…</span>
          )}
          {expanded && !loading && count > 0 && (
            <span style={{ fontSize: '11px', marginLeft: 4, color: colors.secondaryText }}>({count})</span>
          )}
        </span>
      );
    },
  };

  const truncateUrl = (url: string, maxLen: number = 24) => {
    if (!url || !url.trim()) return '';
    const u = url.trim();
    return u.length <= maxLen ? u : u.slice(0, maxLen) + '…';
  };

  const numberColumn: TableColumn<RowItem> = {
    key: 'rowNumber',
    label: '№',
    width: '32px',
    align: 'center',
    render: (item) => {
      const row = item as RowItem;
      if (row.rowNumber != null) return <span style={{ fontSize: '12px', color: colors.secondaryText, fontWeight: 500 }}>{row.rowNumber}</span>;
      return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>—</span>;
    },
  };

  const columns: TableColumn<RowItem>[] = [
    numberColumn,
    expandColumn,
    {
      key: 'title',
      label: '문서 제목',
      width: 'minmax(0, 3fr)',
      render: (item) => {
        const isFavorite = favoriteStatus.get(item.id) || false;
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingLeft: item.isCopyRow ? 24 : 0,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {!item.isCopyRow && (
              <button
                onClick={(e) => handleToggleFavorite(item, e)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  fontSize: '18px',
                  color: isFavorite ? '#FFD700' : '#C0C0C0',
                  transition: 'color 0.2s',
                }}
                title={isFavorite ? '찜 해제' : '찜 추가'}
              >
                {isFavorite ? '★' : '☆'}
              </button>
            )}
            <span
              style={{
                fontWeight: item.isCopyRow ? 400 : 500,
                color: '#000000',
                minWidth: 0,
                whiteSpace: 'normal',
                overflow: 'visible',
                display: 'block',
                lineHeight: 1.2,
                wordBreak: 'break-word',
              }}
              title={item.title}
            >
              {item.title}
            </span>
            {item.isCopyRow && !(item as RowItem).isLoadingRow && (
              <span style={{ fontSize: '11px', color: colors.secondaryText, flexShrink: 0 }}>(복사본)</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'originalUrl',
      label: '원문 URL',
      width: 'minmax(0, 1fr)',
      render: (item) => {
        if ((item as RowItem).isLoadingRow) return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>;
        const url = item.originalUrl?.trim();
        if (!url) return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>;
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: '12px',
              color: '#2563eb',
              textDecoration: 'none',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {truncateUrl(url, 24)}
          </a>
        );
      },
    },
    {
      key: 'status',
      label: '상태',
      width: 'minmax(0, 0.8fr)',
      render: (item) => {
        if ((item as RowItem).isLoadingRow) return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>;
        if (!item.isCopyRow) {
          return (
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: '#E8E6F0',
              color: '#5B5694',
            }}>
              원문
            </span>
          );
        }
        if ((item as RowItem).hasHandoverRequest) {
          return (
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: '#E8F0E8',
              color: '#2E7D32',
            }}>
              인계 요청
            </span>
          );
        }
        return <StatusBadge status={item.status} />;
      },
    },
    {
      key: 'category',
      label: '카테고리',
      width: 'minmax(0, 0.7fr)',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {(item as RowItem).isLoadingRow ? '-' : (item.category ?? '-')}
        </span>
      ),
    },
    {
      key: 'estimatedLength',
      label: '예상 분량',
      width: 'minmax(0, 0.7fr)',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {(item as RowItem).isLoadingRow ? '-' : (item.estimatedLength ? `${item.estimatedLength.toLocaleString()}자` : '-')}
        </span>
      ),
    },
    {
      key: 'lastModified',
      label: '최근 수정',
      width: 'minmax(0, 0.9fr)',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {(item as RowItem).isLoadingRow ? '-' : (item.lastModified || '-')}
        </span>
      ),
    },
    {
      key: 'currentWorker',
      label: '작업자',
      width: 'minmax(0, 0.7fr)',
      render: (item) => {
        if (!item.isCopyRow || (item as RowItem).isLoadingRow) return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>;
        return (
          <span style={{
            color: item.status === 'IN_TRANSLATION' ? '#FF6B00' : colors.primaryText,
            fontSize: '12px',
            fontWeight: item.status === 'IN_TRANSLATION' ? 500 : 400,
          }}>
            {item.currentWorker || '-'}
          </span>
        );
      },
    },
    {
      key: 'currentVersion',
      label: '현재 버전',
      width: 'minmax(0, 0.5fr)',
      align: 'right',
      render: (item) => {
        if ((item as RowItem).isLoadingRow) return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>;
        if (!item.isCopyRow) return <span style={{ color: colors.primaryText, fontSize: '12px' }}>v1</span>;
        return (
          <span style={{ color: colors.primaryText, fontSize: '12px' }}>
            {item.isFinal ? 'FINAL' : (item.currentVersionNumber != null ? `v${item.currentVersionNumber}` : '-')}
          </span>
        );
      },
    },
    {
      key: 'action',
      label: '액션',
      width: '260px',
      align: 'right',
      render: (item) => {
        if ((item as RowItem).isLoadingRow) return <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>;
        // 원문 행: 백엔드는 원문이면 상태와 무관하게 새 복사본(v1 기준) 생성 가능.
        // 원문이 IN_TRANSLATION 등으로 보이는 경우에도 다른 봉사자가 v1부터 새로 시작할 수 있어야 함.
        const isSourceRow = !item.isCopyRow && !(item as RowItem).isLoadingRow;
        const showStartBtn = isSourceRow;
        const isMyCopy = item.isCopyRow && Number((item as RowItem).createdById) === Number(user?.id);
        const hasHandoverRequest = !!(item as RowItem).hasHandoverRequest;
        const showResumeBtn = isMyCopy;
        const showHandoverContinueBtn = item.isCopyRow && !isMyCopy && hasHandoverRequest; // 인계 요청된 복사본: 누구나 이어받기
        const showContinueBtn = item.isCopyRow && isAdmin && !isMyCopy && !hasHandoverRequest; // 관리자만: 인계 아닌 복사본에서 이어서 새로 번역하기

        return (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
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
            {showStartBtn && (
              <Button
                variant="primary"
                onClick={(e) => {
                  if (e) e.stopPropagation();
                  handleStartTranslation(item);
                }}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                번역 시작
              </Button>
            )}
            {showResumeBtn && (
              <Button
                variant="primary"
                onClick={(e) => {
                  if (e) e.stopPropagation();
                  navigate(`/translations/${item.id}/work`, { state: { from: '/translations/pending' } });
                }}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                이어하기
              </Button>
            )}
            {showHandoverContinueBtn && (
              <Button
                variant="primary"
                onClick={(e) => {
                  if (e) e.stopPropagation();
                  handleContinueTranslation(item);
                }}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                이어받기
              </Button>
            )}
            {showContinueBtn && (
              <Button
                variant="secondary"
                onClick={(e) => {
                  if (e) e.stopPropagation();
                  handleContinueTranslation(item);
                }}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                이어서 번역하기
              </Button>
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
          번역 대기, 번역 중, 완료된 문서를 모두 확인할 수 있습니다. 번역 대기 문서만 번역을 시작할 수 있으며, 상세보기로 문서 내용을 확인할 수 있습니다.
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
              {PENDING_PAGE_STATUSES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
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
              <option value="title-asc">제목 가나다순</option>
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
            data={tableData}
            onRowClick={(item) => {
              if ((item as RowItem).isLoadingRow) return;
              if (item.isCopyRow) {
                handleViewDetail(item);
              } else {
                toggleSourceExpand(item.id);
              }
            }}
            getRowStyle={(item) => {
              const row = item as RowItem;
              if (row.isLoadingRow) {
                return { backgroundColor: '#E8E8E8', borderLeft: '4px solid #B0B0B0' };
              }
              if (row.isCopyRow) {
                return { backgroundColor: '#E0E0E0', borderLeft: '4px solid #909090' };
              }
              if (expandedSourceIds.has(row.id)) {
                return { backgroundColor: '#F0F0F0', borderLeft: '3px solid #707070' };
              }
              return {};
            }}
            getRowHoverStyle={(item) => {
              const row = item as RowItem;
              if (row.isCopyRow || row.isLoadingRow) return { backgroundColor: '#C8C8C8' };
              return undefined;
            }}
            emptyMessage="번역 대기 문서가 없습니다. 새 번역 등록에서 문서를 생성하거나, 기존 문서의 상태를 '번역 대기'로 변경해주세요."
          />
        )}
      </div>
    </div>
  );
}

