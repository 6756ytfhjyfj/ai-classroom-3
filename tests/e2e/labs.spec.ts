import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("扩展实验实际交互、语音候选编辑和未授权图片保留", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const d = await page.request.post("/api/device/bootstrap", {
    data: { installationId: randomUUID() },
  });
  const secret = (await d.json()).secret;
  const registered = await page.request.post("/api/auth/register", {
    data: {
      secret,
      username: "实验验收" + Date.now().toString().slice(-8),
      password: "labs-test-password-123",
    },
  });
  expect(registered.ok()).toBeTruthy();
  await page.goto("/");
  await page.locator(".subject-card").first().click();
  await page.getByLabel("函数表达式").fill("a*sin(x)+c");
  await expect(page.locator(".equation-chip")).toContainText("a*sin(x)+c");
  await expect(page.locator(".error-notice")).toHaveCount(0);
  await page.getByLabel("实验工具", { exact: true }).selectOption("geometry");
  await expect(
    page.getByRole("heading", { name: "每一次拖动，都有新的关系。" }),
  ).toBeVisible();
  await expect(page.locator(".measurement-cards")).toContainText("15.00");
  await page.getByRole("button", { name: "Ω 物理", exact: true }).click();
  await page.getByLabel("实验工具", { exact: true }).selectOption("motion");
  await page.getByRole("button", { name: "播放轨迹" }).click();
  await expect(
    page.getByRole("button", { name: "暂停并保存时刻" }),
  ).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "暂停并保存时刻" }).click();
  await expect(page.locator(".measurement-cards").first()).not.toContainText(
    "水平位移 / m0.00",
  );
  await page.getByLabel("实验工具", { exact: true }).selectOption("forces");
  await expect(page.locator(".concept-card")).toContainText("5.000 N");
  await page.getByLabel("实验工具", { exact: true }).selectOption("optics");
  await expect(page.locator(".concept-card")).toContainText("7.50 cm");
  await page.getByRole("button", { name: "⚗ 化学", exact: true }).click();
  await page.getByLabel("实验工具", { exact: true }).selectOption("molecule");
  await page.getByLabel("分子", { exact: true }).selectOption("CH4");
  await expect(page.locator(".concept-card")).toContainText("正四面体");
  await page.getByRole("button", { name: "❋ 生物", exact: true }).click();
  await page.getByLabel("实验工具", { exact: true }).selectOption("dna");
  await page.getByLabel("DNA序列").fill("ATGC");
  await expect(page.locator(".concept-card")).toContainText("TACG");
  await page.getByLabel("向老师提问").fill("先保留我的文字");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 80;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 80, 40);
    ctx.fillStyle = "black";
    ctx.fillText("x = 2", 15, 25);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "equation.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.locator(".pending-attachment img")).toBeVisible();
  await page.getByRole("button", { name: "语音", exact: true }).click();
  await expect(page.getByText("麦克风尚未开启", { exact: true })).toBeVisible();
  await page.getByLabel("确认识别文字").fill("再补充一段候选");
  await page.getByRole("button", { name: "添加到问题" }).click();
  await expect(page.getByLabel("向老师提问")).toHaveValue(
    "先保留我的文字\n再补充一段候选",
  );
  await expect(page.locator(".pending-attachment img")).toBeVisible();
  expect(errors).toEqual([]);
});
