import type { APIRoute } from 'astro';
import { getAllDays } from '../lib/data.ts';

/**
 * 전체 기사 인덱스 (좋아요 페이지가 클라이언트에서 fetch).
 * snippet은 용량이 커서 제외 — 1건 ≈ 0.7KB, 1년치(≈7,000건) ≈ 5MB 수준.
 */
export const GET: APIRoute = () => {
  const articles = getAllDays().flatMap((day) =>
    day.articles.map((a) => ({
      date: day.date,
      id: a.id,
      source: a.source,
      title: a.title,
      url: a.url,
      externalUrl: a.externalUrl,
      commentsUrl: a.commentsUrl,
      score: a.score,
      comments: a.comments,
      oneLineKo: a.oneLineKo,
      summaryKo: a.summaryKo,
      tags: a.tags,
    })),
  );
  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), articles }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
