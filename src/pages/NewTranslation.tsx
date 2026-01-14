import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { useSidebar } from '../contexts/SidebarContext';
import { roleLevelToRole } from '../utils/hasAccess';
import { UserRole } from '../types/user';
import { DocumentState, TranslationDraft, SelectedArea } from '../types/translation';
import { Button } from '../components/Button';
import { WysiwygEditor, EditorMode } from '../components/WysiwygEditor';
import { documentApi } from '../services/documentApi';
import { translationApi } from '../services/api';

// STEP 1: 크롤링 주소 입력
const Step1CrawlingInput: React.FC<{
  url: string;
  setUrl: (url: string) => void;
  onExecute: () => void;
  isLoading: boolean;
  loadingProgress?: number;
}> = ({ url, setUrl, onExecute, isLoading, loadingProgress = 0 }) => {
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
  
  // 이벤트 리스너를 추적하기 위한 ref
  const listenersAttached = React.useRef(false);
  
  // selectedAreas가 변경될 때마다 현재 iframe HTML 저장
  React.useEffect(() => {
    if (iframeRef.current && onHtmlUpdate && selectedAreas.length > 0) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const currentHtml = iframeDoc.documentElement.outerHTML;
        onHtmlUpdate(currentHtml);
        console.log('💾 STEP 2 iframe HTML 저장 완료 (data-transflow-id 포함)');
      }
    }
  }, [selectedAreas, onHtmlUpdate]);

  // 영역 선택 모드 활성화 함수 (Translation.jsx와 동일한 구조)
  // useCallback을 제거하고 일반 함수로 변경 (의존성 문제 해결)
  const enableElementSelection = (iframeDoc: Document) => {
    // 이미 리스너가 붙어있으면 중복 방지
    if (listenersAttached.current) {
      console.log('⚠️ 이미 리스너가 붙어있음, 스킵');
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
    
    // 선택된 요소 업데이트 함수 (Translation.jsx와 동일)
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
      console.log('✅ 선택된 요소 업데이트:', newSelected.length, '개');
      // 새로 선택된 요소만 onAreaSelect 호출
      newSelected.forEach(item => {
        const existingArea = selectedAreas.find(area => area.id === item.id);
        if (!existingArea) {
          // 선택자 생성
          const el = iframeDoc.querySelector(`[data-transflow-id="${item.id}"]`) as HTMLElement;
          let selector = '';
          if (el.id) {
            selector = `#${el.id}`;
          } else if (el.className) {
            const classes = Array.from(el.classList).filter(c => !c.startsWith('transflow-')).join('.');
            if (classes) {
              selector = `${el.tagName.toLowerCase()}.${classes}`;
            }
          } else {
            selector = el.tagName.toLowerCase();
          }
          
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
    
    // 클릭 시 요소 선택/해제 (토글) - Translation.jsx와 동일
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return;
      if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return;
      
      e.stopPropagation();
      
      // 요소에 고유 ID 부여
      let elementId = target.getAttribute('data-transflow-id');
      if (!elementId) {
        elementId = `transflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        target.setAttribute('data-transflow-id', elementId);
      }
      
      // 선택 토글
      if (target.classList.contains('transflow-selected')) {
        target.classList.remove('transflow-selected');
        console.log('🔴 선택 해제:', elementId);
        onAreaRemove(elementId);
      } else {
        target.classList.add('transflow-selected');
        console.log('🟢 선택 추가:', elementId, target.tagName);
        updateSelectedElements();
      }
      
      target.classList.remove('transflow-hovering');
      highlightedElement = null;
    };
    
    // 모든 요소에 직접 이벤트 리스너 추가 (Translation.jsx와 동일)
    const attachListenersToAllElements = () => {
      const allElements = iframeDoc.querySelectorAll('*');
      
      allElements.forEach((el) => {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return;
        if (el === iframeDoc.body || el === iframeDoc.documentElement) return;
        
        const element = el as HTMLElement;
        // 기존 리스너 제거 후 새로 추가
        element.removeEventListener('mouseover', handleMouseOver as EventListener);
        element.removeEventListener('mouseout', handleMouseOut as EventListener);
        element.removeEventListener('click', handleClick as EventListener);
        
        element.addEventListener('mouseover', handleMouseOver as EventListener, true);
        element.addEventListener('mouseout', handleMouseOut as EventListener, true);
        element.addEventListener('click', handleClick as EventListener, true);
      });
    };
    
    // 즉시 실행 (Translation.jsx와 동일)
    attachListenersToAllElements();
    
    // body에도 추가
    if (iframeDoc.body) {
      iframeDoc.body.addEventListener('mouseover', handleMouseOver as EventListener, true);
      iframeDoc.body.addEventListener('mouseout', handleMouseOut as EventListener, true);
      iframeDoc.body.addEventListener('click', handleClick as EventListener, true);
    }
    
    // 새로 추가되는 요소에도 리스너 추가 (MutationObserver 사용)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            const element = node as HTMLElement;
            if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'NOSCRIPT') return;
            element.addEventListener('mouseover', handleMouseOver as EventListener, true);
            element.addEventListener('mouseout', handleMouseOut as EventListener, true);
            element.addEventListener('click', handleClick as EventListener, true);
          }
        });
      });
    });
    
    observer.observe(iframeDoc.body, {
      childList: true,
      subtree: true
    });
    
    listenersAttached.current = true;
    console.log('✅ 영역 선택 모드 활성화 완료');
  };

  useEffect(() => {
    // 리스너 플래그 초기화
    listenersAttached.current = false;
    
    if (iframeRef.current && html) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (iframeDoc) {
        // HTML 구조 확인 및 보완 (Translation.jsx와 동일)
        let htmlContent = html;
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
              console.log('✅ 영역 선택 모드 활성화 중...');
              enableElementSelection(iframeDoc);
              setPageLoaded(true); // 활성화 완료 후 상태 업데이트
            } else {
              setTimeout(checkAndEnableSelection, 100);
            }
          } catch (error) {
            // iframe 내부 스크립트 에러는 무시
            console.warn('checkAndEnableSelection error (ignored):', error);
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
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#000000',
            fontFamily: 'system-ui, Pretendard, sans-serif',
            marginBottom: '16px',
          }}
        >
          선택된 영역 ({selectedAreas.length})
        </h3>
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
  const [mode, setMode] = useState<'text' | 'component'>('text');
  const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]); // 다중 선택
  const [isInitialized, setIsInitialized] = useState(false); // 초기화 플래그
  
  // 컴포넌트 편집용 Undo/Redo Stack
  const undoStackRef = React.useRef<string[]>([]);
  const redoStackRef = React.useRef<string[]>([]);
  const currentHtmlRef = React.useRef<string>('');
  
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
      
      // 컴포넌트 편집 스타일 제거
      const allElements = iframeDoc.querySelectorAll('[data-component-editable]');
      allElements.forEach(el => {
        (el as HTMLElement).style.outline = 'none';
        (el as HTMLElement).style.cursor = 'text';
        (el as HTMLElement).style.boxShadow = 'none'; // boxShadow도 제거!
        (el as HTMLElement).classList.remove('component-selected');
        el.removeAttribute('data-component-editable');
      });
      
      // 선택된 요소 초기화
      setSelectedElements([]);
      
    } else if (mode === 'component') {
      // 컴포넌트 편집 모드
      // contentEditable 비활성화
      const editableElements = iframeDoc.querySelectorAll('[contenteditable="true"]');
      editableElements.forEach((el) => {
        (el as HTMLElement).contentEditable = 'false';
        (el as HTMLElement).style.cursor = 'default';
      });
      
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
          (el as HTMLElement).setAttribute('data-component-editable', 'true');
          (el as HTMLElement).style.cursor = 'pointer';
          (el as HTMLElement).style.outline = '1px dashed #C0C0C0';
          
          // 클릭 이벤트 리스너 추가
          el.addEventListener('click', handleComponentClick, true);
        }
      });
      
      console.log('✅ 컴포넌트 클릭 리스너 추가 완료:', componentElements.length, '개');
    }
  }, [mode, isInitialized]);

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
              
              // 변경 사항 추적
              const handleInput = () => {
                const updatedHtml = iframeDoc.documentElement.outerHTML;
                onHtmlChange(updatedHtml);
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
    if (selectedElements.length > 0 && iframeRef.current && mode === 'component') {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        console.log('🗑️ 삭제할 요소:', selectedElements.length, '개');
        
        // 삭제 전 현재 상태를 undo stack에 저장
        const currentHtml = iframeDoc.documentElement.outerHTML;
        if (currentHtmlRef.current && currentHtmlRef.current !== currentHtml) {
          undoStackRef.current.push(currentHtmlRef.current);
          redoStackRef.current = []; // 새 작업 시 redo stack 초기화
          console.log('💾 Undo stack에 저장 (삭제 전):', undoStackRef.current.length);
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
      }
    }
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
          </div>
          <div style={{ borderLeft: '1px solid #C0C0C0', height: '24px', margin: '0 4px' }} />
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant="secondary"
              onClick={() => {
                const iframe = iframeRef.current;
                const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                if (iframeDoc) {
                  iframeDoc.execCommand('undo', false);
                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                  onHtmlChange(updatedHtml);
                }
              }}
              style={{ fontSize: '12px', padding: '4px 8px' }}
              title="실행 취소 (Ctrl+Z)"
            >
              ↶ 실행 취소
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const iframe = iframeRef.current;
                const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                if (iframeDoc) {
                  iframeDoc.execCommand('redo', false);
                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                  onHtmlChange(updatedHtml);
                }
              }}
              style={{ fontSize: '12px', padding: '4px 8px' }}
              title="다시 실행 (Ctrl+Y)"
            >
              ↷ 다시 실행
            </Button>
          </div>
        </div>

        {mode === 'component' && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#696969', marginRight: '4px' }}>
              {selectedElements.length}개 선택됨
            </span>
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
const Step6CreateDocument: React.FC<{
  draft: TranslationDraft;
  onCreateDocument: (data: { title: string; categoryId?: number; estimatedLength?: number }) => void;
  isCreating: boolean;
}> = ({ draft, onCreateDocument, isCreating }) => {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [estimatedLength, setEstimatedLength] = useState<number>(0);

  // 예상 분량 자동 계산
  useEffect(() => {
    if (draft.translatedHtml) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = draft.translatedHtml;
      const textContent = tempDiv.textContent || tempDiv.innerText || '';
      const length = textContent.replace(/\s+/g, '').length;
      setEstimatedLength(length);
    }
  }, [draft.translatedHtml]);

  const handleSubmit = () => {
    if (!title.trim()) {
      alert('문서 제목을 입력해주세요.');
      return;
    }

    onCreateDocument({
      title: title.trim(),
      categoryId: categoryId ? parseInt(categoryId) : undefined,
      estimatedLength: estimatedLength > 0 ? estimatedLength : undefined,
    });
  };

  return (
    <div
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
            disabled={isCreating}
          >
            <option value="">카테고리 선택 안 함</option>
            <option value="1">기술 문서</option>
            <option value="2">뉴스</option>
            <option value="3">블로그</option>
            <option value="4">기타</option>
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
            총 {estimatedLength.toLocaleString()}자 (공백 제외)
          </span>
        </div>

        {/* 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isCreating || !title.trim()}
            style={{ padding: '12px 24px' }}
          >
            {isCreating ? '생성 중...' : '문서 생성'}
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
            문서를 생성하고 있습니다. 잠시만 기다려주세요...
          </div>
        )}
      </div>
    </div>
  );
};

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
}> = ({ crawledHtml, selectedHtml, translatedHtml, onTranslatedChange }) => {
  const [mode, setMode] = useState<EditorMode>('text');
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);
  const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]);
  
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

  // 편집본 iframe 초기 렌더링 (NewTranslation 전용)
  useEffect(() => {
    const iframe = translatedIframeRef.current;
    if (!iframe || !translatedHtml) return;

    console.log('📝 [NewTranslation Step5] 편집본 iframe 렌더링 시작, isTranslatedInitialized:', isTranslatedInitialized);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(translatedHtml);
        iframeDoc.close();
        console.log('✅ [NewTranslation Step5] 편집본 iframe 렌더링 완료');
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

      if (!isTranslatedInitialized) {
        // 초기 HTML을 currentHtmlRef에 저장
        currentHtmlRef.current = translatedHtml;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setIsTranslatedInitialized(true);
      }
    }
  }, [translatedHtml, collapsedPanels, fullscreenPanel, isTranslatedInitialized]);

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

      // contentEditable 설정
      const textElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, td, th, label, button');
      textElements.forEach(el => {
        (el as HTMLElement).contentEditable = 'true';
        (el as HTMLElement).style.cursor = 'text';
      });

      const containerElements = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, ul, ol, table');
      containerElements.forEach(el => {
        (el as HTMLElement).contentEditable = 'false';
        (el as HTMLElement).style.cursor = 'default';
      });

      // ⭐ Step 3와 동일한 방식으로 키보드 이벤트 처리
      const handleKeyDown = (e: KeyboardEvent) => {
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('undo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          onTranslatedChange(updatedHtml);
          console.log('↩️ Undo (STEP 5 텍스트 편집)');
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('redo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          onTranslatedChange(updatedHtml);
          console.log('↪️ Redo (STEP 5 텍스트 편집)');
        }
        
        // ⭐ 백스페이스 키 처리 (브라우저 기본 동작 허용) - Step 3와 동일
        if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // 브라우저가 알아서 처리하게 놔둠
          console.log('⌫ 백스페이스 (STEP 5 텍스트 편집)');
        }
      };
      
      iframeDoc.addEventListener('keydown', handleKeyDown, true);
      
      // 변경 사항 추적 - Step 3와 동일
      const handleInput = () => {
        const updatedHtml = iframeDoc.documentElement.outerHTML;
        onTranslatedChange(updatedHtml);
      };
      iframeDoc.body.addEventListener('input', handleInput);

    } else if (mode === 'component') {
      // 컴포넌트 편집 모드
      console.log('🧩 [NewTranslation Step5] 컴포넌트 편집 모드 활성화');

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
        h6[data-component-editable] {
          outline: 1px dashed #C0C0C0 !important;
          cursor: pointer !important;
        }
        div[data-component-editable]:hover,
        section[data-component-editable]:hover,
        article[data-component-editable]:hover,
        p[data-component-editable]:hover,
        h1[data-component-editable]:hover,
        h2[data-component-editable]:hover,
        h3[data-component-editable]:hover {
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

      // 클릭 가능한 컴포넌트 표시
      const componentElements = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
      componentElements.forEach(el => {
        (el as HTMLElement).setAttribute('data-component-editable', 'true');
      });

      // Cmd+Z / Cmd+Y 지원 (컴포넌트 편집 모드) - 커스텀 Undo Stack 사용
      const handleKeydown = (e: KeyboardEvent) => {
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
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
            
            // 다시 컴포넌트 편집 모드 활성화 (이벤트 리스너 재등록은 useEffect에서 처리)
          } else {
            console.log('⚠️ Undo stack이 비어있습니다 (STEP 5)');
          }
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
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
          } else {
            console.log('⚠️ Redo stack이 비어있습니다');
          }
        }
      };
      // capture 단계에서 이벤트 잡기 (맥에서 시스템 단축키보다 먼저 실행)
      iframeDoc.addEventListener('keydown', handleKeydown, true);
      
      // 부모 window에서도 이벤트 잡기
      const handleWindowKeydown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };
      window.addEventListener('keydown', handleWindowKeydown, true);

      // 컴포넌트 클릭 핸들러 (다중 선택 + 토글)
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
          setSelectedElements(prev => prev.filter(el => el !== target));
        } else {
          target.classList.add('component-selected');
          target.style.outline = '3px solid #000000';
          target.style.boxShadow = 'none';
          setSelectedElements(prev => [...prev, target]);
        }
      };

      componentElements.forEach(el => {
        el.addEventListener('click', handleComponentClick);
      });
    }

    return () => {
      // 클린업: 이벤트 리스너는 모드 변경 시 제거됨
    };
  }, [mode, isTranslatedInitialized]); // ⭐ Step 3처럼 onTranslatedChange 제거

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
    
    // ⭐ 삭제 후 컴포넌트 편집 모드 재활성화 (이벤트 리스너 재등록)
    setMode('text');
    setTimeout(() => setMode('component'), 0);
  };

  // 패널 정의
  const panels = [
    { id: 'crawled', title: '크롤링 원본', ref: crawledIframeRef, editable: false },
    { id: 'selected', title: '선택한 영역', ref: selectedIframeRef, editable: false },
    { id: 'translated', title: '편집본', ref: translatedIframeRef, editable: true },
  ];

  const visiblePanels = panels.filter(p => !collapsedPanels.has(p.id));
  const hasFullscreen = fullscreenPanel !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
      {/* 3개 패널 */}
      <div style={{ display: 'flex', height: '100%', gap: '4px' }}>
        {panels.map(panel => {
          const isCollapsed = collapsedPanels.has(panel.id);
          const isFullscreen = fullscreenPanel === panel.id;
          const isHidden = hasFullscreen && !isFullscreen;

          if (isHidden) return null; // 전체화면 모드에서 다른 패널 숨김

          return (
            <div
              key={panel.id}
              style={{
                flex: isCollapsed ? '0 0 48px' : isFullscreen ? '1' : `1 1 ${100 / visiblePanels.length}%`,
                display: 'flex',
                flexDirection: 'column',
                transition: 'flex 0.2s ease',
                minWidth: isCollapsed ? '48px' : '200px',
              }}
            >
              {/* 패널 헤더 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: isCollapsed ? 'center' : 'space-between',
                  alignItems: 'center',
                  padding: isCollapsed ? '12px 4px' : '8px 12px',
                  backgroundColor: '#D3D3D3',
                  borderRadius: '4px 4px 0 0',
                  cursor: isCollapsed ? 'pointer' : 'default',
                  height: isCollapsed ? 'auto' : '36px',
                  writingMode: isCollapsed ? 'vertical-rl' : 'horizontal-tb',
                  textOrientation: isCollapsed ? 'mixed' : 'mixed',
                }}
                onClick={isCollapsed ? () => togglePanel(panel.id) : undefined}
              >
                {isCollapsed ? (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#000000', whiteSpace: 'nowrap' }}>
                    {panel.title}
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#000000' }}>
                      {panel.title}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
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
                        title="전체화면"
                      >
                        {isFullscreen ? '축소' : '전체'}
                      </button>
                      <button
                        onClick={() => togglePanel(panel.id)}
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
                        title="접기"
                      >
                        접기
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 패널 내용 */}
              {!isCollapsed && (
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
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
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
                          <div style={{ borderLeft: '1px solid #C0C0C0', height: '20px', margin: '0 4px' }} />
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const iframe = translatedIframeRef.current;
                              const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                              if (iframeDoc) {
                                iframeDoc.execCommand('undo', false);
                                const updatedHtml = iframeDoc.documentElement.outerHTML;
                                onTranslatedChange(updatedHtml);
                              }
                            }}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            title="실행 취소 (Ctrl+Z)"
                          >
                            ↶
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const iframe = translatedIframeRef.current;
                              const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
                              if (iframeDoc) {
                                iframeDoc.execCommand('redo', false);
                                const updatedHtml = iframeDoc.documentElement.outerHTML;
                                onTranslatedChange(updatedHtml);
                              }
                            }}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            title="다시 실행 (Ctrl+Y)"
                          >
                            ↷
                          </Button>
                        </div>
                        {mode === 'component' && (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#696969' }}>
                              {selectedElements.length}개 선택됨
                            </span>
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
              )}
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
  const [draft, setDraft] = useState<TranslationDraft>({
    url: '',
    selectedAreas: [],
    originalHtml: '',
    originalHtmlWithIds: '', // STEP 2의 iframe HTML (data-transflow-id 포함)
    state: DocumentState.DRAFT,
  });
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatingProgress, setTranslatingProgress] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const userRole = useMemo(() => {
    if (!user) return null;
    return roleLevelToRole(user.roleLevel);
  }, [user]);

  const isAuthorized = useMemo(() => {
    return userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
  }, [userRole]);

  // 사이드바 자동 접기 제거 (사용자가 직접 제어)

  // 권한 체크
  useEffect(() => {
    if (user && !isAuthorized) {
      navigate('/dashboard');
    }
  }, [user, isAuthorized, navigate]);

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
      
      // 다음으로 넘어갈 때는 자동 저장 (STEP 3 포함)
      if (hasUnsavedChanges) {
        await handleSaveDraft();
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
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateDocument = async (data: { title: string; categoryId?: number; estimatedLength?: number }) => {
    // 번역 대기 상태로 올릴지 확인
    const confirmPending = window.confirm(
      '문서를 생성합니다.\n\n번역 대기 상태로 올리시겠습니까?\n\n' +
      '- 예: 봉사자들이 이 문서를 볼 수 있습니다.\n' +
      '- 아니오: 초안(DRAFT) 상태로 저장됩니다.'
    );
    
    const status = confirmPending ? 'PENDING_TRANSLATION' : 'DRAFT';
    console.log('📝 문서 생성 시작:', data, '상태:', status);
    
    setIsCreating(true);
    setSaveError(null);

    try {
      // 1. 문서 생성
      const response = await documentApi.createDocument({
        title: data.title,
        originalUrl: draft.url,
        sourceLang: draft.sourceLang || 'auto',
        targetLang: draft.targetLang || 'ko',
        categoryId: data.categoryId,
        estimatedLength: data.estimatedLength,
        status: status,
      });
      setDocumentId(response.id);
      console.log('✅ 문서 생성 완료:', response.id);

      // 2. 원문 버전 생성 (선택한 영역)
      await documentApi.createDocumentVersion(response.id, {
        versionType: 'ORIGINAL',
        content: draft.editedHtml || draft.originalHtmlWithIds || draft.originalHtml,
        isFinal: false,
      });
      console.log('✅ 원문 버전 저장 완료');

      // 3. AI 번역 버전 생성
      if (draft.translatedHtml) {
        await documentApi.createDocumentVersion(response.id, {
          versionType: 'AI_DRAFT',
          content: draft.translatedHtml,
          isFinal: false,
        });
        console.log('✅ AI 번역 버전 저장 완료');
      }

      // 4. 완료 후 문서 관리 페이지로 이동
      const statusText = confirmPending ? '번역 대기 상태로' : '초안 상태로';
      alert(`문서가 ${statusText} 생성되었습니다!`);
      navigate('/documents');
    } catch (error: any) {
      console.error('❌ 문서 생성 실패:', error);
      setSaveError(error?.response?.data?.message || '문서 생성 실패');
      alert('문서 생성에 실패했습니다: ' + (error?.response?.data?.message || error.message));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!documentId) {
      // 문서가 없으면 먼저 생성
      try {
        const response = await documentApi.createDocument({
          title: `번역 문서 - ${new Date().toLocaleString()}`,
          originalUrl: draft.url,
          sourceLang: 'EN', // TODO: 실제 언어 감지
          targetLang: 'KO',
        });
        setDocumentId(response.id);
        
        // 원문 버전 생성
        await documentApi.createDocumentVersion(response.id, {
          versionType: 'ORIGINAL',
          content: draft.originalHtml,
          isFinal: false,
        });

        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        setSaveError(null);
      } catch (error: any) {
        console.error('Save error:', error);
        setSaveError(error?.response?.data?.message || '저장 실패');
      }
    } else {
      // 문서가 있으면 버전 업데이트
      try {
        if (draft.editedHtml && draft.editedHtml !== draft.originalHtml) {
          await documentApi.createDocumentVersion(documentId, {
            versionType: 'MANUAL_TRANSLATION',
            content: draft.editedHtml,
            isFinal: false,
          });
        }
        if (draft.translatedHtml) {
          await documentApi.createDocumentVersion(documentId, {
            versionType: 'AI_DRAFT',
            content: draft.translatedHtml,
            isFinal: false,
          });
        }
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        setSaveError(null);
      } catch (error: any) {
        console.error('Save error:', error);
        setSaveError(error?.response?.data?.message || '저장 실패');
      }
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
          />
        );
      case 2:
        return (
          <Step2AreaSelection
            html={draft.originalHtml}
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
            html={draft.originalHtmlWithIds || draft.editedHtml || draft.originalHtml}
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
          />
        );
      case 6:
        return (
          <Step6CreateDocument
            draft={draft}
            onCreateDocument={handleCreateDocument}
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
          padding: '8px 16px',
          borderBottom: '1px solid #C0C0C0',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
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
              }}
            >
              {lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString()}` : '저장되지 않음'}
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
        <div>
          <Button variant="secondary" onClick={handleSaveDraft} style={{ fontSize: '12px', padding: '4px 8px' }}>
            임시 저장
          </Button>
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
        <div>
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

