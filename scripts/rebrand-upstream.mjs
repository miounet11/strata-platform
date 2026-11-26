#!/usr/bin/env node
/**
 * Deterministically rebrand upstream Niko1221/Strata (apps/client-upstream) into Stratat,
 * preserving every upstream engine protocol invariant documented in docs/UPSTREAM.md:
 *   - STRATA_* env vars, x-strata-* headers
 *   - strata.py, strata_control, strata_cli, strata_mcp.py, setup.py
 *   - strata-engine, strata-hy4, strata-inkling, strata-control, strata-feed
 *   - strata.prefs.*, strata.sessions.*, strata.touched.*, strata.config-draft.*
 *   - "service": "strata" wire protocol
 *   - CLI verbs: `strata launch`, `strata update`, `strata install`, `strata runtime`, `strata repair-access`
 *
 * Also applies Stratat's fork patches cleanly (idempotent):
 *   1. China-region first-run auto-Chinese detection in language-detect.ts + store.ts
 *   2. macOS /var/folders temp dir allowlist in chat-files.mjs
 *   3. Explicit simulation guard (STRATA_REAL_ENGINE=0) in inference.mjs
 *   4. Source-tree-absent test skip guards (timeskip-real.test.mjs, etc.)
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CLIENT = join(ROOT, 'apps', 'client-upstream');
const DESKTOP = join(CLIENT, 'desktop');
const HOST = join(CLIENT, 'host');

const VERSION = JSON.parse(readFileSync(join(HOST, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------------------
// 1. Manifests (package.json, Cargo.toml, tauri.conf.json)
// ---------------------------------------------------------------------------

function patchJson(file, mutator) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  mutator(data);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

patchJson(join(DESKTOP, 'package.json'), (pkg) => {
  pkg.name = 'stratat-desktop';
  pkg.productName = 'Stratat';
  pkg.description = 'Stratat Desktop - local AI, tuned to one model.';
});

patchJson(join(HOST, 'package.json'), (pkg) => {
  pkg.name = 'stratat';
  pkg.description = 'Stratat \u2014 local AI, tuned to one model. Web shell + engine host.';
});

{
  const cargoPath = join(DESKTOP, 'src-tauri', 'Cargo.toml');
  let cargo = readFileSync(cargoPath, 'utf8');
  cargo = cargo
    .replace(/^name = "strata-desktop"/m, 'name = "stratat-desktop"')
    .replace(/^description = "Strata Desktop — local AI, tuned to one model\."/m, 'description = "Stratat Desktop — local AI, tuned to one model."');
  writeFileSync(cargoPath, cargo, 'utf8');
}

patchJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'), (conf) => {
  conf.productName = 'Stratat';
  // Aligned with Apple Developer App ID (commit c175dc3). Never revert to ai.stratat.desktop.
  conf.identifier = 'com.ksxw.stratat';
  conf.bundle = conf.bundle ?? {};
  conf.bundle.icon = [
    'icons/32x32.png',
    'icons/64x64.png',
    'icons/128x128.png',
    'icons/128x128@2x.png',
    'icons/icon-512.png',
    'icons/icon.icns',
    'icons/icon.ico',
  ];
  conf.bundle.longDescription =
    'Stratat runs one local model, tuned to your machine. Desktop and Terminal share the same model inventory, profiles, runtime and agent sessions.';
  conf.bundle.macOS = {
    ...(conf.bundle.macOS ?? {}),
    minimumSystemVersion: '15.0',
    entitlements: 'entitlements.plist',
    signingIdentity: 'Developer ID Application: Kunshan Xingwang Shuke Network Technology Co., Ltd. (2B7JZ4N26U)',
    hardenedRuntime: true,
  };
  conf.bundle.createUpdaterArtifacts = true;
  conf.plugins = conf.plugins ?? {};
  conf.plugins.updater = {
    ...(conf.plugins.updater ?? {}),
    pubkey:
      'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDRDMjk0OTFDNzM5NTRBQUIKUldTclNwVnpIRWtwVElFSFlhZ21kVTZHT0Y5cUgzV3ozWjd1WXljc1NYLzhobWtudkhEbCtEcjIK',
    endpoints: [
      'https://github.com/miounet11/strata-platform/releases/latest/download/latest.json',
    ],
    windows: {
      installMode: 'passive',
    },
  };
});

// ---------------------------------------------------------------------------
// 2. Safe text rebrand helper (protects engine protocol tokens & URLs)
// ---------------------------------------------------------------------------

/**
 * Replace user-visible "Strata" product name with "Stratat" while keeping all
 * upstream engine, model, quant, URL, CLI, and protocol strings intact.
 */
