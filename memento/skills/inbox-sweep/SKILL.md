---
name: inbox-sweep
description: Inbox `status:open` 항목을 git log / checkpoint raw log / WORKING.md와 교차 확인하여 이미 다른 경로로 해결된 후보를 찾아 정리. 사용자가 "inbox sweep", "inbox 정리", "inbox 역동기화", "완료된 inbox", "dead inbox"를 언급할 때 또는 review-day가 orchestrated 모드로 호출할 때 트리거.
user-invocable: true
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# Inbox 완료 역동기화 (inbox-sweep)

Inbox에 남아 있는 `status: open` 항목 중 **이미 다른 경로로 해결된 것**을 찾아 닫는다.

**근본 문제**: memento의 기본 흐름(planning → Daily Working → checkpoint/review-day)은 todo 파일 단위로만 상태를 추적한다. Inbox 원본 항목이 feature 통합·rename·스코프 흡수로 해결되면 **어디서도 자동 탐지되지 않는다**. 예: `2026-04-14 msteams-fetch Power Automate Flow API 조회 기능 검토` → `m365-fetch 0.4.0 (b521a77) Outlook/Flow 전면 통합`으로 해결됐으나 Inbox에 `status: open` 잔존.

이 skill은 heuristic 매칭으로 후보를 찾고 **자동 resolve 금지, 사용자 확인 후에만 상태 변경**한다.

## 발화 분기 / 모드·인자 해석

| 발화 | → 모드/인자 |
|---|---|
| "inbox sweep", "inbox 정리" | 대화형 기본 모드 |
| review-day가 호출 ("orchestrated") | `--orchestrated` — 후보 0건이면 조용히 반환, 있으면 요약 블록만 반환 |
| "최근 2주 inbox만 sweep" / "2026-04-01부터" | `--since 2026-04-01` 해석 |
| (다른 상위가 호출 + 날짜 제한) | 두 인자 조합 |

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `memento_root`, `inbox_folder_path`, `daily_archive_path`(또는 Archive IssueBox-done 경로 유추), `repos_base_path` 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**오늘 날짜** (`TODAY`):
```bash
TZ=Asia/Seoul date "+%Y-%m-%d"
```

**아카이브 경로** (`ARCHIVE_DIR`):
- `{vault_path}/99 Archives/IssueBox-done/{TODAY}/` (기본). `mkdir -p`로 선행 생성.
- 경로 커스터마이즈는 향후 config.md에 `resolved_inbox_archive_path`가 추가되면 우선 사용.

### Step 2: 저장소 매핑 로드

