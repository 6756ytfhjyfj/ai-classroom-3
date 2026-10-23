import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { db } from "../server/db";
import { createApp } from "../server/app";
import { hashPassword } from "../server/security";
let app: Awaited<ReturnType<typeof createApp>>,
  secret = "",
  cookie = "",
  userId = "",
  adminCookie = "",
  secondAccount = "";
const post = (url: string, payload: object, cookieValue?: string) =>
  app.inject({
    method: "POST",
    url,
    payload,
    headers: cookieValue ? { cookie: cookieValue } : {},
  });
beforeAll(async () => {
  new DatabaseSync("prisma/test.db").close();
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "reset",
      "--force",
      "--skip-generate",
    ],
    { env: process.env, stdio: "pipe" },
  );
  app = await createApp();
  const r = await post("/api/device/bootstrap", {
    installationId: randomUUID(),
  });
  secret = r.json().secret;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
describe("真实数据库账号与安全集成", () => {
  it("注册和 session 使用安全 cookie", async () => {
    const r = await post("/api/auth/register", {
      username: "学习者1",
      password: "test-password-123",
      secret,
    });
    expect(r.statusCode).toBe(200);
    cookie = r.headers["set-cookie"]!.toString().split(";")[0];
    userId = r.json().user.id;
    expect(r.headers["set-cookie"]).toContain("HttpOnly");
    expect(r.json().user.passwordHash).toBeUndefined();
    expect(r.json().recoveryCode.length).toBeGreaterThan(32);
  });
  it("用户名唯一、错误密码拒绝", async () => {
    expect(
      (
        await post("/api/auth/register", {
          username: "学习者1",
          password: "test-password-123",
          secret,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post("/api/auth/login", {
          username: "学习者1",
          password: "wrong-password",
          secret,
        })
      ).statusCode,
    ).toBe(401);
  });
  it("并发注册不会突破三账号", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        post("/api/auth/register", {
          username: "并发用户" + i,
          password: "test-password-123",
          secret,
        }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2);
    secondAccount = results.find((r) => r.statusCode === 200)!.json()
      .user.displayName;
    expect(
      results.filter((r) => r.json().code === "DEVICE_LIMIT"),
    ).toHaveLength(4);
    expect(
      await db.deviceAccountBinding.count({ where: { slot: { not: null } } }),
    ).toBe(3);
  });
  it("名额已满不影响登录；重启与新安装沿用服务端记录", async () => {
    expect(
      (
        await post("/api/auth/login", {
          username: "学习者1",
          password: "test-password-123",
          secret,
        })
      ).statusCode,
    ).toBe(200);
    const r = await post("/api/device/bootstrap", {
      installationId: randomUUID(),
      secret,
    });
    expect(r.json().used).toBe(3);
  });
  it("数据库约束阻止第四槽位", async () => {
    const d = await db.device.findUniqueOrThrow({
      where: {
        registrationIdentifier: (await import("../server/security")).digest(
          secret,
        ),
      },
    });
    await expect(
      db.deviceAccountBinding.create({
        data: { deviceId: d.id, userId, slot: 4 },
      }),
    ).rejects.toThrow();
  });
  it("普通用户不能访问后台；跨站写拒绝", async () => {
    expect(
      (await app.inject({ url: "/api/admin/providers", headers: { cookie } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          payload: {},
          headers: { cookie, origin: "https://evil.example" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("课堂与手写按账号隔离，实验使用 CAS", async () => {
    const r = await post(
      "/api/classrooms",
      { subjectId: "math", title: "真实课堂" },
      cookie,
    );
    expect(r.statusCode).toBe(200);
    const id = r.json().id;
    const change = await app.inject({
      method: "PUT",
      url: `/api/classrooms/${id}/state`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        state: { kind: "graph", a: 2, b: 0, c: 0 },
      },
    });
    expect(change.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/classrooms/${id}/state`,
          headers: { cookie },
          payload: {
            expectedVersion: 0,
            state: { kind: "graph", a: 3, b: 0, c: 0 },
          },
        })
      ).statusCode,
    ).toBe(409);
    const other = await post("/api/auth/login", {
      username: secondAccount,
      password: "test-password-123",
      secret,
    });
    expect(other.statusCode).toBe(200);
    {
      const cookie2 = other.headers["set-cookie"]!.toString().split(";")[0];
      expect(
        (
          await app.inject({
            url: `/api/classrooms/${id}`,
            headers: { cookie: cookie2 },
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (
        await post(
          `/api/classrooms/${id}/chat`,
          { requestId: randomUUID(), text: "测试" },
          cookie,
        )
      ).json().code,
    ).toBe("AI_NOT_CONFIGURED");
  });
  it("AQ 密钥可保存且客户端只读掩码；管理员重置审计", async () => {
    await db.user.create({
      data: {
        username: "admin-test",
        displayName: "admin",
        passwordHash: await hashPassword("admin-password-123"),
        role: "ADMIN",
      },
    });
    const r = await post("/api/auth/login", {
      username: "admin-test",
      password: "admin-password-123",
      secret,
    });
    adminCookie = r.headers["set-cookie"]!.toString().split(";")[0];
    const save = await app.inject({
      method: "PUT",
      url: "/api/admin/providers/gemini",
      headers: { cookie: adminCookie },
      payload: {
        key: "AQ-test-key-format-only",
        model: "configured-model",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        enabled: true,
        subjects: ["*"],
        vision: true,
      },
    });
    expect(save.statusCode).toBe(200);
    const read = await app.inject({
      url: "/api/admin/providers",
      headers: { cookie: adminCookie },
    });
    expect(read.body).not.toContain("AQ-test");
    expect(read.body).not.toContain("encryptedKey");
    const d = await db.device.findFirstOrThrow();
    expect(
      (
        await post(
          `/api/admin/devices/${d.id}/reset`,
          { confirmDeviceId: d.id, reason: "集成测试验证管理员重置名额与审计" },
          adminCookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      await db.administratorAuditLog.count({
        where: { action: "DEVICE_SLOTS_RESET" },
      }),
    ).toBe(1);
    expect(
      await db.deviceAccountBinding.count({ where: { slot: { not: null } } }),
    ).toBe(0);
  });
  it("集中部署未知安装必须审核；已知凭证可恢复", async () => {
    process.env.DEVICE_ENROLLMENT_MODE = "admin";
    try {
      const rejected = await post("/api/device/bootstrap", {
        installationId: randomUUID(),
      });
      expect(rejected.json().code).toBe("DEVICE_APPROVAL_REQUIRED");
      const known = await post("/api/device/bootstrap", {
        installationId: randomUUID(),
        secret,
      });
      expect(known.statusCode).toBe(200);
    } finally {
      delete process.env.DEVICE_ENROLLMENT_MODE;
    }
  });
  it("初始化通道默认关闭，不能通过隐藏地址提权", async () => {
    expect(
      (
        await post("/api/setup/admin", {
          username: "hacker",
          password: "test-password-123",
          bootstrapToken: "x".repeat(43),
        })
      ).statusCode,
    ).toBe(403);
  });
  it("恢复码一次性使用、会话撤销与账号删除保留名额", async () => {
    const r = await post("/api/auth/register", {
      username: "恢复测试账号",
      password: "test-password-123",
      secret,
    });
    expect(r.statusCode).toBe(200);
    const recoveryCode = r.json().recoveryCode,
      oldCookie = r.headers["set-cookie"]!.toString().split(";")[0];
    const recovered = await post("/api/auth/recover", {
      username: "恢复测试账号",
      recoveryCode,
      password: "new-password-456",
    });
    expect(recovered.statusCode).toBe(200);
    expect(
      (
        await post("/api/auth/recover", {
          username: "恢复测试账号",
          recoveryCode,
          password: "new-password-456",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          url: "/api/auth/me",
          headers: { cookie: oldCookie },
        })
      ).statusCode,
    ).toBe(401);
    const login = await post("/api/auth/login", {
        username: "恢复测试账号",
        password: "new-password-456",
        secret,
      }),
      newCookie = login.headers["set-cookie"]!.toString().split(";")[0];
    expect(
      (await post("/api/account/delete-request", {}, newCookie)).statusCode,
    ).toBe(200);
    const req = await db.recoveryRequest.findFirstOrThrow({
      where: { userId: r.json().user.id, type: "DELETE_ACCOUNT" },
    });
    expect(
      (
        await post(
          `/api/admin/requests/${req.id}/resolve`,
          { action: "DELETE_DATA", reason: "测试账号明确申请删除并核验身份" },
          adminCookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      await db.deviceAccountBinding.count({
        where: { userId: r.json().user.id, slot: { not: null } },
      }),
    ).toBe(1);
    expect(
      (
        await post("/api/auth/login", {
          username: "恢复测试账号",
          password: "new-password-456",
          secret,
        })
      ).statusCode,
    ).toBe(401);
  });
});