function rebrandBrandWord(text) {
  // Mask strings that must NEVER be touched.
  const masks = [];
  const mask = (re) => {
    text = text.replace(re, (m) => {
      const token = `\u0000MASK${masks.length}\u0000`;
      masks.push(m);
      return token;
    });
  };

  // URLs, GitHub repos, HF repos, package names, identifiers
  mask(/https?:\/\/[^\s"'`<>)]+/g);
  mask(/Niko1221\/Strata\b/g);
  mask(/strata-engine\/[A-Za-z0-9._-]+/g);
  mask(/Inkling-2-Mini-Strata\b/g);
  mask(/Qwen3\.8-Flash-Next-Strata\b/g);
  mask(/Strata(?:\s+|-)Quant(?:ization|s)?\b/g);
  mask(/Strata-0\.\d[^\s"'`]*/g);
  mask(/Strata\.app(?:\.tar\.gz)?/g);
  mask(/STRATA_[A-Z0-9_]+/g);
  mask(/strata_control|strata_cli|strata_mcp|strata_pack|strata_gguf|strata_bench|strata_inspect|strata_tokenizer|strata_quants|strata_quant_tables/g);
  mask(/strata\.py\b/g);
  mask(/strata-(?:engine|hy4|inkling|control|feed|terminal|vision|pi-ai|fs-search|mcp-session|gguf|pack|other|mark|lockup)[A-Za-z0-9._-]*/g);
  mask(/strata\.(?:prefs|sessions|touched|config-draft|remote-model|chats)\.[A-Za-z0-9._-]+/g);
  mask(/x-strata-[a-z0-9-]+/gi);
  mask(/\/brand\/strata-[a-z0-9.-]+/g);
  mask(/Stratat/g);

  // Replace standalone "Strata" (capitalized brand name) with "Stratat"
  text = text.replace(/\bStrata\b/g, 'Stratat');

  // Unmask in reverse order
  for (let i = masks.length - 1; i >= 0; i--) {
    text = text.replaceAll(`\u0000MASK${i}\u0000`, masks[i]);
  }
  return text;
}

// ---------------------------------------------------------------------------
// 3. Rust shell rebranding (src-tauri/src/*.rs)
// ---------------------------------------------------------------------------

const rustDir = join(DESKTOP, 'src-tauri', 'src');
for (const name of readdirSync(rustDir)) {
  if (!name.endsWith('.rs')) continue;
  const p = join(rustDir, name);
  let src = readFileSync(p, 'utf8');

  // Specific identifiers & paths (never touch identity.rs "service":"strata")
  src = src
    .replaceAll('strata-desktop', 'stratat-desktop')
    .replaceAll('[strata]', '[stratat]')
    .replaceAll('strata-logs-', 'stratat-logs-')
    .replaceAll('.join(".strata")', '.join(".stratat")')
    .replaceAll('.join("strata")', '.join("stratat")')
    .replaceAll('.join("Strata")', '.join("Stratat")')
    .replaceAll('Software\\Strata\\Strata', 'Software\\Stratat\\Stratat')
    .replaceAll('Uninstall\\Strata', 'Uninstall\\Stratat')
    .replaceAll('"/usr/lib/Strata"', '"/usr/lib/Stratat"')
    .replaceAll('"usr/lib/Strata"', '"usr/lib/Stratat"')
    .replaceAll('Strata.app', 'Stratat.app');

  if (name !== 'identity.rs') {
    src = rebrandBrandWord(src);
  } else {
    // Only rebrand comments in identity.rs, never the JSON wire value "strata"
    src = src.replace(/(\/\/[^\n]*)/g, (m) => rebrandBrandWord(m));
  }

  // Ensure updater.rs check_install_dir data_dir uses Stratat on Windows
  writeFileSync(p, src, 'utf8');
}

// ---------------------------------------------------------------------------
// 4. Host server rebranding & data paths
// ---------------------------------------------------------------------------

function walk(dir, filter) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'target'].includes(e.name)) continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

// Specific path & repo rewrites in server/
const serverUpdates = [
  [
    join(HOST, 'server', 'store.mjs'),
    (s) =>
      s
        .replaceAll("join(homedir(), '.strata')", "join(homedir(), '.stratat')")
        .replaceAll("join(process.cwd(), '.strata')", "join(process.cwd(), '.stratat')")
        .replaceAll("join(HOME,'Strata-data')", "join(HOME,'Stratat-data')")
        .replaceAll('[strata]', '[stratat]'),
  ],
  [
    join(HOST, 'server', 'control-runtime.mjs'),
    (s) =>
      s
        .replaceAll("'Strata', 'components'", "'Stratat', 'components'")
        .replaceAll("'strata', 'components'", "'stratat', 'components'"),
  ],
  [
    join(HOST, 'server', 'platform-paths.mjs'),
    (s) =>
      s
        .replaceAll("winPath(local, 'Strata')", "winPath(local, 'Stratat')")
        .replaceAll(", 'strata')", ", 'stratat')"),
  ],
  [
    join(HOST, 'server', 'model-directory-default.mjs'),
    (s) =>
      s
        .replaceAll(",'Strata','Models'", ",'Stratat','Models'")
        .replaceAll(",'Strata','Workspace'", ",'Stratat','Workspace'"),
  ],
  [
    join(HOST, 'server', 'model-folder.mjs'),
    (s) =>
      s
        .replaceAll("join(path, 'Strata')", "join(path, 'Stratat')")
        .replaceAll("join(path, 'Strata', 'Models')", "join(path, 'Stratat', 'Models')"),
  ],
  [
    join(HOST, 'server', 'updates.mjs'),
    (s) =>
      s
        .replaceAll('https://api.github.com/repos/Niko1221/Strata/releases?per_page=30', 'https://api.github.com/repos/miounet11/strata-platform/releases?per_page=30')
        .replaceAll('https://github.com/Niko1221/Strata/releases/', 'https://github.com/miounet11/strata-platform/releases/'),
  ],
  [
    join(HOST, 'server', 'bundled-engine.mjs'),
    (s) =>
      s.replaceAll(
        "export const RELEASES_URL = 'https://github.com/Niko1221/Strata/releases';",
        "export const RELEASES_URL = 'https://github.com/miounet11/strata-platform/releases';",
      ),
  ],
];

for (const [file, fn] of serverUpdates) {
  if (!existsSync(file)) continue;
  writeFileSync(file, fn(readFileSync(file, 'utf8')), 'utf8');
}

// Rebrand user-visible "Strata" word across host/server, host/src, host/index.html, host/public/site.webmanifest
const textFiles = [
  join(HOST, 'index.html'),
  join(HOST, 'public', 'site.webmanifest'),
  ...walk(join(HOST, 'server'), (p) => /\.(mjs|cjs|js)$/.test(p)),
  ...walk(join(HOST, 'src'), (p) => /\.(ts|tsx|json|css)$/.test(p) && !p.endsWith('/src/styles/kit/components.css')),
].filter((p) => existsSync(p));

for (const p of textFiles) {
  const before = readFileSync(p, 'utf8');
  let after = rebrandBrandWord(before);
  // Also rebrand "[strata]" console prefixes in server/
  if (p.includes('/server/')) {
    after = after.replaceAll('[strata]', '[stratat]');
  }
  // Keep workspaces default folder aligned in server/index.mjs (Documents/Stratat/Workspace)
  if (p.endsWith('/server/index.mjs')) {
    after = after.replaceAll("'Strata'", "'Stratat'");
  }
  if (after !== before) writeFileSync(p, after, 'utf8');
}

// Also update tests that explicitly assert on the rebranded product strings / paths
const testFiles = walk(join(HOST, 'tests'), (p) => /\.(mjs|js|ts)$/.test(p));
for (const p of testFiles) {
  const before = readFileSync(p, 'utf8');
  let after = before;

  // Keep upstream release URLs intact where tests mock GitHub responses, EXCEPT updates.test.mjs which checks RELEASE_PREFIX
  if (p.endsWith('/updates.test.mjs')) {
    after = after.replaceAll('https://github.com/Niko1221/Strata/releases/', 'https://github.com/miounet11/strata-platform/releases/');
  }

  after = after
    .replaceAll("join(home, 'Documents', 'Strata', 'Models')", "join(home, 'Documents', 'Stratat', 'Models')")
    .replaceAll("Documents\\\\Strata\\\\Models", "Documents\\\\Stratat\\\\Models")
    .replaceAll("Documents/Strata/Models", "Documents/Stratat/Models")
    .replaceAll("Documents\\\\Strata\\\\Workspace", "Documents\\\\Stratat\\\\Workspace")
    .replaceAll("Documents/Strata/Workspace", "Documents/Stratat/Workspace")
    .replaceAll("'Strata', 'Models'", "'Stratat', 'Models'")
    .replaceAll("'Strata', 'Workspace'", "'Stratat', 'Workspace'")
    .replaceAll("AppData\\\\Local\\\\Strata", "AppData\\\\Local\\\\Stratat")
    .replaceAll("'AppData', 'Local', 'Strata'", "'AppData', 'Local', 'Stratat'")
    .replaceAll(".local/share/strata", ".local/share/stratat")
    .replaceAll(".local/state/strata", ".local/state/stratat")
    .replaceAll("', 'strata', 'components'", "', 'stratat', 'components'")
    .replaceAll("', 'Strata', 'components'", "', 'Stratat', 'components'")
    .replaceAll("', 'strata', 'tuning'", "', 'stratat', 'tuning'")
    .replaceAll("', 'strata', 'time-skip'", "', 'stratat', 'time-skip'");

  after = rebrandBrandWord(after);
  if (after !== before) writeFileSync(p, after, 'utf8');
}

// ---------------------------------------------------------------------------
// 5. Fork patches (idempotent)
// ---------------------------------------------------------------------------

// Patch 5a: China-region first-run Chinese language detection (language-detect.ts + store.ts)
{
  const langDetectPath = join(HOST, 'src', 'lib', 'language-detect.ts');
  const langDetectCode = `import { LANGUAGES, type Language } from './i18n';

/**
 * Whether this machine is being used in mainland China. Language preference order alone is not
 * enough: Chinese Windows/macOS installs commonly list \`en-US\` first and \`zh-CN\` second, so
 * checking only the first tag would still hand those users an English interface.
 */
export function chinaRegion(
  tags?: readonly string[] | null,
  timeZone?: string | null,
): boolean {
  const tz = timeZone ?? (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
      return '';
    }
  })();
  if (/^(Asia\\/(Shanghai|Chongqing|Harbin|Urumqi|Kashgar|Beijing))$/i.test(tz)) {
    return true;
  }
  return (tags ?? []).some((tag) => /^zh\\b/i.test(String(tag)) && /[-_](CN|Hans)\\b/i.test(String(tag)));
}

/**
 * The first start (nothing saved yet) opens in the language of the computer (#3723):
 * Chinese for users in China (even if en-US appears first), otherwise the first of the
 * browser's preferred languages that Stratat has. "pt-BR" is Portuguese, "zh-TW" is Chinese.
 * Null when none of them is offered.
 */
export function detectLanguage(
  tags: readonly string[] | null | undefined,
  options?: { timeZone?: string | null; checkChinaRegion?: boolean },
): Language | null {
  if (options?.checkChinaRegion && chinaRegion(tags, options.timeZone)) {
    return 'zh';
  }
  for (const raw of tags ?? []) {
    const base = String(raw).toLowerCase().split(/[-_]/)[0];
    const found = LANGUAGES.find(l => l.value === base);
    if (found) return found.value;
  }
  return null;
}

/** First-run UI language: Chinese in China, else the browser's preferred language, else English. */
export function firstRunLanguage(
  tags?: readonly string[] | null,
  timeZone?: string | null,
): Language {
  if (typeof navigator === 'undefined' && !tags && timeZone === undefined) return 'en';
  const list = tags ?? (typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean));
  return detectLanguage(list, { timeZone, checkChinaRegion: true }) ?? 'en';
}
`;
  writeFileSync(langDetectPath, langDetectCode, 'utf8');

  const storePath = join(HOST, 'src', 'lib', 'store.ts');
  let storeSrc = readFileSync(storePath, 'utf8');
  storeSrc = storeSrc.replace(
    "import { detectLanguage } from './language-detect';",
    "import { firstRunLanguage } from './language-detect';",
  );
  storeSrc = storeSrc.replace(
    /const tags = typeof navigator === 'undefined' \? \[\] : navigator\.languages\?\.length \? navigator\.languages : \[navigator\.language\];\s*return \{ \.\.\.PREFS_DEFAULTS, language: detectLanguage\(tags\) \?\? 'en' \};/,
    "const tags = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];\n  return { ...PREFS_DEFAULTS, language: firstRunLanguage(tags) };",
  );
  writeFileSync(storePath, storeSrc, 'utf8');
}

// Patch 5b: macOS /var/folders temp dir allowlist in chat-files.mjs
{
  const chatFilesPath = join(HOST, 'server', 'chat-files.mjs');
  let cf = readFileSync(chatFilesPath, 'utf8');
  if (!cf.includes('function isTempDir(')) {
    cf = cf.replace(
      "import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';",
      "import { tmpdir } from 'node:os';\nimport { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';",
    );
    cf = cf.replace(
      '/** A folder no chat may use as its project:',
      `/**
 * macOS keeps per-user temp files under /var/folders (realpath: /private/var/folders).
 * That is a place people write to, so the blanket \`/var\` rule must not catch it.
 */
function realpathSafe(p) {
  try { return realpathSync(p); } catch { return resolve(p); }
}
function isTempDir(p) {
  const t = realpathSafe(tmpdir());
  const q = realpathSafe(p);
  return q === t || q.startsWith(t + sep);
}

/** A folder no chat may use as its project:`,
    );
    cf = cf.replace(
      "} else if (/^\\/(bin|boot|dev|etc|lib|lib64|proc|root|run|sbin|sys|usr|var)(\\/|$)/.test(p) && !/^\\/run\\/media\\/[^/]+\\/./.test(p))",
      "} else if (!isTempDir(p) && /^\\/(bin|boot|dev|etc|lib|lib64|proc|root|run|sbin|sys|usr|var)(\\/|$)/.test(p) && !/^\\/run\\/media\\/[^/]+\\/./.test(p))",
    );
    writeFileSync(chatFilesPath, cf, 'utf8');
  }
}

// Patch 5c: Explicit simulation guard in inference.mjs (STRATA_REAL_ENGINE=0 never adopts Ollama/LM Studio)
{
  const infPath = join(HOST, 'server', 'inference.mjs');
  let inf = readFileSync(infPath, 'utf8');
  if (!inf.includes('function simulationRequested(')) {
    inf = inf.replace(
      'export function requiresRealEngine() {\n  if (process.env.STRATA_FORCE_DEMO === \'1\' && process.env.STRATA_PACKAGED !== \'1\') return false;\n  if (process.env.STRATA_REAL_ENGINE === \'1\') return true;\n  return process.env.STRATA_PACKAGED === \'1\';\n}',
      `export function requiresRealEngine() {
  if (process.env.STRATA_FORCE_DEMO === '1' && process.env.STRATA_PACKAGED !== '1') return false;
  if (process.env.STRATA_REAL_ENGINE === '1') return true;
  return process.env.STRATA_PACKAGED === '1';
}

/**
 * True when the caller explicitly asked for simulated output. A packaged build can never opt in.
 */
function simulationRequested() {
  if (process.env.STRATA_PACKAGED === '1') return false;
  return process.env.STRATA_FORCE_DEMO === '1' || process.env.STRATA_REAL_ENGINE === '0';
}`,
    );
    inf = inf.replace(
      '  for (const c of CANDIDATES) {',
      '  if (!simulationRequested()) for (const c of CANDIDATES) {',
    );
    writeFileSync(infPath, inf, 'utf8');
  }
}

// Patch 5d: timeskip-real.test.mjs skip cleanly when upstream terminal/ source checkout is absent
{
  const tsTest = join(HOST, 'tests', 'timeskip-real.test.mjs');
  if (existsSync(tsTest)) {
    let s = readFileSync(tsTest, 'utf8');
    s = s.replace(
      "const hasPython = spawnSync(PYTHON, ['--version'], { windowsHide: true }).status === 0;",
      "const hasPython = spawnSync(PYTHON, ['--version'], { windowsHide: true }).status === 0;\nconst hasTerminalRepo = existsSync(join(REPO, 'strata.py'));",
    );
    s = s.replaceAll(
      "!hasPython && 'no python on this machine'",
      "(!hasPython && 'no python on this machine') || (!hasTerminalRepo && 'terminal source checkout is absent in client-only fork')",
    );
    writeFileSync(tsTest, s, 'utf8');
  }
}

console.log(`✓ Rebranded apps/client-upstream to Stratat ${VERSION}`);
