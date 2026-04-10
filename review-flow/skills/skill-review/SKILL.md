---
name: skill-review
description: |
  스킬(SKILL.md)과 슬래시 커맨드(commands/*.md)를 AI 에이전트 실행 관점에서 검토.
  공식 Claude Code 가이드를 라이브 페치하여 최신 기준을 단일 진실 소스로 사용한다.
  트리거: "스킬 리뷰", "이 스킬 괜찮아?", "SKILL.md 검토", "스킬 품질",
  "커맨드 리뷰", "슬래시 커맨드 검토", "command review",
  "skill review", "plugin 스킬 리뷰", "trigger 검토", "frontmatter 검토",
  "이 커맨드 제대로 됐어?", "플러그인 문서 리뷰"
allowed-tools: Read, Grep, Glob, WebFetch, Bash, Task, AskUserQuestion
---

# Skill Review

스킬과 슬래시 커맨드 문서를 **AI 에이전트가 실행하는 지시문**이라는 관점에서 검토한다. 대상은 SKILL.md를 대표로 하지만, 공식 Claude Code 가이드의 "커맨드 → 스킬 병합" 방향에 따라 `commands/*.md`도 동일한 기준으로 함께 커버한다.

플러그인 내부의 README나 사람 대상 문서는 이 스킬의 대상이 아니다.

## 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| 대상 | N | 리뷰할 SKILL.md 또는 `commands/*.md` 파일 경로. 없으면 현재 대화/저장소에서 최근 수정된 스킬/커맨드 문서를 자동 탐색 |

## Workflow

> Step 0(의도 정합성)이 **Clear & Aligned**로 판정된 경우에만 Step 1 이후의 기술적 리뷰를 수행한다. Misaligned/Unclear인 경우 Step 0의 지시에 따른다.

### Step 0: 의도 정합성 검증 (Priority-0)

이 스킬/커맨드 문서가 사용자가 의도한 **트리거/동작/범위/제약**을 정확히 반영하는지 가장 먼저 검증한다. `${CLAUDE_PLUGIN_ROOT}/reference/intent-alignment.md`의 프로토콜을 전부 따른다.

1. `${CLAUDE_PLUGIN_ROOT}/reference/intent-alignment.md` Read하여 절차 로드
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
   - `**/commands/<name>.md` → **커맨드** (legacy, 공식 가이드에서 스킬로 병합 중이므로 스킬 기준을 적용)
4. 대상이 불명확하면 AskUserQuestion으로 확인: "어떤 스킬/커맨드를 리뷰할까요?"

### Step 2: 공식 가이드 페치 (캐시 + TTL + Fallback + 연속실패 감지)

`${CLAUDE_PLUGIN_ROOT}/reference/skill-review-criteria.md`를 Read하여 상세 알고리즘/임계값을 로드한 뒤 그대로 따른다. 핵심 요약:

1. **`llms.txt` 페치 시도** — `https://code.claude.com/docs/llms.txt`를 WebFetch. 성공 시 `${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs/llms.txt`에 저장하고 `.meta.json`의 `failures.consecutive = 0`, `last_success_at` 갱신. 실패 시 `failures.consecutive += 1` + 캐시가 있으면 TTL 무시하고 사용
2. **페이지 URL 디스커버리** — `llms.txt`에서 리뷰 대상 타입에 필요한 페이지 URL 추출 (스킬 리뷰 → `skills`, 커맨드 리뷰 → `commands` + 필요 시 `skills` 병합 섹션, 공통 → `plugins`/`sub-agents`/`hooks` 중 관련된 것만)
3. **개별 페이지 페치** — 각 페이지 `fetched_at`이 24h 이내면 캐시 사용, 아니면 라이브 페치. 라이브 페치 성공/실패에 따라 `failures.consecutive` 갱신 및 캐시 사용
4. **완전 실패 처리** — 캐시도 없고 페치도 실패하면 보조 참조(`plugin-dev:skill-development`, `command-development`) 사용 + 보고서 상단에 "⚠️ 공식 가이드 접근 실패 — 모든 판정 잠정(Tentative)" 경고
5. **연속 실패 감지 후처리**
   - `failures.consecutive >= 3` 또는 `last_success_at`이 72h 이상 전 → 보고서 상단에 강한 경고, 모든 판정에 "Tentative" 플래그
   - `failures.consecutive >= 5` 또는 `last_success_at`이 7일 이상 전 → Fix Plan 직전에 AskUserQuestion으로 "네트워크/URL 확인 후 재실행" 권장, 사용자가 중단 선택 시 트러블슈팅 안내만 출력

페치 결과에서 아래 카테고리의 최신 기준을 추출한다: Frontmatter 필드 유효성, description 품질(길이/키워드/인칭), 본문 길이/구조(라인 수/Progressive Disclosure), Agent 실행 가능성(명령형 문체/지시 대상), 동적 기능(`$ARGUMENTS`/`${CLAUDE_PLUGIN_ROOT}`/bash injection/파일 참조), 지원 파일 구조(scripts/reference/assets).

### Step 3: 위임 판단

대상이 **스킬**인 경우에만 적용한다. `plugin-dev:skill-reviewer` 에이전트가 사용 가능한지 확인:

- **가능** → Agent 도구로 위임 (subagent_type: `plugin-dev:skill-reviewer`). 위임 결과는 Step 2에서 페치한 **공식 가이드 기준으로 반드시 재검증**한다. skill-reviewer의 로컬 기준이 stale일 수 있기 때문이다. 불일치 시 공식 가이드를 따른다
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

codex에 전달할 프롬프트:

```
다음 SKILL.md/커맨드 문서를 AI 에이전트 실행 관점에서 검토해주세요.
공식 Claude Code 가이드 (https://code.claude.com/docs/en/skills) 기준을 따르며,
관점: frontmatter 유효성, description 트리거 품질, 본문 구조, 명령형 문체,
동적 기능 사용, 파일 참조 무결성.
각 발견 사항에 Critical/Important/Suggestion 심각도를 부여해주세요.

[문서 내용]
```

### Step 6: 교차 비교 & 보고서 작성

Step 3(위임 결과, 재검증됨) + Step 4(자체 리뷰) + Step 5(codex) 결과를 비교하여:

- **합의**: 여러 소스가 모두 지적 → 신뢰도 높음
- **공식 가이드와 위임/codex 결과 불일치**: 공식 가이드를 채택
- **한쪽만 지적**: 맥락과 함께 보고

총평 판정:

- **PASS**: Critical 0건, Important 2건 이하
- **WARN**: Critical 0건, Important 3건 이상
- **BLOCK**: Critical 1건 이상 (또는 Step 0이 Clear but Misaligned)

보고서 템플릿:

```markdown
# Skill Review Report

## 총평: PASS | WARN | BLOCK
<1-2문장 요약>

## Step 0: 의도 정합성 검증

### 의도/요구사항 (수집됨)
1. [요구사항 1] — 출처: [대화 / 플랜 / 이슈 / CLAUDE.md]
2. [요구사항 2] — 출처: [...]

### 산출물 매핑
| 요구사항 | 문서 매핑 | 상태 |
|----------|----------|------|
| 요구사항 1 | [예: description 트리거 키워드 "X"] | ✅ 반영 |
| 요구사항 2 | — | ❌ 누락 |
| — | [문서 부분] | ⚠️ 과잉 |

### 판정: Clear & Aligned | Clear but Misaligned | Unclear

## 기준 소스 (Source of Truth)
- 공식 가이드 페치: ✅ 성공 | ⚠️ 캐시 사용(stale 가능성) | 🚨 실패(Tentative)
- 페치된 URL:
  - https://code.claude.com/docs/llms.txt (인덱스)
  - https://code.claude.com/docs/en/skills
  - [기타 관련 페이지]
- 마지막 성공 시각: YYYY-MM-DDTHH:MM+09:00
- 연속 실패 횟수: N
- Fallback 여부: [없음 / 보조 참조 사용]

## 왜 (Why) — 리뷰 배경
- 문서 종류: [스킬 / 커맨드]
- 파일 경로: [...]
- 이 문서의 목적

## 무엇을 (What) — 발견 사항

### 리뷰 소스
- [x/o] 공식 가이드 (라이브 페치)
- [x/o] plugin-dev:skill-reviewer 위임 (공식 가이드로 재검증됨)
- [x/o] 자체 리뷰
- [x/o] codex review

### 합의 (여러 소스 동의)
- [심각도] 설명 — 근거: [공식 가이드 URL#섹션]

### 공식 가이드와 위임 결과 불일치
- [항목] 위임: X / 공식: Y → 공식 채택

### 카테고리별 평가
| 카테고리 | Critical | Important | Suggestion |
|----------|----------|-----------|------------|
| Frontmatter 필드 유효성 | 0 | 0 | 0 |
| Description 트리거 | 0 | 0 | 0 |
| 본문 구조/길이 | 0 | 0 | 0 |
| 문체 (명령형, Claude 대상) | 0 | 0 | 0 |
| 동적 기능 사용 | 0 | 0 | 0 |
| 파일 참조 무결성 | 0 | 0 | 0 |

### 강점
- 잘된 부분

## 어떻게 (How) — 권장 조치
1. [조치] → 검증: [방법] → 근거: [공식 가이드 URL/섹션]
2. ...

## 수정 계획 (Fix Plan)

> 이 계획에 대해 **컨펌**하시면 수정을 진행합니다. 수정이 필요하면 **피드백**을 주세요.

### 필수 수정 (Critical + Important)
1. **[파일:라인 또는 섹션]** — [무엇을 어떻게 바꿀지 구체적 액션]
   - 근거: [공식 가이드 URL/섹션 또는 리뷰 발견 근거]
   - 검증: [수정 후 확인 방법]
2. ...

### 선택 수정 (Suggestion)
1. **[...]** — [...]

### 실행 순서
1. 필수 1 → 필수 2 → ...
2. 각 수정 후 검증 단계
3. 전체 재리뷰 권장 여부

### 사용자 액션 요청
- [ ] **컨펌** → 위 계획대로 수정 진행
- [ ] **피드백** → 아래 피드백을 받아 계획 수정 후 재확인
- [ ] **부분 승인** → 특정 항목만 선택하여 수정
```

Step 0이 **Clear but Misaligned**로 판정되어 Step 1 이후를 건너뛴 경우, 위 보고서의 "무엇을 (What)" 섹션 대신 "정합성 복구 항목"만 Fix Plan의 필수 수정에 배치하여 사용자 컨펌을 먼저 받는다.

연속 실패 Error 임계를 초과한 경우, Fix Plan 섹션 직전에 아래 AskUserQuestion을 삽입한다:

```
🚨 공식 가이드를 {consecutive}회 연속 가져오지 못했습니다.
마지막 성공: {last_success_at}
네트워크 또는 URL을 확인한 뒤 재실행하시는 것을 권장합니다.
계속 진행할까요?
```

사용자가 "중단"을 선택하면 리뷰 보고서 대신 트러블슈팅 안내(`last_error`, 캐시 상태, 권장 조치)만 출력한다.

### Step 7: Fix Plan 컨펌 대기

보고서 출력 직후 `AskUserQuestion`으로 사용자에게 Fix Plan에 대한 액션을 요청한다.

- **컨펌** → Fix Plan의 필수 수정부터 순차 실행. 각 수정 후 검증(파일 참조 유효성, frontmatter 파싱, 공식 가이드 기준 재확인) 결과를 요약 보고
- **피드백** → 피드백 반영하여 Fix Plan 재작성 후 Step 7 반복
- **부분 승인** → 사용자가 선택한 항목만 실행

사용자의 추가 지시 없이는 문서를 수정하지 않는다. 컨펌을 받지 않은 리뷰는 "보고서 출력 완료" 상태로 종료한다.
