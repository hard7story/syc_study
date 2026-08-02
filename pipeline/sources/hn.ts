import { fetchJson } from '../fetch-util.ts';
import type { RawArticle } from '../types.ts';

interface AlgoliaHit {
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  objectID: string;
  story_text?: string | null;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

/** Hacker News — Algolia API (단일 요청으로 점수·댓글수·날짜 포함) */
export async function fetchHackerNews(): Promise<RawArticle[]> {
  const data = await fetchJson<AlgoliaResponse>(
    'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
  );
  return data.hits.map((hit) => {
    const commentsUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
    return {
      source: 'hn' as const,
      id: commentsUrl,
      title: hit.title,
      url: hit.url ?? commentsUrl, // Ask/Show HN은 외부 링크가 없음
      commentsUrl,
      publishedAt: hit.created_at,
      score: hit.points,
      comments: hit.num_comments,
      snippet: hit.story_text ?? undefined,
    };
  });
}
