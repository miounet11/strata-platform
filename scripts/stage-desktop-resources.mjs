#!/usr/bin/env node
/**
 * Stage ALL bundled runtimes required by Stratat Desktop before `tauri build` or `cargo test`:
 *   1. `resources/node/`          — Private Node v24.12.0 runtime (single target OS only; prunes foreign binaries)
 *   2. `resources/control/`       — Pinned CPython 3.12 + strata.py + strata_control + setup.py + strata_mcp.py + BUNDLE.json
 *   3. `resources/harness/`       — Pinned MIT DeepSeek Harness (@deepseek-ai/dsh) + @playwright/mcp + verified Strata patches
 *   4. `resources/engine-bundle/` — For Apple Silicon (aarch64-apple-darwin): all 3 native Metal engines
 *                                   (strata-engine 0.1.69 + strata-vision, strata-hy4 0.1.67, strata-inkling 0.1.67; ~6.2 MB total)
 *
 * Every upstream artifact is pinned by SHA-256 and cached locally under `.cache/desktop-stage/v0.2.22/`
 * so repeat builds are fast and reproducible.
 *
 * Usage:
 *   node scripts/stage-desktop-resources.mjs --target aarch64-apple-darwin
 *   node scripts/stage-desktop-resources.mjs --target x86_64-pc-windows-msvc
 *   node scripts/stage-desktop-resources.mjs --target x86_64-unknown-linux-gnu
 *   node scripts/stage-desktop-resources.mjs --check --target aarch64-apple-darwin
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DESKTOP = join(ROOT, 'apps', 'client-upstream', 'desktop');
const RESOURCES = join(DESKTOP, 'src-tauri', 'resources');
const CACHE = join(ROOT, '.cache', 'desktop-stage', 'v0.2.22');

const UPSTREAM_TAG = 'v0.2.22';
const UPSTREAM_V21 = 'v0.2.21';
const BASE_V22 = `https://github.com/Niko1221/Strata/releases/download/${UPSTREAM_TAG}`;
const BASE_V21 = `https://github.com/Niko1221/Strata/releases/download/${UPSTREAM_V21}`;

/** Pinned SHA-256 digests from Niko1221/Strata official SHA256SUMS.txt. */
const ARTIFACTS = {
  macAppTarGz: {
    file: 'Strata.app.tar.gz',
    url: `${BASE_V22}/Strata.app.tar.gz`,
    sha256: '7ee45e1e472788aab2e4e8d7de0f0debdcd6d919496804640f8d5604b667a7de',
  },
  linuxAppImage: {
    file: 'Strata-0.2.22-linux-x86_64.AppImage',
    url: `${BASE_V22}/Strata-0.2.22-linux-x86_64.AppImage`,
    sha256: '101e7fef8e1bcb85e15f450cc49113f47ae1c0c0da98f25ee4631fc61df25c1f',
  },
  winSetupExe: {
    file: 'Strata-0.2.22-windows-x64-setup.exe',
    url: `${BASE_V22}/Strata-0.2.22-windows-x64-setup.exe`,
    sha256: 'd978eed0e144ccfb1c286be7ef5c2b35e85eaf7bf2f56325979e61413e07b1ca',
  },
  controlLinuxX64: {
    file: 'strata-control-0.1.69-linux-x86_64.tar.gz',
    url: `${BASE_V22}/strata-control-0.1.69-linux-x86_64.tar.gz`,
    sha256: 'f93a0a1b8b7236df579d6a2725565c0af573b65e53359383de68ea40c0755495',
    version: '0.1.69',
  },
  controlWinX64: {
    file: 'strata-control-0.1.69-windows-x86_64.zip',
    url: `${BASE_V22}/strata-control-0.1.69-windows-x86_64.zip`,
    sha256: '0c46ef78881c430c76d7c1dabee5307f79969623366f71f55f30e579d1878044',
    version: '0.1.69',
  },
  metalEngines: [
    {
      folder: '0.1.69-macos-arm64-metal',
      file: 'strata-engine-0.1.69-macos-arm64-metal.tar.gz',
      url: `${BASE_V22}/strata-engine-0.1.69-macos-arm64-metal.tar.gz`,
      sha256: '96331165be23b908bf1d5cb716761108119dbf437c4217cf0faa175ab60400cc',
    },
    {
      folder: '0.1.67-macos-arm64-metal-hy4',
      file: 'strata-hy4-0.1.67-macos-arm64-metal.tar.gz',
      url: `${BASE_V21}/strata-hy4-0.1.67-macos-arm64-metal.tar.gz`,
      sha256: '000492ed6826b945a6f56c1470a3fb130cd3baeb5ad600475b950cd00892743f',
    },
    {
      folder: '0.1.67-macos-arm64-metal-inkling',
      file: 'strata-inkling-0.1.67-macos-arm64-metal.tar.gz',
      url: `${BASE_V21}/strata-inkling-0.1.67-macos-arm64-metal.tar.gz`,
      sha256: '8613d9922662d1a3740927dd62be4e0c0a6e289a8383910fc2699dedeeac448f',
    },
  ],
};

