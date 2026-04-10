---
name: skill-review
description: |
  스킬(SKILL.md)과 슬래시 커맨드(commands/*.md)를 AI 에이전트 실행 관점에서 검토.
  공식 Claude Code 가이드를 라이브 페치하여 최신 기준을 단일 진실 소스로 사용한다.
  트리거: "스킬 리뷰", "이 스킬 괜찮아?", "SKILL.md 검토", "스킬 품질",
  "커맨드 리뷰", "슬래시 커맨드 검토", "command review",
  "skill review", "plugin 스킬 리뷰", "trigger 검토", "frontmatter 검토",
  "이 커맨드 제대로 됐어?", "플러그인 문서 리뷰",
  "스킬 트리거 안 돼", "플러그인 SKILL.md 검토",
  "review my skill", "audit slash command", "check SKILL.md"
allowed-tools: Read, Grep, Glob, WebFetch, Bash, Task, AskUserQuestion
---

# Skill Review

스킬과 슬래시 커맨드 문서를 **AI 에이전트가 실행하는 지시문**이라는 관점에서 검토한다. 대상은 SKILL.md를 대표로 하지만, 현 시점 공식 Claude Code 가이드가 스킬과 커맨드를 같은 기준으로 다루므로 `commands/*.md`도 동일한 기준으로 함께 커버한다.

플러그인 내부의 README나 사람 대상 문서는 이 스킬의 대상이 아니다.

## 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| 대상 | N | 리뷰할 SKILL.md 또는 `commands/*.md` 파일 경로. 없으면 현재 대화/저장소에서 최근 수정된 스킬/커맨드 문서를 자동 탐색 |

## Workflow

> Step 0(의도 정합성)이 **Clear & Aligned**로 판정된 경우에만 Step 1 이후의 기술적 리뷰를 수행한다. Misaligned/Unclear인 경우 Step 0의 지시에 따른다.

### Step 0: 의도 정합성 검증 (Priority-0)

이 스킬/커맨드 문서가 사용자가 의도한 **트리거/동작/범위/제약**을 정확히 반영하는지 가장 먼저 검증한다. `${CLAUDE_PLUGIN_ROOT}/reference/intent-alignment.md`의 프로토콜을 전부 따른다.

1. `${CLAUDE_PLUGIN_ROOT}/reference/intent-alignment.md` Read하여 절차 로드. 의도 수집 포커스는 해당 문서 "스킬별 의도 수집 포커스" 표의 **`skill-review` 행**(트리거 조건, 실행 동작, 범위, 제약)을 따른다
2. 의도 출처 수집
   - 현재 대화 컨텍스트: 사용자가 이 스킬/커맨드에 원한 트리거 조건, 실행 동작, 범위, 제약
   - 관련 플랜 파일, 이슈/PR 설명, 플러그인 루트의 CLAUDE.md, 플러그인 README
   - 플러그인 카탈로그 규칙 (cc-plugins의 CLAUDE.md 등)
3. 의도-문서 매핑 — 요구사항별로 frontmatter, description 트리거 키워드, Workflow 단계, allowed-tools에 실제 반영됐는지 매핑 테이블 작성
4. 판정
   - **Clear & Aligned** → Step 1로 진행
   - **Clear but Misaligned** → 일반 리뷰 중단. "정합성 복구 항목"을 Fix Plan 필수 수정에 우선 배치 (Step 7에서 컨펌)
   - **Unclear** → 회의 주최 (AskUserQuestion 또는 `knowledge-tools:ontology-workshop` 위임) → 의도 명확화 후 Step 0 재실행

Step 0의 결과는 Step 6 보고서의 "Step 0: 의도 정합성 검증" 섹션에 그대로 포함한다.

### Step 1: 대상 파악

1. 인자가 있으면 해당 파일을 Read
2. 없으면 현재 대화 컨텍스트에서 최근 언급된 스킬/커맨드를 찾거나, 저장소에서 최근 수정된 `skills/*/SKILL.md` 또는 `commands/*.md`를 Glob으로 탐색
3. 파일 타입 감지
   - `**/skills/<name>/SKILL.md` → **스킬**
   - `**/commands/<name>.md` → **커맨드** (공식 가이드에서 스킬과 같은 기준으로 다뤄짐)
4. 대상이 불명확하면 AskUserQuestion으로 확인: "어떤 스킬/커맨드를 리뷰할까요?"

> 향후 `**/agents/<name>.md`(subagent 정의)도 동일 방식으로 리뷰 대상에 포함할 수 있다. 현재 버전은 스킬·커맨드만 대상으로 한다.

### Step 2: 공식 가이드 페치 (캐시 + TTL + Fallback + 연속실패 감지)

`${CLAUDE_PLUGIN_ROOT}/reference/skill-review-criteria.md`를 Read하여 상세 알고리즘·임계값·`.meta.json` 스키마를 로드한다. 이 SKILL.md는 실행 절차를 명령형으로 담고, 수치·스키마 상세는 reference를 단일 출처로 사용한다.

캐시 쓰기는 `Bash` 도구로 수행한다 (Write 도구 불필요). 모든 파일 경로는 `${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs/` 아래.

1. **캐시 디렉토리 보장**
   ```bash
   mkdir -p "${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs"
   ```
   `.meta.json`이 없으면 reference 스키마대로 초기 파일 생성:
   ```bash
   META="${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs/.meta.json"
   [ -f "$META" ] || printf '%s' '{"pages":{},"failures":{"consecutive":0,"last_success_at":null,"last_failure_at":null,"last_error":null}}' > "$META"
   ```
   > `${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs/`는 `review-flow/.gitignore`에 이미 제외되어 있으므로 런타임 쓰기가 저장소에 커밋되지 않는다. 이 사실을 전제로 한다.

2. **`llms.txt` 라이브 페치 시도**
   - `WebFetch`로 `https://code.claude.com/docs/llms.txt` 요청
   - **성공**:
     ```bash
     cat > "${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs/llms.txt" <<'EOF'
     <WebFetch 결과 본문>
     EOF
     ```
     `.meta.json`의 `pages.llms.txt.fetched_at`와 `failures.last_success_at`를 KST ISO(예: `2026-04-10T12:00:00+09:00`)로 갱신, `failures.consecutive = 0`로 리셋 (`jq` 사용). 타임스탬프는 `TZ=Asia/Seoul`로 명시해 실제로 KST offset(`+0900`)이 찍히도록 한다:
     ```bash
     NOW=$(TZ=Asia/Seoul date +%Y-%m-%dT%H:%M:%S%z | sed 's/\(..\)$/:\1/')
     jq --arg now "$NOW" '.pages["llms.txt"]={url:"https://code.claude.com/docs/llms.txt",fetched_at:$now,status:"ok"} | .failures.consecutive=0 | .failures.last_success_at=$now' "$META" > "$META.tmp" && mv "$META.tmp" "$META"
     ```
   - **실패**: `.meta.json`의 `failures.consecutive`를 1 증가시키고 `last_failure_at` / `last_error` 기록. 캐시 파일이 존재하면 Read로 로드하여 다음 단계로 진행

3. **페이지 URL 디스커버리** — 캐시된 `llms.txt`에서 리뷰 대상 타입에 필요한 페이지 URL을 추출한다 (URL 변경 대응)
   - 스킬 리뷰 → `skills` 페이지
   - 커맨드 리뷰 → `commands` 페이지 (+ 필요 시 `skills` 병합 섹션)
   - 공통 보조 → `plugins` / `sub-agents` / `hooks` 중 리뷰 대상에 관련된 것만

4. **개별 페이지 페치 (skills.md, commands.md 등)**
   - 캐시 `pages.<name>.fetched_at` 이 **24시간 이내**이면 → Read로 캐시 로드 (페치 생략)
   - 그 외 → `WebFetch` 시도
     - 성공 → 위와 동일한 `cat > ... <<'EOF'` 저장 + `jq`로 메타 갱신 + `failures.consecutive = 0`
     - 실패 → `failures.consecutive += 1` + 이전 캐시가 있으면 TTL 무시하고 사용

5. **`.meta.json` 원자적 갱신** — 모든 메타 갱신은 `jq ... > .meta.json.tmp && mv .meta.json.tmp .meta.json` 패턴을 사용하여 부분 쓰기 방지

6. **완전 실패 처리** (캐시도 없고 페치도 실패)
   - 보조 참조(`plugin-dev:skill-development`, `plugin-dev:command-development`)를 사용
   - 보고서 상단에 `⚠️ 공식 가이드 접근 실패 — 모든 판정 잠정(Tentative)` 경고 고정 표시

7. **연속 실패 감지 후처리** — `skill-review-criteria.md` §2-3 임계값을 적용
   - **Warning** (`consecutive ≥ 3` 또는 마지막 성공 > 72h) → 보고서 상단에 강한 경고 + 모든 판정에 "Tentative" 플래그
   - **Error** (`consecutive ≥ 5` 또는 마지막 성공 > 7d) → Fix Plan 섹션 직전에 `skill-review-criteria.md` §2-4 Step 5에 정의된 `AskUserQuestion`을 그대로 삽입. 사용자가 "중단"을 선택하면 리뷰 보고서 대신 `skill-review-criteria.md` §2-5의 **트러블슈팅 안내 출력 항목**만 출력

페치 결과에서 아래 카테고리의 최신 기준을 추출한다: Frontmatter 필드 유효성, description 품질(길이/키워드/인칭), 본문 길이/구조(라인 수/Progressive Disclosure), Agent 실행 가능성(명령형 문체/지시 대상), 동적 기능(`$ARGUMENTS`/`${CLAUDE_PLUGIN_ROOT}`/bash injection/파일 참조), 지원 파일 구조(scripts/reference/assets).

### Step 3: 위임 판단

대상이 **스킬**인 경우에만 적용한다. `plugin-dev:skill-reviewer` 에이전트가 사용 가능한지 확인:

- **가능** → `Task` 도구로 위임한다 (`allowed-tools`에 이미 포함됨). 호출 형식:
  ```
  subagent_type: "plugin-dev:skill-reviewer"
  description: "Review <filename> from harness perspective"
  prompt: [리뷰 대상 파일 내용 + Step 2에서 추출한 공식 기준 요약 + 재검증 요청]
  ```
  반환된 마크다운 보고서를 보관하여 Step 6의 "합의 / 불일치" 교차 비교 입력으로 사용한다. 위임 결과는 Step 2에서 페치한 **공식 가이드 기준으로 반드시 재검증**한다 (skill-reviewer의 로컬 기준이 stale일 수 있음). 불일치 시 공식 가이드를 따른다.
- **불가능** → Step 4 자체 리뷰로 진행

대상이 **커맨드**인 경우 전용 reviewer 에이전트가 없으므로 Step 4로 직행한다.

### Step 4: 자체 리뷰

Step 2에서 추출한 공식 가이드 기준을 아래 6개 카테고리별로 적용하여 PASS/WARN/FAIL 판정한다.

1. **Frontmatter 필드 유효성** — 최신 스키마의 필수/선택 필드 준수, 타입/제약 위반 여부
2. **description 트리거 품질** — 길이 제한, 트리거 키워드 충분성, 제3/2인칭 규칙
3. **본문 구조와 길이** — 라인 수 제한, Progressive Disclosure(요약 → 상세 → reference) 원칙
4. **문체** — Claude(에이전트)에게 내리는 명령형인지, 사람 대상 설명으로 빠지지 않았는지
5. **동적 기능 사용** — `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}`, bash injection, 파일 참조의 올바른 사용
6. **파일 참조 무결성** — `reference/`, `scripts/`, `assets/`에서 참조하는 파일이 실제로 존재하는지 Glob으로 확인

각 발견 항목에 `skill-review-criteria.md`의 심각도(Critical / Important / Suggestion)를 부여한다.

### Step 5: codex 병렬 리뷰 (선택적)

`/codex` 스킬이 사용 가능하면 동일 문서에 대해 독립 검토를 요청한다. 사용 불가하면 이 단계를 건너뛴다.

codex 프롬프트의 기준 URL은 **Step 2에서 디스커버리한 실제 URL**을 사용한다. `.meta.json`의 `pages.*.url` 값을 주입하여 하드코딩을 피한다 (llms.txt가 URL을 변경해도 따라감).

codex에 전달할 프롬프트 템플릿:

```
다음 SKILL.md/커맨드 문서를 AI 에이전트 실행 관점에서 검토해주세요.
기준 URL (Step 2에서 라이브 디스커버리된 공식 가이드):
  - {llms.txt URL}
  - {skills.md URL 또는 commands.md URL}
  - {기타 페치된 페이지 URL 목록}
관점: frontmatter 유효성, description 트리거 품질, 본문 구조,
명령형 문체, 동적 기능 사용, 파일 참조 무결성.
각 발견 사항에 Critical/Important/Suggestion 심각도를 부여해주세요.

[문서 내용]
```

### Step 6: 교차 비교 & 보고서 작성

Step 3(위임 결과, 재검증됨) + Step 4(자체 리뷰) + Step 5(codex) 결과를 비교하여:

- **합의**: 여러 소스가 모두 지적 → 신뢰도 높음
- **공식 가이드와 위임/codex 결과 불일치**: 공식 가이드를 채택
- **한쪽만 지적**: 맥락과 함께 보고

다음 총평 임계값은 **review-flow 자체 규칙**이다. 공식 Claude Code 가이드가 별도 총평 기준을 규정하지 않는 한 이 규칙을 적용한다. 공식 가이드에 상충하는 규정이 생기면 공식을 우선한다.

총평 판정:

- **PASS**: Critical 0건, Important 2건 이하
- **WARN**: Critical 0건, Important 3건 이상
- **BLOCK**: Critical 1건 이상 (또는 Step 0이 Clear but Misaligned)

보고서 템플릿은 `${CLAUDE_PLUGIN_ROOT}/reference/skill-review-report-template.md`를 Read로 로드하여 그대로 채운다. 모든 섹션(총평 → Step 0 → 기준 소스 → Why → What → How → Fix Plan)을 생략 없이 작성한다. 템플릿 파일 자체가 사용 규칙과 각 섹션 가이드를 포함한다.

주요 작성 원칙:
- 카테고리별 평가 테이블에 Critical / Important / Suggestion 건수 집계
- "합의" / "공식 가이드와 위임 결과 불일치" / 각 소스별 고유 발견 사항 구분 표기
- Fix Plan의 "필수 수정"에는 Critical + Important 항목을 배치, 각 항목마다 근거 URL·검증 방법 명시
- 페치된 URL은 Step 2 디스커버리 결과(`.meta.json.pages`)에서 그대로 기입 (하드코딩 금지)

Step 0이 **Clear but Misaligned**로 판정되어 Step 1 이후를 건너뛴 경우, 위 보고서의 "무엇을 (What)" 섹션 대신 "정합성 복구 항목"만 Fix Plan의 필수 수정에 배치하여 사용자 컨펌을 먼저 받는다.

연속 실패 **Error 임계**(`skill-review-criteria.md` §2-3)를 초과한 경우, Fix Plan 섹션 직전에 `skill-review-criteria.md` §2-4 Step 5에 정의된 `AskUserQuestion`을 그대로 삽입한다. 사용자가 "중단"을 선택하면 리뷰 보고서 대신 **`skill-review-criteria.md` §2-5의 트러블슈팅 안내 출력 항목**만 출력한다. 구체적 문구와 출력 항목은 reference를 단일 출처로 사용하며 이 파일에서 중복 정의하지 않는다.

### Step 7: Fix Plan 컨펌 대기

보고서 출력 직후 `AskUserQuestion`으로 사용자에게 Fix Plan에 대한 액션을 요청한다.

- **컨펌** → Fix Plan의 필수 수정부터 순차 실행. 각 수정 후 검증(파일 참조 유효성, frontmatter 파싱, 공식 가이드 기준 재확인) 결과를 요약 보고
- **피드백** → 피드백 반영하여 Fix Plan 재작성 후 Step 7 반복
- **부분 승인** → 사용자가 선택한 항목만 실행

사용자의 추가 지시 없이는 문서를 수정하지 않는다. 컨펌을 받지 않은 리뷰는 "보고서 출력 완료" 상태로 종료한다.
