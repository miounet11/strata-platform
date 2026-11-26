/**
 * Unified Feature Installation Center & System Doctor for Stratat Desktop.
 *
 * Aggregates live status for every core runtime and optional capability:
 *   - Control Runtime (bundled CPython 3.12 + strata_control)
 *   - Inference Engines (strata-engine, strata-hy4, strata-inkling, vision)
 *   - Agent Harness (DeepSeek Harness @deepseek-ai/dsh)
 *   - Browser Automation (@playwright/mcp + detected Chrome/Edge/Brave/Chromium)
 *   - Cloudflare Remote Sharing Connector (cloudflared — one-click explicit install!)
 *   - Storage & Disk Health
 *   - Network Download Mirrors & ModelScope / Proxy
 *   - External IDE / Coding Agent & MCP Integrations
 *
 * Also provides one-click self-heal (`repair()`) and sanitized diagnostic export (`diagnostics()`).
 */
import { existsSync } from 'node:fs';
import { arch, cpus, freemem, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { findBrowser, findPlaywrightMcp } from './agent/browser-probe.mjs';
import { resolveHarness } from './agent/harness-runtime.mjs';
import { installBundledEngine } from './bundled-engine.mjs';

function redactSecrets(value) {
  if (typeof value === 'string') {
    return value
      .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[redacted]')
      .replace(/(token=|api_?key=|password=|secret=)[^\s&"']+/gi, '$1[redacted]')
      .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/]+:)([^@\s/]+)(@)/gi, '$1[redacted]$3');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/(key|token|secret|password|auth)/i.test(k) && typeof v === 'string' && v.length > 0) {
        out[k] = '[redacted]';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}

export function createSystemDoctor({
  control = null,
  componentsDir,
  engineBundleDir,
  bundledHarnessDir = null,
  modelsDir,
  diskFreeGb = () => 0,
  diskTotalGb = () => 0,
  cloudflare = null,
  connectorInstaller = null,
  networkMirror = null,
  integrations = null,
  appVersion = () => 'dev',
  getApiEndpoint = () => 'http://127.0.0.1:18500/v1',
  env = process.env,
} = {}) {
  async function inspect() {
    const compDir = typeof componentsDir === 'function' ? componentsDir() : componentsDir;
    const mDir = typeof modelsDir === 'function' ? modelsDir() : modelsDir;

    // 1. Control Runtime
    const controlInfo = control
      ? {
          installed: true,
          version: control.version ?? control.control?.bundle?.version ?? null,
          python: control.control?.python ?? null,
          dir: control.control?.dir ?? null,
          healthy: Boolean(control.control?.python && existsSync(control.control.python)),
        }
      : {
          installed: false,
          version: null,
          python: null,
          dir: null,
          healthy: false,
        };

    // 2. Inference Engines (primary + shape engines)
    let engineReport = null;
    if (control?.engine) {
      engineReport = await control.engine().catch((e) => ({ usable: false, notice: e.message }));
    }
    const shapes = Array.isArray(engineReport?.shapes)
      ? engineReport.shapes.map((s) => ({
          shape: s.shape,
          component: s.component,
          usable: s.usable === true,
          version: s.engine?.version ?? null,
          backend: s.engine?.backend ?? null,
        }))
      : [];
    const enginesInfo = {
      primaryUsable: Boolean(engineReport?.usable),
      version: engineReport?.engine?.version ?? null,
      backend: engineReport?.engine?.backend ?? null,
      notice: engineReport?.notice ?? null,
      shapes,
      anyUsable: Boolean(engineReport?.usable) || shapes.some((s) => s.usable),
      hasBundledEngine: Boolean(engineBundleDir && existsSync(engineBundleDir)),
    };

    // 3. Agent Harness + Browser Automation MCP
    const harness = resolveHarness({ env, componentsDir: compDir, bundledDir: bundledHarnessDir });
    const playwrightMcp = harness.ok ? findPlaywrightMcp(harness.dir) : null;
    const browser = findBrowser();

    // 4. Cloudflare Connector
    let cloudflared = { installed: false, path: null, version: null, source: null, canInstall: Boolean(connectorInstaller) };
    if (connectorInstaller?.inspect) {
      const look = await connectorInstaller.inspect().catch(() => ({ found: null, skipped: [] }));
      cloudflared = {
        installed: Boolean(look?.found?.path),
        path: look?.found?.path ?? null,
        version: look?.found?.version ?? null,
        source: look?.found?.source ?? null,
        label: look?.found?.label ?? null,
        canInstall: Boolean(connectorInstaller),
      };
    }

    // 5. Storage
    const freeGb = Number(diskFreeGb(mDir) || 0);
    const totalGb = Number(diskTotalGb(mDir) || 0);
    const storage = {
      modelsDir: mDir,
      componentsDir: compDir,
      freeGb: Math.round(freeGb * 10) / 10,
      totalGb: Math.round(totalGb * 10) / 10,
      healthy: freeGb >= 5 || totalGb === 0,
    };

    // 6. Network Mirrors & Proxy
    const network = networkMirror ? networkMirror.get() : null;

    // 7. External IDE & MCP Integrations
    const tools = integrations ? integrations.list() : [];

    // Overall readiness summary
    const coreChecks = [
      { id: 'control', ok: controlInfo.healthy },
      { id: 'engines', ok: enginesInfo.anyUsable },
      { id: 'harness', ok: harness.ok },
      { id: 'storage', ok: storage.healthy },
    ];
    const readyCount = coreChecks.filter((c) => c.ok).length;

    return {
      checkedAt: new Date().toISOString(),
      appVersion: appVersion(),
      platform: platform(),
      arch: arch(),
      apiBaseUrl: getApiEndpoint(),
      summary: {
        readyCount,
        totalCore: coreChecks.length,
        allCoreReady: readyCount === coreChecks.length,
      },
      control: controlInfo,
      engines: enginesInfo,
      harness: {
        installed: harness.ok,
        version: harness.ok ? harness.version : null,
        dir: harness.ok ? harness.dir : null,
        reason: harness.ok ? null : harness.reason,
      },
      browser: {
        mcpBundled: Boolean(playwrightMcp),
        mcpPath: playwrightMcp,
        browserFound: browser.found,
        browserName: browser.name,
        browserPath: browser.path,
        ready: Boolean(playwrightMcp && browser.found),
      },
      cloudflared,
      storage,
      network,
      integrations: tools,
    };
  }

  /** Explicit user-initiated install of Cloudflare connector (SHA-256 verified). */
  async function installCloudflared() {
    if (!connectorInstaller) throw new Error('Cloudflare connector installer is not available.');
    const path = await connectorInstaller.ensure({ explicit: true });
    if (cloudflare?.inspect) await cloudflare.inspect().catch(() => {});
    const status = await inspect();
    return { ok: true, path, cloudflared: status.cloudflared };
  }

  /** One-click self-heal: repair permissions, clean orphan engine processes, re-verify bundled engines. */
  async function repair() {
    const actions = [];
    const compDir = typeof componentsDir === 'function' ? componentsDir() : componentsDir;

    if (control?.repairAccess) {
      const res = await control.repairAccess().catch((e) => ({ ok: false, error: e.message }));
      actions.push({ id: 'repair-access', ok: res?.ok !== false, detail: res?.error ?? 'Permissions checked' });
    }
    if (control?.cleanup) {
      const res = await control.cleanup().catch((e) => ({ ok: false, error: e.message }));
      actions.push({ id: 'cleanup-orphans', ok: res?.ok !== false, detail: res?.error ?? 'Orphan processes cleaned' });
    }
    if (engineBundleDir && existsSync(engineBundleDir) && compDir) {
      const res = await installBundledEngine({ bundleDir: engineBundleDir, components: compDir });
      actions.push({
        id: 'verify-bundled-engines',
        ok: ['installed', 'repaired', 'kept', 'none'].includes(res?.action),
        detail: `${res?.action ?? 'none'}${res?.version ? ` (${res.version})` : ''}${res?.reason ? `: ${res.reason}` : ''}`,
      });
    }
    const status = await inspect();
    return { ok: actions.every((a) => a.ok), actions, status };
  }

  /** Sanitized diagnostic bundle safe to share for support. */
  async function diagnostics() {
    const status = await inspect();
    return redactSecrets({
      schemaVersion: 1,
      product: 'Stratat Desktop',
      generatedAt: new Date().toISOString(),
      system: {
        platform: platform(),
        release: release(),
        arch: arch(),
        node: process.version,
        cpus: cpus().length,
        memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
        freeMemoryGb: Math.round((freemem() / 1024 ** 3) * 10) / 10,
      },
      status,
    });
  }

  return { inspect, installCloudflared, repair, diagnostics };
}
