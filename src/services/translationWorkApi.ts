import apiClient from './api';

export interface LockStatusResponse {
  locked: boolean;
  lockedBy?: {
    id: number;
    name: string;
    email: string;
  };
  lockedAt?: string;
  canEdit: boolean;
  completedParagraphs?: number[];
}

export interface HandoverRequest {
  completedParagraphs?: number[];
  memo: string;
  terms?: string;
}

export interface CompleteTranslationRequest {
  content: string;
  completedParagraphs?: number[];
}

export const translationWorkApi = {
  /**
   * 문서 락 획득
   */
  acquireLock: async (documentId: number): Promise<LockStatusResponse> => {
    const response = await apiClient.post<LockStatusResponse>(
      `/documents/${documentId}/lock`
    );
    return response.data;
  },

  /**
   * 락 상태 확인
   */
  getLockStatus: async (documentId: number): Promise<LockStatusResponse> => {
    const response = await apiClient.get<LockStatusResponse>(
      `/documents/${documentId}/lock-status`
    );
    return response.data;
  },

  /**
   * 락 해제
   */
  releaseLock: async (documentId: number): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/documents/${documentId}/lock`
    );
    return response.data;
  },

  /**
   * 인계 요청
   */
  handover: async (documentId: number, request: HandoverRequest): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/documents/${documentId}/handover`,
      request
    );
    return response.data;
  },

  /**
   * 번역 완료
   */
  completeTranslation: async (
    documentId: number,
    request: CompleteTranslationRequest
  ): Promise<{ success: boolean; message: string; status: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string; status: string }>(
      `/documents/${documentId}/complete`,
      request
    );
    return response.data;
  },

  /**
   * 임시 저장
   */
  saveTranslation: async (
    documentId: number,
    request: CompleteTranslationRequest
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.put<{ success: boolean; message: string }>(
      `/documents/${documentId}/translation`,
      request
    );
    return response.data;
  },

  /**
   * 관리자 락 강제 해제
   */
  releaseLockByAdmin: async (documentId: number): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/documents/${documentId}/lock/admin`
    );
    return response.data;
  },
};

