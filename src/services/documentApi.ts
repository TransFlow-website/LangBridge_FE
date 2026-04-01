import apiClient from './api';
import { DocumentState } from '../types/translation';
import { translationApi } from './api';

export interface CreateDocumentRequest {
  title: string;
  originalUrl: string;
  sourceLang: string;
  targetLang: string;
  categoryId?: number;
  estimatedLength?: number;
  status?: string;
  draftData?: string; // 임시저장 데이터 (JSON)
}

export interface DocumentResponse {
  id: number;
  title: string;
  originalUrl: string;
  sourceLang: string;
  targetLang: string;
  categoryId?: number;
  status: string;
  currentVersionId?: number;
  currentVersionNumber?: number;
  /** 목록 표시용: v1=초벌, v2=첫 수동… (서버 계산, currentVersionNumber와 함께 제공) */
  userFacingVersionNumber?: number;
  /** 현재 버전이 승인 등으로 최종(FINAL) 처리되었는지 */
  currentVersionIsFinal?: boolean;
  estimatedLength?: number;
  versionCount?: number;
  hasVersions?: boolean;
  draftData?: string; // 임시저장 데이터 (JSON)
  sourceDocumentId?: number | null; // 원문 문서 ID (복사본인 경우)
  completedParagraphs?: number[]; // 완료된 문단 인덱스 배열
  createdBy?: {
    id: number;
    email: string;
    name: string;
  };
  lastModifiedBy?: {
    id: number;
    email: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  latestHandover?: {
    memo: string;
    terms?: string;
    completedParagraphs?: number[];
    handedOverBy?: {
      id: number;
      email: string;
      name: string;
    };
    handedOverAt: string;
  };
  /** 동일 원문에 관리자 번역 세션 활성(하트비트 TTL 내) */
  adminTranslationSessionActive?: boolean;
  adminSessionCopyDocumentId?: number | null;
  adminSessionUser?: {
    id: number;
    email: string;
    name: string;
  };
}

export interface CreateDocumentVersionRequest {
  versionType: 'ORIGINAL' | 'AI_DRAFT' | 'MANUAL_TRANSLATION' | 'FINAL';
  content: string;
  isFinal?: boolean;
}

export interface DocumentVersionResponse {
  id: number;
  documentId: number;
  versionNumber: number;
  versionType: string;
  content: string;
  isFinal: boolean;
  createdBy?: {
    id: number;
    email: string;
    name: string;
  };
  createdAt: string;
}

export interface UpdateDocumentRequest {
  title?: string;
  status?: DocumentState;
  categoryId?: number;
  estimatedLength?: number;
  draftData?: string; // 임시저장 데이터 (JSON)
}

export interface DocumentCommentResponse {
  id: number;
  documentId: number;
  authorId: number;
  authorName: string;
  authorProfileImage?: string;
  content: string;
  createdAt: string;
}

export const documentApi = {
  /**
   * 문서 생성
   */
  createDocument: async (request: CreateDocumentRequest): Promise<DocumentResponse> => {
    const response = await apiClient.post<DocumentResponse>('/documents', request);
    return response.data;
  },

  /**
   * 문서 조회
   */
  getDocument: async (id: number): Promise<DocumentResponse> => {
    const response = await apiClient.get<DocumentResponse>(`/documents/${id}`);
    return response.data;
  },

  /**
   * 원문 문서 ID로 복사본(다른 사람 작업물) 목록 조회
   */
  getCopiesBySourceId: async (sourceDocumentId: number): Promise<DocumentResponse[]> => {
    const response = await apiClient.get<DocumentResponse[]>(`/documents/${sourceDocumentId}/copies`);
    return response.data;
  },

  /**
   * 원문 ID 목록에 대해 IN_TRANSLATION 복사본 개수만 배치 조회 (목록 인원 칸용, 단일 요청)
   */
  getInTranslationCopyCounts: async (sourceDocumentIds: number[]): Promise<Record<string, number>> => {
    const response = await apiClient.post<Record<string, number>>(
      '/documents/in-translation-copy-counts',
      sourceDocumentIds
    );
    return response.data ?? {};
  },

  /**
   * URL로 이미 문서가 존재하는지 확인 (초벌 번역 중복 방지용)
   */
  checkUrlExists: async (url: string): Promise<{ exists: boolean }> => {
    const response = await apiClient.get<{ exists: boolean }>(
      `/documents/check-url?url=${encodeURIComponent(url.trim())}`
    );
    return response.data;
  },

  /**
   * 현재 사용자가 해당 원문에서 만든 복사본이 있는지 조회 (번역 시작 전 중복 방지용)
   */
  getMyCopyBySourceId: async (sourceDocumentId: number): Promise<DocumentResponse | null> => {
    try {
      const response = await apiClient.get<DocumentResponse>(
        `/documents/${sourceDocumentId}/my-copy`
      );
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  /**
   * 해당 문서를 바탕으로 이어받기용 복사본 생성 (관리자/중간관리자). 원작업자 문서에는 영향 없음.
   */
  copyForContinuation: async (documentId: number): Promise<DocumentResponse> => {
    const response = await apiClient.post<DocumentResponse>(`/documents/${documentId}/copy-for-continuation`);
    return response.data;
  },

  /**
   * 문서 수정
   */
  updateDocument: async (id: number, request: UpdateDocumentRequest): Promise<DocumentResponse> => {
    const response = await apiClient.put<DocumentResponse>(`/documents/${id}`, request);
    return response.data;
  },

  /**
   * 문서 상태만 업데이트
   */
  updateDocumentStatus: async (id: number, status: string): Promise<DocumentResponse> => {
    const response = await apiClient.put<DocumentResponse>(`/documents/${id}`, { status });
    return response.data;
  },

  /**
   * 문서 버전 생성
   */
  createDocumentVersion: async (
    documentId: number,
    request: CreateDocumentVersionRequest
  ): Promise<DocumentVersionResponse> => {
    const response = await apiClient.post<DocumentVersionResponse>(
      `/documents/${documentId}/versions`,
      request
    );
    return response.data;
  },

  /**
   * 문서의 모든 버전 삭제
   */
  deleteAllVersions: async (documentId: number): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}/versions`);
  },

  /**
   * 문서 버전 목록 조회
   */
  getDocumentVersions: async (documentId: number): Promise<DocumentVersionResponse[]> => {
    const response = await apiClient.get<DocumentVersionResponse[]>(
      `/documents/${documentId}/versions`
    );
    return response.data;
  },

  /**
   * 현재 버전 조회
   */
  getCurrentVersion: async (documentId: number): Promise<DocumentVersionResponse> => {
    const response = await apiClient.get<DocumentVersionResponse>(
      `/documents/${documentId}/versions/current`
    );
    return response.data;
  },

  /**
   * 크롤링 실행 (Translation.jsx와 동일한 방식)
   */
  crawlWebPage: async (url: string): Promise<{ html: string; css: string; success: boolean; errorMessage?: string }> => {
    const response = await translationApi.translateWebPage({
      url: url.trim(),
      targetLang: 'NONE', // 번역하지 않음을 나타내는 특수 값
      sourceLang: undefined,
    });
    return {
      html: response.originalHtml || '',
      css: response.css || '',
      success: response.success || false,
      errorMessage: response.errorMessage,
    };
  },

  /**
   * HTML 번역
   */
  translateHtml: async (html: string, sourceLang: string, targetLang: string): Promise<string> => {
    const response = await translationApi.translateHtml({
      html,
      sourceLang,
      targetLang,
    });
    return response.translatedHtml || '';
  },

  /**
   * 문서 목록 조회
   */
  getAllDocuments: async (params?: {
    status?: string;
    categoryId?: number;
    excludePendingTranslation?: boolean;
    /** 원문만 조회(복사본 제외). 번역 대기 목록에서 원문이 항상 보이도록 할 때 사용 */
    sourcesOnly?: boolean;
    title?: string;
  }): Promise<DocumentResponse[]> => {
    const queryParams = new URLSearchParams();
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.categoryId) {
      queryParams.append('categoryId', params.categoryId.toString());
    }
    if (params?.excludePendingTranslation) {
      queryParams.append('excludePendingTranslation', 'true');
    }
    if (params?.sourcesOnly) {
      queryParams.append('sourcesOnly', 'true');
    }
    if (params?.title) {
      queryParams.append('title', params.title);
    }
    const queryString = queryParams.toString();
    const url = `/documents${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.get<DocumentResponse[]>(url);
    return response.data;
  },

  /**
   * 문서 찜 추가
   */
  addFavorite: async (documentId: number): Promise<void> => {
    await apiClient.post(`/documents/${documentId}/favorite`);
  },

  /**
   * 문서 찜 제거
   */
  removeFavorite: async (documentId: number): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}/favorite`);
  },

  /**
   * 찜한 문서 목록 조회
   */
  getFavoriteDocuments: async (): Promise<DocumentResponse[]> => {
    const response = await apiClient.get<DocumentResponse[]>('/documents/favorites');
    return response.data;
  },

  /**
   * 문서 찜 여부 확인
   */
  isFavorite: async (documentId: number): Promise<boolean> => {
    const response = await apiClient.get<{ isFavorite: boolean }>(`/documents/${documentId}/favorite`);
    return response.data.isFavorite;
  },

  /**
   * 문서 id 목록 중 찜한 문서 id만 일괄 조회 (목록 N+1 방지)
   */
  getFavoriteBulkStatus: async (documentIds: number[]): Promise<number[]> => {
    if (documentIds.length === 0) return [];
    const response = await apiClient.post<{ favoriteDocumentIds: number[] }>(
      "/documents/favorites/bulk-status",
      { documentIds },
    );
    return response.data.favoriteDocumentIds ?? [];
  },

  /**
   * 문서 삭제
   */
  deleteDocument: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/documents/${id}`);
    return response.data;
  },

  // ──────────────────────────────────────────────
  //  문서 댓글 (소통 채팅)
  // ──────────────────────────────────────────────

  /**
   * 문서 댓글 목록 조회 (시간 오름차순)
   */
  getDocumentComments: async (documentId: number): Promise<DocumentCommentResponse[]> => {
    const response = await apiClient.get<DocumentCommentResponse[]>(
      `/documents/${documentId}/comments`
    );
    return response.data;
  },

  /**
   * 문서 댓글 작성
   */
  addDocumentComment: async (documentId: number, content: string): Promise<DocumentCommentResponse> => {
    const response = await apiClient.post<DocumentCommentResponse>(
      `/documents/${documentId}/comments`,
      { content }
    );
    return response.data;
  },

  /**
   * 문서 댓글 삭제
   */
  deleteDocumentComment: async (documentId: number, commentId: number): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}/comments/${commentId}`);
  },
};

