/**
 * 마지막 수정일 등 목록/상세에서 표시할 날짜 포맷 (구체적 날짜, "몇 분 전" 대신)
 * 정렬 시 문자열 비교가 시간 순서와 맞도록 YYYY-MM-DD HH:mm 사용
 */
export function formatLastModifiedDate(dateString: string | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * 표시용 날짜 포맷 (한국식 읽기 쉬운 형태, 예: 2025.02.09 14:30)
 */
export function formatLastModifiedDateDisplay(dateString: string | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${d} ${h}:${min}`;
}
