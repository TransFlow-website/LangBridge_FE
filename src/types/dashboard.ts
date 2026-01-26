export interface Document {
  id: number;
  title: string;
  category: string;
  estimatedVolume?: string; // 예상 분량
  lastModified?: string; // 마지막 수정 시점
  progress?: number; // 번역 진행률 (0-100)
  translator?: string; // 번역한 봉사자 이름
}

export interface DashboardData {
  pendingDocuments: Document[]; // 번역이 필요한 문서
  workingDocuments: Document[]; // 작업 중인 문서
  reviewPendingCount?: number; // 검토 대기 개수 (관리자)
  latestReviewDocument?: Document; // 최신 검토 문서 (관리자)
  approvedDocuments?: Document[]; // 승인된 문서
  rejectedDocuments?: Document[]; // 반려된 문서
}

