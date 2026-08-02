import type { DailyData, SourceId } from '../../pipeline/types.ts';

export type { DailyData, SummarizedArticle } from '../../pipeline/types.ts';

/** BASE_URL 정규화 — 항상 트레일링 슬래시 포함 */
export const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

const modules = import.meta.glob<DailyData>('../../data/daily/*.json', {
  eager: true,
  import: 'default',
});

/** 날짜 내림차순 정렬된 전체 데일리 데이터 */
export function getAllDays(): DailyData[] {
  return Object.values(modules)
    .filter((d) => d.articles.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getLatestDay(): DailyData | undefined {
  return getAllDays()[0];
}

export const SOURCE_META: Record<SourceId, { label: string; badgeClass: string }> = {
  hn: { label: 'Hacker News', badgeClass: 'bg-orange-100 text-orange-700' },
  geeknews: { label: 'GeekNews', badgeClass: 'bg-emerald-100 text-emerald-700' },
  yozm: { label: '요즘IT', badgeClass: 'bg-sky-100 text-sky-700' },
  reddit: { label: 'Reddit', badgeClass: 'bg-rose-100 text-rose-700' },
};

export function formatDateKo(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}
