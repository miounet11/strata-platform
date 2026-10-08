const fs = require("node:fs");

function parseEnvFile(path) {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split("=", 2))
        .map(([k, v]) => [k.trim(), (v ?? "").trim()]),
    );
  } catch {
    return {};
  }
}

const env = parseEnvFile("/opt/stratat/apps/api/.env");
const intakeEnv = parseEnvFile("/opt/stratat/.env.intake");

module.exports = {
  apps: [
    {
      name: "strata-x-api",
      cwd: "/opt/x-api",
      script: "/opt/x-api/.venv/bin/uvicorn",
      args: "app.main:app --host 127.0.0.1 --port 8080",
      interpreter: "none",
      autorestart: true,
      env: {
        X_API_DB: "/opt/x-api/x-api.db",
      },
    },
    {
      name: "strata-www",
      cwd: "/opt/stratat/apps/www/.next/standalone/apps/www",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
        NEXT_PUBLIC_SITE_URL: "https://www.stratat.com",
        NEXT_PUBLIC_API_URL: "https://api.strata.com",
        STRATAT_DATA_DIR: "/opt/stratat/apps/www/src/data",
      },
    },
    {
      name: "strata-api",
      cwd: "/opt/stratat/apps/api",
      script: "dist/index.js",
      env: { NODE_ENV: "production", ...env },
    },
    {
      name: "strata-intake",
      cwd: "/opt/stratat",
      script: "scripts/run-intake-loop.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        INTAKE_INTERVAL_MINUTES: "120",
        INTAKE_RUN_CREATOR: "1",
        INTAKE_X_API: intakeEnv.INTAKE_X_API ?? "off",
        INTAKE_X_API_COOLDOWN_MINUTES: "360",
        INTAKE_X_MAX_RESULTS: "10",
        INTAKE_X_USER_LIMIT: "3",
        ...intakeEnv,
      },
    },
  ],
};
