import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_INPUT,
  URL_SCHEMA,
  evaluate,
  normalizeInput,
} from "./engine.ts";
import { decodeQuery, encodeQuery } from "../url-state.ts";
function base(overrides: Partial<typeof DEFAULT_INPUT> = {}) {
  return { ...DEFAULT_INPUT, ...overrides };
}

test("Windows CUDA 13 generates valid env, scripts and endpoint", () => {
  const result = evaluate(base({ os: "windows", gpuStack: "nvidia-cuda13", port: 9090 }));
  assert.equal(result.warnings.length, 0);
  assert.equal(result.effectiveGpuStack, "nvidia-cuda13");
  assert.equal(result.envVars.HF_ENDPOINT, "https://huggingface.co");
  assert.equal(result.endpoint, "http://127.0.0.1:9090/v1");
  assert.match(result.installPowerShell, /\$env:HF_ENDPOINT/);
  assert.match(result.installPowerShell, /CUDA 13/);
  assert.match(result.startPowerShell, /--port 9090/);
  assert.match(result.installBash, /export HF_ENDPOINT/);
  assert.equal(result.stages.length, 4);
  assert.equal(result.stages[1].summary.includes("CUDA 13"), true);
});

test("macOS Metal is supported and CPU fallback is accepted", () => {
  const metal = evaluate(base({ os: "macos", gpuStack: "apple-metal", kvCache: "fp16" }));
  assert.equal(metal.warnings.length, 0);
  assert.match(metal.installBash, /Metal 3/);
  assert.match(metal.startBash, /--kv fp16/);
  const cpu = evaluate(base({ os: "macos", gpuStack: "cpu" }));
  assert.equal(cpu.warnings.length, 0);
  assert.equal(cpu.effectiveGpuStack, "cpu");
});

test("Linux ROCm pipeline and start script are deterministic", () => {
  const a = evaluate(base({ os: "linux", gpuStack: "amd-rocm", parallelSlots: 4, quantId: "q5_k_m" }));
  const b = evaluate(base({ os: "linux", gpuStack: "amd-rocm", parallelSlots: 4, quantId: "q5_k_m" }));
  assert.deepEqual(a, b);
  assert.equal(a.warnings.length, 0);
  assert.match(a.installBash, /ROCm 6/);
  assert.match(a.startBash, /--parallel 4/);
  assert.match(a.startBash, /--quant 'q5_k_m'/);
});

test("ModelScope mirror sets HF_ENDPOINT and STRATA_SOURCE", () => {
  const result = evaluate(base({ mirror: "modelscope" }));
  assert.equal(result.envVars.HF_ENDPOINT, "https://www.modelscope.cn");
  assert.equal(result.envVars.STRATA_SOURCE, "modelscope");
  assert.equal(result.envVars.HTTPS_PROXY, undefined);
  assert.match(result.startBash, /STRATA_SOURCE='modelscope'/);
});

test("custom proxy uses HTTPS_PROXY and validates proxy URL", () => {
  const withProxy = evaluate(base({ mirror: "custom-proxy", proxyUrl: "http://127.0.0.1:7890" }));
  assert.equal(withProxy.envVars.HTTPS_PROXY, "http://127.0.0.1:7890");
  assert.equal(withProxy.warnings.length, 0);
  const missing = evaluate(base({ mirror: "custom-proxy", proxyUrl: "javascript:alert(1)" }));
  assert.equal(missing.envVars.HTTPS_PROXY, undefined);
  assert.equal(missing.warnings.length, 1);
  assert.match(missing.warnings[0], /Custom proxy/);
  assert.equal(missing.stages[2].status, "warning");
});

test("invalid OS + GPU combination warns and auto-suggests", () => {
  const result = evaluate(base({ os: "macos", gpuStack: "nvidia-cuda13" }));
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /macos does not support nvidia-cuda13/);
  assert.equal(result.suggestion, "apple-metal");
  assert.equal(result.effectiveGpuStack, "apple-metal");
  assert.equal(result.stages[0].status, "warning");
  assert.match(result.installBash, /Metal 3/);
  const linuxApple = evaluate(base({ os: "linux", gpuStack: "apple-metal" }));
  assert.equal(linuxApple.suggestion, "nvidia-cuda13");
  assert.match(linuxApple.warnings[0], /linux does not support apple-metal/);
});

test("port, parallel slots and quant id are normalized", () => {
  const result = normalizeInput(base({ port: 80, parallelSlots: 99, quantId: "bad id;rm -rf" }));
  assert.equal(result.port, 1024);
  assert.equal(result.parallelSlots, 16);
  assert.equal(result.quantId, "q4_k_m");
  assert.equal(normalizeInput(base({ port: Number.NaN, parallelSlots: 0 })).port, 8080);
  assert.equal(normalizeInput(base({ parallelSlots: 0 })).parallelSlots, 1);
});

test("URL schema round-trips every wizard field", () => {
  const input = base({
    os: "linux",
    gpuStack: "amd-rocm",
    mirror: "hf-mirror",
    proxyUrl: "http://localhost:8080",
    engineFamily: "strata-inkling",
    quantId: "q8_0",
    port: 9001,
    kvCache: "q4_0",
    parallelSlots: 7,
  });
  const params: Record<string, string | number> = {
    os: input.os,
    gpu: input.gpuStack,
    mirror: input.mirror,
    proxy: input.proxyUrl,
    engine: input.engineFamily,
    quant: input.quantId,
    port: input.port,
    kv: input.kvCache,
    parallel: input.parallelSlots,
  };
  const query = encodeQuery(params, URL_SCHEMA);
  const decoded = decodeQuery(query, URL_SCHEMA);
  assert.equal(decoded.os, input.os);
  assert.equal(decoded.gpu, input.gpuStack);
  assert.equal(decoded.mirror, input.mirror);
  assert.equal(decoded.proxy, input.proxyUrl);
  assert.equal(decoded.engine, input.engineFamily);
  assert.equal(decoded.quant, input.quantId);
  assert.equal(decoded.port, input.port);
  assert.equal(decoded.kv, input.kvCache);
  assert.equal(decoded.parallel, input.parallelSlots);
  const back = encodeQuery(decoded as Record<string, string | number>, URL_SCHEMA);
  assert.equal(back, query);
  assert.equal(encodeQuery({}, URL_SCHEMA), "");
});

test("version summary uses bundle tags with deterministic fallback", () => {
  const result = evaluate(base(), {
    syncedAt: "2026-11-27T00:00:00.000Z",
    siteUrl: "https://www.stratat.com",
    engineTag: "v1.0.0",
    engineUrl: "https://example.com/engine",
    desktopTag: "v1.0.1",
    desktopUrl: "https://example.com/desktop",
    assetCount: 1,
    platforms: ["windows"],
  });
  assert.equal(result.versions.desktopTag, "v1.0.1");
  assert.equal(result.versions.engineTag, "v1.0.0");
  assert.equal(result.versions.syncedAt, "2026-11-27T00:00:00.000Z");
  assert.equal(evaluate(base()).versions.engineTag, "v0.2.22");
});
