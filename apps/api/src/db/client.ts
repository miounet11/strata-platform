import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  mkdirSync(dirname(databaseUrl), { recursive: true });
  const sqlite = new Database(databaseUrl);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      locale TEXT DEFAULT 'en',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS download_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      asset_name TEXT NOT NULL,
      release_tag TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
