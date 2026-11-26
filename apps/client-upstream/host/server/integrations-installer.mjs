/**
 * One-click external IDE, Coding Agent, and MCP integrations installer for Stratat Desktop.
 *
 * Safely configures major developer tools to talk to Stratat's local OpenAI/Anthropic API and/or
 * bundled MCP server (`tools/strata_mcp.py` running on Stratat Control's bundled Python):
 *   - claude-code : ~/.claude/settings.json (Anthropic-compatible base URL) + ~/.claude.json (MCP)
 *   - cursor      : ~/.cursor/mcp.json (MCP server `stratat`)
 *   - windsurf    : ~/.codeium/windsurf/mcp_config.json (MCP server `stratat`)
 *   - codex       : ~/.codex/config.toml (managed `# >>> stratat-managed >>>` block)
 *   - continue    : ~/.continue/config.json (Stratat Local OpenAI-compatible model entry)
 *
 * Safety invariants:
 *   1. Never destroys unrelated user keys, servers, or settings.
 *   2. Creates a `.stratat.bak` backup before first modification.
 *   3. Writes atomically via temp file + rename.
 *   4. Supports deterministic verify & clean uninstall for every integration.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const TOML_START = '# >>> stratat-managed >>>';
const TOML_END = '# <<< stratat-managed <<<';
const MCP_SERVER_KEY = 'stratat';
const CONTINUE_TITLE = 'Stratat Local';

function readJsonSafe(file) {
  if (!existsSync(file)) return { exists: false, data: {}, valid: true };
  try {
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    if (!text) return { exists: true, data: {}, valid: true };
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { exists: true, data: {}, valid: false, error: 'Existing config is not a JSON object.' };
    }
    return { exists: true, data: parsed, valid: true };
  } catch (err) {
    return { exists: true, data: {}, valid: false, error: `Existing JSON is malformed: ${err.message}` };
  }
}

function backupOnce(file) {
  if (!existsSync(file)) return null;
  const bak = `${file}.stratat.bak`;
  if (!existsSync(bak)) {
    try { copyFileSync(file, bak); } catch { /* best effort */ }
  }
  return bak;
}

