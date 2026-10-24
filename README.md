# ONclasstime 3.1

[下载网站](https://onclasstime.vercel.app) · [独立管理站](https://onclasstime-admin.vercel.app) · [Windows 发布](https://github.com/6756ytfhjyfj/ai-classroom-3/releases) · [使用指南](docs/QUICKSTART.zh-CN.md)

面向 Windows 10/11 x64 的学习客户端。用户名与密码登录，支持全屏笔迹、六学科课堂、实时教学实验、练习题库、错题图片和 Markdown 笔记。品牌素材来自项目所有者，底部标识为 `Power By ONtimeclass`。

3.1 将管理网站与学生程序分别构建；公开主页提供 Windows 安装包。所有用户认证与学习数据在可信后端处理，学生安装包不包含管理页面、数据库凭证或 AI 密钥。以前的设备绑定与三账号限制不再应用。旧绑定表仅为保留历史关系而留在迁移中。

## 使用

下载 `ONclasstime-3.1.0-Setup.exe`，打开安装向导，选择位置与快捷方式，安装完成后启动。注册用户名与至少 10 位密码并保存账号恢复码。

- 练习题库：157,011 道实际可作答的原创计算变式与基础题，支持学科、知识点、难度筛选。数理化以计算变式为主，语文、生物为少量基础概念，英语为基础语法；不会将这些题标作历年真题。管理员可导入有合法来源的题库。
- 我的错题：答错自动归档，也可上传 PNG/JPEG/WebP。单张原图不超过 10 MB，账号图片总额 20 MB。上传前确认，图片不会自动发送给 AI。支持订正、复习安排、标记掌握和摘录到笔记。
- 笔记本：分本管理、自动保存、置顶、搜索、Markdown/公式预览、导出；断网或冲突保留本机草稿。账号间隔离，并发更新使用版本检查。
- AI 课堂：由管理员配置 DeepSeek/Gemini 的实际模型和密钥。未配置时明确提示，题库和笔记仍可用。AQ 前缀不会被本地校验拒绝；真实认证结果以官方服务响应为准。

账号、资料同步和 AI 需要网络。客户端在本机保留未提交草稿；一键完整卸载清除当前 Windows 用户的本机草稿、登录状态与缓存，保留云端账号资料。安装包目前没有商业代码签名。

## 开发与验证

需要 Windows、Node.js 22.13+（建议 24）、npm。数据库与云端凭据不随源码发布。

```powershell
npm ci
npm run setup
npm run dev
```

本地开发使用 SQLite，`http://127.0.0.1:5173` 为学生页面，Fastify 在 4310。另开终端以 `$env:ONCLASSTIME_SURFACE='admin'; npm run dev:web` 启动独立管理界面（先停止占用 5173 的学生开发页）。`npm run admin:create -- <用户名>` 在本地安全初始化管理员。

```powershell
npm run typecheck
npm test
node scripts/verify-onclasstime.mjs
npm run build
npm run package:win
```

`verify-onclasstime` 使用系统 Edge 和真实 API/数据库测试注册、答题、错题上传、笔记保存恢复、公式预览。测试会创建专用验收账号；请使用测试数据库。`ONCLASSTIME_TEST_EXE` 可指向安装后的程序，`ONCLASSTIME_TEST_PROFILE` 指定独立本机配置目录。真实数位板、麦克风与云 AI 密钥仍需人工验收。

安装包由 Electron 目录包和自定义 WPF 向导组成；构建使用 Windows 自带 .NET Framework C# 编译器。向导验证嵌入载荷 SHA-256、真实解压进度、可取消安装、目录归属验证和升级回滚。可通过 Windows“已安装的应用”卸载。生产分发建议配置代码签名。

## 工程结构

`src/` 学生界面、下载页与独立管理入口；`electron/` 沙箱桌面窗口、本机界面和 HTTPS API 代理；`server/` Fastify 身份认证、持久化、模型代理及管理权限；`shared/` 协议、题库与实验计算；`prisma/` SQLite/PostgreSQL schema 和递增迁移；`installer/` WPF 安装卸载向导；`admin-site/` 独立 Vercel 项目配置。

`ONCLASSTIME_SURFACE` 决定构建入口（desktop/download/admin）。`npm run build:cloud` 构建下载页和云后端所需 Prisma 客户端；`npm run build:admin` 仅构建管理站。管理站 `/api` 代理到主服务，使用本域 HttpOnly Cookie，后台每个接口验证管理员角色。详见[部署说明](docs/CLOUD-DEPLOYMENT.md)。

### 3.1.1 图片上传

单张 PNG/JPEG/WebP 原图最高 10 MB（10 × 1024 × 1024 字节），保留原始字节；超过上限会提示。公网使用 768 KiB 分段上传、SHA-256 完整性校验及分段读取，不受单次函数请求/响应大小限制。账号总图片额度仍为 20 MB，临时上传预留也计入额度，未完成上传 10 分钟后过期并在下次上传时清理。点击“加入课堂讲解”会生成供 AI 使用的缩小副本，错题原图不变。
