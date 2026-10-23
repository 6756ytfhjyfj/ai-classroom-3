# AI Classroom 3.0 架构与实施契约

## 技术路线

| 维度     | Electron（选用）                             | Tauri                           |
| -------- | -------------------------------------------- | ------------------------------- |
| 数位笔   | 固定 Chromium Pointer Events、压感与合并事件 | 依赖目标机器 WebView2 版本      |
| 原生桥接 | 小型白名单 IPC；后续可接 C#/Windows Ink      | Rust command；需要 Rust 工具链  |
| 资源     | 安装体积、内存更大；实测后报告               | 宿主体积较小                    |
| 维护     | Node/TS 共用后端与桌面工具链                 | Rust + TS + WebView2 三条维护面 |

Electron 的 Pointer Events 不是 Windows Ink 原生文字识别器。本版通过标准笔输入实现画布；云端 Gemini 视觉识别提供中文、公式、图示候选，必须经用户授权。浏览器/设备没有 STT 时明确不可用，可用键盘或手写；系统 TTS 使用已安装语音，不冒充云端自然语音。没有凭据时实验室、账号、草稿离线可用，AI 明确显示未配置。

## 模块与目录

```
electron/             窗口、安全 preload、DPAPI 设备凭证
src/components/       认证、课堂、设置、后台、语音与全屏手写
src/ink/              独立 Canvas 引擎，文档模型、坐标变换
src/labs/             可交互函数、电路、离子等渲染器
src/state/            Zustand + 明确状态机和输入协调
src/services/         API/SSE、语音、IndexedDB 崩溃草稿
server/               Fastify、认证、AI、配置加密、设备与审计
shared/               Zod 协议、Skill Registry、计算器
prisma/               SQLite/ PostgreSQL schema、迁移
tests/                真实数据库集成、计算器、状态与桌面 E2E
scripts/              初始化、打包、管理员初始化
docs/                 协议、安全、验收与限制
```

渲染器不接触 Node、文件系统或 AI 密钥；contextIsolation + sandbox + CSP；只暴露设备恢复、全屏、版本三个固定 IPC。API 密钥 AES-256-GCM 加密，主密钥留在服务端。密码 Argon2id；会话随机令牌仅保存散列，HttpOnly SameSite cookie；写请求校验 Origin；管理员权限在每个服务端路由校验。

## 数据模型

权威 Schema 为 `prisma/schema.prisma`，PostgreSQL 版本由 `scripts/postgres.mjs` 生成（包含迁移与并发触发器）。模型包括 User、Device、Installation、DeviceAccountBinding、AuthSession、Subject、Classroom、LearningSession、Conversation、Message、TeachingPlan、TeachingProgress、HandwritingDocument、HandwritingStroke、RecognitionResult、VoiceSessionMetadata、SkillDefinition、SkillExecution、VisualizationState、AIProviderConfig、SpeechProviderConfig、AdministratorAuditLog、SystemSettings、RecoveryRequest。结构化实验与笔迹使用版本化 JSON 文本持久化；核心归属通过外键约束。

## 设备、安装、账号

随机安装 UUID 不是设备身份。首次启动服务端签发 256-bit 设备恢复凭证，服务端仅存散列；桌面使用 Windows DPAPI 加密落盘，安装实例单独记录。浏览器开发模式凭证在本地存储，强度较低。无硬件序列号采集。卸载默认保留应用数据；手工清理或全新重装若丢失凭证，必须导入备份或申请管理员审核重绑定。无法从匿名客户端证明物理设备唯一性，不宣称绝对不可绕过。

注册事务先更新 Device 锁版本（PostgreSQL 行锁；SQLite 写锁），检查所有占用绑定，再创建用户与绑定。数据库触发器进一步阻止第四条占用绑定。冻结、注销、删除申请不释放名额；只有管理员明确审计重置才释放。已有用户登录与注册名额无关。密码恢复通过一次性离线恢复码或管理员审核，无邮箱要求。管理员初始化为本机 CLI 显式创建，无默认密码。

## Windows 手写