function writeAtomic(file, content, mode = 0o600) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.stratat-${process.pid}.tmp`;
  writeFileSync(tmp, content, { encoding: 'utf8', mode });
  renameSync(tmp, file);
}

function mcpEntryFor(context) {
  const python = context.control?.python;
  const mcpScript = context.control?.dir ? join(context.control.dir, 'tools', 'strata_mcp.py') : null;
  if (python && mcpScript && existsSync(mcpScript)) {
    return {
      command: python,
      args: [mcpScript],
      env: {
        PYTHONNOUSERSITE: '1',
        STRATA_NO_ACQUIRE: '1',
        ...(context.componentsDir ? { STRATA_COMPONENTS_DIR: context.componentsDir } : {}),
        ...(context.control?.dir ? { STRATA_CONTROL_DIR: context.control.dir } : {}),
      },
    };
  }
  return null;
}

function buildCodexBlock(endpoint) {
  const baseUrl = endpoint.replace(/\/+$/, '');
  return [
    TOML_START,
    '[model_providers.stratat]',
    'name = "Stratat Local"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "chat"',
    'env_key = "STRATA_API_KEY"',
    TOML_END,
  ].join('\n');
}

function stripCodexBlock(text) {
  const re = new RegExp(`\\n?${TOML_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${TOML_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g');
  return text.replace(re, '\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

export function createIntegrationsInstaller({
  home = homedir(),
  getContext = () => ({ apiBaseUrl: 'http://127.0.0.1:18500/v1', apiKey: '', modelId: 'local', control: null, componentsDir: null }),
} = {}) {
  const definitions = [
    {
      id: 'claude-code',
      name: 'Claude Code',
      kind: 'anthropic+mcp',
      description: 'Connect Claude Code to Stratat local Anthropic API and MCP server.',
      configPath: () => join(home, '.claude', 'settings.json'),
      mcpPath: () => join(home, '.claude.json'),
      detectApp: () => existsSync(join(home, '.claude')) || existsSync(join(home, '.claude.json')),
      inspect(ctx) {
        const file = this.configPath();
        const read = readJsonSafe(file);
        const base = read.data?.env?.ANTHROPIC_BASE_URL ?? null;
        const expected = ctx.apiBaseUrl.replace(/\/v1\/?$/, '');
        const installed = typeof base === 'string' && base.startsWith('http://127.0.0.1:');
        const upToDate = base === expected;
        return { installed, upToDate, valid: read.valid, error: read.error ?? null, detail: base ? `ANTHROPIC_BASE_URL=${base}` : null };
      },
      install(ctx) {
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (!read.valid) throw new Error(`${file}: ${read.error}`);
        backupOnce(file);
        const anthropicBase = ctx.apiBaseUrl.replace(/\/v1\/?$/, '');
        const next = {
          ...read.data,
          env: {
            ...(read.data.env && typeof read.data.env === 'object' ? read.data.env : {}),
            ANTHROPIC_BASE_URL: anthropicBase,
            ANTHROPIC_AUTH_TOKEN: ctx.apiKey || 'stratat-local',
          },
        };
        writeAtomic(file, JSON.stringify(next, null, 2) + '\n');

        // Also register MCP server in ~/.claude.json when bundled Control MCP script is present
        const mcpEntry = mcpEntryFor(ctx);
        const mcpFile = this.mcpPath();
        if (mcpEntry) {
          const mRead = readJsonSafe(mcpFile);
          if (mRead.valid) {
            backupOnce(mcpFile);
            const mNext = {
              ...mRead.data,
              mcpServers: {
                ...(mRead.data.mcpServers && typeof mRead.data.mcpServers === 'object' ? mRead.data.mcpServers : {}),
                [MCP_SERVER_KEY]: mcpEntry,
              },
            };
            writeAtomic(mcpFile, JSON.stringify(mNext, null, 2) + '\n');
          }
        }
        return { configPath: file, anthropicBase, mcpRegistered: Boolean(mcpEntry) };
      },
      uninstall() {
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (read.exists && read.valid && read.data.env && typeof read.data.env === 'object') {
          const env = { ...read.data.env };
          if (String(env.ANTHROPIC_BASE_URL ?? '').startsWith('http://127.0.0.1:')) {
            delete env.ANTHROPIC_BASE_URL;
            if (env.ANTHROPIC_AUTH_TOKEN === 'stratat-local') delete env.ANTHROPIC_AUTH_TOKEN;
          }
          const next = { ...read.data, env };
          if (!Object.keys(next.env).length) delete next.env;
          writeAtomic(file, JSON.stringify(next, null, 2) + '\n');
        }
        const mcpFile = this.mcpPath();
        const mRead = readJsonSafe(mcpFile);
        if (mRead.exists && mRead.valid && mRead.data.mcpServers?.[MCP_SERVER_KEY]) {
          const mcpServers = { ...mRead.data.mcpServers };
          delete mcpServers[MCP_SERVER_KEY];
          writeAtomic(mcpFile, JSON.stringify({ ...mRead.data, mcpServers }, null, 2) + '\n');
        }
        return { removed: true };
      },
    },
    {
      id: 'cursor',
      name: 'Cursor',
      kind: 'mcp',
      description: 'Register Stratat MCP server in Cursor (~/.cursor/mcp.json).',
      configPath: () => join(home, '.cursor', 'mcp.json'),
      detectApp: () => existsSync(join(home, '.cursor')),
      inspect(ctx) {
        const file = this.configPath();
        const read = readJsonSafe(file);
        const entry = read.data?.mcpServers?.[MCP_SERVER_KEY] ?? null;
        const installed = Boolean(entry?.command);
        const binaryExists = installed ? existsSync(entry.command) : false;
        const wanted = mcpEntryFor(ctx);
        const upToDate = Boolean(installed && wanted && entry.command === wanted.command && entry.args?.[0] === wanted.args[0]);
        return { installed, upToDate, valid: read.valid && (!installed || binaryExists), error: read.error ?? (installed && !binaryExists ? 'Configured MCP Python binary not found.' : null), detail: entry?.command ?? null };
      },
      install(ctx) {
        const entry = mcpEntryFor(ctx);
        if (!entry) throw new Error('Stratat Control MCP server (tools/strata_mcp.py) is not bundled in this checkout.');
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (!read.valid) throw new Error(`${file}: ${read.error}`);
        backupOnce(file);
        const next = {
          ...read.data,
          mcpServers: {
            ...(read.data.mcpServers && typeof read.data.mcpServers === 'object' ? read.data.mcpServers : {}),
            [MCP_SERVER_KEY]: entry,
          },
        };
        writeAtomic(file, JSON.stringify(next, null, 2) + '\n');
        return { configPath: file, command: entry.command };
      },
      uninstall() {
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (read.exists && read.valid && read.data.mcpServers?.[MCP_SERVER_KEY]) {
          const mcpServers = { ...read.data.mcpServers };
          delete mcpServers[MCP_SERVER_KEY];
          writeAtomic(file, JSON.stringify({ ...read.data, mcpServers }, null, 2) + '\n');
        }
        return { removed: true };
      },
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      kind: 'mcp',
      description: 'Register Stratat MCP server in Windsurf (~/.codeium/windsurf/mcp_config.json).',
      configPath: () => join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      detectApp: () => existsSync(join(home, '.codeium', 'windsurf')),
      inspect(ctx) {
        const file = this.configPath();
        const read = readJsonSafe(file);
        const entry = read.data?.mcpServers?.[MCP_SERVER_KEY] ?? null;
        const installed = Boolean(entry?.command);
        const binaryExists = installed ? existsSync(entry.command) : false;
        const wanted = mcpEntryFor(ctx);
        const upToDate = Boolean(installed && wanted && entry.command === wanted.command && entry.args?.[0] === wanted.args[0]);
        return { installed, upToDate, valid: read.valid && (!installed || binaryExists), error: read.error ?? null, detail: entry?.command ?? null };
      },
      install(ctx) {
        const entry = mcpEntryFor(ctx);
        if (!entry) throw new Error('Stratat Control MCP server (tools/strata_mcp.py) is not bundled in this checkout.');
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (!read.valid) throw new Error(`${file}: ${read.error}`);
        backupOnce(file);
        const next = {
          ...read.data,
          mcpServers: {
            ...(read.data.mcpServers && typeof read.data.mcpServers === 'object' ? read.data.mcpServers : {}),
            [MCP_SERVER_KEY]: entry,
          },
        };
        writeAtomic(file, JSON.stringify(next, null, 2) + '\n');
        return { configPath: file, command: entry.command };
      },
      uninstall() {
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (read.exists && read.valid && read.data.mcpServers?.[MCP_SERVER_KEY]) {
          const mcpServers = { ...read.data.mcpServers };
          delete mcpServers[MCP_SERVER_KEY];
          writeAtomic(file, JSON.stringify({ ...read.data, mcpServers }, null, 2) + '\n');
        }
        return { removed: true };
      },
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      kind: 'openai',
      description: 'Add Stratat Local provider to Codex CLI (~/.codex/config.toml).',
      configPath: () => join(home, '.codex', 'config.toml'),
      detectApp: () => existsSync(join(home, '.codex')),
      inspect(ctx) {
        const file = this.configPath();
        if (!existsSync(file)) return { installed: false, upToDate: false, valid: true, error: null, detail: null };
        const text = readFileSync(file, 'utf8');
        const installed = text.includes(TOML_START) && text.includes(TOML_END);
        const expected = buildCodexBlock(ctx.apiBaseUrl);
        return { installed, upToDate: installed && text.includes(expected), valid: true, error: null, detail: installed ? ctx.apiBaseUrl : null };
      },
      install(ctx) {
        const file = this.configPath();
        backupOnce(file);
        const prev = existsSync(file) ? readFileSync(file, 'utf8') : '';
        const cleaned = stripCodexBlock(prev).trimEnd();
        const block = buildCodexBlock(ctx.apiBaseUrl);
        const out = cleaned ? `${cleaned}\n\n${block}\n` : `${block}\n`;
        writeAtomic(file, out);
        return { configPath: file, baseUrl: ctx.apiBaseUrl };
      },
      uninstall() {
        const file = this.configPath();
        if (!existsSync(file)) return { removed: true };
        const prev = readFileSync(file, 'utf8');
        const next = stripCodexBlock(prev);
        writeAtomic(file, next ? (next.endsWith('\n') ? next : `${next}\n`) : '');
        return { removed: true };
      },
    },
    {
      id: 'continue',
      name: 'Continue (VS Code / JetBrains)',
      kind: 'openai',
      description: 'Add Stratat Local model to Continue (~/.continue/config.json).',
      configPath: () => join(home, '.continue', 'config.json'),
      detectApp: () => existsSync(join(home, '.continue')),
      inspect(ctx) {
        const file = this.configPath();
        const read = readJsonSafe(file);
        const list = Array.isArray(read.data.models) ? read.data.models : [];
        const entry = list.find((m) => m?.title === CONTINUE_TITLE) ?? null;
        const installed = Boolean(entry);
        const upToDate = Boolean(entry && entry.apiBase === ctx.apiBaseUrl);
        return { installed, upToDate, valid: read.valid, error: read.error ?? null, detail: entry?.apiBase ?? null };
      },
      install(ctx) {
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (!read.valid) throw new Error(`${file}: ${read.error}`);
        backupOnce(file);
        const prevModels = Array.isArray(read.data.models) ? read.data.models.filter((m) => m?.title !== CONTINUE_TITLE) : [];
        const entry = {
          title: CONTINUE_TITLE,
          provider: 'openai',
          model: ctx.modelId || 'local',
          apiBase: ctx.apiBaseUrl,
          apiKey: ctx.apiKey || 'stratat-local',
        };
        const next = { ...read.data, models: [...prevModels, entry] };
        writeAtomic(file, JSON.stringify(next, null, 2) + '\n');
        return { configPath: file, apiBase: ctx.apiBaseUrl };
      },
      uninstall() {
        const file = this.configPath();
        const read = readJsonSafe(file);
        if (read.exists && read.valid && Array.isArray(read.data.models)) {
          const models = read.data.models.filter((m) => m?.title !== CONTINUE_TITLE);
          writeAtomic(file, JSON.stringify({ ...read.data, models }, null, 2) + '\n');
        }
        return { removed: true };
      },
    },
  ];

  const byId = new Map(definitions.map((d) => [d.id, d]));

  function list() {
    const ctx = getContext();
    return definitions.map((d) => {
      const status = d.inspect(ctx);
      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        description: d.description,
        configPath: d.configPath(),
        appDetected: d.detectApp(),
        canInstall: d.kind === 'mcp' ? Boolean(mcpEntryFor(ctx)) : true,
        ...status,
      };
    });
  }

  function install(id) {
    const def = byId.get(id);
    if (!def) throw new Error(`Unknown integration: ${id}`);
    const ctx = getContext();
    const result = def.install(ctx);
    const status = def.inspect(ctx);
    return { ok: true, id, ...result, status };
  }

  function uninstall(id) {
    const def = byId.get(id);
    if (!def) throw new Error(`Unknown integration: ${id}`);
    const ctx = getContext();
    def.uninstall();
    return { ok: true, id, status: def.inspect(ctx) };
  }

  async function verify(id, { fetcher = fetch } = {}) {
    const def = byId.get(id);
    if (!def) throw new Error(`Unknown integration: ${id}`);
    const ctx = getContext();
    const configStatus = def.inspect(ctx);
    let apiReachable = null;
    if (def.kind !== 'mcp') {
      try {
        const res = await fetcher(`${ctx.apiBaseUrl.replace(/\/+$/, '')}/models`, {
          headers: ctx.apiKey ? { authorization: `Bearer ${ctx.apiKey}` } : {},
          signal: AbortSignal.timeout(3000),
        });
        apiReachable = res.ok;
      } catch {
        apiReachable = false;
      }
    }
    return {
      ok: configStatus.installed && configStatus.valid,
      id,
      configStatus,
      apiReachable,
      apiBaseUrl: ctx.apiBaseUrl,
    };
  }

  return { list, install, uninstall, verify };
}
