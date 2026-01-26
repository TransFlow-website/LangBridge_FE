import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { documentApi as docApi, DocumentVersionResponse } from '../services/documentApi';
import { reviewApi, ReviewResponse } from '../services/reviewApi';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import {
  extractParagraphs,
  getParagraphs,
  getParagraphAtScrollPosition,
  highlightParagraph,
  clearAllHighlights,
  Paragraph,
} from '../utils/paragraphUtils';
import ErrorBoundary from '../components/ErrorBoundary';
import './TranslationWork.css';

export default function DocumentReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentId = id ? parseInt(id, 10) : null;
  const reviewIdParam = searchParams.get('reviewId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const [aiDraftContent, setAiDraftContent] = useState<string>('');
  const [translationContent, setTranslationContent] = useState<string>('');
  const [highlightedParagraphIndex, setHighlightedParagraphIndex] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectMessage, setRejectMessage] = useState('');

  // 패널 접기/전체화면 상태
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);

  // 패널 refs (iframe으로 변경)
  const originalIframeRef = useRef<HTMLIFrameElement>(null);
  const aiDraftIframeRef = useRef<HTMLIFrameElement>(null);
  const translationIframeRef = useRef<HTMLIFrameElement>(null);
  const isScrollingRef = useRef(false);

  // 원본 HTML 저장 (iframe 렌더링용)
  const [originalHtml, setOriginalHtml] = useState<string>('');
  const [aiDraftHtml, setAiDraftHtml] = useState<string>('');
  const [translationHtml, setTranslationHtml] = useState<string>('');

  // 초기 데이터 로드
  useEffect(() => {
    if (!documentId) {
      setError('문서 ID가 없습니다.');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. 문서 정보 가져오기
        console.log('📄 문서 조회 시작:', documentId);
        const doc = await documentApi.getDocument(documentId);
        console.log('✅ 문서 조회 성공:', doc);
        setDocument(doc);

        // 2. 리뷰 정보 가져오기
        try {
          if (reviewIdParam) {
            // reviewId가 있으면 직접 조회
            const reviewId = parseInt(reviewIdParam, 10);
            const review = await reviewApi.getReviewById(reviewId);
            setReview(review);
            console.log('✅ 리뷰 조회 성공 (ID로):', review);
          } else {
            // reviewId가 없으면 documentId로 조회
            const reviews = await reviewApi.getAllReviews({ documentId, status: 'PENDING' });
            if (reviews && reviews.length > 0) {
              setReview(reviews[0]); // 첫 번째 PENDING 리뷰 사용
              console.log('✅ 리뷰 조회 성공:', reviews[0]);
            } else {
              console.warn('⚠️ PENDING 상태의 리뷰가 없습니다.');
            }
          }
        } catch (reviewError: any) {
          console.error('리뷰 조회 실패:', reviewError);
          setError('리뷰 정보를 불러오는데 실패했습니다: ' + (reviewError.response?.data?.message || reviewError.message));
        }

        // 3. 버전 정보 가져오기
        try {
          const versions = await docApi.getDocumentVersions(documentId);
          console.log('📦 문서 버전 목록:', versions.map(v => ({ type: v.versionType, number: v.versionNumber })));
          
          if (!versions || versions.length === 0) {
            console.warn('⚠️ 문서 버전이 없습니다.');
            setError('문서 버전 정보를 찾을 수 없습니다.');
            setLoading(false);
            return;
          }
          
          // ORIGINAL 버전 찾기
          const originalVersion = versions.find(v => v.versionType === 'ORIGINAL');
          if (originalVersion) {
            const processedOriginal = extractParagraphs(originalVersion.content, 'original');
            setOriginalHtml(processedOriginal);
            setOriginalContent(processedOriginal);
            console.log('✅ 원문 버전 로드 완료');
          } else {
            console.warn('⚠️ ORIGINAL 버전이 없습니다.');
          }

          // AI_DRAFT 버전 찾기
          const aiDraftVersion = versions.find(v => v.versionType === 'AI_DRAFT');
          if (aiDraftVersion) {
            const processedAiDraft = extractParagraphs(aiDraftVersion.content, 'ai-draft');
            setAiDraftHtml(processedAiDraft);
            setAiDraftContent(processedAiDraft);
            console.log('✅ AI 초벌 번역 버전 로드 완료');
          } else {
            console.warn('⚠️ AI_DRAFT 버전이 없습니다.');
          }

          // MANUAL_TRANSLATION 버전 찾기 (검토 대상)
          const manualTranslationVersion = versions
            .filter(v => v.versionType === 'MANUAL_TRANSLATION')
            .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0]; // 최신 버전
          
          if (manualTranslationVersion) {
            console.log('✅ 검토 대상 번역 발견:', manualTranslationVersion.versionNumber, '버전');
            const processedManual = extractParagraphs(manualTranslationVersion.content, 'manual');
            setTranslationHtml(processedManual);
            setTranslationContent(processedManual);
          } else if (aiDraftVersion) {
            console.log('ℹ️ 수동 번역이 없어 AI 초벌 번역 사용');
            const processedAiDraft = extractParagraphs(aiDraftVersion.content, 'ai-draft-editor');
            setTranslationHtml(processedAiDraft);
            setTranslationContent(processedAiDraft);
          } else {
            console.warn('⚠️ 검토할 번역이 없습니다.');
            setError('검토할 번역 내용이 없습니다.');
            setLoading(false);
            return;
          }
        } catch (versionError: any) {
          console.error('버전 정보 조회 실패:', versionError);
          setError('문서 버전 정보를 불러오는데 실패했습니다: ' + (versionError.message || '알 수 없는 오류'));
          setLoading(false);
          return;
        }

      } catch (err: any) {
        console.error('데이터 로드 실패:', err);
        let errorMessage = '데이터를 불러오는데 실패했습니다.';
        
        if (err.response?.data) {
          if (typeof err.response.data === 'string') {
            errorMessage = err.response.data;
          } else if (err.response.data.message) {
            errorMessage = err.response.data.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [documentId]);

  // 원문 iframe 렌더링 + 문단 클릭/호버 이벤트
  useEffect(() => {
    const iframe = originalIframeRef.current;
    if (!iframe || !originalHtml) return;
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(originalHtml);
        iframeDoc.close();
        
        const style = iframeDoc.createElement('style');
        style.textContent = `
          * {
            border: none !important;
            outline: none !important;
          }
          body {
            cursor: default !important;
          }
        `;
        iframeDoc.head.appendChild(style);
        
        if (iframeDoc.body) {
          iframeDoc.body.style.cursor = 'default';
          iframeDoc.body.contentEditable = 'false';
        }
        
        const paragraphs = iframeDoc.querySelectorAll('[data-paragraph-index]');
        paragraphs.forEach((para) => {
          const element = para as HTMLElement;
          const indexAttr = element.getAttribute('data-paragraph-index');
          const index = parseInt(indexAttr || '0', 10);
          
          element.addEventListener('mouseenter', () => {
            setHighlightedParagraphIndex(index);
          });
          
          element.addEventListener('click', () => {
            setHighlightedParagraphIndex(index);
          });
        });
      } catch (error) {
        console.error('❌ 원문 iframe 오류:', error);
      }
    }
  }, [originalHtml, collapsedPanels, fullscreenPanel]);

  // AI 초벌 번역 iframe 렌더링 + 문단 클릭/호버 이벤트
  useEffect(() => {
    const iframe = aiDraftIframeRef.current;
    if (!iframe || !aiDraftHtml) return;
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(aiDraftHtml);
        iframeDoc.close();
        
        const style = iframeDoc.createElement('style');
        style.textContent = `
          * {
            border: none !important;
            outline: none !important;
          }
          body {
            cursor: default !important;
          }
        `;
        iframeDoc.head.appendChild(style);
        
        if (iframeDoc.body) {
          iframeDoc.body.style.cursor = 'default';
          iframeDoc.body.contentEditable = 'false';
        }
        
        const paragraphs = iframeDoc.querySelectorAll('[data-paragraph-index]');
        paragraphs.forEach((para) => {
          const element = para as HTMLElement;
          const indexAttr = element.getAttribute('data-paragraph-index');
          const index = parseInt(indexAttr || '0', 10);
          
          element.addEventListener('mouseenter', () => {
            setHighlightedParagraphIndex(index);
          });
          
          element.addEventListener('click', () => {
            setHighlightedParagraphIndex(index);
          });
        });
      } catch (error) {
        console.error('❌ AI 초벌 iframe 오류:', error);
      }
    }
  }, [aiDraftHtml, collapsedPanels, fullscreenPanel]);

  // 번역 iframe 렌더링 (읽기 전용)
  useEffect(() => {
    const iframe = translationIframeRef.current;
    if (!iframe || !translationHtml) return;
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(translationHtml);
        iframeDoc.close();
        
        const style = iframeDoc.createElement('style');
        style.textContent = `
          * {
            border: none !important;
            outline: none !important;
          }
          body {
            cursor: default !important;
          }
        `;
        iframeDoc.head.appendChild(style);
        
        if (iframeDoc.body) {
          iframeDoc.body.style.cursor = 'default';
          iframeDoc.body.contentEditable = 'false';
        }
        
        // 모든 요소를 편집 불가능하게 설정
        const allElements = iframeDoc.querySelectorAll('*');
        allElements.forEach(el => {
          (el as HTMLElement).contentEditable = 'false';
          (el as HTMLElement).style.userSelect = 'none';
          (el as HTMLElement).style.webkitUserSelect = 'none';
        });
      } catch (error) {
        console.error('❌ 번역 iframe 오류:', error);
      }
    }
  }, [translationHtml, collapsedPanels, fullscreenPanel]);

  // 문단 하이라이트 동기화
  useEffect(() => {
    const applyParagraphStyles = (panel: HTMLElement | null, panelName: string) => {
      if (!panel) return;
      clearAllHighlights(panel);
      
      const paragraphs = getParagraphs(panel);
      paragraphs.forEach((para) => {
        const isHighlighted = para.index === highlightedParagraphIndex;
        if (isHighlighted) {
          highlightParagraph(para.element, true);
        }
      });
    };

    if (originalIframeRef.current?.contentDocument?.body) {
      applyParagraphStyles(originalIframeRef.current.contentDocument.body as HTMLElement, '원문');
    }
    
    if (aiDraftIframeRef.current?.contentDocument?.body) {
      applyParagraphStyles(aiDraftIframeRef.current.contentDocument.body as HTMLElement, 'AI 초벌');
    }
    
    if (translationIframeRef.current?.contentDocument?.body) {
      applyParagraphStyles(translationIframeRef.current.contentDocument.body as HTMLElement, '번역');
    }
  }, [highlightedParagraphIndex]);

  // 패널 접기/펼치기
  const togglePanel = (panelId: string) => {
    setCollapsedPanels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(panelId)) {
        newSet.delete(panelId);
      } else {
        newSet.add(panelId);
      }
      return newSet;
    });
  };

  // 전체화면 토글
  const toggleFullscreen = (panelId: string) => {
    setFullscreenPanel(prev => prev === panelId ? null : panelId);
  };

  // 승인 처리
  const handleApprove = async () => {
    if (!review) {
      // 리뷰가 없으면 먼저 리뷰를 생성해야 함
      if (!documentId) {
        alert('문서 ID가 없습니다.');
        return;
      }

      // 버전 정보를 다시 가져와서 최신 MANUAL_TRANSLATION 버전 찾기
      try {
        const versions = await docApi.getDocumentVersions(documentId);
        const manualTranslationVersion = versions
          .filter(v => v.versionType === 'MANUAL_TRANSLATION')
          .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0];

        if (!manualTranslationVersion) {
          alert('검토할 번역 버전을 찾을 수 없습니다.');
          return;
        }

        // 리뷰 생성
        const newReview = await reviewApi.createReview({
          documentId,
          documentVersionId: manualTranslationVersion.id,
          isComplete: true, // 기본값으로 완전 번역으로 설정
        });
        setReview(newReview);

        if (!window.confirm('이 문서를 승인하시겠습니까? 승인 후 문서 상태가 변경됩니다.')) {
          return;
        }

        await reviewApi.approveReview(newReview.id);
        alert('문서가 승인되었습니다.');
        navigate('/reviews');
      } catch (error: any) {
        console.error('리뷰 생성 또는 승인 실패:', error);
        alert('승인 처리에 실패했습니다: ' + (error.response?.data?.message || error.message));
      }
      return;
    }

    if (!window.confirm('이 문서를 승인하시겠습니까? 승인 후 문서 상태가 변경됩니다.')) {
      return;
    }

    try {
      await reviewApi.approveReview(review.id);
      alert('문서가 승인되었습니다.');
      navigate('/reviews');
    } catch (error: any) {
      console.error('승인 실패:', error);
      alert('승인 처리에 실패했습니다: ' + (error.response?.data?.message || error.message));
    }
  };

  // 반려 처리
  const handleReject = async () => {
    if (!rejectMessage.trim()) {
      alert('반려 사유를 입력해주세요.');
      return;
    }

    if (!review) {
      // 리뷰가 없으면 먼저 리뷰를 생성해야 함
      if (!documentId) {
        alert('문서 ID가 없습니다.');
        return;
      }

      // 버전 정보를 다시 가져와서 최신 MANUAL_TRANSLATION 버전 찾기
      try {
        const versions = await docApi.getDocumentVersions(documentId);
        const manualTranslationVersion = versions
          .filter(v => v.versionType === 'MANUAL_TRANSLATION')
          .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0];

        if (!manualTranslationVersion) {
          alert('검토할 번역 버전을 찾을 수 없습니다.');
          return;
        }

        // 리뷰 생성 (반려 메시지 포함)
        const newReview = await reviewApi.createReview({
          documentId,
          documentVersionId: manualTranslationVersion.id,
          comment: rejectMessage,
          isComplete: false,
        });
        setReview(newReview);

        // 반려 처리
        await reviewApi.rejectReview(newReview.id);
        
        alert('문서가 반려되었습니다. 문서가 다시 번역 대기 상태로 변경됩니다.');
        navigate('/reviews');
      } catch (error: any) {
        console.error('리뷰 생성 또는 반려 실패:', error);
        alert('반려 처리에 실패했습니다: ' + (error.response?.data?.message || error.message));
      }
      return;
    }

    try {
      // 먼저 리뷰에 코멘트 추가
      await reviewApi.updateReview(review.id, { comment: rejectMessage });
      
      // 그 다음 반려 처리
      await reviewApi.rejectReview(review.id);
      
      alert('문서가 반려되었습니다. 문서가 다시 번역 대기 상태로 변경됩니다.');
      navigate('/reviews');
    } catch (error: any) {
      console.error('반려 실패:', error);
      alert('반려 처리에 실패했습니다: ' + (error.response?.data?.message || error.message));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: colors.primaryText }}>
        로딩 중...
      </div>
    );
  }

  if (error || !document) {
    return (
      <div style={{ padding: '48px' }}>
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
          ⚠️ {error || '문서를 불러올 수 없습니다.'}
        </div>
        <div>
          <Button variant="secondary" onClick={() => navigate('/reviews')}>
            목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  // 상태 텍스트 변환
  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      'DRAFT': '초안',
      'PENDING_TRANSLATION': '번역 대기',
      'IN_TRANSLATION': '번역 중',
      'PENDING_REVIEW': '검토 대기',
      'APPROVED': '번역 완료',
      'PUBLISHED': '공개됨',
    };
    return statusMap[status] || status;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: colors.primaryBackground,
      }}
    >
      {/* 상단 고정 바 */}
      <div
        style={{
          padding: '12px 24px',
          backgroundColor: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        {/* 왼쪽: 뒤로가기 + 문서 정보 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          <Button 
            variant="secondary" 
            onClick={() => navigate('/reviews')} 
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            ← 뒤로가기
          </Button>
          
          {document && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#000000' }}>
                {document.title}
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: colors.secondaryText }}>
                  {document.categoryId ? `카테고리 ${document.categoryId}` : '미분류'} · {getStatusText(document.status)}
                </span>
                {review && (
                  <span style={{ fontSize: '11px', color: colors.secondaryText }}>
                    검토자: {review.reviewer?.name || '-'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* 중앙: 문서 보기 옵션 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '24px',
          padding: '6px 16px',
          backgroundColor: '#F8F9FA',
          borderRadius: '6px',
          border: '1px solid #D3D3D3',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: colors.primaryText }}>문서 보기:</span>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '13px', 
            cursor: 'pointer',
            fontWeight: 500,
          }}>
            <input
              type="checkbox"
              checked={!collapsedPanels.has('original')}
              onChange={() => togglePanel('original')}
              style={{
                cursor: 'pointer',
                width: '16px',
                height: '16px',
              }}
            />
            <span>원문 (Version 0)</span>
          </label>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '13px', 
            cursor: 'pointer',
            fontWeight: 500,
          }}>
            <input
              type="checkbox"
              checked={!collapsedPanels.has('aiDraft')}
              onChange={() => togglePanel('aiDraft')}
              style={{ 
                cursor: 'pointer',
                width: '16px',
                height: '16px',
              }}
            />
            <span>AI 초벌 번역 (Version 1)</span>
          </label>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '13px', 
            cursor: 'pointer',
            fontWeight: 500,
          }}>
            <input
              type="checkbox"
              checked={!collapsedPanels.has('translation')}
              onChange={() => togglePanel('translation')}
              style={{ 
                cursor: 'pointer',
                width: '16px',
                height: '16px',
              }}
            />
            <span>번역본 (검토 대상)</span>
          </label>
        </div>

        {/* 오른쪽: 승인/반려 버튼 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            variant="secondary" 
            onClick={() => setShowRejectModal(true)}
            style={{ fontSize: '12px' }}
          >
            반려
          </Button>
          <Button 
            variant="primary" 
            onClick={handleApprove}
            style={{ fontSize: '12px' }}
          >
            승인
          </Button>
        </div>
      </div>

      {/* 3단 레이아웃 */}
      <div style={{ display: 'flex', height: '100%', gap: '4px', padding: '4px' }}>
        {[
          { id: 'original', title: '원문', ref: originalIframeRef, html: originalHtml },
          { id: 'aiDraft', title: 'AI 초벌 번역', ref: aiDraftIframeRef, html: aiDraftHtml },
          { id: 'translation', title: '번역본 (검토 대상)', ref: translationIframeRef, html: translationHtml },
        ].map(panel => {
          const isCollapsed = collapsedPanels.has(panel.id);
          const isFullscreen = fullscreenPanel === panel.id;
          const visiblePanels = ['original', 'aiDraft', 'translation'].filter(id => !collapsedPanels.has(id));
          const hasFullscreen = fullscreenPanel !== null;
          const isHidden = hasFullscreen && !isFullscreen;

          if (isHidden) return null;

          return (
            <div
              key={panel.id}
              style={{
                flex: isCollapsed ? '0 0 0' : isFullscreen ? '1' : `1 1 ${100 / visiblePanels.length}%`,
                display: isCollapsed ? 'none' : 'flex',
                flexDirection: 'column',
                transition: 'flex 0.2s ease',
                minWidth: isCollapsed ? '0' : '200px',
              }}
            >
              {/* 패널 헤더 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#D3D3D3',
                  borderRadius: '4px 4px 0 0',
                  cursor: 'default',
                  height: '36px',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#000000' }}>
                  {panel.title}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => toggleFullscreen(panel.id)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      border: '1px solid #A9A9A9',
                      borderRadius: '3px',
                      backgroundColor: '#FFFFFF',
                      color: '#000000',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                    title={isFullscreen ? '확대 해제' : '전체화면 확대'}
                  >
                    {isFullscreen ? '축소' : '확대'}
                  </button>
                </div>
              </div>

              {/* 패널 내용 */}
              <div
                style={{
                  flex: 1,
                  border: '1px solid #C0C0C0',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  overflow: 'hidden',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {panel.html ? (
                  <iframe
                    ref={panel.ref as React.RefObject<HTMLIFrameElement>}
                    srcDoc={panel.html}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      backgroundColor: '#FFFFFF',
                    }}
                    title={panel.title}
                  />
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    height: '100%',
                    color: colors.secondaryText,
                    fontSize: '13px'
                  }}>
                    {panel.id === 'original' ? '원문이 없습니다.' : panel.id === 'aiDraft' ? 'AI 초벌 번역이 없습니다.' : '번역본이 없습니다.'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 반려 모달 */}
      {showRejectModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowRejectModal(false)}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              padding: '24px',
              borderRadius: '8px',
              width: '500px',
              maxWidth: '90vw',
              border: `1px solid ${colors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              문서 반려
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: colors.primaryText }}>
                반려 사유 *
              </label>
              <textarea
                value={rejectMessage}
                onChange={(e) => setRejectMessage(e.target.value)}
                placeholder="예: 번역 품질이 부족합니다. 전문 용어 번역이 정확하지 않습니다."
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <div style={{ fontSize: '12px', color: colors.secondaryText, marginTop: '8px' }}>
                반려 시 문서가 다시 번역 대기 상태로 변경됩니다.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectMessage('');
                }}
                style={{ fontSize: '12px' }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleReject}
                style={{ fontSize: '12px' }}
              >
                반려 처리
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

