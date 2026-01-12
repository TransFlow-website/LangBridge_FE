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
  const originalIframeRef = useRef(null) // 원본 페이지용 iframe
  const translatedIframeRef = useRef(null) // 번역본 페이지용 iframe
  const [editedHtml, setEditedHtml] = useState('')
  const [editedOriginalHtml, setEditedOriginalHtml] = useState('') // 편집된 원본 HTML
  
  // 영역 선택 모드
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [originalPageLoaded, setOriginalPageLoaded] = useState(false)
  const [selectedElements, setSelectedElements] = useState([]) // 여러 영역 선택
  const [isPreEditMode, setIsPreEditMode] = useState(false) // 번역 전 원본 편집 모드
  const [isComparisonMode, setIsComparisonMode] = useState(false) // 번역 후 비교 편집 모드
  const [fullscreenMode, setFullscreenMode] = useState(null) // 'original' | 'translated' | null
  
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
    setIsPreEditMode(false) // 원본 편집 모드 초기화
    setIsComparisonMode(false) // 비교 모드 초기화
    setEditedOriginalHtml('') // 편집된 원본 HTML 초기화

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
    // 원본 편집 모드: editedOriginalHtml 렌더링
    if (isPreEditMode && editedOriginalHtml && iframeRef.current) {
      const iframe = iframeRef.current
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      
      if (iframeDoc) {
        let htmlContent = editedOriginalHtml
        
        // HTML 구조 확인 및 보완
        const hasDoctype = htmlContent.trim().toLowerCase().startsWith('<!doctype')
        const hasHtml = htmlContent.includes('<html')
        const hasBody = htmlContent.includes('<body')
        
        if (!hasDoctype || !hasHtml || !hasBody) {
          if (!htmlContent.includes('<body')) {
            htmlContent = `<body>${htmlContent}</body>`
          }
          if (!htmlContent.includes('<html')) {
            htmlContent = `<html>${htmlContent}</html>`
          }
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', '<html><head></head>')
          }
          if (!hasDoctype) {
            htmlContent = `<!DOCTYPE html>${htmlContent}`
          }
        }
        
        // CSS 추가
        if (urlResult?.css) {
          const cssTag = `<style id="transflow-css">\n${urlResult.css}\n</style>`
          if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
          } else if (htmlContent.includes('<html')) {
            htmlContent = htmlContent.replace('<html>', `<html><head>${cssTag}</head>`)
          }
        }
        
        // 편집 스타일 추가
        const editStyle = `
          <style id="transflow-editor-style">
            body {
              -webkit-user-select: text !important;
              user-select: text !important;
              cursor: text !important;
              overflow-x: auto !important;
              overflow-y: auto !important;
            }
            [contenteditable="true"] {
              outline: 2px dashed #ff9800 !important;
              outline-offset: 2px;
              min-height: 1em;
            }
            [contenteditable="true"]:focus {
              outline: 3px solid #ff9800 !important;
              background-color: rgba(255, 152, 0, 0.05) !important;
            }
          </style>
        `
        if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', `${editStyle}\n</head>`)
        } else if (htmlContent.includes('<html')) {
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', `<html><head>${editStyle}</head>`)
          } else {
            htmlContent = htmlContent.replace('<head>', `<head>${editStyle}`)
          }
        }
        
        iframeDoc.open()
        iframeDoc.write(htmlContent)
        iframeDoc.close()
        
        setTimeout(() => {
          if (iframeDoc.body) {
            enableTextEditing(iframeDoc)
            // 편집 내용 추적
            iframeDoc.body.addEventListener('input', () => {
              const updatedHtml = iframeDoc.documentElement.outerHTML
              setEditedOriginalHtml(updatedHtml)
            })
          }
        }, 200)
      }
      return
    }
    
    // 비교 모드: 원본과 번역본 각각 렌더링 (전체화면 모드 포함)
    if (isComparisonMode && urlResult) {
      // 원본 iframe 렌더링 (전체화면 모드에서도 렌더링)
      if (originalIframeRef.current && editedOriginalHtml && (fullscreenMode === 'original' || !fullscreenMode)) {
        const originalIframe = originalIframeRef.current
        const originalDoc = originalIframe.contentDocument || originalIframe.contentWindow?.document
        
        if (originalDoc) {
          // 전체화면 모드로 전환할 때는 항상 렌더링 (내용 보존)
          const hasContent = originalDoc.body && originalDoc.body.children.length > 0
          const isFullscreenOriginal = fullscreenMode === 'original'
          
          // 전체화면 모드로 전환하거나 내용이 없을 때 렌더링
          if (!hasContent || isFullscreenOriginal) {
            // 전체화면 모드로 전환하는 경우 현재 내용을 가져와서 보존
            let htmlToRender = editedOriginalHtml
            if (isFullscreenOriginal && hasContent) {
              // 현재 iframe의 내용을 가져와서 사용
              htmlToRender = originalDoc.documentElement.outerHTML
                .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
                .replace(/<style id="transflow-css">[\s\S]*?<\/style>/g, '')
            }
            
            let htmlContent = htmlToRender
            // HTML 구조 보완
            if (!htmlContent.includes('<html')) {
              htmlContent = `<!DOCTYPE html><html><head></head><body>${htmlContent}</body></html>`
            }
            
            if (urlResult.css) {
              const cssTag = `<style id="transflow-css">\n${urlResult.css}\n</style>`
              if (htmlContent.includes('</head>')) {
                htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
              }
            }
            
            const editStyle = `
            <style id="transflow-editor-style">
              body { 
                -webkit-user-select: text !important; 
                user-select: text !important; 
                cursor: text !important;
                overflow-x: auto !important;
                overflow-y: auto !important;
              }
              [contenteditable="true"] { 
                outline: 2px dashed #2196f3 !important; 
                outline-offset: 2px; 
              }
              [contenteditable="true"]:focus {
                outline: 3px solid #2196f3 !important;
              }
            </style>
          `
            if (htmlContent.includes('</head>')) {
              htmlContent = htmlContent.replace('</head>', `${editStyle}\n</head>`)
            }
            
            originalDoc.open()
            originalDoc.write(htmlContent)
            originalDoc.close()
            
            setTimeout(() => {
              if (originalDoc.body) {
                enableTextEditing(originalDoc)
              }
            }, 200)
          }
        }
      }
      
      // 번역본 iframe 렌더링 (전체화면 모드에서도 렌더링)
      if (translatedIframeRef.current && urlResult.translatedHtml && (fullscreenMode === 'translated' || !fullscreenMode)) {
        const translatedIframe = translatedIframeRef.current
        const translatedDoc = translatedIframe.contentDocument || translatedIframe.contentWindow?.document
        
        if (translatedDoc) {
          // 전체화면 모드로 전환할 때는 항상 렌더링 (내용 보존)
          const hasContent = translatedDoc.body && translatedDoc.body.children.length > 0
          const isFullscreenTranslated = fullscreenMode === 'translated'
          
          // 전체화면 모드로 전환하거나 내용이 없을 때 렌더링
          if (!hasContent || isFullscreenTranslated) {
            // 전체화면 모드로 전환하는 경우 현재 내용을 가져와서 보존
            let htmlToRender = editedHtml || urlResult.translatedHtml
            if (isFullscreenTranslated && hasContent) {
              // 현재 iframe의 내용을 가져와서 사용
              htmlToRender = translatedDoc.documentElement.outerHTML
                .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
                .replace(/<style id="transflow-css">[\s\S]*?<\/style>/g, '')
            }
            
            let htmlContent = htmlToRender
            
            if (!htmlContent.includes('<html')) {
              htmlContent = `<!DOCTYPE html><html><head></head><body>${htmlContent}</body></html>`
            }
            
            if (urlResult.css) {
              const cssTag = `<style id="transflow-css">\n${urlResult.css}\n</style>`
              if (htmlContent.includes('</head>')) {
                htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
              }
            }
            
            const editStyle = `
              <style id="transflow-editor-style">
                body { 
                  -webkit-user-select: text !important; 
                  user-select: text !important; 
                  cursor: text !important;
                  overflow-x: auto !important;
                  overflow-y: auto !important;
                }
                [contenteditable="true"] { 
                  outline: 2px dashed #4caf50 !important; 
                  outline-offset: 2px; 
                }
                [contenteditable="true"]:focus {
                  outline: 3px solid #4caf50 !important;
                }
              </style>
            `
            if (htmlContent.includes('</head>')) {
              htmlContent = htmlContent.replace('</head>', `${editStyle}\n</head>`)
            }
            
            translatedDoc.open()
            translatedDoc.write(htmlContent)
            translatedDoc.close()
            
            setTimeout(() => {
              if (translatedDoc.body) {
                enableTextEditing(translatedDoc)
                // 번역본 편집 내용 추적
                translatedDoc.body.addEventListener('input', () => {
                  const updatedHtml = translatedDoc.documentElement.outerHTML
                  setEditedHtml(updatedHtml)
                })
              }
            }, 200)
          }
        }
      }
      return
    }
    
    // 기존 로직: 영역 선택 모드 또는 기타
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
  }, [urlResult, isSelectionMode, originalPageLoaded, isPreEditMode, isComparisonMode, editedOriginalHtml, fullscreenMode])
  
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
    
    // 모든 요소에 직접 이벤트 리스너 추가 (가장 확실한 방법)
    const attachListenersToAllElements = () => {
      const allElements = iframeDoc.querySelectorAll('*')
      console.log('총 요소 개수:', allElements.length)
      
      allElements.forEach((el) => {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return
        if (el === iframeDoc.body || el === iframeDoc.documentElement) return
        
        // 기존 리스너 제거 후 새로 추가
        el.removeEventListener('mouseover', handleMouseOver)
        el.removeEventListener('mouseout', handleMouseOut)
        el.removeEventListener('click', handleClick)
        
        el.addEventListener('mouseover', handleMouseOver, true)
        el.addEventListener('mouseout', handleMouseOut, true)
        el.addEventListener('click', handleClick, true)
      })
      
      console.log('✅ 모든 요소에 이벤트 리스너 추가 완료')
    }
    
    // 즉시 실행
    attachListenersToAllElements()
    
    // body에도 추가
    if (iframeDoc.body) {
      iframeDoc.body.addEventListener('mouseover', handleMouseOver, true)
      iframeDoc.body.addEventListener('mouseout', handleMouseOut, true)
      iframeDoc.body.addEventListener('click', handleClick, true)
    }
    
    // 새로 추가되는 요소에도 리스너 추가 (MutationObserver 사용)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') return
            node.addEventListener('mouseover', handleMouseOver, true)
            node.addEventListener('mouseout', handleMouseOut, true)
            node.addEventListener('click', handleClick, true)
          }
        })
      })
    })
    
    observer.observe(iframeDoc.body, {
      childList: true,
      subtree: true
    })
    
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
    
    // Ctrl+Z (Undo) 및 Ctrl+Y (Redo) 기능 추가
    // 백스페이스와 Delete는 기본 동작을 방해하지 않도록 주의
    const handleKeyDown = (e) => {
      // Ctrl+Z (또는 Cmd+Z on Mac) - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        iframeDoc.execCommand('undo', false, null)
        return false
      }
      // Ctrl+Y 또는 Ctrl+Shift+Z (Redo)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        e.stopPropagation()
        iframeDoc.execCommand('redo', false, null)
        return false
      }
      
      // 백스페이스 키 처리: contentEditable에서 페이지 이동 및 스크롤 방지
      if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeElement = iframeDoc.activeElement
        
        // contentEditable 요소 내에서만 처리
        if (activeElement && activeElement.isContentEditable) {
          // 현재 스크롤 위치 저장
          const scrollTop = iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop
          const scrollLeft = iframeDoc.documentElement.scrollLeft || iframeDoc.body.scrollLeft
          
          // 백스페이스 후 스크롤 위치 복원
          setTimeout(() => {
            if (iframeDoc.documentElement) {
              iframeDoc.documentElement.scrollTop = scrollTop
              iframeDoc.documentElement.scrollLeft = scrollLeft
            }
            if (iframeDoc.body) {
              iframeDoc.body.scrollTop = scrollTop
              iframeDoc.body.scrollLeft = scrollLeft
            }
            // focus 유지
            if (activeElement && activeElement.isContentEditable) {
              activeElement.focus()
            }
          }, 0)
        }
        // 기본 동작 허용 (텍스트 삭제)
      }
    }
    
    // 키보드 이벤트 리스너 추가 (capture phase에서만 특정 키 처리)
    iframeDoc.addEventListener('keydown', handleKeyDown, true)
    
    // 변경 사항 추적
    const handleInput = () => {
      const updatedHtml = iframeDoc.documentElement.outerHTML
      setEditedHtml(updatedHtml)
    }
    iframeDoc.body.addEventListener('input', handleInput)
    
    console.log('텍스트 편집 모드 활성화! (Ctrl+Z 지원)')
  }
  
  // 영역 선택 후 원본 편집 모드로 전환
  const handleStartPreEdit = () => {
    if (selectedElements.length === 0) {
      alert('편집할 영역을 먼저 선택해주세요.')
      return
    }
    
    const iframe = iframeRef.current
    const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document
    
    if (!iframeDoc || !urlResult?.originalHtml) {
      setError('원본 페이지를 불러올 수 없습니다.')
      return
    }
    
    // 선택된 영역만 남기고 나머지 제거
    const selectedElementIds = new Set(selectedElements.map(sel => sel.id))
    
    // 선택되지 않은 요소 제거
    const removeUnselectedElements = (element) => {
      if (element.hasAttribute('data-transflow-id')) {
        const elementId = element.getAttribute('data-transflow-id')
        if (elementId && selectedElementIds.has(elementId)) {
          return true
        }
      }
      
      const children = Array.from(element.children)
      const childrenToKeep = []
      
      children.forEach(child => {
        if (removeUnselectedElements(child)) {
          childrenToKeep.push(child)
        }
      })
      
      if (childrenToKeep.length > 0) {
        const allChildren = Array.from(element.children)
        allChildren.forEach(child => {
          if (!childrenToKeep.includes(child)) {
            element.removeChild(child)
          }
        })
        return true
      }
      
      return false
    }
    
    if (iframeDoc.body) {
      const bodyChildren = Array.from(iframeDoc.body.children)
      const bodyChildrenToKeep = []
      
      bodyChildren.forEach(child => {
        if (removeUnselectedElements(child)) {
          bodyChildrenToKeep.push(child)
        }
      })
      
      const allBodyChildren = Array.from(iframeDoc.body.children)
      allBodyChildren.forEach(child => {
        if (!bodyChildrenToKeep.includes(child)) {
          iframeDoc.body.removeChild(child)
        }
      })
      
      // 선택 표시 제거
      iframeDoc.querySelectorAll('.transflow-selected, .transflow-hovering').forEach(el => {
        el.classList.remove('transflow-selected', 'transflow-hovering')
      })
    }
    
    // 편집된 원본 HTML 저장
    const finalHtml = iframeDoc.documentElement.outerHTML
    setEditedOriginalHtml(finalHtml)
    
    // 원본 편집 모드로 전환
    setIsSelectionMode(false)
    setIsPreEditMode(true)
    
    // 텍스트 편집 활성화
    setTimeout(() => {
      if (iframeDoc.body) {
        enableTextEditing(iframeDoc)
      }
    }, 200)
  }

  // 원본 편집 후 번역하기
  const handleTranslateAfterPreEdit = async () => {
    if (!editedOriginalHtml) {
      alert('편집된 원본이 없습니다.')
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      // 편집된 원본 HTML 번역
      const response = await translationApi.translateHtml({
        html: editedOriginalHtml,
        targetLang: getDeepLLangCode(targetLang),
        sourceLang: sourceLang === 'auto' ? undefined : getDeepLLangCode(sourceLang),
      })
      
      if (response.success && response.translatedHtml) {
        // 번역된 HTML 저장
        setUrlResult({
          ...urlResult,
          translatedHtml: response.translatedHtml,
        })
        setEditedHtml(response.translatedHtml)
        
        // 비교 모드로 전환
        setIsPreEditMode(false)
        setIsComparisonMode(true)
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

  // 선택된 영역들 번역 (여러 영역을 한 번에) - 이제 사용 안 함
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
    if (isComparisonMode) {
      // 비교 모드: 번역본만 저장
      const translatedIframe = translatedIframeRef.current
      const translatedDoc = translatedIframe?.contentDocument || translatedIframe?.contentWindow?.document
      
      if (translatedDoc && urlResult) {
        const currentHtml = translatedDoc.documentElement.outerHTML
          .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
        
        setEditedHtml(currentHtml)
        setUrlResult({
          ...urlResult,
          translatedHtml: currentHtml
        })
        alert('✅ 번역본이 저장되었습니다!')
      }
    } else if (isPreEditMode) {
      // 원본 편집 모드: 편집된 원본 저장
      const iframe = iframeRef.current
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document
      
      if (iframeDoc) {
        const currentHtml = iframeDoc.documentElement.outerHTML
          .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
        
        setEditedOriginalHtml(currentHtml)
        alert('✅ 편집된 원본이 저장되었습니다!')
      }
    } else {
      // 기존 로직
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
  }

  return (
    <div className="translation-container">
      <header className="translation-header">
        <h1>LangBridge</h1>
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                      {selectedElements.length}개
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.2rem', color: '#ccc' }}>→</div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  color: isPreEditMode ? '#ff9800' : '#666',
                  fontWeight: isPreEditMode ? 'bold' : 'normal'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>3️⃣</span>
                  <span>원본 편집</span>
                  {isPreEditMode && <span style={{ fontSize: '0.8rem' }}>✓</span>}
                </div>
                <div style={{ fontSize: '1.2rem', color: '#ccc' }}>→</div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  color: urlResult?.translatedHtml ? '#28a745' : '#666',
                  fontWeight: urlResult?.translatedHtml ? 'bold' : 'normal'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>4️⃣</span>
                  <span>번역하기</span>
                  {urlResult?.translatedHtml && <span style={{ fontSize: '0.8rem' }}>✓</span>}
                </div>
                <div style={{ fontSize: '1.2rem', color: '#ccc' }}>→</div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  color: isComparisonMode ? '#9c27b0' : '#666',
                  fontWeight: isComparisonMode ? 'bold' : 'normal'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>5️⃣</span>
                  <span>비교 편집</span>
                  {isComparisonMode && <span style={{ fontSize: '0.8rem' }}>✓</span>}
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
                    onClick={handleStartPreEdit}
                    disabled={isLoading}
                    className="translate-button"
                    style={{ 
                      backgroundColor: '#667eea', 
                      color: 'white',
                      fontSize: '1.1rem',
                      padding: '0.75rem 1.5rem'
                    }}
                  >
                    {isLoading ? '처리 중...' : `✏️ 선택한 ${selectedElements.length}개 영역 원본 편집하기`}
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

            {/* 원본 편집 모드 */}
            {isPreEditMode && editedOriginalHtml && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#fff3e0',
                  borderRadius: '8px',
                  border: '2px solid #ff9800',
                  marginBottom: '1rem'
                }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#e65100' }}>
                    ✏️ 원본 편집 모드
                  </p>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#555' }}>
                    텍스트를 클릭하여 편집하세요. 편집이 완료되면 번역하기 버튼을 클릭하세요.
                  </p>
                  <button 
                    onClick={handleTranslateAfterPreEdit}
                    disabled={isLoading}
                    className="translate-button"
                    style={{ 
                      backgroundColor: '#28a745', 
                      color: 'white',
                      fontSize: '1.1rem',
                      padding: '0.75rem 1.5rem'
                    }}
                  >
                    {isLoading ? '번역 중...' : '🌐 번역하기'}
                  </button>
                </div>
                <div className="html-result" style={{ width: '100%' }}>
                  <div style={{
                    padding: '1rem 1.5rem',
                    backgroundColor: '#f8f9fa',
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px 8px 0 0',
                    borderBottom: 'none'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#333' }}>
                      📝 편집 중인 원본 페이지
                    </h3>
                  </div>
                  <div style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#fff3e0',
                    border: '1px solid #ff9800',
                    borderTop: 'none',
                    fontSize: '0.9rem',
                    color: '#e65100'
                  }}>
                    ✏️ 텍스트를 클릭하여 편집하세요
                  </div>
                  <div style={{
                    width: '100%',
                    height: '90vh',
                    minHeight: '800px',
                    border: '2px solid #ff9800',
                    borderRadius: '0 0 8px 8px',
                    overflow: 'hidden',
                    backgroundColor: 'white'
                  }}>
                    <iframe
                      ref={iframeRef}
                      title="Original Page for Editing"
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      sandbox="allow-same-origin allow-scripts"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 비교 편집 모드 (원본과 번역본 나란히) */}
            {isComparisonMode && urlResult?.translatedHtml && (
              <div style={{ marginTop: '1rem' }}>
                {fullscreenMode ? (
                  // 전체화면 모드
                  <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'white',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{
                      padding: '1rem 1.5rem',
                      backgroundColor: '#f8f9fa',
                      borderBottom: '2px solid #e0e0e0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#333' }}>
                        {fullscreenMode === 'original' ? '📄 원본 페이지 (전체화면)' : '✨ 번역된 페이지 (전체화면)'}
                      </h3>
                      <button
                        onClick={() => setFullscreenMode(null)}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          backgroundColor: '#666',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        ✕ 전체화면 종료
                      </button>
                    </div>
                    <div style={{
                      flex: 1,
                      overflow: 'hidden',
                      backgroundColor: 'white'
                    }}>
                      <iframe
                        ref={fullscreenMode === 'original' ? originalIframeRef : translatedIframeRef}
                        title={fullscreenMode === 'original' ? 'Original Page Fullscreen' : 'Translated Page Fullscreen'}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        sandbox="allow-same-origin allow-scripts"
                        key={fullscreenMode} // key를 추가하여 전체화면 모드 변경 시 iframe 재렌더링
                        onLoad={() => {
                          // 전체화면 모드에서도 편집 기능 활성화
                          const iframe = fullscreenMode === 'original' ? originalIframeRef.current : translatedIframeRef.current
                          const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document
                          if (iframeDoc && iframeDoc.body) {
                            setTimeout(() => {
                              enableTextEditing(iframeDoc)
                            }, 100)
                          }
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  // 일반 비교 모드
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                    height: 'calc(100vh - 150px)',
                    minHeight: '900px'
                  }}>
                    {/* 원본 페이지 */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        padding: '1rem 1.5rem',
                        backgroundColor: '#f8f9fa',
                        border: '2px solid #e0e0e0',
                        borderRadius: '8px 8px 0 0',
                        borderBottom: 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#333' }}>
                          📄 원본 페이지
                        </h3>
                        <button
                          onClick={() => setFullscreenMode('original')}
                          style={{
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.85rem',
                            backgroundColor: '#2196f3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          title="전체화면"
                        >
                          ⛶ 전체화면
                        </button>
                      </div>
                    <div style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#e3f2fd',
                      border: '1px solid #90caf9',
                      borderTop: 'none',
                      fontSize: '0.9rem',
                      color: '#1976d2'
                    }}>
                      ✏️ 텍스트를 클릭하여 편집하세요
                    </div>
                    <div style={{
                      flex: 1,
                      border: '2px solid #2196f3',
                      borderRadius: '0 0 8px 8px',
                      overflow: 'hidden',
                      backgroundColor: 'white'
                    }}>
                      <iframe
                        ref={originalIframeRef}
                        title="Original Page"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        sandbox="allow-same-origin allow-scripts"
                      />
                    </div>
                  </div>

                    {/* 번역본 페이지 */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        padding: '1rem 1.5rem',
                        backgroundColor: '#f8f9fa',
                        border: '2px solid #e0e0e0',
                        borderRadius: '8px 8px 0 0',
                        borderBottom: 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#333' }}>
                            ✨ 번역된 페이지
                          </h3>
                          {urlResult.sourceLang && urlResult.targetLang && (
                            <span style={{ fontSize: '0.9rem', color: '#666' }}>
                              {urlResult.sourceLang} → {urlResult.targetLang}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setFullscreenMode('translated')}
                          style={{
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.85rem',
                            backgroundColor: '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          title="전체화면"
                        >
                          ⛶ 전체화면
                        </button>
                      </div>
                    <div style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#e8f5e9',
                      border: '1px solid #81c784',
                      borderTop: 'none',
                      fontSize: '0.9rem',
                      color: '#2e7d32'
                    }}>
                      ✏️ 텍스트를 클릭하여 편집하세요
                    </div>
                    <div style={{
                      flex: 1,
                      border: '2px solid #4caf50',
                      borderRadius: '0 0 8px 8px',
                      overflow: 'hidden',
                      backgroundColor: 'white'
                    }}>
                      <iframe
                        ref={translatedIframeRef}
                        title="Translated Page"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        sandbox="allow-same-origin allow-scripts"
                      />
                      </div>
                    </div>
                  </div>
                )}
                {!fullscreenMode && (
                  <div style={{
                    marginTop: '1rem',
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'center'
                  }}>
                    <button
                    onClick={handleSave}
                    style={{
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    💾 저장
                  </button>
                  <button
                    onClick={() => {
                      const translatedIframe = translatedIframeRef.current
                      const translatedDoc = translatedIframe?.contentDocument || translatedIframe?.contentWindow?.document
                      if (translatedDoc && urlResult) {
                        let htmlContent = translatedDoc.documentElement.outerHTML
                          .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
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
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      backgroundColor: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    📥 다운로드
                  </button>
                  </div>
                )}
              </div>
            )}

            {/* 기존 렌더링 (영역 선택 모드 또는 기타) */}
            {urlResult && !isLoading && !isPreEditMode && !isComparisonMode && (
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
                      height: '90vh',
                      minHeight: '800px',
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
