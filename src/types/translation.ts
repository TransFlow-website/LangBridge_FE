export enum DocumentState {
  DRAFT = 'DRAFT',
  PENDING_TRANSLATION = 'PENDING_TRANSLATION',
  IN_TRANSLATION = 'IN_TRANSLATION',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
}

export interface SelectedArea {
  id: string;
  selector: string;
  html: string;
  order: number;
}

export interface TranslationDraft {
  id?: string;
  url: string;
  selectedAreas: SelectedArea[];
  originalHtml: string;
  originalHtmlWithIds?: string; // STEP 2의 iframe HTML (data-transflow-id 포함)
  editedHtml?: string;
  translatedHtml?: string;
  sourceLang?: string; // 원문 언어
  targetLang?: string; // 번역 언어
  state: DocumentState;
  lastSaved?: Date;
}

