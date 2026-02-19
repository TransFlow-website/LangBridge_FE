import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { useSidebar } from '../contexts/SidebarContext';
import { roleLevelToRole } from '../utils/hasAccess';
import { UserRole } from '../types/user';
import { DocumentState, TranslationDraft, SelectedArea } from '../types/translation';
import { Button } from '../components/Button';
import { WysiwygEditor, EditorMode } from '../components/WysiwygEditor';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { translationApi } from '../services/api';
import { AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Palette, Quote, Minus, Link2, Highlighter, Image, Table, Code, Superscript, Subscript, MoreVertical, Undo2, Redo2 } from 'lucide-react';

// STEP 1: 크롤링 주소 입력
const Step1CrawlingInput: React.FC<{
  url: string;
  setUrl: (url: string) => void;
  onExecute: () => void;
  isLoading: boolean;
  loadingProgress?: number;
  draftDocuments?: DocumentResponse[];
  onLoadDraft?: (doc: DocumentResponse) => void;
}> = ({ url, setUrl, onExecute, isLoading, loadingProgress = 0, draftDocuments = [], onLoadDraft }) => {
  const [showDraftList, setShowDraftList] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '24px',
      }}
    >
      {/* 임시저장 문서 섹션 - 항상 표시 */}
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          padding: '16px',
          backgroundColor: '#FFF9E6',
          border: '1px solid #FFE5B4',
          borderRadius: '8px',
        }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '12px',
          minHeight: '28px',
        }}>
          <span style={{ 
            fontSize: '13px', 
            fontWeight: 600, 
            color: '#8B4513',
            lineHeight: '20px',
            display: 'flex',
            alignItems: 'center',
          }}>
            임시저장된 문서 ({draftDocuments.length}개)
          </span>
          {draftDocuments.length > 0 && (
            <button
              onClick={() => setShowDraftList(!showDraftList)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                border: '1px solid #D3A86A',
                borderRadius: '4px',
                backgroundColor: '#FFFFFF',
                color: '#8B4513',
                cursor: 'pointer',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: '1',
              }}
            >
              {showDraftList ? '숨기기' : '보기'}
            </button>
          )}
        </div>
        {draftDocuments.length === 0 ? (
          <div style={{ 
            padding: '12px', 
            textAlign: 'center', 
            color: '#8B4513', 
            fontSize: '12px',
            fontStyle: 'italic',
          }}>
            임시저장된 문서가 없습니다.
          </div>
        ) : showDraftList && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {draftDocuments.map((doc) => (
              <div
                key={doc.id}
                style={{
                  padding: '12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D3A86A',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#000000', marginBottom: '4px' }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {doc.originalUrl}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => onLoadDraft?.(doc)}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  불러오기
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 기존 URL 입력 */}
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '14px',
            fontFamily: 'system-ui, Pretendard, sans-serif',
            border: '1px solid #C0C0C0',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF',
            color: '#000000',
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Button
          variant="primary"
          onClick={onExecute}
          disabled={isLoading || !url.trim()}
        >
          {isLoading ? '크롤링 중...' : '크롤링 실행'}
        </Button>
        {isLoading && loadingProgress > 0 && (
          <span style={{ fontSize: '13px', color: '#696969', fontWeight: 600 }}>
            {Math.round(loadingProgress)}%
          </span>
        )}
      </div>
    </div>
  );
};

// STEP 2: 크롤링 결과 + 영역 선택 (Translation.jsx 방식, 스타일만 회색)
const Step2AreaSelection: React.FC<{
  html: string;
  selectedAreas: SelectedArea[];
  onAreaSelect: (area: SelectedArea) => void;
  onAreaRemove: (id: string) => void;
  onHtmlUpdate?: (html: string) => void; // iframe의 현재 HTML 업데이트
}> = ({ html, selectedAreas, onAreaSelect, onAreaRemove, onHtmlUpdate }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [hoveredAreaId, setHoveredAreaId] = React.useState<string | null>(null);
  const [pageLoaded, setPageLoaded] = React.useState(false);
  
  const listenersAttached = React.useRef(false);
  const initialRestoreDone = React.useRef(false);
  const isUserInteraction = React.useRef(false);
  
  // 초기 로드 시 한 번만 선택 상태 복원
  React.useEffect(() => {
    if (!iframeRef.current || !pageLoaded || initialRestoreDone.current) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;
    
    if (selectedAreas.length > 0) {
      selectedAreas.forEach(area => {
        const el = iframeDoc.querySelector(`[data-transflow-id="${area.id}"]`) as HTMLElement;
        if (el) {
          el.classList.add('transflow-selected');
        }
      });
    }
    
    if (onHtmlUpdate) {
      const currentHtml = iframeDoc.documentElement.outerHTML;
      onHtmlUpdate(currentHtml);
    }
    
    initialRestoreDone.current = true;
  }, [pageLoaded]);
  
  // 사용자 인터랙션 후 selectedAreas 변경 시에만 동기화
  React.useEffect(() => {
    if (!iframeRef.current || !pageLoaded || !initialRestoreDone.current || !isUserInteraction.current) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;
    
    if (onHtmlUpdate) {
      const currentHtml = iframeDoc.documentElement.outerHTML;
      onHtmlUpdate(currentHtml);
    }
    
    isUserInteraction.current = false;
  }, [selectedAreas]);

  // ⭐ hoveredAreaId가 변경될 때 iframe에서 해당 영역 하이라이트
  React.useEffect(() => {
    if (!iframeRef.current || !pageLoaded) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;
    
    // 기존 호버 하이라이트 제거
    iframeDoc.querySelectorAll('.transflow-hovering').forEach(el => {
      el.classList.remove('transflow-hovering');
    });
    
    // hoveredAreaId에 해당하는 요소 하이라이트
    if (hoveredAreaId) {
      const el = iframeDoc.querySelector(`[data-transflow-id="${hoveredAreaId}"]`) as HTMLElement;
      if (el && !el.classList.contains('transflow-selected')) {
        el.classList.add('transflow-hovering');
        // 스크롤하여 보이도록 (필요한 경우)
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [hoveredAreaId, pageLoaded]);

  // 영역 선택 모드 활성화 함수 (Translation.jsx와 동일한 구조)
  // useCallback을 제거하고 일반 함수로 변경 (의존성 문제 해결)
  const enableElementSelection = (iframeDoc: Document) => {
    // 이미 리스너가 붙어있으면 중복 방지
    if (listenersAttached.current) {
      return;
    }
    // 기존 스타일 제거
    const existingStyle = iframeDoc.getElementById('transflow-selection-style');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Translation.jsx와 동일한 스타일 추가
    const style = iframeDoc.createElement('style');
    style.id = 'transflow-selection-style';
    style.textContent = `
      * {
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      a {
        cursor: crosshair !important;
        pointer-events: auto !important;
      }
      .transflow-hovering {
        outline: 4px dashed #667eea !important;
        outline-offset: 3px !important;
        cursor: crosshair !important;
        background-color: rgba(102, 126, 234, 0.15) !important;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3) !important;
        transition: all 0.2s ease !important;
      }
      .transflow-selected {
        outline: 4px solid #28a745 !important;
        outline-offset: 3px !important;
        background-color: rgba(40, 167, 69, 0.25) !important;
        box-shadow: 0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5) !important;
        position: relative !important;
        transition: all 0.2s ease !important;
      }
      .transflow-selected::after {
        content: '✓ 선택됨';
        position: fixed;
        top: 10px;
        right: 10px;
        background: linear-gradient(135deg, #28a745, #20c997);
        color: white;
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: bold;
        z-index: 999999;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        white-space: nowrap;
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      body {
        cursor: crosshair !important;
      }
    `;
    iframeDoc.head.appendChild(style);
    
    let highlightedElement: HTMLElement | null = null;
    
    const updateSelectedElements = () => {
      const newSelected: any[] = [];
      iframeDoc.querySelectorAll('.transflow-selected').forEach((el) => {
        const elementId = el.getAttribute('data-transflow-id');
        if (elementId) {
          newSelected.push({
            html: (el as HTMLElement).outerHTML,
            id: elementId
          });
        }
      });
      
      newSelected.forEach(item => {
        const existingArea = selectedAreas.find(area => area.id === item.id);
        if (!existingArea) {
          const el = iframeDoc.querySelector(`[data-transflow-id="${item.id}"]`) as HTMLElement;
          let selector = '';
          if (el && el.id) {
            selector = `#${el.id}`;
          } else if (el && el.className) {
            const classes = Array.from(el.classList).filter(c => !c.startsWith('transflow-')).join('.');
            if (classes) {
              selector = `${el.tagName.toLowerCase()}.${classes}`;
            }
          } else if (el) {
            selector = el.tagName.toLowerCase();
          }
          
          isUserInteraction.current = true;
          onAreaSelect({
            id: item.id,
            selector,
            html: item.html,
            order: selectedAreas.length + 1,
          });
        }
      });
    };
    
    // 마우스 오버 시 하이라이트
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return;
      if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return;
      
      if (highlightedElement && highlightedElement !== target) {
        highlightedElement.classList.remove('transflow-hovering');
      }
      if (!target.classList.contains('transflow-selected')) {
        target.classList.add('transflow-hovering');
        highlightedElement = target;
      }
    };
    
    // 마우스 아웃 시 하이라이트 제거
    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && !target.classList.contains('transflow-selected')) {
        target.classList.remove('transflow-hovering');
      }
    };
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return;
      if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const linkElement = target.closest('a') || (target.tagName === 'A' ? target : null);
      const elementToSelect = linkElement || target;
      
      let elementId = elementToSelect.getAttribute('data-transflow-id');
      if (!elementId) {
        elementId = `transflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        elementToSelect.setAttribute('data-transflow-id', elementId);
      }
      
      isUserInteraction.current = true;
      
      if (elementToSelect.classList.contains('transflow-selected')) {
        elementToSelect.classList.remove('transflow-selected');
        onAreaRemove(elementId);
      } else {
        elementToSelect.classList.add('transflow-selected');
        updateSelectedElements();
      }
      
      elementToSelect.classList.remove('transflow-hovering');
      highlightedElement = null;
    };
    
    // ⚡ 최적화: 이벤트 위임 사용 (body에만 리스너 추가)
    // 모든 요소에 개별 리스너를 추가하는 대신 body에서 이벤트 위임 사용
    if (iframeDoc.body) {
      // mouseover 이벤트 위임
      iframeDoc.body.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return;
        if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return;
        handleMouseOver(e);
      }, true);
      
      // mouseout 이벤트 위임
      iframeDoc.body.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        if (target && !target.classList.contains('transflow-selected')) {
          handleMouseOut(e);
        }
      }, true);
      
      // click 이벤트 위임
      iframeDoc.body.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return;
        if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return;
        handleClick(e);
      }, true);
      
    }
    
    listenersAttached.current = true;
  };

  useEffect(() => {
    listenersAttached.current = false;
    initialRestoreDone.current = false;
    isUserInteraction.current = false;
    setPageLoaded(false);
    
    if (iframeRef.current && html) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (iframeDoc) {
        let htmlContent = html;
        
        // 임시저장에서 불러온 HTML에서 선택 상태 클래스 제거
        htmlContent = htmlContent.replace(/\s*class="[^"]*transflow-selected[^"]*"/g, (match) => {
          const cleaned = match.replace(/\btransflow-selected\b\s*/g, '').replace(/\s+/g, ' ').trim();
          return cleaned === 'class=""' ? '' : cleaned;
        });
        htmlContent = htmlContent.replace(/\s*class='[^']*transflow-selected[^']*'/g, (match) => {
          const cleaned = match.replace(/\btransflow-selected\b\s*/g, '').replace(/\s+/g, ' ').trim();
          return cleaned === "class=''" ? '' : cleaned;
        });
        
        // 크롤링된 페이지의 스크립트 제거 (변수 중복 선언 오류 방지)
        htmlContent = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        const hasDoctype = htmlContent.trim().toLowerCase().startsWith('<!doctype');
        const hasHtml = htmlContent.includes('<html');
        const hasBody = htmlContent.includes('<body');
        
        if (!hasDoctype || !hasHtml || !hasBody) {
          if (!htmlContent.includes('<body')) {
            htmlContent = `<body>${htmlContent}</body>`;
          }
          if (!htmlContent.includes('<html')) {
            htmlContent = `<html>${htmlContent}</html>`;
          }
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', '<html><head></head>');
          }
          if (!hasDoctype) {
            htmlContent = `<!DOCTYPE html>${htmlContent}`;
          }
        }
        
        // CSS 추가 (Translation.jsx와 동일)
        const cssMatch = html.match(/<style id="transflow-css">[\s\S]*?<\/style>/i);
        if (cssMatch && !htmlContent.includes('transflow-css')) {
          const cssTag = cssMatch[0];
          if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`);
          } else if (htmlContent.includes('<html')) {
            htmlContent = htmlContent.replace('<html>', `<html><head>${cssTag}</head>`);
          }
        }
        
        try {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();
        } catch (error) {
          // iframe 내부 스크립트 에러는 무시 (크롤링된 페이지의 스크립트 에러)
          console.warn('iframe write error (ignored):', error);
        }
        
        // iframe 내부 스크립트 에러 무시 (크롤링된 페이지의 스크립트 에러는 무시)
        if (iframe.contentWindow) {
          iframe.contentWindow.addEventListener('error', (e) => {
            // iframe 내부 에러는 무시 (크롤링된 페이지의 스크립트 에러)
            e.stopPropagation();
            return true;
          }, true);
        }
        
        // 영역 선택 모드 활성화 (Translation.jsx와 동일한 방식)
        // pageLoaded를 체크하지 않고 직접 호출 (클로저 문제 해결)
        const checkAndEnableSelection = () => {
          try {
            if (iframeDoc.body && iframeDoc.body.children.length > 0) {
              enableElementSelection(iframeDoc);
              setPageLoaded(true);
            } else {
              setTimeout(checkAndEnableSelection, 100);
            }
          } catch (error) {
            // iframe 내부 스크립트 에러는 무시
          }
        };
        
        setTimeout(checkAndEnableSelection, 300);
      }
    }
  }, [html]); // enableElementSelection 의존성 제거!

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        gap: '16px',
      }}
    >
      {/* 좌측 70%: 크롤링된 웹 페이지 */}
      <div
        style={{
          flex: '0 0 70%',
          border: '1px solid #C0C0C0',
          borderRadius: '8px',
          overflow: 'auto',
          backgroundColor: '#FFFFFF',
        }}
      >
        <iframe
          ref={iframeRef}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Crawled page"
        />
      </div>

      {/* 우측 30%: 선택된 영역 리스트 */}
      <div
        style={{
          flex: '0 0 30%',
          border: '1px solid #C0C0C0',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: '#DCDCDC',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#000000',
            fontFamily: 'system-ui, Pretendard, sans-serif',
              margin: 0,
          }}
        >
          선택된 영역 ({selectedAreas.length})
        </h3>
          {selectedAreas.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                selectedAreas.forEach(area => onAreaRemove(area.id));
              }}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              전체 선택 취소
            </Button>
          )}
        </div>
        {selectedAreas.length === 0 ? (
          <div
            style={{
              fontSize: '13px',
              color: '#696969',
              fontFamily: 'system-ui, Pretendard, sans-serif',
            }}
          >
            영역을 선택하세요
          </div>
        ) : (
          <div className="space-y-2">
            {selectedAreas.map((area, idx) => (
              <div
                key={area.id}
                onMouseEnter={() => setHoveredAreaId(area.id)}
                onMouseLeave={() => setHoveredAreaId(null)}
                style={{
                  padding: '12px',
                  border: '1px solid #C0C0C0',
                  borderRadius: '8px',
                  backgroundColor: hoveredAreaId === area.id ? '#D3D3D3' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#000000',
                    fontFamily: 'system-ui, Pretendard, sans-serif',
                    marginBottom: '8px',
                  }}
                >
                  영역 {idx + 1}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => onAreaRemove(area.id)}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  제거
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// STEP 3: 번역 전 편집 (Translation.jsx 방식으로 변경)
const Step3PreEdit: React.FC<{
  html: string;
  onHtmlChange: (html: string) => void;
  selectedAreas: SelectedArea[];
}> = ({ html, onHtmlChange, selectedAreas }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [mode, setMode] = useState<'text' | 'component' | 'spacing' | 'spacing-all'>('text');
  const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]); // 다중 선택
  const [isInitialized, setIsInitialized] = useState(false); // 초기화 플래그
  
  // 컴포넌트 편집용 Undo/Redo Stack
  const undoStackRef = React.useRef<string[]>([]);
  const redoStackRef = React.useRef<string[]>([]);
  const currentHtmlRef = React.useRef<string>('');
  // 공백 제거용 별도 undo stack
  const spacingUndoStackRef = React.useRef<string[]>([]);
  const spacingRedoStackRef = React.useRef<string[]>([]);
  const spacingCurrentHtmlRef = React.useRef<string>('');
  // 컴포넌트 클릭 핸들러 저장 (제거를 위해)
  const componentClickHandlersRef = React.useRef<Map<HTMLElement, (e: Event) => void>>(new Map());
  // 공백 제거 모드 클릭 핸들러 저장 (제거를 위해)
  const spacingClickHandlersRef = React.useRef<Map<HTMLElement, (e: Event) => void>>(new Map());
  // 링크 클릭 방지 핸들러 저장 (제거를 위해)
  const linkClickHandlersRef = React.useRef<Map<HTMLElement, (e: Event) => void>>(new Map());
  // window 키보드 이벤트 리스너 저장 (cleanup에서 제거하기 위해)
  const windowKeydownHandlerRef = React.useRef<((e: KeyboardEvent) => void) | null>(null);
  const iframeKeydownHandlerRef = React.useRef<((e: KeyboardEvent) => void) | null>(null);
  
  // 공백 제거 상태 추적
  const spacingRemovedRef = React.useRef<{
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    auto: boolean;
  }>({
    top: false,
    bottom: false,
    left: false,
    right: false,
    auto: false,
  });
  
  // 모드 변경 시 편집 기능 전환 (iframe 재렌더링 없이)
  useEffect(() => {
    if (!isInitialized || !iframeRef.current) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;
    
    console.log('🔄 모드 변경:', mode);
    
    // 기존 이벤트 리스너 제거 (클린업)
    const removeAllListeners = () => {
      const allElements = iframeDoc.querySelectorAll('*');
      allElements.forEach(el => {
        const newEl = el.cloneNode(true);
        el.parentNode?.replaceChild(newEl, el);
      });
    };
    
    if (mode === 'text') {
      // 텍스트 편집 모드
      const editableElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button, article, section, header, footer, main, aside');
      editableElements.forEach((el) => {
        if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) {
          (el as HTMLElement).contentEditable = 'true';
          (el as HTMLElement).style.cursor = 'text';
          (el as HTMLElement).style.outline = 'none';
        }
      });
      
      // ⭐ 링크 클릭 방지 (다른 사이트로 이동 방지)
      // 기존 링크 클릭 핸들러 제거
      linkClickHandlersRef.current.forEach((handler, link) => {
        link.removeEventListener('click', handler, true);
      });
      linkClickHandlersRef.current.clear();
      
      // 모든 링크에 클릭 방지 핸들러 추가
      const allLinks = iframeDoc.querySelectorAll('a');
      const preventLinkNavigation = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      };
      
      allLinks.forEach(link => {
        const htmlLink = link as HTMLElement;
        htmlLink.addEventListener('click', preventLinkNavigation, true);
        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
        // 링크 스타일 변경 (편집 모드임을 표시)
        htmlLink.style.cursor = 'text';
        htmlLink.style.textDecoration = 'none';
      });
      
      // 링크 스타일 CSS 추가
      const linkStyle = iframeDoc.createElement('style');
      linkStyle.id = 'text-edit-link-style';
      linkStyle.textContent = `
        a {
          cursor: text !important;
          pointer-events: auto !important;
        }
        a:hover {
          text-decoration: underline !important;
        }
      `;
      const existingLinkStyle = iframeDoc.getElementById('text-edit-link-style');
      if (existingLinkStyle) {
        existingLinkStyle.remove();
      }
      iframeDoc.head.appendChild(linkStyle);
      
      // 컴포넌트 편집 스타일 제거 및 이벤트 리스너 제거
      const allElements = iframeDoc.querySelectorAll('[data-component-editable]');
      allElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.outline = 'none';
        htmlEl.style.cursor = 'text';
        htmlEl.style.boxShadow = 'none'; // boxShadow도 제거!
        htmlEl.style.backgroundColor = ''; // ⭐ 초록색 배경 제거
        htmlEl.classList.remove('component-selected');
        htmlEl.removeAttribute('data-component-editable');
        
        // 이벤트 리스너 제거
        const handler = componentClickHandlersRef.current.get(htmlEl);
        if (handler) {
          htmlEl.removeEventListener('click', handler, true);
          componentClickHandlersRef.current.delete(htmlEl);
        }
      });
      
      // data-transflow-id가 있는 요소들의 outline도 제거 (컴포넌트 선택 스타일 제거)
      const transflowElements = iframeDoc.querySelectorAll('[data-transflow-id]');
      transflowElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.outline = 'none';
        htmlEl.style.boxShadow = 'none';
        
        // 이벤트 리스너 제거 (혹시 남아있을 수 있음)
        const handler = componentClickHandlersRef.current.get(htmlEl);
        if (handler) {
          htmlEl.removeEventListener('click', handler, true);
          componentClickHandlersRef.current.delete(htmlEl);
        }
      });
      
      // 모든 컴포넌트 클릭 핸들러 제거
      componentClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      componentClickHandlersRef.current.clear();
      
      // 공백 제거 모드 클릭 핸들러 제거
      spacingClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      spacingClickHandlersRef.current.clear();
      
      // 공백 제거 모드 선택 스타일 제거
      const spacingSelectedElements = iframeDoc.querySelectorAll('.spacing-selected');
      spacingSelectedElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.classList.remove('spacing-selected');
        htmlEl.style.outline = 'none';
        htmlEl.style.boxShadow = 'none';
      });
      
      // 선택된 요소 초기화
      setSelectedElements([]);
      
      // ⭐ 텍스트 모드 키보드 단축키 (Ctrl+Z, Ctrl+Shift+Z)
      const handleTextKeydown = (e: KeyboardEvent) => {
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('undo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          onHtmlChange(updatedHtml);
          console.log('↩️ Undo (Step 3 텍스트 편집)');
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('redo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          onHtmlChange(updatedHtml);
          console.log('↪️ Redo (Step 3 텍스트 편집)');
        }
        
        // ⭐ 백스페이스 키 처리 (브라우저 기본 동작 허용)
        if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          console.log('⌫ 백스페이스 (STEP 3 텍스트 편집)');
        }
      };
      
      // 기존 리스너 제거
      if (iframeKeydownHandlerRef.current && iframeDoc) {
        iframeDoc.removeEventListener('keydown', iframeKeydownHandlerRef.current, true);
      }
      // 새 리스너 등록 및 저장
      iframeKeydownHandlerRef.current = handleTextKeydown;
      iframeDoc.addEventListener('keydown', handleTextKeydown, true);
      console.log('✅ Step 3 텍스트 모드 키보드 단축키 등록 완료');
      
    } else if (mode === 'component') {
      // 컴포넌트 편집 모드
      // contentEditable 비활성화
      const editableElements = iframeDoc.querySelectorAll('[contenteditable="true"]');
      editableElements.forEach((el) => {
        (el as HTMLElement).contentEditable = 'false';
        (el as HTMLElement).style.cursor = 'default';
      });
      
      // ⭐ 링크 클릭 핸들러 제거
      linkClickHandlersRef.current.forEach((handler, link) => {
        link.removeEventListener('click', handler, true);
      });
      linkClickHandlersRef.current.clear();
      
      // 링크 스타일 태그 제거
      const linkStyle = iframeDoc.getElementById('text-edit-link-style');
      if (linkStyle) {
        linkStyle.remove();
      }
      
      // 공백 제거 모드 선택 스타일 제거
      const spacingSelectedElements = iframeDoc.querySelectorAll('.spacing-selected');
      spacingSelectedElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.classList.remove('spacing-selected');
        htmlEl.style.outline = 'none';
        htmlEl.style.boxShadow = 'none';
        htmlEl.style.backgroundColor = '';
      });
      
      // 공백 제거 모드 클릭 핸들러 제거
      spacingClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      spacingClickHandlersRef.current.clear();
      
      // 클릭 가능한 컴포넌트 스타일 추가
      const componentElements = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
      
      // 컴포넌트 클릭 핸들러 (다중 선택 + 토글)
      const handleComponentClick = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        
        const target = e.target as HTMLElement;
        if (!target || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(target.tagName)) return;
        
        console.log('🎯 컴포넌트 클릭:', target.tagName);
        
        // 이미 선택된 요소인지 확인 (토글)
        const isSelected = target.classList.contains('component-selected');
        
        if (isSelected) {
          // 선택 해제
          target.classList.remove('component-selected');
          target.style.outline = '1px dashed #C0C0C0';
          target.style.boxShadow = 'none';
          target.style.backgroundColor = '';
          console.log('❌ 선택 해제:', target.tagName);
          
          setSelectedElements(prev => prev.filter(el => el !== target));
        } else {
          // 선택 추가 (STEP 2와 동일한 녹색 스타일)
          target.classList.add('component-selected');
          target.style.outline = '4px solid #28a745';
          target.style.outlineOffset = '3px';
          target.style.backgroundColor = 'rgba(40, 167, 69, 0.25)';
          target.style.boxShadow = '0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5)';
          target.style.transition = 'all 0.2s ease';
          console.log('✅ 선택 추가:', target.tagName);
          
          setSelectedElements(prev => [...prev, target]);
        }
      };
      
      componentElements.forEach((el) => {
        if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) {
          const htmlEl = el as HTMLElement;
          htmlEl.setAttribute('data-component-editable', 'true');
          htmlEl.style.cursor = 'pointer';
          htmlEl.style.outline = '1px dashed #C0C0C0';
          
          // 기존 핸들러가 있으면 제거
          const existingHandler = componentClickHandlersRef.current.get(htmlEl);
          if (existingHandler) {
            htmlEl.removeEventListener('click', existingHandler, true);
          }
          
          // 클릭 이벤트 리스너 추가 및 저장
          htmlEl.addEventListener('click', handleComponentClick, true);
          componentClickHandlersRef.current.set(htmlEl, handleComponentClick);
        }
      });
      
      // ⭐ 링크 클릭 방지 (다른 사이트로 이동 방지)
      const allLinks = iframeDoc.querySelectorAll('a');
      const preventLinkNavigation = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      };
      
      allLinks.forEach(link => {
        const htmlLink = link as HTMLElement;
        // 기존 핸들러가 있으면 제거
        const existingLinkHandler = linkClickHandlersRef.current.get(htmlLink);
        if (existingLinkHandler) {
          htmlLink.removeEventListener('click', existingLinkHandler, true);
        }
        htmlLink.addEventListener('click', preventLinkNavigation, true);
        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
        htmlLink.style.cursor = 'pointer';
      });
      
      console.log('✅ 컴포넌트 클릭 리스너 추가 완료:', componentElements.length, '개');
      console.log('✅ 링크 클릭 방지 핸들러 추가 완료:', allLinks.length, '개');
      
      // ⭐ 컴포넌트 모드 키보드 단축키 (Ctrl+Z, Ctrl+Shift+Z)
      const handleComponentKeydown = (e: KeyboardEvent) => {
        console.log('🔑 Step 3 iframe 키 감지:', e.key, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'shift:', e.shiftKey);
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          
          if (undoStackRef.current.length > 0) {
            console.log('↩️ Undo (Step 3 컴포넌트 편집) - stack:', undoStackRef.current.length);
            
            // 현재 상태를 redo stack에 저장
            redoStackRef.current.push(currentHtmlRef.current);
            
            // undo stack에서 이전 상태 복원
            const previousHtml = undoStackRef.current.pop()!;
            currentHtmlRef.current = previousHtml;
            
            // iframe에 HTML 복원
            iframeDoc.open();
            iframeDoc.write(previousHtml);
            iframeDoc.close();
            
            onHtmlChange(previousHtml);
            
            // 컴포넌트 편집 모드 다시 초기화
            setTimeout(() => {
              const newIframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (!newIframeDoc) return;
              
              // contentEditable 비활성화
              const editableElements = newIframeDoc.querySelectorAll('[contenteditable="true"]');
              editableElements.forEach((el) => {
                (el as HTMLElement).contentEditable = 'false';
                (el as HTMLElement).style.cursor = 'default';
              });
              
              // 컴포넌트 클릭 핸들러 추가
              const componentElements = newIframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
              
              const handleComponentClick = (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                
                const target = e.target as HTMLElement;
                if (!target || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(target.tagName)) return;
                
                const isSelected = target.classList.contains('component-selected');
                
                if (isSelected) {
                  target.classList.remove('component-selected');
                  target.style.outline = '1px dashed #C0C0C0';
                  target.style.boxShadow = 'none';
                  target.style.backgroundColor = '';
                  setSelectedElements(prev => prev.filter(el => el !== target));
                } else {
                  target.classList.add('component-selected');
                  target.style.outline = '4px solid #28a745';
                  target.style.outlineOffset = '3px';
                  target.style.backgroundColor = 'rgba(40, 167, 69, 0.25)';
                  target.style.boxShadow = '0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5)';
                  target.style.transition = 'all 0.2s ease';
                  setSelectedElements(prev => [...prev, target]);
                }
              };
              
              componentElements.forEach((el) => {
                if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) {
                  const htmlEl = el as HTMLElement;
                  htmlEl.setAttribute('data-component-editable', 'true');
                  htmlEl.style.cursor = 'pointer';
                  htmlEl.style.outline = '1px dashed #C0C0C0';
                  
                  const existingHandler = componentClickHandlersRef.current.get(htmlEl);
                  if (existingHandler) {
                    htmlEl.removeEventListener('click', existingHandler, true);
                  }
                  htmlEl.addEventListener('click', handleComponentClick, true);
                  componentClickHandlersRef.current.set(htmlEl, handleComponentClick);
                }
              });
              
              // 링크 클릭 방지 핸들러 추가
              const allLinks = newIframeDoc.querySelectorAll('a');
              const preventLinkNavigation = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
              };
              
              allLinks.forEach(link => {
                const htmlLink = link as HTMLElement;
                const existingLinkHandler = linkClickHandlersRef.current.get(htmlLink);
                if (existingLinkHandler) {
                  htmlLink.removeEventListener('click', existingLinkHandler, true);
                }
                htmlLink.addEventListener('click', preventLinkNavigation, true);
                linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
                htmlLink.style.cursor = 'pointer';
              });
              
              if (newIframeDoc.body) {
                newIframeDoc.body.setAttribute('tabindex', '-1');
                newIframeDoc.body.focus();
              }
            }, 100);
            
            setSelectedElements([]);
          } else {
            console.log('⚠️ Step 3 컴포넌트 Undo stack이 비어있습니다');
          }
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          
          if (redoStackRef.current.length > 0) {
            console.log('↪️ Redo (Step 3 컴포넌트 편집) - stack:', redoStackRef.current.length);
            
            // 현재 상태를 undo stack에 저장
            undoStackRef.current.push(currentHtmlRef.current);
            
            // redo stack에서 다음 상태 복원
            const nextHtml = redoStackRef.current.pop()!;
            currentHtmlRef.current = nextHtml;
            
            // iframe에 HTML 복원
            iframeDoc.open();
            iframeDoc.write(nextHtml);
            iframeDoc.close();
            
            onHtmlChange(nextHtml);
            
            // 컴포넌트 편집 모드 다시 초기화
            setTimeout(() => {
              const newIframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (!newIframeDoc) return;
              
              // contentEditable 비활성화
              const editableElements = newIframeDoc.querySelectorAll('[contenteditable="true"]');
              editableElements.forEach((el) => {
                (el as HTMLElement).contentEditable = 'false';
                (el as HTMLElement).style.cursor = 'default';
              });
              
              // 컴포넌트 클릭 핸들러 추가
              const componentElements = newIframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
              
              const handleComponentClick = (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                
                const target = e.target as HTMLElement;
                if (!target || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(target.tagName)) return;
                
                const isSelected = target.classList.contains('component-selected');
                
                if (isSelected) {
                  target.classList.remove('component-selected');
                  target.style.outline = '1px dashed #C0C0C0';
                  target.style.boxShadow = 'none';
                  target.style.backgroundColor = '';
                  setSelectedElements(prev => prev.filter(el => el !== target));
                } else {
                  target.classList.add('component-selected');
                  target.style.outline = '4px solid #28a745';
                  target.style.outlineOffset = '3px';
                  target.style.backgroundColor = 'rgba(40, 167, 69, 0.25)';
                  target.style.boxShadow = '0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5)';
                  target.style.transition = 'all 0.2s ease';
                  setSelectedElements(prev => [...prev, target]);
                }
              };
              
              componentElements.forEach((el) => {
                if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) {
                  const htmlEl = el as HTMLElement;
                  htmlEl.setAttribute('data-component-editable', 'true');
                  htmlEl.style.cursor = 'pointer';
                  htmlEl.style.outline = '1px dashed #C0C0C0';
                  
                  const existingHandler = componentClickHandlersRef.current.get(htmlEl);
                  if (existingHandler) {
                    htmlEl.removeEventListener('click', existingHandler, true);
                  }
                  htmlEl.addEventListener('click', handleComponentClick, true);
                  componentClickHandlersRef.current.set(htmlEl, handleComponentClick);
                }
              });
              
              // 링크 클릭 방지 핸들러 추가
              const allLinks = newIframeDoc.querySelectorAll('a');
              const preventLinkNavigation = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
              };
              
              allLinks.forEach(link => {
                const htmlLink = link as HTMLElement;
                const existingLinkHandler = linkClickHandlersRef.current.get(htmlLink);
                if (existingLinkHandler) {
                  htmlLink.removeEventListener('click', existingLinkHandler, true);
                }
                htmlLink.addEventListener('click', preventLinkNavigation, true);
                linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
                htmlLink.style.cursor = 'pointer';
              });
              
              if (newIframeDoc.body) {
                newIframeDoc.body.setAttribute('tabindex', '-1');
                newIframeDoc.body.focus();
              }
            }, 100);
            
            setSelectedElements([]);
          } else {
            console.log('⚠️ Step 3 컴포넌트 Redo stack이 비어있습니다');
          }
        }
      };
      
      // 기존 리스너 제거
      if (iframeKeydownHandlerRef.current && iframeDoc) {
        iframeDoc.removeEventListener('keydown', iframeKeydownHandlerRef.current, true);
      }
      // 새 리스너 등록 및 저장
      iframeKeydownHandlerRef.current = handleComponentKeydown;
      iframeDoc.addEventListener('keydown', handleComponentKeydown, true);
      console.log('✅ Step 3 컴포넌트 모드 키보드 단축키 등록 완료');
      
      // 부모 window에서도 이벤트 잡기 (iframe 포커스가 없을 때 대비)
      const handleWindowKeydown = (e: KeyboardEvent) => {
        console.log('🔑 Step 3 window 키 감지:', e.key, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'shift:', e.shiftKey);
        
        // Ctrl+Z (되돌리기)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          
          if (undoStackRef.current.length > 0 && iframeDoc) {
            console.log('↩️ Undo (Step 3 컴포넌트 편집 - window)');
            console.log('📊 Step 3 Undo stack:', undoStackRef.current.length, '| Redo stack:', redoStackRef.current.length);
            
            redoStackRef.current.push(currentHtmlRef.current);
            const previousHtml = undoStackRef.current.pop()!;
            console.log('📊 Step 3 Undo 후 - Undo stack:', undoStackRef.current.length, '| Redo stack:', redoStackRef.current.length);
            currentHtmlRef.current = previousHtml;
            
            iframeDoc.open();
            iframeDoc.write(previousHtml);
            iframeDoc.close();
            
            onHtmlChange(previousHtml);
            setSelectedElements([]);
            
            // ⭐ html 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
          }
        }
        // Ctrl+Shift+Z 또는 Ctrl+Y (다시 실행)
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          console.log('🔑 Step 3 Redo 키 감지! key:', e.key, 'Redo stack:', redoStackRef.current.length);
          
          if (redoStackRef.current.length > 0 && iframeDoc) {
            console.log('↪️ Redo (Step 3 컴포넌트 편집 - window)');
            console.log('📊 Step 3 Redo 전 - Undo stack:', undoStackRef.current.length, '| Redo stack:', redoStackRef.current.length);
            
            undoStackRef.current.push(currentHtmlRef.current);
            const nextHtml = redoStackRef.current.pop()!;
            console.log('📊 Step 3 Redo 후 - Undo stack:', undoStackRef.current.length, '| Redo stack:', redoStackRef.current.length);
            currentHtmlRef.current = nextHtml;
            
            iframeDoc.open();
            iframeDoc.write(nextHtml);
            iframeDoc.close();
            
            onHtmlChange(nextHtml);
            setSelectedElements([]);
            
            // ⭐ html 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
          } else {
            console.log('⚠️ Step 3 Redo stack이 비어있음 (window)');
          }
        }
      };
      
      // 기존 window 리스너 제거
      if (windowKeydownHandlerRef.current) {
        window.removeEventListener('keydown', windowKeydownHandlerRef.current, true);
      }
      // 새 window 리스너 등록 및 저장
      windowKeydownHandlerRef.current = handleWindowKeydown;
      window.addEventListener('keydown', handleWindowKeydown, true);
      console.log('✅ Step 3 window 키보드 이벤트 리스너 등록 완료');
      
    } else if (mode === 'spacing') {
      // 공백 제거 모드
      // contentEditable 비활성화
      const editableElements = iframeDoc.querySelectorAll('[contenteditable="true"]');
      editableElements.forEach((el) => {
        (el as HTMLElement).contentEditable = 'false';
        (el as HTMLElement).style.cursor = 'pointer';
      });
      
      // ⭐ 링크 클릭 핸들러 제거
      linkClickHandlersRef.current.forEach((handler, link) => {
        link.removeEventListener('click', handler, true);
      });
      linkClickHandlersRef.current.clear();
      
      // 링크 스타일 태그 제거
      const linkStyle = iframeDoc.getElementById('text-edit-link-style');
      if (linkStyle) {
        linkStyle.remove();
      }
      
      // 컴포넌트 편집 스타일 제거
      const componentElements = iframeDoc.querySelectorAll('[data-component-editable]');
      componentElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.outline = 'none';
        htmlEl.style.boxShadow = 'none';
        htmlEl.classList.remove('component-selected');
        htmlEl.removeAttribute('data-component-editable');
        
        // 컴포넌트 클릭 핸들러 제거
        const handler = componentClickHandlersRef.current.get(htmlEl);
        if (handler) {
          htmlEl.removeEventListener('click', handler, true);
          componentClickHandlersRef.current.delete(htmlEl);
        }
      });
      
      // 모든 컴포넌트 클릭 핸들러 제거
      componentClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      componentClickHandlersRef.current.clear();
      
      // 공백 제거 모드용 클릭 핸들러
      const handleSpacingClick = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        
        const target = e.target as HTMLElement;
        if (!target || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(target.tagName)) return;
        
        console.log('🎯 공백 제거 모드 클릭:', target.tagName);
        
        // 이미 선택된 요소인지 확인 (토글)
        const isSelected = target.classList.contains('spacing-selected');
        
        if (isSelected) {
          // 선택 해제
          target.classList.remove('spacing-selected');
          target.style.outline = '1px dashed #FFA500';
          target.style.boxShadow = 'none';
          target.style.backgroundColor = '';
          console.log('❌ 공백 제거 선택 해제:', target.tagName);
          
          setSelectedElements(prev => prev.filter(el => el !== target));
        } else {
          // 선택 추가 (주황색 스타일)
          target.classList.add('spacing-selected');
          target.style.outline = '4px solid #FFA500';
          target.style.outlineOffset = '3px';
          target.style.backgroundColor = 'rgba(255, 165, 0, 0.25)';
          target.style.boxShadow = '0 0 0 4px rgba(255, 165, 0, 0.4), 0 4px 12px rgba(255, 165, 0, 0.5)';
          target.style.transition = 'all 0.2s ease';
          console.log('✅ 공백 제거 선택 추가:', target.tagName);
          
          setSelectedElements(prev => [...prev, target]);
        }
      };
      
      // 클릭 가능한 요소들에 스타일 추가
      const spacingElements = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
      
      spacingElements.forEach((el) => {
        if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) {
          const htmlEl = el as HTMLElement;
          htmlEl.style.cursor = 'pointer';
          htmlEl.style.outline = '1px dashed #FFA500';
          
          // 기존 핸들러가 있으면 제거
          const existingHandler = spacingClickHandlersRef.current.get(htmlEl);
          if (existingHandler) {
            htmlEl.removeEventListener('click', existingHandler, true);
          }
          
          // 클릭 이벤트 리스너 추가 및 저장
          htmlEl.addEventListener('click', handleSpacingClick, true);
          spacingClickHandlersRef.current.set(htmlEl, handleSpacingClick);
        }
      });
      
      // ⭐ 링크 클릭 방지 (다른 사이트로 이동 방지)
      const allLinks = iframeDoc.querySelectorAll('a');
      const preventLinkNavigation = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      };
      
      allLinks.forEach(link => {
        const htmlLink = link as HTMLElement;
        // 기존 핸들러가 있으면 제거
        const existingLinkHandler = linkClickHandlersRef.current.get(htmlLink);
        if (existingLinkHandler) {
          htmlLink.removeEventListener('click', existingLinkHandler, true);
        }
        htmlLink.addEventListener('click', preventLinkNavigation, true);
        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
        htmlLink.style.cursor = 'pointer';
      });
      
      console.log('✅ 공백 제거 모드 클릭 리스너 추가 완료:', spacingElements.length, '개');
      console.log('✅ 링크 클릭 방지 핸들러 추가 완료:', allLinks.length, '개');
      
    } else if (mode === 'spacing-all') {
      // 전체 공백 제거 모드 (Step 2에서 선택한 영역 전체에 공백 제거)
      // contentEditable 비활성화
      const editableElements = iframeDoc.querySelectorAll('[contenteditable="true"]');
      editableElements.forEach((el) => {
        (el as HTMLElement).contentEditable = 'false';
        (el as HTMLElement).style.cursor = 'default';
      });
      
      // ⭐ 링크 클릭 핸들러 제거
      linkClickHandlersRef.current.forEach((handler, link) => {
        link.removeEventListener('click', handler, true);
      });
      linkClickHandlersRef.current.clear();
      
      // 링크 스타일 태그 제거
      const linkStyle = iframeDoc.getElementById('text-edit-link-style');
      if (linkStyle) {
        linkStyle.remove();
      }
      
      // ⭐ 링크 클릭 방지 (다른 사이트로 이동 방지)
      const allLinks = iframeDoc.querySelectorAll('a');
      const preventLinkNavigation = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      };
      
      allLinks.forEach(link => {
        const htmlLink = link as HTMLElement;
        htmlLink.addEventListener('click', preventLinkNavigation, true);
        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
        htmlLink.style.cursor = 'default';
      });
      
      console.log('✅ 전체 공백 제거 모드 링크 클릭 방지 핸들러 추가 완료:', allLinks.length, '개');
      
      // 컴포넌트 편집 스타일 제거
      const componentElements = iframeDoc.querySelectorAll('[data-component-editable]');
      componentElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.outline = 'none';
        htmlEl.style.boxShadow = 'none';
        htmlEl.classList.remove('component-selected');
        htmlEl.removeAttribute('data-component-editable');
        
        // 컴포넌트 클릭 핸들러 제거
        const handler = componentClickHandlersRef.current.get(htmlEl);
        if (handler) {
          htmlEl.removeEventListener('click', handler, true);
          componentClickHandlersRef.current.delete(htmlEl);
        }
      });
      
      // 모든 컴포넌트 클릭 핸들러 제거
      componentClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      componentClickHandlersRef.current.clear();
      
      // 공백 제거 모드 선택 스타일 제거
      const spacingSelectedElements = iframeDoc.querySelectorAll('.spacing-selected');
      spacingSelectedElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.classList.remove('spacing-selected');
        htmlEl.style.outline = 'none';
        htmlEl.style.boxShadow = 'none';
        htmlEl.style.backgroundColor = '';
      });
      
      // 공백 제거 모드 클릭 핸들러 제거
      spacingClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      spacingClickHandlersRef.current.clear();
      
      // 선택된 요소 초기화 (전체 공백 제거 모드에서는 선택 기능 없음)
      setSelectedElements([]);
      
      console.log('✅ 전체 공백 제거 모드 활성화 (Step 2 선택 영역 전체에 공백 제거 적용)');
    }
    
    // ⭐ Cleanup: window 이벤트 리스너 제거
    return () => {
      console.log('🧹 Step 3 cleanup: 이벤트 리스너 제거');
      // window 리스너 제거
      if (windowKeydownHandlerRef.current) {
        window.removeEventListener('keydown', windowKeydownHandlerRef.current, true);
        console.log('✅ Step 3 window 키보드 리스너 제거');
      }
      // iframe 리스너는 모드 전환 시 자동으로 제거됨 (DOM이 재설정되므로)
    };
  }, [mode, isInitialized, html]); // ⭐ html 추가하여 undo/redo 후 자동 재활성화

  // 초기 렌더링만 수행 (한 번만 실행)
  useEffect(() => {
    if (isInitialized) return; // 이미 초기화되었으면 스킵
    
    console.log('📝 Step3PreEdit 초기 렌더링:', {
      hasIframe: !!iframeRef.current,
      hasHtml: !!html,
      selectedAreasCount: selectedAreas.length,
      selectedAreasIds: selectedAreas.map(a => a.id)
    });
    
    if (iframeRef.current && html && selectedAreas.length > 0) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (iframeDoc) {
        // 원본 HTML을 iframe에 로드
        let htmlContent = html;
        
        // HTML 구조 확인 및 보완
        const hasDoctype = htmlContent.trim().toLowerCase().startsWith('<!doctype');
        const hasHtml = htmlContent.includes('<html');
        const hasBody = htmlContent.includes('<body');
        
        if (!hasDoctype || !hasHtml || !hasBody) {
          if (!htmlContent.includes('<body')) {
            htmlContent = `<body>${htmlContent}</body>`;
          }
          if (!htmlContent.includes('<html')) {
            htmlContent = `<html>${htmlContent}</html>`;
          }
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', '<html><head></head>');
          }
          if (!hasDoctype) {
            htmlContent = `<!DOCTYPE html>${htmlContent}`;
          }
        }
        
        try {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();
        } catch (error) {
          // iframe 내부 스크립트 에러는 무시 (크롤링된 페이지의 스크립트 에러)
          console.warn('iframe write error (ignored):', error);
        }
        
        // Translation.jsx의 handleStartPreEdit 로직과 동일하게
        // 선택된 영역만 남기고 나머지 제거
        setTimeout(() => {
          if (iframeDoc.body) {
            const selectedElementIds = new Set(selectedAreas.map(area => area.id));
            console.log('🔍 선택된 요소 ID 목록:', Array.from(selectedElementIds));
            
            // 모든 data-transflow-id 속성을 가진 요소 찾기
            const allElementsWithId = iframeDoc.querySelectorAll('[data-transflow-id]');
            console.log('📦 iframe 내 data-transflow-id 요소:', 
              Array.from(allElementsWithId).map(el => ({
                id: el.getAttribute('data-transflow-id'),
                tag: el.tagName,
                selected: selectedElementIds.has(el.getAttribute('data-transflow-id') || '')
              }))
            );
            
            // 선택되지 않은 요소 제거 (Translation.jsx와 동일)
            const removeUnselectedElements = (element: HTMLElement): boolean => {
              if (element.hasAttribute('data-transflow-id')) {
                const elementId = element.getAttribute('data-transflow-id');
                if (elementId && selectedElementIds.has(elementId)) {
                  console.log('✅ 선택된 요소 발견:', elementId, element.tagName);
                  return true;
                }
              }
              
              const children = Array.from(element.children) as HTMLElement[];
              const childrenToKeep: HTMLElement[] = [];
              
              children.forEach(child => {
                if (removeUnselectedElements(child)) {
                  childrenToKeep.push(child);
                }
              });
              
              if (childrenToKeep.length > 0) {
                const allChildren = Array.from(element.children);
                allChildren.forEach(child => {
                  if (!childrenToKeep.includes(child as HTMLElement)) {
                    element.removeChild(child);
                  }
                });
                return true;
              }
              
              return false;
            };
            
            const bodyChildren = Array.from(iframeDoc.body.children) as HTMLElement[];
            const bodyChildrenToKeep: HTMLElement[] = [];
            
            bodyChildren.forEach(child => {
              if (removeUnselectedElements(child)) {
                bodyChildrenToKeep.push(child);
              }
            });
            
            const allBodyChildren = Array.from(iframeDoc.body.children);
            allBodyChildren.forEach(child => {
              if (!bodyChildrenToKeep.includes(child as HTMLElement)) {
                iframeDoc.body.removeChild(child);
              }
            });
            
            console.log('✨ 최종 body 자식 요소:', iframeDoc.body.children.length, '개');
            console.log('📄 최종 HTML:', iframeDoc.body.innerHTML.substring(0, 500));
            
            // 선택 표시 제거
            iframeDoc.querySelectorAll('.transflow-selected, .transflow-hovering, .transflow-area-selected').forEach(el => {
              (el as HTMLElement).classList.remove('transflow-selected', 'transflow-hovering', 'transflow-area-selected');
            });
            
            // 선택된 영역만 남은 HTML을 onHtmlChange로 저장
            const selectedOnlyHtml = iframeDoc.documentElement.outerHTML;
            console.log('💾 STEP 3 선택된 영역만 저장:', selectedOnlyHtml.substring(0, 200));
            
            // 초기 HTML을 currentHtmlRef와 undo stack에 저장
            currentHtmlRef.current = selectedOnlyHtml;
            undoStackRef.current = []; // 초기화
            redoStackRef.current = []; // 초기화
            // ⭐ 공백 제거 undo stack도 초기화
            spacingCurrentHtmlRef.current = selectedOnlyHtml;
            spacingUndoStackRef.current = [];
            spacingRedoStackRef.current = [];
            
            onHtmlChange(selectedOnlyHtml);
            
            // 초기화 완료 표시
            setIsInitialized(true);
            
            // 텍스트 편집 모드로 시작 (기본값)
            if (mode === 'text') {
              // 텍스트 편집 활성화 (Translation.jsx의 enableTextEditing과 동일)
              const editableElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button, article, section, header, footer, main, aside');
              
              editableElements.forEach((el) => {
                if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) {
                  (el as HTMLElement).contentEditable = 'true';
                  (el as HTMLElement).style.cursor = 'text';
                }
              });
              
              // 스크립트, 스타일 태그는 편집 불가능하게
              const scripts = iframeDoc.querySelectorAll('script, style, noscript');
              scripts.forEach((el) => {
                (el as HTMLElement).contentEditable = 'false';
              });
              
              // Cmd+Z (Mac) 및 Ctrl+Z (Windows) Undo/Redo 기능
              const handleKeyDown = (e: KeyboardEvent) => {
                // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  iframeDoc.execCommand('undo', false);
                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                  onHtmlChange(updatedHtml);
                }
                // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
                else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  iframeDoc.execCommand('redo', false);
                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                  onHtmlChange(updatedHtml);
                }
                
                // ⭐ 백스페이스 키 처리 (브라우저 기본 동작 허용)
                if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  // 브라우저가 알아서 처리하게 놔둠 (포커스 유지)
                  console.log('⌫ 백스페이스 (STEP 3 텍스트 편집)');
                }
              };
              
              iframeDoc.addEventListener('keydown', handleKeyDown, true);
              
              // ⚡ 최적화: input 이벤트 디바운스 (메모리 사용 감소)
              let inputTimeoutId: NodeJS.Timeout | null = null;
              const handleInput = () => {
                // 기존 타이머 취소
                if (inputTimeoutId) {
                  clearTimeout(inputTimeoutId);
                }
                
                // 500ms 후에 HTML 추출 (디바운스)
                inputTimeoutId = setTimeout(() => {
                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                  onHtmlChange(updatedHtml);
                  inputTimeoutId = null;
                }, 500);
              };
              iframeDoc.body.addEventListener('input', handleInput);
            } else {
              // 컴포넌트 편집 모드
              const allElements = iframeDoc.querySelectorAll('*');
              
              // 모든 요소를 편집 불가능하게
              allElements.forEach((el) => {
                (el as HTMLElement).contentEditable = 'false';
                (el as HTMLElement).style.cursor = 'pointer';
              });
              
              // 컴포넌트 선택 스타일 추가
              const componentStyle = iframeDoc.createElement('style');
              componentStyle.id = 'transflow-component-style';
              componentStyle.textContent = `
                div, section, article, header, footer, main, aside, nav {
                  border: 1px dashed #C0C0C0 !important;
                  margin: 2px !important;
                  padding: 2px !important;
                }
                .selected-for-delete {
                  outline: 5px solid #000000 !important;
                  outline-offset: 3px;
                  background-color: rgba(0, 0, 0, 0.2) !important;
                  box-shadow: 0 0 0 3px rgba(255, 0, 0, 0.3), 0 0 10px rgba(0, 0, 0, 0.5) !important;
                  border: 2px solid #000000 !important;
                }
              `;
              iframeDoc.head.appendChild(componentStyle);
              
              // 클릭으로 컴포넌트 선택
              const handleComponentClick = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return;
                if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return;
                
                e.preventDefault();
                e.stopPropagation();
                
                // 기존 선택 제거
                allElements.forEach((elem) => {
                  (elem as HTMLElement).classList.remove('selected-for-delete');
                });
                
                // 새 선택
                target.classList.add('selected-for-delete');
                setSelectedElement(target);
              };
              
              allElements.forEach((el) => {
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return;
                if (el === iframeDoc.body || el === iframeDoc.documentElement) return;
                
                (el as HTMLElement).removeEventListener('click', handleComponentClick as EventListener);
                (el as HTMLElement).addEventListener('click', handleComponentClick as EventListener, true);
              });
              
              if (iframeDoc.body) {
                iframeDoc.body.addEventListener('click', handleComponentClick as EventListener, true);
              }
            }
          }
        }, 200);
      }
    }
  }, [html, selectedAreas]); // mode와 onHtmlChange 제거! (초기 렌더링만 수행)

  const handleDelete = () => {
    if (selectedElements.length > 0 && iframeRef.current && (mode === 'component' || mode === 'spacing')) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        console.log('🗑️ 삭제할 요소:', selectedElements.length, '개');
        
        // 삭제 전 현재 상태를 undo stack에 저장
        const currentHtml = iframeDoc.documentElement.outerHTML;
        if (currentHtmlRef.current && currentHtmlRef.current !== currentHtml) {
          undoStackRef.current.push(currentHtmlRef.current);
          redoStackRef.current = []; // 새 작업 시 redo stack 초기화
          console.log('💾 Step 3 Undo stack에 저장 (삭제 전):', undoStackRef.current.length);
          console.log('🔄 Step 3 Redo stack 초기화');
        } else {
          console.log('⚠️ Step 3 삭제 전 저장 스킵 (currentHtmlRef:', !!currentHtmlRef.current, ', 동일:', currentHtmlRef.current === currentHtml, ')');
        }
        
        // 선택된 모든 요소 삭제
        selectedElements.forEach(el => {
          if (el.parentNode) {
            el.remove();
          }
        });
        
        const newHtml = iframeDoc.documentElement.outerHTML;
        currentHtmlRef.current = newHtml;
        onHtmlChange(newHtml);
        setSelectedElements([]);
        
        console.log('✅ 삭제 완료');
        
        // ⭐ 삭제 후 iframe에 포커스를 주어 키보드 단축키가 바로 작동하도록 함
        setTimeout(() => {
          // body에 tabIndex 설정하여 포커스 가능하게 만들기
          if (iframeDoc.body) {
            iframeDoc.body.setAttribute('tabindex', '-1');
            iframeDoc.body.focus();
          }
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
          }
          iframe.focus();
          console.log('🎯 Step 3 iframe에 포커스 설정');
        }, 100);
      }
    }
  };

  // 일반적인 컨테이너 클래스명 패턴 인식
  const isLikelyContainer = (element: HTMLElement): boolean => {
    const className = (element.className || '').toString();
    const containerPatterns = [
      /container/i,
      /wrapper/i,
      /main-content/i,
      /content-wrapper/i,
      /page-content/i,
      /article-wrapper/i,
      /section-container/i,
      /content-container/i,
      /main-wrapper/i
    ];
    return containerPatterns.some(pattern => pattern.test(className));
  };

  // 공백 제거 함수들
  const removeSpacing = (type: 'top' | 'bottom' | 'left' | 'right' | 'auto') => {
    if (!iframeRef.current) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc || !iframeDoc.body) return;

    // 🔍 디버깅: 버튼 클릭 전 HTML 및 스타일 정보 저장
    const beforeHtml = iframeDoc.documentElement.outerHTML;
    const parentElements = iframeDoc.querySelectorAll('.transflow-spacing-parent');
    const beforeStyles: any[] = [];
    parentElements.forEach((el, idx) => {
      const computedStyle = iframeDoc.defaultView?.getComputedStyle(el as HTMLElement);
      beforeStyles.push({
        index: idx,
        tag: el.tagName,
        marginLeft: computedStyle?.marginLeft,
        marginRight: computedStyle?.marginRight,
        paddingLeft: computedStyle?.paddingLeft,
        paddingRight: computedStyle?.paddingRight,
      });
    });
    console.log('🔍 [공백 제거 전] 부모 요소 스타일:', beforeStyles);
    console.log('🔍 [공백 제거 전] HTML 길이:', beforeHtml.length);

    // ⭐ 공백 제거 전 현재 상태를 공백 제거 undo stack에 저장
    const currentHtml = iframeDoc.documentElement.outerHTML;
    if (spacingCurrentHtmlRef.current && spacingCurrentHtmlRef.current !== currentHtml) {
      spacingUndoStackRef.current.push(spacingCurrentHtmlRef.current);
      spacingRedoStackRef.current = [];
    }

    // CSS 스타일을 동적으로 추가하기 위한 스타일 태그 생성 또는 업데이트
    let spacingStyle = iframeDoc.getElementById('transflow-spacing-remover') as HTMLStyleElement;
    if (!spacingStyle) {
      spacingStyle = iframeDoc.createElement('style');
      spacingStyle.id = 'transflow-spacing-remover';
      // head의 맨 마지막에 추가 (모든 외부 CSS 파일 이후)
      iframeDoc.head.appendChild(spacingStyle);
    } else {
      // 이미 있으면 head의 맨 마지막으로 이동 (외부 CSS 이후에 오도록)
      spacingStyle.remove();
      iframeDoc.head.appendChild(spacingStyle);
    }

    // 선택된 요소들 찾기
    const selectedElementIds = new Set(selectedAreas.map(area => area.id));
    const selectedElementsFromStep2 = Array.from(iframeDoc.querySelectorAll('[data-transflow-id]'))
      .filter(el => selectedElementIds.has(el.getAttribute('data-transflow-id') || ''));

    // 공백 제거 모드일 때는 공백 제거 모드에서 선택한 요소만 사용
    // 전체 공백 제거 모드일 때는 Step 2에서 선택한 영역 사용
    const allSelectedElements = mode === 'spacing' 
      ? selectedElements  // 공백 제거 모드: 선택한 요소만
      : mode === 'spacing-all'
      ? selectedElementsFromStep2  // 전체 공백 제거 모드: Step 2 선택 영역
      : selectedElementsFromStep2;  // 기본: Step 2 선택 영역

    console.log('🔍 Step 2에서 선택된 요소 개수:', selectedElementsFromStep2.length);
    console.log('🔍 공백 제거 모드에서 선택된 요소 개수:', mode === 'spacing' ? selectedElements.length : 0);
    console.log('🔍 전체 공백 제거 모드:', mode === 'spacing-all' ? '활성화' : '비활성화');
    console.log('🔍 총 선택된 요소 개수:', allSelectedElements.length);

    // 기존 클래스 제거 (재적용을 위해)
    iframeDoc.querySelectorAll('.transflow-spacing-parent').forEach(el => {
      el.classList.remove('transflow-spacing-parent');
    });

    // 선택된 요소들의 부모 요소들에 클래스 추가
    const parentElementsList: HTMLElement[] = [];
    allSelectedElements.forEach((selectedEl) => {
      let parent = selectedEl.parentElement;
      // body까지 올라가면서 부모 요소들에 클래스 추가
      while (parent && parent !== iframeDoc.body && parent !== iframeDoc.documentElement) {
        if (!parent.classList.contains('transflow-spacing-parent')) {
          parent.classList.add('transflow-spacing-parent');
          parentElementsList.push(parent as HTMLElement);
        }
        parent = parent.parentElement;
      }
    });

    console.log('🔍 부모 요소 개수:', parentElementsList.length);

    // 상태 업데이트
    if (type === 'auto') {
      // 자동 모드는 모든 상태를 true로 설정
      spacingRemovedRef.current = {
        top: true,
        bottom: true,
        left: true,
        right: true,
        auto: true,
      };
    } else {
      spacingRemovedRef.current[type] = true;
    }

    // 모든 적용된 규칙을 기반으로 CSS 재작성
    const rules: string[] = [];
    
    // 선택된 요소의 부모 요소들에만 적용 (선택된 요소 자체는 제외)
    // 더 구체적인 선택자 사용 + body도 포함하여 외부 CSS와의 충돌 방지
    if (spacingRemovedRef.current.auto) {
      // 자동 모드면 모든 마진과 패딩 제거
      rules.push('body { margin: 0 !important; padding: 0 !important; }');
      rules.push('html body { margin: 0 !important; padding: 0 !important; }');
      rules.push('.transflow-spacing-parent { margin: 0 !important; padding: 0 !important; }');
      rules.push('section.transflow-spacing-parent { margin: 0 !important; padding: 0 !important; }');
      rules.push('div.transflow-spacing-parent { margin: 0 !important; padding: 0 !important; }');
      rules.push('body section.transflow-spacing-parent { margin: 0 !important; padding: 0 !important; }');
      rules.push('body div.transflow-spacing-parent { margin: 0 !important; padding: 0 !important; }');
      // 🔍 wrapper의 width와 max-width도 100%로 설정
      rules.push('.wrapper.transflow-spacing-parent { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }');
      rules.push('.transflow-spacing-parent.wrapper { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }');
      // 🔍 선택된 요소(article)의 width와 margin도 제거
      rules.push('[data-transflow-id] { margin: 0 !important; width: 100% !important; }');
      rules.push('#contentPost article { margin: 0 !important; width: 100% !important; }');
    } else {
      // 개별 모드면 각각 적용
      if (spacingRemovedRef.current.top) {
        rules.push('body { margin-top: 0 !important; }');
        rules.push('html body { margin-top: 0 !important; }');
        rules.push('.transflow-spacing-parent { margin-top: 0 !important; }');
        rules.push('section.transflow-spacing-parent { margin-top: 0 !important; }');
        rules.push('div.transflow-spacing-parent { margin-top: 0 !important; }');
        rules.push('body section.transflow-spacing-parent { margin-top: 0 !important; }');
        rules.push('body div.transflow-spacing-parent { margin-top: 0 !important; }');
      }
      if (spacingRemovedRef.current.bottom) {
        rules.push('body { margin-bottom: 0 !important; }');
        rules.push('html body { margin-bottom: 0 !important; }');
        rules.push('.transflow-spacing-parent { margin-bottom: 0 !important; }');
        rules.push('section.transflow-spacing-parent { margin-bottom: 0 !important; }');
        rules.push('div.transflow-spacing-parent { margin-bottom: 0 !important; }');
        rules.push('body section.transflow-spacing-parent { margin-bottom: 0 !important; }');
        rules.push('body div.transflow-spacing-parent { margin-bottom: 0 !important; }');
      }
      if (spacingRemovedRef.current.left) {
        // 🔍 왼쪽 공백: padding과 margin 모두 제거 + body 포함
        rules.push('body { padding-left: 0 !important; margin-left: 0 !important; }');
        rules.push('html body { padding-left: 0 !important; margin-left: 0 !important; }');
        rules.push('.transflow-spacing-parent { padding-left: 0 !important; margin-left: 0 !important; }');
        rules.push('section.transflow-spacing-parent { padding-left: 0 !important; margin-left: 0 !important; }');
        rules.push('div.transflow-spacing-parent { padding-left: 0 !important; margin-left: 0 !important; }');
        rules.push('body section.transflow-spacing-parent { padding-left: 0 !important; margin-left: 0 !important; }');
        rules.push('body div.transflow-spacing-parent { padding-left: 0 !important; margin-left: 0 !important; }');
        // 🔍 wrapper의 width도 100%로 설정
        rules.push('.wrapper.transflow-spacing-parent { width: 100% !important; margin-left: 0 !important; }');
        rules.push('.transflow-spacing-parent.wrapper { width: 100% !important; margin-left: 0 !important; }');
        // 🔍 선택된 요소(article)의 margin-left도 제거
        rules.push('[data-transflow-id] { margin-left: 0 !important; }');
        rules.push('#contentPost article { margin-left: 0 !important; }');
      }
      if (spacingRemovedRef.current.right) {
        // 🔍 오른쪽 공백: padding과 margin 모두 제거 + body 포함
        rules.push('body { padding-right: 0 !important; margin-right: 0 !important; }');
        rules.push('html body { padding-right: 0 !important; margin-right: 0 !important; }');
        rules.push('.transflow-spacing-parent { padding-right: 0 !important; margin-right: 0 !important; }');
        rules.push('section.transflow-spacing-parent { padding-right: 0 !important; margin-right: 0 !important; }');
        rules.push('div.transflow-spacing-parent { padding-right: 0 !important; margin-right: 0 !important; }');
        rules.push('body section.transflow-spacing-parent { padding-right: 0 !important; margin-right: 0 !important; }');
        rules.push('body div.transflow-spacing-parent { padding-right: 0 !important; margin-right: 0 !important; }');
        // 🔍 wrapper의 width와 max-width도 100%로 설정
        rules.push('.wrapper.transflow-spacing-parent { width: 100% !important; max-width: 100% !important; margin-right: 0 !important; }');
        rules.push('.transflow-spacing-parent.wrapper { width: 100% !important; max-width: 100% !important; margin-right: 0 !important; }');
        // 🔍 선택된 요소(article)의 width와 margin도 제거
        rules.push('[data-transflow-id] { margin-right: 0 !important; margin-left: 0 !important; width: 100% !important; }');
        rules.push('#contentPost article { margin-right: 0 !important; margin-left: 0 !important; width: 100% !important; }');
      }
    }

    spacingStyle.textContent = rules.join('\n');
    console.log('🔍 적용된 CSS 규칙:', rules);

    // 🔍 계산된 스타일 기반으로 인라인 스타일 직접 적용 (CSS 규칙보다 우선순위가 높음)
    // 이 방식은 어떤 CSS 프레임워크를 사용하든 실제 적용된 값을 기준으로 처리하므로 보편적임
    
    // Body 처리
    if (iframeDoc.body) {
      const bodyComputed = iframeDoc.defaultView?.getComputedStyle(iframeDoc.body);
      if (bodyComputed) {
        if (type === 'auto' || type === 'top' || spacingRemovedRef.current.top) {
          const marginTop = parseFloat(bodyComputed.marginTop);
          const paddingTop = parseFloat(bodyComputed.paddingTop);
          if (marginTop > 0 || paddingTop > 0) {
            iframeDoc.body.style.marginTop = '0';
            iframeDoc.body.style.paddingTop = '0';
          }
        }
        if (type === 'auto' || type === 'bottom' || spacingRemovedRef.current.bottom) {
          const marginBottom = parseFloat(bodyComputed.marginBottom);
          const paddingBottom = parseFloat(bodyComputed.paddingBottom);
          if (marginBottom > 0 || paddingBottom > 0) {
            iframeDoc.body.style.marginBottom = '0';
            iframeDoc.body.style.paddingBottom = '0';
          }
        }
        if (type === 'auto' || type === 'left' || spacingRemovedRef.current.left) {
          const marginLeft = parseFloat(bodyComputed.marginLeft);
          const paddingLeft = parseFloat(bodyComputed.paddingLeft);
          if (marginLeft > 0 || paddingLeft > 0) {
            iframeDoc.body.style.marginLeft = '0';
            iframeDoc.body.style.paddingLeft = '0';
          }
        }
        if (type === 'auto' || type === 'right' || spacingRemovedRef.current.right) {
          const marginRight = parseFloat(bodyComputed.marginRight);
          const paddingRight = parseFloat(bodyComputed.paddingRight);
          if (marginRight > 0 || paddingRight > 0) {
            iframeDoc.body.style.marginRight = '0';
            iframeDoc.body.style.paddingRight = '0';
          }
        }
      }
    }

    // 부모 요소들 처리 (계산된 스타일 기반)
    parentElementsList.forEach((parent) => {
      const computed = iframeDoc.defaultView?.getComputedStyle(parent);
      if (!computed) return;

      // 실제 공백 값 확인
      const marginTop = parseFloat(computed.marginTop);
      const marginBottom = parseFloat(computed.marginBottom);
      const marginLeft = parseFloat(computed.marginLeft);
      const marginRight = parseFloat(computed.marginRight);
      const paddingTop = parseFloat(computed.paddingTop);
      const paddingBottom = parseFloat(computed.paddingBottom);
      const paddingLeft = parseFloat(computed.paddingLeft);
      const paddingRight = parseFloat(computed.paddingRight);

      // 실제 공백이 있을 때만 제거 (인라인 스타일로 강제 적용)
      if (type === 'auto' || type === 'top' || spacingRemovedRef.current.top) {
        if (marginTop > 0 || paddingTop > 0) {
          parent.style.marginTop = '0';
          parent.style.paddingTop = '0';
        }
      }
      if (type === 'auto' || type === 'bottom' || spacingRemovedRef.current.bottom) {
        if (marginBottom > 0 || paddingBottom > 0) {
          parent.style.marginBottom = '0';
          parent.style.paddingBottom = '0';
        }
      }
      if (type === 'auto' || type === 'left' || spacingRemovedRef.current.left) {
        if (marginLeft > 0 || paddingLeft > 0) {
          parent.style.marginLeft = '0';
          parent.style.paddingLeft = '0';
        }
      }
      if (type === 'auto' || type === 'right' || spacingRemovedRef.current.right) {
        if (marginRight > 0 || paddingRight > 0) {
          parent.style.marginRight = '0';
          parent.style.paddingRight = '0';
        }
      }

      // Width 제한 제거 (컨테이너로 보이거나 width가 제한되어 있으면)
      const width = computed.width;
      const maxWidth = computed.maxWidth;
      const isContainer = isLikelyContainer(parent);
      
      // 컨테이너로 보이거나 width가 100%가 아니거나 max-width가 설정되어 있으면 100%로 설정
      if (isContainer || (width !== '100%' && width !== 'auto' && maxWidth !== 'none' && maxWidth !== '100%')) {
        parent.style.width = '100%';
        if (maxWidth !== 'none' && maxWidth !== '100%') {
          parent.style.maxWidth = '100%';
        }
      }
      
      // margin: auto로 인한 중앙 정렬 제거
      if (computed.marginLeft === 'auto' || computed.marginRight === 'auto') {
        parent.style.marginLeft = '0';
        parent.style.marginRight = '0';
      }
    });

    // 선택된 요소 자체 처리
    allSelectedElements.forEach((selectedEl) => {
      const el = selectedEl as HTMLElement;
      const computed = iframeDoc.defaultView?.getComputedStyle(el);
      if (!computed) return;

      // 선택된 요소의 margin과 width 처리
      if (type === 'auto' || type === 'left' || type === 'right' || 
          spacingRemovedRef.current.left || spacingRemovedRef.current.right) {
        const marginLeft = parseFloat(computed.marginLeft);
        const marginRight = parseFloat(computed.marginRight);
        const width = computed.width;
        
        if (marginLeft > 0 || marginLeft < 0) {
          el.style.marginLeft = '0';
        }
        if (marginRight > 0 || marginRight < 0) {
          el.style.marginRight = '0';
        }
        
        // width가 100%가 아니면 100%로 설정
        if (width !== '100%' && width !== 'auto') {
          el.style.width = '100%';
        }
      }
      
      // margin: auto 제거
      if (computed.marginLeft === 'auto' || computed.marginRight === 'auto') {
        el.style.marginLeft = '0';
        el.style.marginRight = '0';
      }
    });

    // 🔍 디버깅: 버튼 클릭 후 HTML 및 스타일 정보
    setTimeout(() => {
      const afterHtml = iframeDoc.documentElement.outerHTML;
      const afterParentElements = iframeDoc.querySelectorAll('.transflow-spacing-parent');
      const afterStyles: any[] = [];
      afterParentElements.forEach((el, idx) => {
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(el as HTMLElement);
        afterStyles.push({
          index: idx,
          tag: el.tagName,
          className: el.className,
          marginLeft: computedStyle?.marginLeft,
          marginRight: computedStyle?.marginRight,
          paddingLeft: computedStyle?.paddingLeft,
          paddingRight: computedStyle?.paddingRight,
          width: computedStyle?.width,
          maxWidth: computedStyle?.maxWidth,
          // 인라인 스타일 확인
          inlineStyle: (el as HTMLElement).style.cssText,
        });
      });
      console.log('🔍 [공백 제거 후] 부모 요소 스타일:', afterStyles);
      console.log('🔍 [공백 제거 후] HTML 길이:', afterHtml.length);
      
      // 스타일 태그 위치 확인
      const styleTag = iframeDoc.getElementById('transflow-spacing-remover');
      console.log('🔍 스타일 태그 위치:', styleTag ? '존재함' : '없음');
      if (styleTag) {
        console.log('🔍 스타일 태그 내용:', styleTag.textContent);
        console.log('🔍 스타일 태그 다음 형제:', styleTag.nextSibling);
        // head의 마지막 자식인지 확인
        const isLastChild = styleTag === iframeDoc.head.lastElementChild;
        console.log('🔍 스타일 태그가 head의 마지막 자식인가?', isLastChild);
      }
    }, 100);

    console.log(`✅ ${type === 'auto' ? '자동으로 불필요한 공간 제거' : type + ' 공백 제거'} 완료`);

    // HTML 업데이트
    const updatedHtml = iframeDoc.documentElement.outerHTML;
    
    // ⭐ 공백 제거 후 브라우저 undo history 초기화 (텍스트 편집 undo와 분리)
    try {
      // 공백 제거가 완료된 후 iframe을 다시 write하여 브라우저 undo history 초기화
      iframeDoc.open();
      iframeDoc.write(updatedHtml);
      iframeDoc.close();
      console.log('🔄 브라우저 undo history 초기화 완료 (공백 제거 후)');
      
      // contentEditable 상태 복원 (텍스트 편집 모드인 경우)
      if (mode === 'text') {
        setTimeout(() => {
          const editableElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button, article, section, header, footer, main, aside');
          editableElements.forEach((el) => {
            if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) {
              (el as HTMLElement).contentEditable = 'true';
              (el as HTMLElement).style.cursor = 'text';
            }
          });
        }, 0);
      }
    } catch (e) {
      console.warn('⚠️ 브라우저 undo history 초기화 실패:', e);
    }
    
    // 변경 후 undo stack에 저장 (변경 전 상태는 이미 저장됨)
    currentHtmlRef.current = updatedHtml;
    // ⭐ 공백 제거 undo stack도 업데이트
    spacingCurrentHtmlRef.current = updatedHtml;
    onHtmlChange(updatedHtml);
  };

  // HTML 파일 다운로드 함수
  const downloadHtml = () => {
    if (!iframeRef.current) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // iframe 안의 HTML만 가져오기
    const htmlContent = iframeDoc.documentElement.outerHTML;
    
    // Blob 생성 및 다운로드
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `step3-html-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('💾 HTML 파일 다운로드 완료');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* 툴바 */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid #C0C0C0',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              marginRight: '16px',
            }}
          >
            번역 전 편집
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant={mode === 'text' ? 'primary' : 'secondary'}
              onClick={() => setMode('text')}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              텍스트 편집
            </Button>
            <Button
              variant={mode === 'component' ? 'primary' : 'secondary'}
              onClick={() => setMode('component')}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              컴포넌트 편집
            </Button>
            <Button
              variant={mode === 'spacing' ? 'primary' : 'secondary'}
              onClick={() => setMode('spacing')}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              공백 제거
            </Button>
            <Button
              variant={mode === 'spacing-all' ? 'primary' : 'secondary'}
              onClick={() => setMode('spacing-all')}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              전체 공백 제거
            </Button>
          </div>
          <div style={{ borderLeft: '1px solid #C0C0C0', height: '24px', margin: '0 4px' }} />
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant="secondary"
              onClick={() => {
                const iframe = iframeRef.current;
                const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                if (!iframeDoc) return;

                // ⭐ 모드에 따라 다른 undo 동작
                if (mode === 'spacing' || mode === 'spacing-all') {
                  // 공백 제거 모드: 공백 제거 undo stack 사용
                  if (spacingUndoStackRef.current.length > 0) {
                    // 현재 상태를 redo stack에 저장
                    const currentHtml = iframeDoc.documentElement.outerHTML;
                    spacingRedoStackRef.current.push(currentHtml);
                    
                    // undo stack에서 이전 상태 가져오기
                    const previousHtml = spacingUndoStackRef.current.pop() || '';
                    
                    // iframe에 이전 HTML 적용
                    iframeDoc.open();
                    iframeDoc.write(previousHtml);
                    iframeDoc.close();
                    
                    // currentHtmlRef 업데이트
                    currentHtmlRef.current = previousHtml;
                    spacingCurrentHtmlRef.current = previousHtml;
                    onHtmlChange(previousHtml);
                    
                    // 공백 제거 모드 다시 초기화
                    setTimeout(() => {
                      // 공백 제거 모드 재활성화는 useEffect에서 처리됨
                    }, 0);
                    
                    console.log('↶ 공백 제거 실행 취소 완료. 남은 undo:', spacingUndoStackRef.current.length);
                  } else {
                    console.log('⚠️ 공백 제거 undo stack이 비어있습니다');
                  }
                } else if (mode === 'component') {
                  // 컴포넌트 편집 모드: 컴포넌트 편집 undo stack 사용
                  if (undoStackRef.current.length > 0) {
                    // 현재 상태를 redo stack에 저장
                    const currentHtml = iframeDoc.documentElement.outerHTML;
                    redoStackRef.current.push(currentHtml);
                    
                    // undo stack에서 이전 상태 가져오기
                    const previousHtml = undoStackRef.current.pop() || '';
                    
                    // iframe에 이전 HTML 적용
                    iframeDoc.open();
                    iframeDoc.write(previousHtml);
                    iframeDoc.close();
                    
                    // currentHtmlRef 업데이트
                    currentHtmlRef.current = previousHtml;
                    onHtmlChange(previousHtml);
                    
                    // 컴포넌트 편집 모드 다시 초기화
                    setTimeout(() => {
                      const newIframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                      if (!newIframeDoc) return;
                      
                      // contentEditable 비활성화
                      const editableElements = newIframeDoc.querySelectorAll('[contenteditable="true"]');
                      editableElements.forEach((el) => {
                        (el as HTMLElement).contentEditable = 'false';
                        (el as HTMLElement).style.cursor = 'default';
                      });
                      
                      // 컴포넌트 클릭 핸들러 추가
                      const componentElements = newIframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
                      
                      const handleComponentClick = (e: Event) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        const target = e.target as HTMLElement;
                        if (!target || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(target.tagName)) return;
                        
                        const isSelected = target.classList.contains('component-selected');
                        
                        if (isSelected) {
                          target.classList.remove('component-selected');
                          target.style.outline = '1px dashed #C0C0C0';
                          target.style.boxShadow = 'none';
                          target.style.backgroundColor = '';
                          setSelectedElements(prev => prev.filter(el => el !== target));
                        } else {
                          target.classList.add('component-selected');
                          target.style.outline = '4px solid #28a745';
                          target.style.outlineOffset = '3px';
                          target.style.backgroundColor = 'rgba(40, 167, 69, 0.25)';
                          target.style.boxShadow = '0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5)';
                          target.style.transition = 'all 0.2s ease';
                          setSelectedElements(prev => [...prev, target]);
                        }
                      };
                      
                      componentElements.forEach((el) => {
                        if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) {
                          const htmlEl = el as HTMLElement;
                          htmlEl.setAttribute('data-component-editable', 'true');
                          htmlEl.style.cursor = 'pointer';
                          htmlEl.style.outline = '1px dashed #C0C0C0';
                          
                          // 기존 핸들러 제거 후 새로 추가
                          const existingHandler = componentClickHandlersRef.current.get(htmlEl);
                          if (existingHandler) {
                            htmlEl.removeEventListener('click', existingHandler, true);
                          }
                          htmlEl.addEventListener('click', handleComponentClick, true);
                          componentClickHandlersRef.current.set(htmlEl, handleComponentClick);
                        }
                      });
                      
                      // 링크 클릭 방지 핸들러 추가
                      const allLinks = newIframeDoc.querySelectorAll('a');
                      const preventLinkNavigation = (e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        return false;
                      };
                      
                      allLinks.forEach(link => {
                        const htmlLink = link as HTMLElement;
                        const existingLinkHandler = linkClickHandlersRef.current.get(htmlLink);
                        if (existingLinkHandler) {
                          htmlLink.removeEventListener('click', existingLinkHandler, true);
                        }
                        htmlLink.addEventListener('click', preventLinkNavigation, true);
                        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
                        htmlLink.style.cursor = 'pointer';
                      });
                      
                      // iframe 포커스 설정
                      if (newIframeDoc.body) {
                        newIframeDoc.body.setAttribute('tabindex', '-1');
                        newIframeDoc.body.focus();
                      }
                    }, 100);
                    
                    setSelectedElements([]);
                    
                    console.log('↶ 컴포넌트 편집 실행 취소 완료. 남은 undo:', undoStackRef.current.length);
                  } else {
                    console.log('⚠️ 컴포넌트 편집 undo stack이 비어있습니다');
                  }
                } else if (mode === 'text') {
                  // 텍스트 편집 모드: 브라우저 기본 undo 사용 (텍스트 변경만)
                  iframeDoc.execCommand('undo', false);
                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                  currentHtmlRef.current = updatedHtml;
                  onHtmlChange(updatedHtml);
                  console.log('↶ 텍스트 편집 실행 취소 완료 (브라우저 기본 undo)');
                }
              }}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              ↶ 실행 취소
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const iframe = iframeRef.current;
                const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                if (!iframeDoc) return;

                // ⭐ 모드에 따라 다른 redo 동작
                if (mode === 'spacing' || mode === 'spacing-all') {
                  // 공백 제거 모드: 공백 제거 redo stack 사용
                  if (spacingRedoStackRef.current.length > 0) {
                    // 현재 상태를 undo stack에 저장
                    const currentHtml = iframeDoc.documentElement.outerHTML;
                    spacingUndoStackRef.current.push(currentHtml);
                    
                    // redo stack에서 다음 상태 가져오기
                    const nextHtml = spacingRedoStackRef.current.pop() || '';
                    
                    // iframe에 다음 HTML 적용
                    iframeDoc.open();
                    iframeDoc.write(nextHtml);
                    iframeDoc.close();
                    
                    // currentHtmlRef 업데이트
                    currentHtmlRef.current = nextHtml;
                    spacingCurrentHtmlRef.current = nextHtml;
                    onHtmlChange(nextHtml);
                    
                    // 공백 제거 모드 다시 초기화
                    setTimeout(() => {
                      // 공백 제거 모드 재활성화는 useEffect에서 처리됨
                    }, 0);
                    
                    console.log('↷ 공백 제거 다시 실행 완료. 남은 redo:', spacingRedoStackRef.current.length);
                  } else {
                    console.log('⚠️ 공백 제거 redo stack이 비어있습니다');
                  }
                } else if (mode === 'component') {
                  // 컴포넌트 편집 모드: 컴포넌트 편집 redo stack 사용
                  if (redoStackRef.current.length > 0) {
                    // 현재 상태를 undo stack에 저장
                    const currentHtml = iframeDoc.documentElement.outerHTML;
                    undoStackRef.current.push(currentHtml);
                    
                    // redo stack에서 다음 상태 가져오기
                    const nextHtml = redoStackRef.current.pop() || '';
                    
                    // iframe에 다음 HTML 적용
                    iframeDoc.open();
                    iframeDoc.write(nextHtml);
                    iframeDoc.close();
                    
                    // currentHtmlRef 업데이트
                    currentHtmlRef.current = nextHtml;
                    onHtmlChange(nextHtml);
                    
                    // 컴포넌트 편집 모드 다시 초기화
                    setTimeout(() => {
                      const newIframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                      if (!newIframeDoc) return;
                      
                      // contentEditable 비활성화
                      const editableElements = newIframeDoc.querySelectorAll('[contenteditable="true"]');
                      editableElements.forEach((el) => {
                        (el as HTMLElement).contentEditable = 'false';
                        (el as HTMLElement).style.cursor = 'default';
                      });
                      
                      // 컴포넌트 클릭 핸들러 추가
                      const componentElements = newIframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
                      
                      const handleComponentClick = (e: Event) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        const target = e.target as HTMLElement;
                        if (!target || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(target.tagName)) return;
                        
                        const isSelected = target.classList.contains('component-selected');
                        
                        if (isSelected) {
                          target.classList.remove('component-selected');
                          target.style.outline = '1px dashed #C0C0C0';
                          target.style.boxShadow = 'none';
                          target.style.backgroundColor = '';
                          setSelectedElements(prev => prev.filter(el => el !== target));
                        } else {
                          target.classList.add('component-selected');
                          target.style.outline = '4px solid #28a745';
                          target.style.outlineOffset = '3px';
                          target.style.backgroundColor = 'rgba(40, 167, 69, 0.25)';
                          target.style.boxShadow = '0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5)';
                          target.style.transition = 'all 0.2s ease';
                          setSelectedElements(prev => [...prev, target]);
                        }
                      };
                      
                      componentElements.forEach((el) => {
                        if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) {
                          const htmlEl = el as HTMLElement;
                          htmlEl.setAttribute('data-component-editable', 'true');
                          htmlEl.style.cursor = 'pointer';
                          htmlEl.style.outline = '1px dashed #C0C0C0';
                          
                          // 기존 핸들러 제거 후 새로 추가
                          const existingHandler = componentClickHandlersRef.current.get(htmlEl);
                          if (existingHandler) {
                            htmlEl.removeEventListener('click', existingHandler, true);
                          }
                          htmlEl.addEventListener('click', handleComponentClick, true);
                          componentClickHandlersRef.current.set(htmlEl, handleComponentClick);
                        }
                      });
                      
                      // 링크 클릭 방지 핸들러 추가
                      const allLinks = newIframeDoc.querySelectorAll('a');
                      const preventLinkNavigation = (e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        return false;
                      };
                      
                      allLinks.forEach(link => {
                        const htmlLink = link as HTMLElement;
                        const existingLinkHandler = linkClickHandlersRef.current.get(htmlLink);
                        if (existingLinkHandler) {
                          htmlLink.removeEventListener('click', existingLinkHandler, true);
                        }
                        htmlLink.addEventListener('click', preventLinkNavigation, true);
                        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
                        htmlLink.style.cursor = 'pointer';
                      });
                      
                      // iframe 포커스 설정
                      if (newIframeDoc.body) {
                        newIframeDoc.body.setAttribute('tabindex', '-1');
                        newIframeDoc.body.focus();
                      }
                    }, 100);
                    
                    setSelectedElements([]);
                    
                    console.log('↷ 컴포넌트 편집 다시 실행 완료. 남은 redo:', redoStackRef.current.length);
                  } else {
                    console.log('⚠️ 컴포넌트 편집 redo stack이 비어있습니다');
                  }
                } else if (mode === 'text') {
                  // 텍스트 편집 모드: 브라우저 기본 redo 사용 (텍스트 변경만)
                  iframeDoc.execCommand('redo', false);
                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                  currentHtmlRef.current = updatedHtml;
                  onHtmlChange(updatedHtml);
                  console.log('↷ 텍스트 편집 다시 실행 완료 (브라우저 기본 redo)');
                }
              }}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              ↷ 다시 실행
            </Button>
          </div>
          {(mode === 'spacing' || mode === 'spacing-all') && (
            <>
              <div style={{ borderLeft: '1px solid #C0C0C0', height: '24px', margin: '0 4px' }} />
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#696969', marginRight: '4px' }}>
                  공백 제거:
                </span>
                <Button
                  variant="secondary"
                  onClick={() => removeSpacing('top')}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  ↑ 윗 공백 제거
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => removeSpacing('bottom')}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  ↓ 아래 공백 제거
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => removeSpacing('left')}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  ← 왼쪽 공백 제거
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => removeSpacing('right')}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  → 오른쪽 공백 제거
                </Button>
                <Button
                  variant="primary"
                  onClick={() => removeSpacing('auto')}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  ✨ 자동으로 불필요한 공간 제거
                </Button>
              </div>
            </>
          )}
          <div style={{ borderLeft: '1px solid #C0C0C0', height: '24px', margin: '0 4px' }} />
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant="secondary"
              onClick={downloadHtml}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              💾 HTML 다운로드
            </Button>
          </div>
        </div>

        {mode === 'component' && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#696969', marginRight: '4px' }}>
              {selectedElements.length}개 선택됨
            </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!iframeRef.current) return;
                    const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
                    if (iframeDoc) {
                      selectedElements.forEach(el => {
                        el.classList.remove('component-selected');
                        el.style.outline = '';
                        el.style.boxShadow = '';
                        el.style.backgroundColor = '';
                        el.style.outlineOffset = '';
                      });
                    }
                    setSelectedElements([]);
                  }}
                  disabled={selectedElements.length === 0}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  title="전체 선택 취소"
                >
                  선택 취소
                </Button>
                <Button
                  variant="primary"
                  onClick={handleDelete}
                  disabled={selectedElements.length === 0}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  title={`${selectedElements.length}개 요소 삭제`}
                >
                  삭제
                </Button>
          </div>
        )}
        {mode === 'spacing' && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#696969', marginRight: '4px' }}>
              {selectedElements.length}개 선택됨
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                if (!iframeRef.current) return;
                const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
                if (iframeDoc) {
                  selectedElements.forEach(el => {
                    el.classList.remove('component-selected');
                    el.style.outline = '';
                    el.style.boxShadow = '';
                    el.style.backgroundColor = '';
                    el.style.outlineOffset = '';
                  });
                }
                setSelectedElements([]);
              }}
              disabled={selectedElements.length === 0}
              style={{ fontSize: '12px', padding: '4px 8px' }}
              title="전체 선택 취소"
            >
              선택 취소
            </Button>
            <Button
              variant="primary"
              onClick={handleDelete}
              disabled={selectedElements.length === 0}
              style={{ fontSize: '12px', padding: '4px 8px' }}
              title={`${selectedElements.length}개 요소 삭제`}
            >
              삭제
            </Button>
          </div>
        )}
        {mode === 'spacing-all' && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#696969', marginRight: '4px' }}>
              Step 2에서 선택한 영역 전체
            </span>
          </div>
        )}
      </div>

      {/* 에디터 영역 */}
      <div
        style={{
          flex: 1,
          border: '1px solid #C0C0C0',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
        }}
      >
        <iframe
          ref={iframeRef}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Pre-edit HTML"
        />
      </div>
    </div>
  );
};

// STEP 6: 문서 생성
const Step6CreateDocument = React.forwardRef<
  { handleDraftSave: () => void; handlePublish: () => void },
  {
    draft: TranslationDraft;
    onCreateDocument: (data: { title: string; categoryId?: number; estimatedLength?: number; status: string }) => void;
    onSaveDraft?: (data: { title: string; categoryId?: number; estimatedLength?: number }) => void;
    step6Data?: { title?: string; categoryId?: number; estimatedLength?: number };
    isCreating: boolean;
  }
>(({ draft, onCreateDocument, onSaveDraft, step6Data, isCreating }, ref) => {
  const [title, setTitle] = useState(step6Data?.title || '');
  const [categoryId, setCategoryId] = useState<string>(step6Data?.categoryId?.toString() || '');
  const [estimatedLength, setEstimatedLength] = useState<number>(step6Data?.estimatedLength || 0);
  const [titleError, setTitleError] = useState<string>('');
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // step6Data가 있으면 복원 (임시저장에서 불러올 때)
  useEffect(() => {
    if (step6Data) {
      if (step6Data.title) setTitle(step6Data.title);
      if (step6Data.categoryId) setCategoryId(step6Data.categoryId.toString());
      if (step6Data.estimatedLength) setEstimatedLength(step6Data.estimatedLength);
    }
  }, [step6Data]);

  // 문서 제목 자동 파싱 및 번역
  useEffect(() => {
    if (draft.originalHtml && !title && !step6Data?.title && draft.targetLang) {
      const parseAndTranslateTitle = async () => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(draft.originalHtml, 'text/html');
          
          // title 태그 또는 h1 태그에서 제목 추출
          const titleTag = doc.querySelector('title');
          const h1Tag = doc.querySelector('h1');
          
          let extractedTitle = '';
          if (titleTag && titleTag.textContent) {
            extractedTitle = titleTag.textContent.trim();
          } else if (h1Tag && h1Tag.textContent) {
            extractedTitle = h1Tag.textContent.trim();
          } else if (draft.url) {
            // URL에서 제목 추출 (마지막 fallback)
            const urlParts = draft.url.split('/').filter(Boolean);
            extractedTitle = urlParts[urlParts.length - 1] || '번역 문서';
          }
          
          // 제목이 없으면 기본값
          if (!extractedTitle) {
            setTitle('번역 문서');
            return;
          }
          
          // 너무 긴 제목은 잘라내기 (번역 전)
          if (extractedTitle.length > 100) {
            extractedTitle = extractedTitle.substring(0, 100) + '...';
          }
          
          // 목표 번역 언어로 번역
          if (draft.targetLang && draft.targetLang !== 'ko' && extractedTitle) {
            try {
              // 제목을 간단한 HTML로 감싸서 번역 API 사용
              const htmlToTranslate = `<p>${extractedTitle}</p>`;
              const translatedResponse = await translationApi.translateHtml({
                html: htmlToTranslate,
                targetLang: draft.targetLang,
                sourceLang: draft.sourceLang || 'auto',
              });
              
              if (translatedResponse.translatedHtml) {
                const translatedDoc = parser.parseFromString(translatedResponse.translatedHtml, 'text/html');
                const translatedText = translatedDoc.querySelector('p')?.textContent?.trim() || extractedTitle;
                setTitle(translatedText);
                console.log('✅ 자동 추출 및 번역된 제목:', translatedText, '(원문:', extractedTitle, ')');
              } else {
                setTitle(extractedTitle);
                console.log('✅ 자동 추출된 제목 (번역 실패):', extractedTitle);
              }
            } catch (translateError) {
              console.warn('제목 번역 실패:', translateError);
              setTitle(extractedTitle);
              console.log('✅ 자동 추출된 제목 (번역 오류):', extractedTitle);
            }
          } else {
            // 번역할 필요 없으면 그대로 사용
            setTitle(extractedTitle);
            console.log('✅ 자동 추출된 제목:', extractedTitle);
          }
        } catch (error) {
          console.warn('제목 파싱 실패:', error);
          setTitle('번역 문서');
        }
      };
      
      parseAndTranslateTitle();
    }
  }, [draft.originalHtml, draft.url, draft.targetLang, draft.sourceLang]);

  // 예상 분량 자동 계산 (Version 1의 body 글자 수)
  useEffect(() => {
    if (draft.translatedHtml) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(draft.translatedHtml, 'text/html');
        const body = doc.body;
        
        // body의 텍스트만 추출 (공백 제거)
        const textContent = body.textContent || body.innerText || '';
        const length = textContent.replace(/\s+/g, '').length;
        setEstimatedLength(length);
        console.log('✅ 예상 분량 계산 완료:', length, '자');
      } catch (error) {
        console.warn('분량 계산 실패:', error);
        setEstimatedLength(0);
      }
    }
  }, [draft.translatedHtml]);

  // 카테고리 목록 로드
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true);
        const { categoryApi } = await import('../services/categoryApi');
        const categoryList = await categoryApi.getAllCategories();
        setCategories(categoryList.map(cat => ({ id: cat.id, name: cat.name })));
        console.log('✅ 카테고리 목록 로드 완료:', categoryList.length, '개');
      } catch (error) {
        console.error('카테고리 목록 로드 실패:', error);
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    
    loadCategories();
  }, []);

  // 외부에서 호출 가능한 함수들 (하단 버튼용)
  React.useImperativeHandle(ref, () => ({
    handleDraftSave: () => {
      if (!title.trim()) {
        setTitleError('문서 제목을 입력해주세요.');
        return;
      }
      setTitleError('');
      onCreateDocument({
        title: title.trim(),
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        estimatedLength: estimatedLength > 0 ? estimatedLength : undefined,
        status: 'DRAFT',
      });
    },
    handlePublish: () => {
      if (!title.trim()) {
        setTitleError('문서 제목을 입력해주세요.');
        return;
      }
      setTitleError('');
      onCreateDocument({
        title: title.trim(),
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        estimatedLength: estimatedLength > 0 ? estimatedLength : undefined,
        status: 'PENDING_TRANSLATION',
      });
    },
  }));

  return (
    <div
      data-step6
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '32px',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          width: '100%',
          padding: '32px',
          border: '1px solid #C0C0C0',
          borderRadius: '8px',
          backgroundColor: '#FFFFFF',
        }}
      >
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#000000',
            fontFamily: 'system-ui, Pretendard, sans-serif',
            marginBottom: '24px',
          }}
        >
          문서 정보 입력
        </h3>

        {/* 문서 제목 */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            문서 제목 <span style={{ color: '#FF0000' }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="번역 문서의 제목을 입력하세요"
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid #C0C0C0',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontFamily: 'system-ui, Pretendard, sans-serif',
            }}
            disabled={isCreating}
          />
          {titleError && (
            <span style={{ fontSize: '12px', color: '#FF0000', marginTop: '4px', display: 'block' }}>
              {titleError}
            </span>
          )}
        </div>

        {/* 원본 URL */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            원본 URL
          </label>
          <input
            type="text"
            value={draft.url}
            readOnly
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid #C0C0C0',
              borderRadius: '4px',
              backgroundColor: '#F8F9FA',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              color: '#696969',
            }}
          />
        </div>

        {/* 언어 정보 */}
        <div style={{ marginBottom: '24px', display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#000000',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              원문 언어
            </label>
            <input
              type="text"
              value={draft.sourceLang || 'auto'}
              readOnly
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '13px',
                border: '1px solid #C0C0C0',
                borderRadius: '4px',
                backgroundColor: '#F8F9FA',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                color: '#696969',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#000000',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              번역 언어
            </label>
            <input
              type="text"
              value={draft.targetLang || 'ko'}
              readOnly
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '13px',
                border: '1px solid #C0C0C0',
                borderRadius: '4px',
                backgroundColor: '#F8F9FA',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                color: '#696969',
              }}
            />
          </div>
        </div>

        {/* 카테고리 */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            카테고리 (선택)
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid #C0C0C0',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              cursor: 'pointer',
            }}
            disabled={isCreating || categoriesLoading}
          >
            <option value="">카테고리 선택 안 함</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id.toString()}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* 예상 분량 */}
        <div style={{ marginBottom: '32px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            예상 분량 (자동 계산)
          </label>
          <input
            type="number"
            value={estimatedLength}
            onChange={(e) => setEstimatedLength(parseInt(e.target.value) || 0)}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid #C0C0C0',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontFamily: 'system-ui, Pretendard, sans-serif',
            }}
            disabled={isCreating}
          />
          <span style={{ fontSize: '12px', color: '#696969', marginTop: '4px', display: 'block' }}>
            총 글자 수: {estimatedLength.toLocaleString()}자 (공백 제외)
          </span>
        </div>

        {/* 버튼 영역 - 카드 하단 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '12px',
          marginTop: '32px',
          paddingTop: '24px',
          borderTop: '1px solid #E0E0E0',
        }}>
          <Button
            variant="secondary"
            onClick={() => {
              if (!title.trim()) {
                setTitleError('문서 제목을 입력해주세요.');
                return;
              }
              setTitleError('');
              if (onSaveDraft) {
                // Step 6에서 임시저장 (버전 생성하지 않음)
                onSaveDraft({
                  title: title.trim(),
                  categoryId: categoryId ? parseInt(categoryId) : undefined,
                  estimatedLength: estimatedLength > 0 ? estimatedLength : undefined,
                });
              } else {
                // 하위 호환성: 기존 방식
                onCreateDocument({
                  title: title.trim(),
                  categoryId: categoryId ? parseInt(categoryId) : undefined,
                  estimatedLength: estimatedLength > 0 ? estimatedLength : undefined,
                  status: 'DRAFT',
                });
              }
            }}
            disabled={isCreating || !title.trim()}
            style={{ padding: '10px 20px' }}
          >
            {isCreating ? '저장 중...' : '임시 저장 (Draft)'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!title.trim()) {
                setTitleError('문서 제목을 입력해주세요.');
                return;
              }
              setTitleError('');
              onCreateDocument({
                title: title.trim(),
                categoryId: categoryId ? parseInt(categoryId) : undefined,
                estimatedLength: estimatedLength > 0 ? estimatedLength : undefined,
                status: 'PENDING_TRANSLATION',
              });
            }}
            disabled={isCreating || !title.trim()}
            style={{ padding: '10px 20px' }}
          >
            {isCreating ? '생성 중...' : '문서 생성 및 공개'}
          </Button>
        </div>

        {isCreating && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#F8F9FA',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#696969',
              textAlign: 'center',
            }}
          >
            문서를 생성하고 있습니다...
          </div>
        )}
      </div>
    </div>
  );
});

// STEP 4: 번역 실행
const Step4Translation: React.FC<{
  onConfirm: (sourceLang: string, targetLang: string) => void;
  onCancel: () => void;
  isTranslating: boolean;
  translatingProgress?: number;
}> = ({ onConfirm, onCancel, isTranslating, translatingProgress = 0 }) => {
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('ko');

  const languages = [
    { code: 'auto', name: '자동 감지', deepl: '' },
    { code: 'ko', name: '한국어', deepl: 'KO' },
    { code: 'en', name: 'English', deepl: 'EN' },
    { code: 'ja', name: '日本語', deepl: 'JA' },
    { code: 'zh', name: '中文', deepl: 'ZH' },
    { code: 'es', name: 'Español', deepl: 'ES' },
    { code: 'fr', name: 'Français', deepl: 'FR' },
    { code: 'de', name: 'Deutsch', deepl: 'DE' },
    { code: 'it', name: 'Italiano', deepl: 'IT' },
    { code: 'pt', name: 'Português', deepl: 'PT' },
  ];

  const getDeepLLangCode = (code: string) => {
    if (code === 'auto') return '';
    const lang = languages.find(l => l.code === code);
    return lang?.deepl || code.toUpperCase();
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '32px',
          border: '1px solid #C0C0C0',
          borderRadius: '8px',
          backgroundColor: '#FFFFFF',
          maxWidth: '500px',
          width: '100%',
        }}
      >
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#000000',
            fontFamily: 'system-ui, Pretendard, sans-serif',
            marginBottom: '24px',
          }}
        >
          번역 실행
        </h3>

        {/* 언어 선택 */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            원문 언어
          </label>
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '13px',
              border: '1px solid #C0C0C0',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              cursor: 'pointer',
            }}
            disabled={isTranslating}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#000000',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            번역 언어
          </label>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '13px',
              border: '1px solid #C0C0C0',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              cursor: 'pointer',
            }}
            disabled={isTranslating}
          >
            {languages.filter(l => l.code !== 'auto').map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <p
          style={{
            fontSize: '13px',
            color: '#696969',
            fontFamily: 'system-ui, Pretendard, sans-serif',
            marginBottom: '24px',
          }}
        >
          선택한 영역을 {languages.find(l => l.code === targetLang)?.name}로 번역하시겠습니까?
        </p>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onCancel} disabled={isTranslating}>
            취소
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button
              variant="primary"
              onClick={() => onConfirm(
                sourceLang === 'auto' ? '' : getDeepLLangCode(sourceLang), 
                getDeepLLangCode(targetLang)
              )} 
              disabled={isTranslating}
            >
              {isTranslating ? '번역 중...' : '번역 실행'}
            </Button>
            {isTranslating && translatingProgress > 0 && (
              <span style={{ fontSize: '13px', color: '#696969', fontWeight: 600 }}>
                {Math.round(translatingProgress)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// STEP 5: 원문/편집본 병렬 편집 (NewTranslation 전용)
const Step5ParallelEdit: React.FC<{
  crawledHtml: string; // STEP 1에서 크롤링한 전체 원문
  selectedHtml: string; // STEP 2/3에서 선택한 영역
  translatedHtml: string;
  onTranslatedChange: (html: string) => void;
  collapsedPanels: Set<string>;
  onTogglePanel: (panelId: string) => void;
}> = ({ crawledHtml, selectedHtml, translatedHtml, onTranslatedChange, collapsedPanels, onTogglePanel }) => {
  const [mode, setMode] = useState<EditorMode>('text');
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);
  const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]);
  
  // 링크 편집 모달 상태
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<HTMLAnchorElement | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  
  // 더보기 메뉴 상태
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  const crawledIframeRef = React.useRef<HTMLIFrameElement>(null);
  const selectedIframeRef = React.useRef<HTMLIFrameElement>(null);
  const translatedIframeRef = React.useRef<HTMLIFrameElement>(null);
  const [isTranslatedInitialized, setIsTranslatedInitialized] = useState(false);
  const crawledLoadedRef = React.useRef(false);
  const selectedLoadedRef = React.useRef(false);
  
  // 컴포넌트 편집용 Undo/Redo Stack (STEP 5)
  const undoStackRef = React.useRef<string[]>([]);
  const redoStackRef = React.useRef<string[]>([]);
  const currentHtmlRef = React.useRef<string>('');
  // 컴포넌트 클릭 핸들러 저장 (제거를 위해)
  const componentClickHandlersRef = React.useRef<Map<HTMLElement, (e: Event) => void>>(new Map());
  // 링크 클릭 방지 핸들러 저장 (제거를 위해)
  const linkClickHandlersRef = React.useRef<Map<HTMLElement, (e: Event) => void>>(new Map());
  // window 키보드 이벤트 리스너 저장 (cleanup에서 제거하기 위해)
  const windowKeydownHandlerRef = React.useRef<((e: KeyboardEvent) => void) | null>(null);
  const iframeKeydownHandlerRef = React.useRef<((e: KeyboardEvent) => void) | null>(null);

  // 패널 접기/펼치기 (props로 받은 함수 사용)
  const togglePanel = onTogglePanel;

  // 전체화면 토글
  const toggleFullscreen = (panelId: string) => {
    setFullscreenPanel(prev => prev === panelId ? null : panelId);
  };

  // 크롤링된 원문 iframe 렌더링 (읽기 전용)
  useEffect(() => {
    const iframe = crawledIframeRef.current;
    if (!iframe || !crawledHtml) return;
    
    console.log('🌐 크롤링 원본 iframe 렌더링 시작');
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(crawledHtml);
        iframeDoc.close();
        crawledLoadedRef.current = true;
        console.log('✅ 크롤링 원본 iframe 렌더링 완료');
      } catch (error) {
        console.warn('crawled iframe write error (ignored):', error);
      }
    }
  }, [crawledHtml, collapsedPanels, fullscreenPanel]);

  // 선택한 영역 iframe 렌더링 (읽기 전용)
  useEffect(() => {
    const iframe = selectedIframeRef.current;
    if (!iframe || !selectedHtml) return;
    
    console.log('📦 선택한 영역 iframe 렌더링 시작');
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(selectedHtml);
        iframeDoc.close();
        selectedLoadedRef.current = true;
        console.log('✅ 선택한 영역 iframe 렌더링 완료');
      } catch (error) {
        console.warn('selected iframe write error (ignored):', error);
      }
    }
  }, [selectedHtml, collapsedPanels, fullscreenPanel]);

  // 편집본 iframe 초기 렌더링 (NewTranslation 전용) - 한 번만 실행
  useEffect(() => {
    if (isTranslatedInitialized) return; // 이미 초기화되었으면 스킵
    
    const iframe = translatedIframeRef.current;
    if (!iframe || !translatedHtml) return;

    console.log('📝 [NewTranslation Step5] 편집본 iframe 초기 렌더링 시작');
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(translatedHtml);
        iframeDoc.close();
        console.log('✅ [NewTranslation Step5] 편집본 iframe 초기 렌더링 완료');
      } catch (error) {
        console.warn('translated iframe write error (ignored):', error);
      }

      // 에러 전파 방지
      if (iframe.contentWindow) {
        iframe.contentWindow.addEventListener('error', (e) => {
          e.stopPropagation();
          e.preventDefault();
        }, true);
      }

        // 초기 HTML을 currentHtmlRef에 저장
        currentHtmlRef.current = translatedHtml;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setIsTranslatedInitialized(true);
      }
  }); // ⭐ Step 3 방식: 의존성 배열 제거하여 translatedHtml 변경 시 트리거되지 않도록 함

  // 편집본 편집 모드 처리 (NewTranslation 전용)
  useEffect(() => {
    if (!isTranslatedInitialized || !translatedIframeRef.current) return;

    const iframe = translatedIframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    console.log('🎨 [NewTranslation Step5] 편집본 편집 모드:', mode);

    // 기존 스타일 제거
    const existingStyle = iframeDoc.querySelector('#editor-styles');
    if (existingStyle) existingStyle.remove();

    // ⚠️ DOM 노드 복제-교체는 하지 않음 (포커스/입력 흐름 유지)
    // Step 3처럼 스타일과 contentEditable만 변경

    if (mode === 'text') {
      // 텍스트 편집 모드
      console.log('📝 [NewTranslation Step5] 텍스트 편집 모드 활성화');

      // ⭐ 컴포넌트 클릭 핸들러 제거
      componentClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      componentClickHandlersRef.current.clear();

      // ⭐ 모든 요소의 검은색 테두리 제거 (computed style 기반)
      const allElements = iframeDoc.querySelectorAll('*');
      allElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(htmlEl);
        if (computedStyle) {
          const outline = computedStyle.outline;
          const outlineColor = computedStyle.outlineColor;
          if (outline && outline !== 'none' && (
            outlineColor === 'rgb(0, 0, 0)' || 
            outlineColor === '#000000' || 
            outlineColor === 'black' ||
            outline.includes('3px solid') ||
            outline.includes('black')
          )) {
            htmlEl.style.outline = '';
            htmlEl.style.outlineOffset = '';
          }
        }
        if (htmlEl.style.outline && (
          htmlEl.style.outline.includes('3px solid') ||
          htmlEl.style.outline.includes('black') ||
          htmlEl.style.outline.includes('#000')
        )) {
          htmlEl.style.outline = '';
          htmlEl.style.outlineOffset = '';
        }
      });

      // ⭐ 컴포넌트 편집 모드 CSS 규칙 제거 또는 오버라이드
      const editorStyles = iframeDoc.getElementById('editor-styles');
      if (editorStyles) {
        editorStyles.remove();
      }

      // ⭐ 컴포넌트 선택 스타일을 완전히 무효화하는 CSS 추가
      const textEditOverrideStyle = iframeDoc.createElement('style');
      textEditOverrideStyle.id = 'text-edit-override-styles';
      textEditOverrideStyle.textContent = `
        .component-selected,
        [data-component-editable] {
          outline: none !important;
          box-shadow: none !important;
          background-color: transparent !important;
          outline-offset: 0 !important;
        }
        * {
          outline: none !important;
        }
        *:focus {
          outline: none !important;
        }
      `;
      const existingOverride = iframeDoc.getElementById('text-edit-override-styles');
      if (existingOverride) {
        existingOverride.remove();
      }
      iframeDoc.head.appendChild(textEditOverrideStyle);

      // ⭐ contentEditable 설정 (cross-element selection을 위해)
      if (iframeDoc.body) {
        const style = iframeDoc.createElement('style');
        style.id = 'text-edit-styles';
        style.textContent = `
          body, body * {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
            cursor: text !important;
          }
        `;
        const existingStyle = iframeDoc.getElementById('text-edit-styles');
        if (existingStyle) {
          existingStyle.remove();
        }
        iframeDoc.head.appendChild(style);
        
        iframeDoc.body.contentEditable = 'true';
        iframeDoc.body.style.cursor = 'text';
        
        const textElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, td, th, label, button, div, section, article');
      textElements.forEach(el => {
          const htmlEl = el as HTMLElement;
          if (!['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(htmlEl.tagName)) {
            htmlEl.contentEditable = 'true';
            htmlEl.style.cursor = 'text';
            htmlEl.style.outline = 'none';
          }
        });
        
        // ⭐ currentHtmlRef 초기화 (텍스트 편집 모드)
        const initialHtml = iframeDoc.documentElement.outerHTML;
        currentHtmlRef.current = initialHtml;
        console.log('💾 Step 5 텍스트 편집 모드 currentHtmlRef 초기화 완료');
      }

      // ⭐ 링크 클릭 방지 (다른 사이트로 이동 방지)
      // 기존 링크 클릭 핸들러 제거
      linkClickHandlersRef.current.forEach((handler, link) => {
        link.removeEventListener('click', handler, true);
      });
      linkClickHandlersRef.current.clear();
      
      // 모든 링크에 클릭 방지 핸들러 추가
      const allLinks = iframeDoc.querySelectorAll('a');
      const preventLinkNavigation = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      };
      
      allLinks.forEach(link => {
        const htmlLink = link as HTMLElement;
        htmlLink.addEventListener('click', preventLinkNavigation, true);
        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
        // 링크 스타일 변경 (편집 모드임을 표시)
        htmlLink.style.cursor = 'text';
        htmlLink.style.textDecoration = 'none';
      });
      
      // 링크 스타일 CSS 추가
      const linkStyle = iframeDoc.createElement('style');
      linkStyle.id = 'text-edit-link-style';
      linkStyle.textContent = `
        a {
          cursor: text !important;
          pointer-events: auto !important;
        }
        a:hover {
          text-decoration: underline !important;
        }
      `;
      const existingLinkStyle = iframeDoc.getElementById('text-edit-link-style');
      if (existingLinkStyle) {
        existingLinkStyle.remove();
      }
      iframeDoc.head.appendChild(linkStyle);

      // ⭐ Step 3와 동일한 방식으로 키보드 이벤트 처리
      const handleKeyDown = (e: KeyboardEvent) => {
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('undo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          currentHtmlRef.current = updatedHtml;
          onTranslatedChange(updatedHtml);
          console.log('↩️ Undo (STEP 5 텍스트 편집)');
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('redo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          currentHtmlRef.current = updatedHtml;
          onTranslatedChange(updatedHtml);
          console.log('↪️ Redo (STEP 5 텍스트 편집)');
        }
        
        // ⭐ 백스페이스 키 처리 (브라우저 기본 동작 허용) - Step 3와 동일
        if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // 브라우저가 알아서 처리하게 놔둠
          console.log('⌫ 백스페이스 (STEP 5 텍스트 편집)');
        }
      };
      
      // 기존 리스너 제거
      if (iframeKeydownHandlerRef.current && iframeDoc) {
        iframeDoc.removeEventListener('keydown', iframeKeydownHandlerRef.current, true);
      }
      // 새 리스너 등록 및 저장
      iframeKeydownHandlerRef.current = handleKeyDown;
      iframeDoc.addEventListener('keydown', handleKeyDown, true);
      console.log('✅ Step 5 텍스트 모드 키보드 단축키 등록 완료');
      
      // ⚡ 최적화: input 이벤트 디바운스 (메모리 사용 감소)
      let inputTimeoutId: NodeJS.Timeout | null = null;
      const handleInput = () => {
        // 기존 타이머 취소
        if (inputTimeoutId) {
          clearTimeout(inputTimeoutId);
        }
        
        // 500ms 후에 HTML 추출 (디바운스)
        inputTimeoutId = setTimeout(() => {
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          onTranslatedChange(updatedHtml);
          inputTimeoutId = null;
        }, 500);
      };
      iframeDoc.body.addEventListener('input', handleInput);

    } else if (mode === 'component') {
      // 컴포넌트 편집 모드
      console.log('🧩 [NewTranslation Step5] 컴포넌트 편집 모드 활성화');

      // ⭐ 1. 브라우저의 텍스트 selection clear
      const selection = iframeDoc.defaultView?.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      
      // ⭐ 2. selectedElements state 초기화
      setSelectedElements([]);
      
      // ⭐ 3. 모든 .component-selected 클래스 제거 및 기존 핸들러 제거
      const existingSelected = iframeDoc.querySelectorAll('.component-selected');
      existingSelected.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.classList.remove('component-selected');
        htmlEl.style.outline = '';
        htmlEl.style.boxShadow = '';
        htmlEl.style.backgroundColor = '';
        htmlEl.style.outlineOffset = '';
        
        // 기존 핸들러 제거
        const handler = componentClickHandlersRef.current.get(htmlEl);
        if (handler) {
          htmlEl.removeEventListener('click', handler, true);
          componentClickHandlersRef.current.delete(htmlEl);
        }
      });
      
      // 모든 컴포넌트 클릭 핸들러 제거
      componentClickHandlersRef.current.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
      componentClickHandlersRef.current.clear();

      // ⭐ 4. 텍스트 편집 모드 스타일 태그 제거
      const textEditOverrideStyle = iframeDoc.getElementById('text-edit-override-styles');
      if (textEditOverrideStyle) {
        textEditOverrideStyle.remove();
      }
      const textEditStyle = iframeDoc.getElementById('text-edit-styles');
      if (textEditStyle) {
        textEditStyle.remove();
      }
      
      // ⭐ 5. 링크 클릭 핸들러 제거
      linkClickHandlersRef.current.forEach((handler, link) => {
        link.removeEventListener('click', handler, true);
      });
      linkClickHandlersRef.current.clear();
      
      // 링크 스타일 태그 제거
      const linkStyle = iframeDoc.getElementById('text-edit-link-style');
      if (linkStyle) {
        linkStyle.remove();
      }

      // contentEditable 비활성화
      const allEditableElements = iframeDoc.querySelectorAll('[contenteditable]');
      allEditableElements.forEach(el => {
        (el as HTMLElement).contentEditable = 'false';
      });

      // 스타일 추가
      const style = iframeDoc.createElement('style');
      style.id = 'editor-styles';
      style.textContent = `
        div[data-component-editable],
        section[data-component-editable],
        article[data-component-editable],
        header[data-component-editable],
        footer[data-component-editable],
        main[data-component-editable],
        aside[data-component-editable],
        nav[data-component-editable],
        p[data-component-editable],
        h1[data-component-editable],
        h2[data-component-editable],
        h3[data-component-editable],
        h4[data-component-editable],
        h5[data-component-editable],
        h6[data-component-editable],
        a[data-component-editable] {
          outline: 1px dashed #C0C0C0 !important;
          cursor: pointer !important;
        }
        div[data-component-editable]:hover,
        section[data-component-editable]:hover,
        article[data-component-editable]:hover,
        p[data-component-editable]:hover,
        h1[data-component-editable]:hover,
        h2[data-component-editable]:hover,
        h3[data-component-editable]:hover,
        a[data-component-editable]:hover {
          outline: 2px solid #808080 !important;
        }
        .component-selected {
          outline: 4px solid #28a745 !important;
          outline-offset: 3px !important;
          background-color: rgba(40, 167, 69, 0.25) !important;
          box-shadow: 0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5) !important;
          position: relative !important;
          transition: all 0.2s ease !important;
        }
        .component-selected::after {
          content: '✓ 선택됨';
          position: fixed;
          top: 10px;
          right: 10px;
          background: linear-gradient(135deg, #28a745, #20c997);
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(40, 167, 69, 0.5);
          z-index: 999999;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      iframeDoc.head.appendChild(style);

      // 클릭 가능한 컴포넌트 표시 (a 태그도 포함)
      const componentElements = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6, a');

      // Cmd+Z / Cmd+Y 지원 (컴포넌트 편집 모드) - 커스텀 Undo Stack 사용
      const handleKeydown = (e: KeyboardEvent) => {
        console.log('🔑 Step 5 iframe 키 감지:', e.key, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'shift:', e.shiftKey);
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault(); // ⭐ 항상 preventDefault 호출 (undo stack이 비어있어도 시스템 단축키 방지)
          e.stopImmediatePropagation();
          
          if (undoStackRef.current.length > 0) {
            console.log('↩️ Undo (컴포넌트 편집) - stack:', undoStackRef.current.length);
            
            // 현재 상태를 redo stack에 저장
            redoStackRef.current.push(currentHtmlRef.current);
            
            // undo stack에서 이전 상태 복원
            const previousHtml = undoStackRef.current.pop()!;
            currentHtmlRef.current = previousHtml;
            
            // iframe에 HTML 복원
            iframeDoc.open();
            iframeDoc.write(previousHtml);
            iframeDoc.close();
            
            onTranslatedChange(previousHtml);
            setSelectedElements([]);
            
            // ⭐ translatedHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
            // iframe에 포커스를 주어 키보드 이벤트가 계속 작동하도록 함
            setTimeout(() => {
              const newIframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (newIframeDoc?.body) {
                newIframeDoc.body.setAttribute('tabindex', '-1');
                newIframeDoc.body.focus();
              }
            }, 50);
          } else {
            console.log('⚠️ Undo stack이 비어있습니다 (STEP 5)');
            // ⭐ undo stack이 비어있어도 preventDefault는 이미 호출됨 (시스템 단축키 방지)
          }
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault(); // ⭐ 항상 preventDefault 호출 (redo stack이 비어있어도 시스템 단축키 방지)
          e.stopImmediatePropagation();
          
          if (redoStackRef.current.length > 0) {
            console.log('↪️ Redo (컴포넌트 편집 STEP 5) - stack:', redoStackRef.current.length);
            
            // 현재 상태를 undo stack에 저장
            undoStackRef.current.push(currentHtmlRef.current);
            
            // redo stack에서 다음 상태 복원
            const nextHtml = redoStackRef.current.pop()!;
            currentHtmlRef.current = nextHtml;
            
            // iframe에 HTML 복원
            iframeDoc.open();
            iframeDoc.write(nextHtml);
            iframeDoc.close();
            
            onTranslatedChange(nextHtml);
            setSelectedElements([]);
            
            // ⭐ translatedHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
            // iframe에 포커스를 주어 키보드 이벤트가 계속 작동하도록 함
            setTimeout(() => {
              const newIframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (newIframeDoc?.body) {
                newIframeDoc.body.setAttribute('tabindex', '-1');
                newIframeDoc.body.focus();
              }
            }, 50);
          } else {
            console.log('⚠️ Redo stack이 비어있습니다');
            // ⭐ redo stack이 비어있어도 preventDefault는 이미 호출됨 (시스템 단축키 방지)
          }
        }
      };
      
      // 기존 iframe 리스너 제거
      if (iframeKeydownHandlerRef.current && iframeDoc) {
        iframeDoc.removeEventListener('keydown', iframeKeydownHandlerRef.current, true);
      }
      // 새 iframe 리스너 등록 및 저장
      iframeKeydownHandlerRef.current = handleKeydown;
      iframeDoc.addEventListener('keydown', handleKeydown, true);
      console.log('✅ Step 5 컴포넌트 모드 키보드 단축키 등록 완료 (iframe)');
      
      // 부모 window에서도 이벤트 잡기 (iframe 포커스가 없을 때 대비)
      const handleWindowKeydown = (e: KeyboardEvent) => {
        console.log('🔑 Step 5 window 키 감지:', e.key, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'shift:', e.shiftKey);
        
        // Ctrl+Z (되돌리기)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          
          if (undoStackRef.current.length > 0 && iframeDoc) {
            console.log('↩️ Undo (Step 5 컴포넌트 편집 - window)');
            
            redoStackRef.current.push(currentHtmlRef.current);
            const previousHtml = undoStackRef.current.pop()!;
            currentHtmlRef.current = previousHtml;
            
            iframeDoc.open();
            iframeDoc.write(previousHtml);
            iframeDoc.close();
            
            onTranslatedChange(previousHtml);
            setSelectedElements([]);
            
            // ⭐ translatedHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
            // iframe에 포커스를 주어 키보드 이벤트가 계속 작동하도록 함
            setTimeout(() => {
              const newIframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (newIframeDoc?.body) {
                newIframeDoc.body.setAttribute('tabindex', '-1');
                newIframeDoc.body.focus();
              }
            }, 50);
          }
        }
        // Ctrl+Shift+Z 또는 Ctrl+Y (다시 실행)
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          
          if (redoStackRef.current.length > 0 && iframeDoc) {
            console.log('↪️ Redo (Step 5 컴포넌트 편집 - window)');
            
            undoStackRef.current.push(currentHtmlRef.current);
            const nextHtml = redoStackRef.current.pop()!;
            currentHtmlRef.current = nextHtml;
            
            iframeDoc.open();
            iframeDoc.write(nextHtml);
            iframeDoc.close();
            
            onTranslatedChange(nextHtml);
            setSelectedElements([]);
            
            // ⭐ translatedHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
            // iframe에 포커스를 주어 키보드 이벤트가 계속 작동하도록 함
            setTimeout(() => {
              const newIframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (newIframeDoc?.body) {
                newIframeDoc.body.setAttribute('tabindex', '-1');
                newIframeDoc.body.focus();
              }
            }, 50);
          }
        }
      };
      
      // 기존 window 리스너 제거
      if (windowKeydownHandlerRef.current) {
        window.removeEventListener('keydown', windowKeydownHandlerRef.current, true);
      }
      // 새 window 리스너 등록 및 저장
      windowKeydownHandlerRef.current = handleWindowKeydown;
      window.addEventListener('keydown', handleWindowKeydown, true);
      console.log('✅ Step 5 window 키보드 이벤트 리스너 등록 완료');

      // 컴포넌트 클릭 핸들러 (다중 선택 + 토글)
      const handleComponentClick = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();

        const target = e.target as HTMLElement;
        if (!target || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(target.tagName)) return;

        // ⭐ 링크 내부 요소를 클릭한 경우 가장 가까운 편집 가능한 요소 찾기
        const editableElement = target.closest('[data-component-editable]') as HTMLElement;
        if (!editableElement) {
          console.log('⚠️ 편집 가능한 요소를 찾을 수 없습니다:', target.tagName);
          return;
        }

        const isSelected = editableElement.classList.contains('component-selected');

        if (isSelected) {
          editableElement.classList.remove('component-selected');
          editableElement.style.outline = '1px dashed #C0C0C0';
          editableElement.style.boxShadow = 'none';
          setSelectedElements(prev => prev.filter(el => el !== editableElement));
        } else {
          editableElement.classList.add('component-selected');
          editableElement.style.outline = '3px solid #000000';
          editableElement.style.boxShadow = 'none';
          setSelectedElements(prev => [...prev, editableElement]);
        }
      };

      // ⭐ Step 3와 동일한 방식으로 이벤트 리스너 등록 (capture phase)
      componentElements.forEach((el) => {
        if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) {
          const htmlEl = el as HTMLElement;
          htmlEl.setAttribute('data-component-editable', 'true');
          htmlEl.style.cursor = 'pointer';
          htmlEl.style.outline = '1px dashed #C0C0C0';
          
          // 기존 핸들러가 있으면 제거
          const existingHandler = componentClickHandlersRef.current.get(htmlEl);
          if (existingHandler) {
            htmlEl.removeEventListener('click', existingHandler, true);
          }
          
          // 클릭 이벤트 리스너 추가 및 저장 (capture phase)
          htmlEl.addEventListener('click', handleComponentClick, true);
          componentClickHandlersRef.current.set(htmlEl, handleComponentClick);
        }
      });
      
      // ⭐ 링크 클릭 방지 (다른 사이트로 이동 방지)
      const allLinks = iframeDoc.querySelectorAll('a');
      const preventLinkNavigation = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      };
      
      allLinks.forEach(link => {
        const htmlLink = link as HTMLElement;
        // 기존 핸들러가 있으면 제거
        const existingLinkHandler = linkClickHandlersRef.current.get(htmlLink);
        if (existingLinkHandler) {
          htmlLink.removeEventListener('click', existingLinkHandler, true);
        }
        htmlLink.addEventListener('click', preventLinkNavigation, true);
        linkClickHandlersRef.current.set(htmlLink, preventLinkNavigation);
        htmlLink.style.cursor = 'pointer';
      });
      
      console.log('✅ Step 5 컴포넌트 클릭 리스너 추가 완료:', componentElements.length, '개');
      console.log('✅ Step 5 링크 클릭 방지 핸들러 추가 완료:', allLinks.length, '개');
      
      console.log('✅ Step 5 컴포넌트 편집 모드 링크 클릭 방지 핸들러 추가 완료:', allLinks.length, '개');
    }

    return () => {
      console.log('🧹 Step 5 cleanup: 이벤트 리스너 제거');
      // window 리스너 제거
      if (windowKeydownHandlerRef.current) {
        window.removeEventListener('keydown', windowKeydownHandlerRef.current, true);
        console.log('✅ Step 5 window 키보드 리스너 제거');
      }
      // iframe 리스너는 모드 전환 시 자동으로 제거됨 (DOM이 재설정되므로)
    };
  }, [mode, isTranslatedInitialized, translatedHtml]); // ⭐ translatedHtml 추가하여 undo/redo 후 자동 재활성화

  // 컴포넌트 삭제
  const handleDelete = () => {
    if (!translatedIframeRef.current) return;

    const iframe = translatedIframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    console.log('🗑️ 선택된 요소 삭제 중:', selectedElements.length, '개');

    // 삭제 전 현재 상태를 undo stack에 저장
    const currentHtml = iframeDoc.documentElement.outerHTML;
    if (currentHtmlRef.current && currentHtmlRef.current !== currentHtml) {
      undoStackRef.current.push(currentHtmlRef.current);
      redoStackRef.current = []; // 새 작업 시 redo stack 초기화
      console.log('💾 Undo stack에 저장 (STEP 5 삭제 전):', undoStackRef.current.length);
    }

    selectedElements.forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });

    const newHtml = iframeDoc.documentElement.outerHTML;
    currentHtmlRef.current = newHtml;
    onTranslatedChange(newHtml);
    setSelectedElements([]);

    console.log('✅ 삭제 완료 (STEP 5)');
    
    // ⭐ 삭제 후 iframe에 포커스를 주어 키보드 단축키가 바로 작동하도록 함
    setTimeout(() => {
      // body에 tabIndex 설정하여 포커스 가능하게 만들기
      if (iframeDoc.body) {
        iframeDoc.body.setAttribute('tabindex', '-1');
        iframeDoc.body.focus();
      }
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
      }
      iframe.focus();
      console.log('🎯 Step 5 iframe에 포커스 설정');
    }, 100);
  };

  // 패널 정의
  const panels = [
    { id: 'crawled', title: '원본 웹사이트', ref: crawledIframeRef, editable: false },
    { id: 'selected', title: 'Version 0', ref: selectedIframeRef, editable: false },
    { id: 'translated', title: 'Version 1 (AI 초벌 번역)', ref: translatedIframeRef, editable: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 3개 패널 */}
      <div style={{ display: 'flex', height: '100%', gap: '4px', padding: '4px' }}>
        {panels.map(panel => {
          const isCollapsed = collapsedPanels.has(panel.id);
          const isFullscreen = fullscreenPanel === panel.id;
          const visiblePanels = panels.filter(p => !collapsedPanels.has(p.id));
          const hasFullscreen = fullscreenPanel !== null;
          const isHidden = hasFullscreen && !isFullscreen;

          if (isHidden) return null; // 전체화면 모드에서 다른 패널 숨김

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
                  position: 'relative', // 오버레이를 위한 relative positioning
                }}
              >
                  {/* 편집본 패널에만 편집 툴바 추가 */}
                  {panel.id === 'translated' && (
                    <>
                      <div
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid #C0C0C0',
                          backgroundColor: '#F8F9FA',
                          display: 'flex',
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Button
                            variant={mode === 'text' ? 'primary' : 'secondary'}
                            onClick={() => setMode('text')}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            텍스트 편집
                          </Button>
                          <Button
                            variant={mode === 'component' ? 'primary' : 'secondary'}
                            onClick={() => setMode('component')}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            컴포넌트 편집
                          </Button>
                          
                          {/* Rich Text 기능 (텍스트 모드일 때만) */}
                          {mode === 'text' && (
                            <>
                              <div style={{ width: '1px', height: '20px', backgroundColor: '#C0C0C0', margin: '0 4px' }} />
                              <button
                            onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('bold', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                }}
                                title="굵게 (Ctrl+B)"
                              >
                                B
                              </button>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('italic', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontStyle: 'italic',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                }}
                                title="기울임 (Ctrl+I)"
                              >
                                I
                              </button>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('underline', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  textDecoration: 'underline',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                }}
                                title="밑줄 (Ctrl+U)"
                              >
                                U
                              </button>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('strikeThrough', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  textDecoration: 'line-through',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                }}
                                title="취소선"
                              >
                                S
                              </button>
                              <div style={{ width: '1px', height: '20px', backgroundColor: '#C0C0C0', margin: '0 4px' }} />
                              <select
                                onChange={(e) => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc && e.target.value) {
                                    const fontSize = e.target.value;
                                    const selection = iframeDoc.getSelection();
                                    
                                    if (selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
                                      const range = selection.getRangeAt(0);
                                      const selectedText = range.toString();
                                      
                                      const spanHtml = `<span style="font-size: ${fontSize}pt;">${selectedText}</span>`;
                                      
                                      try {
                                        iframeDoc.execCommand('insertHTML', false, spanHtml);
                                      } catch (err) {
                                        range.deleteContents();
                                        const tempDiv = iframeDoc.createElement('div');
                                        tempDiv.innerHTML = spanHtml;
                                        const fragment = iframeDoc.createDocumentFragment();
                                        while (tempDiv.firstChild) {
                                          fragment.appendChild(tempDiv.firstChild);
                                        }
                                        range.insertNode(fragment);
                                        
                                        range.setStartAfter(fragment.lastChild || range.startContainer);
                                        range.collapse(false);
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                      }
                                    } else {
                                      iframeDoc.execCommand('fontSize', false, '3');
                                  setTimeout(() => {
                                        const fontSizeElements = iframeDoc.querySelectorAll('font[size="3"]');
                                        if (fontSizeElements.length > 0) {
                                          const lastElement = fontSizeElements[fontSizeElements.length - 1] as HTMLElement;
                                          lastElement.style.fontSize = `${fontSize}pt`;
                                          lastElement.removeAttribute('size');
                                          
                                          const span = iframeDoc.createElement('span');
                                          span.style.fontSize = `${fontSize}pt`;
                                          span.innerHTML = lastElement.innerHTML;
                                          
                                          if (lastElement.parentNode) {
                                            lastElement.parentNode.replaceChild(span, lastElement);
                                          }
                                        }
                                      }, 0);
                                    }
                                    
                                    e.target.value = '';
                                  }
                                }}
                                style={{
                                  fontSize: '11px',
                                  padding: '4px 8px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                }}
                                title="글자 크기 (pt)"
                              >
                                <option value="">크기</option>
                                <option value="8">8pt</option>
                                <option value="9">9pt</option>
                                <option value="10">10pt</option>
                                <option value="11">11pt</option>
                                <option value="12">12pt</option>
                                <option value="14">14pt</option>
                                <option value="16">16pt</option>
                                <option value="18">18pt</option>
                                <option value="20">20pt</option>
                                <option value="24">24pt</option>
                                <option value="28">28pt</option>
                                <option value="32">32pt</option>
                                <option value="36">36pt</option>
                                <option value="48">48pt</option>
                                <option value="72">72pt</option>
                              </select>
                              <select
                                onChange={(e) => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc && e.target.value) {
                                    const lineHeight = e.target.value;
                                    const selection = iframeDoc.getSelection();
                                    
                                    if (selection && selection.rangeCount > 0) {
                                      const range = selection.getRangeAt(0);
                                      
                                      let blockElement: HTMLElement | null = null;
                                      
                                      if (range.commonAncestorContainer.nodeType === 1) {
                                        blockElement = (range.commonAncestorContainer as HTMLElement).closest('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
                                      } else {
                                        blockElement = range.commonAncestorContainer.parentElement?.closest('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre') || null;
                                      }
                                      
                                      if (blockElement) {
                                        try {
                                          const blockRange = iframeDoc.createRange();
                                          blockRange.selectNodeContents(blockElement);
                                          selection.removeAllRanges();
                                          selection.addRange(blockRange);
                                          
                                          const originalHtml = blockElement.innerHTML;
                                          const tagName = blockElement.tagName.toLowerCase();
                                          const newHtml = `<${tagName} style="line-height: ${lineHeight};">${originalHtml}</${tagName}>`;
                                          
                                          iframeDoc.execCommand('insertHTML', false, newHtml);
                                        } catch (err) {
                                          blockElement.style.lineHeight = lineHeight;
                                        }
                                      } else {
                                        const div = iframeDoc.createElement('div');
                                        div.style.lineHeight = lineHeight;
                                        div.innerHTML = '&nbsp;';
                                        
                                        try {
                                          iframeDoc.execCommand('insertHTML', false, div.outerHTML);
                                        } catch (err) {
                                          range.insertNode(div);
                                        }
                                      }
                                    }
                                    
                                    e.target.value = '';
                                  }
                                }}
                                style={{
                                  fontSize: '11px',
                                  padding: '4px 8px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  marginLeft: '4px',
                                }}
                                title="줄간격"
                              >
                                <option value="">줄간격</option>
                                <option value="1.0">1.0 (단일)</option>
                                <option value="1.15">1.15</option>
                                <option value="1.5">1.5 (기본)</option>
                                <option value="1.75">1.75</option>
                                <option value="2.0">2.0 (2배)</option>
                                <option value="2.5">2.5</option>
                                <option value="3.0">3.0</option>
                              </select>
                              <div style={{ position: 'relative', display: 'inline-block', width: '30px', height: '26px' }}>
                                <input
                                  type="color"
                                  onChange={(e) => {
                                    const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                    if (iframeDoc) iframeDoc.execCommand('foreColor', false, e.target.value);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    cursor: 'pointer',
                                    zIndex: 2,
                                  }}
                                  title="글자 색상"
                                />
                                <button
                                  style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    border: '1px solid #A9A9A9',
                                    borderRadius: '3px',
                                    backgroundColor: '#FFFFFF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0,
                                    pointerEvents: 'none',
                                  }}
                                  title="글자 색상"
                                  disabled
                                >
                                  <Palette size={16} color="#000000" />
                                </button>
                              </div>
                              <div style={{ position: 'relative', display: 'inline-block', width: '30px', height: '26px', marginLeft: '4px' }}>
                                <input
                                  type="color"
                                  onChange={(e) => {
                                    const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                    if (iframeDoc) iframeDoc.execCommand('backColor', false, e.target.value);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    cursor: 'pointer',
                                    zIndex: 2,
                                  }}
                                  title="배경 색상"
                                />
                                <button
                                  style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    border: '1px solid #A9A9A9',
                                    borderRadius: '3px',
                                    backgroundColor: '#FFFFFF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0,
                                    pointerEvents: 'none',
                                  }}
                                  title="배경 색상"
                                  disabled
                                >
                                  <Highlighter size={16} color="#000000" />
                                </button>
                              </div>
                              <div style={{ width: '1px', height: '20px', backgroundColor: '#C0C0C0', margin: '0 4px' }} />
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('justifyLeft', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="왼쪽 정렬"
                              >
                                <AlignLeft size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('justifyCenter', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="가운데 정렬"
                              >
                                <AlignCenter size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('justifyRight', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="오른쪽 정렬"
                              >
                                <AlignRight size={16} />
                              </button>
                              <div style={{ width: '1px', height: '20px', backgroundColor: '#C0C0C0', margin: '0 4px' }} />
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('insertUnorderedList', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="글머리 기호 목록"
                              >
                                <List size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) iframeDoc.execCommand('insertOrderedList', false);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="번호 매기기 목록"
                              >
                                <ListOrdered size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) {
                                    const url = prompt('링크 URL을 입력하세요:');
                                    if (url) iframeDoc.execCommand('createLink', false, url);
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="링크 삽입"
                              >
                                <Link2 size={16} />
                              </button>
                              <div style={{ width: '1px', height: '20px', backgroundColor: '#C0C0C0', margin: '0 4px' }} />
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (event) => {
                                        const imageUrl = event.target?.result as string;
                                        const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                        if (iframeDoc && imageUrl) {
                                          try {
                                            iframeDoc.execCommand('insertHTML', false, `<img src="${imageUrl}" alt="" style="max-width: 100%; height: auto;" />`);
                                          } catch (err) {
                                            const selection = iframeDoc.getSelection();
                                            if (selection && selection.rangeCount > 0) {
                                              const range = selection.getRangeAt(0);
                                              const img = iframeDoc.createElement('img');
                                              img.src = imageUrl;
                                              img.alt = '';
                                              img.style.maxWidth = '100%';
                                              img.style.height = 'auto';
                                              range.insertNode(img);
                                            }
                                          }
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                    e.target.value = '';
                                  }}
                                  style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    cursor: 'pointer',
                                    zIndex: 2,
                                  }}
                                  title="이미지 삽입"
                                />
                                <button
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    border: '1px solid #A9A9A9',
                                    borderRadius: '3px',
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    pointerEvents: 'none',
                                  }}
                                  title="이미지 삽입"
                                  disabled
                                >
                                  <Image size={16} />
                                </button>
                              </div>
                              <button
                                onClick={() => {
                                  const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                  if (iframeDoc) {
                                    try {
                                      iframeDoc.execCommand('insertHTML', false, '<pre style="background-color: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto;"><code></code></pre>');
                                    } catch (err) {
                                      iframeDoc.execCommand('formatBlock', false, 'pre');
                                      const selection = iframeDoc.getSelection();
                                      if (selection && selection.rangeCount > 0) {
                                        const range = selection.getRangeAt(0);
                                        const preElement = range.commonAncestorContainer.nodeType === 1 
                                          ? range.commonAncestorContainer as HTMLElement
                                          : (range.commonAncestorContainer.parentElement as HTMLElement);
                                        if (preElement && preElement.tagName === 'PRE') {
                                          preElement.style.backgroundColor = '#f4f4f4';
                                          preElement.style.padding = '10px';
                                          preElement.style.borderRadius = '4px';
                                          preElement.style.overflowX = 'auto';
                                        }
                                      }
                                    }
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="코드 블록"
                              >
                                <Code size={16} />
                              </button>
                              <div style={{ position: 'relative', display: 'inline-block' }} data-more-menu>
                                <button
                                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    border: '1px solid #A9A9A9',
                                    borderRadius: '3px',
                                    backgroundColor: showMoreMenu ? '#E0E0E0' : '#FFFFFF',
                                    color: '#000000',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                  title="더보기"
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {showMoreMenu && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '100%',
                                      right: 0,
                                      marginTop: '4px',
                                      backgroundColor: '#FFFFFF',
                                      border: '1px solid #A9A9A9',
                                      borderRadius: '4px',
                                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                      zIndex: 1000,
                                      display: 'flex',
                                      flexDirection: 'row',
                                      gap: '4px',
                                      padding: '4px',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    data-more-menu
                                  >
                                    <button
                                      onClick={() => {
                                        const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                        if (iframeDoc) {
                                          iframeDoc.execCommand('formatBlock', false, 'blockquote');
                                        }
                                        setShowMoreMenu(false);
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        border: '1px solid #A9A9A9',
                                        borderRadius: '3px',
                                        backgroundColor: '#FFFFFF',
                                        color: '#000000',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title="인용문"
                                    >
                                      <Quote size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                        if (iframeDoc) {
                                          iframeDoc.execCommand('insertHorizontalRule', false);
                                        }
                                        setShowMoreMenu(false);
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        border: '1px solid #A9A9A9',
                                        borderRadius: '3px',
                                        backgroundColor: '#FFFFFF',
                                        color: '#000000',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title="구분선"
                                    >
                                      <Minus size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                        if (iframeDoc) {
                                          const rows = prompt('행 수를 입력하세요 (기본값: 3):', '3');
                                          const cols = prompt('열 수를 입력하세요 (기본값: 3):', '3');
                                          const rowCount = parseInt(rows || '3', 10);
                                          const colCount = parseInt(cols || '3', 10);
                                          
                                          if (rowCount > 0 && colCount > 0) {
                                            let tableHtml = '<table border="1" style="border-collapse: collapse; width: 100%;">';
                                            for (let i = 0; i < rowCount; i++) {
                                              tableHtml += '<tr>';
                                              for (let j = 0; j < colCount; j++) {
                                                tableHtml += '<td style="padding: 8px; border: 1px solid #000;">&nbsp;</td>';
                                              }
                                              tableHtml += '</tr>';
                                            }
                                            tableHtml += '</table>';
                                            
                                            try {
                                              iframeDoc.execCommand('insertHTML', false, tableHtml);
                                            } catch (err) {
                                              const selection = iframeDoc.getSelection();
                                              if (selection && selection.rangeCount > 0) {
                                                const range = selection.getRangeAt(0);
                                                const tempDiv = iframeDoc.createElement('div');
                                                tempDiv.innerHTML = tableHtml;
                                                const fragment = iframeDoc.createDocumentFragment();
                                                while (tempDiv.firstChild) {
                                                  fragment.appendChild(tempDiv.firstChild);
                                                }
                                                range.insertNode(fragment);
                                              }
                                            }
                                          }
                                        }
                                        setShowMoreMenu(false);
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        border: '1px solid #A9A9A9',
                                        borderRadius: '3px',
                                        backgroundColor: '#FFFFFF',
                                        color: '#000000',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title="표"
                                    >
                                      <Table size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                        if (iframeDoc) {
                                          const selection = iframeDoc.getSelection();
                                          if (selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
                                            const range = selection.getRangeAt(0);
                                            const selectedText = range.toString();
                                            
                                            try {
                                              iframeDoc.execCommand('insertHTML', false, `<sup>${selectedText}</sup>`);
                                            } catch (err) {
                                              const sup = iframeDoc.createElement('sup');
                                              sup.textContent = selectedText;
                                              range.deleteContents();
                                              range.insertNode(sup);
                                            }
                                          } else {
                                            try {
                                              iframeDoc.execCommand('insertHTML', false, '<sup></sup>');
                                            } catch (err) {
                                              const selection = iframeDoc.getSelection();
                                              if (selection && selection.rangeCount > 0) {
                                                const range = selection.getRangeAt(0);
                                                const sup = iframeDoc.createElement('sup');
                                                sup.innerHTML = '&nbsp;';
                                                range.insertNode(sup);
                                              }
                                            }
                                          }
                                        }
                                        setShowMoreMenu(false);
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        border: '1px solid #A9A9A9',
                                        borderRadius: '3px',
                                        backgroundColor: '#FFFFFF',
                                        color: '#000000',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title="위 첨자"
                                    >
                                      <Superscript size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const iframeDoc = translatedIframeRef.current?.contentDocument || translatedIframeRef.current?.contentWindow?.document;
                                        if (iframeDoc) {
                                          const selection = iframeDoc.getSelection();
                                          if (selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
                                            const range = selection.getRangeAt(0);
                                            const selectedText = range.toString();
                                            
                                            try {
                                              iframeDoc.execCommand('insertHTML', false, `<sub>${selectedText}</sub>`);
                                            } catch (err) {
                                              const sub = iframeDoc.createElement('sub');
                                              sub.textContent = selectedText;
                                              range.deleteContents();
                                              range.insertNode(sub);
                                            }
                                } else {
                                            try {
                                              iframeDoc.execCommand('insertHTML', false, '<sub></sub>');
                                            } catch (err) {
                                              const selection = iframeDoc.getSelection();
                                              if (selection && selection.rangeCount > 0) {
                                                const range = selection.getRangeAt(0);
                                                const sub = iframeDoc.createElement('sub');
                                                sub.innerHTML = '&nbsp;';
                                                range.insertNode(sub);
                                              }
                                            }
                                          }
                                        }
                                        setShowMoreMenu(false);
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        border: '1px solid #A9A9A9',
                                        borderRadius: '3px',
                                        backgroundColor: '#FFFFFF',
                                        color: '#000000',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title="아래 첨자"
                                    >
                                      <Subscript size={16} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div style={{ width: '1px', height: '20px', backgroundColor: '#C0C0C0', margin: '0 4px' }} />
                              <button
                                onClick={() => {
                                  const iframe = translatedIframeRef.current;
                                  const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                                  if (!iframeDoc) return;
                                  
                                  if (mode === 'text') {
                                    iframeDoc.body.setAttribute('tabindex', '-1');
                                    iframeDoc.body.focus();
                                iframeDoc.execCommand('undo', false);
                                const updatedHtml = iframeDoc.documentElement.outerHTML;
                                currentHtmlRef.current = updatedHtml;
                                onTranslatedChange(updatedHtml);
                                  } else {
                                    if (undoStackRef.current.length > 0) {
                                      const currentHtml = iframeDoc.documentElement.outerHTML;
                                      redoStackRef.current.push(currentHtml);
                                      const previousHtml = undoStackRef.current.pop() || '';
                                      iframeDoc.open();
                                      iframeDoc.write(previousHtml);
                                      iframeDoc.close();
                                      currentHtmlRef.current = previousHtml;
                                      onTranslatedChange(previousHtml);
                                      setSelectedElements([]);
                                    }
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="실행 취소 (Ctrl/Cmd+Z)"
                              >
                                <Undo2 size={16} color="#000000" />
                              </button>
                              <button
                            onClick={() => {
                              const iframe = translatedIframeRef.current;
                              const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                              if (!iframeDoc) return;

                                  if (mode === 'text') {
                                    iframeDoc.body.setAttribute('tabindex', '-1');
                                    iframeDoc.body.focus();
                                    iframeDoc.execCommand('redo', false);
                                    const updatedHtml = iframeDoc.documentElement.outerHTML;
                                    currentHtmlRef.current = updatedHtml;
                                    onTranslatedChange(updatedHtml);
                                  } else {
                                if (redoStackRef.current.length > 0) {
                                  const currentHtml = iframeDoc.documentElement.outerHTML;
                                  undoStackRef.current.push(currentHtml);
                                  const nextHtml = redoStackRef.current.pop() || '';
                                  iframeDoc.open();
                                  iframeDoc.write(nextHtml);
                                  iframeDoc.close();
                                  currentHtmlRef.current = nextHtml;
                                  onTranslatedChange(nextHtml);
                                  setSelectedElements([]);
                                    }
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#000000',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="다시 실행 (Ctrl/Cmd+Y)"
                              >
                                <Redo2 size={16} color="#000000" />
                              </button>
                            </>
                          )}
                        </div>
                        {mode === 'component' && (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#696969' }}>
                              {selectedElements.length}개 선택됨
                            </span>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                if (!translatedIframeRef.current) return;
                                const iframeDoc = translatedIframeRef.current.contentDocument || translatedIframeRef.current.contentWindow?.document;
                                if (iframeDoc) {
                                  selectedElements.forEach(el => {
                                    el.classList.remove('component-selected');
                                    el.style.outline = '';
                                    el.style.boxShadow = '';
                                    el.style.backgroundColor = '';
                                    el.style.outlineOffset = '';
                                  });
                                }
                                setSelectedElements([]);
                              }}
                              disabled={selectedElements.length === 0}
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                              title="전체 선택 취소"
                            >
                              선택 취소
                            </Button>
                            <Button
                              variant="primary"
                              onClick={handleDelete}
                              disabled={selectedElements.length === 0}
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                            >
                              삭제
                            </Button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <iframe
                      ref={panel.ref}
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        border: 'none',
                        display: 'block',
                      }}
                      title={panel.title}
                    />
                  </div>
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const NewTranslation: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { setIsCollapsed } = useSidebar();
  const [currentStep, setCurrentStep] = useState(1);
  
  // ⭐ localStorage에서 draft 복원 (뒤로가기 대응)
  const loadDraftFromStorage = (): TranslationDraft | null => {
    try {
      const saved = localStorage.getItem('transflow-draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('📦 localStorage에서 draft 복원:', parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('⚠️ localStorage에서 draft 복원 실패:', e);
    }
    return null;
  };

  // ⭐ localStorage에 draft 저장
  const saveDraftToStorage = (draftToSave: TranslationDraft) => {
    try {
      localStorage.setItem('transflow-draft', JSON.stringify(draftToSave));
      console.log('💾 localStorage에 draft 저장 완료');
    } catch (e) {
      console.warn('⚠️ localStorage에 draft 저장 실패:', e);
    }
  };

  // 초기 draft 상태 (항상 빈 상태로 시작 - 새 번역은 항상 새로운 작업)
  const [draft, setDraft] = useState<TranslationDraft>(() => {
    return {
      url: '',
      selectedAreas: [],
      originalHtml: '',
      originalHtmlWithIds: '', // STEP 2의 iframe HTML (data-transflow-id 포함)
      state: DocumentState.DRAFT,
    };
  });
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [step6Data, setStep6Data] = useState<{ title?: string; categoryId?: number; estimatedLength?: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatingProgress, setTranslatingProgress] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [draftDocuments, setDraftDocuments] = useState<DocumentResponse[]>([]);
  const step6Ref = React.useRef<{ handleDraftSave: () => void; handlePublish: () => void } | null>(null);
  // Step 5용 패널 접기/펼치기 상태
  const [step5CollapsedPanels, setStep5CollapsedPanels] = useState<Set<string>>(new Set());

  const userRole = useMemo(() => {
    if (!user) return null;
    return roleLevelToRole(user.roleLevel);
  }, [user]);

  const isAuthorized = useMemo(() => {
    return userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
  }, [userRole]);

  // 사이드바 자동 접기 제거 (사용자가 직접 제어)

  // ⭐ 새 번역 시작 시 localStorage draft 초기화 (다른 기기/브라우저에서 예전 데이터가 남아있는 문제 해결)
  useEffect(() => {
    // 컴포넌트 마운트 시 localStorage의 draft 초기화
    // "새 번역 만들기"는 항상 새로운 작업을 시작하는 것이므로
    try {
      localStorage.removeItem('transflow-draft');
      console.log('🗑️ 새 번역 시작: localStorage draft 초기화 완료');
    } catch (e) {
      console.warn('⚠️ localStorage 초기화 실패:', e);
    }
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  // 임시저장 문서 로드
  useEffect(() => {
    const loadDraftDocuments = async () => {
      try {
        const allDocs = await documentApi.getAllDocuments();
        console.log('📋 [NewTranslation] 전체 문서 조회:', allDocs.length, '개');
        console.log('📋 [NewTranslation] 문서 샘플:', allDocs.slice(0, 3).map(doc => ({
          id: doc.id,
          title: doc.title,
          status: doc.status,
          hasVersions: doc.hasVersions,
          versionCount: doc.versionCount
        })));
        const draftOnlyDocs = allDocs.filter(doc => 
          doc.status === 'DRAFT' && doc.hasVersions !== true
        );
        console.log('📋 [NewTranslation] 임시저장 문서 필터링 결과:', draftOnlyDocs.length, '개');
        setDraftDocuments(draftOnlyDocs);
        console.log('📋 임시저장 문서 로드 완료:', draftOnlyDocs.length, '개');
      } catch (error) {
        console.error('임시저장 문서 로드 실패:', error);
      }
    };
    loadDraftDocuments();
  }, []);

  // 권한 체크
  useEffect(() => {
    if (user && !isAuthorized) {
      navigate('/dashboard');
    }
  }, [user, isAuthorized, navigate]);

  // ⭐ draft가 변경될 때마다 localStorage에 저장 (뒤로가기 대응)
  useEffect(() => {
    // 빈 draft는 저장하지 않음
    if (draft.url || draft.originalHtml || draft.selectedAreas.length > 0) {
      saveDraftToStorage(draft);
    }
  }, [draft]);

  // 변경 사항 추적
  useEffect(() => {
    if (draft.editedHtml && draft.editedHtml !== draft.originalHtml) {
      setHasUnsavedChanges(true);
    } else if (draft.translatedHtml) {
      setHasUnsavedChanges(true);
    }
  }, [draft.editedHtml, draft.translatedHtml, draft.originalHtml]);

  // 이탈 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleCrawling = async () => {
    if (!draft.url.trim()) {
      setSaveError('URL을 입력해주세요.');
      return;
    }

    // URL 유효성 검사
    try {
      new URL(draft.url);
    } catch {
      setSaveError('올바른 URL 형식이 아닙니다. (예: https://example.com)');
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setSaveError(null);
    
    // 가짜 진행률 (실제 백엔드에서 진행률을 반환하지 않으므로)
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);
    
    try {
      // Translation.jsx와 동일한 방식으로 크롤링
      const response = await translationApi.translateWebPage({
        url: draft.url.trim(),
        targetLang: 'NONE', // 번역하지 않음을 나타내는 특수 값
        sourceLang: undefined,
      });

      if (response.success) {
        console.log('원본 페이지 로드 성공:', {
          hasOriginalHtml: !!response.originalHtml,
          originalHtmlLength: response.originalHtml?.length,
          hasCss: !!response.css,
          cssLength: response.css?.length
        });
        
        // HTML 구조 확인 및 보완 (Translation.jsx와 동일)
        let htmlContent = response.originalHtml || '';
        const hasDoctype = htmlContent.trim().toLowerCase().startsWith('<!doctype');
        const hasHtml = htmlContent.includes('<html');
        const hasBody = htmlContent.includes('<body');
        
        // 완전한 HTML 문서 구조가 아니면 감싸기
        if (!hasDoctype || !hasHtml || !hasBody) {
          console.log('HTML이 완전한 문서 구조가 아님. 감싸는 중...', { hasDoctype, hasHtml, hasBody });
          
          if (htmlContent.includes('<body')) {
            // body 태그는 이미 있으므로 그대로 사용
          } else {
            // body 태그가 없으면 body로 감싸기
            htmlContent = `<body>${htmlContent}</body>`;
          }
          
          // html 태그가 없으면 html로 감싸기
          if (!htmlContent.includes('<html')) {
            htmlContent = `<html>${htmlContent}</html>`;
          }
          
          // head 태그 추가
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', '<html><head></head>');
          }
          
          // DOCTYPE 추가
          if (!hasDoctype) {
            htmlContent = `<!DOCTYPE html>${htmlContent}`;
          }
        }
        
        // CSS를 <style> 태그로 추가 (Translation.jsx와 동일)
        if (response.css) {
          const cssTag = `<style id="transflow-css">\n${response.css}\n</style>`;
          if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`);
          } else if (htmlContent.includes('<html')) {
            // head가 없으면 head 추가
            htmlContent = htmlContent.replace('<html>', `<html><head>${cssTag}</head>`);
          } else {
            htmlContent = cssTag + '\n' + htmlContent;
          }
        }

        console.log('최종 HTML 구조:', htmlContent.substring(0, 500));

        setDraft((prev) => ({
          ...prev,
          originalHtml: htmlContent,
          selectedAreas: [], // ⭐ 새로 크롤링하면 선택 영역 초기화
          originalHtmlWithIds: '', // ⭐ 이전 HTML with IDs도 초기화
        }));
        setCurrentStep(2);
      } else {
        setSaveError(response.errorMessage || '페이지 로드 중 오류가 발생했습니다.');
      }
    } catch (error: any) {
      console.error('Crawling error:', error);
      setSaveError(
        error?.response?.data?.errorMessage || 
        error?.message || 
        '서버와 통신할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAreaSelect = (area: SelectedArea) => {
    setDraft((prev) => ({
      ...prev,
      selectedAreas: [...prev.selectedAreas, area],
    }));
  };

  const handleAreaRemove = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      selectedAreas: prev.selectedAreas.filter((area) => area.id !== id),
    }));
  };

  const handleTranslation = async (sourceLang: string, targetLang: string) => {
    console.log('🔄 번역 시작:', { sourceLang, targetLang });
    
    setIsTranslating(true);
    setTranslatingProgress(0);
    setSaveError(null);
    
    // 가짜 진행률
    const progressInterval = setInterval(() => {
      setTranslatingProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 12;
      });
    }, 400);
    
    try {
      // 번역 실행 - STEP 3에서 편집된 HTML만 번역 (선택된 영역만)
      const htmlToTranslate = draft.editedHtml || draft.originalHtmlWithIds || draft.originalHtml;
      console.log('🌐 번역 API 호출 중...');
      console.log('📝 번역할 HTML 길이:', htmlToTranslate.length);
      console.log('📝 번역할 HTML 미리보기:', htmlToTranslate.substring(0, 300));
      
      if (!draft.editedHtml) {
        console.warn('⚠️ draft.editedHtml이 없습니다. STEP 3에서 편집 내용이 저장되지 않았을 수 있습니다.');
      }
      
      const translatedHtml = await documentApi.translateHtml(
        htmlToTranslate,
        sourceLang,
        targetLang
      );
      clearInterval(progressInterval);
      setTranslatingProgress(100);
      console.log('✅ 번역 완료, 번역된 HTML 길이:', translatedHtml.length);

      setDraft((prev) => ({
        ...prev,
        translatedHtml,
        sourceLang,
        targetLang,
      }));

      // 문서는 STEP 6에서 생성하므로 여기서는 번역만 수행
      console.log('✅ 번역 완료, STEP 5로 이동');
      setCurrentStep(5);
    } catch (error: any) {
      console.error('❌ 번역 실패:', error);
      clearInterval(progressInterval);
      setSaveError(error?.response?.data?.message || '번역 실패');
    } finally {
      setIsTranslating(false);
      setTimeout(() => setTranslatingProgress(0), 1000);
    }
  };

  const handleNext = async () => {
    if (currentStep < 6) {
      // STEP 1: URL 입력 및 크롤링 확인
      if (currentStep === 1) {
        if (!draft.url.trim()) {
          alert('URL을 입력해주세요.');
          return;
        }
        if (!draft.originalHtml) {
          alert('크롤링을 먼저 실행해주세요.');
          return;
        }
      }
      
      // STEP 2: 영역 선택 확인 (선택하지 않으면 전체 선택)
      if (currentStep === 2) {
        if (draft.selectedAreas.length === 0) {
          alert('선택된 영역이 없습니다. 전체 화면이 선택됩니다.');
          // 전체 화면 선택: body의 모든 자식을 selectedAreas에 추가
          // 실제로는 originalHtml을 그대로 사용
        }
      }
      
      // STEP 3에서 STEP 4로 넘어갈 때 iframe HTML 저장 (선택된 영역만)
      if (currentStep === 3) {
        console.log('💾 STEP 3 → STEP 4: 편집된 HTML 저장 중...');
        // draft.editedHtml이 onHtmlChange로 이미 저장되어 있어야 함
        if (!draft.editedHtml) {
          console.warn('⚠️ draft.editedHtml이 없습니다. STEP 3에서 편집 내용이 저장되지 않았을 수 있습니다.');
        } else {
          console.log('✅ draft.editedHtml 확인:', draft.editedHtml.substring(0, 200));
        }
        // STEP 3에서도 자동 저장 (다음 누를 때)
        setHasUnsavedChanges(false); // 저장 완료 표시
      }
      
      // STEP 4: 번역 실행 확인
      if (currentStep === 4) {
        if (!draft.translatedHtml) {
          alert('번역을 먼저 실행해주세요.');
          return;
        }
      }
      
      // 다음으로 넘어갈 때는 자동 저장 (STEP 3 포함) - 모달 표시 안 함
      if (hasUnsavedChanges) {
        await handleSaveDraft(undefined, true); // isAutoSave = true
      }
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      if (hasUnsavedChanges && !lastSaved) {
        if (!window.confirm('저장되지 않은 변경사항이 있습니다. 뒤로 가시겠습니까?')) {
          return;
        }
      }
      
      // Step 3에서 Step 2로 돌아갈 때 선택 영역 초기화
      if (currentStep === 3) {
        setDraft(prev => ({
          ...prev,
          selectedAreas: [],
          originalHtmlWithIds: '',
          editedHtml: '',
        }));
      }
      
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateDocument = async (data: { title: string; categoryId?: number; estimatedLength?: number; status: string }) => {
    console.log('📝 문서 생성 시작:', data, '상태:', data.status);
    
    setIsCreating(true);
    setSaveError(null);

    try {
      // 1. 문서 생성 (또는 기존 문서 업데이트)
      const response = await documentApi.createDocument({
        title: data.title,
        originalUrl: draft.url,
        sourceLang: draft.sourceLang || 'auto',
        targetLang: draft.targetLang || 'ko',
        categoryId: data.categoryId,
        estimatedLength: data.estimatedLength,
        status: data.status,
      });
      setDocumentId(response.id);
      console.log('✅ 문서 생성/업데이트 완료:', response.id);

      // 2. 기존 버전 삭제 (Step 6에서 새로 생성하기 전에 기존 버전 정리)
      try {
        await documentApi.deleteAllVersions(response.id);
        console.log('🗑️ 기존 버전 삭제 완료');
      } catch (error: any) {
        console.warn('⚠️ 기존 버전 삭제 실패 (무시):', error);
        // 버전이 없을 수도 있으므로 에러는 무시
      }

      // 3. 원문 버전 생성 (선택한 영역)
      await documentApi.createDocumentVersion(response.id, {
        versionType: 'ORIGINAL',
        content: draft.editedHtml || draft.originalHtmlWithIds || draft.originalHtml,
        isFinal: false,
      });
      console.log('✅ 원문 버전 저장 완료');

      // 4. AI 번역 버전 생성
      if (draft.translatedHtml) {
        await documentApi.createDocumentVersion(response.id, {
          versionType: 'AI_DRAFT',
          content: draft.translatedHtml,
          isFinal: false,
        });
        console.log('✅ AI 번역 버전 저장 완료');
      }

      // 4. 완료 후 localStorage 클리어 및 문서 관리 페이지로 이동
      const statusText = data.status === 'PENDING_TRANSLATION' ? '번역 대기 상태로' : '초안 상태로';
      setSaveError(null);
      
      // ⭐ 문서 생성 완료 시 localStorage 클리어
      try {
        localStorage.removeItem('transflow-draft');
        console.log('🗑️ localStorage draft 클리어 완료');
      } catch (e) {
        console.warn('⚠️ localStorage 클리어 실패:', e);
      }
      
      navigate('/documents');
    } catch (error: any) {
      console.error('❌ 문서 생성 실패:', error);
      setSaveError(error?.response?.data?.message || '문서 생성 실패');
    } finally {
      setIsCreating(false);
    }
  };

  // 임시저장 문서 불러오기
  const handleLoadDraft = async (doc: DocumentResponse) => {
    try {
      console.log('🔄 임시저장 문서 불러오기 시작:', doc.id);
      console.log('📦 draftData:', doc.draftData ? `존재 (${doc.draftData.length}자)` : '없음');
      console.log('📦 draftData 내용:', doc.draftData);
      
      // draftData가 있고 빈 문자열이 아닌 경우에만 파싱
      if (doc.draftData && doc.draftData.trim() !== '') {
        try {
          // 저장된 draftData가 있으면 파싱해서 복원
          const parsedData = JSON.parse(doc.draftData);
          console.log('✅ JSON 파싱 성공:', parsedData);
          
          let savedStep = parsedData.currentStep || 1;
          const savedDraft = parsedData.draft || {};
          const savedStep6Data = parsedData.step6Data || null;

          // Step 2, 4에서 저장된 경우 Step 3으로 이동
          // - Step 2: 임시저장 불가 (선택만 하는 단계)
          // - Step 4: 단순 번역 확인 단계, 편집 내용은 Step 3에서 복원
          if (savedStep === 2 || savedStep === 4) {
            savedStep = 3;
          }

          setDraft({
            url: savedDraft.url || doc.originalUrl,
            selectedAreas: savedDraft.selectedAreas || [],
            originalHtml: savedDraft.originalHtml || '',
            originalHtmlWithIds: savedDraft.originalHtmlWithIds || '',
            editedHtml: savedDraft.editedHtml,
            translatedHtml: savedDraft.translatedHtml,
            sourceLang: savedDraft.sourceLang || doc.sourceLang || 'auto',
            targetLang: savedDraft.targetLang || doc.targetLang || 'ko',
            state: savedDraft.state || DocumentState.DRAFT,
          });
          setDocumentId(doc.id);
          setCurrentStep(savedStep);
          
          // Step 6 데이터 저장 (Step 6 컴포넌트에서 사용)
          if (savedStep === 6 && savedStep6Data) {
            setStep6Data(savedStep6Data);
          } else {
            setStep6Data(null);
          }
          
          console.log('✅ 임시저장 문서 불러오기 완료:', doc.id, 'Step', savedStep);
          alert('임시저장 문서를 불러왔습니다.');
        } catch (parseError) {
          console.error('❌ JSON 파싱 실패:', parseError);
          console.error('❌ 손상된 draftData:', doc.draftData);
          throw new Error(`JSON 파싱 실패: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } else {
        // draftData가 없거나 빈 문자열이면 기본값으로 복원 (하위 호환성)
        console.log('⚠️ draftData가 없거나 비어있어 기본값으로 복원');
        setDraft({
          url: doc.originalUrl,
          sourceLang: doc.sourceLang || 'auto',
          targetLang: doc.targetLang || 'ko',
          selectedAreas: [],
          originalHtml: '',
          originalHtmlWithIds: '',
          state: DocumentState.DRAFT,
        });
        setDocumentId(doc.id);
        setCurrentStep(1);
        console.log('✅ 임시저장 문서 불러오기 완료 (기본값):', doc.id);
        alert('임시저장 문서를 불러왔습니다. (기본값으로 복원)');
      }
    } catch (error) {
      console.error('❌ 임시저장 문서 불러오기 실패:', error);
      console.error('❌ 오류 상세:', error instanceof Error ? error.message : String(error));
      alert(`임시저장 문서를 불러오는데 실패했습니다.\n오류: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSaveDraft = async (step6Data?: { title?: string; categoryId?: number; estimatedLength?: number }, isAutoSave: boolean = false) => {
    try {
      // draft 상태와 currentStep을 JSON으로 저장
      const draftData = JSON.stringify({
        currentStep,
        draft: {
          url: draft.url,
          selectedAreas: draft.selectedAreas,
          originalHtml: draft.originalHtml,
          originalHtmlWithIds: draft.originalHtmlWithIds,
          editedHtml: draft.editedHtml,
          translatedHtml: draft.translatedHtml,
          sourceLang: draft.sourceLang,
          targetLang: draft.targetLang,
          state: draft.state,
        },
        // Step 6의 입력값들도 저장
        step6Data: step6Data || null,
      });

      // Step 6에서 임시저장할 때는 제목도 업데이트
      const documentTitle = step6Data?.title || `번역 문서 - ${new Date().toLocaleString()}`;

      if (!documentId) {
        // 문서가 없으면 먼저 생성 (버전은 생성하지 않음 - Step 6에서만 생성)
        const response = await documentApi.createDocument({
          title: documentTitle,
          originalUrl: draft.url,
          sourceLang: draft.sourceLang || 'auto',
          targetLang: draft.targetLang || 'ko',
          status: 'DRAFT',
          categoryId: step6Data?.categoryId,
          estimatedLength: step6Data?.estimatedLength,
          draftData: draftData,
        });
        setDocumentId(response.id);
        console.log('✅ 임시저장 완료 (문서 생성):', response.id, 'Step', currentStep);
      } else {
        // 문서가 있으면 문서만 업데이트 (버전은 생성하지 않음)
        const updateData: any = {
          draftData: draftData, // 항상 draftData는 업데이트
        };
        // Step 6 데이터가 있으면 추가
        if (step6Data) {
          if (step6Data.title) updateData.title = step6Data.title;
          if (step6Data.categoryId) updateData.categoryId = step6Data.categoryId;
          if (step6Data.estimatedLength) updateData.estimatedLength = step6Data.estimatedLength;
        }
        await documentApi.updateDocument(documentId, updateData);
        console.log('✅ 임시저장 완료 (문서 업데이트):', documentId, 'Step', currentStep);
      }

      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setSaveError(null);

      // ⭐ 임시저장 문서 목록 다시 로드
      const allDocs = await documentApi.getAllDocuments();
      const draftOnlyDocs = allDocs.filter(doc => 
        doc.status === 'DRAFT' && doc.hasVersions !== true
      );
      setDraftDocuments(draftOnlyDocs);
      console.log('✅ 임시저장 목록 갱신 완료:', draftOnlyDocs.length, '개');
      
      // ⭐ 임시저장 완료 모달 표시 (자동 저장이 아닐 때만)
      if (!isAutoSave) {
        alert('임시저장되었습니다.');
      }
    } catch (error: any) {
      console.error('Save error:', error);
      setSaveError(error?.response?.data?.message || '저장 실패');
      alert(`임시저장에 실패했습니다.\n오류: ${error?.response?.data?.message || error.message || '저장 실패'}`);
    }
  };

  if (!isAuthorized) {
    return null;
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1CrawlingInput
            url={draft.url}
            setUrl={(url) => setDraft((prev) => ({ ...prev, url }))}
            onExecute={handleCrawling}
            isLoading={isLoading}
            loadingProgress={loadingProgress}
            draftDocuments={draftDocuments}
            onLoadDraft={handleLoadDraft}
          />
        );
      case 2:
        return (
          <Step2AreaSelection
            html={draft.originalHtmlWithIds || draft.originalHtml}
            selectedAreas={draft.selectedAreas}
            onAreaSelect={handleAreaSelect}
            onAreaRemove={handleAreaRemove}
            onHtmlUpdate={(html) => {
              // STEP 2의 iframe HTML (data-transflow-id 포함)을 저장
              setDraft((prev) => ({ ...prev, originalHtmlWithIds: html }));
            }}
          />
        );
      case 3:
        console.log('🎯 Step 3 렌더링:', {
          editedHtml: draft.editedHtml?.substring(0, 100),
          originalHtml: draft.originalHtml?.substring(0, 100),
          originalHtmlWithIds: draft.originalHtmlWithIds?.substring(0, 100),
          selectedAreasCount: draft.selectedAreas.length,
          selectedAreasData: draft.selectedAreas
        });
        return (
          <Step3PreEdit
            html={draft.editedHtml || draft.originalHtmlWithIds || draft.originalHtml}
            onHtmlChange={(html) => setDraft((prev) => ({ ...prev, editedHtml: html }))}
            selectedAreas={draft.selectedAreas}
          />
        );
      case 4:
        return (
          <Step4Translation
            onConfirm={handleTranslation}
            onCancel={() => setCurrentStep(3)}
            isTranslating={isTranslating}
            translatingProgress={translatingProgress}
          />
        );
      case 5:
        return (
          <Step5ParallelEdit
            crawledHtml={draft.originalHtml} // STEP 1에서 크롤링한 전체 원문
            selectedHtml={draft.editedHtml || draft.originalHtmlWithIds || ''} // STEP 2/3에서 선택한 영역
            translatedHtml={draft.translatedHtml || ''}
            onTranslatedChange={(html) => setDraft((prev) => ({ ...prev, translatedHtml: html }))}
            collapsedPanels={step5CollapsedPanels}
            onTogglePanel={(panelId) => {
              setStep5CollapsedPanels(prev => {
                const newSet = new Set(prev);
                if (newSet.has(panelId)) {
                  newSet.delete(panelId);
                } else {
                  newSet.add(panelId);
                }
                return newSet;
              });
            }}
          />
        );
      case 6:
        return (
          <Step6CreateDocument
            ref={step6Ref}
            draft={draft}
            onCreateDocument={(data) => {
              // Step6CreateDocument에서 status를 포함하여 전달
              handleCreateDocument(data);
            }}
            onSaveDraft={(data) => {
              // Step 6에서 임시저장
              handleSaveDraft(data);
            }}
            step6Data={step6Data || undefined}
            isCreating={isCreating}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#DCDCDC',
      }}
    >
      {/* 상단 상태 바 */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #C0C0C0',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        {/* 왼쪽: STEP 정보 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#000000',
                fontFamily: 'system-ui, Pretendard, sans-serif',
              }}
            >
              STEP {currentStep} / 6
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#696969',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                fontWeight: 500,
              }}
            >
              {currentStep === 1 && '가져올 웹사이트 주소 입력'}
              {currentStep === 2 && '영역 선택'}
              {currentStep === 3 && '번역 전 편집'}
              {currentStep === 4 && '번역 실행'}
              {currentStep === 5 && '번역 후 편집'}
              {currentStep === 6 && '문서 정보 입력 및 생성'}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#696969',
                fontFamily: 'system-ui, Pretendard, sans-serif',
              }}
            >
              {currentStep >= 3 && lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString()}` : currentStep >= 3 ? '저장되지 않음' : ''}
            </div>
            {saveError && (
              <div
                style={{
                  fontSize: '12px',
                  color: '#000000',
                  fontFamily: 'system-ui, Pretendard, sans-serif',
                  backgroundColor: '#D3D3D3',
                  padding: '4px 8px',
                  borderRadius: '4px',
                }}
              >
                {saveError}
              </div>
            )}
          </div>

        {/* 중앙: 문서 보기 옵션 (Step 5일 때만 표시) */}
        {currentStep === 5 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '24px',
            padding: '6px 16px',
            backgroundColor: '#F8F9FA',
            borderRadius: '6px',
            border: '1px solid #D3D3D3',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#000000' }}>문서 보기:</span>
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
                checked={!step5CollapsedPanels.has('crawled')}
                onChange={() => {
                  setStep5CollapsedPanels(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has('crawled')) {
                      newSet.delete('crawled');
                    } else {
                      newSet.add('crawled');
                    }
                    return newSet;
                  });
                }}
                style={{
                  cursor: 'pointer',
                  width: '16px',
                  height: '16px',
                }}
              />
              <span>원본 웹사이트</span>
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
                checked={!step5CollapsedPanels.has('selected')}
                onChange={() => {
                  setStep5CollapsedPanels(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has('selected')) {
                      newSet.delete('selected');
                    } else {
                      newSet.add('selected');
                    }
                    return newSet;
                  });
                }}
                style={{ 
                  cursor: 'pointer',
                  width: '16px',
                  height: '16px',
                }}
              />
              <span>Version 0</span>
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
                checked={!step5CollapsedPanels.has('translated')}
                onChange={() => {
                  setStep5CollapsedPanels(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has('translated')) {
                      newSet.delete('translated');
                    } else {
                      newSet.add('translated');
                    }
                    return newSet;
                  });
                }}
                style={{ 
                  cursor: 'pointer',
                  width: '16px',
                  height: '16px',
                }}
              />
              <span>Version 1 (AI 초벌 번역)</span>
            </label>
          </div>
        )}

        {/* 오른쪽: 임시 저장 버튼 (Step 3부터만 표시) */}
        <div>
          {currentStep >= 3 && (
            <Button variant="secondary" onClick={() => handleSaveDraft()} style={{ fontSize: '12px', padding: '4px 8px' }}>
              임시 저장
            </Button>
          )}
        </div>
      </div>

      {/* 메인 작업 영역 */}
      <div
        style={{
          flex: 1,
          padding: '16px',
          overflow: 'auto',
        }}
      >
        {renderStep()}
      </div>

      {/* 하단 네비게이션 */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid #C0C0C0',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          {currentStep > 1 && (
            <Button variant="secondary" onClick={handlePrev}>
              이전
            </Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {currentStep < 6 && (
            <Button variant="primary" onClick={handleNext}>
              다음
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewTranslation;

