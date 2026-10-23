import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const hashPassword = (password: string) =>
  hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export const verifyPassword = (stored: string, password: string) =>
  verify(stored, password);
function key() {
  const b = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (b.length !== 32)
    throw new AppError(
      503,
      "ENCRYPTION_NOT_CONFIGURED",
      "服务端加密主密钥未配置，请运行 npm run setup",
    );
  return b;
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv),
    data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
export const equalsDigest = (a: string, b: string) => {
  const x = Buffer.from(digest(a)),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function validateProviderUrl(raw: string) {
  const u = new URL(raw);
  const allowed = (
    process.env.AI_ALLOWED_HOSTS ??
    "api.deepseek.com,generativelanguage.googleapis.com"
  ).split(",");
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !allowed.includes(u.hostname)
  )
    throw new AppError(
      400,
      "PROVIDER_HOST_BLOCKED",
      "模型地址必须为 HTTPS，并由服务端 AI_ALLOWED_HOSTS 明确允许",
    );
  return raw.replace(/\/$/, "");
}
