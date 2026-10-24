import { chromium, _electron as electron, expect } from "@playwright/test";
import { randomFillSync, createHash } from "node:crypto";
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const size = 10 * 1024 * 1024,
  width = 3200,
  height = 1080;
function chunk(type, data) {
  const name = Buffer.from(type),
    result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), result.length - 4);
  return result;
}
const raw = randomFillSync(Buffer.alloc((width * 3 + 1) * height));
for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0;
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const head = Buffer.concat([
  signature,
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 0 })),
]);
const image = Buffer.concat([
  head,
  chunk("npAD", Buffer.alloc(size - head.length - 24)),
  chunk("IEND", Buffer.alloc(0)),
]);
expect(image.length).toBe(size);
const out = process.env.ONCLASSTIME_QA_DIR ?? "docs/qa/image-upload";
mkdirSync(out, { recursive: true });
const desktop = process.env.ONCLASSTIME_TEST_EXE;
const launched = desktop
  ? await electron.launch({
      executablePath: desktop,
      args: JSON.parse(process.env.ONCLASSTIME_TEST_ARGS ?? "[]"),
      env: { ...process.env },
      timeout: 60000,
    })
  : await chromium.launch({ channel: "msedge", headless: true });
const page = desktop
  ? await launched.firstWindow()
  : await launched.newPage({ viewport: { width: 1400, height: 1000 } });
const report = {
  checks: [],
  errors: [],
  maxRequestBytes: 0,
  fileBytes: image.length,
  sha256: createHash("sha256").update(image).digest("hex"),
};
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("request", (r) => {
  const body = r.postDataBuffer();
  if (body && /image-uploads|\/wrongs$/.test(r.url()))
    report.maxRequestBytes = Math.max(report.maxRequestBytes, body.length);
});
let wrongId;
try {
  if (!desktop)
    await page.goto(
      process.env.ONCLASSTIME_TEST_URL ?? "http://127.0.0.1:4313",
    );
  await page
    .getByRole("button", { name: "注册账号", exact: true })
    .click({ timeout: 60000 });
  await page
    .getByLabel("用户名", { exact: true })
    .fill("uploadqa_" + Date.now());
  await page
    .getByLabel("密码", { exact: true })
    .fill("Upload-Verification-2026");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Upload-Verification-2026");
  const registered = page.waitForResponse(
    (r) => r.url().endsWith("/api/auth/register") && r.status() === 200,
  );
  await page.getByRole("button", { name: "创建学习账号" }).click();
  const userId = (await (await registered).json()).user.id;
  if (process.env.ONCLASSTIME_FIXTURE_FILE)
    writeFileSync(
      process.env.ONCLASSTIME_FIXTURE_FILE,
      JSON.stringify({ userId }),
    );
  await page
    .getByRole("button", { name: "我已妥善保存" })
    .click({ timeout: 45000 });
  await page.getByRole("button", { name: "我的错题", exact: true }).click();
  await page.getByRole("button", { name: "上传错题", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator("input[type=file]")
    .setInputFiles({
      name: "10MB-original.png",
      mimeType: "image/png",
      buffer: image,
    });
  await expect(dialog.locator(".upload-preview")).toBeVisible();
  expect(
    await dialog.locator(".upload-preview").evaluate((img) => img.naturalWidth),
  ).toBe(width);
  await dialog.getByLabel("标题", { exact: true }).fill("10 MB 原图上传验收");
  await dialog.locator("input[type=checkbox]").check();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/wrongs") &&
      r.request().method() === "POST" &&
      r.status() === 200,
    { timeout: 240000 },
  );
  await dialog.getByRole("button", { name: "保存错题", exact: true }).click();
  const row = await (await saved).json();
  wrongId = row.id;
  expect(row.imageBytes).toBe(size);
  await expect(page.locator(".wrong-card img")).toBeVisible({
    timeout: 120000,
  });
  expect(
    await page.locator(".wrong-card img").evaluate((img) => img.naturalWidth),
  ).toBe(width);
  report.checks.push("10 MB 边界原图真实上传，3200px 原尺寸保留，列表正常读取");
  const digest = await page.evaluate(
    async ({ id, parts }) => {
      const bytes = [];
      for (let i = 0; i < parts; i++) {
        const r = await fetch(`/api/wrongs/${id}/image/chunks/${i}`);
        if (!r.ok) throw Error("Image read " + r.status);
        const p = await r.json();
        bytes.push(Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0)));
      }
      const blob = new Blob(bytes);
      return Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
    },
    { id: wrongId, parts: Math.ceil(size / (768 * 1024)) },
  );
  expect(digest).toBe(report.sha256);
  report.checks.push("上传后完整读取 SHA-256 与原文件一致");
  await page.locator(".wrong-card").click();
  await expect(
    page.getByRole("dialog").locator(".wrong-full-image"),
  ).toBeVisible({ timeout: 120000 });
  report.checks.push("错题详情正确读取大图");
  await page.screenshot({ path: out + "/10mb-detail.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "上传错题", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "too-large.png",
      mimeType: "image/png",
      buffer: Buffer.concat([image, Buffer.alloc(1)]),
    });
  await expect(
    page.getByRole("dialog").getByText("单张图片不能超过 10 MB"),
  ).toBeVisible();
  report.checks.push("10 MB + 1 字节在界面明确拒绝");
  expect(report.maxRequestBytes).toBeLessThan(2 * 1024 * 1024);
  expect(report.errors).toEqual([]);
} finally {
  if (wrongId)
    await page
      .evaluate(async (id) => {
        await fetch("/api/wrongs/" + id, { method: "DELETE" });
      }, wrongId)
      .catch(() => {});
  writeFileSync(out + "/verification.json", JSON.stringify(report, null, 2));
  await launched.close();
  console.log(JSON.stringify(report));
}
