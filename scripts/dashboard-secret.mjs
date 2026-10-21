#!/usr/bin/env node
/**
 * Builds the server-only secret that gates the internal content board.
 *
 *   printf '%s' "$PASSWORD" | node scripts/dashboard-secret.mjs --out /etc/stratat-dashboard.secret
 *
 * The password arrives on stdin and is never written anywhere: the file holds a salted scrypt
 * hash plus the random path key the board lives at. Keep the file out of the repository and out
 * of any rsynced tree — the site reads it from `/etc/stratat-dashboard.secret` (or the path in
 * `STRATAT_DASHBOARD_SECRET_FILE`). Re-run this to rotate either the password or the path.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args[outIndex + 1] : null;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const password = input.replace(/\r?\n$/, "");
  if (password.length < 8) {
    console.error("password too short — 8 characters minimum");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  const secret = {
    pathKey: randomBytes(24).toString("hex"),
    password: `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`,
  };
  const json = `${JSON.stringify(secret)}\n`;
  if (!out) {
    process.stdout.write(json);
    return;
  }
  writeFileSync(out, json, { mode: 0o600 });
  chmodSync(out, 0o600);
  // Only the non-secret facts are reported; the hash and the path stay in the file.
  console.error(`wrote ${out} (path key length ${secret.pathKey.length})`);
});
