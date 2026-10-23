import "dotenv/config";
import { createApp } from "./app";
async function main() {
  const app = await createApp({
    logging: true,
    staticDir: process.env.CLASSROOM_STATIC_DIR,
  });
  await app.listen({
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 4310),
  });
  const close = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
main().catch(() => {
  console.error(
    "Server startup failed. Check database migrations and environment.",
  );
  process.exit(1);
});
