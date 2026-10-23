import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app.js";

// Reuse one Prisma pool and Fastify instance per warm function process.
let appPromise: ReturnType<typeof createApp> | undefined;
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await (appPromise ??= createApp({
      logging: true,
      serveStatic: false,
    }).catch((error) => {
      appPromise = undefined;
      throw error;
    }));
    await app.ready();
    await new Promise<void>((resolve) => {
      res.once("finish", resolve);
      res.once("close", resolve);
      app.server.emit("request", req, res);
    });
  } catch {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "STARTUP_FAILED", message: "服务启动失败，请稍后重试或联系管理员" }));
    } else res.end();
  }
}
