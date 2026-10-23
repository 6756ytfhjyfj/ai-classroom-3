import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { parse } from "dotenv";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    readFileSync(".env.example", "utf8").replace(
      "ENCRYPTION_KEY=",
      "ENCRYPTION_KEY=" + randomBytes(32).toString("base64"),
    ),
  );
mkdirSync("data", { recursive: true });
const envText = readFileSync(".env", "utf8");
if (/^ENCRYPTION_KEY=[ \t]*(?:""|'')?[ \t]*$/m.test(envText))
  writeFileSync(
    ".env",
    envText.replace(
      /^ENCRYPTION_KEY=[ \t]*(?:""|'')?[ \t]*$/m,
      "ENCRYPTION_KEY=" + randomBytes(32).toString("base64"),
    ),
  );
const databaseUrl =
  process.env.DATABASE_URL ??
  parse(readFileSync(".env")).DATABASE_URL ??
  "file:./classroom.db";
if (databaseUrl.startsWith("file:")) {
  const dbPath = resolve("prisma", databaseUrl.slice(5));
  mkdirSync(dirname(dbPath), { recursive: true });
  if (!existsSync(dbPath)) new DatabaseSync(dbPath).close();
}
for (const args of [
  ["generate", "--schema", "prisma/schema.prisma"],
  ["migrate", "deploy", "--schema", "prisma/schema.prisma"],
]) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit" },
  );
  if (r.status) process.exit(r.status);
}
console.log(
  "Database initialized. Create an admin: npm run admin:create -- <username> (interactive password).",
);
