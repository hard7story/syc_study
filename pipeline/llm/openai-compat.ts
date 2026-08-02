import { config } from '../config.ts';
import type { RawArticle, SummaryResult } from '../types.ts';
import { buildUserPrompt, SYSTEM_PROMPT, type LlmProvider } from './provider.ts';

/**
 * OpenAI 호환 엔드포인트 구현 (확장 지점).
 * 미니PC의 Ollama(`ollama serve`, 기본 http://localhost:11434/v1) 등
 * OpenAI 호환 서버를 가리키면 API 비용 없이 로컬에서 요약·번역 가능.
 *
 * 사용법: LLM_PROVIDER=openai-compat OPENAI_BASE_URL=http://<미니PC>:11434/v1 OPENAI_MODEL=<모델명>
 */
export class OpenAiCompatProvider implements LlmProvider {
  readonly name: string;

  constructor() {
    this.name = `openai-compat/${config.openaiModel}`;
  }

  async summarize(article: RawArticle): Promise<SummaryResult> {
    const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.OPENAI_API_KEY ? { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n반드시 {"oneLineKo": string, "summaryKo": string, "tags": string[]} 형태의 JSON만 출력하세요.` },
          { role: 'user', content: buildUserPrompt(article) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`openai-compat HTTP ${res.status}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return JSON.parse(data.choices[0].message.content) as SummaryResult;
  }

  reportUsage(): void {
    console.log(`[usage] ${this.name} — 로컬 실행, API 비용 없음`);
  }
}
