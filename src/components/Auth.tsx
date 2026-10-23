import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  PenLine,
  AudioLines,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, json } from "../services/api";
import {
  bootstrapDevice,
  importDevice,
  type DeviceInfo,
} from "../services/device";
import type { PublicUser } from "../../shared/protocol";
import { Brand, ErrorNotice, Spinner, errorText, download } from "./ui";
export function Auth({
  onLogin,
  admin = false,
}: {
  onLogin: (u: PublicUser) => void;
  admin?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login"),
    [device, setDevice] = useState<DeviceInfo | null>(null),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remember, setRemember] = useState(false),
    [recovery, setRecovery] = useState(""),
    [newCode, setNewCode] = useState(""),
    [pendingUser, setPendingUser] = useState<PublicUser | null>(null),
    [request, setRequest] = useState(false),
    [detail, setDetail] = useState("");
  useEffect(() => {
    bootstrapDevice()
      .then(setDevice)
      .catch((e) => setError(errorText(e)));
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!device) return;
    if (mode === "register" && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "recover") {
        const r = await api<{ recoveryCode: string }>("/auth/recover", {
          method: "POST",
          body: json({ username, password, recoveryCode: recovery }),
        });
        setNewCode(r.recoveryCode);
        setMode("login");
        setPassword("");
      } else {
        const r = await api<{ user: PublicUser; recoveryCode?: string }>(
          "/auth/" + mode,
          {
            method: "POST",
            body: json({ username, password, secret: device.secret, remember }),
          },
        );
        if (r.recoveryCode) {
          setNewCode(r.recoveryCode);
          setPendingUser(r.user);
        } else onLogin(r.user);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-art">
        <Brand />
        <div className="auth-intro">
          <span className="eyebrow">A NEW WAY TO UNDERSTAND</span>
          <h1>
            每一个「为什么」
            <br />
            都有<span>看得见的答案。</span>
          </h1>
          <p>
            写下灵感，说出疑问，亲手探索。
            <br />
            你的专属 AI 教师，陪你把知识变成理解。
          </p>
        </div>
        <div className="orbit-illustration" aria-hidden="true">
          <svg viewBox="0 0 600 330">
            <defs>
              <linearGradient id="authg" x1="0" x2="1">
                <stop stopColor="#aab4ff" />
                <stop offset="1" stopColor="#6978f0" />
              </linearGradient>
            </defs>
            <path
              d="M40 245H560 M140 300V40"
              stroke="#d8dcf1"
              strokeWidth="1"
            />
            <path
              d="M30 70 Q250 455 550 65"
              fill="none"
              stroke="url(#authg)"
              strokeWidth="3"
            />
            <ellipse
              cx="325"
              cy="166"
              rx="154"
              ry="55"
              fill="none"
              stroke="#c7cfeb"
              strokeDasharray="5 7"
              transform="rotate(-28 325 166)"
            />
            <circle cx="325" cy="166" r="9" fill="#7d8cf2" />
            <circle cx="425" cy="82" r="6" fill="#accdbd" />
            <circle cx="219" cy="220" r="5" fill="#e3bc8d" />
            <text
              x="412"
              y="270"
              fill="#8d98c1"
              fontSize="27"
              fontFamily="Georgia"
              fontStyle="italic"
            >
              y = ax²
            </text>
            <text x="92" y="65" fill="#a6afcb" fontSize="20">
              ƒ(x)
            </text>
          </svg>
          <span className="floating-note">
            <PenLine size={17} /> 让思考跃然纸上
          </span>
          <span className="floating-note second">
            <Sparkles size={17} /> 从好奇，到理解
          </span>
        </div>
        <div className="auth-features">
          <span>
            <PenLine size={17} />
            全屏手写
          </span>
          <span>
            <AudioLines size={17} />
            语音互动
          </span>
          <span>
            <Sparkles size={17} />
            交互实验
          </span>
        </div>
        <small className="auth-foot">
          AI CLASSROOM 3.0 <span>专为 Windows 数位笔而设计</span>
        </small>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <span className="pill">
            <span className="status-dot" />{" "}
            {admin ? "管理员认证" : "你的学习空间，准备好了"}
          </span>
          <AnimatePresence mode="wait">
            <motion.div
              key={mode + String(!!newCode)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {newCode ? (
                <>
                  <h2>请保存你的恢复码</h2>
                  <p className="muted">
                    没有邮箱或手机号时，这是重置密码的凭证。只在此处显示一次。
                  </p>
                  <code className="recovery-code">{newCode}</code>
                  <button
                    className="secondary full"
                    onClick={() =>
                      download(
                        "AI-Classroom-账号恢复码.txt",
                        newCode,
                        "text/plain",
                      )
                    }
                  >
                    保存恢复码到文件
                  </button>
                  <button
                    className="primary full"
                    onClick={() => {
                      setNewCode("");
                      if (pendingUser) onLogin(pendingUser);
                    }}
                  >
                    我已妥善保存 <ArrowRight size={17} />
                  </button>
                </>
              ) : (
                <>
                  <h2>
                    {mode === "register"
                      ? "开启你的探索之旅"
                      : mode === "recover"
                        ? "找回学习空间"
                        : "欢迎回来。"}
                  </h2>
                  <p className="muted">
                    {mode === "register"
                      ? "一个账号，收藏每一次思考与发现。"
                      : mode === "recover"
                        ? "使用注册时保存的恢复码重置密码。"
                        : "继续你的好奇，接着上次的发现。"}
                  </p>
                  {!admin && mode !== "recover" && (
                    <div className="segmented auth-tabs">
                      <button
                        className={mode === "login" ? "selected" : ""}
                        onClick={() => {
                          setMode("login");
                          setError("");
                        }}
                      >
                        登录
                      </button>
                      <button
                        className={mode === "register" ? "selected" : ""}
                        onClick={() => {
                          setMode("register");
                          setError("");
                        }}
                      >
                        注册账号
                      </button>
                    </div>
                  )}
                  {mode === "login" && !!device?.accounts.length && (
                    <div className="account-chips">
                      {device.accounts.map((a) => (
                        <button
                          key={a.username}
                          onClick={() => {
                            setUsername(a.username);
                            setPassword("");
                          }}
                        >
                          <span>{a.avatar}</span>
                          {a.username}
                        </button>
                      ))}
                    </div>
                  )}
                  <form onSubmit={submit}>
                    <label>
                      用户名
                      <input
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        minLength={2}
                        maxLength={24}
                        placeholder="输入你的用户名"
                        required
                      />
                    </label>
                    <label>
                      {mode === "recover" ? "新密码" : "密码"}
                      <span className="password-input">
                        <input
                          type={visible ? "text" : "password"}
                          autoComplete={
                            mode === "login"
                              ? "current-password"
                              : "new-password"
                          }
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength={10}
                          maxLength={128}
                          placeholder="至少 10 个字符"
                          required
                        />
                        <button
                          type="button"
                          aria-label={visible ? "隐藏密码" : "显示密码"}
                          onClick={() => setVisible((v) => !v)}
                        >
                          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </span>
                    </label>
                    {mode === "register" && (
                      <>
                        <div className="strength">
                          <span
                            style={{
                              width:
                                (password.length >= 14 &&
                                /[^a-zA-Z0-9]/.test(password)
                                  ? 100
                                  : password.length >= 10
                                    ? 66
                                    : password.length
                                      ? 33
                                      : 0) + "%",
                            }}
                          />
                        </div>
                        <small className="muted">
                          建议使用较长的密码短语，混合字母、数字与符号。
                        </small>
                        <label>
                          确认密码
                          <input
                            type={visible ? "text" : "password"}
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            minLength={10}
                          />
                        </label>
                      </>
                    )}
                    {mode === "recover" && (
                      <label>
                        账号恢复码
                        <input
                          value={recovery}
                          onChange={(e) => setRecovery(e.target.value)}
                          required
                          placeholder="注册时保存的恢复码"
                        />
                      </label>
                    )}
                    {mode === "login" && (
                      <div className="form-row">
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                          />
                          保持登录
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setMode("recover")}
                        >
                          忘记密码
                        </button>
                      </div>
                    )}
                    <ErrorNotice message={error} />
                    {mode === "register" && device?.used === 3 ? (
                      <div className="quota-notice">
                        <ShieldCheck size={22} />
                        <p>此设备已达到最多 3 个注册账号的限制。</p>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setMode("login")}
                        >
                          登录已有账号
                        </button>
                      </div>
                    ) : (
                      <button
                        className="primary full"
                        disabled={busy || !device}
                      >
                        {busy ? (
                          <Spinner />
                        ) : (
                          <>
                            {mode === "register"
                              ? "创建学习账号"
                              : mode === "recover"
                                ? "重置密码"
                                : "进入学习空间"}
                            <ArrowRight size={18} />
                          </>
                        )}
                      </button>
                    )}
                  </form>
                  {mode === "recover" && (
                    <button
                      className="text-button back"
                      onClick={() => setMode("login")}
                    >
                      <ArrowLeft size={15} />
                      返回登录
                    </button>
                  )}
                  <div className="device-note">
                    <ShieldCheck size={16} />
                    <span>
                      此设备已使用 {device?.used ?? "—"} / 3 个注册名额
                      <br />
                      <small>账号与学习数据独立保存，退出不会释放名额。</small>
                    </span>
                  </div>
                  <button
                    className="text-button muted"
                    onClick={() => setRequest((v) => !v)}
                  >
                    申请账号恢复 / 设备重绑定
                  </button>
                  {request && (
                    <div className="request-form">
                      <textarea
                        value={detail}
                        onChange={(e) => setDetail(e.target.value)}
                        placeholder="说明用户名、设备恢复需求与可联系信息（至少10字，勿填写密码）"
                      />
                      <button
                        className="secondary"
                        disabled={detail.length < 10}
                        onClick={() =>
                          api("/recovery/request", {
                            method: "POST",
                            body: json({
                              type: mode === "recover" ? "PASSWORD" : "DEVICE",
                              detail,
                            }),
                          })
                            .then(() => {
                              setDetail("");
                              setError("申请已提交，请联系管理员核实身份。");
                            })
                            .catch((e) => setError(errorText(e)))
                        }
                      >
                        提交审核申请
                      </button>
                    </div>
                  )}
                  {!device && (
                    <label className="import-proof">
                      导入设备恢复凭证
                      <input
                        type="file"
                        accept=".json,.txt"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const content = await f.text();
                            let secret = content.trim();
                            try {
                              secret = JSON.parse(content).secret;
                            } catch {}
                            setDevice(await importDevice(secret));
                            setError("");
                          } catch (err) {
                            setError(errorText(err));
                          }
                        }}
                      />
                    </label>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <p className="privacy-line">
            本地草稿默认留在设备。云端识别与图片提交需单独授权。
          </p>
        </div>
      </div>
    </main>
  );
}
