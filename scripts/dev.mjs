import { spawn } from "node:child_process";
const children = [];
const run = (file, args) => {
  const c = spawn(process.execPath, [file, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  children.push(c);
  return c;
};
run("node_modules/tsx/dist/cli.mjs", ["watch", "server/index.ts"]);
run("node_modules/vite/bin/vite.js", ["--host", "127.0.0.1"]);
const close = () => {
  children.forEach((c) => c.kill());
  process.exit();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
