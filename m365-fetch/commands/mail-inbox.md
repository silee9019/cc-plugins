---
description: Outlook 메일함(기본 inbox)을 날짜 범위로 조회해 세션에 로드. 3일 윈도우 슬라이스 + HTML→markdown 본문 변환.
allowed-tools: Bash, Read
argument-hint: [--since auto|1d] [--until now] [--folder inbox|sentitems] [--limit 200]
---

# mail-inbox

`/me/mailFolders/{folder}/messages`를 호출해 범위 내 메일을 newest-first로 수집하고 markdown으로 저장한다.

## 사용 절차

1. **Bash로 다음 명령 실행**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" mail inbox $ARGUMENTS
```

2. stdout의 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 세션에 포함.
3. 출력은 날짜별 그룹, 각 메일에 제목 링크(Outlook web), From/To/Cc, 📎 첨부 마커, 본문(HTML→markdown 변환).

## 인자

- `--since auto` (기본) → 마지막 조회 시각 이후. `2h`/`1d`/`7d`/`2026-04-13`도 가능
- `--until now` (기본) → 종료 시각
- `--folder inbox` (기본) → `inbox`/`sentitems`/`drafts`/`deleteditems` 등 well-known ID 또는 mailFolder ID
- `--chunk-days <n>` → 슬라이스 크기 (기본 3)
- `--limit <n>` → 최대 메일 수
- `--out <path>` → 출력 파일 경로 지정

## 에러 처리

- "Graph API 401/403" → 토큰 만료 또는 `Mail.Read` 미승인. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인
- 공유 메일함 403 → `Mail.Read.Shared`가 토큰에 포함되어 있는지 확인

## 단건 조회

본문 전체 + 첨부 메타가 필요하면 터미널에서:

```bash
node .../scripts/cli.mjs mail get <messageId> --with-attachments
```
