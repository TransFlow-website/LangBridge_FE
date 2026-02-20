import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableColumn } from '../components/Table';
import { DocumentState } from '../types/translation';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { categoryApi } from '../services/categoryApi';
import { translationWorkApi } from '../services/translationWorkApi';
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

const STATUS_TEXT: Record<string, string> = {
  DRAFT: '초안',
  PENDING_TRANSLATION: '번역 대기',
  IN_TRANSLATION: '번역 중',
  PENDING_REVIEW: '검토 대기',
  APPROVED: '번역 완료',
  PUBLISHED: '공개됨',
};

export default function TranslationsHandover() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<HandoverDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 번역 대기로 전환 확인 모달
  const [convertModalDoc, setConvertModalDoc] = useState<HandoverDocumentItem | null>(null);
  const [converting, setConverting] = useState(false);

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

        // 1단계: latestHandover가 있는 문서만 추출 (번역 대기로 전환된 문서 제외)
        const docsWithHandover = allDocs.filter(
          (doc) => !!doc.latestHandover && doc.status !== 'PENDING_TRANSLATION'
        );

        // 2단계: 현재 누군가 락(편집 중)인 문서는 제외 — 락 없는 문서만 인계 대기 목록에 표시
        const handoverDocItems: HandoverDocumentItem[] = [];
        await Promise.all(
          docsWithHandover.map(async (doc) => {
            try {
              const lockStatus = await translationWorkApi.getLockStatus(doc.id);
              // 락이 있으면(누군가 편집 중이면) 인계 요청 목록에서 제외
              if (lockStatus?.locked) return;
            } catch {
              // 락 조회 실패(404 = 락 없음 포함)는 락 없음으로 간주하여 포함
            }
            const h = doc.latestHandover!;
            handoverDocItems.push({
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
            });
          })
        );

        // 가장 최근 인계순 정렬
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

  const handleConvertToPending = async () => {
    if (!convertModalDoc) return;
    try {
      setConverting(true);

      // 1. 현재 번역 내용(MANUAL_TRANSLATION 또는 AI_DRAFT)으로 새 버전 생성 → 버전 번호 자동 증가
      try {
        const versions = await documentApi.getDocumentVersions(convertModalDoc.id);
        const latestTranslation =
          versions
            .filter((v) => v.versionType === 'MANUAL_TRANSLATION' || v.versionType === 'AI_DRAFT')
            .sort((a, b) => b.versionNumber - a.versionNumber)[0];
        if (latestTranslation?.content) {
          await documentApi.createDocumentVersion(convertModalDoc.id, {
            versionType: 'MANUAL_TRANSLATION',
            content: latestTranslation.content,
          });
        }
      } catch (versionErr) {
        console.warn('버전 생성 실패 (상태 전환은 계속 진행):', versionErr);
      }

      // 2. 상태를 번역 대기로 변경 (latestHandover는 서버에서 유지)
      await documentApi.updateDocumentStatus(convertModalDoc.id, 'PENDING_TRANSLATION');

      // 3. 목록에서 해당 문서 제거 (번역 대기로 전환됐으므로 더 이상 인계 대기 목록에 불필요)
      setDocuments((prev) => prev.filter((d) => d.id !== convertModalDoc.id));
      setConvertModalDoc(null);
      alert(`"${convertModalDoc.title}" 문서를 번역 대기 상태로 전환했습니다.\n다음 번역자가 작업 시작 시 인계 메모를 확인할 수 있습니다.`);
    } catch (err) {
      console.error('번역 대기 전환 실패:', err);
      alert('번역 대기로 전환하는데 실패했습니다.');
    } finally {
      setConverting(false);
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
      render: (item) => {
        const isReady = item.status === 'PENDING_TRANSLATION';
        return (
          <span style={{ fontSize: '12px', color: isReady ? '#28A745' : colors.primaryText, fontWeight: isReady ? 600 : 400 }}>
            {STATUS_TEXT[item.status] || item.status}
          </span>
        );
      },
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
      render: (item) => {
        const alreadyPending = item.status === 'PENDING_TRANSLATION';
        return (
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
            {!alreadyPending && (
              <Button
                variant="primary"
                onClick={(e) => {
                  if (e) e.stopPropagation();
                  setConvertModalDoc(item);
                }}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                번역 대기로 전환
              </Button>
            )}
            {alreadyPending && (
              <span style={{ fontSize: '12px', color: '#28A745', fontWeight: 600, alignSelf: 'center' }}>
                전환 완료
              </span>
            )}
          </div>
        );
      },
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
          번역 작업 중 인계 요청을 남긴 문서 목록입니다. 인계 사유를 확인하고 다른 번역자가 이어서 작업할 수 있도록 번역 대기 상태로 전환할 수 있습니다.
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

      {/* 번역 대기 전환 확인 모달 */}
      <Modal
        isOpen={!!convertModalDoc}
        onClose={() => setConvertModalDoc(null)}
        title="번역 대기로 전환"
        onConfirm={handleConvertToPending}
        confirmText={converting ? '전환 중...' : '전환'}
        cancelText="취소"
        variant="primary"
      >
        <p style={{ marginBottom: '12px' }}>
          <strong>"{convertModalDoc?.title}"</strong> 문서를 번역 대기 상태로 전환하시겠습니까?
        </p>
        <p style={{ fontSize: '13px', color: colors.secondaryText }}>
          전환 후 번역 대기 문서 목록에 나타나며, 다른 번역자가 작업을 이어받을 수 있습니다.
          인계 메모는 다음 번역자가 작업을 시작할 때 자동으로 표시됩니다.
        </p>
      </Modal>
    </div>
  );
}

