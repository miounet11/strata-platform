import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { engineStoreRoot, installBundledEngine, removeVerifiedBundle } from '../server/bundled-engine.mjs';

function makePackage(root, folder, { id, shape = null, version, platform = 'macos-arm64', backend = 'metal', entrypoint }) {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  const payload = Buffer.from(`binary-${id}-${version}`);
  writeFileSync(join(dir, entrypoint), payload);
  const manifest = {
    schema_version: 2,
    id,
    name: id,
    ...(shape ? { shape } : {}),
    version,
    platform,
    backend,
    archs: ['apple-gpu'],
    build_id: 'test+metal',
    entrypoint,
    files: [
      {
        path: entrypoint,
        bytes: payload.length,
        sha256: createHash('sha256').update(payload).digest('hex'),
      },
    ],
  };
  writeFileSync(join(dir, 'engine-component.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

test('installBundledEngine installs primary strata-engine and shape engines (hy4, inkling2) into Control store paths', async () => {
  const base = mkdtempSync(join(tmpdir(), 'stratat-eng-fam-'));
  const bundleDir = join(base, 'engine-bundle');
  const components = join(base, 'components');
  try {
    const mPrimary = makePackage(bundleDir, '0.1.69-macos-arm64-metal', { id: 'strata-engine', version: '0.1.69', entrypoint: 'strata' });
    const mHy4 = makePackage(bundleDir, '0.1.67-macos-arm64-metal-hy4', { id: 'strata-hy4', shape: 'hy4', version: '0.1.67', entrypoint: 'strata-hy4' });
    const mInkling = makePackage(bundleDir, '0.1.67-macos-arm64-metal-inkling', { id: 'strata-inkling', shape: 'inkling2', version: '0.1.67', entrypoint: 'strata-inkling' });

    assert.equal(engineStoreRoot(components, mPrimary), join(components, 'engine'));
    assert.equal(engineStoreRoot(components, mHy4), join(components, 'shapes', 'hy4', 'engine'));
    assert.equal(engineStoreRoot(components, mInkling), join(components, 'shapes', 'inkling2', 'engine'));

    const res = await installBundledEngine({ bundleDir, components, platform: 'macos-arm64', driver: null, backend: null });
    assert.equal(res.action, 'installed');
    assert.equal(res.families.length, 3);
    assert.equal(existsSync(join(components, 'engine', '0.1.69-macos-arm64-metal', 'strata')), true);
    assert.equal(existsSync(join(components, 'shapes', 'hy4', 'engine', '0.1.67-macos-arm64-metal-hy4', 'strata-hy4')), true);
    assert.equal(existsSync(join(components, 'shapes', 'inkling2', 'engine', '0.1.67-macos-arm64-metal-inkling', 'strata-inkling')), true);

    // Second run keeps all 3 without rewriting
    const second = await installBundledEngine({ bundleDir, components, platform: 'macos-arm64', driver: null, backend: null });
    assert.equal(second.action, 'kept');
    assert.equal(second.families.every((f) => f.action === 'kept'), true);

    // Non-.app cleanup verifies all 3 families before removing bundle
    const cleaned = await removeVerifiedBundle({ bundleDir, components });
    assert.equal(cleaned.removed, true);
    assert.equal(cleaned.packages, 3);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('firstRunLanguage lands Chinese users in zh even when en-US is listed first, while respecting non-China locales', async () => {
  const out = await build({
    entryPoints: ['src/lib/language-detect.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  assert.equal(mod.firstRunLanguage(['en-US', 'zh-CN'], 'Asia/Shanghai'), 'zh');
  assert.equal(mod.firstRunLanguage(['en-US'], 'Asia/Shanghai'), 'zh');
  assert.equal(mod.firstRunLanguage(['en-US', 'zh-CN'], 'America/New_York'), 'zh');
  assert.equal(mod.firstRunLanguage(['en-US'], 'America/New_York'), 'en');
  assert.equal(mod.firstRunLanguage(['ja-JP', 'en-US'], 'Asia/Tokyo'), 'ja');
  assert.equal(mod.firstRunLanguage(['de-DE'], 'Europe/Berlin'), 'de');
  assert.equal(mod.firstRunLanguage(['zh-TW'], 'Asia/Taipei'), 'zh');
});
