import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import './TranslationWork.css';

export default function TranslationWork() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const [handoverMemo, setHandoverMemo] = useState('');
  const [handoverTerms, setHandoverTerms] = useState('');

  // 패널 접기/전체화면 상태
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);

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
              handleParagraphHover(index);
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
  }, [savedTranslationHtml, collapsedPanels, fullscreenPanel, isTranslationEditorInitialized]);

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
      console.log('📝 텍스트 편집 모드 활성화');

      // ⭐ 텍스트 편집 모드: 경계선 완전 제거
      const textModeStyle = iframeDoc.createElement('style');
      textModeStyle.id = 'text-mode-styles';
      textModeStyle.textContent = `
        * {
          border: none !important;
          outline: none !important;
        }
      `;
      iframeDoc.head.appendChild(textModeStyle);

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

      // Cmd+Z (Mac) / Ctrl+Z (Windows) 지원
      const handleKeydown = (e: KeyboardEvent) => {
        // Cmd+Z (Mac) 또는 Ctrl+Z (Windows) - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('undo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          setSavedTranslationHtml(updatedHtml);
          console.log('↩️ Undo');
        }
        // Cmd+Shift+Z (Mac) 또는 Ctrl+Y (Windows) - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          iframeDoc.execCommand('redo', false);
          const updatedHtml = iframeDoc.documentElement.outerHTML;
          setSavedTranslationHtml(updatedHtml);
          console.log('↪️ Redo');
        }
      };
      // capture 단계에서 이벤트 잡기
      iframeDoc.addEventListener('keydown', handleKeydown, true);
      
      // 부모 window에서도 이벤트 잡기 (맥 시스템 단축키 방지)
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }, true);

      // 변경 사항 추적
      const handleInput = () => {
        const updatedHtml = iframeDoc.documentElement.outerHTML;
        setSavedTranslationHtml(updatedHtml);
      };
      iframeDoc.body.addEventListener('input', handleInput);

    } else if (editorMode === 'component') {
      // 컴포넌트 편집 모드
      console.log('🧩 컴포넌트 편집 모드 활성화');

      // contentEditable 비활성화
      const allEditableElements = iframeDoc.querySelectorAll('[contenteditable]');
      allEditableElements.forEach(el => {
        (el as HTMLElement).contentEditable = 'false';
      });

      // 스타일 주입 (선택 가능한 요소 표시) - 컴포넌트 편집 모드에만 경계선 표시
      const style = iframeDoc.createElement('style');
      style.id = 'editor-styles';
      style.textContent = `
        div[data-component-editable], section[data-component-editable], article[data-component-editable],
        header[data-component-editable], footer[data-component-editable], main[data-component-editable],
        aside[data-component-editable], nav[data-component-editable], ul[data-component-editable],
        ol[data-component-editable], table[data-component-editable], figure[data-component-editable],
        blockquote[data-component-editable], form[data-component-editable] {
          border: 1px dashed rgba(169, 169, 169, 0.5) !important;
          cursor: pointer !important;
          transition: border 150ms !important;
        }
        div[data-component-editable]:hover, section[data-component-editable]:hover,
        article[data-component-editable]:hover, header[data-component-editable]:hover,
        footer[data-component-editable]:hover, main[data-component-editable]:hover,
        aside[data-component-editable]:hover, nav[data-component-editable]:hover,
        ul[data-component-editable]:hover, ol[data-component-editable]:hover,
        table[data-component-editable]:hover, figure[data-component-editable]:hover,
        blockquote[data-component-editable]:hover, form[data-component-editable]:hover {
          border-color: rgba(105, 105, 105, 0.8) !important;
          background-color: rgba(169, 169, 169, 0.05) !important;
        }
        [data-component-selected="true"] {
          border: 2px solid rgba(105, 105, 105, 1) !important;
          background-color: rgba(169, 169, 169, 0.1) !important;
          box-shadow: none !important;
          position: relative !important;
        }
        [data-component-selected="true"]::after {
          content: '✓ 선택됨';
          position: absolute;
          top: -20px;
          right: 0;
          background: #696969;
          color: white;
          padding: 2px 6px;
          font-size: 11px;
          border-radius: 3px;
          z-index: 1000;
        }
      `;
      iframeDoc.head.appendChild(style);

      // 편집 가능한 요소에 data-component-editable 속성 추가
      const editableComponents = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, ul, ol, table, figure, blockquote, form');
      editableComponents.forEach(el => {
        (el as HTMLElement).setAttribute('data-component-editable', 'true');
      });

      // 클릭 이벤트 (다중 선택 지원)
      const handleComponentClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const editableEl = target.closest('[data-component-editable]') as HTMLElement;
        if (!editableEl) return;

        e.preventDefault();
        e.stopPropagation();

        const isSelected = editableEl.getAttribute('data-component-selected') === 'true';
        
        if (isSelected) {
          // 이미 선택된 요소 클릭 → 선택 해제 (토글)
          editableEl.removeAttribute('data-component-selected');
          setSelectedElements(prev => prev.filter(el => el !== editableEl));
          console.log('🔴 선택 해제:', editableEl.tagName);
        } else {
          // 선택되지 않은 요소 클릭 → 선택 추가
          editableEl.setAttribute('data-component-selected', 'true');
          setSelectedElements(prev => [...prev, editableEl]);
          console.log('🟢 선택 추가:', editableEl.tagName);
        }
      };
      iframeDoc.body.addEventListener('click', handleComponentClick, true);

      // Cmd+Z / Ctrl+Z - Custom Undo Stack
      const handleKeydown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (undoStackRef.current.length > 0) {
            const previousHtml = undoStackRef.current.pop()!;
            redoStackRef.current.push(currentEditorHtmlRef.current);
            currentEditorHtmlRef.current = previousHtml;
            // iframe 재렌더링
            iframeDoc.open();
            iframeDoc.write(previousHtml);
            iframeDoc.close();
            setSavedTranslationHtml(previousHtml);
            console.log('↩️ Undo (Component)');
          }
        }
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (redoStackRef.current.length > 0) {
            const nextHtml = redoStackRef.current.pop()!;
            undoStackRef.current.push(currentEditorHtmlRef.current);
            currentEditorHtmlRef.current = nextHtml;
            // iframe 재렌더링
            iframeDoc.open();
            iframeDoc.write(nextHtml);
            iframeDoc.close();
            setSavedTranslationHtml(nextHtml);
            console.log('↪️ Redo (Component)');
          }
        }
      };
      iframeDoc.addEventListener('keydown', handleKeydown, true);
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }, true);
    }
  }, [editorMode, isTranslationEditorInitialized, collapsedPanels, fullscreenPanel]);

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
    
    const applyParagraphStyles = (panel: HTMLElement | null, panelName: string) => {
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
          para.element.style.opacity = '0.7';
          para.element.style.textDecoration = 'line-through';
          para.element.style.color = colors.secondaryText;
        } else {
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
    
    // 에디터 내부 문단 스타일 적용
    if (myTranslationIframeRef.current?.contentDocument?.body) {
      applyParagraphStyles(myTranslationIframeRef.current.contentDocument.body as HTMLElement, '내 번역');
    }
  }, [highlightedParagraphIndex, completedParagraphs]);

  // 문단 완료 체크 토글
  const toggleParagraphComplete = useCallback((index: number) => {
    setCompletedParagraphs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      setProgress((p) => ({ ...p, completed: newSet.size }));
      return newSet;
    });
  }, []);

  // 진행률 업데이트
  useEffect(() => {
    setProgress((prev) => ({ ...prev, completed: completedParagraphs.size }));
  }, [completedParagraphs]);

  const handleHandover = () => {
    setShowHandoverModal(true);
  };

  const confirmHandover = async () => {
    if (!documentId || !handoverMemo.trim()) {
      alert('남은 작업 메모를 입력해주세요.');
      return;
    }

    try {
      await translationWorkApi.handover(documentId, {
        memo: handoverMemo.trim(),
        terms: handoverTerms.trim() || undefined,
        completedParagraphs: Array.from(completedParagraphs),
      });
      alert('인계가 완료되었습니다.');
      navigate('/translations/pending');
    } catch (error: any) {
      alert('인계 실패: ' + (error.response?.data?.message || error.message));
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
      navigate('/translations/pending');
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
          <Button variant="secondary" onClick={() => navigate('/translations/pending')}>
            목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button 
            variant="secondary" 
            onClick={() => {
              // 저장되지 않은 변경사항이 있는지 확인
              const hasUnsavedChanges = savedTranslationHtml !== lastSavedHtml;
              
              if (hasUnsavedChanges) {
                const confirmed = window.confirm('⚠️ 저장되지 않은 변경사항이 있습니다. 정말 나가시겠습니까?');
                if (!confirmed) return;
              }
              
              navigate('/translations/pending');
            }} 
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            ← 뒤로가기
          </Button>
          {lockStatus?.locked && lockStatus.canEdit && (
            <div
              style={{
                padding: '4px 12px',
                backgroundColor: '#C0C0C0',
                color: '#000000',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              🔒 현재 당신이 이 문서를 번역 중입니다
            </div>
          )}
          <div style={{ fontSize: '13px', color: colors.primaryText }}>
            진행률: {progress.completed}/{progress.total} 문단 완료 (
            {progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}%)
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            variant="secondary" 
            onClick={async () => {
              if (!documentId) {
                alert('⚠️ 문서 ID가 없습니다.');
                return;
              }
              
              try {
                await translationWorkApi.saveTranslation(
                  documentId,
                  {
                    content: savedTranslationHtml,
                    completedParagraphs: Array.from(completedParagraphs)
                  }
                );
                setLastSavedHtml(savedTranslationHtml); // 저장 후 lastSavedHtml 업데이트
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
                  {panel.id === 'myTranslation' ? (
                    // 내 번역 패널 (iframe 기반 에디터 - HTML 구조 보존)
                    <>
                      {/* 편집 툴바 */}
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #C0C0C0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
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
                                    iframeDoc.execCommand('fontSize', false, e.target.value);
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
                                title="글자 크기"
                              >
                                <option value="">크기</option>
                                <option value="1">매우 작게</option>
                                <option value="2">작게</option>
                                <option value="3">보통</option>
                                <option value="4">크게</option>
                                <option value="5">매우 크게</option>
                                <option value="6">특대</option>
                                <option value="7">초특대</option>
                              </select>
                              <input
                                type="color"
                                onChange={(e) => {
                                  const iframeDoc = myTranslationIframeRef.current?.contentDocument;
                                  if (iframeDoc) iframeDoc.execCommand('foreColor', false, e.target.value);
                                }}
                                style={{
                                  width: '30px',
                                  height: '26px',
                                  border: '1px solid #A9A9A9',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                }}
                                title="글자 색상"
                              />
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
                                }}
                                title="왼쪽 정렬"
                              >
                                ◀
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
                                }}
                                title="가운데 정렬"
                              >
                                ▣
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
                                }}
                                title="오른쪽 정렬"
                              >
                                ▶
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
                                }}
                                title="글머리 기호 목록"
                              >
                                • 목록
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
                                }}
                                title="번호 매기기 목록"
                              >
                                1. 목록
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
                                }}
                                title="링크 삽입"
                              >
                                🔗
                              </button>
                            </>
                          )}
                          
                          {/* 컴포넌트 편집 모드 */}
                          {editorMode === 'component' && selectedElements.length > 0 && (
                            <Button
                              variant="secondary"
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
                                
                                // ⭐ 삭제 후 컴포넌트 편집 모드 재활성화 (이벤트 리스너 재등록)
                                setEditorMode('text');
                                setTimeout(() => setEditorMode('component'), 0);
                              }}
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                            >
                              삭제 ({selectedElements.length})
                            </Button>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => {
                              if (!myTranslationIframeRef.current) return;
                              const iframeDoc = myTranslationIframeRef.current.contentDocument;
                              if (!iframeDoc) return;
                              
                              if (editorMode === 'text') {
                                iframeDoc.execCommand('undo', false);
                              } else {
                                if (undoStackRef.current.length > 0) {
                                  const previousHtml = undoStackRef.current.pop()!;
                                  redoStackRef.current.push(currentEditorHtmlRef.current);
                                  currentEditorHtmlRef.current = previousHtml;
                                  iframeDoc.open();
                                  iframeDoc.write(previousHtml);
                                  iframeDoc.close();
                                  setSavedTranslationHtml(previousHtml);
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
                            }}
                            title="Undo (Ctrl/Cmd+Z)"
                          >
                            ↩️
                          </button>
                          <button
                            onClick={() => {
                              if (!myTranslationIframeRef.current) return;
                              const iframeDoc = myTranslationIframeRef.current.contentDocument;
                              if (!iframeDoc) return;
                              
                              if (editorMode === 'text') {
                                iframeDoc.execCommand('redo', false);
                              } else {
                                if (redoStackRef.current.length > 0) {
                                  const nextHtml = redoStackRef.current.pop()!;
                                  undoStackRef.current.push(currentEditorHtmlRef.current);
                                  currentEditorHtmlRef.current = nextHtml;
                                  iframeDoc.open();
                                  iframeDoc.write(nextHtml);
                                  iframeDoc.close();
                                  setSavedTranslationHtml(nextHtml);
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
                            }}
                            title="Redo (Ctrl/Cmd+Y)"
                          >
                            ↪️
                          </button>
                        </div>
                      </div>
                      {/* iframe 에디터 */}
                      <iframe
                        ref={myTranslationIframeRef}
                        style={{
                          flex: 1,
                          width: '100%',
                          border: 'none',
                          backgroundColor: '#FFFFFF',
                        }}
                        title="내 번역 에디터"
                      />
                    </>
                  ) : (
                    // 원문 / AI 초벌 번역 패널 (iframe)
                    panel.html ? (
                      <iframe
                        ref={panel.ref as React.RefObject<HTMLIFrameElement>}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          backgroundColor: '#FFFFFF',
                        }}
                        onLoad={() => {
                          const iframe = panel.ref.current as HTMLIFrameElement;
                          if (iframe) {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {
                              // 스크롤 이벤트 리스너 추가
                              const iframeBody = iframeDoc.body || iframeDoc.documentElement;
                              iframeBody.addEventListener('scroll', () => {
                                const otherIframes = [
                                  panel.id === 'original' ? null : originalIframeRef.current,
                                  panel.id === 'aiDraft' ? null : aiDraftIframeRef.current,
                                  panel.id === 'myTranslation' ? null : myTranslationIframeRef.current,
                                ].filter(Boolean) as HTMLIFrameElement[];
                                syncScroll(iframe, otherIframes);
                              });
                            }
                          }
                        }}
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
                완료한 문단 범위 *
              </label>
              <div style={{ fontSize: '12px', color: colors.secondaryText, marginBottom: '8px' }}>
                완료된 문단: {completedParagraphs.size}개 / 전체: {progress.total}개
              </div>
            </div>

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
                style={{ fontSize: '12px' }}
              >
                인계 요청
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

