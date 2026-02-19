import apiClient from './api';

export interface ApiKeyResponse {
  id?: number;
  serviceName: string;
  hasApiKey: boolean;
  updatedAt?: string;
  updatedBy?: number;
}

export interface ApiKeyRequest {
  apiKey: string;
}

export const settingsApi = {
  /**
   * DeepL API 키 조회
   */
  getDeepLApiKey: async (): Promise<ApiKeyResponse> => {
    const response = await apiClient.get<ApiKeyResponse>('/settings/deepl-key');
    return response.data;
  },

  /**
   * DeepL API 키 저장/업데이트
   */
  saveDeepLApiKey: async (request: ApiKeyRequest): Promise<ApiKeyResponse> => {
    const response = await apiClient.post<ApiKeyResponse>('/settings/deepl-key', request);
    return response.data;
  },
};

