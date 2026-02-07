import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentApi, DocumentResponse, DocumentVersionResponse } from '../services/documentApi';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { DocumentState } from '../types/translation';
import ErrorBoundary from '../components/ErrorBoundary';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const documentId = id ? parseInt(id, 10) : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [versions, setVersions] = useState<DocumentVersionResponse[]>([]);
  
  // 버전별 HTML 콘텐츠
  const [originalHtml, setOriginalHtml] = useState<string>('');
  const [aiDraftHtml, setAiDraftHtml] = useState<string>('');
  const [currentWorkHtml, setCurrentWorkHtml] = useState<string>('');

  // 패널 접기/전체화면 상태
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);

  // iframe refs
  const originalIframeRef = useRef<HTMLIFrameElement>(null);
  const aiDraftIframeRef = useRef<HTMLIFrameElement>(null);
  const currentWorkIframeRef = useRef<HTMLIFrameElement>(null);

  // 패널 토글
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
        const doc = await documentApi.getDocument(documentId);
        setDocument(doc);

        // 2. 문서 버전 목록 가져오기
        const versionList = await documentApi.getDocumentVersions(documentId);
        setVersions(versionList);

        // 3. 버전별 HTML 콘텐츠 설정
        const originalVersion = versionList.find(v => v.versionType === 'ORIGINAL');
        const aiDraftVersion = versionList.find(v => v.versionType === 'AI_DRAFT');
        
        // 현재 진행 중인 작업 버전 결정
        let currentWorkVersion: DocumentVersionResponse | undefined;
        const status = doc.status as DocumentState;
        
        if (status === DocumentState.IN_TRANSLATION || 
            status === DocumentState.PENDING_REVIEW || 
            status === DocumentState.APPROVED || 
            status === DocumentState.PUBLISHED) {
          // FINAL 버전 우선, 없으면 MANUAL_TRANSLATION
          currentWorkVersion = versionList.find(v => v.versionType === 'FINAL') ||
                              versionList.find(v => v.versionType === 'MANUAL_TRANSLATION');
        } else if (status === DocumentState.DRAFT || status === DocumentState.PENDING_TRANSLATION) {
          // DRAFT나 PENDING_TRANSLATION은 AI_DRAFT를 표시
          currentWorkVersion = aiDraftVersion;
        }

        setOriginalHtml(originalVersion?.content || '');
        setAiDraftHtml(aiDraftVersion?.content || '');
        setCurrentWorkHtml(currentWorkVersion?.content || '');

      } catch (err: any) {
        console.error('문서 상세 정보 로드 실패:', err);
        setError(err.response?.data?.message || '문서 정보를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [documentId]);

  // 원문 iframe 렌더링
  useEffect(() => {
    const iframe = originalIframeRef.current;
    if (!iframe || !originalHtml) return;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(originalHtml);
        iframeDoc.close();

        // 경계선 제거 CSS 주입
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

        // 편집 불가능하게 설정
        if (iframeDoc.body) {
          iframeDoc.body.style.cursor = 'default';
          iframeDoc.body.contentEditable = 'false';
        }
      } catch (error) {
        console.error('❌ 원문 iframe 오류:', error);
      }
    }
  }, [originalHtml, collapsedPanels, fullscreenPanel]);

  // AI 초벌 번역 iframe 렌더링
  useEffect(() => {
    const iframe = aiDraftIframeRef.current;
    if (!iframe || !aiDraftHtml) return;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(aiDraftHtml);
        iframeDoc.close();

        // 경계선 제거 CSS 주입
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

        // 편집 불가능하게 설정
        if (iframeDoc.body) {
          iframeDoc.body.style.cursor = 'default';
          iframeDoc.body.contentEditable = 'false';
        }
      } catch (error) {
        console.error('❌ AI 초벌 iframe 오류:', error);
      }
    }
  }, [aiDraftHtml, collapsedPanels, fullscreenPanel]);

  // 현재 작업 iframe 렌더링
  useEffect(() => {
    const iframe = currentWorkIframeRef.current;
    if (!iframe || !currentWorkHtml) return;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(currentWorkHtml);
        iframeDoc.close();

        // 경계선 제거 CSS 주입
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

        // 편집 불가능하게 설정
        if (iframeDoc.body) {
          iframeDoc.body.style.cursor = 'default';
          iframeDoc.body.contentEditable = 'false';
        }
      } catch (error) {
        console.error('❌ 현재 작업 iframe 오류:', error);
      }
    }
  }, [currentWorkHtml, collapsedPanels, fullscreenPanel]);

  // 현재 작업 패널 제목 결정
  const getCurrentWorkTitle = (): string => {
    if (!document) return '현재 작업';
    const status = document.status as DocumentState;
    
    if (status === DocumentState.DRAFT || status === DocumentState.PENDING_TRANSLATION) {
      return 'AI 초벌 번역';
    } else if (status === DocumentState.IN_TRANSLATION) {
      return '번역 중';
    } else if (status === DocumentState.PENDING_REVIEW) {
      return '검토 대기';
    } else if (status === DocumentState.APPROVED || status === DocumentState.PUBLISHED) {
      return '최종 버전';
    }
    return '현재 작업';
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          color: colors.primaryText,
        }}
      >
        로딩 중...
      </div>
    );
  }

  if (error) {
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
            padding: '24px',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
          }}
        >
          <h2 style={{ color: '#d32f2f', marginBottom: '16px' }}>오류</h2>
          <p style={{ color: colors.primaryText, marginBottom: '16px' }}>{error}</p>
          <Button variant="secondary" onClick={() => navigate('/documents')}>
            문서 목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  if (!document) {
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
            padding: '24px',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
          }}
        >
          <p style={{ color: colors.primaryText }}>문서를 찾을 수 없습니다.</p>
          <Button variant="secondary" onClick={() => navigate('/documents')}>
            문서 목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const panels = [
    { 
      id: 'original', 
      title: '원본', 
      ref: originalIframeRef, 
      html: originalHtml,
      hasContent: !!originalHtml,
    },
    { 
      id: 'aiDraft', 
      title: 'AI 초벌 번역', 
      ref: aiDraftIframeRef, 
      html: aiDraftHtml,
      hasContent: !!aiDraftHtml,
    },
    { 
      id: 'currentWork', 
      title: getCurrentWorkTitle(), 
      ref: currentWorkIframeRef, 
      html: currentWorkHtml,
      hasContent: !!currentWorkHtml,
    },
  ];

  const visiblePanels = panels.filter(p => !collapsedPanels.has(p.id) && p.hasContent);
  const hasFullscreen = fullscreenPanel !== null;

  return (
    <ErrorBoundary>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          backgroundColor: colors.primaryBackground,
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: colors.surface,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Button
              variant="secondary"
              onClick={() => navigate('/documents')}
              style={{ fontSize: '12px' }}
            >
              ← 목록으로
            </Button>
            <div>
              <h1
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#000000',
                  margin: 0,
                  marginBottom: '4px',
                }}
              >
                {document.title}
              </h1>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <StatusBadge status={document.status as DocumentState} />
                <span style={{ fontSize: '12px', color: colors.secondaryText }}>
                  {document.originalUrl}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3단 레이아웃 */}
        <div style={{ display: 'flex', height: '100%', gap: '4px', padding: '4px' }}>
          {panels.map(panel => {
            const isCollapsed = collapsedPanels.has(panel.id);
            const isFullscreen = fullscreenPanel === panel.id;
            const isHidden = hasFullscreen && !isFullscreen;

            // 콘텐츠가 없으면 패널 숨김
            if (!panel.hasContent) return null;
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
                  <iframe
                    ref={panel.ref}
                    title={panel.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                    }}
                    sandbox="allow-same-origin allow-scripts"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ErrorBoundary>
  );
}
