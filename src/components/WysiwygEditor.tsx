import React, { useRef, useEffect, useState } from 'react';
import { Button } from './Button';

export type EditorMode = 'text' | 'component';

interface WysiwygEditorProps {
  html: string;
  onHtmlChange: (html: string) => void;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  title?: string;
}

export const WysiwygEditor: React.FC<WysiwygEditorProps> = ({
  html,
  onHtmlChange,
  mode,
  onModeChange,
  title,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (iframeRef.current && html) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const editStyle = `
          <style id="transflow-editor-style">
            body {
              -webkit-user-select: text !important;
              user-select: text !important;
              cursor: ${mode === 'text' ? 'text' : 'pointer'} !important;
              padding: 16px;
            }
            ${mode === 'text' ? `
            [contenteditable="true"]:focus {
              outline: 2px dashed #A9A9A9 !important;
              outline-offset: 2px;
              background-color: rgba(169, 169, 169, 0.05) !important;
            }
            ` : `
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
            `}
          </style>
        `;

        let htmlContent = html;
        if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', `${editStyle}\n</head>`);
        } else if (htmlContent.includes('<html')) {
          if (!htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<html>', `<html><head>${editStyle}</head>`);
          } else {
            htmlContent = htmlContent.replace('<head>', `<head>${editStyle}`);
          }
        } else {
          htmlContent = `<html><head>${editStyle}</head><body>${htmlContent}</body></html>`;
        }

        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        // 편집 모드 설정 - iframe 로드 완료 후 실행
        const setupEditor = () => {
          if (iframeDoc.body && iframeDoc.body.children.length > 0) {
            // 기존 이벤트 리스너 제거를 위해 모든 요소의 contentEditable 초기화
            const allElements = iframeDoc.querySelectorAll('*');
            allElements.forEach((el) => {
              (el as HTMLElement).contentEditable = 'false';
              (el as HTMLElement).style.cursor = '';
            });

            if (mode === 'text') {
              // 텍스트 편집 모드: 모든 텍스트 요소를 편집 가능하게
              const editableElements = iframeDoc.querySelectorAll(
                'p, h1, h2, h3, h4, h5, h6, span, li, td, th, label, a, button, blockquote, cite, em, strong, b, i, u, small, sub, sup, code, pre, time, mark'
              );

              // div, section 등은 편집 불가능하게 (컨테이너만)
              const containerElements = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav');
              containerElements.forEach((el) => {
                (el as HTMLElement).contentEditable = 'false';
              });

              editableElements.forEach((el) => {
                if (el.tagName && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) {
                  (el as HTMLElement).contentEditable = 'true';
                  (el as HTMLElement).style.cursor = 'text';
                  
                  // 변경 사항 추적
                  el.addEventListener('input', () => {
                    const newHtml = iframeDoc.body?.innerHTML || '';
                    onHtmlChange(newHtml);
                  });

                  // 백스페이스 키 처리
                  el.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && el.textContent === '') {
                      e.preventDefault();
                      // 빈 요소만 삭제
                      if (el.parentNode && el.tagName !== 'BODY') {
                        el.remove();
                        const newHtml = iframeDoc.body?.innerHTML || '';
                        onHtmlChange(newHtml);
                      }
                    }
                  });
                }
              });

              // Undo/Redo 지원
              iframeDoc.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    iframeDoc.execCommand('redo', false);
                  } else {
                    iframeDoc.execCommand('undo', false);
                  }
                  const newHtml = iframeDoc.body?.innerHTML || '';
                  onHtmlChange(newHtml);
                }
              });
            } else {
              // 컴포넌트 편집 모드: 클릭으로 선택하고 삭제
              const clickableElements = iframeDoc.querySelectorAll('div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6');
              
              clickableElements.forEach((el) => {
                (el as HTMLElement).contentEditable = 'false';
                (el as HTMLElement).style.cursor = 'pointer';
                
                // 기존 클릭 이벤트 제거
                const newEl = el.cloneNode(true) as HTMLElement;
                el.parentNode?.replaceChild(newEl, el);
                
                newEl.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // 기존 선택 제거
                  clickableElements.forEach((elem) => {
                    (elem as HTMLElement).classList.remove('selected-for-delete');
                  });
                  
                  // 새 선택
                  newEl.classList.add('selected-for-delete');
                  setSelectedElement(newEl);
                });
              });
            }
          } else {
            // body가 아직 로드되지 않았으면 재시도
            setTimeout(setupEditor, 100);
          }
        };

        // iframe 로드 완료 대기
        if (iframeDoc.readyState === 'complete') {
          setTimeout(setupEditor, 200);
        } else {
          iframeDoc.addEventListener('DOMContentLoaded', () => {
            setTimeout(setupEditor, 200);
          });
          iframe.onload = () => {
            setTimeout(setupEditor, 200);
          };
        }
      }
    }
  }, [html, mode, onHtmlChange]);

  const handleDelete = () => {
    if (selectedElement && iframeRef.current) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc && selectedElement.parentNode) {
        selectedElement.remove();
        const newHtml = iframeDoc.body?.innerHTML || '';
        onHtmlChange(newHtml);
        setSelectedElement(null);
      }
    }
  };

  const handleFormat = (command: string, value?: string) => {
    if (iframeRef.current && mode === 'text') {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.execCommand(command, false, value);
        const newHtml = iframeDoc.body?.innerHTML || '';
        onHtmlChange(newHtml);
      }
    }
  };

  const handleInsertImage = () => {
    const url = prompt('이미지 URL을 입력하세요:');
    if (url && iframeRef.current && mode === 'text') {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const selection = iframeDoc.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const img = iframeDoc.createElement('img');
          img.src = url;
          img.style.maxWidth = '100%';
          range.insertNode(img);
          const newHtml = iframeDoc.body?.innerHTML || '';
          onHtmlChange(newHtml);
        }
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
          {title && (
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#000000',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                marginRight: '16px',
              }}
            >
              {title}
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant={mode === 'text' ? 'primary' : 'secondary'}
              onClick={() => onModeChange('text')}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              텍스트 편집
            </Button>
            <Button
              variant={mode === 'component' ? 'primary' : 'secondary'}
              onClick={() => onModeChange('component')}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              컴포넌트 편집
            </Button>
          </div>
        </div>

        {mode === 'text' && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <select
              onChange={(e) => handleFormat('fontName', e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                border: '1px solid #C0C0C0',
                borderRadius: '4px',
                backgroundColor: '#FFFFFF',
                color: '#000000',
              }}
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
            </select>
            <select
              onChange={(e) => handleFormat('fontSize', e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                fontFamily: 'system-ui, Pretendard, sans-serif',
                border: '1px solid #C0C0C0',
                borderRadius: '4px',
                backgroundColor: '#FFFFFF',
                color: '#000000',
              }}
            >
              <option value="1">8pt</option>
              <option value="2">10pt</option>
              <option value="3">12pt</option>
              <option value="4">14pt</option>
              <option value="5">18pt</option>
              <option value="6">24pt</option>
              <option value="7">36pt</option>
            </select>
            <Button
              variant="secondary"
              onClick={() => handleFormat('bold')}
              style={{ fontSize: '12px', padding: '4px 8px', fontWeight: 'bold' }}
            >
              B
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleFormat('italic')}
              style={{ fontSize: '12px', padding: '4px 8px', fontStyle: 'italic' }}
            >
              I
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleFormat('underline')}
              style={{ fontSize: '12px', padding: '4px 8px', textDecoration: 'underline' }}
            >
              U
            </Button>
            <Button
              variant="secondary"
              onClick={handleInsertImage}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              이미지
            </Button>
          </div>
        )}

        {mode === 'component' && selectedElement && (
          <Button
            variant="primary"
            onClick={handleDelete}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            선택한 요소 삭제
          </Button>
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
          title="WYSIWYG Editor"
        />
      </div>
    </div>
  );
};

