import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, audit, serialized } from "./db.js";
import { adminOnly } from "./auth.js";
import {
  encrypt,
  AppError,
  validateProviderUrl,
  digest,
  token,
} from "./security.js";
import { AIProvider, providerError } from "./providers.js";
import { skillRegistry } from "../shared/skills.js";
import { subjectId } from "../shared/protocol.js";
export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", adminOnly);
  app.get("/api/admin/overview", async () => ({
    users: await db.user.count(),
    devices: await db.device.count(),
    messages: await db.message.count(),
    executions: await db.skillExecution.count(),
  }));
  app.get("/api/admin/providers", async () => ({
    providers: (await db.aIProviderConfig.findMany()).map(
      ({ encryptedKey, ...c }) => ({
        ...c,
        keyMask: "••••••••（已加密保存）",
        hasKey: !!encryptedKey,
      }),
    ),
  }));
  app.put("/api/admin/providers/:id", async (req) => {
    const id = z
        .enum(["deepseek", "gemini"])
        .parse((req.params as { id: string }).id),
      p = z
        .object({
          key: z
            .string()
            .trim()
            .min(1)
            .max(8192)
            .regex(/^[^\s\x00-\x1f]+$/)
            .optional(),
          model: z
            .string()
            .trim()
            .min(1)
            .max(150)
            .regex(/^[\w./:-]+$/),
          baseUrl: z.url(),
          enabled: z.boolean(),
          subjects: z.array(z.union([subjectId, z.literal("*")])),
          vision: z.boolean().default(false),
          timeoutMs: z.number().int().min(5000).max(180000).default(60000),
        })
        .parse(req.body);
    const baseUrl = validateProviderUrl(p.baseUrl),
      old = await db.aIProviderConfig.findUnique({ where: { id } });
    if (!p.key && !old)
      throw new AppError(400, "KEY_REQUIRED", "首次配置必须输入密钥");
    const data = {
      baseUrl,
      model: p.model,
      enabled: p.enabled,
      subjectMap: JSON.stringify(p.subjects),
      vision: p.vision,
      timeoutMs: p.timeoutMs,
      ...(p.key ? { encryptedKey: encrypt(p.key) } : {}),
    };
    await db.aIProviderConfig.upsert({
      where: { id },
      create: { id, encryptedKey: p.key ? encrypt(p.key) : "", ...data },
      update: data,
    });
    await audit(req.account.id, "PROVIDER_CONFIGURE", id, {
      model: p.model,
      baseUrl,
    });
    return { ok: true };
  });
  app.post("/api/admin/providers/:id/test", async (req) => {
    const { id } = req.params as { id: string };
    const c = await db.aIProviderConfig.findUnique({ where: { id } });
    if (!c) throw new AppError(404, "NOT_CONFIGURED", "请先保存配置");
    try {
      const result = await new AIProvider(c).testConnection();
      await audit(req.account.id, "PROVIDER_TEST_OK", id, { model: c.model });
      return result;
    } catch (e) {
      const error = providerError(e);
      await audit(req.account.id, "PROVIDER_TEST_FAILED", id, {
        code: error.code,
      });
      throw error;
    }
  });
  app.get("/api/admin/providers/:id/models", async (req) => {
    const c = await db.aIProviderConfig.findUnique({
      where: { id: (req.params as { id: string }).id },
    });
    if (!c) throw new AppError(404, "NOT_CONFIGURED", "请先保存密钥与模型配置");
    try {
      return { models: await new AIProvider(c).listModels() };
    } catch (e) {
      throw providerError(e);
    }
  });
  app.get("/api/admin/skills", async () => ({
    skills: await Promise.all(
      skillRegistry.map(async (s) => ({
        ...s,
        execute: undefined,
        errorHandler: undefined,
        inputSchema: z.toJSONSchema(s.inputSchema),
        outputSchema: z.toJSONSchema(s.outputSchema),
        enabled:
          (await db.skillDefinition.findUnique({ where: { id: s.id } }))
            ?.enabled ?? true,
      })),
    ),
  }));
  app.patch("/api/admin/skills/:id", async (req) => {
    const { id } = req.params as { id: string };
    const p = z.object({ enabled: z.boolean() }).parse(req.body);
    if (!skillRegistry.some((s) => s.id === id))
      throw new AppError(404, "SKILL_UNKNOWN", "工具不存在");
    await db.skillDefinition.update({ where: { id }, data: p });
    await audit(req.account.id, "SKILL_CONFIGURE", id, p);
    return { ok: true };
  });
  app.post("/api/admin/skills/:id/test", async (req) => {
    const { id } = req.params as { id: string };
    const s = skillRegistry.find((s) => s.id === id);
    if (!s) throw new AppError(404, "SKILL_UNKNOWN", "工具不存在");
    return s.execute(s.inputSchema.parse(req.body));
  });
  app.get("/api/admin/users", async () => ({
    users: await db.user.findMany({
      select: {
        id: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        bindings: {
          select: { deviceId: true, slot: true, bindingStatus: true },
        },
      },
      take: 500,
    }),
  }));
  app.post("/api/admin/users/:id/recovery", async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = z
      .object({ reason: z.string().min(10).max(500) })
      .parse(req.body);
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    if (user.status === "DELETED")
      throw new AppError(400, "USER_DELETED", "已删除账号不可恢复");
    const recoveryCode = token();
    await db.$transaction([
      db.user.update({
        where: { id },
        data: { recoveryHash: digest(recoveryCode) },
      }),
      db.authSession.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      }),
      db.administratorAuditLog.create({
        data: {
          actorId: req.account.id,
          action: "ISSUE_ACCOUNT_RECOVERY",
          targetId: id,
          detail: JSON.stringify({ reason }),
        },
      }),
    ]);
    return { recoveryCode };
  });
  app.patch("/api/admin/users/:id", async (req) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ status: z.enum(["ACTIVE", "FROZEN"]) })
      .parse(req.body);
    if (id === req.account.id)
      throw new AppError(400, "SELF_FREEZE", "不能冻结当前管理员");
    await db.$transaction([
      db.user.update({ where: { id }, data: p }),
      db.authSession.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      }),
      db.administratorAuditLog.create({
        data: {
          actorId: req.account.id,
          action: "USER_STATUS",
          targetId: id,
          detail: JSON.stringify(p),
        },
      }),
    ]);
    return { ok: true };
  });
  app.get("/api/admin/devices", async () => ({
    devices: await db.device.findMany({
      select: {
        id: true,
        status: true,
        createdAt: true,
        bindings: {
          select: {
            id: true,
            userId: true,
            slot: true,
            bindingStatus: true,
            user: { select: { displayName: true } },
          },
        },
        installations: { select: { id: true, lastSeenAt: true } },
      },
      take: 500,
    }),
  }));
  app.post("/api/admin/devices", async (req) => {
    const { reason } = z
        .object({ reason: z.string().min(10).max(500) })
        .parse(req.body),
      secret = token();
    const device = await db.$transaction(async (tx) => {
      const d = await tx.device.create({
        data: { registrationIdentifier: digest(secret) },
      });
      await tx.administratorAuditLog.create({
        data: {
          actorId: req.account.id,
          action: "DEVICE_ENROLL",
          targetId: d.id,
          detail: JSON.stringify({ reason }),
        },
      });
      return d;
    });
    return { secret, deviceId: device.id };
  });
  app.post("/api/admin/devices/:id/reset", async (req) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        confirmDeviceId: z.string(),
        reason: z.string().min(10).max(500),
      })
      .parse(req.body);
    if (p.confirmDeviceId !== id)
      throw new AppError(400, "CONFIRM_REQUIRED", "设备 ID 确认不一致");
    await serialized(() =>
      db.$transaction(async (tx) => {
        await tx.device.update({
          where: { id },
          data: { lockVersion: { increment: 1 } },
        });
        await tx.deviceAccountBinding.updateMany({
          where: { deviceId: id },
          data: { slot: null, bindingStatus: "RELEASED_BY_ADMIN" },
        });
        await tx.administratorAuditLog.create({
          data: {
            actorId: req.account.id,
            action: "DEVICE_SLOTS_RESET",
            targetId: id,
            detail: JSON.stringify({ reason: p.reason }),
          },
        });
      }),
    );
    return { ok: true };
  });
  app.post("/api/admin/devices/:id/rebind", async (req) => {
    const { id } = req.params as { id: string };
    const p = z.object({ reason: z.string().min(10).max(500) }).parse(req.body),
      secret = token();
    await db.$transaction([
      db.device.update({
        where: { id },
        data: { registrationIdentifier: digest(secret) },
      }),
      db.authSession.updateMany({
        where: { deviceId: id },
        data: { revokedAt: new Date() },
      }),
      db.administratorAuditLog.create({
        data: {
          actorId: req.account.id,
          action: "DEVICE_REBIND",
          targetId: id,
          detail: JSON.stringify(p),
        },
      }),
    ]);
    return {
      secret,
      notice: "一次性显示，请通过安全渠道交给申请人；旧凭证已失效",
    };
  });
  app.get("/api/admin/requests", async () => ({
    requests: await db.recoveryRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  }));
  app.post("/api/admin/requests/:id/resolve", async (req) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        reason: z.string().min(5).max(500),
        action: z.enum(["RESOLVED", "REJECTED", "DELETE_DATA"]),
      })
      .parse(req.body);
    const r = await db.recoveryRequest.findUniqueOrThrow({ where: { id } });
    if (r.status !== "PENDING")
      throw new AppError(409, "ALREADY_RESOLVED", "请求已处理");
    await db.$transaction(async (tx) => {
      if (p.action === "DELETE_DATA") {
        if (
          r.type !== "DELETE_ACCOUNT" ||
          !r.userId ||
          r.userId === req.account.id
        )
          throw new AppError(400, "INVALID_DELETE", "无法删除该账号");
        await tx.classroom.deleteMany({ where: { userId: r.userId } });
        await tx.authSession.deleteMany({ where: { userId: r.userId } });
        await tx.deviceAccountBinding.updateMany({
          where: { userId: r.userId },
          data: { bindingStatus: "RETAINED_DELETED_ACCOUNT" },
        });
        await tx.user.update({
          where: { id: r.userId },
          data: {
            username: "deleted-" + r.userId,
            displayName: "已删除账号",
            passwordHash: "REVOKED",
            recoveryHash: null,
            status: "DELETED",
            preferences: "{}",
            avatar: "·",
          },
        });
      }
      await tx.recoveryRequest.update({
        where: { id },
        data: { status: p.action },
      });
      await tx.administratorAuditLog.create({
        data: {
          actorId: req.account.id,
          action: "RECOVERY_" + p.action,
          targetId: id,
          detail: JSON.stringify({ reason: p.reason }),
        },
      });
    });
    return { ok: true };
  });
  app.get("/api/admin/audit", async () => ({
    logs: await db.administratorAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  }));
  app.get("/api/admin/speech", async () => ({
    config:
      (await db.speechProviderConfig.findUnique({ where: { id: "system" } }))
        ?.data ??
      JSON.stringify({
        stt: "system",
        tts: "system",
        language: "zh-CN",
        rate: 1,
        autoInterrupt: false,
        recognizer: "vision",
      }),
  }));
  app.put("/api/admin/speech", async (req) => {
    const p = z
      .object({
        stt: z.literal("system"),
        tts: z.literal("system"),
        language: z.enum(["zh-CN", "en-US"]),
        rate: z.number().min(0.5).max(2),
        autoInterrupt: z.literal(false),
        recognizer: z.literal("vision"),
      })
      .parse(req.body);
    await db.speechProviderConfig.upsert({
      where: { id: "system" },
      create: { id: "system", data: JSON.stringify(p) },
      update: { data: JSON.stringify(p) },
    });
    await audit(req.account.id, "SPEECH_CONFIGURE", "system", p);
    return { ok: true };
  });
}
