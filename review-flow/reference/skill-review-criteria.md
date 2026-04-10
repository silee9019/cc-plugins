# Skill Review Criteria — 기준 소스와 페치 정책

이 문서는 skill-review 스킬의 **기준 그 자체를 담지 않는다**. 기준 내용을 직접 적으면 Claude Code 공식 가이드가 업데이트될 때마다 stale이 되기 때문이다.

대신 "**기준을 어디서 가져오는지**"와 "**어떻게 최신 상태를 유지하는지**"를 정의한다. 실제 판정에 쓰는 기준(frontmatter 필드, description 길이, Progressive Disclosure 원칙 등)은 매 실행 시 공식 가이드에서 라이브 페치한 내용을 사용한다.

## 1. Single Source of Truth (SSOT)

공식 Claude Code 가이드가 기준의 단일 진실 소스다. `plugin-dev:skill-reviewer` 같은 서드파티 에이전트도 보조 자료로만 사용하며, 공식 가이드와 불일치하면 공식 가이드를 따른다.

### 공식 URL 목록 (2026-04 확인됨)

| 페이지 | URL |
|--------|-----|
| 인덱스 (페이지 디스커버리) | `https://code.claude.com/docs/llms.txt` |
| Skills | `https://code.claude.com/docs/en/skills` |
| Commands | `https://code.claude.com/docs/en/commands` |
| Plugins | `https://code.claude.com/docs/en/plugins` |
| Sub-agents | `https://code.claude.com/docs/en/sub-agents` |
| Hooks | `https://code.claude.com/docs/en/hooks` |
| Settings | `https://code.claude.com/docs/en/settings` |
| Permissions | `https://code.claude.com/docs/en/permissions` |

> 구 URL `docs.claude.com`은 301 리다이렉트된다. URL 자체가 다시 바뀔 수 있으므로 항상 `llms.txt`를 먼저 페치하여 현재 유효한 URL을 디스커버하는 것이 안전하다.

## 2. 페치 정책 (캐시 + TTL + 라이브 + Fallback + 연속실패 감지)

skill-review는 매 실행마다 아래 알고리즘으로 공식 가이드에 접근한다. 네트워크 장애가 있어도 리뷰가 완전히 멈추지 않으면서, stale한 기준으로 판정하는 상황을 사용자에게 **투명하게** 알린다.

### 2-1. 캐시 위치와 구조

캐시 경로: `${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs/`

```
.cache/claude-docs/
├── llms.txt          # 페이지 디스커버리 인덱스
├── skills.md         # 스킬 가이드
├── commands.md       # 커맨드 가이드
├── plugins.md        # 플러그인 가이드 (필요 시)
└── .meta.json        # 페이지별 메타 + 전역 실패 카운터
```

이 디렉토리는 git ignore 대상이다 (`review-flow/.gitignore`).

### 2-2. `.meta.json` 스키마

```json
{
  "pages": {
    "llms.txt":  { "url": "https://code.claude.com/docs/llms.txt", "fetched_at": "2026-04-10T12:00:00+09:00", "status": "ok" },
    "skills.md": { "url": "https://code.claude.com/docs/en/skills", "fetched_at": "2026-04-10T12:00:05+09:00", "status": "ok" }
  },
  "failures": {
    "consecutive": 0,
    "last_success_at": "2026-04-10T12:00:05+09:00",
    "last_failure_at": null,
    "last_error": null
  }
}
```

- `pages.<name>.fetched_at`: 해당 페이지를 마지막으로 성공 페치한 시각 (KST, offset 포함)
- `failures.consecutive`: 마지막 성공 이후 누적된 연속 실패 횟수
- `failures.last_success_at`: 전체 페치 파이프라인이 마지막으로 성공한 시각
- `failures.last_error`: 가장 최근 실패의 에러 메시지 요약

### 2-3. 임계값

| 종류 | 조건 | 효과 |
|------|------|------|
| **TTL** | `fetched_at`이 현재 시각으로부터 24시간 이내 | 캐시를 신선한 것으로 간주 (페치 생략 가능) |
| **Warning** | `failures.consecutive >= 3` 또는 `last_success_at`이 **72시간** 이상 경과 | 보고서 상단에 강한 경고 표시. 모든 판정에 "Tentative" 플래그 |
| **Error** | `failures.consecutive >= 5` 또는 `last_success_at`이 **168시간(7일)** 이상 경과 | Fix Plan 직전에 중단 가능한 `AskUserQuestion` 삽입. 사용자가 중단을 선택하면 리뷰 대신 트러블슈팅 안내 출력 |

### 2-4. 실행 알고리즘

매 skill-review 호출 시 아래 순서로 수행한다.

1. **`llms.txt` 처리**
   - WebFetch로 `https://code.claude.com/docs/llms.txt` 페치 시도
   - **성공** → `.cache/claude-docs/llms.txt` 갱신, `pages.llms.txt.fetched_at`와 `failures.last_success_at` 갱신, `failures.consecutive = 0`
   - **실패** → `failures.consecutive += 1`, `failures.last_failure_at` / `last_error` 기록. 캐시 파일 존재 시 TTL 무시하고 사용 (경고는 Step 5에서 일괄 표기)

