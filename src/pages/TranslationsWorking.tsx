import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { ProgressBar } from '../components/ProgressBar';
import { DocumentListItem, Priority, DocumentSortOption } from '../types/document';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { useUser } from '../contexts/UserContext';
import { translationWorkApi } from '../services/translationWorkApi';

const categories = ['전체', '웹사이트', '마케팅', '고객지원', '기술문서'];

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

export default function TranslationsWorking() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [sortOption, setSortOption] = useState<DocumentSortOption>({
    field: 'lastModified',
    order: 'desc',
  });

  // API에서 문서 목록 가져오기
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('📋 내가 작업 중인 문서 조회 시작...');
        
        // 모든 문서를 가져온 후 필터링
        const allDocuments = await documentApi.getAllDocuments();
        console.log('✅ 문서 목록 조회 성공:', allDocuments.length, '개');
        
        // IN_TRANSLATION 상태의 문서만 필터링
        const inTranslationDocs = allDocuments.filter(
          (doc) => doc.status === 'IN_TRANSLATION'
        );
        console.log('📌 번역 중 문서:', inTranslationDocs.length, '개');
        
        // 현재 사용자가 작업 중인 문서만 필터링 (DocumentLock 확인)
        const myWorkingDocs: DocumentResponse[] = [];
        
        if (!user?.id) {
          console.warn('⚠️ 사용자 ID가 없습니다. 로그인 상태를 확인해주세요.');
          setError('로그인 상태를 확인할 수 없습니다. 다시 로그인해주세요.');
          setDocuments([]);
          setLoading(false);
          return;
        }
        
        for (const doc of inTranslationDocs) {
          try {
            const lockStatus = await translationWorkApi.getLockStatus(doc.id);
            
            // 500 에러가 발생했지만 응답이 있으면 처리 시도
            if (!lockStatus) {
              console.warn(`⚠️ 문서 ${doc.id}의 락 상태가 null입니다.`);
              continue;
            }
            
            // 현재 사용자가 잠금을 가지고 있고 편집 가능한 경우만 포함
            // 타입 안전성을 위해 명시적 비교 (number 타입 보장)
            const lockedById = lockStatus.lockedBy?.id;
            const myId = user.id;
            
            // 타입 변환을 통한 안전한 비교
            const isMyLock = lockStatus.locked && 
                            lockStatus.canEdit && 
                            lockedById !== undefined &&
                            myId !== undefined &&
                            Number(lockedById) === Number(myId);
            
            if (isMyLock) {
              myWorkingDocs.push(doc);
              console.log(`✅ 문서 ${doc.id} (${doc.title}) 추가됨 - 내가 작업 중`);
            } else {
              console.log(`⏭️ 문서 ${doc.id} 스킵:`, {
                locked: lockStatus.locked,
                canEdit: lockStatus.canEdit,
                lockedById,
                myId,
              });
            }
          } catch (lockError: any) {
            // 락 정보를 가져올 수 없으면 스킵
            const status = lockError?.response?.status;
            if (status === 500) {
              console.error(`❌ 문서 ${doc.id}의 락 정보 조회 실패 (서버 오류):`, {
                message: lockError?.message,
                response: lockError?.response?.data,
              });
              // 500 에러는 서버 문제이므로 스킵하고 계속 진행
            } else if (status !== 404) {
              console.warn(`⚠️ 문서 ${doc.id}의 락 정보를 가져올 수 없습니다:`, {
                status,
                message: lockError?.message,
              });
            }
            // 404는 락이 없는 것으로 정상 처리
          }
        }
        
        console.log('✅ 내가 작업 중인 문서:', myWorkingDocs.length, '개');
        
        const converted = myWorkingDocs.map(convertToDocumentListItem);
        setDocuments(converted);
        
        if (converted.length === 0 && inTranslationDocs.length > 0) {
          console.warn('⚠️ 현재 작업 중인 문서가 없습니다. 다른 사용자가 작업 중이거나 락이 없습니다.');
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

    if (user) {
      fetchDocuments();
    } else {
      setLoading(false);
      setError('로그인이 필요합니다.');
    }
  }, [user]);

  // 상대 시간을 분으로 변환 (정렬용) - useMemo 위로 이동
  const parseMinutesFromRelativeTime = (timeStr: string): number => {
    if (timeStr.includes('분 전')) {
      return parseInt(timeStr.replace('분 전', '')) || 0;
    } else if (timeStr.includes('시간 전')) {
      return (parseInt(timeStr.replace('시간 전', '')) || 0) * 60;
    } else if (timeStr.includes('일 전')) {
      return (parseInt(timeStr.replace('일 전', '')) || 0) * 24 * 60;
    }
    return 0;
  };

  // 필터링 및 정렬
  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = [...documents];

    // 카테고리 필터
    if (selectedCategory !== '전체') {
      filtered = filtered.filter((doc) => doc.category === selectedCategory);
    }

    // 정렬
    filtered.sort((a, b) => {
      if (sortOption.field === 'lastModified') {
        // 마지막 수정 시점 정렬 (상대 시간을 숫자로 변환)
        const aMins = parseMinutesFromRelativeTime(a.lastModified || '0분 전');
        const bMins = parseMinutesFromRelativeTime(b.lastModified || '0분 전');
        return sortOption.order === 'asc' ? aMins - bMins : bMins - aMins;
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
  }, [documents, selectedCategory, sortOption, parseMinutesFromRelativeTime]);

  const handleContinueTranslation = (doc: DocumentListItem) => {
    // 번역 작업 화면으로 이동
    navigate(`/translations/${doc.id}/work`);
  };

  const columns: TableColumn<DocumentListItem>[] = [
    {
      key: 'title',
      label: '문서 제목',
      width: '30%',
      render: (item) => (
        <span style={{ fontWeight: 500, color: '#000000' }}>{item.title}</span>
      ),
    },
    {
      key: 'category',
      label: '카테고리',
      width: '12%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>{item.category}</span>
      ),
    },
    {
      key: 'estimatedLength',
      label: '예상 분량',
      width: '10%',
      render: (item) => (
        <span style={{ color: colors.primaryText }}>
          {item.estimatedLength ? `${item.estimatedLength}자` : '-'}
        </span>
      ),
    },
    {
      key: 'progress',
      label: '작업 진행률',
      width: '15%',
      render: (item) => <ProgressBar progress={item.progress} />,
    },
    {
      key: 'lastModified',
      label: '마지막 수정',
      width: '13%',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.lastModified || '-'}
        </span>
      ),
    },
    {
      key: 'deadline',
      label: '마감일',
      width: '10%',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.deadline || '-'}
        </span>
      ),
    },
    {
      key: 'action',
      label: '액션',
      width: '10%',
      align: 'right',
      render: (item) => (
        <Button
          variant="primary"
          onClick={(e) => {
            if (e) {
              e.stopPropagation();
            }
            handleContinueTranslation(item);
          }}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          이어하기
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
          내가 작업 중인 문서
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
              <option value="progress-asc">진행률 낮은 순</option>
              <option value="progress-desc">진행률 높은 순</option>
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
            data={filteredAndSortedDocuments}
            onRowClick={(item) => {
              // 행 클릭 시 번역 작업 화면으로 이동
              handleContinueTranslation(item);
            }}
            emptyMessage="현재 작업 중인 문서가 없습니다. 번역 대기 문서에서 번역을 시작하세요."
          />
        )}
      </div>
    </div>
  );
}

