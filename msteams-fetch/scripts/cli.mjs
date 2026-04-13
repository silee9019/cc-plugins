#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { subHours, subDays, parseISO, formatISO } from "date-fns";
import { loadConfig, loadAliases, saveAlias, findSimilarAlias } from "./config.mjs";
import { login, getAccessToken } from "./auth.mjs";
import {
  fetchChatMessages,
  fetchChannelMessages,
  fetchThreadReplies,
} from "./graph.mjs";
import { renderMessages } from "./render.mjs";
import { parseTeamsUrl } from "./urlParser.mjs";
import { runSearch } from "./search.mjs";

const program = new Command();
program
  .name("msteams-fetch")
  .description("MS Teams 채팅/채널 메시지를 별칭으로 가져와 markdown으로 저장")
  .version("0.3.0");

program
  .command("login")
  .description("Microsoft 계정으로 로그인 (device code flow)")
  .action(async () => {
    const cfg = loadConfig();
    const result = await login(cfg);
    process.stderr.write(`\n✓ 로그인 성공: ${result.account?.username || "?"}\n`);
  });

program
  .command("list")
  .description("등록된 별칭 목록")
  .action(() => {
    const aliases = loadAliases();
    const names = Object.keys(aliases);
    if (names.length === 0) {
      process.stdout.write("(등록된 별칭이 없습니다. `msteams-fetch add-alias <name> <url>`로 추가하세요.)\n");
      return;
    }
    for (const name of names) {
      const a = aliases[name];
      process.stdout.write(`${name}\t${a.type}\t${a.label || ""}\n`);
    }
  });

program
  .command("add-alias <name> <url>")
  .option("--label <label>", "표시용 라벨")
  .description("Teams URL에서 별칭 추가 (메시지 '...' → '링크 복사'로 얻은 URL)")
  .action((name, url, opts) => {
    const parsed = parseTeamsUrl(url);
    const entry = { ...parsed, label: opts.label || name };
    // message_id는 thread 모드에서만 의미, chat/channel은 제거
    if (parsed.type === "chat" || parsed.type === "channel") delete entry.message_id;
    saveAlias(name, entry);
    process.stderr.write(`✓ 별칭 저장: ${name}\n${JSON.stringify(entry, null, 2)}\n`);
  });

program
  .command("fetch <alias>")
  .description("별칭으로 메시지 가져와서 파일로 저장")
  .option("--since <spec>", "시간 범위 (예: 2h, 1d, 7d, 2026-04-13)", undefined)
  .option("--limit <n>", "최대 메시지 개수", undefined)
  .option("--out <path>", "출력 파일 경로 (기본: ~/tmp/teams-context/)")
  .action(async (alias, opts) => {
    const cfg = loadConfig();
    const aliases = loadAliases();
    const entry = aliases[alias];
    if (!entry) {
      const similar = findSimilarAlias(alias, aliases);
      const hint = similar ? ` (혹시 '${similar}'?)` : "";
      throw new Error(`별칭 '${alias}'을(를) 찾을 수 없습니다${hint}`);
    }

    const sinceIso = parseSince(opts.since || cfg.defaults.since);
    const limit = Number(opts.limit || cfg.defaults.limit);
    const token = await getAccessToken(cfg);

    let messages;
    const metaBase = { alias, label: entry.label || alias, type: entry.type };

    if (entry.type === "chat") {
      messages = await fetchChatMessages({ token, chatId: entry.id, sinceIso, limit });
      metaBase.chat_id = entry.id;
    } else if (entry.type === "channel") {
      messages = await fetchChannelMessages({
        token,
        teamId: entry.team_id,
        channelId: entry.channel_id,
        sinceIso,
        limit,
      });
      metaBase.team_id = entry.team_id;
      metaBase.channel_id = entry.channel_id;
    } else if (entry.type === "thread") {
      messages = await fetchThreadReplies({
        token,
        teamId: entry.team_id,
        channelId: entry.channel_id,
        messageId: entry.message_id,
      });
      metaBase.team_id = entry.team_id;
      metaBase.channel_id = entry.channel_id;
      metaBase.message_id = entry.message_id;
    } else {
      throw new Error(`지원하지 않는 별칭 type: ${entry.type}`);
    }

    const now = new Date();
    const meta = {
      ...metaBase,
      fetched_at: formatISO(now),
      range: sinceIso ? `${sinceIso} ~ ${formatISO(now)}` : "all",
    };

    const markdown = renderMessages({ meta, messages });

    const outPath = opts.out || defaultOutPath(cfg, alias, now);
    ensureParentDir(outPath);
    writeFileSync(outPath, markdown, "utf8");

    process.stderr.write(
      `✓ ${messages.length}개 메시지 저장: ${outPath}\n`,
    );
    process.stdout.write(`${outPath}\n`);
  });

program
  .command("search")
  .description("내가 멘션된 곳 / 이름이 등장한 곳을 검색 (가입 채팅 + 등록 채널)")
  .option("--name <target>", "검색 대상 (기본: me, 또는 자유 문자열)", "me")
  .option("--since <spec>", "시간 범위 (예: 2h, 1d, 7d, 2026-04-13)", undefined)
  .option("--until <iso>", "종료 시각 (ISO 8601)", undefined)
  .option("--mentions-only", "@mention만 매칭", false)
  .option("--body-only", "본문 substring만 매칭", false)
  .option("--limit <n>", "최대 결과 개수", undefined)
  .option("--out <path>", "출력 파일 경로")
  .action(async (opts) => {
    if (opts.mentionsOnly && opts.bodyOnly) {
      throw new Error("--mentions-only와 --body-only는 동시 사용 불가");
    }
    const cfg = loadConfig();
    const aliases = loadAliases();
    const sinceIso = parseSince(opts.since || cfg.defaults.since);
    const token = await getAccessToken(cfg);

    const result = await runSearch({
      cfg,
      token,
      aliases,
      name: opts.name,
      sinceIso,
      until: opts.until || null,
      opts,
    });

    process.stderr.write(
      `✓ ${result.totalMatches}건 매칭 (스캔: 채팅 ${result.scanned.chats} / 채널 메시지 ${result.scanned.channels}): ${result.outPath}\n`,
    );
    process.stdout.write(`${result.outPath}\n`);
  });

function parseSince(spec) {
  if (!spec) return null;
  const m = /^(\d+)([hd])$/.exec(spec);
  if (m) {
    const n = Number(m[1]);
    const now = new Date();
    const d = m[2] === "h" ? subHours(now, n) : subDays(now, n);
    return formatISO(d);
  }
  // 절대 날짜 시도
  try {
    const d = parseISO(spec);
    if (!Number.isNaN(d.getTime())) return formatISO(d);
  } catch {}
  throw new Error(`--since 형식 오류: ${spec} (예: 2h, 1d, 7d, 2026-04-13)`);
}

function defaultOutPath(cfg, alias, now) {
  const dir = cfg.output.dir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}`;
  const safeAlias = alias.replace(/[^\w가-힣-]/g, "_");
  return join(dir, `${safeAlias}-${stamp}.md`);
}

function ensureParentDir(filePath) {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function pad(n) {
  return String(n).padStart(2, "0");
}

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`\n✗ ${err.message}\n`);
  process.exit(1);
});
