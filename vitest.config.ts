import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      DATABASE_URL: "file:./test.db",
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      APP_ORIGIN: "http://127.0.0.1:4310",
    },
  },
});
