import type { SourceId } from './types.ts';

// 로컬 실행 시 프로젝트 루트의 .env 로드 (없으면 무시 — CI에서는 secrets 사용)
try {
  process.loadEnvFile(new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
} catch {
  /* .env 없음 */
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  return v ? Number.parseInt(v, 10) : def;
}

export interface InterestKeyword {
  /** 동의어 그룹 — 여러 표기가 매칭돼도 그룹당 한 번만 집계 */
  alternatives: string[];
  weight: number;
}

/**
 * "java|자바:2,llm,자동화" 형식 파싱.
 * `,` = 키워드(그룹) 구분, `|` = 그룹 내 동의어 구분, `:숫자` = 그룹 가중치 (기본 1).
 */
export function parseKeywords(raw: string): InterestKeyword[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?):(\d+(?:\.\d+)?)$/);
      const body = m ? m[1] : part;
      const weight = m ? Number(m[2]) : 1;
      const alternatives = body
        .split('|')
        .map((alt) => alt.trim().toLowerCase())
        .filter(Boolean);
      return { alternatives, weight };
    })
    .filter((g) => g.alternatives.length > 0);
}

/** 기본 관심 키워드 — 취향에 맞게 수정하거나 INTEREST_KEYWORDS env로 오버라이드 */
const DEFAULT_INTEREST_KEYWORDS = 'llm:2,claude,ai,ollama,typescript,astro,자동화';

export const config = {
  /** 하루 처리 건수 상한 — 예산 가드 */
  maxArticles: envInt('MAX_ARTICLES', 20),
  /** 소스별 쿼터 (합이 maxArticles를 넘으면 앞에서부터 절단) */
  quotas: { hn: 8, geeknews: 6, yozm: 4, reddit: 2 } satisfies Record<SourceId, number>,
  /** HN 최소 점수 */
  hnMinPoints: envInt('HN_MIN_POINTS', 80),
  /** 수집 대상 서브레딧 */
  subreddits: ['programming'],
  /** 요약 입력 스니펫 최대 길이 (문자) — 토큰 상한 가드 */
  maxSnippetChars: envInt('MAX_SNIPPET_CHARS', 3000),
  /** LLM 설정 */
  llmProvider: process.env.LLM_PROVIDER ?? 'anthropic', // 'anthropic' | 'openai-compat'
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5',
  /** openai-compat (미니PC Ollama 등 확장용) */
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  openaiModel: process.env.OPENAI_MODEL ?? 'llama3',
  /** 수집 시 사용할 User-Agent (AI봇 UA는 일부 사이트 robots에서 차단됨) */
  userAgent: 'syc-study-bot/0.1 (personal tech digest; contact: hard7story@gmail.com)',
  /** seen.json 보관 일수 */
  seenRetentionDays: 30,
  /**
   * 관심 키워드 가중치 — 매칭되는 글이 소스 내에서 먼저 선별된다.
   * 형식: "키워드" 또는 "키워드:가중치" 콤마 구분.
   */
  // 빈 문자열(변수 미설정 상태로 전달)도 기본값으로 처리
  interestKeywords: parseKeywords(process.env.INTEREST_KEYWORDS?.trim() || DEFAULT_INTEREST_KEYWORDS),
} as const;

/** KST 기준 오늘 날짜 YYYY-MM-DD */
export function kstDateString(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
