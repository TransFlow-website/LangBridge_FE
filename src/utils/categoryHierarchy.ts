/**
 * DB/관리자에서 쓰는 `대분류-소분류` 형태 이름을 첫 하이픈 기준으로 분리합니다.
 */
export function splitCategoryName(name: string | undefined | null): { major: string; minor: string } | null {
  if (name == null || String(name).trim() === '') return null;
  const s = String(name).trim();
  const i = s.indexOf('-');
  if (i <= 0) return null;
  const major = s.slice(0, i).trim();
  const minor = s.slice(i + 1).trim();
  if (!major) return null;
  return { major, minor };
}

export function uniqueSortedMajorNames(categoryNames: Iterable<string>): string[] {
  const majors = new Set<string>();
  for (const name of categoryNames) {
    const p = splitCategoryName(name);
    if (p) majors.add(p.major);
  }
  return Array.from(majors).sort((a, b) => a.localeCompare(b, 'ko'));
}

export function minorNamesForMajor(categoryNames: Iterable<string>, major: string): string[] {
  const minors = new Set<string>();
  for (const name of categoryNames) {
    const p = splitCategoryName(name);
    if (p && p.major === major) minors.add(p.minor);
  }
  return Array.from(minors).sort((a, b) => a.localeCompare(b, 'ko'));
}
