#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import YAML from "yaml";
import {
  loadConfig,
  loadAliases,
  saveAlias,
  findSimilarAlias,
  filterAliasesForAll,
} from "./config.mjs";
import { parseSinceKst, toUtcForGraph, nowKst } from "./tz.mjs";
import { login, getAccessToken } from "./auth.mjs";
import {
  fetchChatMessages,
  fetchChannelMessagesWithReplies,
  fetchThreadReplies,
} from "./graph.mjs";
import { renderMessages } from "./render.mjs";
import { parseTeamsUrl } from "./urlParser.mjs";
import { runSearch } from "./search.mjs";
import { runInbox } from "./inbox.mjs";
import { getLastRead, setLastRead, stateKey } from "./state.mjs";
import {
  fetchCalendarEvents,
  renderCalendarEvents,
  listCalendars,
} from "./calendar.mjs";
import { fetchMailInbox, fetchMailMessage, renderMailInbox, renderMailMessage } from "./mail.mjs";
import {
  resolveEnvironment,
  listFlows,
  getFlow,
  createFlow,
  updateFlow,
  deleteFlow,
  listRuns,
  getRunDetail,
  listRunActions,
  renderFlowList,
  renderFlowDetail,
  renderRunsList,
  renderRunDetail,
} from "./flow.mjs";

// ─── Shared helpers ────────────────────────────────────────────────────────

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function sectionPath(cfg, section, filename) {
  const dir = join(cfg.output.dir, section);
  ensureDir(dir);
  return join(dir, filename);
}

function stampName() {
  // 2026-04-21T1030 style — safe for filenames and sorts chronologically.
  return nowKst().slice(0, 16).replace(":", "");
}

function safeSlug(s) {
  return String(s).replace(/[^\w가-힣-]/g, "_").slice(0, 60);
}

// Resolve since/until to KST ISO strings. `auto` → last-read state for this key
// (fallback 7d). Literal specs bypass state. Explicit --since still updates
// state on success so the next auto run picks up near the current call.
function resolveRange({ opts, cfg, key, fallbackSince = "7d" }) {
  const sinceSpec = opts.since || cfg.defaults.since;
  const untilSpec = opts.until || cfg.defaults.until;
  const sinceIso =
    sinceSpec === "auto" ? getLastRead(key, fallbackSince) : parseSinceKst(sinceSpec);
  const untilIso =
    !untilSpec || untilSpec === "now" ? nowKst() : parseSinceKst(untilSpec);
  return { sinceIso, untilIso, range: `${sinceIso} ~ ${untilIso}` };
}

