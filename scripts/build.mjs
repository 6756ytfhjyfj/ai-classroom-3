import { build } from "esbuild";
import { mkdirSync } from "node:fs";
mkdirSync("dist-server", { recursive: true });
mkdirSync("dist-electron", { recursive: true });
await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist-server/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
});
await build({
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
});
await build({
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
