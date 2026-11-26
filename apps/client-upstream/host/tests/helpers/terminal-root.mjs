import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Resolve the Strata Control / Terminal root for cross-component contract tests:
 *   1. Upstream monorepo checkout (`../../../terminal`) if present
 *   2. Staged Control runtime bundled inside Stratat Desktop (`../desktop/src-tauri/resources/control`)
 */
export function terminalRoot() {
  const candidates = [
    resolve(HOST_DIR, '..', '..', 'terminal'),
    resolve(HOST_DIR, '..', 'desktop', 'src-tauri', 'resources', 'control'),
  ];
  return candidates.find((p) => existsSync(join(p, 'strata.py'))) ?? candidates[0];
}

export function terminalFile(...parts) {
  return join(terminalRoot(), ...parts);
}

export function hasTerminalFile(...parts) {
  return existsSync(terminalFile(...parts));
}
