/**
 * Download mirror, ModelScope, and proxy preferences for Stratat Desktop.
 *
 * Persists user-selected download routing in `<dataDir>/network-prefs.json` (0600) and applies
 * it to `HF_ENDPOINT`, `STRATA_SOURCE`, `HTTPS_PROXY`, and `HTTP_PROXY` so every model download,
 * vision shard, drafter download, image-model download, and Control update works reliably in both
 * global and mainland-China networks.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DOWNLOAD_SOURCES = Object.freeze(['auto', 'huggingface', 'modelscope']);

export const MIRROR_PRESETS = Object.freeze([
  { id: 'official', label: 'Hugging Face (Official)', source: 'auto', hfEndpoint: '' },
  { id: 'hf-mirror', label: 'HF-Mirror (China Fast)', source: 'huggingface', hfEndpoint: 'https://hf-mirror.com' },
  { id: 'modelscope', label: 'ModelScope (China Native)', source: 'modelscope', hfEndpoint: 'https://hf-mirror.com' },
]);

export const PROBE_TARGETS = Object.freeze([
  { id: 'huggingface', label: 'Hugging Face', url: 'https://huggingface.co/api/models?limit=1' },
  { id: 'hf-mirror', label: 'HF-Mirror', url: 'https://hf-mirror.com/api/models?limit=1' },
  { id: 'modelscope', label: 'ModelScope', url: 'https://modelscope.cn/api/v1/models?PageSize=1' },
  { id: 'github', label: 'GitHub Releases', url: 'https://api.github.com/rate_limit' },
]);

export const DEFAULTS = Object.freeze({
  source: 'auto',
  hfEndpoint: '',
  httpsProxy: '',
  httpProxy: '',
});

/** Validate an optional HTTPS (or loopback HTTP) mirror endpoint. */
export function validateHfEndpoint(raw) {
  const value = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Enter a valid mirror address starting with https:// (for example https://hf-mirror.com).');
  }
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new Error('Mirror address must use https:// (or http://127.0.0.1 for a local mirror).');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Mirror address must be a plain host URL without credentials or query parameters.');
  }
  return value;
}

/** Validate an optional HTTP/HTTPS/SOCKS5 proxy URL. */
export function validateProxyUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Enter a valid proxy URL such as http://127.0.0.1:7890 or socks5://127.0.0.1:1080.');
  }
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(parsed.protocol)) {
    throw new Error('Proxy URL must start with http://, https://, socks5://, or socks5h://.');
  }
  return value;
}

export function normalizeNetworkPrefs(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const source = DOWNLOAD_SOURCES.includes(raw.source) ? raw.source : DEFAULTS.source;
  let hfEndpoint = '';
  let httpsProxy = '';
  let httpProxy = '';
  try { hfEndpoint = validateHfEndpoint(raw.hfEndpoint); } catch { hfEndpoint = ''; }
  try { httpsProxy = validateProxyUrl(raw.httpsProxy); } catch { httpsProxy = ''; }
  try { httpProxy = validateProxyUrl(raw.httpProxy); } catch { httpProxy = ''; }
  return { source, hfEndpoint, httpsProxy, httpProxy };
}

/**
 * Overlay saved network preferences onto an environment object.
 * Keys set by Stratat are applied cleanly; unset values fall back to any ambient environment
 * unless `clearUnset` is true (used when syncing directly to `process.env`).
 */
export function applyNetworkEnv(prefs, targetEnv = process.env, { managedKeys = null } = {}) {
  const clean = normalizeNetworkPrefs(prefs);
  const next = { ...targetEnv };
  const setOrRestore = (key, val) => {
    if (val) {
      next[key] = val;
    } else if (managedKeys && managedKeys.has(key)) {
      delete next[key];
    }
  };
  setOrRestore('HF_ENDPOINT', clean.hfEndpoint);
  setOrRestore('STRATA_SOURCE', clean.source !== 'auto' ? clean.source : '');
  setOrRestore('HTTPS_PROXY', clean.httpsProxy);
  setOrRestore('https_proxy', clean.httpsProxy);
  setOrRestore('HTTP_PROXY', clean.httpProxy || clean.httpsProxy);
  setOrRestore('http_proxy', clean.httpProxy || clean.httpsProxy);
  return next;
}

