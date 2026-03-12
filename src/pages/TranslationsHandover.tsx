import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { documentApi } from '../services/documentApi';
import { categoryApi } from '../services/categoryApi';
import { formatLastModifiedDate, formatLastModifiedDateDisplay } from '../utils/dateUtils';

/** 인계 정보를 포함한 문서 아이템 */
interface HandoverDocumentItem {
  id: number;
  title: string;
  category: string;
  categoryId?: number;
  status: DocumentState;
  lastModified?: string;
  handoverMemo: string;
  handoverTerms?: string;
  handoverAt: string;
  handoverByName?: string;
  completedParagraphCount: number;
  estimatedLength?: number;
}

export default function TranslationsHandover() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<HandoverDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 이어받기 시 인계 메모 확인 모달 (메모 확인 후 이어받기 실행) */
  const [handoverMemoModalDoc, setHandoverMemoModalDoc] = useState<HandoverDocumentItem | null>(null);
  const [continueLoading, setContinueLoading] = useState(false);

  useEffect(() => {
    const fetchHandoverDocuments = async () => {
      try {
        setLoading(true);
        setError(null);

        const [allDocs, categoryList] = await Promise.all([
          documentApi.getAllDocuments(),
          categoryApi.getAllCategories(),
        ]);

        const categoryMap = new Map<number, string>();
        categoryList.forEach((cat) => categoryMap.set(cat.id, cat.name));

        const docsWithHandover = allDocs.filter(
          (doc) => !!doc.latestHandover && doc.status !== 'PENDING_TRANSLATION'
        );

        const handoverDocItems: HandoverDocumentItem[] = docsWithHandover.map((doc) => {
          const h = doc.latestHandover!;
          return {
            id: doc.id,
            title: doc.title,
            category: doc.categoryId
              ? (categoryMap.get(doc.categoryId) || `카테고리 ${doc.categoryId}`)
              : '미분류',
            categoryId: doc.categoryId,
            status: doc.status as DocumentState,
            lastModified: doc.updatedAt ? formatLastModifiedDate(doc.updatedAt) : undefined,
            handoverMemo: h.memo,
            handoverTerms: h.terms,
            handoverAt: h.handedOverAt,
            handoverByName: h.handedOverBy?.name,
            completedParagraphCount: h.completedParagraphs?.length ?? 0,
            estimatedLength: doc.estimatedLength,
          };
        });

        handoverDocItems.sort((a, b) => b.handoverAt.localeCompare(a.handoverAt));
        setDocuments(handoverDocItems);
      } catch (err) {
        console.error('인계 요청 문서 조회 실패:', err);
        setError('인계 요청 문서를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchHandoverDocuments();
  }, []);

  const handleContinueWithMemoConfirm = async () => {
    if (!handoverMemoModalDoc) return;
    try {
      setContinueLoading(true);
      const newDoc = await documentApi.copyForContinuation(handoverMemoModalDoc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== handoverMemoModalDoc.id));
      setHandoverMemoModalDoc(null);
      navigate(`/translations/${newDoc.id}/work`, { state: { from: '/documents/handovers' } });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '이어받기에 실패했습니다.';
      alert(msg);
    } finally {
      setContinueLoading(false);
    }
  };

  const columns: TableColumn<HandoverDocumentItem>[] = [
    {
      key: 'title',
      label: '문서 제목',
      width: '22%',
      render: (item) => (
        <span style={{ fontWeight: 500, color: '#000000' }}>{item.title}</span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: '9%',
      render: () => (
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
      ),
    },
    {
      key: 'category',
      label: '카테고리',
      width: '8%',
      render: (item) => (
        <span style={{ fontSize: '12px', color: colors.primaryText }}>{item.category}</span>
      ),
    },
    {
      key: 'handoverByName',
      label: '인계자',
      width: '9%',
      render: (item) => (
        <span style={{ fontSize: '12px', color: colors.primaryText }}>
          {item.handoverByName || '-'}
        </span>
      ),
    },
    {
      key: 'handoverAt',
      label: '인계 시각',
      width: '12%',
      align: 'right',
      render: (item) => (
        <span style={{ fontSize: '12px', color: colors.primaryText }}>
          {formatLastModifiedDateDisplay(item.handoverAt)}
        </span>
      ),
    },
    {
      key: 'handoverMemo',
      label: '인계 메모',
      width: '25%',
      render: (item) => (
        <span
          style={{
            fontSize: '12px',
            color: colors.primaryText,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: '1.4',
          }}
        >
          {item.handoverMemo}
        </span>
      ),
    },
    {
      key: 'action',
      label: '액션',
      width: '17%',
      align: 'right',
      render: (item) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            onClick={(e) => {
              if (e) e.stopPropagation();
              navigate(`/documents/${item.id}?from=handover`);
            }}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            상세보기
          </Button>
          <Button
            variant="primary"
            onClick={(e) => {
              if (e) e.stopPropagation();
              setHandoverMemoModalDoc(item);
            }}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            이어받기
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: colors.primaryBackground, minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#000000', marginBottom: '8px' }}>
          인계 요청 문서 관리
        </h1>
        <div style={{
          fontSize: '13px',
          color: colors.secondaryText,
          marginBottom: '20px',
          padding: '12px',
          backgroundColor: '#F8F9FA',
          borderRadius: '4px',
        }}>
          번역 작업 중 인계 요청을 남긴 문서 목록입니다. 인계 메모를 확인한 뒤 이어받기를 하면 해당 문서를 이어서 번역할 수 있습니다.
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: colors.primaryText, fontSize: '13px' }}>
            로딩 중...
          </div>
        ) : error ? (
          <div style={{ padding: '16px', backgroundColor: '#F5F5F5', border: `1px solid ${colors.border}`, borderRadius: '8px', color: colors.primaryText, fontSize: '13px', marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        ) : documents.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: colors.secondaryText, fontSize: '13px' }}>
            인계 요청된 문서가 없습니다.
          </div>
        ) : (
          <Table
            columns={columns}
            data={documents}
            onRowClick={(item) => navigate(`/documents/${item.id}?from=handover`)}
          />
        )}
      </div>

      {/* 인계 메모 확인 후 이어받기 모달 */}
      <Modal
        isOpen={!!handoverMemoModalDoc}
        onClose={() => !continueLoading && setHandoverMemoModalDoc(null)}
        title="인계 메모 확인"
        onConfirm={handleContinueWithMemoConfirm}
        confirmText={continueLoading ? '처리 중...' : '확인하고 이어받기'}
        cancelText="취소"
        variant="primary"
      >
        {handoverMemoModalDoc && (
          <div style={{ fontSize: '13px' }}>
            <p style={{ marginBottom: '12px', fontWeight: 600 }}>"{handoverMemoModalDoc.title}"</p>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: colors.secondaryText, display: 'block', marginBottom: '4px' }}>인계자</span>
              <span>{handoverMemoModalDoc.handoverByName || '-'}</span>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: colors.secondaryText, display: 'block', marginBottom: '4px' }}>인계 시각</span>
              <span>{formatLastModifiedDateDisplay(handoverMemoModalDoc.handoverAt)}</span>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: colors.secondaryText, display: 'block', marginBottom: '4px' }}>인계 메모</span>
              <div style={{ padding: '10px', backgroundColor: '#F5F5F5', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                {handoverMemoModalDoc.handoverMemo || '-'}
              </div>
            </div>
            {handoverMemoModalDoc.handoverTerms && (
              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: colors.secondaryText, display: 'block', marginBottom: '4px' }}>주의 용어/표현</span>
                <div style={{ padding: '10px', backgroundColor: '#F5F5F5', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                  {handoverMemoModalDoc.handoverTerms}
                </div>
              </div>
            )}
            <p style={{ fontSize: '12px', color: colors.secondaryText, marginTop: '12px' }}>
              확인 후 이어받기를 누르면 이 문서를 기반으로 새 복사본이 생성되고 작업 화면으로 이동합니다.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

