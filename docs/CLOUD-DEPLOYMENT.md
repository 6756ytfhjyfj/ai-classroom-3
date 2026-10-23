# 公网部署与维护

本项目使用同源 React/Vite 静态资源与 Fastify Node Function，数据库为 PostgreSQL。GitHub Pages 不运行此后端。Windows 单机版仍使用 SQLite，保持独立的数据空间。

## 重现部署

1. 在 PostgreSQL 创建独立的 `classroom` schema、迁移账号和运行账号。运行账号只拥有该 schema 的数据读写权限；不要把数据库超级用户交给应用。Supabase 的 schema 不应暴露到 Data API，撤销 `anon` 与 `authenticated` 的 schema 权限，并启用相应 RLS。
2. 用迁移账号的会话连接运行：

```powershell
npm ci
npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```

迁移账号仅用于部署终端，不作为运行时 DATABASE_URL。PostgreSQL 的三账号规则由设备行更新锁、三个唯一槽位和 CHECK 约束共同保证。

3. 创建 Vercel 项目，框架选 Vite。构建、安装、路由和函数配置已写在 `vercel.json`。`npm run build:cloud` 生成 PostgreSQL Prisma Client、校验类型并构建前端。`api/index.ts` 是 Vercel 入口；后端与共享模块使用明确的 `.js` 导入路径，兼容 Node 原生 ESM 解析及 TypeScript 编译。
4. 在 Production 设置以下服务端环境变量。不要使用 `VITE_` 前缀，不要提交私密 `.env`。

| 变量 | 设置 |
| --- | --- |
| DATABASE_URL | 运行账号的 PostgreSQL TLS 连接；Supabase 事务池用 6543、`pgbouncer=true`、较小 `connection_limit`、`schema=classroom` |
| DATABASE_PROVIDER | postgresql |
| DEVICE_ENROLLMENT_MODE | admin |
| ENCRYPTION_KEY | 随机 32 字节的 base64，使用 Secret 类型，保管备份 |
| COOKIE_SECURE | true |
| APP_ORIGIN | 正式网站完整 HTTPS origin |
| CLASSROOM_SERVER_URL | 同一正式 HTTPS origin |
| CLASSROOM_BOOTSTRAP_TOKEN | 随机至少 32 字节的 base64url，使用 Secret 类型，仅供首位管理员初始化 |
| AI_ALLOWED_HOSTS | api.deepseek.com,generativelanguage.googleapis.com |
| ELECTRON_SKIP_BINARY_DOWNLOAD | 1 |

5. 登录官方 Vercel CLI，明确链接自己的 team/project 后发布。先检查暂存生产部署，再 promote 到正式域名。每次换域名同步 APP_ORIGIN 和 CLASSROOM_SERVER_URL。预览环境不要直接共享生产数据库和初始化密钥。
6. 所有者私下访问 `https://正式域名/admin/setup#一次性token`，自己设置管理员密码。前端立即从地址栏移除 fragment；服务端数据库记录完成状态，禁止重复创建首位管理员。创建完成后可移除 Vercel 的初始化环境变量并重新部署。

## 日常维护

- API Key 在应用管理员后台填写与测试，AES-256-GCM 加密保存在数据库。加密主密钥丢失后无法解密旧配置。
- 数据库采用私有 schema 和专用运行角色，应用逐条检查账号与课堂归属；浏览器不持有数据库凭据。
- 定期从 Supabase 控制台导出或备份自己的学习数据库。免费方案不等同于生产 SLA 或持续备份承诺。
- 当前 GitHub 源码与 Vercel CLI 部署均已完成。若要推送自动发布，在 Vercel 的账户 Login Connections 绑定对应 GitHub，再连接本仓库；当前未自动绑定。
- 函数单次最长 300 秒。客户端停止流式连接会取消当前请求；跨实例的取消路由与进程内频率限制不能充当集群级调度或全局限流。正式学校规模应补充共享限流与请求控制服务，并进行负载测试。
- 设备身份是经审核发放的可恢复随机凭证，不能宣称浏览器拥有不可绕过的物理硬件身份。
- 页面 CSP、HTTPS cookie、来源检查、管理员权限与数据隔离均保留。不要为调试公开密钥、关闭账号校验或改为开放注册设备身份。
