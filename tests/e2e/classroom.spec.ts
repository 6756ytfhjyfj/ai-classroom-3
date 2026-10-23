import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
test("注册 → 课堂 → 参数持久化 → 全屏手写撤销恢复 → 六学科 → 权限", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const name = "验收" + Date.now().toString().slice(-9);
  await page.goto("/");
  await page.getByRole("button", { name: "注册账号", exact: true }).click();
  await page.getByLabel("用户名", { exact: true }).fill(name);
  await page.getByLabel("密码", { exact: true }).fill("classroom-test-123");
  await page.getByLabel("确认密码").fill("classroom-test-123");
  await page.getByRole("button", { name: "创建学习账号" }).click();
  await expect(
    page.getByRole("heading", { name: "请保存你的恢复码" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我已妥善保存" }).click();
  await expect(page.getByRole("heading", { name: /今天想/ })).toBeVisible();
  await expect(page.locator(".subject-card").last()).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/home.png", fullPage: true });
  await page.locator(".subject-card").first().click();
  await expect(
    page.getByRole("heading", { name: "让函数，变得直观。" }),
  ).toBeVisible();
  const a = page.getByLabel("参数 a", { exact: true });
  await a.fill("2");
  await a.dispatchEvent("input");
  await expect(page.locator(".equation-chip")).toContainText("2");
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/math.png", fullPage: true });
  await page.getByRole("button", { name: "手写", exact: true }).click();
  const canvas = page.getByLabel("全屏书写画布");
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() =>
    document.querySelector(".ink-view-tools")?.textContent?.includes("0 笔"),
  );
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 550, box.y + 350, { steps: 25 });
  await page.mouse.move(box.x + 650, box.y + 220, { steps: 25 });
  await page.mouse.up();
  await expect(page.locator(".ink-view-tools")).toContainText("1 笔");
  await page.getByLabel("手写提交方式").selectOption("text");
  await page.getByLabel("手写识别候选").fill("保留手写候选");
  await page.getByRole("button", { name: "语音补充", exact: true }).click();
  await page.getByLabel("确认识别文字").fill("待确认语音");
  await page.keyboard.press("Control+Enter");
  await expect(
    page.getByRole("dialog", { name: "全屏手写", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "把问题，说出来。", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByLabel("手写识别候选").fill("");
  await page.getByLabel("手写提交方式").selectOption("both");
  await page.getByRole("button", { name: "性能诊断", exact: true }).click();
  const metrics = await page
    .locator(".ink-metrics")
    .getAttribute("data-metrics");
  writeFileSync("test-results/ink-performance.json", metrics!);
  await page
    .locator(".ink-metrics")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "撤销笔迹", exact: true }).click();
  await expect(page.locator(".ink-view-tools")).toContainText("0 笔");
  await page.getByRole("button", { name: "重做笔迹", exact: true }).click();
  await expect(page.locator(".ink-view-tools")).toContainText("1 笔");
  await page.screenshot({
    path: "test-results/handwriting.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /保存并返回/ }).click();
  await expect(canvas).toBeHidden();
  await page.getByRole("button", { name: "手写", exact: true }).click();
  await expect(page.locator(".ink-view-tools")).toContainText("1 笔");
  await page.getByRole("button", { name: "清空笔迹（可以撤销）" }).click();
  await expect(page.locator(".ink-view-tools")).toContainText("0 笔");
  await page.getByRole("button", { name: /保存并返回/ }).click();
  await page.getByLabel("向老师提问").fill("解释当前函数");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(page.getByRole("alert")).toContainText("尚未配置");
  await expect(page.getByLabel("向老师提问")).toHaveValue("解释当前函数");
  await page.getByRole("button", { name: "Ω 物理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "把想法，连成电路。" }),
  ).toBeVisible();
  await expect(page.locator(".circuit-readings")).toContainText("0.600");
  await page.screenshot({ path: "test-results/circuit.png", fullPage: true });
  await page.getByRole("button", { name: "⚗ 化学", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "走进原子的微观世界。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "演示离子形成" }).click();
  await expect(page.locator(".atom-data")).toContainText("2 · 8");
  await page.getByPlaceholder("例如 Fe + O2 -> Fe2O3").fill("Fe + O2 -> Fe2O3");
  await page.getByRole("button", { name: "配平", exact: true }).click();
  await expect(page.locator("output")).toContainText("4Fe + 3O2 → 2Fe2O3");
  for (const [subject, title] of [
    ["生物", "生命的细节，值得放大。"],
    ["语文", "在字里行间，找到你的理解。"],
    ["英语", "让每一句，都有所收获。"],
  ]) {
    await page.getByRole("button", { name: new RegExp(subject + "$") }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await page.getByRole("button", { name: "切换深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "ƒ 数学", exact: true }).click();
  await expect(page.locator(".equation-chip")).toContainText("2");
  await page.screenshot({ path: "test-results/dark.png", fullPage: true });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "需要管理员权限" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
