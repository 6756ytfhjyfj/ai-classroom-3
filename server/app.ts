import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./security.js";
import { authRoutes } from "./auth.js";
import { classroomRoutes } from "./classrooms.js";
import { adminRoutes } from "./admin.js";
import { seed } from "./db.js";
export async function createApp(
  options: { staticDir?: string; logging?: boolean; serveStatic?: boolean } = {},
) {
  const app = Fastify({
    logger: options.logging
      ? {
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "body.password",
            "body.key",
          ],
        }
      : false,
    bodyLimit: 12 * 1024 * 1024,
    // Vercel terminates HTTPS and replaces forwarded client IP headers.
    trustProxy: process.env.VERCEL === "1",
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 240, timeWindow: "1 minute" });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  app.addHook("onRequest", async (req) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = [
        process.env.APP_ORIGIN ?? "http://127.0.0.1:4310",
        ...(process.env.VERCEL === "1"
          ? [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
              .filter((host): host is string => !!host)
              .map((host) => `https://${host}`)
          : []),
        ...(process.env.NODE_ENV !== "production"
          ? ["http://127.0.0.1:5173"]
          : []),
      ];
      if (origin && !allowed.includes(origin))
        throw new AppError(403, "ORIGIN_BLOCKED", "此请求来源未获授权");
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new AppError(403, "CROSS_SITE_BLOCKED", "跨站写请求已拒绝");
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message });
    if (error instanceof ZodError)
      return reply.code(400).send({
        code: "INVALID_INPUT",
        message: error.issues
          .map((i) => i.message)
          .join("；")
          .slice(0, 600),
      });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return reply.code(409).send({
        code: "DUPLICATE",
        message: "用户名已被占用，或注册名额已被其他请求使用",
      });
    if ((error as { statusCode?: number }).statusCode === 429)
      return reply
        .code(429)
        .send({ code: "RATE_LIMIT", message: "操作过于频繁，请稍后再试" });
    req.log.error(
      { name: error instanceof Error ? error.name : "unknown" },
      "Request failed",
    );
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "服务暂时无法完成操作，内容已保留，请重试",
    });
  });
  app.get("/api/health", () => ({
    ok: true,
    version: "3.0.0",
    database: process.env.DATABASE_PROVIDER ?? "sqlite",
    deployment: process.env.CLASSROOM_SERVER_URL ? "central" : "local",
    physicalDeviceGuarantee: false,
  }));
  await seed();
  await app.register(authRoutes);
  await app.register(classroomRoutes);
  await app.register(adminRoutes);
  app.get("/api/capabilities", async () => ({
    stt: "system",
    tts: "system",
    recognition: "vision",
    speechConfig:
      (
        await (
          await import("./db.js")
        ).db.speechProviderConfig.findUnique({ where: { id: "system" } })
      )?.data ?? null,
  }));
  const root = resolve(options.staticDir ?? "dist");
  if (options.serveStatic !== false && existsSync(root)) {
    await app.register(fastifyStatic, { root });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply
          .code(404)
          .send({ code: "NOT_FOUND", message: "接口不存在" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
