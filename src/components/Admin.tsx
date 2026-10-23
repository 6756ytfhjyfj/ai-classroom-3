import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Settings2,
  Users,
  KeyRound,
  FlaskConical,
  Monitor,
  ScrollText,
  AudioLines,
  Check,
  Play,
  RefreshCw,
} from "lucide-react";
import type { PublicUser } from "../../shared/protocol";
import { subjects } from "../../shared/protocol";
import { api, json } from "../services/api";
import { Brand, ErrorNotice, errorText, Spinner, download } from "./ui";
interface Config {
  id: string;
  model: string;
  baseUrl: string;
  subjectMap: string;
  enabled: boolean;
  vision: boolean;
  timeoutMs: number;
  hasKey: boolean;
}
interface UserRow {
  id: string;
  displayName: string;
  role: string;
  status: string;
  bindings: { deviceId: string; slot: number | null }[];
}
interface DeviceRow {
  id: string;
  status: string;
  bindings: {
    id: string;
    user: { displayName: string };
    slot: number | null;
    bindingStatus: string;
  }[];
  installations: { id: string }[];
}
interface RequestRow {
  id: string;
  type: string;
  detail: string;
  status: string;
  createdAt: string;
}
export function Admin({
  user,
  onLogout,
}: {
  user: PublicUser;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState("providers"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [configs, setConfigs] = useState<Config[]>([]),
    [which, setWhich] = useState("gemini"),
    [key, setKey] = useState(""),
    [model, setModel] = useState(""),
    [baseUrl, setBaseUrl] = useState(
      "https://generativelanguage.googleapis.com/v1beta",
    ),
    [enabled, setEnabled] = useState(true),
    [vision, setVision] = useState(true),
    [mapping, setMapping] = useState<string[]>(["*"]),
    [timeout, setTimeoutValue] = useState(60000),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState<string[]>([]),
    [users, setUsers] = useState<UserRow[]>([]),
    [devices, setDevices] = useState<DeviceRow[]>([]),
    [logs, setLogs] = useState<
      {
        id: string;
        action: string;
        targetId: string;
        detail: string;
        createdAt: string;
      }[]
    >([]),
    [requests, setRequests] = useState<RequestRow[]>([]),
    [skills, setSkills] = useState<
      {
        id: string;
        name: string;
        enabled: boolean;
        inputSchema: unknown;
        outputSchema: unknown;
        subject: string;
      }[]
    >([]),
    [speech, setSpeech] = useState({
      stt: "system",
      tts: "system",
      language: "zh-CN",
      rate: 1,
      autoInterrupt: false,
      recognizer: "vision",
    }),
    [stats, setStats] = useState<Record<string, number>>({}),
    [testInput, setTestInput] = useState("{}");
  async function task(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const [p, u, d, l, r, s, sp, st] = await Promise.all([
      api<{ providers: Config[] }>("/admin/providers"),
      api<{ users: UserRow[] }>("/admin/users"),
      api<{ devices: DeviceRow[] }>("/admin/devices"),
      api<{ logs: typeof logs }>("/admin/audit"),
      api<{ requests: RequestRow[] }>("/admin/requests"),
      api<{ skills: typeof skills }>("/admin/skills"),
      api<{ config: string }>("/admin/speech"),
      api<Record<string, number>>("/admin/overview"),
    ]);
    setConfigs(p.providers);
    setUsers(u.users);
    setDevices(d.devices);
    setLogs(l.logs);
    setRequests(r.requests);
    setSkills(s.skills);
    setSpeech(JSON.parse(sp.config));
    setStats(st);
  }
  useEffect(() => {
    void task(refresh);
  }, []);
  useEffect(() => {
    const c = configs.find((c) => c.id === which);
    setKey("");
    setModel(c?.model ?? "");
    setBaseUrl(
      c?.baseUrl ??
        (which === "gemini"
          ? "https://generativelanguage.googleapis.com/v1beta"
          : "https://api.deepseek.com"),
    );
    setEnabled(c?.enabled ?? true);
    setVision(c?.vision ?? which === "gemini");
    setMapping(c ? JSON.parse(c.subjectMap) : ["*"]);
    setTimeoutValue(c?.timeoutMs ?? 60000);
    setModels([]);
  }, [which, configs]);
  if (user.role !== "ADMIN")
    return (
      <main className="access-denied">
        <ShieldCheck size={40} />
        <h1>需要管理员权限</h1>
        <p>此账号没有访问管理控制台的权限。</p>
        <a className="primary" href="/">
          返回学习空间
        </a>
      </main>
    );
  const tabs = [
    { id: "providers", title: "AI 模型服务", Icon: KeyRound },
    { id: "speech", title: "语音与识别", Icon: AudioLines },
    { id: "skills", title: "教学 Skill", Icon: FlaskConical },
    { id: "users", title: "用户管理", Icon: Users },
    { id: "devices", title: "设备与注册名额", Icon: Monitor },
    { id: "requests", title: "恢复与删除审核", Icon: Settings2 },
    { id: "audit", title: "安全审计", Icon: ScrollText },
  ];
  return (
    <main className="admin-shell">
      <aside className="admin-nav">
        <Brand small />
        <span className="eyebrow">ADMINISTRATION</span>
        <h3>系统管理</h3>
        {tabs.map(({ id, title, Icon }) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setTab(id);
              setError("");
              setNotice("");
            }}
          >
            <Icon size={17} />
            {title}
          </button>
        ))}
        <div className="admin-nav-bottom">
          <a href="/">
            <ArrowLeft size={15} />
            返回课堂
          </a>
          <button onClick={onLogout}>退出管理员</button>
        </div>
      </aside>
      <section className="admin-content">
        <header>
          <div>
            <span className="eyebrow">AI CLASSROOM / CONTROL CENTER</span>
            <h1>{tabs.find((t) => t.id === tab)?.title}</h1>
          </div>
          <button className="secondary" onClick={() => void task(refresh)}>
            <RefreshCw size={15} />
            刷新
          </button>
        </header>
        <div className="admin-stats">
          {Object.entries({
            users: "账号",
            devices: "设备",
            messages: "消息",
            executions: "工具执行",
          }).map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>{stats[key] ?? "—"}</strong>
            </div>
          ))}
        </div>
        <ErrorNotice message={error} />
        {notice && <p className="success-notice">{notice}</p>}
        {busy && (
          <div className="admin-busy">
            <Spinner />
            处理中…
          </div>
        )}
        {tab === "providers" && (
          <div className="admin-card">
            <div className="segmented provider-tabs">
              <button
                className={which === "gemini" ? "selected" : ""}
                onClick={() => setWhich("gemini")}
              >
                Google Gemini
              </button>
              <button
                className={which === "deepseek" ? "selected" : ""}
                onClick={() => setWhich("deepseek")}
              >
                DeepSeek
              </button>
            </div>
            <h2>
              {which === "gemini"
                ? "Gemini · Authorization Key"
                : "DeepSeek · API 配置"}
            </h2>
            <p className="muted">
              {which === "gemini"
                ? "直接接受 AQ 等格式密钥；使用 x-goog-api-key 认证，不根据前缀判断有效性。"
                : "自定义模型与地址。地址必须由服务端 AI_ALLOWED_HOSTS 允许。"}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void task(async () => {
                  await api("/admin/providers/" + which, {
                    method: "PUT",
                    body: json({
                      ...(key ? { key } : {}),
                      model,
                      baseUrl,
                      enabled,
                      vision,
                      subjects: mapping,
                      timeoutMs: timeout,
                    }),
                  });
                  await refresh();
                  setNotice("配置已加密保存，请执行真实连接测试。");
                });
              }}
            >
              <label>
                服务端密钥
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={
                    configs.some((c) => c.id === which)
                      ? "•••••••• 已加密保存；留空保留当前密钥"
                      : "输入服务密钥（支持 AQ）"
                  }
                />
              </label>
              <div className="form-two">
                <label>
                  API Base URL
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    required
                  />
                </label>
                <label>
                  请求超时 (ms)
                  <input
                    type="number"
                    min="5000"
                    max="180000"
                    value={timeout}
                    onChange={(e) => setTimeoutValue(Number(e.target.value))}
                  />
                </label>
              </div>
              <label>
                模型标识
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  list="provider-models"
                  placeholder="输入管理员选定的模型 ID"
                  required
                />
                <datalist id="provider-models">
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <div className="form-row">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  启用服务
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={vision}
                    onChange={(e) => setVision(e.target.checked)}
                  />
                  所选模型支持图片（手写识别）
                </label>
              </div>
              <label>学科路由（精确学科优先，* 为默认）</label>
              <div className="subject-checks">
                {[{ id: "*", name: "默认全部" }, ...subjects].map((s) => (
                  <label key={s.id} className="check">
                    <input
                      type="checkbox"
                      checked={mapping.includes(s.id)}
                      onChange={(e) =>
                        setMapping(
                          e.target.checked
                            ? [...mapping, s.id]
                            : mapping.filter((v) => v !== s.id),
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      const r = await api<{ models: string[] }>(
                        "/admin/providers/" + which + "/models",
                      );
                      setModels(r.models);
                      setNotice(
                        `读取到 ${r.models.length} 个模型，可在模型标识输入框选择。`,
                      );
                    })
                  }
                >
                  读取模型列表
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      const r = await api<{
                        reply: string;
                        elapsedMs: number;
                        model: string;
                      }>("/admin/providers/" + which + "/test", {
                        method: "POST",
                        body: "{}",
                      });
                      setNotice(
                        `真实连接成功 · ${r.model} · ${r.elapsedMs} ms · ${r.reply}`,
                      );
                    })
                  }
                >
                  <Play size={15} />
                  真实连接测试
                </button>
                <button className="primary" disabled={busy}>
                  <Check size={15} />
                  保存配置
                </button>
              </div>
            </form>
          </div>
        )}
        {tab === "speech" && (
          <div className="admin-card">
            <h2>系统语音与多模态识别</h2>
            <p className="muted">
              桌面版 STT 使用 Windows 已安装语言包；TTS
              使用系统语音。识别不可用会明确提示，不以模拟成功回退。自动语音打断当前关闭，使用点击
              / 快捷键打断。
            </p>
            <label>
              默认语言
              <select
                value={speech.language}
                onChange={(e) =>
                  setSpeech({ ...speech, language: e.target.value })
                }
              >
                <option value="zh-CN">普通话</option>
                <option value="en-US">English</option>
              </select>
            </label>
            <label>
              默认语速 {speech.rate}×
              <input
                type="range"
                min=".5"
                max="2"
                step=".1"
                value={speech.rate}
                onChange={(e) =>
                  setSpeech({ ...speech, rate: Number(e.target.value) })
                }
              />
            </label>
            <p>手写引擎：配置的视觉模型（须在 AI 服务中启用图片能力）</p>
            <button
              className="primary"
              onClick={() =>
                void task(async () => {
                  await api("/admin/speech", {
                    method: "PUT",
                    body: json(speech),
                  });
                  setNotice("语音默认设置已保存");
                })
              }
            >
              保存设置
            </button>
          </div>
        )}
        {tab === "skills" && (
          <div className="admin-card">
            <p className="muted">
              参数和输出均经过 Schema
              校验；工具仅限当前学科。测试会运行计算器，不修改学生课堂。
            </p>
            <label>
              工具测试输入 (JSON)
              <textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                rows={4}
              />
            </label>
            {skills.map((s) => (
              <div className="skill-admin-row" key={s.id}>
                <div>
                  <b>{s.name}</b>
                  <small>
                    {s.id} · {s.subject}
                  </small>
                  <details>
                    <summary>输入 / 输出 Schema</summary>
                    <pre>
                      {json({ input: s.inputSchema, output: s.outputSchema })}
                    </pre>
                  </details>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) =>
                      void task(async () => {
                        await api("/admin/skills/" + s.id, {
                          method: "PATCH",
                          body: json({ enabled: e.target.checked }),
                        });
                        await refresh();
                      })
                    }
                  />
                  启用
                </label>
                <button
                  className="secondary"
                  onClick={() =>
                    void task(async () => {
                      const r = await api("/admin/skills/" + s.id + "/test", {
                        method: "POST",
                        body: json(JSON.parse(testInput)),
                      });
                      setNotice(json(r));
                    })
                  }
                >
                  运行测试
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === "users" && (
          <div className="admin-card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>角色 / 状态</th>
                  <th>设备绑定</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.displayName}
                      <small>{u.id.slice(0, 8)}</small>
                    </td>
                    <td>
                      {u.role} · {u.status}
                    </td>
                    <td>
                      {u.bindings.length} 个（占用{" "}
                      {u.bindings.filter((b) => b.slot !== null).length}）
                    </td>
                    <td>
                      <button
                        className="secondary"
                        disabled={u.id === user.id || u.status === "DELETED"}
                        onClick={() =>
                          void task(async () => {
                            await api("/admin/users/" + u.id, {
                              method: "PATCH",
                              body: json({
                                status:
                                  u.status === "ACTIVE" ? "FROZEN" : "ACTIVE",
                              }),
                            });
                            await refresh();
                          })
                        }
                      >
                        {u.status === "ACTIVE" ? "冻结" : "解除冻结"}
                      </button>
                      <button
                        className="text-button"
                        disabled={u.status === "DELETED"}
                        onClick={() => {
                          const reason = prompt(
                            "核验申请人身份后填写恢复原因（至少10字）；会撤销其会话：",
                          );
                          if (!reason) return;
                          void task(async () => {
                            const r = await api<{ recoveryCode: string }>(
                              "/admin/users/" + u.id + "/recovery",
                              { method: "POST", body: json({ reason }) },
                            );
                            setNotice(
                              "一次性账号恢复码，请通过安全渠道交给申请人：" +
                                r.recoveryCode,
                            );
                          });
                        }}
                      >
                        签发恢复码
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "devices" && (
          <div className="admin-card">
            <button
              className="secondary"
              onClick={() => {
                const reason = prompt("填写新设备准入原因（至少10字）：");
                if (!reason) return;
                void task(async () => {
                  const r = await api<{ secret: string; deviceId: string }>(
                    "/admin/devices",
                    { method: "POST", body: json({ reason }) },
                  );
                  download("AI-Classroom-设备准入凭证.json", json(r));
                  await refresh();
                  setNotice(
                    "新设备凭证已导出；请通过安全渠道交给学生导入，不要重复签发替代重绑定。",
                  );
                });
              }}
            >
              审核并签发新设备凭证
            </button>
            <p className="muted">
              设备凭证是隐私友好的随机身份，不能证明物理硬件唯一性。重绑定会撤销该设备会话，重置名额会保留审计。
            </p>
            {devices.map((d) => (
              <div className="device-admin-row" key={d.id}>
                <b>设备 {d.id}</b>
                <p>
                  {d.bindings.filter((b) => b.slot !== null).length} / 3 名额 ·{" "}
                  {d.installations.length} 安装实例
                </p>
                <div className="binding-chips">
                  {d.bindings.map((b) => (
                    <span key={b.id}>
                      {b.user.displayName} · {b.slot ?? "已释放"}
                    </span>
                  ))}
                </div>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      const reason = prompt(
                        "审核后填写重绑定原因（至少10字）。此操作撤销旧凭证与会话。",
                      );
                      if (!reason) return;
                      void task(async () => {
                        const r = await api<{ secret: string; notice: string }>(
                          "/admin/devices/" + d.id + "/rebind",
                          { method: "POST", body: json({ reason }) },
                        );
                        setNotice(r.notice + "：" + r.secret);
                        await refresh();
                      });
                    }}
                  >
                    审核并签发重绑定凭证
                  </button>
                  <button
                    className="danger secondary"
                    onClick={() => {
                      const confirmDeviceId = prompt(
                        "确认重置注册名额，请完整输入设备 ID：\n" + d.id,
                      );
                      if (!confirmDeviceId) return;
                      const reason = prompt("填写重置原因（至少10字）：");
                      if (!reason) return;
                      void task(async () => {
                        await api("/admin/devices/" + d.id + "/reset", {
                          method: "POST",
                          body: json({ confirmDeviceId, reason }),
                        });
                        await refresh();
                        setNotice("设备名额已重置；历史绑定和审计已保留");
                      });
                    }}
                  >
                    重置设备名额
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "requests" && (
          <div className="admin-card">
            {!requests.length ? (
              <p className="muted">暂时没有审核申请。</p>
            ) : (
              requests.map((r) => (
                <div className="request-admin-row" key={r.id}>
                  <b>
                    {r.type} · {r.status}
                  </b>
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                  <p>{r.detail}</p>
                  {r.status === "PENDING" && (
                    <div className="modal-actions">
                      {(
                        [
                          "RESOLVED",
                          "REJECTED",
                          ...(r.type === "DELETE_ACCOUNT"
                            ? ["DELETE_DATA"]
                            : []),
                        ] as const
                      ).map((action) => (
                        <button
                          className={
                            action === "DELETE_DATA"
                              ? "secondary danger"
                              : "secondary"
                          }
                          key={action}
                          onClick={() => {
                            if (
                              action === "DELETE_DATA" &&
                              !confirm(
                                "永久删除该用户全部课堂并匿名化账号，设备名额保留。确认已核验申请人？",
                              )
                            )
                              return;
                            const reason = prompt(
                              "填写处理说明（至少5字）；恢复/重绑定请先在设备页处理：",
                            );
                            if (!reason) return;
                            void task(async () => {
                              await api(
                                "/admin/requests/" + r.id + "/resolve",
                                {
                                  method: "POST",
                                  body: json({ action, reason }),
                                },
                              );
                              await refresh();
                              setNotice("申请处理已记录");
                            });
                          }}
                        >
                          {action === "RESOLVED"
                            ? "记录已处理"
                            : action === "REJECTED"
                              ? "拒绝申请"
                              : "执行账号删除"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        {tab === "audit" && (
          <div className="admin-card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作</th>
                  <th>目标 / 详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.createdAt).toLocaleString()}</td>
                    <td>{l.action}</td>
                    <td>
                      <small>{l.targetId}</small>
                      <pre>{l.detail}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