function chunkDaysFor(opts, cfg) {
  const n = Number(opts.chunkDays ?? cfg.defaults.chunk_days);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

// ─── Program ───────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("m365-fetch")
  .description("M365 컨텍스트 로더: Teams/Outlook(Graph) + Power Automate(Flow Service)")
  .version("0.4.0");

// ─── login ────────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Microsoft 계정으로 로그인 (device code flow)")
  .option("--resource <name>", "'graph' or 'flow'", "graph")
  .action(async (opts) => {
    const cfg = loadConfig();
    const result = await login(cfg, opts.resource);
    process.stderr.write(
      `\n✓ 로그인 성공 (${opts.resource}): ${result.account?.username || "?"}\n`,
    );
  });

// ─── teams group ───────────────────────────────────────────────────────────

const teams = program.command("teams").description("Teams 채팅/채널");

teams
  .command("list")
  .description("등록된 별칭 목록")
  .action(() => {
    const aliases = loadAliases();
    const names = Object.keys(aliases);
    if (names.length === 0) {
      process.stdout.write("(등록된 별칭이 없습니다. `m365-fetch teams add-alias <name> <url>`로 추가하세요.)\n");
      return;
    }
    for (const name of names) {
      const a = aliases[name];
      process.stdout.write(`${name}\t${a.type}\t${a.label || ""}\n`);
    }
  });

teams
  .command("add-alias <name> <url>")
  .option("--label <label>", "표시용 라벨")
  .description("Teams URL에서 별칭 추가 (메시지 '...' → '링크 복사'로 얻은 URL)")
  .action((name, url, opts) => {
    const parsed = parseTeamsUrl(url);
    const entry = { ...parsed, label: opts.label || name };
    if (parsed.type === "chat" || parsed.type === "channel") delete entry.message_id;
    saveAlias(name, entry);
    process.stderr.write(`✓ 별칭 저장: ${name}\n${JSON.stringify(entry, null, 2)}\n`);
  });

teams
  .command("fetch <alias>")
  .description("별칭으로 메시지 가져와서 파일로 저장")
  .option("--since <spec>", "시간 범위 (auto|2h|1d|7d|YYYY-MM-DD)")
  .option("--until <spec>", "종료 시각 (기본: now)")
  .option("--limit <n>", "최대 메시지 개수")
  .option("--out <path>", "출력 파일 경로 (기본: ~/tmp/m365-context/teams/)")
  .action(async (alias, opts) => {
    const cfg = loadConfig();
    const aliases = loadAliases();
    const entry = aliases[alias];
    if (!entry) {
      const similar = findSimilarAlias(alias, aliases);
      const hint = similar ? ` (혹시 '${similar}'?)` : "";
      throw new Error(`별칭 '${alias}'을(를) 찾을 수 없습니다${hint}`);
    }

    const key = stateKey("teams", "fetch", alias);
    const { sinceIso, untilIso, range } = resolveRange({ opts, cfg, key });
    const sinceUtc = toUtcForGraph(sinceIso);
    const limit = Number(opts.limit || cfg.defaults.limit);
    const token = await getAccessToken(cfg, "graph");

    let messages;
    const metaBase = { alias, label: entry.label || alias, type: entry.type };

    if (entry.type === "chat") {
      messages = await fetchChatMessages({ token, chatId: entry.id, sinceIso: sinceUtc, limit });
      metaBase.chat_id = entry.id;
    } else if (entry.type === "channel") {
      messages = await fetchChannelMessagesWithReplies({
        token,
        teamId: entry.team_id,
        channelId: entry.channel_id,
        sinceIso: sinceUtc,
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

    const nowStr = nowKst();
    const meta = { ...metaBase, fetched_at: nowStr, range };
    const markdown = renderMessages({ meta, messages });

    const outPath =
      opts.out || sectionPath(cfg, "teams", `${safeSlug(alias)}-${stampName()}.md`);
    writeFileSync(outPath, markdown, "utf8");
    setLastRead(key, nowStr);

    process.stderr.write(`✓ ${messages.length}개 메시지 저장: ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

teams
  .command("search")
  .description("내가 멘션된 곳 / 이름이 등장한 곳을 검색 (가입 채팅 + 등록 채널)")
  .option("--name <target>", "검색 대상 (기본: me, 또는 자유 문자열)", "me")
  .option("--since <spec>", "시간 범위 (auto|2h|1d|7d|YYYY-MM-DD)")
  .option("--until <spec>", "종료 시각 (기본: now)")
  .option("--mentions-only", "@mention만 매칭", false)
  .option("--body-only", "본문 substring만 매칭", false)
  .option("--limit <n>", "최대 결과 개수")
  .option("--out <path>", "출력 파일 경로")
  .action(async (opts) => {
    if (opts.mentionsOnly && opts.bodyOnly) {
      throw new Error("--mentions-only와 --body-only는 동시 사용 불가");
    }
    const cfg = loadConfig();
    const aliases = loadAliases();
    const key = stateKey("teams", "search", opts.name || "me");
    const { sinceIso, untilIso } = resolveRange({ opts, cfg, key });
    const sinceUtc = toUtcForGraph(sinceIso);
    const untilUtc = toUtcForGraph(untilIso);
    const token = await getAccessToken(cfg, "graph");

    const result = await runSearch({
      cfg,
      token,
      aliases,
      name: opts.name,
      sinceIso: sinceUtc,
      sinceKst: sinceIso,
      until: untilUtc,
      opts: { ...opts, out: opts.out || sectionPath(cfg, "teams", `search-${safeSlug(opts.name || "me")}-${stampName()}.md`) },
    });
    setLastRead(key, nowKst());

    process.stderr.write(
      `✓ ${result.totalMatches}건 매칭 (스캔: 채팅 ${result.scanned.chats} / 채널 메시지 ${result.scanned.channels}): ${result.outPath}\n`,
    );
    process.stdout.write(`${result.outPath}\n`);
  });

teams
  .command("inbox")
  .description(
    "구독 중인 모든 채팅(1:1/그룹) + 등록 채널을 하나의 파일로 수집. config 기반 제외 (inbox.exclude_chat_topics/ids/types, aliases exclude_from_all)",
  )
  .option("--since <spec>", "시간 범위 (auto|2h|1d|7d|YYYY-MM-DD)")
  .option("--until <spec>", "종료 시각 (기본: now)")
  .option("--limit <n>", "채팅/채널당 최대 메시지 개수")
  .option("--exclude-alias <names>", "추가 제외할 별칭 (쉼표 구분)", "")
  .option("--exclude-chat-id <ids>", "추가 제외할 chat id (쉼표 구분)", "")
  .option("--out <path>", "출력 파일 경로 (기본: ~/tmp/m365-context/teams/inbox-<stamp>.md)")
  .action(async (opts) => {
    const cfg = loadConfig();
    const aliases = loadAliases();
    const key = stateKey("teams", "inbox");
    const { sinceIso } = resolveRange({ opts, cfg, key });
    const sinceUtc = toUtcForGraph(sinceIso);
    const token = await getAccessToken(cfg, "graph");

    const outPath = opts.out || sectionPath(cfg, "teams", `inbox-${stampName()}.md`);
    const result = await runInbox({
      cfg,
      token,
      aliases,
      sinceIso: sinceUtc,
      sinceKst: sinceIso,
      opts: { ...opts, out: outPath },
    });
    setLastRead(key, nowKst());

    process.stderr.write(
      `✓ fetch-inbox 완료: 채팅 ${result.chatCount} / 채널 ${result.channelCount}, 메시지 ${result.totalMessages}건, 제외된 채팅 ${result.skippedChats.length}개 → ${result.outPath}\n`,
    );
    process.stdout.write(`${result.outPath}\n`);
  });

teams
  .command("fetch-all")
  .description("등록된 모든 별칭을 순회하며 메시지 가져오기 (exclude_from_all 제외)")
  .option("--since <spec>", "시간 범위 (auto|2h|1d|7d|YYYY-MM-DD)")
  .option("--until <spec>", "종료 시각 (기본: now)")
  .option("--limit <n>", "별칭당 최대 메시지 개수")
  .option("--exclude <names>", "추가 제외할 별칭 (쉼표 구분)", "")
  .action(async (opts) => {
    const cfg = loadConfig();
    const aliases = loadAliases();
    const extraExcludes = opts.exclude
      ? opts.exclude.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const targets = filterAliasesForAll(aliases, extraExcludes);
    const names = Object.keys(targets);
    if (names.length === 0) {
      process.stderr.write("(fetch 대상 별칭이 없습니다)\n");
      return;
    }
    const key = stateKey("teams", "fetch-all");
    const { sinceIso, range } = resolveRange({ opts, cfg, key });
    const sinceUtc = toUtcForGraph(sinceIso);
    const limit = Number(opts.limit || cfg.defaults.limit);
    const token = await getAccessToken(cfg, "graph");

    const results = [];
    for (const alias of names) {
      const entry = targets[alias];
      try {
        let messages;
        const metaBase = { alias, label: entry.label || alias, type: entry.type };

        if (entry.type === "chat") {
          messages = await fetchChatMessages({ token, chatId: entry.id, sinceIso: sinceUtc, limit });
          metaBase.chat_id = entry.id;
        } else if (entry.type === "channel") {
          messages = await fetchChannelMessagesWithReplies({
            token, teamId: entry.team_id, channelId: entry.channel_id, sinceIso: sinceUtc, limit,
          });
          metaBase.team_id = entry.team_id;
          metaBase.channel_id = entry.channel_id;
        } else if (entry.type === "thread") {
          messages = await fetchThreadReplies({
            token, teamId: entry.team_id, channelId: entry.channel_id, messageId: entry.message_id,
          });
          metaBase.team_id = entry.team_id;
          metaBase.channel_id = entry.channel_id;
          metaBase.message_id = entry.message_id;
        } else {
          process.stderr.write(`[fetch-all] ${alias}: 지원하지 않는 type '${entry.type}', 건너뜀\n`);
          continue;
        }

        const nowStr = nowKst();
        const meta = { ...metaBase, fetched_at: nowStr, range };
        const markdown = renderMessages({ meta, messages });
        const outPath = sectionPath(cfg, "teams", `${safeSlug(alias)}-${stampName()}.md`);
        writeFileSync(outPath, markdown, "utf8");

        results.push({ alias, count: messages.length, outPath });
        process.stderr.write(`  ✓ ${alias}: ${messages.length}건 → ${outPath}\n`);
      } catch (err) {
        process.stderr.write(`  ✗ ${alias}: ${err.message.slice(0, 120)}\n`);
        results.push({ alias, count: 0, outPath: null, error: err.message });
      }
    }

    setLastRead(key, nowKst());
    const total = results.reduce((s, r) => s + r.count, 0);
    const ok = results.filter((r) => !r.error).length;
    process.stderr.write(`\n✓ fetch-all 완료: ${ok}/${names.length} 별칭, 총 ${total}건\n`);
    for (const r of results) {
      if (r.outPath) process.stdout.write(`${r.outPath}\n`);
    }
  });

teams
  .command("download-media <url>")
  .description("Teams 메시지 인라인 미디어(hostedContents) 다운로드")
  .option("--out <path>", "출력 파일 경로 (기본: ~/tmp/m365-context/teams/media/<stamp>.<ext>)")
  .action(async (url, opts) => {
    const cfg = loadConfig();
    const token = await getAccessToken(cfg, "graph");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Graph API ${res.status}: ${body.slice(0, 200)}`);
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const extByType = {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
    };
    const ext = extByType[contentType.split(";")[0].trim()] || "bin";
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = opts.out || sectionPath(cfg, "teams/media", `${stampName()}.${ext}`);
    ensureDir(dirname(outPath));
    writeFileSync(outPath, buf);
    process.stderr.write(`✓ ${buf.length} bytes (${contentType}) → ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

// ─── calendar group ────────────────────────────────────────────────────────

const calendar = program.command("calendar").description("Outlook 캘린더");

calendar
  .command("events")
  .description("calendarView 범위 조회 (3일 윈도우 슬라이스)")
  .option("--since <spec>", "시간 범위 (auto|2h|1d|7d|YYYY-MM-DD)")
  .option("--until <spec>", "종료 시각 (기본: now)")
  .option("--calendar <id>", "특정 캘린더 ID (생략 시 기본 캘린더)")
  .option("--chunk-days <n>", "3일 슬라이스 크기", undefined)
  .option("--limit <n>", "최대 이벤트 개수")
  .option("--out <path>", "출력 파일 경로")
  .action(async (opts) => {
    const cfg = loadConfig();
    const key = stateKey("calendar", "events", opts.calendar);
    const { sinceIso, untilIso, range } = resolveRange({ opts, cfg, key });
    const token = await getAccessToken(cfg, "graph");
    const events = await fetchCalendarEvents({
      token,
      calendarId: opts.calendar,
      sinceIso,
      untilIso,
      chunkDays: chunkDaysFor(opts, cfg),
      limit: Number(opts.limit || cfg.defaults.limit),
    });
    const nowStr = nowKst();
    const markdown = renderCalendarEvents({
      meta: { calendar_id: opts.calendar, range, fetched_at: nowStr },
      events,
    });
    const outPath = opts.out || sectionPath(cfg, "calendar", `events-${stampName()}.md`);
    writeFileSync(outPath, markdown, "utf8");
    setLastRead(key, nowStr);
    process.stderr.write(`✓ ${events.length}개 일정 → ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

calendar
  .command("list")
  .description("내 캘린더 목록")
  .action(async () => {
    const cfg = loadConfig();
    const token = await getAccessToken(cfg, "graph");
    const list = await listCalendars({ token });
    for (const c of list) {
      process.stdout.write(`${c.name}\t${c.id}${c.isDefaultCalendar ? "\t(default)" : ""}\n`);
    }
  });

// ─── mail group ────────────────────────────────────────────────────────────

const mail = program.command("mail").description("Outlook 메일");

mail
  .command("inbox")
  .description("받은편지함 범위 조회 (3일 윈도우 슬라이스)")
  .option("--since <spec>", "시간 범위 (auto|2h|1d|7d|YYYY-MM-DD)")
  .option("--until <spec>", "종료 시각 (기본: now)")
  .option("--folder <id>", "메일 폴더 ID", "inbox")
  .option("--chunk-days <n>", "3일 슬라이스 크기", undefined)
  .option("--limit <n>", "최대 메시지 개수")
  .option("--out <path>", "출력 파일 경로")
  .action(async (opts) => {
    const cfg = loadConfig();
    const key = stateKey("mail", "inbox", opts.folder || "inbox");
    const { sinceIso, untilIso, range } = resolveRange({ opts, cfg, key });
    const token = await getAccessToken(cfg, "graph");
    const messages = await fetchMailInbox({
      token,
      folder: opts.folder || "inbox",
      sinceIso,
      untilIso,
      chunkDays: chunkDaysFor(opts, cfg),
      limit: Number(opts.limit || cfg.defaults.limit),
    });
    const nowStr = nowKst();
    const markdown = renderMailInbox({
      meta: { folder: opts.folder || "inbox", range, fetched_at: nowStr },
      messages,
    });
    const outPath =
      opts.out || sectionPath(cfg, "mail", `inbox-${safeSlug(opts.folder || "inbox")}-${stampName()}.md`);
    writeFileSync(outPath, markdown, "utf8");
    setLastRead(key, nowStr);
    process.stderr.write(`✓ ${messages.length}개 메일 → ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

mail
  .command("get <messageId>")
  .description("단건 메일 조회")
  .option("--with-attachments", "첨부 포함 ($expand=attachments)", false)
  .option("--out <path>", "출력 파일 경로")
  .action(async (messageId, opts) => {
    const cfg = loadConfig();
    const token = await getAccessToken(cfg, "graph");
    const message = await fetchMailMessage({
      token,
      messageId,
      withAttachments: opts.withAttachments,
    });
    const nowStr = nowKst();
    const markdown = renderMailMessage({ meta: { fetched_at: nowStr }, message });
    const outPath =
      opts.out || sectionPath(cfg, "mail", `message-${safeSlug(messageId).slice(0, 40)}-${stampName()}.md`);
    writeFileSync(outPath, markdown, "utf8");
    process.stderr.write(`✓ 메일 1건 → ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

// ─── flow group ────────────────────────────────────────────────────────────

const flow = program.command("flow").description("Power Automate flow 관리");

async function resolvedEnv(cfg, opts) {
  const token = await getAccessToken(cfg, "flow");
  const env = await resolveEnvironment({
    token,
    configEnv: opts.env || cfg.flow.default_env,
    tenantId: cfg.auth.tenant_id,
  });
  return { token, env };
}

flow
  .command("list")
  .description("flow 목록")
  .option("--env <id>", "environment name (생략 시 기본)")
  .option("--owned-only", "내가 소유한 flow만", false)
  .option("--out <path>", "출력 파일 경로")
  .action(async (opts) => {
    const cfg = loadConfig();
    const { token, env } = await resolvedEnv(cfg, opts);
    const flows = await listFlows({ token, env, ownedOnly: Boolean(opts.ownedOnly) });
    const nowStr = nowKst();
    const markdown = renderFlowList({ env, flows, fetchedAt: nowStr });
    const outPath = opts.out || sectionPath(cfg, "flow", `flows-${stampName()}.md`);
    writeFileSync(outPath, markdown, "utf8");
    process.stderr.write(`✓ ${flows.length}개 flow → ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

flow
  .command("get <flowName>")
  .description("단일 flow 상세 + raw JSON 저장")
  .option("--env <id>", "environment name")
  .option("--out <path>", "markdown 출력 경로 (.md). raw JSON은 같은 이름의 .json")
  .action(async (flowName, opts) => {
    const cfg = loadConfig();
    const { token, env } = await resolvedEnv(cfg, opts);
    const flowObj = await getFlow({ token, env, flowName });
    const nowStr = nowKst();
    const base = opts.out || sectionPath(cfg, "flow", `${safeSlug(flowName)}-${stampName()}.md`);
    const jsonPath = base.replace(/\.md$/, ".json");
    writeFileSync(jsonPath, JSON.stringify(flowObj, null, 2), "utf8");
    writeFileSync(base, renderFlowDetail({ flow: flowObj, fetchedAt: nowStr }), "utf8");
    process.stderr.write(`✓ flow 상세 → ${base} (+ ${jsonPath})\n`);
    process.stdout.write(`${base}\n`);
  });

flow
  .command("create")
  .description("새 flow 생성 (POST). body는 --from <file>에서 읽음")
  .requiredOption("--from <path>", "properties 포함 JSON 파일")
  .option("--env <id>", "environment name")
  .action(async (opts) => {
    const cfg = loadConfig();
    const { token, env } = await resolvedEnv(cfg, opts);
    const body = JSON.parse(readFileSync(opts.from, "utf8"));
    const created = await createFlow({ token, env, body });
    process.stderr.write(`✓ flow 생성: ${created?.name || "(응답 확인 필요)"}\n`);
    process.stdout.write(JSON.stringify(created, null, 2) + "\n");
  });

flow
  .command("update <flowName>")
  .description("기존 flow 수정 (PATCH). body는 --from <file>에서 읽음")
  .requiredOption("--from <path>", "properties 포함 JSON 파일")
  .option("--env <id>", "environment name")
  .action(async (flowName, opts) => {
    const cfg = loadConfig();
    const { token, env } = await resolvedEnv(cfg, opts);
    const body = JSON.parse(readFileSync(opts.from, "utf8"));
    const updated = await updateFlow({ token, env, flowName, body });
    process.stderr.write(`✓ flow 수정: ${flowName}\n`);
    process.stdout.write(JSON.stringify(updated, null, 2) + "\n");
  });

flow
  .command("delete <flowName>")
  .description("flow 삭제 (DELETE)")
  .option("--env <id>", "environment name")
  .action(async (flowName, opts) => {
    const cfg = loadConfig();
    const { token, env } = await resolvedEnv(cfg, opts);
    const res = await deleteFlow({ token, env, flowName });
    process.stderr.write(`✓ flow 삭제: ${flowName}\n`);
    process.stdout.write(JSON.stringify(res) + "\n");
  });

flow
  .command("runs <flowName>")
  .description("특정 flow의 runs 이력 (3일 슬라이스)")
  .option("--env <id>", "environment name")
  .option("--since <spec>", "시간 범위 (auto|2h|1d|7d|YYYY-MM-DD)")
  .option("--until <spec>", "종료 시각 (기본: now)")
  .option("--chunk-days <n>", "3일 슬라이스 크기", undefined)
  .option("--top <n>", "윈도우당 최대 run 수", "50")
  .option("--limit <n>", "총 최대 run 수", undefined)
  .option("--out <path>", "출력 파일 경로")
  .action(async (flowName, opts) => {
    const cfg = loadConfig();
    const { token, env } = await resolvedEnv(cfg, opts);
    const key = stateKey("flow", "runs", flowName);
    const { sinceIso, untilIso, range } = resolveRange({ opts, cfg, key });
    const runs = await listRuns({
      token,
      env,
      flowName,
      sinceIso,
      untilIso,
      chunkDays: chunkDaysFor(opts, cfg),
      top: Number(opts.top || 50),
      limit: Number(opts.limit || cfg.defaults.limit),
    });
    const nowStr = nowKst();
    const markdown = renderRunsList({ flowName, runs, range, env, fetchedAt: nowStr });
    const outPath =
      opts.out || sectionPath(cfg, "flow", `${safeSlug(flowName)}-runs-${stampName()}.md`);
    writeFileSync(outPath, markdown, "utf8");
    setLastRead(key, nowStr);
    process.stderr.write(`✓ ${runs.length}개 run → ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

flow
  .command("run-detail <flowName> <runId>")
  .description("run 단건 상세 + action 트리")
  .option("--env <id>", "environment name")
  .option("--out <path>", "출력 파일 경로")
  .action(async (flowName, runId, opts) => {
    const cfg = loadConfig();
    const { token, env } = await resolvedEnv(cfg, opts);
    const [run, actions] = await Promise.all([
      getRunDetail({ token, env, flowName, runId }),
      listRunActions({ token, env, flowName, runId }).catch(() => []),
    ]);
    const nowStr = nowKst();
    const markdown = renderRunDetail({ flowName, run, actions, env, fetchedAt: nowStr });
    const outPath =
      opts.out || sectionPath(cfg, "flow", `${safeSlug(flowName)}-${safeSlug(runId).slice(0, 30)}.md`);
    writeFileSync(outPath, markdown, "utf8");
    process.stderr.write(`✓ run 상세 → ${outPath}\n`);
    process.stdout.write(`${outPath}\n`);
  });

// ─── Entry ────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`\n✗ ${err.message}\n`);
  process.exit(1);
});
