# AI Classroom 3.0 · Windows 工程版

这是可运行的 Electron 桌面应用与独立 Fastify 服务端，使用真实数据库、Canvas 笔迹和可计算实验。模型尚未配置时会明确提示，不输出模拟的 AI 回答。源码、数据库迁移、自动化测试和打包脚本随项目提供。

## 直接使用 Windows 安装包

运行同级交付的 `AI-Classroom-3.0.0-Setup.exe`，按向导安装。首次启动可注册用户名与密码；注册后请保存一次性显示的账号恢复码。单机版在自己的应用数据目录保存 SQLite 数据库、加密密钥和设备凭证，不需要自行安装 Node.js。

安装包未配置商业代码签名证书。正式学校分发应由部署方签名；可对照交付的 SHA256 文件核验包内容。

首次配置 AI：退出应用，在 PowerShell 中使用安装后实际路径运行：

```powershell
& 'C:\实际安装目录\AI Classroom.exe' --initialize-admin
```

这是本机所有者显式开启的随机、一次性初始化通道。创建独立管理员用户名与密码后进入后台；已存在管理员时不能重复初始化。以后可关闭应用再使用 `--admin` 参数启动，或访问应用同一来源的 `/admin` 路径登录，学生界面没有入口。源码启动可运行 `npm run admin:create -- 管理员用户名`。

后台选择 DeepSeek 或 Gemini，填写真实密钥、可用模型 ID、Base URL，保存并点击“真实连接测试”。Gemini 使用 `x-goog-api-key`，接受 AQ 等格式，不检查 AIza 前缀。系统不会预设“最新模型”名称。图片识别需为实际支持图片的模型开启图片能力，并映射到对应学科或默认全部。Gemini 默认 API 地址为 `https://generativelanguage.googleapis.com/v1beta`；DeepSeek 默认 `https://api.deepseek.com`。

## 从源码运行

环境：Windows 10/11 x64、Node.js 24 LTS、npm；联网安装 npm 依赖及首次下载 Electron。无需 Rust、.NET SDK 或 Docker。

```powershell
npm ci
npm run setup
npm run build
npm run desktop
```

开发网页与服务端：

```powershell
npm run dev
# 打开 http://127.0.0.1:5173
```

运行生产网页服务：

```powershell
npm run build
npm start
# 打开 http://127.0.0.1:4310
```

源码网页模式和桌面单机模式使用不同的数据目录。网页模式数据库由 `.env` 的 DATABASE_URL 指定；桌面模式在 Electron 的 userData 中独立保存，并通过 Windows DPAPI 保护密钥。不要将开发数据库直接复制进安装包。

## 集中部署：可信的三账号设备限制

单机 SQLite 是演示与个人使用模式，本机所有者可修改本地程序或数据库，不能作为学校跨设备注册限制的可信边界。

集中服务端：

1. 准备 PostgreSQL，创建专用最小权限数据库账号。
2. 复制 `.env.example` 到 `.env`，设置 DATABASE_URL、DATABASE_PROVIDER=postgresql、DEVICE_ENROLLMENT_MODE=admin、独立32字节base64 ENCRYPTION_KEY、HTTPS APP_ORIGIN、COOKIE_SECURE=true。
3. 执行以下命令（PowerShell）。

```powershell
npm ci
npm run db:postgres
npx prisma generate --schema prisma/postgres/schema.prisma
npx prisma migrate deploy --schema prisma/postgres/schema.prisma
npm run admin:create -- 管理员用户名
npm run build
npm start
```

管理员初始设备凭证写入服务端 `data/admin-device-credential.json`，在初次登录页导入，之后使用管理员账号登录 `/admin`。该文件需要保密，不纳入源码或备份公开下载。

在管理员“设备与注册名额”中审核并签发新设备凭证，由学生在首次登录页导入。丢失旧凭证时审核重绑定旧设备，避免重复签发新身份。设备名额事务使用设备行锁与三个数据库唯一槽位，账号删除与冻结不自动释放名额。管理员重置需要设备ID和理由，保留审计。

桌面客户端连接集中服务：

```powershell
$env:CLASSROOM_SERVER_URL='https://你的学校服务域名'
& 'C:\实际安装目录\AI Classroom.exe'
```

部署方需配置 HTTPS 反向代理、日志与备份。默认服务仅绑定127.0.0.1；若容器或代理需要，显式配置 HOST。代码默认不信任转发IP头，启用代理信任前应限定可信代理，勿直接接受任意 X-Forwarded-For。

