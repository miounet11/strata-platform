import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIENTS,
  DEFAULT_INPUT,
  KEY_PLACEHOLDER,
  URL_SCHEMA,
  evaluate,
  inputFromParams,
  isLoopbackHost,
  normalizeInput,
  paramsFromInput,
} from "./engine.ts";
import { decodeQuery, encodeQuery } from "../url-state.ts";

function base(overrides: Partial<typeof DEFAULT_INPUT> = {}) {
  return { ...DEFAULT_INPUT, ...overrides };
}

test("generates valid configuration for all six clients", () => {
  const expected: Record<string, { path: string; protocol: string; format: string }> = {
    "claude-code": { path: "~/.claude/settings.json", protocol: "anthropic", format: "json" },
    cursor: { path: "~/.cursor/mcp.json", protocol: "openai", format: "json" },
    windsurf: { path: "~/.codeium/windsurf/mcp_config.json", protocol: "openai", format: "json" },
    "codex-cli": { path: "~/.codex/config.toml", protocol: "openai", format: "toml" },
    continue: { path: "~/.continue/config.yaml", protocol: "openai", format: "yaml" },
    "openai-curl": { path: "./strata-curl.sh", protocol: "openai", format: "shell" },
  };
  assert.deepEqual([...CLIENTS], Object.keys(expected));

  for (const client of CLIENTS) {
    const result = evaluate(base({ client, port: 9123, modelId: "qwen2.5-coder" }));
    const meta = expected[client];
    assert.equal(result.client, client);
    assert.equal(result.targetPath, meta.path);
    assert.equal(result.protocol, meta.protocol);
    assert.equal(result.configFormat, meta.format);
    assert.equal(result.baseUrl, "http://127.0.0.1:9123/v1");
    assert.ok(result.configText.includes(KEY_PLACEHOLDER));
    assert.match(result.testCommand, /curl -fsS/);
    assert.equal(result.testCommand.includes(KEY_PLACEHOLDER), true);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.isLoopback, true);
    assert.ok(result.topology.length >= 4);
    assert.ok(result.topology.some((node) => node.id === "protocol"));
    assert.ok(result.topology.some((node) => node.id === "gateway"));
  }
});

test("JSON configurations are syntactically valid", () => {
  for (const client of ["claude-code", "cursor", "windsurf"] as const) {
    const result = evaluate(base({ client, enableMcp: false, enableReasoning: false }));
    const parsed = JSON.parse(result.configText);
    assert.equal(typeof parsed, "object");
    assert.ok(parsed.env || parsed.mcpServers);
    if (client === "claude-code") {
      assert.equal(parsed.env.ANTHROPIC_API_KEY, KEY_PLACEHOLDER);
      assert.deepEqual(parsed.mcpServers, {});
    } else {
      assert.equal(parsed.env.OPENAI_API_KEY, KEY_PLACEHOLDER);
    }
  }
});

test("no real secrets are ever emitted; placeholder is universal", () => {
  const result = evaluate(base({ host: "0.0.0.0", modelId: "secret-model" }));
  const text = JSON.stringify(result);
  assert.match(text, /STRATA_LOCAL_KEY/);
  assert.doesNotMatch(text, /sk-[a-zA-Z0-9]{16,}/);
  assert.doesNotMatch(text, /api[_-]?key\s*[:=]\s*["'](?!STRATA_LOCAL_KEY)[^"']+["']/i);
  assert.equal(result.keyPlaceholder, KEY_PLACEHOLDER);
});

test("non-loopback host produces a clear security warning", () => {
  for (const host of ["192.168.1.10", "example.com", "0.0.0.0"]) {
    const result = evaluate(base({ host }));
    assert.equal(result.isLoopback, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warning!, /Security risk/);
    assert.ok(result.warning!.includes(host));
    assert.ok(result.warning!.includes("127.0.0.1"));
    assert.equal(result.topology.find((node) => node.id === "gateway")?.status, "warning");
  }
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("LAN"), false);
});

