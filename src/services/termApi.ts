import apiClient from './api';

export interface TermDictionaryResponse {
  id: number;
  sourceTerm: string;
  targetTerm: string;
  sourceLang: string;
  targetLang: string;
  description?: string;
  category?: string; // 구분(분야)
  articleTitle?: string; // 기사제목
  articleSource?: string; // 출처(날짜)
  articleLink?: string; // 기사링크
  memo?: string; // 메모
  deeplGlossaryId?: string; // DeepL Glossary ID
  createdBy?: {
    id: number;
    email: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateTermRequest {
  sourceTerm: string;
  targetTerm: string;
  sourceLang: string;
  targetLang: string;
  description?: string;
  category?: string;
  articleTitle?: string;
  articleSource?: string;
  articleLink?: string;
  memo?: string;
}

export interface UpdateTermRequest {
  sourceTerm?: string;
  targetTerm?: string;
  sourceLang?: string;
  targetLang?: string;
  description?: string;
  category?: string;
  articleTitle?: string;
  articleSource?: string;
  articleLink?: string;
  memo?: string;
}

export interface BatchCreateTermRequest {
  sourceLang: string;
  targetLang: string;
  termsText: string; // TSV 형식: 구분\t영어\t한국어\t기사제목\t출처\t기사링크\t메모
}

export interface BatchCreateTermResponse {
  success: boolean;
  successCount: number;
  failedCount: number;
  errors: string[];
}

export interface TermDictionaryPageResponse {
  content: TermDictionaryResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export const termApi = {
  /**
   * 용어 목록 조회 (페이지네이션)
   */
  getAllTerms: async (params?: {
    sourceLang?: string;
    targetLang?: string;
    page?: number;
    size?: number;
  }): Promise<TermDictionaryPageResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.sourceLang) {
      queryParams.append('sourceLang', params.sourceLang);
    }
    if (params?.targetLang) {
      queryParams.append('targetLang', params.targetLang);
    }
    if (params?.page !== undefined) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.size !== undefined) {
      queryParams.append('size', params.size.toString());
    }
    const queryString = queryParams.toString();
    const url = `/terms${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.get<TermDictionaryPageResponse>(url);
    return response.data;
  },

  /**
   * 용어 상세 조회
   */
  getTermById: async (id: number): Promise<TermDictionaryResponse> => {
    const response = await apiClient.get<TermDictionaryResponse>(`/terms/${id}`);
    return response.data;
  },

  /**
   * 용어 검색
   */
  searchTerm: async (
    sourceTerm: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TermDictionaryResponse | null> => {
    try {
      const response = await apiClient.get<TermDictionaryResponse>('/terms/search', {
        params: { sourceTerm, sourceLang, targetLang },
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * 용어 추가
   */
  createTerm: async (request: CreateTermRequest): Promise<TermDictionaryResponse> => {
    const response = await apiClient.post<TermDictionaryResponse>('/terms', request);
    return response.data;
  },

  /**
   * 용어 수정
   */
  updateTerm: async (id: number, request: UpdateTermRequest): Promise<TermDictionaryResponse> => {
    const response = await apiClient.put<TermDictionaryResponse>(`/terms/${id}`, request);
    return response.data;
  },

  /**
   * 용어 대량 추가
   */
  createTermsBatch: async (request: BatchCreateTermRequest): Promise<BatchCreateTermResponse> => {
    const response = await apiClient.post<BatchCreateTermResponse>('/terms/batch', request);
    return response.data;
  },

  /**
   * 용어 삭제
   */
  deleteTerm: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/terms/${id}`);
    return response.data;
  },

  /**
   * 용어집 전체 내보내기 (TSV 형식)
   */
  exportTerms: async (params?: {
    sourceLang?: string;
    targetLang?: string;
  }): Promise<Blob> => {
    const queryParams = new URLSearchParams();
    if (params?.sourceLang) {
      queryParams.append('sourceLang', params.sourceLang);
    }
    if (params?.targetLang) {
      queryParams.append('targetLang', params.targetLang);
    }
    const queryString = queryParams.toString();
    const url = `/terms/export${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.get(url, {
      responseType: 'blob',
    });
    return response.data;
  },
};

