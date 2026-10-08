import Fastify from "fastify";
import cors from "@fastify/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { desc, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "./db/client.js";
import { downloadEvents, modelBookmarks, users } from "./db/schema.js";

const authBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function userIdFromRequest(req: FastifyRequest, jwtSecret: string): number | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return userIdFromToken(auth.slice(7), jwtSecret);
  }
  return null;
}

function userIdFromToken(token: string, jwtSecret: string): number | null {
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (typeof payload !== "object" || payload === null || !("sub" in payload)) return null;
    const sub = payload.sub;
    const id = typeof sub === "number" ? sub : Number(sub);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export function buildApp(db: Db, jwtSecret: string, corsOrigin: string) {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: corsOrigin, credentials: true });

  app.get("/health", async () => ({ ok: true, service: "strata-api" }));

  app.post("/v1/auth/register", async (req, reply) => {
    const parsed = authBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const { email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();
    try {
      const inserted = db
        .insert(users)
        .values({ email: email.toLowerCase(), passwordHash, createdAt })
        .returning({ id: users.id, email: users.email })
        .all()[0];
      const token = jwt.sign({ sub: inserted.id, email: inserted.email }, jwtSecret, {
        expiresIn: "30d",
      });
      return { token, user: inserted };
    } catch {
      return reply.code(409).send({ error: "Email already registered" });
    }
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const parsed = authBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const { email, password } = parsed.data;
    const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: "30d" });
    return { token, user: { id: user.id, email: user.email, locale: user.locale } };
  });

  app.get("/v1/models/catalog", async () => {
    const res = await fetch(
      "https://raw.githubusercontent.com/Niko1221/Strata/main/docs/MODELS.md",
    );
    return {
      upstream: "https://github.com/Niko1221/Strata/blob/main/docs/MODELS.md",
      markdownAvailable: res.ok,
    };
  });

  app.post("/v1/downloads/track", async (req, reply) => {
    const body = z
      .object({
        assetName: z.string(),
        releaseTag: z.string().optional(),
        token: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    let userId: number | undefined = userIdFromRequest(req, jwtSecret) ?? undefined;
    if (body.data.token) {
      const fromBody = userIdFromToken(body.data.token, jwtSecret);
      if (fromBody === null) return reply.code(401).send({ error: "Invalid token" });
      userId = fromBody;
    }
    db.insert(downloadEvents)
      .values({
        userId,
        assetName: body.data.assetName,
        releaseTag: body.data.releaseTag,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ok: true };
  });

  app.get("/v1/releases/latest", async () => {
    const res = await fetch("https://api.github.com/repos/Niko1221/Strata/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "strata-api" },
    });
    if (!res.ok) return { error: "upstream unavailable" };
    const r = (await res.json()) as {
      tag_name: string;
      html_url: string;
      assets: { name: string; browser_download_url: string }[];
    };
    return {
      tag: r.tag_name,
      url: r.html_url,
      assets: r.assets.map((a) => ({ name: a.name, downloadUrl: a.browser_download_url })),
    };
  });

  app.post("/v1/bookmarks", async (req, reply) => {
    const body = z
      .object({
        token: z.string().optional(),
        modelId: z.string(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const userId =
      userIdFromRequest(req, jwtSecret) ??
      (body.data.token ? userIdFromToken(body.data.token, jwtSecret) : null);
    if (userId === null) return reply.code(401).send({ error: "Invalid token" });
    db.insert(modelBookmarks)
      .values({
        userId,
        modelId: body.data.modelId,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ok: true };
  });

  app.get("/v1/me/bookmarks", async (req, reply) => {
    const userId = userIdFromRequest(req, jwtSecret);
    if (userId === null) return reply.code(401).send({ error: "Unauthorized" });
    const bookmarks = db
      .select({
        id: modelBookmarks.id,
        modelId: modelBookmarks.modelId,
        createdAt: modelBookmarks.createdAt,
      })
      .from(modelBookmarks)
      .where(eq(modelBookmarks.userId, userId))
      .orderBy(desc(modelBookmarks.createdAt))
      .all();
    return { bookmarks };
  });

  app.get("/v1/me/downloads", async (req, reply) => {
    const userId = userIdFromRequest(req, jwtSecret);
    if (userId === null) return reply.code(401).send({ error: "Unauthorized" });
    const downloads = db
      .select({
        id: downloadEvents.id,
        assetName: downloadEvents.assetName,
        releaseTag: downloadEvents.releaseTag,
        createdAt: downloadEvents.createdAt,
      })
      .from(downloadEvents)
      .where(eq(downloadEvents.userId, userId))
      .orderBy(desc(downloadEvents.createdAt))
      .all();
    return { downloads };
  });

  return app;
}