Canvas 引擎直接消费 pointerdown/move/up/cancel，捕获 pointer；使用 coalesced events、pressure、timestamp，CSS 坐标 → 视口逆变换 → 世界坐标；devicePixelRatio 只用于像素绘制。笔事件不 setState；requestAnimationFrame 增量绘制，文档提交时更新 UI。pointercancel 保存已完成轨迹、失焦安全收尾；触摸平移、笔优先。撤销/重做为文档命令，缩放与平移是独立视口。IndexedDB 按用户/课堂自动保存，服务端保存版本号；识别绑定笔迹修订号，旧候选不能替换新文档，永不自动清空/发送。进入手写立即取消推理、停止 TTS，退出恢复课堂位置。

## 课堂与语音状态

`IDLE → AI_THINKING → TOOL_EXECUTING / AI_SPEAKING / TEACHING`；任何学生输入可打断到 `AI_INTERRUPTED → HANDWRITING / VOICE_LISTENING / INPUT_REVIEW`；识别进入 `HANDWRITING_RECOGNIZING` 但画布继续可写；失败到 `ERROR_RECOVERY` 并保留文档。请求有 requestId + AbortSignal + 课堂 generation，换课与打断取消并忽略旧结果。麦克风只能由用户手势开启，开启前停止 TTS；STT partial/final 分开，结果可编辑且默认手动提交。getUserMedia 开启 echoCancellation/noiseSuppression/autoGainControl，系统识别器本身能力依平台；不承诺自动免唤醒打断。

## AI Adapter 与 Skill

AIProvider 暴露 generate/stream/callTools/cancel/testConnection/listModels。服务端使用官方兼容 SDK 适配 DeepSeek、Gemini；不校验 AQ/AIza 前缀。后台保存可编辑模型名，列表与一次真实生成分别检查可见性和推理权限。工具使用 SDK 有限步循环，Zod 校验输入输出、权限、当前学科、启用状态与版本。只允许注册的数值/结构工具，无 eval / 任意脚本。AI 实验修改采用 revision CAS，学生操作后过期工具调用拒绝，模型收到冲突继续解释。

## 通信协议

REST JSON `/api/auth/*`、`/api/device/*`、`/api/classrooms/*`、`/api/admin/*`；认证 Cookie。`POST /api/classrooms/:id/chat` 返回 SSE：`meta {requestId}`、`text {delta}`、`tool {id,input,output,revision}`、`done {messageId}`、`error {code,message}`；断开触发 AbortSignal；保留完整/中断文本。`PUT .../state` 使用 expectedVersion，冲突 409。手写输入带 `mode:text|ink|both`、确认文字与可选 PNG，外发前显式授权。历史含实验真实状态，下一轮系统上下文携带当前实验 JSON。

## 页面

欢迎/登录/注册/恢复 → 六学科课堂；左导航、中央实验与参数、右教师；历史抽屉、个人设置、主题；全屏白板、语音 review；`/admin` 独立权限页无学生入口。无数据时真实空状态，无预置学习记录。所有可点按钮有实际行为；尚未实现工具不展示为已完成。

## 分阶段验收

1. 真实 SQLite 迁移、注册/登录/权限/多账号隔离/第四账号拒绝/并发锁；PostgreSQL 需独立服务复验。
2. Canvas 鼠标轨迹、撤销/重做/清空/恢复、缩放；实机 Wacom/Gaomon/XP-Pen、DPI 和双屏人工矩阵。
3. 识别版本保护、原笔迹保留；真实 Gemini 图片识别需有效密钥和外发授权。
4. Provider 认证、流式与工具协议单测仅验证协议；真实 DeepSeek/Gemini AQ 连接不得由 fixture 代替验收。
5. 语音状态/取消单测；系统声音与真实麦克风人工测试。
6. 函数、MNA 电路、离子、电荷/方程计算单测；学生修改→上下文→AI 调用闭环需真实模型。
7. 配置只返回掩码、401/403、冻结/恢复/重置审计、速率限制。
8. Playwright 实际浏览器/桌面 UI 检查、暗色/窄窗/键盘；记录性能实测，不伪造指标。
9. 构建、Windows 解包运行冒烟与 NSIS 安装包；安装向导/真机语音/数位板独立人工签收。

技术参考（2026-10-24 核对）：https://ai.google.dev/gemini-api/docs/api-key 、https://ai.google.dev/api/generate-content 、https://api-docs.deepseek.com/api/create-chat-completion/ 、https://www.electronjs.org/docs/latest/tutorial/sandbox 。
