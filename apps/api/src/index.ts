import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";

const port = Number(process.env.PORT ?? 8787);
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";
const dbPath = process.env.DATABASE_URL ?? "./data/strata.db";
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

const db = createDb(dbPath);
const app = buildApp(db, jwtSecret, corsOrigin);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  console.error(err);
  process.exit(1);
});