function parseArgs(argv) {
  const opts = { target: defaultTarget(), check: false, harnessSrc: process.env.STRATA_HARNESS_SRC || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '--target') opts.target = argv[++i];
    else if (a === '--harness-src') opts.harnessSrc = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function defaultTarget() {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc';
  return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
}

function nodeTargetOf(rustTarget) {
  if (rustTarget.includes('windows')) return 'win-x64';
  if (rustTarget === 'aarch64-apple-darwin') return 'darwin-arm64';
  if (rustTarget === 'x86_64-apple-darwin') return 'darwin-x64';
  if (rustTarget.startsWith('aarch64-') && rustTarget.includes('linux')) return 'linux-arm64';
  return 'linux-x64';
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status ?? res.error}): ${cmd} ${args.join(' ')}`);
  }
  return res;
}

function sha256File(filePath) {
  return new Promise((resolveHash, reject) => {
    const h = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => h.update(chunk))
      .on('error', reject)
      .on('end', () => resolveHash(h.digest('hex')));
  });
}

async function ensureCached(item) {
  mkdirSync(CACHE, { recursive: true });
  const dest = join(CACHE, item.file);
  if (existsSync(dest)) {
    const got = await sha256File(dest);
    if (got === item.sha256) {
      console.log(`  [cache] ${item.file} (sha256 verified)`);
      return dest;
    }
    console.warn(`  [cache] ${item.file} hash mismatch (${got}), re-downloading`);
    rmSync(dest, { force: true });
  }
  console.log(`  [fetch] ${item.url}`);
  const tmp = `${dest}.tmp`;
  run('curl', ['-fSL', '--retry', '3', '-o', tmp, item.url]);
  const got = await sha256File(tmp);
  if (got !== item.sha256) {
    rmSync(tmp, { force: true });
    throw new Error(`SHA-256 mismatch for ${item.file}: got ${got}, expected ${item.sha256}`);
  }
  rmSync(dest, { force: true });
  run('mv', [tmp, dest]);
  console.log(`  [verified] ${item.file}`);
  return dest;
}

function writeGitignore(dir, content = '*\n!.gitignore\n') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.gitignore'), content, 'utf8');
}

function cleanDirKeepGitignore(dir) {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    if (entry === '.gitignore') continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
  writeGitignore(dir);
}

// ---------------------------------------------------------------------------
// 1. Node runtime (single target OS — never ship node.exe inside macOS .dmg!)
// ---------------------------------------------------------------------------
async function stageNode(target) {
  const nodeTarget = nodeTargetOf(target);
  const nodeDir = join(RESOURCES, 'node');
  const wantedExe = nodeTarget.startsWith('win-') ? 'node.exe' : 'node';
  const foreignExe = nodeTarget.startsWith('win-') ? 'node' : 'node.exe';
  mkdirSync(nodeDir, { recursive: true });

  // Remove any foreign OS binary left from a prior cross-target run.
  if (existsSync(join(nodeDir, foreignExe))) {
    rmSync(join(nodeDir, foreignExe), { force: true });
    console.log(`  [node] removed foreign binary ${foreignExe}`);
  }

  const wantedPath = join(nodeDir, wantedExe);
  const canExecuteLocally =
    (process.platform === 'darwin' && nodeTarget === `darwin-${process.arch}`) ||
    (process.platform === 'linux' && nodeTarget === `linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}`) ||
    (process.platform === 'win32' && nodeTarget === 'win-x64');

  let alreadyGood = false;
  if (existsSync(wantedPath)) {
    if (canExecuteLocally) {
      const check = spawnSync(wantedPath, ['--version'], { encoding: 'utf8' });
      if (check.status === 0 && check.stdout.trim() === 'v24.12.0') {
        alreadyGood = true;
        console.log(`  [node] ${wantedExe} v24.12.0 already staged`);
      }
    } else if (statSync(wantedPath).size > 20_000_000) {
      alreadyGood = true;
      console.log(`  [node] ${wantedExe} already staged (cross-target)`);
    }
  }

  if (!alreadyGood) {
    if (process.platform === 'win32') {
      run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', join(DESKTOP, 'scripts', 'fetch-node.ps1')], { cwd: DESKTOP });
    } else {
      run('bash', [join(DESKTOP, 'scripts', 'fetch-node.sh'), '--target', nodeTarget], { cwd: DESKTOP });
    }
  }
  writeGitignore(nodeDir, '*\n!.gitignore\n');
}

// ---------------------------------------------------------------------------
// 2 & 3. Control + Harness staging
// ---------------------------------------------------------------------------
async function stageControlAndHarness(target, harnessSrc) {
  const controlDir = join(RESOURCES, 'control');
  const harnessDir = join(RESOURCES, 'harness');

  if (target === 'aarch64-apple-darwin') {
    const appTar = await ensureCached(ARTIFACTS.macAppTarGz);
    const controlReady =
      existsSync(join(controlDir, 'strata.py')) &&
      existsSync(join(controlDir, 'BUNDLE.json')) &&
      existsSync(join(controlDir, 'python', 'bin', 'python3'));
    const harnessReady =
      existsSync(join(harnessDir, 'BUNDLE.json')) &&
      (existsSync(join(harnessDir, 'apps', 'cli', 'lib', 'bin.js')) || existsSync(join(harnessDir, 'lib', 'bin.js')));

    if (!controlReady || !harnessReady || harnessSrc) {
      const unpack = join(CACHE, 'mac-app-unpack');
      rmSync(unpack, { recursive: true, force: true });
      mkdirSync(unpack, { recursive: true });
      console.log('  [extract] extracting verified control + harness from Strata.app.tar.gz');
      run('tar', [
        '-xzf',
        appTar,
        '-C',
        unpack,
        'Strata.app/Contents/Resources/control',
        'Strata.app/Contents/Resources/harness',
      ]);

      if (!controlReady) {
        cleanDirKeepGitignore(controlDir);
        const srcCtrl = join(unpack, 'Strata.app', 'Contents', 'Resources', 'control');
        for (const e of readdirSync(srcCtrl)) {
          if (e === '.gitignore') continue;
          cpSync(join(srcCtrl, e), join(controlDir, e), { recursive: true, verbatimSymlinks: true });
        }
        writeGitignore(controlDir);
        console.log('  [control] staged strata-control 0.1.69 (darwin-arm64)');
      }

      if (!harnessReady && !harnessSrc) {
        cleanDirKeepGitignore(harnessDir);
        const srcHarn = join(unpack, 'Strata.app', 'Contents', 'Resources', 'harness');
        for (const e of readdirSync(srcHarn)) {
          if (e === '.gitignore') continue;
          cpSync(join(srcHarn, e), join(harnessDir, e), { recursive: true, verbatimSymlinks: true });
        }
        writeGitignore(harnessDir);
        console.log('  [harness] staged deepseek-harness 0.2.1-alpha.3 + @playwright/mcp (darwin-arm64)');
      }

      rmSync(unpack, { recursive: true, force: true });
    } else {
      console.log('  [control] strata-control 0.1.69 already staged');
      console.log('  [harness] deepseek-harness already staged');
    }
  } else if (target === 'x86_64-unknown-linux-gnu') {
    const appImage = await ensureCached(ARTIFACTS.linuxAppImage);
    const controlReady = existsSync(join(controlDir, 'strata.py')) && existsSync(join(controlDir, 'python', 'bin', 'python3'));
    const harnessReady = existsSync(join(harnessDir, 'BUNDLE.json'));
    if (!controlReady || !harnessReady) {
      const unpack = join(CACHE, 'linux-appimage-unpack');
      rmSync(unpack, { recursive: true, force: true });
      mkdirSync(unpack, { recursive: true });
      chmodSync(appImage, 0o755);
      // Extract via unsquashfs if available, else --appimage-extract on Linux
      const hasUnsquash = spawnSync('which', ['unsquashfs'], { stdio: 'ignore' }).status === 0;
      if (process.platform === 'linux') {
        run(appImage, ['--appimage-extract'], { cwd: unpack });
      } else if (hasUnsquash) {
        const offsetOut = spawnSync(appImage, ['--appimage-offset'], { encoding: 'utf8' });
        if (offsetOut.status !== 0) throw new Error('Cannot extract AppImage on non-Linux without --appimage-offset');
        run('unsquashfs', ['-o', offsetOut.stdout.trim(), '-d', join(unpack, 'squashfs-root'), appImage]);
      } else {
        throw new Error('Staging linux-x86_64 harness requires Linux or unsquashfs');
      }
      const resRoot = existsSync(join(unpack, 'squashfs-root', 'usr', 'lib', 'Strata'))
        ? join(unpack, 'squashfs-root', 'usr', 'lib', 'Strata')
        : join(unpack, 'squashfs-root', 'usr', 'lib', 'strata-desktop');
      if (!controlReady && existsSync(join(resRoot, 'control'))) {
        cleanDirKeepGitignore(controlDir);
        for (const e of readdirSync(join(resRoot, 'control'))) {
          if (e === '.gitignore') continue;
          cpSync(join(resRoot, 'control', e), join(controlDir, e), { recursive: true, verbatimSymlinks: true });
        }
        writeGitignore(controlDir);
      }
      if (!harnessReady && !harnessSrc && existsSync(join(resRoot, 'harness'))) {
        cleanDirKeepGitignore(harnessDir);
        for (const e of readdirSync(join(resRoot, 'harness'))) {
          if (e === '.gitignore') continue;
          cpSync(join(resRoot, 'harness', e), join(harnessDir, e), { recursive: true, verbatimSymlinks: true });
        }
        writeGitignore(harnessDir);
      }
      rmSync(unpack, { recursive: true, force: true });
    }
  } else if (target === 'x86_64-pc-windows-msvc') {
    const setupExe = await ensureCached(ARTIFACTS.winSetupExe);
    const controlReady = existsSync(join(controlDir, 'strata.py')) && existsSync(join(controlDir, 'python', 'python.exe'));
    const harnessReady = existsSync(join(harnessDir, 'BUNDLE.json'));
    if (!controlReady || !harnessReady) {
      const unpack = join(CACHE, 'win-nsis-unpack');
      rmSync(unpack, { recursive: true, force: true });
      mkdirSync(unpack, { recursive: true });
      const sevenZip = process.platform === 'win32' ? '7z.exe' : '7z';
      run(sevenZip, ['x', '-y', `-o${unpack}`, setupExe, 'control', 'harness']);
      if (!controlReady && existsSync(join(unpack, 'control'))) {
        cleanDirKeepGitignore(controlDir);
        for (const e of readdirSync(join(unpack, 'control'))) {
          if (e === '.gitignore') continue;
          cpSync(join(unpack, 'control', e), join(controlDir, e), { recursive: true });
        }
        writeGitignore(controlDir);
      }
      if (!harnessReady && !harnessSrc && existsSync(join(unpack, 'harness'))) {
        cleanDirKeepGitignore(harnessDir);
        for (const e of readdirSync(join(unpack, 'harness'))) {
          if (e === '.gitignore') continue;
          cpSync(join(unpack, 'harness', e), join(harnessDir, e), { recursive: true });
        }
        writeGitignore(harnessDir);
      }
      rmSync(unpack, { recursive: true, force: true });
    }
  } else {
    // e.g. x86_64-apple-darwin (Intel Mac): upstream does not ship x64 Mac control/harness; keep clean placeholders.
    console.warn(`  [warn] no prebuilt upstream control/harness for ${target}; keeping clean placeholders`);
    writeGitignore(controlDir);
    writeGitignore(harnessDir);
  }

  // Optional override: build Harness from a local source checkout
  if (harnessSrc) {
    console.log(`  [harness] staging from source checkout ${harnessSrc}`);
    run(process.execPath, [join(DESKTOP, 'scripts', 'stage-harness.mjs'), '--src', harnessSrc, '--out', harnessDir], { cwd: DESKTOP });
  }
}

// ---------------------------------------------------------------------------
// 4. Bundled native engines (Apple Metal: all 3 families = ~6.2 MB!)
// ---------------------------------------------------------------------------
async function stageEngineBundle(target) {
  const bundleDir = join(RESOURCES, 'engine-bundle');
  if (target !== 'aarch64-apple-darwin') {
    // Windows / Linux GPU engines are 200-780 MB per vendor and installed automatically via Control's signed feed.
    cleanDirKeepGitignore(bundleDir);
    console.log(`  [engine-bundle] ${target}: using signed feed auto-install (GPU vendor specific)`);
    return;
  }

  mkdirSync(bundleDir, { recursive: true });
  writeGitignore(bundleDir);

  for (const eng of ARTIFACTS.metalEngines) {
    const dest = join(bundleDir, eng.folder);
    if (existsSync(join(dest, 'engine-component.json'))) {
      console.log(`  [engine-bundle] ${eng.folder} already staged`);
      continue;
    }
    const tarPath = await ensureCached(eng);
    const tmp = `${dest}.incoming`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    run('tar', ['-xzf', tarPath, '-C', tmp]);
    // Deep-verify every file against engine-component.json before accepting
    const manifest = JSON.parse(readFileSync(join(tmp, 'engine-component.json'), 'utf8'));
    for (const item of manifest.files) {
      const fpath = join(tmp, ...item.path.split('/'));
      const got = await sha256File(fpath);
      if (got !== item.sha256.toLowerCase()) {
        rmSync(tmp, { recursive: true, force: true });
        throw new Error(`Engine file hash mismatch in ${eng.folder}/${item.path}`);
      }
    }
    rmSync(dest, { recursive: true, force: true });
    run('mv', [tmp, dest]);
    console.log(`  [engine-bundle] staged & deep-verified ${eng.folder} (${manifest.id} ${manifest.version})`);
  }
}

// ---------------------------------------------------------------------------
// 5. Verification
// ---------------------------------------------------------------------------
async function verifyStaged(target) {
  const errors = [];
  const nodeTarget = nodeTargetOf(target);
  const wantedNode = nodeTarget.startsWith('win-') ? 'node.exe' : 'node';
  const foreignNode = nodeTarget.startsWith('win-') ? 'node' : 'node.exe';

  const nodePath = join(RESOURCES, 'node', wantedNode);
  if (!existsSync(nodePath)) errors.push(`missing bundled node: ${nodePath}`);
  if (existsSync(join(RESOURCES, 'node', foreignNode))) errors.push(`foreign node binary present: ${foreignNode}`);

  const controlDir = join(RESOURCES, 'control');
  const harnessDir = join(RESOURCES, 'harness');
  const bundleDir = join(RESOURCES, 'engine-bundle');

  const expectsFull = ['aarch64-apple-darwin', 'x86_64-unknown-linux-gnu', 'x86_64-pc-windows-msvc'].includes(target);
  if (expectsFull) {
    const py = target.includes('windows')
      ? join(controlDir, 'python', 'python.exe')
      : join(controlDir, 'python', 'bin', 'python3');
    for (const req of [py, join(controlDir, 'strata.py'), join(controlDir, 'setup.py'), join(controlDir, 'tools', 'strata_mcp.py'), join(controlDir, 'BUNDLE.json')]) {
      if (!existsSync(req)) errors.push(`missing control file: ${req}`);
    }
    const hBin = existsSync(join(harnessDir, 'apps', 'cli', 'lib', 'bin.js'))
      ? join(harnessDir, 'apps', 'cli', 'lib', 'bin.js')
      : join(harnessDir, 'lib', 'bin.js');
    if (!existsSync(hBin)) errors.push(`missing harness entry: ${hBin}`);
    if (!existsSync(join(harnessDir, 'BUNDLE.json'))) errors.push('missing harness/BUNDLE.json');

    // Run native proofs when host matches target
    const isNativeHost =
      (process.platform === 'darwin' && target === 'aarch64-apple-darwin' && process.arch === 'arm64') ||
      (process.platform === 'linux' && target === 'x86_64-unknown-linux-gnu' && process.arch === 'x64') ||
      (process.platform === 'win32' && target === 'x86_64-pc-windows-msvc');

    if (isNativeHost && !errors.length) {
      // Proof 1: bundled Node runs
      const nv = spawnSync(nodePath, ['--version'], { encoding: 'utf8' });
      if (nv.status !== 0) errors.push(`bundled node failed: ${nv.stderr}`);
      else console.log(`  [verify] node: ${nv.stdout.trim()}`);

      // Proof 2: bundled Control runs strata.py --version with scrubbed env
      const env = {
        PATH: process.env.PATH || '',
        PYTHONNOUSERSITE: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        STRATA_NO_ACQUIRE: '1',
      };
      const cv = spawnSync(py, [join(controlDir, 'strata.py'), '--version'], { cwd: controlDir, env, encoding: 'utf8', timeout: 60_000 });
      if (cv.status !== 0) errors.push(`bundled control failed: ${cv.stderr || cv.stdout}`);
      else console.log(`  [verify] control: ${cv.stdout.trim()}`);

      // Proof 3: bundled setup.py catalog loads on bundled Python alone
      const probe = `import sys, importlib.util as u; sys.path.insert(0, ${JSON.stringify(join(controlDir, 'tools'))}); s=u.spec_from_file_location('s', ${JSON.stringify(join(controlDir, 'setup.py'))}); m=u.module_from_spec(s); s.loader.exec_module(m); import iq_pack, strata_pack, pack_index, mtp_fetch; print(f'catalog ok: {len(m.MODELS)} models, {len(m.FAMILIES)} families')`;
      const sp = spawnSync(py, ['-c', probe], { cwd: controlDir, env: { ...env, STRATA_CONTROL_INSTALL: '1' }, encoding: 'utf8', timeout: 120_000 });
      if (sp.status !== 0) errors.push(`bundled installer probe failed: ${sp.stderr || sp.stdout}`);
      else console.log(`  [verify] installer: ${sp.stdout.trim()}`);

      // Proof 4: prepare-harness-bundle.mjs passes (verifies pi-ai budget patch SHA-256)
      const prep = spawnSync(nodePath, [join(DESKTOP, 'scripts', 'prepare-harness-bundle.mjs')], { cwd: DESKTOP, encoding: 'utf8' });
      if (prep.status !== 0) errors.push(`prepare-harness-bundle failed: ${prep.stderr || prep.stdout}`);
      else console.log(`  [verify] harness-patch: ${prep.stdout.trim() || 'ok'}`);

      // Proof 5: bundled Harness answers --version using bundled Node
      const hv = spawnSync(nodePath, [hBin, '--version'], { encoding: 'utf8', timeout: 60_000 });
      if (hv.status !== 0) errors.push(`bundled harness failed: ${hv.stderr || hv.stdout}`);
      else console.log(`  [verify] harness: ${hv.stdout.trim()}`);
    }
  }

  if (target === 'aarch64-apple-darwin') {
    for (const eng of ARTIFACTS.metalEngines) {
      const mPath = join(bundleDir, eng.folder, 'engine-component.json');
      if (!existsSync(mPath)) {
        errors.push(`missing metal engine manifest: ${mPath}`);
      } else {
        const m = JSON.parse(readFileSync(mPath, 'utf8'));
        console.log(`  [verify] engine-bundle: ${m.id} ${m.version} (${m.platform}/${m.backend})`);
      }
    }
  }

  if (errors.length) {
    console.error('✗ Staged resource verification failed:\n  - ' + errors.join('\n  - '));
    process.exit(1);
  }
  console.log(`✓ All desktop resources verified for ${target}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`→ Staging Stratat Desktop resources for ${opts.target}`);
  if (!opts.check) {
    await stageNode(opts.target);
    await stageControlAndHarness(opts.target, opts.harnessSrc);
    await stageEngineBundle(opts.target);
  }
  await verifyStaged(opts.target);
}

main().catch((err) => {
  console.error('✗ stage-desktop-resources failed:', err?.message ?? err);
  process.exit(1);
});
