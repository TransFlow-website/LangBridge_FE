import apiClient from './api';

export interface CategoryResponse {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
}

export const categoryApi = {
  /**
   * 카테고리 목록 조회
   */
  getAllCategories: async (): Promise<CategoryResponse[]> => {
    const response = await apiClient.get<CategoryResponse[]>('/categories');
    return response.data;
  },

  /**
   * 카테고리 상세 조회
   */
  getCategory: async (id: number): Promise<CategoryResponse> => {
    const response = await apiClient.get<CategoryResponse>(`/categories/${id}`);
    return response.data;
  },

  /**
   * 카테고리 생성 (관리자 권한 필요)
   */
  createCategory: async (request: CreateCategoryRequest): Promise<CategoryResponse> => {
    const response = await apiClient.post<CategoryResponse>('/categories', request);
    return response.data;
  },

  /**
   * 카테고리 수정 (관리자 권한 필요)
   */
  updateCategory: async (id: number, request: UpdateCategoryRequest): Promise<CategoryResponse> => {
    const response = await apiClient.put<CategoryResponse>(`/categories/${id}`, request);
    return response.data;
  },

  /**
   * 카테고리 삭제 (관리자 권한 필요)
   */
  deleteCategory: async (id: number): Promise<void> => {
    await apiClient.delete(`/categories/${id}`);
  },
};


