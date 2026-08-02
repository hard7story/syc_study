import { config } from '../config.ts';
import type { RawArticle, SummaryResult } from '../types.ts';

/**
 * LLM 추상화 — 요약·번역 엔진 교체 지점.
 * 기본은 Claude API. 추후 미니PC의 로컬 LLM(Ollama 등 OpenAI 호환 서버)으로
 * 전환하려면 LLM_PROVIDER=openai-compat + OPENAI_BASE_URL 설정만 바꾸면 된다.
 */
export interface LlmProvider {
  readonly name: string;
  summarize(article: RawArticle): Promise<SummaryResult>;
  /** 실행 종료 시 사용량/비용 로그 출력 */
  reportUsage(): void;
}

export async function getProvider(): Promise<LlmProvider> {
  switch (config.llmProvider) {
    case 'anthropic': {
      const { AnthropicProvider } = await import('./anthropic.ts');
      return new AnthropicProvider();
    }
    case 'openai-compat': {
      const { OpenAiCompatProvider } = await import('./openai-compat.ts');
      return new OpenAiCompatProvider();
    }
    default:
      throw new Error(`알 수 없는 LLM_PROVIDER: ${config.llmProvider}`);
  }
}

export const SYSTEM_PROMPT = `당신은 한국 개발자를 위한 IT 뉴스 큐레이터입니다.
주어진 기사 정보를 바탕으로 한국어 요약을 작성하세요.

규칙:
- oneLineKo: 기사의 핵심을 한 문장(40자 이내)으로. 명사형 종결 선호.
- summaryKo: 3~4문장으로 핵심 내용 요약. 기술 용어는 널리 쓰이는 영문 표기를 유지 (예: Kubernetes, RSC).
- 이미 한국어인 기사도 동일한 형식으로 압축 요약.
- 본문 정보가 제목뿐이라면 제목에서 알 수 있는 범위만 서술하고 추측하지 않는다.
- tags: 기술 키워드 1~3개 (영문 소문자, 예: "rust", "llm", "devops").`;

export function buildUserPrompt(article: RawArticle): string {
  return [
    `출처: ${article.source}`,
    `제목: ${article.title}`,
    `URL: ${article.url}`,
    article.snippet ? `본문 일부:\n${article.snippet.slice(0, config.maxSnippetChars)}` : '(본문 없음 — 제목만 제공됨)',
  ].join('\n');
}
