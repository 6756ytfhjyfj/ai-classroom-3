import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { db, serialized, audit } from "./db.js";
import {
  credentials,
  usernameSchema,
  passwordSchema,
  type PublicUser,
} from "../shared/protocol.js";
import {
  AppError,
  token,
  digest,
  hashPassword,
  verifyPassword,
  equalsDigest,
} from "./security.js";
declare module "fastify" {
  interface FastifyRequest {
    account: PublicUser;
    sessionId: string;
    deviceId: string;
  }
}
export const publicUser = (u: {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: string;
  preferences: string;
}): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  avatar: u.avatar,
  role: u.role,
  preferences: u.preferences,
});
export async function authenticate(req: FastifyRequest) {
  const t = req.cookies.ac_session;
  if (!t) throw new AppError(401, "AUTH_REQUIRED", "请先登录");
  const s = await db.authSession.findUnique({
    where: { id: digest(t) },
    include: { user: true },
  });
  if (
    !s ||
    s.revokedAt ||
    s.expiresAt < new Date() ||
    s.user.status !== "ACTIVE"
  )
    throw new AppError(
      401,
      "SESSION_EXPIRED",
      "登录已过期或账号已冻结，请重新登录",
    );
  req.account = publicUser(s.user);
  req.sessionId = s.id;
  req.deviceId = s.deviceId;
}
export async function adminOnly(req: FastifyRequest) {
  await authenticate(req);
  if (req.account.role !== "ADMIN")
    throw new AppError(403, "ADMIN_REQUIRED", "需要管理员权限");
}
export async function getDevice(secret: string) {
  const d = await db.device.findUnique({
    where: { registrationIdentifier: digest(secret) },
  });
  if (!d || d.status !== "ACTIVE")
    throw new AppError(
      401,
      "DEVICE_UNKNOWN",
      "设备凭证失效，请导入设备恢复凭证或联系管理员",
    );
  return d;
}
const deviceProof = z.string().min(32).max(200);
export async function session(
  reply: FastifyReply,
  userId: string,
  deviceId: string,
  remember: boolean,
) {
  const t = token();
  await db.authSession.create({
    data: {
      id: digest(t),
      userId,
      deviceId,
      expiresAt: new Date(Date.now() + (remember ? 30 : 1) * 86400000),
    },
  });
  reply.setCookie("ac_session", t, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    ...(remember ? { maxAge: 30 * 86400 } : {}),
  });
}
export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/device/bootstrap",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const { installationId, secret } = z
        .object({ installationId: z.uuid(), secret: deviceProof.optional() })
        .parse(req.body);
      if (
        !secret &&
        (process.env.DEVICE_ENROLLMENT_MODE ??
          (process.env.DATABASE_PROVIDER === "postgresql"
            ? "admin"
            : "open-demo")) !== "open-demo"
      )
        throw new AppError(
          409,
          "DEVICE_APPROVAL_REQUIRED",
          "此安装尚未绑定设备，请导入管理员签发的设备恢复凭证；丢失原凭证时申请重绑定。",
        );
      const proof = secret ?? token();
      const device = secret
        ? await getDevice(secret)
        : await db.device.create({
            data: { registrationIdentifier: digest(proof) },
          });
      const install = await db.installation.findUnique({
        where: { id: installationId },
      });
      if (install && install.deviceId !== device.id)
        throw new AppError(
          409,
          "INSTALLATION_BOUND",
          "安装实例属于另一设备，恢复时请使用新的安装实例",
        );
      await db.installation.upsert({
        where: { id: installationId },
        create: { id: installationId, deviceId: device.id },
        update: { lastSeenAt: new Date() },
      });
      const bindings = await db.deviceAccountBinding.findMany({
        where: { deviceId: device.id, slot: { not: null } },
        include: { user: true },
      });
      return {
        secret: proof,
        deviceId: device.id,
        used: bindings.length,
        limit: 3,
        accounts: bindings
          .filter((b) => b.user.status === "ACTIVE")
          .map((b) => ({
            username: b.user.displayName,
            avatar: b.user.avatar,
          })),
      };
    },
  );
  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 12, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const p = credentials.extend({ secret: deviceProof }).parse(req.body);
      const d = await getDevice(p.secret),
        passwordHash = await hashPassword(p.password),
        recoveryCode = token();
      const user = await serialized(() =>
        db.$transaction(
          async (tx) => {
            await tx.device.update({
              where: { id: d.id },
              data: { lockVersion: { increment: 1 } },
            });
            const occupied = await tx.deviceAccountBinding.findMany({
              where: { deviceId: d.id, slot: { not: null } },
            });
            const slot = [1, 2, 3].find(
              (s) => !occupied.some((b) => b.slot === s),
            );
            if (!slot)
              throw new AppError(
                409,
                "DEVICE_LIMIT",
                "此设备已达到最多 3 个注册账号的限制。",
              );
            const u = await tx.user.create({
              data: {
                username: p.username.toLocaleLowerCase("en-US"),
                displayName: p.username,
                passwordHash,
                recoveryHash: digest(recoveryCode),
              },
            });
            await tx.deviceAccountBinding.create({
              data: { deviceId: d.id, userId: u.id, slot },
            });
            return u;
          },
          { maxWait: 15000, timeout: 15000 },
        ),
      );
      await session(reply, user.id, d.id, false);
      return { user: publicUser(user), recoveryCode };
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const p = credentials
        .extend({ secret: deviceProof, remember: z.boolean().default(false) })
        .parse(req.body);
      const d = await getDevice(p.secret);
      const u = await db.user.findUnique({
        where: { username: p.username.toLocaleLowerCase("en-US") },
      });
      if (
        !u ||
        u.status !== "ACTIVE" ||
        !(await verifyPassword(u.passwordHash, p.password))
      )
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "用户名或密码错误，或账号已冻结",
        );
      await session(reply, u.id, d.id, p.remember);
      return { user: publicUser(u) };
    },
  );
  app.get("/api/auth/me", { preHandler: authenticate }, (req) => ({
    user: req.account,
  }));
  app.post(
    "/api/auth/logout",
    { preHandler: authenticate },
    async (req, reply) => {
      await db.authSession.update({
        where: { id: req.sessionId },
        data: { revokedAt: new Date() },
      });
      reply.clearCookie("ac_session", { path: "/" });
      return { ok: true };
    },
  );
  app.post(
    "/api/auth/recover",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const p = z
          .object({
            username: usernameSchema,
            recoveryCode: z.string().min(1).max(200),
            password: passwordSchema,
          })
          .parse(req.body),
        u = await db.user.findUnique({
          where: { username: p.username.toLocaleLowerCase("en-US") },
        });
      if (!u?.recoveryHash || !equalsDigest(p.recoveryCode, u.recoveryHash))
        throw new AppError(400, "RECOVERY_FAILED", "用户名或恢复码错误");
      const code = token();
      await db.$transaction([
        db.user.update({
          where: { id: u.id },
          data: {
            passwordHash: await hashPassword(p.password),
            recoveryHash: digest(code),
          },
        }),
        db.authSession.updateMany({
          where: { userId: u.id },
          data: { revokedAt: new Date() },
        }),
      ]);
      return { recoveryCode: code };
    },
  );
  app.post(
    "/api/recovery/request",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (req) => {
      const p = z
        .object({
          type: z.enum(["PASSWORD", "DEVICE"]),
          detail: z.string().min(10).max(1000),
        })
        .parse(req.body);
      await db.recoveryRequest.create({ data: p });
      return { ok: true };
    },
  );
  app.post(
    "/api/setup/admin",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const p = credentials
        .extend({ bootstrapToken: z.string().min(32).max(200) })
        .parse(req.body);
      const expected = process.env.CLASSROOM_BOOTSTRAP_TOKEN;
      if (!expected || !equalsDigest(p.bootstrapToken, digest(expected)))
        throw new AppError(
          403,
          "BOOTSTRAP_DISABLED",
          "初始化通道未启用或凭证无效，请使用本机 --initialize-admin 启动",
        );
      const secret = token(),
        passwordHash = await hashPassword(p.password);
      const result = await serialized(() =>
        db.$transaction(async (tx) => {
          if (await tx.user.count({ where: { role: "ADMIN" } }))
            throw new AppError(
              409,
              "ADMIN_EXISTS",
              "已有管理员，请使用正常登录或联系服务器所有者",
            );
          await tx.systemSettings.create({
            data: {
              id: "admin-bootstrap-complete",
              data: JSON.stringify({ createdAt: new Date() }),
            },
          });
          const u = await tx.user.create({
            data: {
              username: p.username.toLocaleLowerCase("en-US"),
              displayName: p.username,
              passwordHash,
              role: "ADMIN",
            },
          });
          const d = await tx.device.create({
            data: { registrationIdentifier: digest(secret) },
          });
          await tx.administratorAuditLog.create({
            data: {
              actorId: u.id,
              action: "ADMIN_BOOTSTRAP",
              targetId: u.id,
              detail: "local owner bootstrap",
            },
          });
          return { u, d };
        }),
      );
      delete process.env.CLASSROOM_BOOTSTRAP_TOKEN;
      await session(reply, result.u.id, result.d.id, false);
      return { user: publicUser(result.u), secret };
    },
  );
  app.patch("/api/account", { preHandler: authenticate }, async (req) => {
    const p = z
      .object({
        username: usernameSchema.optional(),
        avatar: z.string().max(4).optional(),
        preferences: z.record(z.string(), z.unknown()).optional(),
        oldPassword: z.string().optional(),
        password: passwordSchema.optional(),
      })
      .parse(req.body);
    const data: Record<string, unknown> = {};
    if (p.username) {
      data.username = p.username.toLocaleLowerCase("en-US");
      data.displayName = p.username;
    }
    if (p.avatar) data.avatar = p.avatar;
    if (p.preferences) data.preferences = JSON.stringify(p.preferences);
    if (p.password) {
      const u = await db.user.findUniqueOrThrow({
        where: { id: req.account.id },
      });
      if (
        !p.oldPassword ||
        !(await verifyPassword(u.passwordHash, p.oldPassword))
      )
        throw new AppError(400, "PASSWORD_WRONG", "原密码错误");
      data.passwordHash = await hashPassword(p.password);
      await db.authSession.updateMany({
        where: { userId: u.id, id: { not: req.sessionId } },
        data: { revokedAt: new Date() },
      });
    }
    return {
      user: publicUser(
        await db.user.update({ where: { id: req.account.id }, data }),
      ),
    };
  });
  app.get(
    "/api/account/sessions",
    { preHandler: authenticate },
    async (req) => ({
      sessions: await db.authSession.findMany({
        where: {
          userId: req.account.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, deviceId: true, createdAt: true, expiresAt: true },
      }),
    }),
  );
  app.delete(
    "/api/account/sessions/:id",
    { preHandler: authenticate },
    async (req) => {
      const { id } = req.params as { id: string };
      await db.authSession.updateMany({
        where: { id, userId: req.account.id },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    },
  );
  app.post(
    "/api/account/delete-request",
    { preHandler: authenticate },
    async (req) => {
      await db.recoveryRequest.create({
        data: {
          userId: req.account.id,
          type: "DELETE_ACCOUNT",
          detail: "用户申请删除账号和学习数据，名额按保留策略处理",
        },
      });
      await audit(req.account.id, "REQUEST_ACCOUNT_DELETE", req.account.id);
      return { ok: true };
    },
  );
}
