#!/bin/sh
# m365-fetch 캐시 디렉토리에 node_modules 가 없으면 pnpm-lock.yaml 기준으로 설치.
# Claude Code SessionStart 에서 호출. 실패해도 세션 차단 금지.
set -e
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
[ -d "$ROOT/node_modules" ] && exit 0
cd "$ROOT" && corepack pnpm install --frozen-lockfile --prod --silent >/dev/null 2>&1 || true