2. **페이지 URL 디스커버리**
   - `llms.txt`에서 리뷰에 필요한 페이지 URL을 추출한다 (URL 변경 대응)
   - 스킬 리뷰 → `skills.md`
   - 커맨드 리뷰 → `commands.md` (+ 필요 시 `skills.md`로 병합된 섹션 확인)
   - 공통 보조 → `plugins.md`, `sub-agents.md` 등 리뷰 대상에 관련된 것만

3. **개별 페이지 페치**
   - 각 페이지에 대해 `pages.<name>.fetched_at`이 **24h 이내**면 → 캐시 사용 (페치 생략)
   - 그 외 → 라이브 페치 시도
     - 성공 → 캐시 갱신 + `failures.consecutive = 0`
     - 실패 → `failures.consecutive += 1` + 이전 캐시가 있으면 TTL 무시하고 사용

4. **완전 실패 처리** (캐시도 없고 페치도 실패)
   - 보조 참조(`plugin-dev:skill-development`, `plugin-dev:command-development`)를 사용
   - 보고서 상단에 `⚠️ 공식 가이드 접근 실패 — 모든 판정 잠정(Tentative)` 고정 경고 출력

5. **연속 실패 감지 후처리** (캐시 사용 성공 여부와 무관)
   - `failures.consecutive >= 3` 또는 마지막 성공이 72h 이상 전이면:
     ```
     ⚠️ 경고: 공식 가이드 페치가 {consecutive}회 연속 실패했습니다.
     현재 캐시({last_success_at} 기준)로 판정하고 있으며 stale 가능성이 있습니다.
     ```
     를 보고서 상단에 표시하고 모든 판정 항목에 "Tentative" 플래그를 붙인다.
   - `failures.consecutive >= 5` 또는 마지막 성공이 7일 이상 전이면, Fix Plan 섹션 직전에 `AskUserQuestion`을 삽입한다:
     ```
     🚨 공식 가이드를 {consecutive}회 연속 가져오지 못했습니다.
     마지막 성공: {last_success_at}
     네트워크 또는 URL({https://code.claude.com/docs/llms.txt})을 확인한 뒤 재실행하시는 것을 권장합니다.
     계속 진행할까요?
     ```
     사용자가 "중단"을 선택하면 리뷰 보고서를 내지 않고 트러블슈팅 안내(마지막 에러, 캐시 상태, 권장 조치)만 출력한다.

## 3. 페치된 내용에서 추출할 기준 카테고리

라이브 페치 결과에서 아래 카테고리의 최신 내용을 추출해 판정에 사용한다. 각 카테고리의 구체적 수치/규칙은 공식 가이드에서만 가져온다.

| 카테고리 | 추출할 내용 |
|----------|------------|
| Frontmatter 필드 유효성 | 최신 필드 목록, 각 필드의 타입/제약, 필수/선택 구분 |
| description 품질 | 길이 제한, 트리거 키워드 권장사항, 3인칭/2인칭 규칙 |
| 본문 길이/구조 | 라인 수 제한, Progressive Disclosure 원칙 |
| Agent 실행 가능성 | 명령형 문체, 지시 대상 (Claude vs 사용자) |
| 동적 기능 | `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}`, bash injection, 파일 참조 등 지원 문법 |
| 지원 파일 구조 | `scripts/`, `reference/`, `assets/` 등 디렉토리의 역할과 규약 |

## 4. 보조 참조 (공식이 우선)

공식 가이드를 해석하기 어렵거나 페치 실패 Fallback 상황에서 보조로 사용한다. 공식 가이드와 불일치하면 항상 공식 가이드를 따른다.

- `plugin-dev:skill-reviewer` 에이전트 — 있으면 위임 대상 (결과는 공식 가이드로 재검증)
- `plugin-dev:skill-development` 스킬 — 캐시된 세부 가이드
- `plugin-dev:command-development` 스킬 — 커맨드 관련 보조
- `${CLAUDE_PLUGIN_ROOT}/reference/review-criteria.md` — review-flow 공통 원칙(심각도 분류 등)

## 5. 심각도 분류 (code-review와 통일)

| 등급 | 의미 | 예시 |
|------|------|------|
| **Critical** | 에이전트가 실행 불가능한 수준. 반드시 수정 | frontmatter 파손, 존재하지 않는 파일 참조, 공식 가이드에서 명시적으로 금지된 패턴 |
| **Important** | 트리거되지 않거나 오작동 가능성. 수정 권장 | 공식 가이드 권장사항 위반, description 키워드 부족, 모호한 단계 |
| **Suggestion** | 개선 제안. 선택적 | 공식 가이드의 bonus 권장사항, 더 효율적인 대안 제시 |

"Tentative" 플래그가 붙은 판정은 임계값(Warning/Error)을 초과한 상태에서 내린 결정이며, 공식 가이드가 복구되면 재검토가 필요함을 의미한다.
