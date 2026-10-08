import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  locale: text("locale").default("en"),
  createdAt: text("created_at").notNull(),
});

export const downloadEvents = sqliteTable("download_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  assetName: text("asset_name").notNull(),
  releaseTag: text("release_tag"),
  createdAt: text("created_at").notNull(),
});

export const modelBookmarks = sqliteTable("model_bookmarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  modelId: text("model_id").notNull(),
  createdAt: text("created_at").notNull(),
});
