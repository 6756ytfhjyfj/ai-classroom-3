# ONclasstime 公网部署

主项目为下载站与 Fastify API，管理站为另一个 Vercel 项目，学生端是安装后的 Electron 程序。三者共用服务端账号和 PostgreSQL；Windows 程序不内置管理页面或数据库。

## 数据库

创建私有 classroom schema、拥有迁移权限的 ac_migrator 与仅可读写业务数据的 ac_runtime。保持 schema 不对 Supabase Data API 的 anon/authenticated 开放。表启用 RLS，服务端角色使用 server_only 策略，用户所有权由经过测试的后端查询逐项校验。

迁移使用迁移账号会话端口，运行服务使用池化端口。DATABASE_URL 必须包含 schema=classroom、sslmode=require；池化 URL 使用 pgbouncer=true。

运行 npm ci，再用迁移凭据执行 npx prisma migrate deploy --schema prisma/postgres/schema.prisma。保留现有迁移文件，禁止在生产执行 reset。应用函数使用 ac_runtime；它不应具备建表、修改角色、绕过 RLS 权限。

## 主项目

仓库根目录，buildCommand 为 npm run build:cloud，输出 dist，Node API 位于 api/index.ts，区域 sin1。环境变量：DATABASE_PROVIDER=postgresql、DATABASE_URL（运行账号）、ENCRYPTION_KEY（32 字节 Base64 私密主密钥）、APP_ORIGIN=https://onclasstime.vercel.app、ADMIN_ORIGIN=https://onclasstime-admin.vercel.app、COOKIE_SECURE=true。

AI_ALLOWED_HOSTS 限制可配置 AI 服务主机。生产密钥不出现在客户端，也不得写入源码、构建日志或 Vercel 的公开 VITE_ 变量。

发布真实 Windows 安装包后，设置 INSTALLER_DOWNLOAD_URL、INSTALLER_SHA256、INSTALLER_SIZE（字节）。未设置有效下载信息时页面不提供假下载。主项目保留旧地址 https://ai-classroom-3-sand.vercel.app 作为同一个下载站的兼容入口。

## 独立管理站

项目根目录 admin-site，允许构建读取仓库根目录文件。安装命令 cd .. && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund，构建 cd .. && npm run build:admin，输出 dist。admin-site/vercel.json 将 /api 转发到主项目。管理站不需要复制数据库和 AI 密钥。

页面使用用户名密码验证，服务端每项管理接口再次检查 ADMIN 角色。平台部署保护与应用登录不同；正式公开管理登录页应允许匿名打开页面，但未登录/普通学生不能读取或修改后台数据。

首位管理员使用部署所有者保管的 CLASSROOM_BOOTSTRAP_TOKEN 一次性初始化链接，地址为管理站 /setup#TOKEN。令牌放在 fragment，页面读取后立即从地址栏移除；不应通过聊天、公共文档或 GitHub 发布令牌。初始化后数据库标记关闭该通道；无公开默认密码。

## 桌面与发布

Windows 运行 npm run package:win，得到 release/ONclasstime-3.1.0-Setup.exe 和 SHA256SUMS.txt。程序默认连接 https://onclasstime.vercel.app，可用 CLASSROOM_SERVER_URL 指向其他可信 HTTPS 部署。进程隔离、沙箱、导航限制与 IPC 来源验证保持开启。

先验证预发布部署的页面、API 和数据库完整路径，再正式推广。GitHub 源码推送与 Vercel 部署分别执行；当前账号未接通 Git 自动部署时，必须使用已登录的 Vercel CLI，不能把 git push 当成已上线。
