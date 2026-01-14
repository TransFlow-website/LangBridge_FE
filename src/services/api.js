import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5분 (418개 텍스트 노드 번역 시간 고려)
})

// 요청 인터셉터: JWT 토큰을 헤더에 추가
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    // 토큰 디코딩하여 roleLevel 확인 (디버깅용)
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('🔑 API 요청:', {
          url: config.url,
          method: config.method,
          hasToken: true,
          userId: payload.userId,
          roleLevel: payload.roleLevel,
          email: payload.email,
        });
      } catch (e) {
        console.log('🔑 API 요청:', {
          url: config.url,
          method: config.method,
          hasToken: true,
          token: `${token.substring(0, 20)}...`,
        });
      }
    } else {
      console.warn('⚠️ localStorage에 token이 없습니다!');
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('✅ Authorization 헤더 추가됨');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const translationApi = {
  // 웹페이지 번역
  translateWebPage: async (request) => {
    const response = await apiClient.post('/translate/webpage', request)
    return response.data
  },

  // HTML 문자열 직접 번역
  translateHtml: async (request) => {
    const response = await apiClient.post('/translate/html', request)
    return response.data
  },

  // 헬스체크
  healthCheck: async () => {
    const response = await apiClient.get('/translate/health')
    return response.data
  },
}

export default apiClient

