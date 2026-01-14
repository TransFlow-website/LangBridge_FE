/**
 * 문단 단위 유틸리티 함수
 */

import { colors } from '../constants/designTokens';

export interface Paragraph {
  id: string;
  element: HTMLElement;
  index: number;
}

/**
 * HTML 문자열에서 문단 요소들을 추출하고 ID를 부여
 * 원본 HTML 구조와 모든 요소(이미지, 레이아웃 등)를 보존
 * 
 * @param html - HTML 문자열
 * @param containerId - 컨테이너 ID (선택적, 고유 ID 생성용)
 * @returns 문단 ID가 부여된 HTML 문자열
 * 
 * ⚠️ 중요: 원문과 AI 초벌 번역은 동일한 문단 구조를 가지므로,
 * data-paragraph-index만으로 1:1 매칭이 가능합니다.
 */
export function extractParagraphs(html: string, containerId: string = 'content'): string {
  // 빈 HTML이면 그대로 반환
  if (!html || html.trim().length === 0) {
    return html;
  }

  const parser = new DOMParser();
  
  // HTML을 문서로 파싱
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  // 이미 문단 index가 있는지 확인
  const existingIndexes = body.querySelectorAll('[data-paragraph-index]');
  if (existingIndexes.length > 0) {
    // 이미 index가 있으면 그대로 반환 (중복 처리 방지)
    console.log(`⏭️ 이미 문단 ID가 있음 (${existingIndexes.length}개), 처리 생략`);
    return html;
  }

  // 문단 요소 선택 (p, h1-h6, div, li 등)
  // 이미지나 다른 요소를 포함하는 컨테이너도 포함
  const paragraphSelectors = 'p, h1, h2, h3, h4, h5, h6, div, li, blockquote, article, section, figure, figcaption';
  const elements = body.querySelectorAll(paragraphSelectors);

  let paragraphIndex = 0;
  elements.forEach((el) => {
    // 텍스트가 있거나 이미지/다른 콘텐츠가 있는 요소를 문단으로 간주
    const text = el.textContent?.trim();
    const hasImages = el.querySelectorAll('img').length > 0;
    const hasContent = text && text.length > 0;
    
    if (hasContent || hasImages) {
      // data-paragraph-id는 디버깅용 (선택적)
      const paragraphId = `para-${containerId}-${paragraphIndex}`;
      (el as HTMLElement).setAttribute('data-paragraph-id', paragraphId);
      
      // ⭐ data-paragraph-index가 핵심: 원문과 AI 초벌 번역 간 매칭에 사용
      (el as HTMLElement).setAttribute('data-paragraph-index', paragraphIndex.toString());
      
      paragraphIndex++;
    }
  });

  console.log(`✅ 문단 ID 추가 완료: ${paragraphIndex}개 문단 (containerId: ${containerId})`);

  // ⭐ 전체 HTML 문서를 반환 (head 태그, CSS 등 모두 보존)
  return doc.documentElement.outerHTML;
}

/**
 * DOM에서 문단 요소들을 찾아 반환
 */
export function getParagraphs(container: HTMLElement): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const elements = container.querySelectorAll('[data-paragraph-id]');

  elements.forEach((el) => {
    const id = (el as HTMLElement).getAttribute('data-paragraph-id');
    const indexStr = (el as HTMLElement).getAttribute('data-paragraph-index');
    if (id && indexStr) {
      paragraphs.push({
        id,
        element: el as HTMLElement,
        index: parseInt(indexStr, 10),
      });
    }
  });

  return paragraphs.sort((a, b) => a.index - b.index);
}

/**
 * 문단 ID로 요소 찾기
 */
export function findParagraphById(container: HTMLElement, paragraphId: string): HTMLElement | null {
  return container.querySelector(`[data-paragraph-id="${paragraphId}"]`) as HTMLElement | null;
}

/**
 * 문단 인덱스로 요소 찾기
 */
export function findParagraphByIndex(container: HTMLElement, index: number): HTMLElement | null {
  return container.querySelector(`[data-paragraph-index="${index}"]`) as HTMLElement | null;
}

/**
 * 스크롤 위치에 해당하는 문단 찾기
 */
export function getParagraphAtScrollPosition(container: HTMLElement, scrollTop: number): Paragraph | null {
  const paragraphs = getParagraphs(container);
  
  for (const para of paragraphs) {
    const rect = para.element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relativeTop = rect.top - containerRect.top + container.scrollTop;

    if (relativeTop <= scrollTop + 50 && relativeTop + rect.height >= scrollTop) {
      return para;
    }
  }

  // 가장 가까운 문단 반환
  if (paragraphs.length > 0) {
    let closest = paragraphs[0];
    let minDistance = Math.abs(
      paragraphs[0].element.getBoundingClientRect().top -
      container.getBoundingClientRect().top
    );

    for (const para of paragraphs) {
      const rect = para.element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const distance = Math.abs(rect.top - containerRect.top);

      if (distance < minDistance) {
        minDistance = distance;
        closest = para;
      }
    }

    return closest;
  }

  return null;
}

/**
 * 문단 하이라이트 스타일 적용
 */
export function highlightParagraph(element: HTMLElement, isHighlighted: boolean) {
  if (isHighlighted) {
    element.style.backgroundColor = 'rgba(192, 192, 192, 0.2)';
    element.style.transition = 'background-color 150ms';
    // 경계선 제거 - 배경색만으로 하이라이트
    // element.style.borderLeft = '3px solid #808080';
    // element.style.paddingLeft = '8px';
  } else {
    element.style.backgroundColor = '';
    // element.style.borderLeft = '';
    // element.style.paddingLeft = '';
  }
}

/**
 * 완료된 문단 스타일 적용
 */
export function markParagraphComplete(element: HTMLElement, isComplete: boolean) {
  if (isComplete) {
    element.style.opacity = '0.7';
    element.style.textDecoration = 'line-through';
    element.style.color = colors.secondaryText;
  } else {
    element.style.opacity = '';
    element.style.textDecoration = '';
    element.style.color = '';
  }
}

/**
 * 모든 문단 하이라이트 제거
 */
export function clearAllHighlights(container: HTMLElement) {
  const paragraphs = getParagraphs(container);
  paragraphs.forEach((para) => {
    para.element.style.backgroundColor = '';
  });
}

