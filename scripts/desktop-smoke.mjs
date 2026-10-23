import { _electron as electron } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const setup = process.argv.includes("--setup");
const profile =
  process.env.CLASSROOM_TEST_PROFILE ??
  resolve(
    setup
      ? "../../work/desktop-setup-profile-" + Date.now()
      : "../../work/desktop-smoke-profile",
  );
mkdirSync(profile, { recursive: true });
const app = await electron.launch({
  args: process.env.CLASSROOM_TEST_EXE
    ? setup
      ? ["--initialize-admin"]
      : []
    : setup
      ? [".", "--initialize-admin"]
      : ["."],
  ...(process.env.CLASSROOM_TEST_EXE
    ? { executablePath: process.env.CLASSROOM_TEST_EXE }
    : {}),
  env: {
    ...process.env,
    CLASSROOM_USER_DATA: profile,
    ELECTRON_ENABLE_LOGGING: "1",
  },
  timeout: 60000,
});
const results = {
  version: "",
  url: "",
  errors: [],
  device: false,
  fullscreen: false,
};
try {
  const page = await app.firstWindow({ timeout: 60000 });
  page.on("pageerror", (e) => results.errors.push(e.message));
  await page.waitForLoadState("networkidle");
  results.url = page.url();
  if (setup) {
    await page.getByRole("heading", { name: "初始化管理员" }).waitFor();
    await page
      .getByLabel("管理员用户名", { exact: true })
      .fill("桌面验收管理员");
    await page
      .getByLabel("管理员密码", { exact: true })
      .fill("desktop-smoke-password-123");
    await page
      .getByLabel("确认密码", { exact: true })
      .fill("desktop-smoke-password-123");
    await page.getByRole("button", { name: "创建管理员并进入后台" }).click();
    await page.getByRole("heading", { name: "AI 模型服务" }).waitFor();
  } else await page.getByRole("heading", { name: "欢迎回来。" }).waitFor();
  results.version = await page.evaluate(() => window.desktop.version());
  if (!setup)
    await page.waitForFunction(() =>
      document.querySelector(".device-note")?.textContent?.includes("0 / 3"),
    );
  results.device = !!(await page.evaluate(() => window.desktop.deviceRead()));
  await page.evaluate(() => window.desktop.fullscreen(true));
  results.fullscreen = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isFullScreen(),
  );
  await page.evaluate(() => window.desktop.fullscreen(false));
  await page.screenshot({
    path: setup
      ? "test-results/desktop-admin.png"
      : "test-results/desktop-login.png",
  });
  console.log(JSON.stringify(results));
  writeFileSync(
    "test-results/desktop-smoke.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await app.close();
}
