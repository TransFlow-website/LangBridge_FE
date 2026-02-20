import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { translationWorkApi, LockStatusResponse } from '../services/translationWorkApi';
import { documentApi, DocumentResponse } from '../services/documentApi';
import { documentApi as docApi, DocumentVersionResponse } from '../services/documentApi';
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
import { AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Palette, Quote, Minus, Link2, Highlighter, Image, Table, Code, Superscript, Subscript, MoreVertical, Undo2, Redo2 } from 'lucide-react';
import './TranslationWork.css';

export default function TranslationWork() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as { from?: string } | null)?.from || '/translations/pending';
  const documentId = id ? parseInt(id, 10) : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<LockStatusResponse | null>(null);
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const [aiDraftContent, setAiDraftContent] = useState<string>('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [completedParagraphs, setCompletedParagraphs] = useState<Set<number>>(new Set());
  const [highlightedParagraphIndex, setHighlightedParagraphIndex] = useState<number | null>(null);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);
  const [handoverMemo, setHandoverMemo] = useState('');
  const [handoverTerms, setHandoverTerms] = useState('');
  const [showHandoverInfoModal, setShowHandoverInfoModal] = useState(false);
  
  // 링크 편집 모달 상태
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<HTMLAnchorElement | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  
  // 더보기 메뉴 상태
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // 패널 접기/전체화면 상태
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);
  const [allPanelsCollapsed, setAllPanelsCollapsed] = useState(false);

  // 패널 refs (iframe으로 변경)
  const originalIframeRef = useRef<HTMLIFrameElement>(null);
  const aiDraftIframeRef = useRef<HTMLIFrameElement>(null);
  const isScrollingRef = useRef(false);

  // 원본 HTML 저장 (iframe 렌더링용)
  const [originalHtml, setOriginalHtml] = useState<string>('');
  const [aiDraftHtml, setAiDraftHtml] = useState<string>('');
  const [savedTranslationHtml, setSavedTranslationHtml] = useState<string>('');
  const [lastSavedHtml, setLastSavedHtml] = useState<string>(''); // 마지막 저장된 HTML

  // 내 번역 에디터 상태 (iframe 기반)
  const myTranslationIframeRef = useRef<HTMLIFrameElement>(null);
  const [isTranslationEditorInitialized, setIsTranslationEditorInitialized] = useState(false);
  const [editorMode, setEditorMode] = useState<'text' | 'component'>('text');
  const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]);
  
  // Undo/Redo Stack for component editing
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const currentEditorHtmlRef = useRef<string>('');
  
  // 이벤트 핸들러 저장 (제거를 위해)
  const componentClickHandlersRef = useRef<Map<HTMLElement, (e: Event) => void>>(new Map());
  const linkClickHandlersRef = useRef<Map<HTMLElement, (e: Event) => void>>(new Map());
  const windowKeydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const iframeKeydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  
  // iframe 렌더링 상태 추적
  const hasRenderedMyTranslation = useRef(false);
  

  // 마우스 호버로 문단 하이라이트 (useEffect보다 먼저 선언)
  const handleParagraphHover = useCallback((index: number) => {
    console.log(`🔍 문단 ${index} 하이라이트 요청`);
    setHighlightedParagraphIndex(index);
  }, []);

  // 페이지 나갈 때 저장 확인 및 락 유지
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 변경사항이 있을 때만 경고
      if (savedTranslationHtml && savedTranslationHtml.trim() !== '') {
        e.preventDefault();
        e.returnValue = ''; // Chrome에서 필요
        return ''; // 일부 브라우저에서 필요
      }
    };

    const handleUnload = async () => {
      // 페이지를 나갈 때 락은 유지 (다른 사용자가 이어서 작업할 수 있도록)
      // 락은 "인계 요청" 또는 "번역 완료" 버튼을 눌렀을 때만 해제됨
      console.log('🚪 페이지를 나갑니다. 락은 유지됩니다.');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [savedTranslationHtml]);

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

        // 2. 락 획득 시도 (재시도 로직 포함)
        console.log('🔒 락 획득 시도:', documentId);
        let lockAttempts = 0;
        const maxLockAttempts = 3;
        let lockAcquired = false;
        
        while (!lockAcquired && lockAttempts < maxLockAttempts) {
          try {
            lockAttempts++;
            console.log(`🔒 락 획득 시도 ${lockAttempts}/${maxLockAttempts}:`, documentId);
            
            const lock = await translationWorkApi.acquireLock(documentId);
            console.log('✅ 락 획득 성공:', lock);
            setLockStatus(lock);
            
            // completedParagraphs 초기화
            if (lock.completedParagraphs && lock.completedParagraphs.length > 0) {
              console.log('📊 기존 완료된 문단 로드:', lock.completedParagraphs);
              setCompletedParagraphs(new Set(lock.completedParagraphs));
            }
            
            if (!lock.canEdit) {
              setError(`이 문서는 ${lock.lockedBy?.name}님이 작업 중입니다.`);
              setLoading(false);
              return;
            }
            
            lockAcquired = true;
            break;
            
          } catch (lockError: any) {
            const status = lockError?.response?.status;
            
            // 503 (SERVICE_UNAVAILABLE) 또는 데이터베이스 락 오류인 경우 재시도
            if ((status === 503 || lockError.message?.includes('LockAcquisitionException')) && 
                lockAttempts < maxLockAttempts) {
              console.warn(`⚠️ 락 획득 실패 (${lockAttempts}/${maxLockAttempts}), 재시도 중...`);
              await new Promise(resolve => setTimeout(resolve, 1000 * lockAttempts)); // 점진적 대기
              continue;
            }
            
            // 재시도 불가능한 에러 또는 최대 시도 횟수 초과
            throw lockError;
          }
        }
        
        if (!lockAcquired) {
          console.error('❌ 락 획득 최종 실패:', documentId);
          setError('문서 락을 획득할 수 없습니다. 잠시 후 다시 시도해주세요.');
          setLoading(false);
          return;
        }
        
        try {
        } catch (lockError: any) {
          console.error('❌ 락 획득 최종 실패:', lockError);
          console.error('락 에러 상세:', {
            response: lockError.response,
            data: lockError.response?.data,
            status: lockError.response?.status,
            message: lockError.message,
          });
          
          const status = lockError.response?.status;
          
          if (status === 409) {
            // 이미 락이 있는 경우 상태만 확인
            try {
              const status = await translationWorkApi.getLockStatus(documentId);
              setLockStatus(status);
              
              // completedParagraphs 초기화
              if (status.completedParagraphs && status.completedParagraphs.length > 0) {
                console.log('📊 기존 완료된 문단 로드 (409):', status.completedParagraphs);
                setCompletedParagraphs(new Set(status.completedParagraphs));
              }
              
              if (!status.canEdit) {
                setError(`이 문서는 ${status.lockedBy?.name || '다른 사용자'}님이 작업 중입니다.`);
                setLoading(false);
                return;
              }
            } catch (statusError: any) {
              console.error('락 상태 확인 실패:', statusError);
              setError('문서 락 상태를 확인할 수 없습니다.');
              setLoading(false);
              return;
            }
          } else {
            // 다른 에러는 상위 catch로 전달
            throw lockError;
          }
        }

        // 3. 버전 정보 가져오기
        try {
          const versions = await docApi.getDocumentVersions(documentId);
          console.log('📦 문서 버전 목록:', versions.map(v => ({ type: v.versionType, number: v.versionNumber })));
          
          if (!versions || versions.length === 0) {
            console.warn('⚠️ 문서 버전이 없습니다.');
            setError('문서 버전 정보를 찾을 수 없습니다. 문서가 제대로 생성되었는지 확인해주세요.');
            setLoading(false);
            return;
          }
          
          // ORIGINAL 버전 찾기
          const originalVersion = versions.find(v => v.versionType === 'ORIGINAL');
          if (originalVersion) {
            // 문단 ID 부여 (iframe 렌더링용)
            const processedOriginal = extractParagraphs(originalVersion.content, 'original');
            setOriginalHtml(processedOriginal); // ⭐ 처리된 HTML을 iframe용으로 저장
            setOriginalContent(processedOriginal);
            console.log('✅ 원문 버전 로드 완료 (문단 ID 추가됨)');
          } else {
            console.warn('⚠️ ORIGINAL 버전이 없습니다.');
          }

          // AI_DRAFT 버전 찾기
          const aiDraftVersion = versions.find(v => v.versionType === 'AI_DRAFT');
          if (aiDraftVersion) {
            // 문단 ID 부여 (iframe 렌더링용)
            const processedAiDraft = extractParagraphs(aiDraftVersion.content, 'ai-draft');
            setAiDraftHtml(processedAiDraft); // ⭐ 처리된 HTML을 iframe용으로 저장
            setAiDraftContent(processedAiDraft);
            console.log('✅ AI 초벌 번역 버전 로드 완료 (문단 ID 추가됨)');
          } else {
            console.warn('⚠️ AI_DRAFT 버전이 없습니다.');
          }

          // MANUAL_TRANSLATION 버전 찾기 (사용자가 저장한 번역 - 우선 로드)
          const manualTranslationVersion = versions
            .filter(v => v.versionType === 'MANUAL_TRANSLATION')
            .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0]; // 최신 버전
          
          if (manualTranslationVersion) {
            console.log('✅ 저장된 번역 발견:', manualTranslationVersion.versionNumber, '버전');
            // 저장된 번역 HTML에 문단 ID 추가
            const processedManual = extractParagraphs(manualTranslationVersion.content, 'manual');
            setSavedTranslationHtml(processedManual);
            setLastSavedHtml(processedManual); // 마지막 저장 상태 기록
          } else if (aiDraftVersion) {
            console.log('ℹ️ 저장된 번역이 없어 AI 초벌 번역 사용');
            // MANUAL_TRANSLATION이 없으면 AI_DRAFT를 에디터에 설정 (문단 ID 추가)
            const processedAiDraft = extractParagraphs(aiDraftVersion.content, 'ai-draft-editor');
            setSavedTranslationHtml(processedAiDraft);
            setLastSavedHtml(processedAiDraft); // 마지막 저장 상태 기록
          } else if (originalVersion) {
            console.log('ℹ️ AI 초벌 번역도 없어 원문 사용');
            // AI_DRAFT도 없으면 ORIGINAL을 기본값으로 (문단 ID 추가)
            const processedOriginal = extractParagraphs(originalVersion.content, 'original-editor');
            setSavedTranslationHtml(processedOriginal);
            setLastSavedHtml(processedOriginal); // 마지막 저장 상태 기록
          } else {
            console.warn('⚠️ 사용 가능한 버전이 없습니다.');
            setError('표시할 문서 내용이 없습니다.');
            setLoading(false);
            return;
          }

          // 문단 개수 계산
          setTimeout(() => {
            if (originalIframeRef.current?.contentDocument?.body) {
              const paragraphs = getParagraphs(originalIframeRef.current.contentDocument.body as HTMLElement);
              setProgress((prev) => ({ ...prev, total: paragraphs.length }));
            } else if (originalHtml) {
              // iframe이 아직 로드되지 않았으면 HTML에서 직접 계산
              const parser = new DOMParser();
              const doc = parser.parseFromString(originalHtml, 'text/html');
              const paragraphs = getParagraphs(doc.body);
              setProgress((prev) => ({ ...prev, total: paragraphs.length }));
            }
          }, 500);
        } catch (versionError: any) {
          console.error('버전 정보 조회 실패:', versionError);
          setError('문서 버전 정보를 불러오는데 실패했습니다: ' + (versionError.message || '알 수 없는 오류'));
          setLoading(false);
          return;
        }

      } catch (err: any) {
        console.error('데이터 로드 실패:', err);
        console.error('에러 상세:', {
          response: err.response,
          data: err.response?.data,
          status: err.response?.status,
          message: err.message,
        });
        
        // 에러 메시지 추출 (다양한 응답 형식 지원)
        let errorMessage = '데이터를 불러오는데 실패했습니다.';
        
        // Spring 기본 에러 메시지 필터링
        const isSpringDefaultError = (msg: string) => {
          return msg === 'No message available' || 
                 msg === 'No message' || 
                 msg === '' || 
                 !msg || 
                 msg.trim() === '';
        };
        
        if (err.response?.data) {
          if (typeof err.response.data === 'string') {
            if (!isSpringDefaultError(err.response.data)) {
              errorMessage = err.response.data;
            }
          } else if (err.response.data.message) {
            if (!isSpringDefaultError(err.response.data.message)) {
              errorMessage = err.response.data.message;
            }
          } else if (err.response.data.error) {
            if (!isSpringDefaultError(err.response.data.error)) {
              errorMessage = err.response.data.error;
            }
          } else if (err.response.data.errorMessage) {
            if (!isSpringDefaultError(err.response.data.errorMessage)) {
              errorMessage = err.response.data.errorMessage;
            }
          }
        } else if (err.message && !isSpringDefaultError(err.message)) {
          errorMessage = err.message;
        }
        
        // HTTP 상태 코드 기반 메시지 추가
        if (err.response?.status) {
          const statusMessages: Record<number, string> = {
            400: '잘못된 요청입니다.',
            401: '인증이 필요합니다.',
            403: '권한이 없습니다.',
            404: err.config?.url?.includes('/lock') 
              ? '문서 락 API를 찾을 수 없습니다. 백엔드가 실행 중인지 확인해주세요.'
              : err.config?.url?.includes('/documents/') && !err.config?.url?.includes('/lock')
              ? `문서 ID ${documentId}를 찾을 수 없습니다.`
              : '요청한 리소스를 찾을 수 없습니다.',
            409: '문서가 이미 다른 사용자에 의해 잠겨있습니다.',
            500: '서버 오류가 발생했습니다.',
          };
          
          if (statusMessages[err.response.status] && isSpringDefaultError(errorMessage)) {
            errorMessage = statusMessages[err.response.status];
          } else if (err.response.status === 404) {
            // 404 에러는 항상 명확한 메시지 제공
            errorMessage = statusMessages[404];
          }
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [documentId]); // editor는 의존성에서 제거 (에디터가 없어도 데이터는 로드 가능)

  // 내 번역 iframe 렌더링 (HTML 구조 보존) + 약한 연동
  useEffect(() => {
    if (isTranslationEditorInitialized) return; // 이미 초기화되었으면 스킵
    
    const iframe = myTranslationIframeRef.current;
    if (!iframe || !savedTranslationHtml) return;

    console.log('📝 내 번역 iframe 렌더링 시작');
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(savedTranslationHtml);
        iframeDoc.close();
        
        // ⭐ 기본 경계선 제거 CSS 주입 (텍스트 편집 모드용)
        const baseStyle = iframeDoc.createElement('style');
        baseStyle.id = 'base-styles';
        baseStyle.textContent = `
          * {
            outline: none !important;
          }
        `;
        iframeDoc.head.appendChild(baseStyle);
        
        // ⭐ 약한 연동: 내 번역 문단 클릭 시 원문/AI 초벌 번역 하이라이트 (조용히 실패)
        const paragraphs = iframeDoc.querySelectorAll('[data-paragraph-index]');
        paragraphs.forEach(para => {
          para.addEventListener('click', () => {
            try {
              const index = parseInt((para as HTMLElement).getAttribute('data-paragraph-index') || '0', 10);
              setHighlightedParagraphIndex(index);
              console.log(`📍 내 번역 문단 ${index} 클릭 (약한 연동)`);
            } catch (e) {
              // 조용히 실패 (에러 표시 없음)
              console.debug('내 번역 문단 연동 실패 (정상):', e);
            }
          });
        });
        
        console.log(`✅ 내 번역 iframe 렌더링 완료 (문단 ${paragraphs.length}개)`);
      } catch (error) {
        console.warn('translation iframe write error (ignored):', error);
      }

      // 에러 전파 방지
      if (iframe.contentWindow) {
        iframe.contentWindow.addEventListener('error', (e) => {
          e.stopPropagation();
          e.preventDefault();
        }, true);
      }

      if (!isTranslationEditorInitialized) {
        // 초기 HTML을 currentHtmlRef에 저장
        currentEditorHtmlRef.current = savedTranslationHtml;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setIsTranslationEditorInitialized(true);
      }
    }
  }); // ⭐ Step 5 방식: 의존성 배열 제거하여 savedTranslationHtml 변경 시 트리거되지 않도록 함 (한 번만 실행)


  // 편집 모드 처리 (텍스트/컴포넌트)
  useEffect(() => {
    if (!isTranslationEditorInitialized || !myTranslationIframeRef.current) return;

    const iframe = myTranslationIframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    console.log('🎨 편집 모드:', editorMode);

    // 기존 스타일 제거
    const existingStyle = iframeDoc.querySelector('#editor-styles');
    if (existingStyle) existingStyle.remove();

    // 기존 이벤트 리스너 제거 (새로 추가할 예정)
    const allElements = iframeDoc.querySelectorAll('*');
    allElements.forEach(el => {
      const clone = el.cloneNode(true);
      el.parentNode?.replaceChild(clone, el);
    });

    if (editorMode === 'text') {
      // 텍스트 편집 모드
      console.log('📝 [TranslationWork] 텍스트 편집 모드 활성화');

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
        }
        htmlEl.classList.remove('component-selected');
        htmlEl.removeAttribute('data-component-editable');
      });

      // ⭐ 컴포넌트 선택 스타일 제거
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
        iframeDoc.body.contentEditable = 'true';
        iframeDoc.body.style.cursor = 'text';
      }

      // 모든 텍스트 요소를 편집 가능하게
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

      // ⭐ user-select 스타일 추가 (cross-element selection)
      const textEditStyle = iframeDoc.createElement('style');
      textEditStyle.id = 'text-edit-styles';
      textEditStyle.textContent = `
        body, * {
          user-select: text !important;
          -webkit-user-select: text !important;
          cursor: text !important;
        }
      `;
      const existingTextStyle = iframeDoc.getElementById('text-edit-styles');
      if (existingTextStyle) {
        existingTextStyle.remove();
      }
      iframeDoc.head.appendChild(textEditStyle);

      // ⭐ currentEditorHtmlRef 초기화 (텍스트 편집 모드)
      const initialHtml = iframeDoc.documentElement.outerHTML;
      currentEditorHtmlRef.current = initialHtml;
      console.log('💾 TranslationWork 텍스트 편집 모드 currentEditorHtmlRef 초기화 완료');

      // ⭐ 링크 클릭 방지 (다른 사이트로 이동 방지)
      // 기존 링크 클릭 핸들러 제거
      linkClickHandlersRef.current.forEach((handler, link) => {
        link.removeEventListener('click', handler, true);
      });
      linkClickHandlersRef.current.clear();

      // 모든 링크에 클릭 핸들러 추가 (편집 모달 띄우기)
      const allLinks = iframeDoc.querySelectorAll('a');
      const handleLinkClick = (e: Event) => {
        const mouseEvent = e as MouseEvent;
        
        // Ctrl/Cmd 키를 누른 상태면 기본 동작 허용 (새 탭에서 열기)
        if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
          return true;
        }
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const linkElement = e.currentTarget as HTMLAnchorElement;
        setEditingLink(linkElement);
        setLinkUrl(linkElement.href || '');
        setShowLinkModal(true);
        
        return false;
      };

      allLinks.forEach(link => {
        const htmlLink = link as HTMLElement;
        htmlLink.addEventListener('click', handleLinkClick, true);
        linkClickHandlersRef.current.set(htmlLink, handleLinkClick);
        // 링크 스타일 변경 (편집 모드임을 표시)
        htmlLink.style.cursor = 'pointer';
        htmlLink.style.textDecoration = 'underline';
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

      // ⭐ Step 5와 동일한 방식으로 키보드 이벤트 처리
      const handleKeyDown = (e: KeyboardEvent) => {
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('undo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          currentEditorHtmlRef.current = updatedHtml;
          // ⭐ setSavedTranslationHtml 제거 - Step 5와 동일하게 useEffect 재트리거 방지
          console.log('↩️ Undo (TranslationWork 텍스트 편집)');
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('redo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          currentEditorHtmlRef.current = updatedHtml;
          // ⭐ setSavedTranslationHtml 제거 - Step 5와 동일하게 useEffect 재트리거 방지
          console.log('↪️ Redo (TranslationWork 텍스트 편집)');
        }

        // ⭐ 백스페이스 키 처리 (브라우저 기본 동작 허용)
        if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // 브라우저가 알아서 처리하게 놔둠
          console.log('⌫ 백스페이스 (TranslationWork 텍스트 편집)');
        }
      };

      // 기존 iframe 리스너 제거
      if (iframeKeydownHandlerRef.current && iframeDoc) {
        iframeDoc.removeEventListener('keydown', iframeKeydownHandlerRef.current, true);
      }
      // 새 iframe 리스너 등록 및 저장
      iframeKeydownHandlerRef.current = handleKeyDown;
      iframeDoc.addEventListener('keydown', handleKeyDown, true);
      console.log('✅ TranslationWork 텍스트 모드 키보드 단축키 등록 완료 (iframe)');

      // ⚡ 최적화: input 이벤트 디바운스 (메모리 사용 감소)
      let inputTimeoutId: ReturnType<typeof setTimeout> | null = null;
      const handleInput = () => {
        // 기존 타이머 취소
        if (inputTimeoutId) {
          clearTimeout(inputTimeoutId);
        }
        
        // 500ms 후에 HTML 추출 (디바운스)
        inputTimeoutId = setTimeout(() => {
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          setSavedTranslationHtml(updatedHtml);
          inputTimeoutId = null;
        }, 500);
      };
      iframeDoc.body.addEventListener('input', handleInput);

    } else if (editorMode === 'component') {
      // 컴포넌트 편집 모드
      console.log('🧩 [TranslationWork] 컴포넌트 편집 모드 활성화');

      // ⭐ 1. 브라우저 텍스트 선택 초기화
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
        console.log('🔑 TranslationWork iframe 키 감지:', e.key, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'shift:', e.shiftKey);
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault(); // ⭐ 항상 preventDefault 호출 (undo stack이 비어있어도 시스템 단축키 방지)
          e.stopImmediatePropagation();

          if (undoStackRef.current.length > 0) {
            console.log('↩️ Undo (컴포넌트 편집) - stack:', undoStackRef.current.length);

            // 현재 상태를 redo stack에 저장
            redoStackRef.current.push(currentEditorHtmlRef.current);

            // undo stack에서 이전 상태 복원
            const previousHtml = undoStackRef.current.pop()!;
            currentEditorHtmlRef.current = previousHtml;

            // iframe에 HTML 복원
            iframeDoc.open();
            iframeDoc.write(previousHtml);
            iframeDoc.close();

            setSavedTranslationHtml(previousHtml);
            setSelectedElements([]);

            // ⭐ savedTranslationHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
            // iframe에 포커스를 주어 키보드 이벤트가 계속 작동하도록 함
            setTimeout(() => {
              const newIframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (newIframeDoc?.body) {
                newIframeDoc.body.setAttribute('tabindex', '-1');
                newIframeDoc.body.focus();
              }
            }, 50);
        } else {
            console.log('⚠️ Undo stack이 비어있습니다 (TranslationWork)');
            // ⭐ undo stack이 비어있어도 preventDefault는 이미 호출됨 (시스템 단축키 방지)
          }
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault(); // ⭐ 항상 preventDefault 호출 (redo stack이 비어있어도 시스템 단축키 방지)
          e.stopImmediatePropagation();

          if (redoStackRef.current.length > 0) {
            console.log('↪️ Redo (컴포넌트 편집 TranslationWork) - stack:', redoStackRef.current.length);

            // 현재 상태를 undo stack에 저장
            undoStackRef.current.push(currentEditorHtmlRef.current);

            // redo stack에서 다음 상태 복원
            const nextHtml = redoStackRef.current.pop()!;
            currentEditorHtmlRef.current = nextHtml;

            // iframe에 HTML 복원
            iframeDoc.open();
            iframeDoc.write(nextHtml);
            iframeDoc.close();

            setSavedTranslationHtml(nextHtml);
            setSelectedElements([]);

            // ⭐ savedTranslationHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
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
      console.log('✅ TranslationWork 컴포넌트 모드 키보드 단축키 등록 완료 (iframe)');

      // 부모 window에서도 이벤트 잡기 (iframe 포커스가 없을 때 대비)
      const handleWindowKeydown = (e: KeyboardEvent) => {
        console.log('🔑 TranslationWork window 키 감지:', e.key, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'shift:', e.shiftKey);

        // Ctrl+Z (되돌리기)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();

          if (undoStackRef.current.length > 0 && iframeDoc) {
            console.log('↩️ Undo (TranslationWork 컴포넌트 편집 - window)');

            redoStackRef.current.push(currentEditorHtmlRef.current);
            const previousHtml = undoStackRef.current.pop()!;
            currentEditorHtmlRef.current = previousHtml;

            iframeDoc.open();
            iframeDoc.write(previousHtml);
            iframeDoc.close();

            setSavedTranslationHtml(previousHtml);
            setSelectedElements([]);

            // ⭐ savedTranslationHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
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
            console.log('↪️ Redo (TranslationWork 컴포넌트 편집 - window)');

            undoStackRef.current.push(currentEditorHtmlRef.current);
            const nextHtml = redoStackRef.current.pop()!;
            currentEditorHtmlRef.current = nextHtml;

            iframeDoc.open();
            iframeDoc.write(nextHtml);
            iframeDoc.close();

            setSavedTranslationHtml(nextHtml);
            setSelectedElements([]);

            // ⭐ savedTranslationHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
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
      console.log('✅ TranslationWork window 키보드 이벤트 리스너 등록 완료');

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

      // ⭐ Step 5와 동일한 방식으로 이벤트 리스너 등록 (capture phase)
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

      console.log('✅ TranslationWork 컴포넌트 클릭 리스너 추가 완료:', componentElements.length, '개');
      console.log('✅ TranslationWork 링크 클릭 방지 핸들러 추가 완료:', allLinks.length, '개');
    }

    // ⭐ cleanup 함수: 컴포넌트 언마운트 시 window 리스너 제거
    return () => {
      console.log('🧹 TranslationWork cleanup: 이벤트 리스너 제거');
      // window 리스너 제거
      if (windowKeydownHandlerRef.current) {
        window.removeEventListener('keydown', windowKeydownHandlerRef.current, true);
        console.log('✅ TranslationWork window 키보드 리스너 제거');
      }
    };
  }, [editorMode, isTranslationEditorInitialized, savedTranslationHtml]); // ⭐ savedTranslationHtml 추가하여 undo/redo 후 자동 재활성화

  // 자동 저장 (디바운스)
  useEffect(() => {
    if (!documentId || !savedTranslationHtml) return;

    const timeoutId = setTimeout(async () => {
      try {
        await translationWorkApi.saveTranslation(documentId, {
          content: savedTranslationHtml,
          completedParagraphs: Array.from(completedParagraphs),
        });
        console.log('💾 자동 저장 완료');
      } catch (error) {
        console.error('자동 저장 실패:', error);
      }
    }, 2000); // 2초 후 저장

    return () => clearTimeout(timeoutId);
  }, [savedTranslationHtml, documentId, completedParagraphs]);

  // 더보기 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!showMoreMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-more-menu]')) {
        setShowMoreMenu(false);
      }
    };

    window.document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

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

  // 원문 iframe 렌더링 + 문단 클릭/호버 이벤트
  useEffect(() => {
    const iframe = originalIframeRef.current;
    if (!iframe || !originalHtml) return;
    
    console.log('🚀 원문 iframe 렌더링 시작...');
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(originalHtml);
        iframeDoc.close();
        
        // ⭐ 경계선 제거 CSS 주입
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
        
        // ⭐ 문단 클릭/호버 이벤트 추가 (원문 ↔ AI 초벌 번역 1:1 매칭)
        const paragraphs = iframeDoc.querySelectorAll('[data-paragraph-index]');
        console.log(`🔍 원문: ${paragraphs.length}개 문단 발견, 이벤트 리스너 등록 시작`);
        
        if (paragraphs.length === 0) {
          console.warn('⚠️ 원문에 data-paragraph-index를 가진 요소가 없습니다!');
        }
        
        paragraphs.forEach((para, idx) => {
          const element = para as HTMLElement;
          const indexAttr = element.getAttribute('data-paragraph-index');
          const index = parseInt(indexAttr || '0', 10);
          
          if (idx < 3) { // 처음 3개만 로그
            console.log(`📝 원문 문단 ${idx}: data-paragraph-index="${indexAttr}" → ${index}`);
          }
          
          // 호버 이벤트
          element.addEventListener('mouseenter', () => {
            console.log(`🖱️ [원문] 문단 ${index} 호버 시작`);
            setHighlightedParagraphIndex(index);
          });
          
          // 클릭 이벤트
          element.addEventListener('click', () => {
            console.log(`🖱️ [원문] 문단 ${index} 클릭`);
            setHighlightedParagraphIndex(index);
          });
        });
        
        console.log(`✅ 원문 iframe 렌더링 완료 (문단 ${paragraphs.length}개, 이벤트 등록 완료)`);
      } catch (error) {
        console.error('❌ 원문 iframe 오류:', error);
      }
    } else {
      console.error('❌ 원문 iframe document를 찾을 수 없습니다');
    }
  }, [originalHtml, collapsedPanels, fullscreenPanel]);

  // AI 초벌 번역 iframe 렌더링 + 문단 클릭/호버 이벤트
  useEffect(() => {
    const iframe = aiDraftIframeRef.current;
    if (!iframe || !aiDraftHtml) return;
    
    console.log('🚀 AI 초벌 iframe 렌더링 시작...');
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      try {
        iframeDoc.open();
        iframeDoc.write(aiDraftHtml);
        iframeDoc.close();
        
        // ⭐ 경계선 제거 CSS 주입
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
        
        // 편집 불가능하게 설정 (AI 초벌 번역은 읽기 전용)
        if (iframeDoc.body) {
          iframeDoc.body.style.cursor = 'default';
          iframeDoc.body.contentEditable = 'false';
          
          // 모든 요소를 편집 불가능하게 설정
          const allElements = iframeDoc.querySelectorAll('*');
          allElements.forEach(el => {
            (el as HTMLElement).contentEditable = 'false';
            (el as HTMLElement).style.userSelect = 'none';
            (el as HTMLElement).style.webkitUserSelect = 'none';
          });
        }
        
        // ⭐ 문단 클릭/호버 이벤트 추가 (원문 ↔ AI 초벌 번역 1:1 매칭)
        const paragraphs = iframeDoc.querySelectorAll('[data-paragraph-index]');
        console.log(`🔍 AI 초벌: ${paragraphs.length}개 문단 발견, 이벤트 리스너 등록 시작`);
        
        if (paragraphs.length === 0) {
          console.warn('⚠️ AI 초벌에 data-paragraph-index를 가진 요소가 없습니다!');
        }
        
        paragraphs.forEach((para, idx) => {
          const element = para as HTMLElement;
          const indexAttr = element.getAttribute('data-paragraph-index');
          const index = parseInt(indexAttr || '0', 10);
          
          if (idx < 3) { // 처음 3개만 로그
            console.log(`📝 AI 초벌 문단 ${idx}: data-paragraph-index="${indexAttr}" → ${index}`);
          }
          
          // 호버 이벤트
          element.addEventListener('mouseenter', () => {
            console.log(`🖱️ [AI 초벌] 문단 ${index} 호버 시작`);
            setHighlightedParagraphIndex(index);
          });
          
          // 클릭 이벤트
          element.addEventListener('click', () => {
            console.log(`🖱️ [AI 초벌] 문단 ${index} 클릭`);
            setHighlightedParagraphIndex(index);
          });
        });
        
        console.log(`✅ AI 초벌 번역 iframe 렌더링 완료 (문단 ${paragraphs.length}개, 이벤트 등록 완료)`);
      } catch (error) {
        console.error('❌ AI 초벌 iframe 오류:', error);
      }
    } else {
      console.error('❌ AI 초벌 iframe document를 찾을 수 없습니다');
    }
  }, [aiDraftHtml, collapsedPanels, fullscreenPanel]);

  // 스크롤 동기화 (iframe용)
  const syncScroll = useCallback((sourceIframe: HTMLIFrameElement, targetIframes: (HTMLIFrameElement | HTMLDivElement)[]) => {
    if (isScrollingRef.current) return;

    const sourceDoc = sourceIframe.contentDocument || sourceIframe.contentWindow?.document;
    if (!sourceDoc) return;

    isScrollingRef.current = true;
    const sourceBody = sourceDoc.body || sourceDoc.documentElement;
    const maxScroll = sourceBody.scrollHeight - sourceBody.clientHeight;
    const scrollRatio = maxScroll > 0 ? sourceBody.scrollTop / maxScroll : 0;

    targetIframes.forEach((target) => {
      if (target instanceof HTMLIFrameElement) {
        const targetDoc = target.contentDocument || target.contentWindow?.document;
        if (targetDoc) {
          const targetBody = targetDoc.body || targetDoc.documentElement;
          const targetMaxScroll = targetBody.scrollHeight - targetBody.clientHeight;
          if (targetMaxScroll > 0) {
            targetBody.scrollTop = scrollRatio * targetMaxScroll;
          }
        }
      } else {
        const targetMaxScroll = target.scrollHeight - target.clientHeight;
        if (targetMaxScroll > 0) {
          target.scrollTop = scrollRatio * targetMaxScroll;
        }
      }
    });

    // 현재 스크롤 위치의 문단 찾기
    const currentPara = getParagraphAtScrollPosition(sourceBody as HTMLElement, sourceBody.scrollTop);
    if (currentPara) {
      setHighlightedParagraphIndex(currentPara.index);
    }

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 50);
  }, []);

  const handleParagraphLeave = useCallback(() => {
    // 호버 해제 시 하이라이트 유지 (스크롤 위치 기반)
    // 필요시 null로 설정하여 하이라이트 제거 가능
  }, []);

  // 문단 하이라이트 및 완료 상태 동기화
  useEffect(() => {
    console.log(`🎨 하이라이트 상태 변경: ${highlightedParagraphIndex}`);
    
    const applyParagraphStyles = (panel: HTMLElement | null, panelName: string, isMyTranslation: boolean = false) => {
      if (!panel) return;
      clearAllHighlights(panel);
      
      const paragraphs = getParagraphs(panel);
      console.log(`📊 ${panelName}에서 ${paragraphs.length}개 문단 발견`);
      
      paragraphs.forEach((para) => {
        const isHighlighted = para.index === highlightedParagraphIndex;
        const isComplete = completedParagraphs.has(para.index);
        
        if (isHighlighted) {
          console.log(`✨ ${panelName} 문단 ${para.index} 하이라이트 적용`);
          highlightParagraph(para.element, true);
        }
        
        if (isComplete) {
          // 완료된 문단: 회색 배경색 적용
          para.element.style.backgroundColor = 'rgba(211, 211, 211, 0.3)'; // lightgray 배경
          para.element.style.opacity = '0.85';
          para.element.style.transition = 'background-color 0.2s ease, opacity 0.2s ease';
          // 취소선은 제거 (회색 배경만으로 충분)
          para.element.style.textDecoration = '';
          para.element.style.color = '';
        } else {
          para.element.style.backgroundColor = '';
          para.element.style.opacity = '';
          para.element.style.textDecoration = '';
          para.element.style.color = '';
        }
      });
    };

    // 원문 iframe 내부 문단 스타일 적용
    if (originalIframeRef.current?.contentDocument?.body) {
      applyParagraphStyles(originalIframeRef.current.contentDocument.body as HTMLElement, '원문');
    }
    
    // AI 초벌 번역 iframe 내부 문단 스타일 적용
    if (aiDraftIframeRef.current?.contentDocument?.body) {
      applyParagraphStyles(aiDraftIframeRef.current.contentDocument.body as HTMLElement, 'AI 초벌');
    }
    
    // 에디터 내부 문단 스타일 적용 (내 번역)
    if (myTranslationIframeRef.current?.contentDocument?.body) {
      applyParagraphStyles(myTranslationIframeRef.current.contentDocument.body as HTMLElement, '내 번역', true);
    }
  }, [highlightedParagraphIndex, completedParagraphs]);

  // 문단 완료 체크 토글
  const toggleParagraphComplete = useCallback((index: number) => {
    setCompletedParagraphs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
        console.log(`❌ 문단 ${index} 완료 해제`);
      } else {
        newSet.add(index);
        console.log(`✅ 문단 ${index} 완료 표시`);
      }
      
      // iframe 내부 UI 즉시 업데이트
      const iframe = myTranslationIframeRef.current;
      if (iframe) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const paraElement = iframeDoc.querySelector(`[data-paragraph-index="${index}"]`) as HTMLElement;
          if (paraElement) {
            if (newSet.has(index)) {
              paraElement.classList.add('completed');
            } else {
              paraElement.classList.remove('completed');
            }
          }
        }
      }
      
      // 진행률 업데이트 (전체 문단 수 대비 완료된 문단 수)
      const completedCount = newSet.size;
      setProgress((p) => {
        const newProgress = { ...p, completed: completedCount };
        const percentage = p.total > 0 ? Math.round((completedCount / p.total) * 100) : 0;
        console.log(`📊 진행률 업데이트: ${completedCount}/${p.total} (${percentage}%)`);
        return newProgress;
      });
      
      return newSet;
    });
  }, []);

  // 진행률 업데이트
  useEffect(() => {
    setProgress((prev) => ({ ...prev, completed: completedParagraphs.size }));
  }, [completedParagraphs]);

  // completedParagraphs 변경 시 iframe 내부 완료 상태 동기화
  useEffect(() => {
    const iframe = myTranslationIframeRef.current;
    if (!iframe) return;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    const paragraphs = iframeDoc.querySelectorAll('[data-paragraph-index]');
    paragraphs.forEach((para) => {
      const paraElement = para as HTMLElement;
      const index = parseInt(paraElement.getAttribute('data-paragraph-index') || '0', 10);
      
      if (completedParagraphs.has(index)) {
        paraElement.classList.add('completed');
      } else {
        paraElement.classList.remove('completed');
      }
    });
  }, [completedParagraphs]);



  const handleHandover = () => {
    setShowHandoverModal(true);
  };

  const confirmHandover = async () => {
    if (!documentId || !handoverMemo.trim()) {
      alert('남은 작업 메모를 입력해주세요.');
      return;
    }
    if (!savedTranslationHtml) {
      alert('저장할 번역 내용이 없습니다.');
      return;
    }

    try {
      setHandoverSubmitting(true);
      // 1. 현 지점으로 먼저 저장
      await translationWorkApi.saveTranslation(documentId, {
        content: savedTranslationHtml,
        completedParagraphs: Array.from(completedParagraphs),
      });
      // 2. 인계 요청
      await translationWorkApi.handover(documentId, {
        memo: handoverMemo.trim(),
        terms: handoverTerms.trim() || undefined,
      });
      alert('인계가 완료되었습니다.');
      navigate(fromPath);
    } catch (error: any) {
      alert('인계 실패: ' + (error.response?.data?.message || error.message));
    } finally {
      setHandoverSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!documentId || !savedTranslationHtml) return;

    if (!window.confirm('번역을 완료하시겠습니까? 완료 후 검토 대기 상태로 변경됩니다.')) {
      return;
    }

    try {
      await translationWorkApi.completeTranslation(documentId, {
        content: savedTranslationHtml,
        completedParagraphs: Array.from(completedParagraphs),
      });
      alert('번역이 완료되었습니다!');
      navigate(fromPath);
    } catch (error: any) {
      alert('완료 처리 실패: ' + (error.response?.data?.message || error.message));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: colors.primaryText }}>
        로딩 중...
      </div>
    );
  }

  // 에러가 있거나, 필수 데이터가 없으면 에러 화면 표시
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
          <Button variant="secondary" onClick={() => navigate(fromPath)}>
            목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const toggleAllPanels = () => {
    if (allPanelsCollapsed) {
      // 모든 패널 펼치기
      setCollapsedPanels(new Set());
    } else {
      // 모든 패널 접기
      setCollapsedPanels(new Set(['original', 'aiDraft', 'myTranslation']));
    }
    setAllPanelsCollapsed(!allPanelsCollapsed);
  };

  // 상태 텍스트 변환
  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      'DRAFT': '초안',
      'PENDING_TRANSLATION': '번역 대기',
      'IN_TRANSLATION': '번역 중',
      'PENDING_REVIEW': '검토 대기',
      'APPROVED': '승인됨',
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
            onClick={() => {
              // 저장되지 않은 변경사항이 있는지 확인
              const hasUnsavedChanges = savedTranslationHtml !== lastSavedHtml;
              
              if (hasUnsavedChanges) {
                const confirmed = window.confirm('⚠️ 저장되지 않은 변경사항이 있습니다. 정말 나가시겠습니까?');
                if (!confirmed) return;
              }
              
              navigate(fromPath);
            }} 
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
                {lockStatus?.lockedBy && (
                  <span style={{ fontSize: '11px', color: colors.secondaryText }}>
                    작업자: {lockStatus.lockedBy.name}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* 인계 메모 확인 버튼 (인계 정보가 있을 때만) */}
        {document?.latestHandover && (
          <Button
            variant="secondary"
            onClick={() => setShowHandoverInfoModal(true)}
            style={{ fontSize: '12px', padding: '6px 14px', color: '#FF6B00', borderColor: '#FF6B00', whiteSpace: 'nowrap' }}
          >
            📋 인계 메모 확인
          </Button>
        )}

        {/* 중앙: 문서 보기 옵션 (체크박스로 각 버전 표시/숨김) */}
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
              checked={!collapsedPanels.has('myTranslation')}
              onChange={() => togglePanel('myTranslation')}
              style={{ 
                cursor: 'pointer',
                width: '16px',
                height: '16px',
              }}
            />
            <span>내 번역 (작업 중)</span>
          </label>
          </div>

        {/* 오른쪽: 저장/완료 버튼 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            variant="secondary" 
            onClick={async () => {
              if (!documentId) {
                alert('⚠️ 문서 ID가 없습니다.');
                return;
              }
              
              try {
                // iframe에서 최신 HTML 가져오기
                const iframe = myTranslationIframeRef.current;
                let contentToSave = savedTranslationHtml;
                
                if (iframe) {
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (iframeDoc && iframeDoc.documentElement) {
                    contentToSave = iframeDoc.documentElement.outerHTML;
                    console.log('💾 iframe에서 최신 HTML 추출:', contentToSave.substring(0, 100) + '...');
                  }
                }
                
                // 서버에 저장
                await translationWorkApi.saveTranslation(
                  documentId,
                  {
                    content: contentToSave,
                    completedParagraphs: Array.from(completedParagraphs)
                  }
                );
                
                // 저장 후 상태 업데이트
                setSavedTranslationHtml(contentToSave);
                setLastSavedHtml(contentToSave);
                currentEditorHtmlRef.current = contentToSave;
                
                alert('✅ 저장되었습니다.');
              } catch (error) {
                console.error('저장 실패:', error);
                alert('⚠️ 저장에 실패했습니다.');
              }
            }} 
            style={{ fontSize: '12px' }}
          >
            💾 저장하기
          </Button>
          <Button variant="secondary" onClick={handleHandover} style={{ fontSize: '12px' }}>
            인계 요청
          </Button>
          <Button variant="primary" onClick={handleComplete} style={{ fontSize: '12px' }}>
            번역 완료
          </Button>
        </div>
      </div>

      {/* 3단 레이아웃 (STEP 5 스타일) */}
      <div style={{ display: 'flex', height: '100%', gap: '4px', padding: '4px' }}>
        {[
          { id: 'original', title: '원문', ref: originalIframeRef, editable: false, html: originalHtml },
          { id: 'aiDraft', title: 'AI 초벌 번역', ref: aiDraftIframeRef, editable: false, html: aiDraftHtml },
          { id: 'myTranslation', title: '내 번역', ref: myTranslationIframeRef, editable: true, html: savedTranslationHtml },
        ].map(panel => {
          const isCollapsed = collapsedPanels.has(panel.id);
          const isFullscreen = fullscreenPanel === panel.id;
          const visiblePanels = ['original', 'aiDraft', 'myTranslation'].filter(id => !collapsedPanels.has(id));
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
              {(
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
                  {panel.id === 'myTranslation' ? (
                    // 내 번역 패널 (iframe 기반 에디터 - HTML 구조 보존)
                    <>
                      {/* 편집 툴바 */}
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #C0C0C0', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', backgroundColor: '#F8F9FA', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* 모드 선택 */}
                          <Button
                            variant={editorMode === 'text' ? 'primary' : 'secondary'}
                            onClick={() => setEditorMode('text')}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            텍스트 편집
                          </Button>
                          <Button
                            variant={editorMode === 'component' ? 'primary' : 'secondary'}
                            onClick={() => setEditorMode('component')}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            컴포넌트 편집
                          </Button>
                          
                          
                          {/* Rich Text 기능 (텍스트 모드일 때만) */}
                          {editorMode === 'text' && (
                            <>
                              <div style={{ width: '1px', height: '20px', backgroundColor: '#C0C0C0', margin: '0 4px' }} />
                              <button
                                onClick={() => {
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
                                  if (iframeDoc && e.target.value) {
                                    const fontSize = e.target.value;
                                    const selection = iframeDoc.getSelection();
                                    
                                    // 선택된 텍스트가 있는지 확인
                                    if (selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
                                      const range = selection.getRangeAt(0);
                                      const selectedText = range.toString();
                                      
                                      // execCommand('insertHTML')을 사용하여 undo 스택에 기록
                                      // 이 방법이 가장 안정적으로 undo/redo를 지원함
                                      const spanHtml = `<span style="font-size: ${fontSize}pt;">${selectedText}</span>`;
                                      
                                      try {
                                        // insertHTML이 지원되는 브라우저
                                        iframeDoc.execCommand('insertHTML', false, spanHtml);
                                      } catch (err) {
                                        // insertHTML이 지원되지 않으면 수동으로 삽입
                                        // 하지만 이 경우 undo 스택에 기록되지 않을 수 있음
                                        range.deleteContents();
                                        const tempDiv = iframeDoc.createElement('div');
                                        tempDiv.innerHTML = spanHtml;
                                        const fragment = iframeDoc.createDocumentFragment();
                                        while (tempDiv.firstChild) {
                                          fragment.appendChild(tempDiv.firstChild);
                                        }
                                        range.insertNode(fragment);
                                        
                                        // 선택 영역을 새로 삽입된 span으로 이동
                                        range.setStartAfter(fragment.lastChild || range.startContainer);
                                        range.collapse(false);
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                      }
                                    } else {
                                      // 선택된 텍스트가 없으면 execCommand('fontSize') 사용
                                      // 다음 입력에 적용될 스타일 설정
                                      iframeDoc.execCommand('fontSize', false, '3');
                                      
                                      // 생성된 <font> 태그를 찾아서 변환
                                      setTimeout(() => {
                                        const fontSizeElements = iframeDoc.querySelectorAll('font[size="3"]');
                                        if (fontSizeElements.length > 0) {
                                          const lastElement = fontSizeElements[fontSizeElements.length - 1] as HTMLElement;
                                          lastElement.style.fontSize = `${fontSize}pt`;
                                          lastElement.removeAttribute('size');
                                          
                                          // <font>를 <span>으로 교체
                                          const span = iframeDoc.createElement('span');
                                          span.style.fontSize = `${fontSize}pt`;
                                          span.innerHTML = lastElement.innerHTML;
                                          
                                          if (lastElement.parentNode) {
                                            lastElement.parentNode.replaceChild(span, lastElement);
                                          }
                                        }
                                      }, 0);
                                    }
                                    
                                    e.target.value = ''; // 리셋
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
                                  if (iframeDoc && e.target.value) {
                                    const lineHeight = e.target.value;
                                    const selection = iframeDoc.getSelection();
                                    
                                    if (selection && selection.rangeCount > 0) {
                                      const range = selection.getRangeAt(0);
                                      
                                      // 블록 요소 찾기 (p, div, h1-h6, li 등)
                                      let blockElement: HTMLElement | null = null;
                                      
                                      if (range.commonAncestorContainer.nodeType === 1) {
                                        // Element 노드인 경우
                                        blockElement = (range.commonAncestorContainer as HTMLElement).closest('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
                                      } else {
                                        // Text 노드인 경우 부모 요소에서 찾기
                                        blockElement = range.commonAncestorContainer.parentElement?.closest('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre') || null;
                                      }
                                      
                                      if (blockElement) {
                                        // 블록 요소에 직접 line-height 스타일 적용
                                        // execCommand를 사용하여 undo 스택에 기록하기 위해
                                        // 블록 요소 전체를 선택하고 insertHTML로 교체
                                        try {
                                          // 선택 영역을 블록 요소 전체로 확장
                                          const blockRange = iframeDoc.createRange();
                                          blockRange.selectNodeContents(blockElement);
                                          selection.removeAllRanges();
                                          selection.addRange(blockRange);
                                          
                                          // 블록 요소의 HTML을 복사하여 line-height 적용
                                          const originalHtml = blockElement.innerHTML;
                                          const tagName = blockElement.tagName.toLowerCase();
                                          const newHtml = `<${tagName} style="line-height: ${lineHeight};">${originalHtml}</${tagName}>`;
                                          
                                          // insertHTML로 교체 (undo 스택에 기록됨)
                                          iframeDoc.execCommand('insertHTML', false, newHtml);
                                        } catch (err) {
                                          // insertHTML이 실패하면 직접 스타일 적용
                                          blockElement.style.lineHeight = lineHeight;
                                        }
                                      } else {
                                        // 블록 요소를 찾지 못한 경우, 현재 위치에 div 삽입
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
                                    
                                    e.target.value = ''; // 리셋
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                    const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                        const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                    // 같은 파일을 다시 선택할 수 있도록 리셋
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
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
                                  if (iframeDoc) {
                                    // 코드 블록 삽입
                                    try {
                                      iframeDoc.execCommand('insertHTML', false, '<pre style="background-color: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto;"><code></code></pre>');
                                    } catch (err) {
                                      // insertHTML이 지원되지 않으면 formatBlock 사용
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
                                        const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                        const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                        const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                        const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                                        const iframeDoc = myTranslationIframeRef.current?.contentDocument;
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
                              if (!myTranslationIframeRef.current) return;
                              const iframeDoc = myTranslationIframeRef.current.contentDocument;
                              if (!iframeDoc) return;
                              
                              if (editorMode === 'text') {
                                // ⭐ 버튼 클릭 시 focus를 iframe body로 이동 (execCommand가 작동하려면 필요)
                                iframeDoc.body.setAttribute('tabindex', '-1');
                                iframeDoc.body.focus();
                                
                                iframeDoc.execCommand('undo', false);
                                const updatedHtml = iframeDoc.documentElement.outerHTML;
                                currentEditorHtmlRef.current = updatedHtml;
                                // ⭐ setSavedTranslationHtml 제거 - Step 5와 동일하게 useEffect 재트리거 방지
                                console.log('↩️ Undo (TranslationWork 텍스트 - 버튼)');
                              } else {
                                if (undoStackRef.current.length > 0) {
                                  const previousHtml = undoStackRef.current.pop()!;
                                  redoStackRef.current.push(currentEditorHtmlRef.current);
                                  currentEditorHtmlRef.current = previousHtml;
                                  iframeDoc.open();
                                  iframeDoc.write(previousHtml);
                                  iframeDoc.close();
                                  setSavedTranslationHtml(previousHtml);
                                  
                                  // ⭐ savedTranslationHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
                                  // iframe에 포커스를 주어 키보드 이벤트가 계속 작동하도록 함
                                  setTimeout(() => {
                                    const newIframeDoc = myTranslationIframeRef.current?.contentDocument || myTranslationIframeRef.current?.contentWindow?.document;
                                    if (newIframeDoc?.body) {
                                      newIframeDoc.body.setAttribute('tabindex', '-1');
                                      newIframeDoc.body.focus();
                                    }
                                  }, 50);
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
                              if (!myTranslationIframeRef.current) return;
                              const iframeDoc = myTranslationIframeRef.current.contentDocument;
                              if (!iframeDoc) return;
                              
                              if (editorMode === 'text') {
                                // ⭐ 버튼 클릭 시 focus를 iframe body로 이동 (execCommand가 작동하려면 필요)
                                iframeDoc.body.setAttribute('tabindex', '-1');
                                iframeDoc.body.focus();
                                
                                iframeDoc.execCommand('redo', false);
                                const updatedHtml = iframeDoc.documentElement.outerHTML;
                                currentEditorHtmlRef.current = updatedHtml;
                                // ⭐ setSavedTranslationHtml 제거 - Step 5와 동일하게 useEffect 재트리거 방지
                                console.log('↪️ Redo (TranslationWork 텍스트 - 버튼)');
                              } else {
                                if (redoStackRef.current.length > 0) {
                                  const nextHtml = redoStackRef.current.pop()!;
                                  undoStackRef.current.push(currentEditorHtmlRef.current);
                                  currentEditorHtmlRef.current = nextHtml;
                                  iframeDoc.open();
                                  iframeDoc.write(nextHtml);
                                  iframeDoc.close();
                                  setSavedTranslationHtml(nextHtml);
                                  
                                  // ⭐ savedTranslationHtml 의존성 배열에 추가되어 useEffect가 자동으로 재실행됨
                                  // iframe에 포커스를 주어 키보드 이벤트가 계속 작동하도록 함
                                  setTimeout(() => {
                                    const newIframeDoc = myTranslationIframeRef.current?.contentDocument || myTranslationIframeRef.current?.contentWindow?.document;
                                    if (newIframeDoc?.body) {
                                      newIframeDoc.body.setAttribute('tabindex', '-1');
                                      newIframeDoc.body.focus();
                                    }
                                  }, 50);
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
                          
                          {/* 컴포넌트 편집 모드 */}
                          {editorMode === 'component' && selectedElements.length > 0 && (
                            <>
                              <span style={{ fontSize: '11px', color: '#696969', marginRight: '4px' }}>
                                {selectedElements.length}개 선택됨
                              </span>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  if (!myTranslationIframeRef.current) return;
                                  const iframeDoc = myTranslationIframeRef.current.contentDocument;
                                  if (!iframeDoc) return;

                                  // 선택된 요소들의 선택 상태 제거
                                  selectedElements.forEach(el => {
                                    el.classList.remove('component-selected');
                                    el.style.outline = '';
                                    el.style.boxShadow = '';
                                    el.style.backgroundColor = '';
                                    el.style.outlineOffset = '';
                                  });
                                  setSelectedElements([]);
                                  console.log('🔄 전체 선택 취소:', selectedElements.length, '개');
                                }}
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                              >
                                선택 취소
                              </Button>
                              <Button
                                variant="primary"
                                onClick={() => {
                                  if (!myTranslationIframeRef.current) return;
                                  const iframeDoc = myTranslationIframeRef.current.contentDocument;
                                  if (!iframeDoc) return;

                                  // Undo Stack에 현재 상태 저장
                                  undoStackRef.current.push(currentEditorHtmlRef.current);
                                  redoStackRef.current = [];

                                  // 선택된 요소 삭제
                                  selectedElements.forEach(el => el.remove());
                                  setSelectedElements([]);

                                  // 변경된 HTML 저장
                                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                                  currentEditorHtmlRef.current = updatedHtml;
                                  setSavedTranslationHtml(updatedHtml);
                                  console.log('🗑️ 선택된 요소 삭제:', selectedElements.length, '개');
                                  
                                  // ⭐ 삭제 후 iframe에 포커스를 주어 키보드 단축키가 바로 작동하도록 함
                                  setTimeout(() => {
                                    // body에 tabIndex 설정하여 포커스 가능하게 만들기
                                    if (iframeDoc.body) {
                                      iframeDoc.body.setAttribute('tabindex', '-1');
                                      iframeDoc.body.focus();
                                    }
                                    if (myTranslationIframeRef.current?.contentWindow) {
                                      myTranslationIframeRef.current.contentWindow.focus();
                                    }
                                    myTranslationIframeRef.current?.focus();
                                    console.log('🎯 TranslationWork iframe에 포커스 설정');
                                  }, 100);
                                }}
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                              >
                                삭제
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {/* iframe 에디터 */}
                      <iframe
                        ref={myTranslationIframeRef}
                        srcDoc={savedTranslationHtml}
                        style={{
                          flex: 1,
                          width: '100%',
                          border: 'none',
                          backgroundColor: '#FFFFFF',
                        }}
                        title="내 번역 에디터"
                        onLoad={() => {
                          const iframe = myTranslationIframeRef.current;
                          if (!iframe) return;
                          
                          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (!iframeDoc || !iframeDoc.body) return;

                          try {
                            // body를 편집 가능하게 설정
                            iframeDoc.body.contentEditable = 'true';
                            iframeDoc.body.style.padding = '16px';
                            iframeDoc.body.style.wordWrap = 'break-word';
                            
                            // 편집 시 자동 저장 (debounce)
                            let saveTimeout: NodeJS.Timeout;
                            const handleInput = () => {
                              clearTimeout(saveTimeout);
                              saveTimeout = setTimeout(() => {
                                if (iframeDoc.documentElement) {
                                  const updatedHtml = iframeDoc.documentElement.outerHTML;
                                  currentEditorHtmlRef.current = updatedHtml;
                                  console.log('📝 편집 내용 임시 저장됨 (메모리)');
                                }
                              }, 500);
                            };
                            
                            iframeDoc.body.addEventListener('input', handleInput);
                            
                            if (!hasRenderedMyTranslation.current) {
                              hasRenderedMyTranslation.current = true;
                              setIsTranslationEditorInitialized(true);
                            }
                            
                            console.log(`✅ 내 번역 iframe 설정 완료 (문단 ${paragraphs.length}개, 완료 표시 기능 활성화)`);
                          } catch (error) {
                            console.error('내 번역 iframe 설정 실패:', error);
                          }
                        }}
                      />
                    </>
                  ) : (
                    // 원문 / AI 초벌 번역 패널 (iframe)
                    panel.html ? (
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
                        {panel.id === 'original' ? '원문이 없습니다.' : 'AI 초벌 번역이 없습니다.'}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 인계 메모 확인 모달 */}
      {showHandoverInfoModal && document?.latestHandover && (() => {
        const h = document.latestHandover!;
        return (
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
            onClick={() => setShowHandoverInfoModal(false)}
          >
            <div
              style={{ backgroundColor: colors.surface, padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '90vw', border: `1px solid ${colors.border}`, maxHeight: '80vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', color: '#000000' }}>
                📋 이전 번역자 인계 메모
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                {h.handedOverBy && (
                  <div>
                    <span style={{ fontSize: '12px', color: colors.secondaryText, display: 'block', marginBottom: '4px' }}>인계자</span>
                    <span style={{ fontSize: '13px', color: '#000000' }}>{h.handedOverBy.name}</span>
                  </div>
                )}
                {h.handedOverAt && (
                  <div>
                    <span style={{ fontSize: '12px', color: colors.secondaryText, display: 'block', marginBottom: '4px' }}>인계 시각</span>
                    <span style={{ fontSize: '13px', color: '#000000' }}>{new Date(h.handedOverAt).toLocaleString('ko-KR')}</span>
                  </div>
                )}
                <div>
                  <span style={{ fontSize: '12px', color: colors.secondaryText, display: 'block', marginBottom: '6px' }}>남은 작업 메모</span>
                  <div style={{ fontSize: '13px', color: '#000000', whiteSpace: 'pre-wrap', lineHeight: '1.6', padding: '10px', backgroundColor: '#FFF9EC', border: '1px solid #FFE082', borderRadius: '4px' }}>
                    {h.memo}
                  </div>
                </div>
                {h.terms && (
                  <div>
                    <span style={{ fontSize: '12px', color: colors.secondaryText, display: 'block', marginBottom: '6px' }}>주의 용어/표현</span>
                    <div style={{ fontSize: '13px', color: '#000000', whiteSpace: 'pre-wrap', lineHeight: '1.6', padding: '10px', backgroundColor: '#FFF9EC', border: '1px solid #FFE082', borderRadius: '4px' }}>
                      {h.terms}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowHandoverInfoModal(false)} style={{ fontSize: '12px' }}>
                  닫기
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 인계 요청 모달 */}
      {showHandoverModal && (
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
          onClick={() => setShowHandoverModal(false)}
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
              인계 요청
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: colors.primaryText }}>
                남은 작업 메모 *
              </label>
              <textarea
                value={handoverMemo}
                onChange={(e) => setHandoverMemo(e.target.value)}
                placeholder="예: 15-30번 문단 남음, 전문 용어 주의 필요"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: colors.primaryText }}>
                주의 용어/표현 메모 (선택)
              </label>
              <textarea
                value={handoverTerms}
                onChange={(e) => setHandoverTerms(e.target.value)}
                placeholder="예: 'API'는 그대로 유지, '서버'는 'server'로 표기"
                style={{
                  width: '100%',
                  minHeight: '60px',
                  padding: '8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowHandoverModal(false);
                  setHandoverMemo('');
                  setHandoverTerms('');
                }}
                style={{ fontSize: '12px' }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={confirmHandover}
                disabled={handoverSubmitting}
                style={{ fontSize: '12px' }}
              >
                {handoverSubmitting ? '처리 중...' : '인계 요청'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 링크 편집 모달 */}
      {showLinkModal && editingLink && (
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
          onClick={() => {
            setShowLinkModal(false);
            setEditingLink(null);
            setLinkUrl('');
          }}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              padding: '24px',
              borderRadius: '8px',
              width: '400px',
              maxWidth: '90vw',
              border: `1px solid ${colors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              링크 편집
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: colors.primaryText }}>
                URL
              </label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const iframeDoc = myTranslationIframeRef.current?.contentDocument;
                    if (iframeDoc && editingLink && linkUrl.trim()) {
                      // execCommand를 사용하여 링크 URL 업데이트 (undo 스택에 기록)
                      const selection = iframeDoc.getSelection();
                      if (selection) {
                        const range = iframeDoc.createRange();
                        range.selectNodeContents(editingLink);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        
                        // 기존 링크 삭제 후 새 링크 생성
                        iframeDoc.execCommand('unlink', false);
                        iframeDoc.execCommand('createLink', false, linkUrl.trim());
                      }
                    }
                    setShowLinkModal(false);
                    setEditingLink(null);
                    setLinkUrl('');
                  }
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowLinkModal(false);
                  setEditingLink(null);
                  setLinkUrl('');
                }}
                style={{ fontSize: '12px' }}
              >
                취소
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
                  if (iframeDoc && editingLink) {
                    // execCommand를 사용하여 링크 삭제 (undo 스택에 기록)
                    const selection = iframeDoc.getSelection();
                    if (selection) {
                      const range = iframeDoc.createRange();
                      range.selectNodeContents(editingLink);
                      selection.removeAllRanges();
                      selection.addRange(range);
                      iframeDoc.execCommand('unlink', false);
                    }
                  }
                  setShowLinkModal(false);
                  setEditingLink(null);
                  setLinkUrl('');
                }}
                style={{ fontSize: '12px', color: '#dc3545', borderColor: '#dc3545' }}
              >
                삭제
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
                  if (iframeDoc && editingLink && linkUrl.trim()) {
                    // execCommand를 사용하여 링크 URL 업데이트 (undo 스택에 기록)
                    const selection = iframeDoc.getSelection();
                    if (selection) {
                      const range = iframeDoc.createRange();
                      range.selectNodeContents(editingLink);
                      selection.removeAllRanges();
                      selection.addRange(range);
                      
                      // 기존 링크 삭제 후 새 링크 생성
                      iframeDoc.execCommand('unlink', false);
                      iframeDoc.execCommand('createLink', false, linkUrl.trim());
                    }
                  }
                  setShowLinkModal(false);
                  setEditingLink(null);
                  setLinkUrl('');
                }}
                style={{ fontSize: '12px' }}
              >
                저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

