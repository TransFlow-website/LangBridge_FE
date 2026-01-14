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
  estimatedLength?: number;
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
  }): Promise<DocumentResponse[]> => {
    const queryParams = new URLSearchParams();
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.categoryId) {
      queryParams.append('categoryId', params.categoryId.toString());
    }
    const queryString = queryParams.toString();
    const url = `/documents${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.get<DocumentResponse[]>(url);
    return response.data;
  },
};