`{vault_path}/{memento_root}/user/control/repos.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `| ID | Path | ... |` 표를 파싱. `{source_project → path}` 맵 생성. Path가 `TBD`면 맵에 넣지 않음 |
| 파일 없음 | 빈 맵으로 진행 (fallback: `repos_base_path/<source_project>` 직접 시도) |

### Step 3: Inbox 전수 스캔

Glob: `{vault_path}/{inbox_folder_path}/**/*.md`

각 파일:
1. frontmatter 파싱 (`status`, `tags[]`, `source_project`, `category`, `created`, `priority`, `title`/H1)
2. 필터:
   - `status`가 `open` 또는 `blocked`가 아니면 스킵
   - `--since` 인자 있으면 `created` < since 이면 스킵
3. 키워드 추출:
   - **tag 키워드**: frontmatter `tags[]` 중 `issue-box`, `tech-debt`, `enhancement` 같은 제네릭 태그 제외. 나머지 모두 채택 (예: `msteams-fetch`, `power-automate`, `landing`, `cache`, `og`)
   - **제목 키워드**: H1 제목에서 한/영 명사 + 버전 번호 + 영문 식별자 추출 (3~5개). 조사/접속사 제외
   - **요약 키워드**: 본문 첫 "## 요약" 또는 "## Summary" 섹션의 첫 문단에서 추가 1~2개 (선택)

수집 결과: `{경로, 파일명, status, tags, source_project, created, 키워드_집합}` 리스트.

**스캔 0건**: "Inbox에 open/blocked 항목이 없습니다." 출력 후 Step 6 직행 (통계 0 반환).

### Step 4: 완료 신호 수집 및 매칭

각 Inbox 항목에 대해:

#### 4.1 저장소 경로 결정

- `source_project`가 Step 2 매핑에 있으면 그 Path 사용
- 없으면 `{repos_base_path}/{source_project}` 존재 여부 확인
- 둘 다 실패하면 git log 스킵 (checkpoint/WORKING.md만 사용)

#### 4.2 git log 스캔

저장소 경로가 있으면:

```bash
cd "<repo>" && git log --since="<created>" --format="%h %s" 2>/dev/null | head -200
```

각 커밋 메시지 텍스트 vs 키워드 교집합 계산:
- tag 완전 일치(단어 경계) 1건당 **가중치 3**
- 제목 키워드 일치 1건당 **가중치 2**
- 요약 키워드 일치 1건당 **가중치 1**
- 동일 커밋에서 여러 키워드 매칭 시 합산, 단 커밋 1건당 상한 5

매칭된 커밋 중 점수 상위 3건을 근거 후보로 보관.

#### 4.3 checkpoint raw log 스캔

`{vault_path}/{memento_root}/projects/{source_project}/memory/*.md` 의 `## [done: ...]` 섹션:

```bash
grep -l "^## \[done:" {vault_path}/{memento_root}/projects/{source_project}/memory/*.md 2>/dev/null
```

각 done 엔트리(제목 + outcome 2줄)에서 키워드 매칭. 점수 규칙 동일. 상위 2건 보관.

#### 4.4 WORKING.md 스캔

`{vault_path}/{memento_root}/projects/{source_project}/WORKING.md` 존재 시:
- "## 현재 상태" 섹션 본문 추출
- "## 이번 세션 주요 변경" 섹션도 함께
- 키워드 매칭, 매칭된 줄 상위 2건 보관 (가중치 2로 고정)

#### 4.5 누적 점수 + 임계값

- 누적 점수 합산 (git + checkpoint + WORKING.md)
- **임계값 3**: 누적 점수 ≥ 3인 항목만 후보로. 미만은 "매칭 약함 — 유지" (대화형 모드에서는 언급하지 않음)

### Step 5: 후보 제시 + 처리

#### 5.1 `--orchestrated` 모드

- 후보 0건: 조용히 반환
  ```
  [inbox-sweep/orchestrated]
    scanned=N candidates=0
  ```
- 후보 ≥ 1건: 축약 블록 반환 (실제 처리 없음). 상위가 사용자에게 "지금 확인?" 질문 후 대화형 재호출 유도.
  ```
  [inbox-sweep/orchestrated]
    scanned=N candidates=M (상위 3건: <파일명1>, <파일명2>, <파일명3>)
  ```

#### 5.2 대화형 모드

후보 목록 출력 (점수 내림차순):

```
Inbox 완료 후보 N건 발견 (점수 내림차순):

1. <파일명> (created, tags, source_project)
   근거:
     - git <hash> <커밋 메시지 한 줄>
     - checkpoint <YYYY-MM-DD-log.md>: [done: <주제>]
     - WORKING.md: "<매칭 구절>"
   점수: <N>

2. ...
```

각 후보마다 `AskUserQuestion` (per-item, 한 번에 하나):

```
[N/M] <파일명>을(를) 어떻게 처리할까요?
```

선택지 (3지선다):
- **resolved** — 해결됨으로 처리. `git mv <원본> {ARCHIVE_DIR}/<파일명>`, frontmatter `status: resolved`, `resolved_at: {TODAY}`, `resolved_by: <근거 요약 한 줄, 예: "m365-fetch 0.4.0 (b521a77)">` 추가
- **dismissed** — 철회 처리. `git mv`는 동일, frontmatter `status: dismissed`
- **keep open** — 유지. 변경 없음 (다음 sweep에서 재후보로 나옴)

#### 5.3 이동 실행

각 선택별:
1. `ARCHIVE_DIR` 없으면 `mkdir -p`
2. `git mv "<원본 경로>" "<ARCHIVE_DIR>/<원래 파일명>"`
3. frontmatter Edit:
   - `status:` 값 업데이트
   - `resolved_at: {TODAY}` (resolved인 경우만)
   - `resolved_by: <근거 요약>` (resolved인 경우만, 이미 있으면 덮어쓰기)
   - `source: <원본 경로>` (없는 경우 추가)
4. `git mv` 실패 시(vault가 git이 아니거나 충돌) 일반 `mv` fallback + 경고 출력

### Step 6: 통계 + 최종 보고

```
inbox-sweep 완료:
  스캔: N건 (open/blocked)
  후보: M건 (누적 점수 >= 3)
  처리: resolved=K, dismissed=L, keep open=U
  아카이브 위치: {ARCHIVE_DIR}
```

**`--orchestrated` 모드**: Step 5.1 블록으로 이미 종결. Step 6 건너뜀.

## 매칭 로직 주의사항

- **제네릭 태그 제외 리스트** (가중치 0):
  `issue-box`, `tech-debt`, `enhancement`, `bug`, `follow-up`, `report`, `plan`, `improvement`, `plannotator` 등
  남는 특정 기술/기능 태그만 매칭 키로 사용한다.
- **단어 경계**: `grep -w` 또는 `\b<키워드>\b` 패턴 사용. `landing`이 `landings`에 매칭되는 걸 막지는 않지만, `cache`가 `caches`에 걸리는 정도는 허용.
- **대소문자**: 키워드 매칭은 대소문자 무시 (`grep -i`).
- **오탐 방지**: 최종 자동 resolve 금지. 항상 사용자 확인.
- **저장소 접근 실패**: git log 실패 시 조용히 skip. WORKING.md/checkpoint log만으로 점수 계산.

## 원칙

- 자동 resolve 금지. 사용자 확인 필수
- 한 번에 한 후보씩 AskUserQuestion (일괄 처리 금지)
- 매칭 근거를 명시적으로 보여줌 (git hash, 로그 파일, 구절)
- `--orchestrated` 모드는 데이터만 반환, 상호작용 없음
- keep open은 정상 선택 — 다음 sweep에서 다시 후보로 나옴
- **내부 Task ID 축약 단독 사용 금지**: 보고·요약에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9` 같은 축약을 한 문서 내 첫 출현 시 풀어쓰거나 괄호 병기. 이후 반복은 단독 허용. 상세: 저장소 CLAUDE.md.
