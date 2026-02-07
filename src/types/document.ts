import { DocumentState } from './translation';

export enum Priority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export interface DocumentListItem {
  id: number;
  title: string;
  category: string;
  categoryId?: number;
  estimatedLength?: number; // 예상 분량 (자)
  progress: number; // 진행률 (0-100)
  deadline?: string; // 마감일 (ISO string 또는 "3일 후" 형식)
  priority: Priority;
  status: DocumentState;
  lastModified?: string; // 마지막 수정 시점 (ISO string 또는 "2시간 전" 형식)
  assignedManager?: string; // 담당 관리자
  isFinal: boolean; // Final 여부
  originalUrl?: string;
  currentWorker?: string; // 현재 작업자 (IN_TRANSLATION 상태인 경우)
  currentVersionId?: number; // 현재 버전 ID
  hasVersions?: boolean; // 버전 존재 여부
}

export interface DocumentFilter {
  categoryId?: number;
  status?: DocumentState;
  priority?: Priority;
  assignedManagerId?: number;
}

export interface DocumentSortOption {
  field: 'deadline' | 'progress' | 'lastModified' | 'title';
  order: 'asc' | 'desc';
}

