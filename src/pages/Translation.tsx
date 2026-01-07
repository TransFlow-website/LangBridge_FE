import { useState } from 'react'
import './Translation.css'
import { translationApi, TranslationResponse } from '../services/api'

type TranslationMode = 'text' | 'url'

function Translation() {
  const [mode, setMode] = useState<TranslationMode>('url')
  
  // 텍스트 번역용 state
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  
  // URL 번역용 state
  const [url, setUrl] = useState('')
  const [urlResult, setUrlResult] = useState<TranslationResponse | null>(null)
  
  // 공통 state
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('ko')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  const getDeepLLangCode = (code: string): string => {
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

  const handleUrlTranslate = async () => {
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

    try {
      const response = await translationApi.translateWebPage({
        url: url.trim(),
        targetLang: getDeepLLangCode(targetLang),
        sourceLang: sourceLang === 'auto' ? undefined : getDeepLLangCode(sourceLang),
      })

      if (response.success) {
        setUrlResult(response)
      } else {
        setError(response.errorMessage || '번역 중 오류가 발생했습니다.')
      }
    } catch (err: any) {
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

  const handleTranslate = () => {
    if (mode === 'text') {
      handleTextTranslate()
    } else {
      handleUrlTranslate()
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('클립보드에 복사되었습니다!')
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
            <div className="url-input-section">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="번역할 웹페이지 URL을 입력하세요 (예: https://example.com)"
                className="url-input"
                onKeyPress={(e) => e.key === 'Enter' && handleUrlTranslate()}
              />
              <button 
                onClick={handleUrlTranslate}
                disabled={!url.trim() || isLoading}
                className="translate-button"
              >
                {isLoading ? '번역 중...' : '🔍 크롤링 & 번역'}
              </button>
            </div>

            {isLoading && (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>웹페이지를 크롤링하고 번역하는 중입니다...</p>
                <p className="loading-tip">⏱️ 페이지 크기에 따라 시간이 걸릴 수 있습니다.</p>
              </div>
            )}

            {urlResult && !isLoading && (
              <div className="url-result">
                <div className="result-section">
                  <div className="result-header">
                    <h3>📄 원본 텍스트</h3>
                    <button 
                      onClick={() => copyToClipboard(urlResult.originalText)}
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
                      onClick={() => copyToClipboard(urlResult.translatedText)}
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
