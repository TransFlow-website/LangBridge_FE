import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30초 (크롤링 시간 고려)
})

export interface TranslationRequest {
  url: string
  targetLang: string
  sourceLang?: string
}

export interface TranslationResponse {
  originalUrl: string
  originalText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  success: boolean
  errorMessage?: string
}

export const translationApi = {
  // 웹페이지 번역
  translateWebPage: async (request: TranslationRequest): Promise<TranslationResponse> => {
    const response = await apiClient.post<TranslationResponse>('/translate/webpage', request)
    return response.data
  },

  // 헬스체크
  healthCheck: async (): Promise<string> => {
    const response = await apiClient.get<string>('/translate/health')
    return response.data
  },
}

export default apiClient

