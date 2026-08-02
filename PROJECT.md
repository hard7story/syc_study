# syc_study — 데일리 테크 브리핑 (PoC)

GeekNews · 요즘IT · Hacker News · Reddit의 IT 소식을 매일 아침 수집해 Claude로 한국어 요약·번역하고, 모바일 친화 정적 사이트(GitHub Pages)로 제공하는 개인 학습용 서비스.

- **예산**: 월 $5 이내 (일 20건 상한 + 건당 입력 3,000자 절단으로 코드 레벨 가드)
- **기본 모델**: `claude-haiku-4-5` (예상 월 $2~4) — `ANTHROPIC_MODEL` env로 교체 가능
- **주기**: 매일 07:00 KST (GitHub Actions cron `0 22 * * *`)

## 구조

```
pipeline/               수집·선별·요약 파이프라인 (tsx로 실행)
  sources/              소스별 수집기 (hn, geeknews, yozm, reddit)
  llm/provider.ts       LLM 추상화 — 요약 엔진 교체 지점
  llm/anthropic.ts      Claude API 구현 (기본, structured outputs)
  llm/openai-compat.ts  OpenAI 호환 서버 구현 (미니PC Ollama 확장용)
  select.ts             선별: seen 제외, HN 점수 필터, 교차 소스 중복 제거, 쿼터
  run.ts                엔트리 (--dry-run: 수집·선별만 / --limit N: 건수 제한)
data/daily/*.json       날짜별 결과 (Actions가 커밋 — 아카이브 겸용)
data/seen.json          중복 방지 (30일 보관)
src/                    Astro 사이트 (index = 최신 브리핑, /archive = 날짜별)
.github/workflows/daily.yml   cron 수집 + Pages 배포
```

## 처음 배포하기 (남은 작업)

1. **GitHub 저장소 생성** — 공개 저장소 `syc_study` (공개면 Actions 무료)
   ```
   git remote add origin https://github.com/<계정>/syc_study.git
   git push -u origin main
   ```
2. **Anthropic API 키 발급** — https://console.anthropic.com → API Keys → 크레딧 $5 충전
3. **저장소 secret 등록** — 저장소 Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY`
4. **GitHub Pages 활성화** — Settings → Pages → Source를 **GitHub Actions**로 설정
5. **첫 실행** — Actions 탭 → "Daily briefing" → Run workflow (수동 트리거)
   - 완료 후 `https://<계정>.github.io/syc_study/` 접속 확인

> 저장소 이름을 다르게 하면 워크플로의 `SITE_BASE`가 자동으로 맞춰지므로 추가 설정 불필요.

## 로컬 실행

```bash
cp .env.example .env   # ANTHROPIC_API_KEY 입력
npm install
npx tsx pipeline/run.ts --dry-run    # 수집·선별만 (API 비용 없음)
npx tsx pipeline/run.ts --limit 3    # 3건만 실제 요약 (테스트, ~$0.01)
npm run dev                          # 사이트 확인 (localhost:4321/syc_study)
```

실행 로그 마지막에 토큰 사용량과 월 환산 비용이 출력된다.

## 운영 노트

- **관심 키워드**: 제목·본문에 키워드가 매칭되면 소스 내 선별 우선순위가 올라간다 (쿼터는 유지).
  기본값은 `pipeline/config.ts`의 `DEFAULT_INTEREST_KEYWORDS` — 직접 수정하거나
  `INTEREST_KEYWORDS="llm:2,rust,자동화"` env로 오버라이드 (`:숫자`는 가중치, 기본 1).
  제목 매칭은 가중치 전액, 본문 매칭은 절반. 실행 로그에서 `★점수`로 확인 가능.
- **비용 조정**: `MAX_ARTICLES`(기본 20), `pipeline/config.ts`의 쿼터, `ANTHROPIC_MODEL`
  - 품질 우선 시 `claude-sonnet-5` (비용 약 3~4배, 월 $8~ 예상 — $5 예산 초과 가능)
- **Reddit 429**: 클라우드 IP에서 자주 차단됨. 실패해도 다른 소스는 정상 수집(실패 허용 설계). 지속 실패 시 `config.ts`의 `subreddits`를 비우면 시도 자체를 생략.
- **요즘IT**: robots.txt `Crawl-delay: 5` 준수를 위해 요청 간 5초 대기가 들어 있음.
- **커리어리는 PoC에서 제외** — RSS/API가 없고 robots.txt가 내부 API 사용을 금지. 추가하려면 헤드리스 브라우저(Playwright) 필요.

## 확장 계획: 미니PC 로컬 LLM (API 비용 0)

파이프라인의 LLM 호출부는 `pipeline/llm/provider.ts`로 추상화되어 있어 코드 수정 없이 엔진 교체 가능:

1. 미니PC(리눅스)에 Ollama 설치, 모델 pull (한국어 요약 품질은 qwen3 계열 권장)
2. `ollama serve`가 OpenAI 호환 API 제공 (`http://<미니PC>:11434/v1`)
3. 실행 위치를 GitHub Actions → 미니PC cron으로 이전:
   ```bash
   # 미니PC crontab (07:00 KST)
   0 7 * * * cd ~/syc_study && LLM_PROVIDER=openai-compat OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_MODEL=qwen3:14b npx tsx pipeline/run.ts && git add data && git commit -m "data: daily" && git push
   ```
4. 사이트 빌드·배포는 기존 Actions가 push 트리거로 계속 수행 (수집 단계는 push 시 생략되도록 이미 구성됨)

## 남은 작업 / 개선 후보

- [x] GitHub 저장소 생성·푸시, secret 등록, Pages 활성화, 첫 수동 실행 — **2026-08-02 완료, 라이브: https://hard7story.github.io/syc_study/**
- [ ] 실제 실행 후 요약 품질 확인 — 미흡하면 프롬프트(`pipeline/llm/provider.ts`의 SYSTEM_PROMPT) 조정 또는 Sonnet 전환 검토
- [ ] 1주 운영 후 실비용 확인 (Actions 로그의 `[usage]` 라인)
- [ ] Batch API 전환으로 비용 50% 절감 (배치 완료 폴링 필요 — 현재는 단순 순차 호출)
- [x] 관심 키워드 기반 선별 가중치 — 2026-08-02 구현 (`pipeline/interest.ts`, 위 운영 노트 참조)
- [ ] 주간 다이제스트 페이지, 태그별 보기
- [ ] 커리어리 수집기 (Playwright 필요)
