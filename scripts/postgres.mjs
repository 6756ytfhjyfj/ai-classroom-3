import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const schema = readFileSync("prisma/schema.prisma", "utf8").replace(
  'provider = "sqlite"',
  'provider = "postgresql"',
);
mkdirSync("prisma/postgres/migrations/20261024000000_init", {
  recursive: true,
});
writeFileSync("prisma/postgres/schema.prisma", schema);
const r = spawnSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/postgres/schema.prisma",
    "--script",
  ],
  { encoding: "utf8" },
);
if (r.status) {
  console.error(r.stderr);
  process.exit(r.status);
}
writeFileSync(
  "prisma/postgres/migrations/20261024000000_init/migration.sql",
  r.stdout +
    '\nALTER TABLE "DeviceAccountBinding" ADD CONSTRAINT "slot_range" CHECK (slot IS NULL OR slot BETWEEN 1 AND 3);\n',
);
writeFileSync(
  "prisma/postgres/migrations/migration_lock.toml",
  'provider = "postgresql"\n',
);
console.log(
  "PostgreSQL schema/migration generated. Set DATABASE_URL and DATABASE_PROVIDER=postgresql; prisma generate + migrate deploy --schema prisma/postgres/schema.prisma, then rebuild.",
);
