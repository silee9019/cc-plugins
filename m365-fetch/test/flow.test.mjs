import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderFlowList,
  renderFlowDetail,
  renderRunsList,
  renderRunDetail,
  resolveEnvironment,
  _resetEnvCacheForTests,
} from "../scripts/flow.mjs";

function sampleFlow(overrides = {}) {
  return {
    name: "abc123-guid",
    id: "/providers/.../flows/abc123-guid",
    properties: {
      displayName: "Daily Summary",
      state: "Started",
      createdTime: "2026-04-01T00:00:00.0000000Z",
      lastModifiedTime: "2026-04-20T10:00:00.0000000Z",
      definition: { triggers: {}, actions: {} },
      connectionReferences: { conn1: { displayName: "Outlook" } },
      environment: { name: "Default-tenant" },
      ...overrides.properties,
    },
    ...overrides,
  };
}

function sampleRun(overrides = {}) {
  return {
    name: "08584000000000000000",
    id: "/providers/.../runs/08584000000000000000",
    properties: {
      startTime: "2026-04-21T00:00:00.0000000Z",
      endTime: "2026-04-21T00:00:02.5000000Z",
      status: "Succeeded",
      code: "OK",
      trigger: {
        name: "Recurrence",
        status: "Succeeded",
        inputsLink: { uri: "https://example/inputs" },
        outputsLink: { uri: "https://example/outputs" },
      },
      ...overrides.properties,
    },
    ...overrides,
  };
}

test("renderFlowList: empty list returns placeholder + frontmatter", () => {
  const out = renderFlowList({ env: "Default-t", flows: [], fetchedAt: "t" });
  assert.match(out, /source: power-automate-flows/);
  assert.match(out, /env: Default-t/);
  assert.match(out, /등록된 flow 없음/);
});

test("renderFlowList: single flow appears as table row with flowName GUID", () => {
  const out = renderFlowList({
    env: "Default-t",
    flows: [sampleFlow()],
    fetchedAt: "t",
  });
  assert.match(out, /\| Daily Summary \| Started \|/);
  assert.match(out, /`abc123-guid`/);
});

test("renderFlowDetail: includes state + definition JSON block", () => {
  const out = renderFlowDetail({ flow: sampleFlow(), fetchedAt: "t" });
  assert.match(out, /# 🔁 Daily Summary/);
  assert.match(out, /\*\*state\*\*: Started/);
  assert.match(out, /## definition/);
  assert.match(out, /```json/);
  assert.match(out, /## connectionReferences/);
});

test("renderRunsList: KST date/time + duration + status", () => {
  const out = renderRunsList({
    flowName: "Daily Summary",
    runs: [sampleRun()],
    range: "2026-04-20 ~ 2026-04-22",
    env: "Default-t",
    fetchedAt: "t",
  });
  // start 00:00 UTC → 09:00 KST on 2026-04-21
  assert.match(out, /## 2026-04-21/);
  assert.match(out, /09:00 · \*\*Succeeded\*\* \[OK\] · 2\.50s · trigger: Recurrence/);
  assert.match(out, /`08584000000000000000`/);
});

test("renderRunsList: empty runs returns placeholder", () => {
  const out = renderRunsList({
    flowName: "f",
    runs: [],
    range: "r",
    env: "e",
    fetchedAt: "t",
  });
  assert.match(out, /해당 범위에 run 없음/);
});

test("renderRunDetail: trigger section + actions tree + error message", () => {
  const run = sampleRun();
  const actions = [
    {
      name: "Send_an_email",
      properties: {
        status: "Failed",
        code: "BadRequest",
        startTime: "2026-04-21T00:00:01.0000000Z",
        endTime: "2026-04-21T00:00:02.0000000Z",
        error: { message: "Invalid recipient" },
        inputsLink: { uri: "https://example/act1-in" },
      },
    },
  ];
  const out = renderRunDetail({
    flowName: "Daily Summary",
    run,
    actions,
    env: "Default-t",
    fetchedAt: "t",
  });
  assert.match(out, /# 🔁 Run: 08584000000000000000/);
  assert.match(out, /\*\*status\*\*: Succeeded \[OK\]/);
  assert.match(out, /## trigger/);
  assert.match(out, /## actions/);
  assert.match(out, /\*\*Send_an_email\*\* · Failed \[BadRequest\]/);
  assert.match(out, /error: Invalid recipient/);
  assert.match(out, /inputs: https:\/\/example\/act1-in/);
});

test("resolveEnvironment: configEnv short-circuits before listEnvironments call", async () => {
  _resetEnvCacheForTests();
  const env = await resolveEnvironment({ token: "anytoken", configEnv: "My-Env" });
  assert.equal(env, "My-Env");
});

test("resolveEnvironment: tenantId fallback shape is Default-<tenantId>", async () => {
  _resetEnvCacheForTests();
  // Stub global fetch so listEnvironments throws → function falls through to tenantId.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network unreachable");
  };
  try {
    const env = await resolveEnvironment({ token: "t", tenantId: "tenant-abc" });
    assert.equal(env, "Default-tenant-abc");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("resolveEnvironment: throws when neither configEnv nor tenantId resolves and network fails", async () => {
  _resetEnvCacheForTests();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network unreachable");
  };
  try {
    await assert.rejects(
      () => resolveEnvironment({ token: "t" }),
      /flow environment 해석 실패/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
