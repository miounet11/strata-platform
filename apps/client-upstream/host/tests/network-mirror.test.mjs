import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyNetworkEnv,
  createNetworkMirror,
  recommendFromProbe,
  validateHfEndpoint,
  validateProxyUrl,
} from '../server/network-mirror.mjs';

test('validateHfEndpoint accepts https and loopback http, rejects credentials and insecure remote hosts', () => {
  assert.equal(validateHfEndpoint(''), '');
  assert.equal(validateHfEndpoint('https://hf-mirror.com/'), 'https://hf-mirror.com');
  assert.equal(validateHfEndpoint('http://127.0.0.1:8088/'), 'http://127.0.0.1:8088');
  assert.throws(() => validateHfEndpoint('http://evil.example.com'), /https:\/\//);
  assert.throws(() => validateHfEndpoint('ftp://hf-mirror.com'), /https:\/\//);
  assert.throws(() => validateHfEndpoint('https://user:pass@hf-mirror.com'), /credentials/);
  assert.throws(() => validateHfEndpoint('not a url'), /valid mirror/);
});

test('validateProxyUrl accepts http, https, socks5, socks5h and rejects invalid schemes', () => {
  assert.equal(validateProxyUrl(''), '');
  assert.equal(validateProxyUrl('http://127.0.0.1:7890'), 'http://127.0.0.1:7890');
  assert.equal(validateProxyUrl('socks5h://127.0.0.1:1080'), 'socks5h://127.0.0.1:1080');
  assert.throws(() => validateProxyUrl('file:///etc/passwd'), /http:\/\/, https:\/\/, socks5:\/\//);
});

test('createNetworkMirror persists preferences, syncs target env, and restores cleanly on clear', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stratat-mirror-'));
  try {
    const fakeEnv = {};
    const mirror = createNetworkMirror({ dataDir: dir, env: fakeEnv, syncProcessEnv: true });
    assert.equal(mirror.get().effectiveHfEndpoint, 'https://huggingface.co');
    assert.equal(mirror.get().effectiveSource, 'auto');

    const saved = mirror.save({
      source: 'modelscope',
      hfEndpoint: 'https://hf-mirror.com/',
      httpsProxy: 'http://127.0.0.1:7890',
    });
    assert.equal(saved.effectiveHfEndpoint, 'https://hf-mirror.com');
    assert.equal(saved.effectiveSource, 'modelscope');
    assert.equal(fakeEnv.HF_ENDPOINT, 'https://hf-mirror.com');
    assert.equal(fakeEnv.STRATA_SOURCE, 'modelscope');
    assert.equal(fakeEnv.HTTPS_PROXY, 'http://127.0.0.1:7890');
    assert.equal(fakeEnv.HTTP_PROXY, 'http://127.0.0.1:7890');

    // Re-open from disk
    const persisted = JSON.parse(readFileSync(mirror.file, 'utf8'));
    assert.equal(persisted.source, 'modelscope');
    assert.equal(persisted.hfEndpoint, 'https://hf-mirror.com');

    // Clear back to official defaults
    mirror.save({ source: 'auto', hfEndpoint: '', httpsProxy: '' });
    assert.equal(fakeEnv.HF_ENDPOINT, undefined);
    assert.equal(fakeEnv.STRATA_SOURCE, undefined);
    assert.equal(fakeEnv.HTTPS_PROXY, undefined);

    const overlaid = applyNetworkEnv({ source: 'huggingface', hfEndpoint: 'https://hf-mirror.com', httpsProxy: '', httpProxy: '' }, { KEEP: '1' });
    assert.equal(overlaid.KEEP, '1');
    assert.equal(overlaid.HF_ENDPOINT, 'https://hf-mirror.com');
    assert.equal(overlaid.STRATA_SOURCE, 'huggingface');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('probe recommends ModelScope + HF-Mirror when Hugging Face fails in China networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stratat-probe-'));
  try {
    const mirror = createNetworkMirror({
      dataDir: dir,
      syncProcessEnv: false,
      fetcher: async (url) => {
        if (String(url).includes('huggingface.co')) throw new Error('connect ETIMEDOUT');
        return new Response('{}', { status: 200 });
      },
    });
    const report = await mirror.probe({ timeoutMs: 2000 });
    assert.equal(report.results.length, 4);
    assert.equal(report.results.find((r) => r.id === 'huggingface').ok, false);
    assert.equal(report.results.find((r) => r.id === 'modelscope').ok, true);
    assert.equal(report.recommendation.preset, 'modelscope');

    const fastHf = recommendFromProbe([
      { id: 'huggingface', ok: true, latencyMs: 120 },
      { id: 'modelscope', ok: true, latencyMs: 400 },
    ]);
    assert.equal(fastHf.preset, 'official');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
