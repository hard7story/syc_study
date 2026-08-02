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
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
  /** openai-compat (미니PC Ollama 등 확장용) */
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  openaiModel: process.env.OPENAI_MODEL ?? 'llama3',
  /** 수집 시 사용할 User-Agent (AI봇 UA는 일부 사이트 robots에서 차단됨) */
  userAgent: 'syc-study-bot/0.1 (personal tech digest; contact: hard7story@gmail.com)',
  /** seen.json 보관 일수 */
  seenRetentionDays: 30,
} as const;

/** KST 기준 오늘 날짜 YYYY-MM-DD */
export function kstDateString(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
