import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { DocumentListItem, Priority, DocumentSortOption } from '../types/document';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { reviewApi, ReviewResponse } from '../services/reviewApi';
import { categoryApi, CategoryResponse } from '../services/categoryApi';
import { formatLastModifiedDate } from '../utils/dateUtils';

// Review와 Document를 결합한 인터페이스
interface ReviewDocumentItem extends DocumentListItem {
  reviewId?: number;
  reviewCreatedAt?: string;
  reviewerName?: string;
  versionNumber?: number;
  isComplete?: boolean;
}

export default function Reviews() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<ReviewDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [sortOption, setSortOption] = useState<DocumentSortOption>({
    field: 'lastModified',
    order: 'desc',
  });
  const [categoryMap, setCategoryMap] = useState<Map<number, string>>(new Map());
  const [categories, setCategories] = useState<string[]>(['전체']);

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

  // API에서 검토 대기 문서 목록 가져오기
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('📋 검토 대기 문서 조회 시작...');
        
        // PENDING_REVIEW 상태인 문서들 가져오기
        const documentResponse = await documentApi.getAllDocuments({ status: 'PENDING_REVIEW' });
        console.log('✅ 검토 대기 문서 조회 성공:', documentResponse.length, '개');
        
        // PENDING 상태인 리뷰들 가져오기
        const reviewResponse = await reviewApi.getAllReviews({ status: 'PENDING' });
        console.log('✅ 검토 대기 리뷰 조회 성공:', reviewResponse.length, '개');
        
        // 문서와 리뷰를 매칭
        const reviewMap = new Map<number, ReviewResponse>();
        reviewResponse.forEach(review => {
          reviewMap.set(review.document.id, review);
        });
        
        // DocumentResponse를 ReviewDocumentItem으로 변환
        const converted: ReviewDocumentItem[] = documentResponse.map((doc) => {
          const review = reviewMap.get(doc.id);
          const category = doc.categoryId && categoryMap
            ? (categoryMap.get(doc.categoryId) || `카테고리 ${doc.categoryId}`)
            : (doc.categoryId ? `카테고리 ${doc.categoryId}` : '미분류');
          
          // 마감일 계산 (임시로 createdAt 기준으로 계산)
          const createdAt = new Date(doc.createdAt);
          const now = new Date();
          const diffDays = Math.ceil((createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 - now.getTime()) / (1000 * 60 * 60 * 24));
          const deadline = diffDays > 0 ? `${diffDays}일 후` : '마감됨';
          
          return {
            id: doc.id,
            title: doc.title,
            category,
            categoryId: doc.categoryId,
            estimatedLength: doc.estimatedLength,
            progress: 100, // 검토 대기 문서는 번역이 완료된 상태이므로 100%
            deadline,
            priority: Priority.MEDIUM,
            status: doc.status as DocumentState,
            lastModified: doc.updatedAt ? formatLastModifiedDate(doc.updatedAt) : undefined,
            assignedManager: doc.lastModifiedBy?.name,
            isFinal: false,
            originalUrl: doc.originalUrl,
            reviewId: review?.id,
            reviewCreatedAt: review?.createdAt ? formatLastModifiedDate(review.createdAt) : undefined,
            reviewerName: review?.reviewer?.name,
            versionNumber: review?.documentVersion?.versionNumber,
            isComplete: review?.isComplete,
          };
        });
        
        setDocuments(converted);
        
        if (converted.length === 0) {
          console.log('⚠️ 검토 대기 문서가 없습니다.');
        }
      } catch (error) {
        console.error('❌ 검토 대기 문서 조회 실패:', error);
        if (error instanceof Error) {
          console.error('에러 메시지:', error.message);
          console.error('에러 스택:', error.stack);
          setError(`검토 대기 문서를 불러오는데 실패했습니다: ${error.message}`);
        } else {
          setError('검토 대기 문서를 불러오는데 실패했습니다.');
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

    // 정렬
    filtered.sort((a, b) => {
      if (sortOption.field === 'lastModified') {
        // 마지막 수정 시점 정렬
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

    return filtered;
  }, [documents, selectedCategory, sortOption]);

  const handleReview = (item: ReviewDocumentItem) => {
    // 관리자용 문서 검토 페이지로 이동 (문서 ID와 리뷰 ID 전달)
    if (item.reviewId) {
      navigate(`/reviews/${item.id}/review?reviewId=${item.reviewId}`);
    } else {
      navigate(`/reviews/${item.id}/review`);
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

  const columns: TableColumn<ReviewDocumentItem>[] = [
    {
      key: 'title',
      label: '문서 제목',
      width: '25%',
      render: (item) => (
        <span style={{ fontWeight: 500, color: '#000000' }}>{item.title}</span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: '10%',
      render: (item) => (
        <StatusBadge status={item.status} />
      ),
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
      key: 'versionNumber',
      label: '버전',
      width: '8%',
      align: 'right',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.versionNumber ? `v${item.versionNumber}` : '-'}
        </span>
      ),
    },
    {
      key: 'reviewerName',
      label: '담당 검토자',
      width: '12%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.reviewerName || '-'}
        </span>
      ),
    },
    {
      key: 'reviewCreatedAt',
      label: '검토 요청일',
      width: '12%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.reviewCreatedAt || '-'}
        </span>
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
      key: 'isComplete',
      label: '완료 여부',
      width: '10%',
      render: (item) => (
        <span style={{ 
          color: item.isComplete ? '#28A745' : '#FF6B00', 
          fontSize: '12px',
          fontWeight: 500,
        }}>
          {item.isComplete ? '완전 번역' : '부분 번역'}
        </span>
      ),
    },
    {
      key: 'action',
      label: '액션',
      width: '13%',
      align: 'right',
      render: (item) => {
        return (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button
              variant="primary"
              onClick={(e) => {
                if (e) {
                  e.stopPropagation();
                }
                handleReview(item);
              }}
              style={{ 
                fontSize: '12px', 
                padding: '6px 12px',
              }}
            >
              검토하기
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
          검토 · 승인
        </h1>
        <div style={{ 
          fontSize: '13px', 
          color: colors.secondaryText, 
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#F8F9FA',
          borderRadius: '4px',
        }}>
          번역 완료 후 검토 대기 상태인 문서들을 확인하고 검토할 수 있습니다. 검토 후 승인 또는 반려 처리를 진행하세요.
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
              <option value="lastModified-asc">오래된 순</option>
              <option value="title-asc">제목 가나다순</option>
              <option value="title-desc">제목 역순</option>
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
              // 행 클릭 시 검토 페이지로 이동
              handleReview(item);
            }}
            emptyMessage="검토 대기 문서가 없습니다. 번역 완료된 문서가 검토 대기 상태로 변경되면 여기에 표시됩니다."
          />
        )}
      </div>
    </div>
  );
}

