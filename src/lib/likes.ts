/**
 * 좋아요 저장소 — 브라우저 localStorage 기반 (서버 없는 정적 사이트).
 * 키는 `${date}:${article.id}` — seen.json이 30일만 보관하므로 id 재등장에 대비해 날짜를 붙인다.
 */
export const LIKES_STORAGE_KEY = 'syc_study:likes:v1';
export const LIKES_CHANGED_EVENT = 'syc-likes-changed';

export interface LikeEntry {
  date: string; // YYYY-MM-DD
  id: string; // article.id
  likedAt: string; // ISO
}

export type LikesMap = Record<string, LikeEntry>;

export function likeKey(date: string, id: string): string {
  return `${date}:${id}`;
}

export function readLikes(): LikesMap {
  try {
    const raw = localStorage.getItem(LIKES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as LikesMap) : {};
  } catch {
    return {};
  }
}

export function writeLikes(map: LikesMap): void {
  try {
    localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* 사생활 보호 모드 등 — 조용히 무시 */
  }
  window.dispatchEvent(new CustomEvent(LIKES_CHANGED_EVENT));
}

export function isLiked(date: string, id: string): boolean {
  return likeKey(date, id) in readLikes();
}

/** 토글 후 새 상태를 반환 */
export function toggleLike(date: string, id: string): boolean {
  const map = readLikes();
  const key = likeKey(date, id);
  if (key in map) {
    delete map[key];
    writeLikes(map);
    return false;
  }
  map[key] = { date, id, likedAt: new Date().toISOString() };
  writeLikes(map);
  return true;
}

export function removeLike(key: string): void {
  const map = readLikes();
  delete map[key];
  writeLikes(map);
}

export function likeCount(): number {
  return Object.keys(readLikes()).length;
}

/** 내보내기/가져오기 (기기 간 수동 동기화용) */
export function exportLikes(): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), likes: readLikes() }, null, 2);
}

export function importLikes(json: string): number {
  const parsed = JSON.parse(json);
  const incoming: LikesMap = parsed?.likes ?? parsed;
  if (!incoming || typeof incoming !== 'object') throw new Error('형식이 올바르지 않습니다');
  const map = readLikes();
  let added = 0;
  for (const [key, entry] of Object.entries(incoming)) {
    if (!entry || typeof entry !== 'object' || !('date' in entry) || !('id' in entry)) continue;
    if (!(key in map)) added++;
    map[key] = entry as LikeEntry;
  }
  writeLikes(map);
  return added;
}
