export type SourceId = 'hn' | 'geeknews' | 'yozm' | 'reddit';

/** 수집기가 반환하는 공통 형태 */
export interface RawArticle {
  source: SourceId;
  /** 중복 제거 키 (기본은 url) */
  id: string;
  title: string;
  url: string;
  /** 토론/댓글 페이지 (HN, GeekNews, Reddit) */
  commentsUrl?: string;
  /** 큐레이션 소스가 다루는 원문 URL (GeekNews) — 교차 소스 URL 중복 제거용 */
  externalUrl?: string;
  /** ISO 8601 */
  publishedAt: string;
  score?: number;
  comments?: number;
  /** 요약 입력용 본문 일부 (plain text) */
  snippet?: string;
}

export interface SummaryResult {
  oneLineKo: string;
  summaryKo: string;
  tags: string[];
}

export interface SummarizedArticle extends RawArticle, SummaryResult {}

export interface DailyData {
  date: string; // YYYY-MM-DD (KST)
  generatedAt: string; // ISO
  model: string;
  articles: SummarizedArticle[];
}
