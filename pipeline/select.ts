import { config } from './config.ts';
import type { RawArticle, SourceId } from './types.ts';

/** 제목 정규화 — 교차 소스 중복 판별용 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** GeekNews가 HN 인기 글을 한국어로 다루는 경우가 많아, 제목이 겹치는 해외 글은 제외 */
function isDuplicateOfKorean(article: RawArticle, koreanTitles: string[]): boolean {
  const norm = normalizeTitle(article.title);
  if (norm.length < 6) return false;
  return koreanTitles.some((k) => k.includes(norm) || (norm.includes(k) && k.length >= 6));
}

/**
 * 선별: seen 제외 → 소스별 필터/정렬 → 교차 소스 중복 제거 → 쿼터 적용 → 전체 상한 절단.
 * 순서는 소스 다양성 유지를 위해 라운드로빈으로 섞는다.
 */
export function selectArticles(all: RawArticle[], seenIds: Set<string>): RawArticle[] {
  const fresh = all.filter((a) => !seenIds.has(a.id));

  const bySource: Record<SourceId, RawArticle[]> = { hn: [], geeknews: [], yozm: [], reddit: [] };
  for (const a of fresh) bySource[a.source].push(a);

  // 한국어 소스(GeekNews/요즘IT)와 제목이 겹치는 HN/Reddit 글 제외
  const koreanTitles = [...bySource.geeknews, ...bySource.yozm].map((a) => normalizeTitle(a.title));
  bySource.hn = bySource.hn.filter((a) => !isDuplicateOfKorean(a, koreanTitles));
  bySource.reddit = bySource.reddit.filter((a) => !isDuplicateOfKorean(a, koreanTitles));

  // HN: 점수 필터 + 점수순
  bySource.hn = bySource.hn
    .filter((a) => (a.score ?? 0) >= config.hnMinPoints)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  // Reddit: 피드 순서(핫) 유지
  // GeekNews / 요즘IT: 최신순
  const byDateDesc = (a: RawArticle, b: RawArticle) =>
    Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  bySource.geeknews.sort(byDateDesc);
  bySource.yozm.sort(byDateDesc);

  // 쿼터 적용
  const quotaed: Record<SourceId, RawArticle[]> = {
    hn: bySource.hn.slice(0, config.quotas.hn),
    geeknews: bySource.geeknews.slice(0, config.quotas.geeknews),
    yozm: bySource.yozm.slice(0, config.quotas.yozm),
    reddit: bySource.reddit.slice(0, config.quotas.reddit),
  };

  // 라운드로빈으로 섞어 상한 절단
  const order: SourceId[] = ['geeknews', 'hn', 'yozm', 'reddit'];
  const selected: RawArticle[] = [];
  for (let i = 0; selected.length < config.maxArticles; i++) {
    let added = false;
    for (const src of order) {
      const next = quotaed[src][i];
      if (next && selected.length < config.maxArticles) {
        selected.push(next);
        added = true;
      }
    }
    if (!added) break;
  }
  return selected;
}
