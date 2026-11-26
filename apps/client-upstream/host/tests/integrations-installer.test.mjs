import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIntegrationsInstaller } from '../server/integrations-installer.mjs';

test('integrations installer backs up existing configs, preserves unrelated keys, verifies, and uninstalls cleanly', async () => {
  const home = mkdtempSync(join(tmpdir(), 'stratat-int-'));
  const controlDir = join(home, 'fake-control');
  const pythonBin = join(controlDir, 'python3');
  const mcpScript = join(controlDir, 'tools', 'strata_mcp.py');
  try {
    mkdirSync(join(controlDir, 'tools'), { recursive: true });
    writeFileSync(pythonBin, '#!/bin/sh\n');
    writeFileSync(mcpScript, '# mcp\n');

    // Seed pre-existing user configs for Claude Code, Cursor, Codex, and Continue
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ theme: 'dark', env: { USER_FLAG: 'keep' } }, null, 2));
    mkdirSync(join(home, '.cursor'), { recursive: true });
    writeFileSync(join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x.js'] } } }, null, 2));
    mkdirSync(join(home, '.codex'), { recursive: true });
    writeFileSync(join(home, '.codex', 'config.toml'), 'model = "o3"\n');
    mkdirSync(join(home, '.continue'), { recursive: true });
    writeFileSync(join(home, '.continue', 'config.json'), JSON.stringify({ models: [{ title: 'Existing', provider: 'openai' }] }, null, 2));

    const installer = createIntegrationsInstaller({
      home,
      getContext: () => ({
        apiBaseUrl: 'http://127.0.0.1:18500/v1',
        apiKey: 'sk-test-local',
        modelId: 'qwen3.8-flash-next',
        control: { dir: controlDir, python: pythonBin },
        componentsDir: join(home, 'components'),
      }),
    });

    // Install all 5 tools
    for (const id of ['claude-code', 'cursor', 'windsurf', 'codex', 'continue']) {
      const res = installer.install(id);
      assert.equal(res.ok, true, id);
      assert.equal(res.status.installed, true, id);
      assert.equal(res.status.upToDate, true, id);
      assert.equal(res.status.valid, true, id);
    }

    // Backups created & unrelated user keys preserved
    assert.equal(existsSync(join(home, '.claude', 'settings.json.stratat.bak')), true);
    const claude = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
    assert.equal(claude.theme, 'dark');
    assert.equal(claude.env.USER_FLAG, 'keep');
    assert.equal(claude.env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:18500');

    const cursor = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'));
    assert.equal(cursor.mcpServers.other.command, 'node');
    assert.equal(cursor.mcpServers.stratat.command, pythonBin);
    assert.equal(cursor.mcpServers.stratat.args[0], mcpScript);

    const codex = readFileSync(join(home, '.codex', 'config.toml'), 'utf8');
    assert.match(codex, /model = "o3"/);
    assert.match(codex, /\[model_providers\.stratat\]/);

    const cont = JSON.parse(readFileSync(join(home, '.continue', 'config.json'), 'utf8'));
    assert.equal(cont.models.length, 2);
    assert.equal(cont.models[0].title, 'Existing');
    assert.equal(cont.models[1].title, 'Stratat Local');

    // Verify with mock live API
    const v = await installer.verify('codex', {
      fetcher: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    });
    assert.equal(v.ok, true);
    assert.equal(v.apiReachable, true);

    // Uninstall all 5 tools cleanly and ensure user settings remain intact
    for (const id of ['claude-code', 'cursor', 'windsurf', 'codex', 'continue']) {
      const res = installer.uninstall(id);
      assert.equal(res.ok, true, id);
      assert.equal(res.status.installed, false, id);
    }
    const claudeAfter = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
    assert.equal(claudeAfter.env.USER_FLAG, 'keep');
    assert.equal(claudeAfter.env.ANTHROPIC_BASE_URL, undefined);

    const cursorAfter = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'));
    assert.equal(cursorAfter.mcpServers.other.command, 'node');
    assert.equal(cursorAfter.mcpServers.stratat, undefined);

    const codexAfter = readFileSync(join(home, '.codex', 'config.toml'), 'utf8');
    assert.match(codexAfter, /model = "o3"/);
    assert.doesNotMatch(codexAfter, /stratat/);

    const contAfter = JSON.parse(readFileSync(join(home, '.continue', 'config.json'), 'utf8'));
    assert.deepEqual(contAfter.models.map((m) => m.title), ['Existing']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
