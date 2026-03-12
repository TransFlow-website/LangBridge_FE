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
   * 번역 시작: 원문에서 복사본 생성 후 해당 문서 ID 반환 (락 없음)
   */
  startTranslation: async (sourceDocumentId: number): Promise<{ id: number }> => {
    const response = await apiClient.post<{ id: number }>(
      `/documents/${sourceDocumentId}/start-translation`
    );
    return response.data;
  },

  /**
   * @deprecated 락 제거됨. 문서 조회 시 document.completedParagraphs 사용. 404 시 스텁 반환.
   */
  getLockStatus: async (documentId: number): Promise<LockStatusResponse> => {
    try {
      const response = await apiClient.get<LockStatusResponse>(
        `/documents/${documentId}/lock-status`
      );
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        return { locked: false, canEdit: true, completedParagraphs: [] };
      }
      throw err;
    }
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