设备恢复凭证是隐私友好的随机身份，不收集未经授权的硬件序列号。保留凭证的重装能恢复名额；清空凭证后无法证明是同一物理设备，集中模式必须审核恢复。没有“绝对不可绕过”的硬件级承诺。

## 核心操作

- 数学：安全表达式函数绘图、a/b/c滑块、基准图像对比、数值零点、切线、几何拖点及面积周长。支持 sin/cos/tan/sqrt/abs/exp/ln/log，乘法必须写 `*`。通用函数零点搜索范围[-10,10]，可能遗漏偶重根；二次函数用解析结果。
- 物理：拖拽和接线的直流MNA电路、电阻/电池/开关/灯泡/仪表，短路和浮空反馈；另有抛体运动、共点力合成、理想凸薄透镜。所有简化条件在界面说明。
- 化学：原子/离子电子层、可旋转三维球棍投影模型、元素守恒配平（支持括号，不支持复杂离子氧化还原配平）。
- 生物：细胞结构与DNA互补链；语文/英语：可编辑阅读、学习笔记与系统朗读，配合AI工具写入教学分析。
- AI 双模式：自由问答或老师带学；教学计划与进度通过 TeachingPlan 工具真实持久化。每轮传入当前实验和最近对话，工具经过Schema、学科、启用状态与版本检查。
- 手写：点击“手写”即覆盖整个应用窗口，无需再次点画布；压感、合并轨迹、笔侧橡皮事件、鼠标回退、缩放平移、撤销重做、可撤销清空、导出笔迹。
- 云端识别：用户授权后发送PNG至配置的视觉模型，停笔可生成候选；候选可编辑，不替换原稿，不自动发送或清空。无视觉模型时仍可书写、保存和手动编辑文字。
- 联合提问：白板内语音补充或课堂添加图片；确认后一起提交。普通文字提问会附带当前实验上下文。
- 语音：桌面使用Windows本地 System.Speech 语言包；系统TTS支持朗读、暂停、继续、停止和语速音量。网页系统STT可能外发，必须额外授权。默认手动确认文字，不保存原始录音。
- 打断：按钮、Esc、手写或语音入口立即取消当前请求与朗读，已生成内容保留。未实现常开麦克风自动声学打断，可靠回退是按钮与快捷键。

快捷键：Ctrl+Enter发送；Ctrl+Shift+H手写；Ctrl+Shift+M语音；白板Ctrl+Z/Ctrl+Y撤销重做；Esc退出输入；非输入框中Space暂停/继续朗读。个人设置可修改手写与语音快捷键。

请在个人设置中导出设备恢复凭证，并备份服务器数据库与加密主密钥。丢失加密主密钥后无法还原已保存的API密钥。

## 测试与打包

```powershell
npm run typecheck
npm test
# 启动 npm start 后，在另一个终端：
npm run test:e2e
node scripts/desktop-smoke.mjs
# 首次管理员引导，使用独立测试profile：
node scripts/desktop-smoke.mjs --setup
npm run package:win
```

浏览器测试使用已安装的 Microsoft Edge。测试会创建专用测试账号；单元/集成测试使用独立 `prisma/test.db`，不会重置正式数据库。源码测试中的 AQ 示例仅验证格式、加密与脱敏，不能替代有效密钥的真实联网验收。

标准NSIS安装包输出到 `release/`。磁盘紧张时可把临时目录与打包输出放在其他磁盘：

```powershell
$env:TEMP='D:\你的构建临时目录'
$env:TMP=$env:TEMP
$env:ELECTRON_BUILDER_CACHE='D:\你的构建缓存目录'
$env:ELECTRON_CACHE='D:\你的Electron缓存目录'
npm run build
npx electron-builder --win nsis --x64 --config.directories.output='D:\你的构建输出目录'
```

准确的本次验证结果、待验证项目与限制见 [验收记录](docs/VALIDATION.md)；设计见 [架构](docs/ARCHITECTURE.md)、[安全说明](docs/SECURITY.md)。

## 本版边界

本版实现上述可运行路径，不应等同于所有教育学科能力均达到正式商用品质。未实现独立离线Windows Ink文字OCR、音素级发音评分、云STT/TTS多厂商凭据接入、常开麦克风自动打断、完整人体系统、生物过程库、自动手绘电路拓扑重建及独立思维导图编辑器。函数参数可连续拖动，尚无独立的AI参数动画编排器。

真实DeepSeek/Gemini AQ生成、视觉识别和真实AI连续教学需要有效服务密钥、网络与模型权限；本次环境未提供这些密钥。真实数位板压感/DPI/多显示器、麦克风准确率与用户安装向导应按人工测试矩阵签收。不得用本地计算器或协议测试替代这些正式验收。