test("strict host, port and modelId validation", () => {
  assert.equal(normalizeInput(base({ host: "not a host" })).host, "127.0.0.1");
  assert.equal(normalizeInput(base({ host: "evil.com/path" })).host, "127.0.0.1");
  assert.equal(normalizeInput(base({ host: "user@example.com" })).host, "127.0.0.1");
  assert.equal(normalizeInput(base({ host: "999.1.1.1" })).host, "127.0.0.1");
  assert.equal(normalizeInput(base({ host: "" })).host, "127.0.0.1");
  assert.equal(normalizeInput(base({ host: "my-host.local" })).host, "my-host.local");

  assert.equal(normalizeInput(base({ port: 0 })).port, 1);
  assert.equal(normalizeInput(base({ port: 70000 })).port, 65535);
  assert.equal(normalizeInput(base({ port: Number.NaN })).port, DEFAULT_INPUT.port);
  assert.equal(normalizeInput(base({ port: 8080.9 })).port, 8080);

  assert.equal(normalizeInput(base({ modelId: "bad id;rm -rf" })).modelId, DEFAULT_INPUT.modelId);
  assert.equal(normalizeInput(base({ modelId: "" })).modelId, DEFAULT_INPUT.modelId);
  assert.equal(normalizeInput(base({ modelId: "qwen2.5-coder:32b" })).modelId, "qwen2.5-coder:32b");
  assert.equal(normalizeInput(base({ client: "unknown" as never })).client, "claude-code");
  assert.equal(normalizeInput(base({ contextK: 99999 })).contextK, 1024);
});

test("TOML, YAML and curl configs escape special characters", () => {
  const codex = evaluate(base({ client: "codex-cli", modelId: 'a"b\\c' }));
  assert.equal(codex.input.modelId, DEFAULT_INPUT.modelId);
  assert.doesNotMatch(codex.configText, /a"b/);
  const codexSafe = evaluate(base({ client: "codex-cli", modelId: "q4_k_m" }));
  assert.match(codexSafe.configText, /base_url = "http:\/\/127\.0\.0\.1:8080\/v1"/);
  assert.match(codexSafe.configText, /env_key = "STRATA_LOCAL_KEY"/);
  assert.match(codexSafe.configText, /\[model_providers\.strata\]/);

  const cont = evaluate(base({ client: "continue", enableMcp: true }));
  assert.match(cont.configText, /apiKey: "STRATA_LOCAL_KEY"/);
  assert.match(cont.configText, /mcpServers:/);

  const curl = evaluate(base({ client: "openai-curl" }));
  assert.match(curl.configText, /curl -fsS/);
  assert.match(curl.configText, /STRATA_API_KEY='STRATA_LOCAL_KEY'/);
});

test("URL round-trips every client and all form state", () => {
  for (const client of CLIENTS) {
    const input = base({
      client,
      host: "my-host.local",
      port: 9999,
      modelId: "llama3.1:70b",
      contextK: 128,
      enableReasoning: false,
      enableMcp: false,
    });
    const query = encodeQuery(paramsFromInput(input), URL_SCHEMA);
    const decoded = decodeQuery(query, URL_SCHEMA);
    const restored = inputFromParams(decoded as Record<string, string | number | boolean>);
    assert.deepEqual(restored, input);
    assert.equal(encodeQuery(paramsFromInput(restored), URL_SCHEMA), query);
  }
  assert.equal(encodeQuery({}, URL_SCHEMA), "");
  assert.deepEqual(Object.keys(URL_SCHEMA), ["client", "host", "port", "model", "ctx", "reasoning", "mcp"]);
});

test("evaluation is deterministic for identical input", () => {
  const a = evaluate(base({ client: "windsurf", enableMcp: true }));
  const b = evaluate(base({ client: "windsurf", enableMcp: true }));
  assert.deepEqual(a, b);
});
