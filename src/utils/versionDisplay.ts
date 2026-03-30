/**
 * 번역 목록의 「현재 버전」 표시.
 * - 서버 `userFacingVersionNumber`가 있으면 우선 (API와 동일한 규칙).
 * - 없으면 `versionNumber`로 보조 (구 API): 0만 v1로 표시.
 * - 저장 DB 번호(0=원문,1=초벌,2=첫 수동…)는 그대로 두고, 표시만 v1,v2…로 맞춤.
 */
export function formatTranslationListVersionLabel(
  isFinal: boolean | undefined,
  versionNumber: number | null | undefined,
  userFacingVersionNumber?: number | null
): string {
  if (isFinal) return 'FINAL';
  const n = userFacingVersionNumber ?? versionNumber;
  if (n == null) return '-';
  if (n === 0) return 'v1';
  return `v${n}`;
}
