import { useState, useEffect, useRef } from 'react'
import './WebPageEditor.css'
import { translationApi } from '../services/api'

function WebPageEditor() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [translationResult, setTranslationResult] = useState(null)
  
  // 언어 설정
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('ko')
  
  // 편집 모드
  const [isEditing, setIsEditing] = useState(false)
  const iframeRef = useRef(null)
  const [editedHtml, setEditedHtml] = useState('')

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

  const getDeepLLangCode = (code) => {
    if (code === 'auto') return ''
    const lang = languages.find(l => l.code === code)
    return lang?.deepl || code.toUpperCase()
  }

  const handleTranslate = async () => {
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
    setTranslationResult(null)
    setIsEditing(false)

    try {
      const response = await translationApi.translateWebPage({
        url: url.trim(),
        targetLang: getDeepLLangCode(targetLang),
        sourceLang: sourceLang === 'auto' ? undefined : getDeepLLangCode(sourceLang),
      })

      console.log('번역 응답 받음:', response)
      
      if (response.success) {
        // Cloudflare 차단 페이지 감지
        if (response.translatedHtml) {
          const html = response.translatedHtml.toLowerCase()
          if (html.includes('verify you are human') || 
              html.includes('enable javascript and cookies') ||
              html.includes('ray id:') ||
              html.includes('just a moment')) {
            setError('⚠️ Cloudflare 보안 검증 페이지가 감지되었습니다. 이 사이트는 보안 검증이 필요하여 크롤링할 수 없습니다. 다른 URL을 시도해주세요.')
            return
          }
        }
        
        // 번역 결과 무조건 설정
        setTranslationResult(response)
        setEditedHtml(response.translatedHtml || response.originalHtml || '')
        setError(null)
        console.log('번역 결과 설정 완료!', {
          hasTranslatedHtml: !!response.translatedHtml,
          hasOriginalHtml: !!response.originalHtml,
          hasCss: !!response.css
        })
      } else {
        console.error('번역 실패:', response.errorMessage)
        setError(response.errorMessage || '번역 중 오류가 발생했습니다.')
        setTranslationResult(null)
      }
    } catch (err) {
      console.error('Translation error:', err)
      setError(
        err.response?.data?.errorMessage || 
        err.message || 
        '서버와 통신할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  // iframe에 HTML 렌더링 및 편집 가능하게 만들기
  useEffect(() => {
    if (iframeRef.current && translationResult) {
      const iframe = iframeRef.current
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      
      if (iframeDoc) {
        // 번역된 HTML 또는 원본 HTML 사용
        let htmlContent = translationResult.translatedHtml || translationResult.originalHtml || ''
        
        console.log('iframe에 HTML 렌더링 시작:', {
          hasTranslatedHtml: !!translationResult.translatedHtml,
          hasOriginalHtml: !!translationResult.originalHtml,
          htmlLength: htmlContent.length
        })
        
        // CSS를 <style> 태그로 추가
        if (translationResult.css) {
          const cssTag = `<style id="transflow-css">\n${translationResult.css}\n</style>`
          if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
          } else if (htmlContent.includes('<html')) {
            htmlContent = htmlContent.replace('<html', `${cssTag}\n<html`)
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
            p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button {
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
          htmlContent = htmlContent.replace('<html', `${editStyle}\n<html`)
        } else {
          htmlContent = editStyle + '\n' + htmlContent
        }
        
        iframeDoc.open()
        iframeDoc.write(htmlContent)
        iframeDoc.close()
        
        // 모든 텍스트 요소를 편집 가능하게 만들기
        setTimeout(() => {
          if (iframeDoc.body) {
            // 모든 텍스트를 포함하는 요소들을 편집 가능하게
            const editableElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button, article, section, header, footer, main, aside, blockquote, cite, em, strong, b, i, u, small, sub, sup, code, pre, time, mark')
            
            editableElements.forEach((el) => {
              // 스크립트나 스타일 태그의 자식이 아니면 편집 가능하게
              if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) {
                el.contentEditable = 'true'
                el.setAttribute('contenteditable', 'true')
                el.style.cursor = 'text'
                
                // 편집 가능한 요소에 스타일 추가
                el.addEventListener('focus', function() {
                  this.style.outline = '2px dashed #667eea'
                  this.style.outlineOffset = '2px'
                  this.style.backgroundColor = 'rgba(102, 126, 234, 0.05)'
                })
                
                el.addEventListener('blur', function() {
                  this.style.outline = ''
                  this.style.outlineOffset = ''
                  this.style.backgroundColor = ''
                })
              }
            })
            
            // 스크립트, 스타일 태그는 편집 불가능하게
            const scripts = iframeDoc.querySelectorAll('script, style, noscript')
            scripts.forEach((el) => {
              el.contentEditable = 'false'
              el.setAttribute('contenteditable', 'false')
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
                console.log('텍스트 편집됨!')
                inputTimeoutId = null
              }, 500)
            })
            
            // 텍스트 선택 가능하게
            iframeDoc.body.style.userSelect = 'text'
            iframeDoc.body.style.webkitUserSelect = 'text'
            
            console.log('iframe 편집 모드 활성화 완료!', editableElements.length, '개 요소 편집 가능')
          }
        }, 200)
      }
    }
  }, [translationResult])

  const handleSaveEdit = () => {
    // 편집된 HTML 저장
    if (iframeRef.current) {
      const iframe = iframeRef.current
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      
      if (iframeDoc) {
        // 현재 HTML 가져오기
        const currentHtml = iframeDoc.documentElement.outerHTML
        
        // 편집 스타일 태그만 제거 (CSS는 유지)
        const cleanedHtml = currentHtml
          .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
        
        setEditedHtml(cleanedHtml)
        
        // 번역 결과도 업데이트
        if (translationResult) {
          setTranslationResult({
            ...translationResult,
            translatedHtml: cleanedHtml
          })
        }
        
        alert('✅ 수정 내용이 저장되었습니다!')
      }
    }
  }

  const handleDownload = () => {
    if (!translationResult?.translatedHtml) return

    let htmlContent = isEditing ? editedHtml : translationResult.translatedHtml
    
    // CSS 포함
    if (translationResult.css) {
      const cssTag = `<style id="transflow-css">\n${translationResult.css}\n</style>`
      if (htmlContent.includes('</head>')) {
        htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
      } else if (htmlContent.includes('<html')) {
        htmlContent = htmlContent.replace('<html', `${cssTag}\n<html`)
      } else {
        htmlContent = cssTag + '\n' + htmlContent
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

  const swapLanguages = () => {
    if (sourceLang === 'auto') return
    const temp = sourceLang
    setSourceLang(targetLang)
    setTargetLang(temp)
  }

  // 디버깅: translationResult 상태 확인
  useEffect(() => {
    console.log('translationResult 상태 변경:', translationResult)
    console.log('isLoading:', isLoading)
    console.log('isEditing:', isEditing)
  }, [translationResult, isLoading, isEditing])

  return (
    <div className="webpage-editor-container">
      <header className="editor-header">
        <h1>🌐 웹페이지 번역 및 편집</h1>
        <p className="subtitle">URL을 입력하면 번역된 웹페이지를 확인하고 수정할 수 있습니다</p>
      </header>

      <div className="editor-main">
        {/* URL 입력 및 언어 선택 */}
        <div className="input-section">
          <div className="url-input-group">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="번역할 웹페이지 URL을 입력하세요 (예: https://example.com)"
              className="url-input"
              onKeyPress={(e) => e.key === 'Enter' && handleTranslate()}
            />
            <button 
              onClick={handleTranslate}
              disabled={!url.trim() || isLoading}
              className="translate-button"
            >
              {isLoading ? '번역 중...' : '🔍 크롤링 & 번역'}
            </button>
          </div>

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
        </div>

        {/* 오류 메시지 */}
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {/* 로딩 */}
        {isLoading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>웹페이지를 크롤링하고 번역하는 중입니다...</p>
            <p className="loading-tip">⏱️ 페이지 크기에 따라 시간이 걸릴 수 있습니다.</p>
          </div>
        )}

        {/* 번역 결과 - 무조건 표시 */}
        {translationResult && !isLoading && (
          <div className="result-section" style={{ marginTop: '2rem' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '1rem 1.5rem',
              backgroundColor: '#f8f9fa',
              border: '2px solid #e0e0e0',
              borderRadius: '8px 8px 0 0',
              borderBottom: 'none'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#333' }}>✨ 번역된 웹페이지</h3>
                {translationResult.sourceLang && (
                  <span style={{ fontSize: '0.9rem', color: '#666' }}>
                    {translationResult.sourceLang} → {translationResult.targetLang}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleSaveEdit}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(40, 167, 69, 0.3)'
                  }}
                >
                  💾 저장
                </button>
                <button
                  onClick={handleDownload}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
                  }}
                >
                  📥 다운로드
                </button>
              </div>
            </div>

            <div style={{ 
              width: '100%', 
              height: '85vh', 
              minHeight: '700px',
              border: '2px solid #667eea',
              borderRadius: '0 0 8px 8px',
              overflow: 'hidden',
              backgroundColor: 'white',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                zIndex: 1000,
                padding: '0.75rem 1.25rem',
                backgroundColor: '#667eea',
                color: 'white',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: '600',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                pointerEvents: 'none'
              }}>
                ✏️ 텍스트를 클릭하여 편집하세요 (지우고 새로 쓸 수 있습니다)
              </div>
              <iframe
                ref={iframeRef}
                title="Translated Web Page"
                style={{ width: '100%', height: '100%', border: 'none' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}

        {/* HTML 소스 코드 편집 (고급 편집 모드) */}
        {translationResult && isEditing && (
          <div className="source-editor-section">
            <div className="editor-header-row">
              <h4>📝 HTML 소스 코드 편집</h4>
              <button
                onClick={() => {
                  // iframe에서 현재 HTML 가져오기
                  if (iframeRef.current) {
                    const iframe = iframeRef.current
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
                    if (iframeDoc) {
                      const currentHtml = iframeDoc.documentElement.outerHTML
                        .replace(/<style id="transflow-css">[\s\S]*?<\/style>/g, '')
                        .replace(/<style id="transflow-editor-style">[\s\S]*?<\/style>/g, '')
                      setEditedHtml(currentHtml)
                    }
                  }
                }}
                className="sync-button"
                title="iframe에서 현재 HTML 가져오기"
              >
                🔄 동기화
              </button>
            </div>
            <textarea
              value={editedHtml}
              onChange={(e) => setEditedHtml(e.target.value)}
              className="html-editor"
              spellCheck={false}
              placeholder="HTML 소스 코드를 편집하세요..."
            />
            <div className="editor-actions">
              <button
                onClick={() => {
                  // HTML 업데이트 시 iframe도 다시 렌더링
                  if (iframeRef.current && translationResult) {
                    const iframe = iframeRef.current
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
                    if (iframeDoc) {
                      let htmlContent = editedHtml
                      if (translationResult.css) {
                        const cssTag = `<style id="transflow-css">\n${translationResult.css}\n</style>`
                        if (htmlContent.includes('</head>')) {
                          htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
                        } else if (htmlContent.includes('<html')) {
                          htmlContent = htmlContent.replace('<html', `${cssTag}\n<html`)
                        } else {
                          htmlContent = cssTag + '\n' + htmlContent
                        }
                      }
                      iframeDoc.open()
                      iframeDoc.write(htmlContent)
                      iframeDoc.close()
                      
                      // 편집 모드 다시 활성화
                      if (iframeDoc.body) {
                        iframeDoc.body.contentEditable = 'true'
                      }
                    }
                  }
                }}
                className="apply-button"
              >
                적용하기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WebPageEditor

