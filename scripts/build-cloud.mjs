import { build } from "esbuild";
await build({
  entryPoints: ["server/cloud.ts"],
  outfile: "dist-server/cloud.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
});
