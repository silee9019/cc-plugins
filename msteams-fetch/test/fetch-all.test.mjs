import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterAliasesForAll } from "../scripts/config.mjs";

describe("filterAliasesForAll", () => {
  const aliases = {
    "connect-chat": {
      type: "chat",
      id: "19:abc@thread.v2",
      label: "connect-chat",
      exclude_from_all: true,
    },
    "connect-channel": {
      type: "channel",
      team_id: "t1",
      channel_id: "c1",
      label: "Connect",
    },
    "hub-dev": {
      type: "channel",
      team_id: "t2",
      channel_id: "c2",
      label: "Hub Dev",
      exclude_from_all: false,
    },
  };

  it("exclude_from_all: true인 alias를 제외한다", () => {
    const result = filterAliasesForAll(aliases);
    assert.ok(!("connect-chat" in result));
  });

  it("exclude_from_all이 없거나 false인 alias는 포함한다", () => {
    const result = filterAliasesForAll(aliases);
    assert.ok("connect-channel" in result);
    assert.ok("hub-dev" in result);
  });

  it("반환 객체의 크기가 정확하다", () => {
    const result = filterAliasesForAll(aliases);
    assert.equal(Object.keys(result).length, 2);
  });

  it("중복 alias (같은 channel_id)도 모두 포함한다", () => {
    const withDups = {
      ...aliases,
      "팀채널": { type: "channel", team_id: "t1", channel_id: "c1", label: "팀채널" },
    };
    const result = filterAliasesForAll(withDups);
    assert.equal(Object.keys(result).length, 3);
  });

  it("--exclude 인자로 추가 제외할 수 있다", () => {
    const result = filterAliasesForAll(aliases, ["hub-dev"]);
    assert.equal(Object.keys(result).length, 1);
    assert.ok("connect-channel" in result);
  });

  it("빈 aliases 객체는 빈 객체를 반환한다", () => {
    const result = filterAliasesForAll({});
    assert.equal(Object.keys(result).length, 0);
  });
});
