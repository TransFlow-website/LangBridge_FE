import { useState, useEffect, useRef } from 'react'
import './Translation.css'
import { translationApi } from '../services/api'

function Translation() {
  const [mode, setMode] = useState('url')
  
  // 텍스트 번역용 state
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  
  // URL 번역용 state
  const [url, setUrl] = useState('')
  const [urlResult, setUrlResult] = useState(null)
  const iframeRef = useRef(null)
  const [editedHtml, setEditedHtml] = useState('')
  
  // 영역 선택 모드
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [originalPageLoaded, setOriginalPageLoaded] = useState(false)
  const [selectedElements, setSelectedElements] = useState([]) // 여러 영역 선택
  
  // 공통 state
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('ko')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const languages = [
    { code: 'auto', name: '자동 감지' },
    { code: 'ko', name: '한국어', deepl: 'KO' },
    { code: 'en', name: 'English', deepl: 'EN' },
    { code: 'ja', name: '日本語', deepl: 'JA' },
    { code: 'zh', name: '中文', deepl: 'ZH' },
    { code: 'es', name: 'Español', deepl: 'ES' },
    { code: 'fr', name: 'Français', deepl: 'FR' },
    { code: 'de', name: 'Deutsch', deepl: 'DE' },
    { code: 'it', name: 'Italiano', deepl: 'IT' },
    { code: 'pt', name: 'Português', deepl: 'PT' },
  ]

  // DeepL API는 대문자 코드를 사용
  const getDeepLLangCode = (code) => {
    if (code === 'auto') return ''
    const lang = languages.find(l => l.code === code)
    return lang?.deepl || code.toUpperCase()
  }

  const handleTextTranslate = async () => {
    if (!sourceText.trim()) return

    setIsLoading(true)
    setError(null)
    
    // TODO: 텍스트 번역 API 구현 (현재는 데모)
    setTimeout(() => {
      setTranslatedText(`[번역됨] ${sourceText}`)
      setIsLoading(false)
    }, 1000)
  }

  // URL 입력 및 원본 페이지 로드 (자동으로 영역 선택 모드 활성화)
  const handleLoadUrl = async () => {
    if (!url.trim()) {
      setError('URL을 입력해주세요.')
      return
    }

    // URL 유효성 검사
    try {
      new URL(url)
    } catch {
      setError('올바른 URL 형식이 아닙니다. (예: https://example.com)')
      return
    }

    setIsLoading(true)
    setError(null)
    setUrlResult(null)
    setOriginalPageLoaded(false)
    setIsSelectionMode(false) // 먼저 비활성화
    setSelectedElements([]) // 선택된 영역 초기화

    try {
      // 원본 HTML만 가져오기 (번역 없이)
      const response = await translationApi.translateWebPage({
        url: url.trim(),
        targetLang: 'NONE', // 번역하지 않음을 나타내는 특수 값
        sourceLang: undefined,
      })

      if (response.success) {
        console.log('원본 페이지 로드 성공:', {
          hasOriginalHtml: !!response.originalHtml,
          originalHtmlLength: response.originalHtml?.length,
          hasCss: !!response.css,
          cssLength: response.css?.length
        })
        
        // 원본 HTML만 설정 (번역된 HTML은 없음)
        setUrlResult({
          ...response,
          translatedHtml: undefined, // 번역된 HTML 제거
        })
        setOriginalPageLoaded(true)
        setIsSelectionMode(true) // URL 로드 후 자동으로 영역 선택 모드 활성화
      } else {
        setError(response.errorMessage || '페이지 로드 중 오류가 발생했습니다.')
      }
    } catch (err) {
      console.error('Page load error:', err)
      setError(
        err.response?.data?.errorMessage || 
        err.message || 
        '서버와 통신할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.'
      )
    } finally {
      setIsLoading(false)
    }
  }



  const swapLanguages = () => {
    if (sourceLang === 'auto') return // 자동 감지는 교환 불가
    const temp = sourceLang
    setSourceLang(targetLang)
    setTargetLang(temp)
    
    if (mode === 'text') {
      setSourceText(translatedText)
      setTranslatedText(sourceText)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    alert('클립보드에 복사되었습니다!')
  }

  // 텍스트 포맷팅 함수들
  const formatText = (command, value) => {
    const iframe = iframeRef.current
    const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document
    
    if (iframeDoc) {
      iframeDoc.execCommand(command, false, value)
      // 변경사항 저장
      const updatedHtml = iframeDoc.documentElement.outerHTML
      setEditedHtml(updatedHtml)
    }
  }

  // iframe에 HTML 렌더링 및 영역 선택/편집 가능하게 만들기
  useEffect(() => {
    console.log('useEffect 실행:', {
      hasIframe: !!iframeRef.current,
      hasUrlResult: !!urlResult,
      hasOriginalHtml: !!urlResult?.originalHtml,
      hasTranslatedHtml: !!urlResult?.translatedHtml,
      isSelectionMode,
      originalPageLoaded
    })
    
    if (iframeRef.current && urlResult) {
      const iframe = iframeRef.current
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      
      if (iframeDoc) {
        // 단계별로 HTML 선택:
        // 1. 번역된 HTML이 있으면 번역된 것 사용 (번역 완료 후)
        // 2. 원본 페이지 로드 모드면 원본 HTML 사용 (영역 선택용)
        // 3. 그 외에는 원본 HTML 사용
        let htmlContent = ''
        if (urlResult.translatedHtml && !isSelectionMode) {
          // 번역 완료 후 편집 모드
          htmlContent = urlResult.translatedHtml
          console.log('번역된 HTML 사용')
        } else if (originalPageLoaded && urlResult.originalHtml) {
          // 원본 페이지 로드 (영역 선택 모드)
          htmlContent = urlResult.originalHtml
          console.log('원본 HTML 사용 (영역 선택 모드), 길이:', htmlContent.length)
        } else if (urlResult.originalHtml) {
          // 기본값: 원본 HTML
          htmlContent = urlResult.originalHtml
          console.log('원본 HTML 사용 (기본값), 길이:', htmlContent.length)
        } else {
          console.error('HTML 콘텐츠가 없습니다!')
          return
        }
        
        // HTML이 완전한 문서 구조인지 확인
        const hasDoctype = htmlContent.trim().toLowerCase().startsWith('<!doctype')
        const hasHtml = htmlContent.includes('<html')
        const hasBody = htmlContent.includes('<body')
        
        // 완전한 HTML 문서 구조가 아니면 감싸기
        if (!hasDoctype || !hasHtml || !hasBody) {
          console.log('HTML이 완전한 문서 구조가 아님. 감싸는 중...', { hasDoctype, hasHtml, hasBody })
          
          // body 내용만 있는 경우
          if (htmlContent.includes('<body')) {
            // body 태그는 이미 있으므로 그대로 사용
          } else {
            // body 태그가 없으면 body로 감싸기
            htmlContent = `<body>${htmlContent}</body>`
          }
          
          // html 태그가 없으면 html로 감싸기
          if (!htmlContent.includes('<html')) {
            htmlContent = `<html>${htmlContent}</html>`
          }
          
          // head 태그 추가
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', '<html><head></head>')
          }
          
          // DOCTYPE 추가
          if (!hasDoctype) {
            htmlContent = `<!DOCTYPE html>${htmlContent}`
          }
        }
        
        // CSS를 <style> 태그로 추가
        if (urlResult.css) {
          const cssTag = `<style id="transflow-css">\n${urlResult.css}\n</style>`
          if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
          } else if (htmlContent.includes('<html')) {
            // head가 없으면 head 추가
            htmlContent = htmlContent.replace('<html>', `<html><head>${cssTag}</head>`)
          } else {
            htmlContent = cssTag + '\n' + htmlContent
          }
        }
        
        // 편집 가능하도록 스타일 추가
        const editStyle = `
          <style id="transflow-editor-style">
            body {
              -webkit-user-select: text !important;
              user-select: text !important;
              cursor: text !important;
            }
            [contenteditable="true"] {
              outline: 2px dashed #667eea !important;
              outline-offset: 2px;
              min-height: 1em;
            }
            [contenteditable="true"]:focus {
              outline: 3px solid #667eea !important;
              background-color: rgba(102, 126, 234, 0.05) !important;
            }
          </style>
        `
        if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', `${editStyle}\n</head>`)
        } else if (htmlContent.includes('<html')) {
          // head가 없으면 head 추가
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', `<html><head>${editStyle}</head>`)
          } else {
            htmlContent = htmlContent.replace('<head>', `<head>${editStyle}`)
          }
        }
        
        console.log('최종 HTML 구조:', htmlContent.substring(0, 500))
        
        iframeDoc.open()
        iframeDoc.write(htmlContent)
        iframeDoc.close()
        
        // 원본 페이지 로드 후 영역 선택 모드 활성화
        // iframe이 완전히 로드될 때까지 대기
        const checkAndEnableSelection = () => {
          if (iframeDoc.body && iframeDoc.body.children.length > 0) {
            if (isSelectionMode && originalPageLoaded) {
              // 영역 선택 모드: 요소 하이라이트 및 선택
              console.log('영역 선택 모드 활성화 시도...')
              enableElementSelection(iframeDoc)
            } else if (urlResult.translatedHtml) {
              // 편집 모드: 텍스트 편집 가능
              enableTextEditing(iframeDoc)
            }
          } else {
            // 아직 로드되지 않았으면 다시 시도
            setTimeout(checkAndEnableSelection, 100)
          }
        }
        
        // 초기 대기 후 체크 시작
        setTimeout(checkAndEnableSelection, 300)
      }
    }
  }, [urlResult, isSelectionMode, originalPageLoaded])
  
  // 영역 선택 모드 활성화 (여러 영역 선택 가능)
  const enableElementSelection = (iframeDoc) => {
    console.log('=== 영역 선택 모드 활성화 시작 ===')
    console.log('isSelectionMode:', isSelectionMode)
    console.log('originalPageLoaded:', originalPageLoaded)
    
    // 기존 스타일 제거
    const existingStyle = iframeDoc.getElementById('transflow-selection-style')
    if (existingStyle) {
      existingStyle.remove()
    }
    
    // 더 직관적인 하이라이트 스타일 추가
    const style = iframeDoc.createElement('style')
    style.id = 'transflow-selection-style'
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
    `
    iframeDoc.head.appendChild(style)
    
    let highlightedElement = null
    
    // 선택된 요소 업데이트 함수
    const updateSelectedElements = () => {
      const newSelected = []
      iframeDoc.querySelectorAll('.transflow-selected').forEach((el) => {
        const elementId = el.getAttribute('data-transflow-id')
        if (elementId) {
          newSelected.push({
            html: el.outerHTML,
            id: elementId
          })
        }
      })
      setSelectedElements(newSelected)
      console.log('✅ 선택된 요소 업데이트:', newSelected.length, '개')
    }
    
    // 마우스 오버 시 하이라이트
    const handleMouseOver = (e) => {
      const target = e.target
      if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return
      if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return
      
      if (highlightedElement && highlightedElement !== target) {
        highlightedElement.classList.remove('transflow-hovering')
      }
      if (!target.classList.contains('transflow-selected')) {
        target.classList.add('transflow-hovering')
        highlightedElement = target
      }
    }
    
    // 마우스 아웃 시 하이라이트 제거
    const handleMouseOut = (e) => {
      const target = e.target
      if (target && !target.classList.contains('transflow-selected')) {
        target.classList.remove('transflow-hovering')
      }
    }
    
    // 클릭 시 요소 선택/해제 (토글)
    const handleClick = (e) => {
      console.log('🖱️ 클릭 이벤트 발생!')
      
      const target = e.target
      console.log('클릭된 요소:', {
        tagName: target?.tagName,
        className: target?.className,
        isBody: target === iframeDoc.body,
        isDocumentElement: target === iframeDoc.documentElement
      })
      
      if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) {
        console.log('❌ 클릭 무시: body 또는 documentElement')
        return
      }
      
      if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') {
        console.log('❌ 클릭 무시: 스크립트/스타일 태그')
        return
      }
      
      // preventDefault는 제거 (실제 클릭이 작동하도록)
      e.stopPropagation()
      
      // 요소에 고유 ID 부여
      let elementId = target.getAttribute('data-transflow-id')
      if (!elementId) {
        elementId = `transflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        target.setAttribute('data-transflow-id', elementId)
      }
      
      // 선택 토글
      if (target.classList.contains('transflow-selected')) {
        target.classList.remove('transflow-selected')
        console.log('🔴 선택 해제:', elementId)
      } else {
        target.classList.add('transflow-selected')
        console.log('🟢 선택 추가:', elementId, target.tagName)
      }
      
      target.classList.remove('transflow-hovering')
      highlightedElement = null
      
      updateSelectedElements()
    }
    
    // ⚡ 최적화: 이벤트 위임 사용 (body에만 리스너 추가)
    // 모든 요소에 개별 리스너를 추가하는 대신 body에서 이벤트 위임 사용
    if (iframeDoc.body) {
      // mouseover 이벤트 위임
      iframeDoc.body.addEventListener('mouseover', (e) => {
        const target = e.target
        if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return
        if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return
        handleMouseOver(e)
      }, true)
      
      // mouseout 이벤트 위임
      iframeDoc.body.addEventListener('mouseout', (e) => {
        const target = e.target
        if (target && !target.classList.contains('transflow-selected')) {
          handleMouseOut(e)
        }
      }, true)
      
      // click 이벤트 위임
      iframeDoc.body.addEventListener('click', (e) => {
        const target = e.target
        if (!target || target === iframeDoc.body || target === iframeDoc.documentElement) return
        if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') return
        handleClick(e)
      }, true)
      
      console.log('✅ 이벤트 위임으로 메모리 최적화 완료 (body에만 리스너 추가)')
    }
    
    // MutationObserver는 제거 (이벤트 위임으로 자동 처리됨)
    
    console.log('✅ 영역 선택 모드 활성화 완료!')
  }
  
  // 텍스트 편집 모드 활성화
  const enableTextEditing = (iframeDoc) => {
    // 모든 텍스트 요소를 편집 가능하게
    const editableElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button, article, section, header, footer, main, aside')
    
    editableElements.forEach((el) => {
      if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) {
        el.contentEditable = 'true'
        el.style.cursor = 'text'
      }
    })
    
    // 스크립트, 스타일 태그는 편집 불가능하게
    const scripts = iframeDoc.querySelectorAll('script, style, noscript')
    scripts.forEach((el) => {
      el.contentEditable = 'false'
    })
    
    // ⚡ 최적화: input 이벤트 디바운스 (메모리 사용 감소)
    let inputTimeoutId = null
    iframeDoc.body.addEventListener('input', () => {
      // 기존 타이머 취소
      if (inputTimeoutId) {
        clearTimeout(inputTimeoutId)
      }
      
      // 500ms 후에 HTML 추출 (디바운스)
      inputTimeoutId = setTimeout(() => {
        const updatedHtml = iframeDoc.documentElement.outerHTML
        setEditedHtml(updatedHtml)
        inputTimeoutId = null
      }, 500)
    })
    
    console.log('텍스트 편집 모드 활성화!')
  }
  
  // 선택된 영역들 번역 (여러 영역을 한 번에)
  const handleTranslateSelectedAreas = async () => {
    if (selectedElements.length === 0) {
      alert('번역할 영역을 먼저 선택해주세요.\n\n원하는 영역을 클릭하여 선택하세요. (여러 영역 선택 가능)')
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      const iframe = iframeRef.current
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document
      
      if (!iframeDoc || !urlResult?.originalHtml) {
        setError('원본 페이지를 불러올 수 없습니다.')
        setIsLoading(false)
        return
      }
      
      // 선택된 영역들의 HTML을 합치기 (각 영역을 div로 감싸서 구분)
      const combinedHtml = selectedElements.map((sel, index) => {
        return `<div data-transflow-translated-index="${index}" class="transflow-translated-section">${sel.html}</div>`
      }).join('\n')
      
      // 선택된 영역들 번역
      const response = await translationApi.translateHtml({
        html: combinedHtml,
        targetLang: getDeepLLangCode(targetLang),
        sourceLang: sourceLang === 'auto' ? undefined : getDeepLLangCode(sourceLang),
      })
      
      if (response.success && response.translatedHtml) {
        // 번역된 HTML 파싱
        const parser = new DOMParser()
        const translatedDoc = parser.parseFromString(response.translatedHtml, 'text/html')
        const translatedSections = translatedDoc.querySelectorAll('[data-transflow-translated-index]')
        
        // 1단계: 선택된 영역들을 번역된 내용으로 교체 (원본 구조 유지)
        const selectedElementIds = new Set()
        selectedElements.forEach((selected, index) => {
          const translatedSection = translatedSections[index]
          if (translatedSection) {
            // iframe에서 원본 요소 찾기
            const originalElement = iframeDoc.querySelector(`[data-transflow-id="${selected.id}"]`)
            if (originalElement) {
              // 원본 요소의 모든 속성과 스타일 보존
              const originalAttributes = {}
              
              // 모든 속성 복사 (data-transflow-id, class, style 제외 - 나중에 별도 처리)
              Array.from(originalElement.attributes).forEach(attr => {
                if (attr.name !== 'data-transflow-id' && attr.name !== 'class' && attr.name !== 'style') {
                  originalAttributes[attr.name] = attr.value
                }
              })
              
              // 클래스 복사 (transflow- 관련 클래스 제외)
              const originalClasses = Array.from(originalElement.classList).filter(c => !c.startsWith('transflow-'))
              
              // 인라인 스타일 복사
              const originalStyle = originalElement.getAttribute('style') || ''
              
              // 번역된 내용만 가져오기 (내부 HTML)
              const translatedContent = translatedSection.innerHTML
              
              // 원본 요소의 구조를 유지하면서 내용만 교체
              originalElement.innerHTML = translatedContent
              
              // 속성 복원
              Object.entries(originalAttributes).forEach(([key, value]) => {
                originalElement.setAttribute(key, value)
              })
              
              // 클래스 복원
              if (originalClasses.length > 0) {
                originalElement.className = originalClasses.join(' ')
              }
              
              // 스타일 복원
              if (originalStyle) {
                originalElement.setAttribute('style', originalStyle)
              }
              
              // 선택 표시 제거
              originalElement.classList.remove('transflow-selected', 'transflow-hovering')
              originalElement.removeAttribute('data-transflow-id') // 번역 후 ID 제거
              
              selectedElementIds.add(selected.id)
            }
          }
        })
        
        // 2단계: 선택되지 않은 모든 요소 제거 (스마트하게 - 부모 구조 유지)
        const removeUnselectedElements = (element) => {
          // 이 요소가 선택된 요소인지 확인
          if (element.hasAttribute('data-transflow-id')) {
            const elementId = element.getAttribute('data-transflow-id')
            if (elementId && selectedElementIds.has(elementId)) {
              return true // 선택된 요소는 유지
            }
          }
          
          // 자식 요소들 먼저 확인
          const children = Array.from(element.children)
          const childrenToKeep = []
          
          children.forEach(child => {
            if (removeUnselectedElements(child)) {
              childrenToKeep.push(child)
            }
          })
          
          // 선택된 자식이 있으면 이 요소는 유지 (부모 구조 보존)
          if (childrenToKeep.length > 0) {
            // 선택되지 않은 직접 자식만 제거
            const allChildren = Array.from(element.children)
            allChildren.forEach(child => {
              if (!childrenToKeep.includes(child)) {
                element.removeChild(child)
              }
            })
            return true
          }
          
          // 선택된 요소가 아니고 선택된 자식도 없으면 제거
          return false
        }
        
        // body부터 시작하여 선택되지 않은 요소 제거
        if (iframeDoc.body) {
          const bodyChildren = Array.from(iframeDoc.body.children)
          const bodyChildrenToKeep = []
          
          bodyChildren.forEach(child => {
            if (removeUnselectedElements(child)) {
              bodyChildrenToKeep.push(child)
            }
          })
          
          // 선택된 요소가 없는 body 자식 제거
          const allBodyChildren = Array.from(iframeDoc.body.children)
          allBodyChildren.forEach(child => {
            if (!bodyChildrenToKeep.includes(child)) {
              iframeDoc.body.removeChild(child)
            }
          })
        }
        
        // 3단계: 최종 HTML 가져오기
        const finalHtml = iframeDoc.documentElement.outerHTML
        
        // 번역된 HTML로 결과 업데이트
        setUrlResult({
          ...urlResult,
          translatedHtml: finalHtml,
          css: urlResult.css, // 기존 CSS 완전히 유지
        })
        setEditedHtml(finalHtml)
        setIsSelectionMode(false) // 선택 모드 종료
        setSelectedElements([]) // 선택 초기화
        
        // 편집 모드로 전환
        setTimeout(() => {
          if (iframeDoc.body) {
            enableTextEditing(iframeDoc)
          }
        }, 200)
      } else {
        setError(response.errorMessage || '번역 중 오류가 발생했습니다.')
      }
    } catch (err) {
      console.error('Translation error:', err)
      setError(
        err.response?.data?.errorMessage || 
        err.message || 
        '서버와 통신할 수 없습니다.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  // 저장 함수
  const handleSave = () => {
    const iframe = iframeRef.current
    const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document
    
    if (iframeDoc && urlResult) {
      const currentHtml = iframeDoc.documentElement.outerHTML
        .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
      
      setEditedHtml(currentHtml)
      setUrlResult({
        ...urlResult,
        translatedHtml: currentHtml
      })
      alert('✅ 저장되었습니다!')
    }
  }

  return (
    <div className="translation-container">
      <header className="translation-header">
        <h1>TransFlow</h1>
        <p className="subtitle">웹페이지와 텍스트를 번역하세요</p>
      </header>

      <div className="translation-main">
        {/* 모드 선택 탭 */}
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'url' ? 'active' : ''}`}
            onClick={() => {
              setMode('url')
              setError(null)
            }}
          >
            🌐 웹페이지 번역
          </button>
          <button
            className={`mode-tab ${mode === 'text' ? 'active' : ''}`}
            onClick={() => {
              setMode('text')
              setError(null)
            }}
          >
            📝 텍스트 번역
          </button>
        </div>

        {/* 언어 선택 */}
        <div className="language-selector">
          <select 
            value={sourceLang} 
            onChange={(e) => setSourceLang(e.target.value)}
            className="lang-select"
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>

          <button 
            onClick={swapLanguages}
            className="swap-button"
            aria-label="언어 교환"
            disabled={sourceLang === 'auto'}
            title={sourceLang === 'auto' ? '자동 감지 모드에서는 교환할 수 없습니다' : '언어 교환'}
          >
            ⇄
          </button>

          <select 
            value={targetLang} 
            onChange={(e) => setTargetLang(e.target.value)}
            className="lang-select"
          >
            {languages.filter(l => l.code !== 'auto').map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* 오류 메시지 */}
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {/* URL 번역 모드 */}
        {mode === 'url' && (
          <div className="url-translation">
            {/* 프로세스 단계 표시 */}
            <div style={{ 
              marginBottom: '1rem', 
              padding: '1rem', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              border: '1px solid #e0e0e0'
            }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  color: originalPageLoaded ? '#28a745' : '#666',
                  fontWeight: originalPageLoaded ? 'bold' : 'normal'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>1️⃣</span>
                  <span>URL 입력</span>
                  {originalPageLoaded && <span style={{ fontSize: '0.8rem' }}>✓</span>}
                </div>
                <div style={{ fontSize: '1.2rem', color: '#ccc' }}>→</div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  color: isSelectionMode ? '#667eea' : '#666',
                  fontWeight: isSelectionMode ? 'bold' : 'normal'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>2️⃣</span>
                  <span>영역 선택</span>
                  {selectedElements.length > 0 && (
                    <span style={{ 
                      fontSize: '0.8rem', 
                      backgroundColor: '#28a745', 
                      color: 'white',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px'
                    }}>
                      {selectedElements.length}개 선택됨
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.2rem', color: '#ccc' }}>→</div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  color: urlResult?.translatedHtml ? '#28a745' : '#666',
                  fontWeight: urlResult?.translatedHtml ? 'bold' : 'normal'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>3️⃣</span>
                  <span>번역 및 편집</span>
                </div>
              </div>
            </div>

            <div className="url-input-section">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="번역할 웹페이지 URL을 입력하세요 (예: https://example.com)"
                className="url-input"
                onKeyPress={(e) => e.key === 'Enter' && handleLoadUrl()}
              />
              <button 
                onClick={handleLoadUrl}
                disabled={!url.trim() || isLoading}
                className="translate-button"
              >
                {isLoading ? '로딩 중...' : '📥 URL 입력'}
              </button>
            </div>

            {/* 영역 선택 모드일 때 안내 및 번역 버튼 */}
            {isSelectionMode && originalPageLoaded && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                border: '2px solid #2196f3'
              }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#1976d2' }}>
                  📍 영역 선택 모드
                </p>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#555' }}>
                  원하는 영역을 클릭하여 선택하세요. 여러 영역을 선택할 수 있습니다. (다시 클릭하면 선택 해제)
                </p>
                {selectedElements.length > 0 && (
                  <button 
                    onClick={handleTranslateSelectedAreas}
                    disabled={isLoading}
                    className="translate-button"
                    style={{ 
                      backgroundColor: '#28a745', 
                      color: 'white',
                      fontSize: '1.1rem',
                      padding: '0.75rem 1.5rem'
                    }}
                  >
                    {isLoading ? '번역 중...' : `✅ 선택한 ${selectedElements.length}개 영역 번역하기`}
                  </button>
                )}
              </div>
            )}

            {isLoading && (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>{isSelectionMode ? '웹페이지를 로드하는 중입니다...' : '웹페이지를 크롤링하고 번역하는 중입니다...'}</p>
                <p className="loading-tip">⏱️ 페이지 크기에 따라 시간이 걸릴 수 있습니다.</p>
              </div>
            )}

            {urlResult && !isLoading && (
              <div className="url-result">
                {/* 원본 HTML이 있으면 iframe으로 표시 (영역 선택 모드 또는 번역 완료 후) */}
                {urlResult.originalHtml ? (
                  <div className="html-result" style={{ width: '100%' }}>
                    {/* 포맷팅 툴바 */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1rem 1.5rem',
                      backgroundColor: '#f8f9fa',
                      border: '2px solid #e0e0e0',
                      borderRadius: '8px 8px 0 0',
                      borderBottom: 'none',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#333' }}>
                          {urlResult.translatedHtml ? '✨ 번역된 웹페이지' : '🌐 원본 웹페이지'}
                        </h3>
                        {urlResult.translatedHtml && urlResult.sourceLang && urlResult.targetLang && (
                          <span style={{ fontSize: '0.9rem', color: '#666', alignSelf: 'center' }}>
                            {urlResult.sourceLang} → {urlResult.targetLang}
                          </span>
                        )}
                        {originalPageLoaded && !urlResult.translatedHtml && (
                          <span style={{ fontSize: '0.9rem', color: '#666', alignSelf: 'center' }}>
                            영역을 선택하세요
                          </span>
                        )}
                      </div>
                      
                      {/* 포맷팅 버튼들 (번역 완료 후에만 표시) */}
                      {urlResult.translatedHtml && (
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => formatText('bold')}
                            style={{ padding: '0.5rem', fontSize: '1.2rem', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'white' }}
                            title="볼드"
                          >
                            <strong>B</strong>
                          </button>
                          <button
                            onClick={() => formatText('italic')}
                            style={{ padding: '0.5rem', fontSize: '1.2rem', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'white', fontStyle: 'italic' }}
                            title="이탤릭"
                          >
                            I
                          </button>
                          <button
                            onClick={() => formatText('underline')}
                            style={{ padding: '0.5rem', fontSize: '1.2rem', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'white', textDecoration: 'underline' }}
                            title="밑줄"
                          >
                            U
                          </button>
                          <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd', margin: '0 0.25rem' }} />
                          <select
                            onChange={(e) => formatText('fontSize', e.target.value)}
                            style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'white' }}
                            title="글자 크기"
                          >
                            <option value="">크기</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                            <option value="7">7</option>
                          </select>
                          <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd', margin: '0 0.25rem' }} />
                          <button
                            onClick={handleSave}
                            style={{
                              padding: '0.5rem 1rem',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              backgroundColor: '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            💾 저장
                          </button>
                          <button
                            onClick={() => {
                              const iframe = iframeRef.current
                              const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document
                              if (iframeDoc && urlResult) {
                                let htmlContent = editedHtml || urlResult.translatedHtml || ''
                                if (urlResult.css) {
                                  const cssTag = `<style id="transflow-css">\n${urlResult.css}\n</style>`
                                  if (htmlContent.includes('</head>')) {
                                    htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
                                  } else if (htmlContent.includes('<html')) {
                                    htmlContent = htmlContent.replace('<html', `${cssTag}\n<html`)
                                  }
                                }
                                const blob = new Blob([htmlContent], { type: 'text/html' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `translated-${new Date().getTime()}.html`
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                                URL.revokeObjectURL(url)
                              }
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              backgroundColor: '#667eea',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            📥 다운로드
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* 편집 안내 (번역 완료 후에만 표시) */}
                    {urlResult.translatedHtml && (
                      <div style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#e3f2fd',
                        border: '1px solid #90caf9',
                        borderTop: 'none',
                        fontSize: '0.9rem',
                        color: '#1976d2'
                      }}>
                        ✏️ 텍스트를 클릭하여 편집하세요 (지우고 새로 쓸 수 있습니다) | 포맷팅 버튼으로 볼드, 이탤릭, 글자 크기 조정 가능
                      </div>
                    )}
                    
                    <div style={{
                      width: '100%',
                      height: '85vh',
                      minHeight: '700px',
                      border: '2px solid #667eea',
                      borderRadius: '0 0 8px 8px',
                      overflow: 'hidden',
                      backgroundColor: 'white'
                    }}>
                      <iframe
                        ref={iframeRef}
                        title="Translated Web Page"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        sandbox="allow-same-origin allow-scripts"
                      />
                    </div>
                  </div>
                ) : (
                  /* 텍스트만 있는 경우 (하위 호환성) */
                  <>
                    <div className="result-section">
                      <div className="result-header">
                        <h3>📄 원본 텍스트</h3>
                        <button 
                          onClick={() => copyToClipboard(urlResult.originalText || '')}
                          className="copy-button"
                          title="복사"
                        >
                          📋 복사
                        </button>
                      </div>
                      <div className="result-content original">
                        <p className="result-meta">
                          🔗 {urlResult.originalUrl}
                          {urlResult.sourceLang && <span> | 언어: {urlResult.sourceLang}</span>}
                        </p>
                        <div className="result-text">{urlResult.originalText}</div>
                      </div>
                    </div>

                    <div className="result-divider">
                      <span>⬇️</span>
                    </div>

                    <div className="result-section">
                      <div className="result-header">
                        <h3>✨ 번역된 텍스트</h3>
                        <button 
                          onClick={() => copyToClipboard(urlResult.translatedText || '')}
                          className="copy-button"
                          title="복사"
                        >
                          📋 복사
                        </button>
                      </div>
                      <div className="result-content translated">
                        <p className="result-meta">
                          언어: {urlResult.targetLang}
                        </p>
                        <div className="result-text">{urlResult.translatedText}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 텍스트 번역 모드 */}
        {mode === 'text' && (
          <div className="text-translation">
            <div className="translation-boxes">
              <div className="text-box">
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="번역할 텍스트를 입력하세요..."
                  className="text-input"
                />
                <div className="text-info">
                  {sourceText.length} / 5000
                </div>
              </div>

              <div className="text-box">
                <div className="text-output">
                  {isLoading ? (
                    <div className="loading">번역 중...</div>
                  ) : (
                    translatedText || '번역 결과가 여기에 표시됩니다'
                  )}
                </div>
              </div>
            </div>

            <button 
              onClick={handleTextTranslate}
              disabled={!sourceText.trim() || isLoading}
              className="translate-button"
            >
              {isLoading ? '번역 중...' : '번역하기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Translation
