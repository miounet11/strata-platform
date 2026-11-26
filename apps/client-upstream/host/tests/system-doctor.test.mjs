import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnectorInstaller } from '../server/cloudflared-install.mjs';
import { createSystemDoctor } from '../server/system-doctor.mjs';
import { createNetworkMirror } from '../server/network-mirror.mjs';

test('cloudflared installer enforces STRATA_NO_ACQUIRE on implicit calls, and allows explicit user-triggered verified installs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stratat-cf-'));
  try {
    const payload = Buffer.from('#!/bin/sh\necho "cloudflared version 2026.1.0"\n');
    const sha = createHash('sha256').update(payload).digest('hex');
    const env = { PATH: '', STRATA_PACKAGED: '1', STRATA_NO_ACQUIRE: '1' };

    const installer = createConnectorInstaller({
      directory: join(dir, 'bin'),
      platform: 'linux',
      arch: 'x64',
      env,
      search: [],
      fetchImpl: async (url) => {
        if (String(url).includes('/releases/latest')) {
          return new Response(
            JSON.stringify({
              assets: [
                {
                  name: 'cloudflared-linux-amd64',
                  size: payload.length,
                  digest: `sha256:${sha}`,
                  browser_download_url: 'https://github.com/cloudflare/cloudflared/releases/download/2026.1.0/cloudflared-linux-amd64',
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(payload, { status: 200 });
      },
    });

    // Implicit call MUST still be blocked by AcquisitionRefused
    await assert.rejects(() => installer.ensure(), (err) => err.code === 'acquisition_refused');

    // Explicit user click installs and passes SHA-256 + --version check
    const installed = await installer.ensure({ explicit: true });
    assert.equal(installed, join(dir, 'bin', 'cloudflared'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('system doctor inspects runtimes, repairs, and redacts secrets from diagnostics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stratat-doc-'));
  try {
    const py = join(dir, 'python3');
    writeFileSync(py, '#!/bin/sh\n');
    const harness = join(dir, 'harness');
    mkdirSync(join(harness, 'lib'), { recursive: true });
    mkdirSync(join(harness, 'node_modules'), { recursive: true });
    writeFileSync(join(harness, 'lib', 'bin.js'), '');
    writeFileSync(join(harness, 'package.json'), JSON.stringify({ version: '0.2.1-alpha.3' }));

    let repairedAccess = false;
    let cleaned = false;
    const fakeControl = {
      version: '0.1.69',
      control: { dir, python: py },
      async engine() {
        return {
          usable: true,
          engine: { version: '0.1.69', backend: 'metal' },
          shapes: [{ shape: 'hy4', component: 'strata-hy4', usable: true, engine: { version: '0.1.67', backend: 'metal' } }],
        };
      },
      async repairAccess() { repairedAccess = true; return { ok: true }; },
      async cleanup() { cleaned = true; return { ok: true }; },
    };

    const mirror = createNetworkMirror({ dataDir: dir, syncProcessEnv: false });
    mirror.save({ httpsProxy: 'http://alice:supersecret@127.0.0.1:7890' });

    const doctor = createSystemDoctor({
      control: fakeControl,
      componentsDir: join(dir, 'components'),
      engineBundleDir: join(dir, 'no-bundle'),
      bundledHarnessDir: harness,
      modelsDir: join(dir, 'models'),
      diskFreeGb: () => 120.4,
      diskTotalGb: () => 500,
      networkMirror: mirror,
      appVersion: () => '0.2.22',
    });

    const state = await doctor.inspect();
    assert.equal(state.summary.allCoreReady, true);
    assert.equal(state.control.healthy, true);
    assert.equal(state.engines.primaryUsable, true);
    assert.equal(state.engines.shapes.length, 1);
    assert.equal(state.harness.installed, true);
    assert.equal(state.harness.version, '0.2.1-alpha.3');

    const repaired = await doctor.repair();
    assert.equal(repaired.ok, true);
    assert.equal(repairedAccess, true);
    assert.equal(cleaned, true);

    const diag = await doctor.diagnostics();
    const text = JSON.stringify(diag);
    assert.doesNotMatch(text, /supersecret/);
    assert.match(text, /\[redacted\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