/** Decide the best preset recommendation from live probe timings. */
export function recommendFromProbe(results = []) {
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const hf = byId.huggingface;
  const mirror = byId['hf-mirror'];
  const ms = byId.modelscope;
  if (hf?.ok && (hf.latencyMs ?? 9999) < 2500) {
    return {
      preset: 'official',
      reason: 'Hugging Face is reachable with low latency.',
    };
  }
  if (ms?.ok && (!hf?.ok || (ms.latencyMs ?? 9999) < (hf.latencyMs ?? 9999))) {
    return {
      preset: 'modelscope',
      reason: 'Hugging Face is slow or unreachable; ModelScope + HF-Mirror is faster on this network.',
    };
  }
  if (mirror?.ok) {
    return {
      preset: 'hf-mirror',
      reason: 'Hugging Face is slow or unreachable; HF-Mirror responded quickly.',
    };
  }
  return {
    preset: 'official',
    reason: 'Direct mirror checks did not reach external hosts. Check your internet connection or configure a proxy.',
  };
}

export function createNetworkMirror({
  dataDir,
  env = process.env,
  fetcher = fetch,
  syncProcessEnv = true,
} = {}) {
  const file = join(dataDir, 'network-prefs.json');
  const managed = new Set();

  function readSaved() {
    try {
      if (!existsSync(file)) return { ...DEFAULTS };
      return normalizeNetworkPrefs(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      return { ...DEFAULTS };
    }
  }

  let current = readSaved();

  function syncEnv() {
    if (!syncProcessEnv) return;
    const applyOne = (key, val) => {
      if (val) {
        env[key] = val;
        managed.add(key);
      } else if (managed.has(key)) {
        delete env[key];
        managed.delete(key);
      }
    };
    applyOne('HF_ENDPOINT', current.hfEndpoint);
    applyOne('STRATA_SOURCE', current.source !== 'auto' ? current.source : '');
    applyOne('HTTPS_PROXY', current.httpsProxy);
    applyOne('https_proxy', current.httpsProxy);
    applyOne('HTTP_PROXY', current.httpProxy || current.httpsProxy);
    applyOne('http_proxy', current.httpProxy || current.httpsProxy);
  }

  syncEnv();

  function get() {
    return {
      ...current,
      effectiveHfEndpoint: current.hfEndpoint || env.HF_ENDPOINT || 'https://huggingface.co',
      effectiveSource: current.source !== 'auto' ? current.source : (env.STRATA_SOURCE || 'auto'),
      presets: MIRROR_PRESETS,
    };
  }

  function save(patch = {}) {
    const next = {
      source: patch.source !== undefined ? String(patch.source).trim() : current.source,
      hfEndpoint: patch.hfEndpoint !== undefined ? validateHfEndpoint(patch.hfEndpoint) : current.hfEndpoint,
      httpsProxy: patch.httpsProxy !== undefined ? validateProxyUrl(patch.httpsProxy) : current.httpsProxy,
      httpProxy: patch.httpProxy !== undefined ? validateProxyUrl(patch.httpProxy) : current.httpProxy,
    };
    if (!DOWNLOAD_SOURCES.includes(next.source)) {
      throw new Error('Choose Automatic, Hugging Face, or ModelScope.');
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmp, file);
    current = next;
    syncEnv();
    return get();
  }

  async function probe({ timeoutMs = 5000 } = {}) {
    const results = await Promise.all(
      PROBE_TARGETS.map(async (target) => {
        const started = Date.now();
        try {
          const res = await fetcher(target.url, {
            method: 'GET',
            headers: { 'user-agent': 'Stratat-Desktop-Probe/1.0' },
            signal: AbortSignal.timeout(timeoutMs),
          });
          const latencyMs = Date.now() - started;
          // Any non-5xx HTTP response proves network reachability to the host (rate limits 403/429 still mean reachable)
          const ok = res.status > 0 && res.status < 500;
          return { id: target.id, label: target.label, url: target.url, ok, status: res.status, latencyMs };
        } catch (err) {
          return {
            id: target.id,
            label: target.label,
            url: target.url,
            ok: false,
            status: null,
            latencyMs: Date.now() - started,
            error: err?.name === 'TimeoutError' ? 'Timed out' : (err?.message ?? 'Unreachable'),
          };
        }
      }),
    );
    return {
      probedAt: new Date().toISOString(),
      results,
      recommendation: recommendFromProbe(results),
    };
  }

  return { get, save, probe, file };
}
