---
name: setup
display_name: setup
description: "이력서 프로젝트 폴더 구조, SOUL 페르소나, CLAUDE.md 워크플로우를 생성하는 초기 설정. 멱등성 보장 — 기존 파일을 훼손하지 않고 누락분만 생성하며, 기존 파일은 검토하여 개선점 제안."
allowed-tools: Bash, Read, Write, AskUserQuestion, Glob, Grep
---

## 프로젝트 초기 설정

이력서 프로젝트의 폴더 구조, SOUL 페르소나 파일, CLAUDE.md 워크플로우를 생성한다.

### 멱등성 원칙
- 기존 파일을 훼손하지 않는다
- 누락된 파일만 템플릿에서 생성한다
- 기존 파일은 템플릿과 비교하여 누락된 섹션이나 개선점이 있으면 사용자에게 제안한다 (자동 수정은 하지 않음)
- 최종 결과를 "생성됨 N개, 이미 존재 M개, 개선 제안 K개"로 출력한다

### 절차

#### Step 1: 프로젝트 경로 확인
AskUserQuestion으로 프로젝트 폴더 경로를 확인한다.
- 기본값: 현재 작업 디렉토리

#### Step 2: 폴더 구조 확인 및 생성
다음 폴더가 없으면 생성:
- `{project}/coach/`
- `{project}/reference/`
- `{project}/material/`

#### Step 3: SOUL 파일 생성
`{project}/coach/` 아래 다음 파일이 없으면 `${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/` 의 템플릿을 Read하여 생성:
- `SOUL_코치.md`
- `SOUL_면접관_기술심화.md`
- `SOUL_면접관_실무검증.md`
- `SOUL_면접관_문화적합성.md`
- `SOUL_멘토_매니저패스.md`
- `SOUL_멘토_개발자패스.md`

이미 존재하는 파일은:
1. 기존 내용을 Read
2. 템플릿과 비교하여 누락된 섹션 확인
3. 개선점이 있으면 사용자에게 제안 (수정은 하지 않음)

#### Step 4: TODO.md 생성
`{project}/coach/TODO.md`가 없으면 템플릿에서 생성.

#### Step 5: CLAUDE.md 생성
`{project}/CLAUDE.md`가 없으면 템플릿에서 생성.
이미 존재하면 AskUserQuestion으로 "기존 CLAUDE.md가 있습니다. 덮어쓸까요, 검토만 할까요?" 확인.

#### Step 6: 설정 저장
`~/.claude/plugins/data/resume-coach-cc-plugins/config.md`에 프로젝트 경로 저장.

#### Step 7: 결과 출력
생성된 파일, 이미 존재하는 파일, 개선 제안 수를 정리하여 출력.
