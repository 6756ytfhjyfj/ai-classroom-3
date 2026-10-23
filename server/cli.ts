import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { db, seed, audit } from "./db.js";
import { usernameSchema, passwordSchema } from "../shared/protocol.js";
import { hashPassword, token, digest } from "./security.js";
async function hiddenPassword() {
  if (!process.stdin.isTTY)
    throw new Error(
      "请使用交互终端输入密码，或通过受保护的 CLASSROOM_ADMIN_PASSWORD 环境变量初始化",
    );
  process.stdout.write("设置管理员密码（至少10位，输入隐藏）：");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          reject(new Error("已取消"));
          return;
        }
        if (ch === "\b" || ch === "\u007f") {
          value = value.slice(0, -1);
        } else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}
const username = usernameSchema.parse(process.argv[2]);
const password =
  process.env.CLASSROOM_ADMIN_PASSWORD ?? (await hiddenPassword());
passwordSchema.parse(password);
await seed();
if (
  await db.user.findUnique({
    where: { username: username.toLocaleLowerCase("en-US") },
  })
)
  throw new Error("用户名已存在；为避免覆盖账号，请选择独立管理员名称");
const u = await db.user.create({
  data: {
    username: username.toLocaleLowerCase("en-US"),
    displayName: username,
    passwordHash: await hashPassword(password),
    role: "ADMIN",
  },
});
await audit(u.id, "ADMIN_BOOTSTRAP", u.id);
const secret = token();
await db.device.create({ data: { registrationIdentifier: digest(secret) } });
mkdirSync("data", { recursive: true });
writeFileSync(
  "data/admin-device-credential.json",
  JSON.stringify({ secret }, null, 2),
  { mode: 0o600 },
);
await db.$disconnect();
console.log(
  "管理员已创建；通过 /admin 登录。集中部署首次登录请导入 data/admin-device-credential.json，请保密该凭证。",
);
