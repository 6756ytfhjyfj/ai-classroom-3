import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Home,
  History,
  Plus,
  Settings as SettingsIcon,
  LogOut,
  Moon,
  Sun,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  BookOpen,
  Trash2,
  Sparkles,
  PenLine,
  AudioLines,
  ArrowRight,
} from "lucide-react";
import { Auth } from "./components/Auth";
import { Classroom } from "./components/Classroom";
import { Admin } from "./components/Admin";
import { AdminSetup } from "./components/AdminSetup";
import { Settings } from "./components/Settings";
import { Brand, Modal, ErrorNotice, errorText, Spinner } from "./components/ui";
import { api, json } from "./services/api";
import { teacherVoice } from "./services/speech";
import { useClassroomUI } from "./state/classroom";
import {
  subjects,
  type PublicUser,
  type ClassroomSummary,
  type SubjectId,
} from "../shared/protocol";
export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null),
    [loading, setLoading] = useState(true),
    [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]),
    [active, setActive] = useState<string | null>(null),
    [settings, setSettings] = useState(false),
    [history, setHistory] = useState(false),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false);
  const theme = useClassroomUI((s) => s.theme),
    setTheme = useClassroomUI((s) => s.setTheme),
    admin = location.pathname.startsWith("/admin");
  const refresh = () =>
    api<{ classrooms: ClassroomSummary[] }>("/classrooms")
      .then((r) => setClassrooms(r.classrooms))
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    api<{ user: PublicUser }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setLoading(false));
    const expired = () => {
      setUser(null);
      setActive(null);
      setError("登录已过期，请重新登录。");
      teacherVoice.stop();
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (user) {
      void refresh();
      const p = JSON.parse(user.preferences || "{}");
      useClassroomUI.getState().setRate(p.rate ?? 1);
      useClassroomUI.getState().setVolume(p.volume ?? 1);
    }
  }, [user?.id]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
    } catch {}
    teacherVoice.stop();
    setUser(null);
    setActive(null);
    setClassrooms([]);
  }
  async function create(subjectId: SubjectId) {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const s = subjects.find((s) => s.id === subjectId)!;
      const c = await api<ClassroomSummary>("/classrooms", {
        method: "POST",
        body: json({ subjectId, title: s.name + " · 新的探索", mode: "qa" }),
      });
      await refresh();
      setActive(c.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setCreating(false);
    }
  }
  async function subject(subjectId: SubjectId) {
    const prior = classrooms.find((c) => c.subjectId === subjectId);
    if (prior) setActive(prior.id);
    else await create(subjectId);
  }
  if (location.pathname === "/admin/setup") return <AdminSetup />;
  if (loading)
    return (
      <div className="app-loading">
        <Brand />
        <Spinner />
      </div>
    );
  if (!user) return <Auth onLogin={setUser} admin={admin} />;
  if (admin) return <Admin user={user} onLogout={() => void logout()} />;
  const selected = classrooms.find((c) => c.id === active)?.subjectId;
  return (
    <div className={"app-shell " + (collapsed ? "sidebar-collapsed" : "")}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand small />
          <button
            className="collapse-button"
            aria-label={collapsed ? "展开导航" : "收起导航"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav>
          <button
            className={"nav-item " + (!active ? "active" : "")}
            onClick={() => setActive(null)}
          >
            <Home size={18} />
            <span>学习空间</span>
          </button>
          <button className="nav-item" onClick={() => setHistory(true)}>
            <History size={18} />
            <span>学习记录</span>
            <small>{classrooms.length}</small>
          </button>
          <div className="nav-section-label">
            我的学科 <span>SUBJECTS</span>
          </div>
          {subjects.map((s) => (
            <button
              className={"subject-nav " + (selected === s.id ? "active" : "")}
              key={s.id}
              onClick={() => void subject(s.id)}
              title={s.name}
            >
              <span
                className="subject-symbol"
                style={{ color: s.color, background: s.color + "16" }}
              >
                {s.icon}
              </span>
              <span>{s.name}</span>
              {selected === s.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="new-course-card">
            <span>
              <Sparkles size={18} />
            </span>
            <b>新的好奇，新的课堂。</b>
            <p>每一次提问，都是成长的开始。</p>
            <button
              onClick={() => {
                if (selected) void create(selected);
                else setActive(null);
              }}
            >
              <Plus size={15} />
              开启新课堂
            </button>
          </div>
          <div className="sidebar-utility">
            <button title="个人设置" onClick={() => setSettings(true)}>
              <SettingsIcon size={17} />
              <span>设置</span>
            </button>
            <button
              title={theme === "light" ? "切换深色模式" : "切换浅色模式"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
          <div className="user-profile">
            <button
              className="user-profile-main"
              onClick={() => setSettings(true)}
            >
              <span className="user-avatar">{user.avatar}</span>
              <span>
                <b>{user.displayName}</b>
                <small>保持好奇，持续生长</small>
              </span>
            </button>
            <button
              className="logout-button"
              title="退出登录"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
            </button>
          </div>
          <span className="sidebar-version">
            AI CLASSROOM <b>3.0</b>
          </span>
        </div>
      </aside>
      <div className="main-area">
        {active ? (
          <Classroom
            key={active}
            id={active}
            user={user}
            onUpdated={() => void refresh()}
          />
        ) : (
          <motion.main
            className="home-page"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <header className="home-header">
              <span className="breadcrumb">你的专属学习空间</span>
              <span className="today-date">
                {new Date().toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                  timeZone: "Asia/Shanghai",
                })}
              </span>
            </header>
            <div className="home-intro">
              <div>
                <span className="eyebrow">STAY CURIOUS. GO FURTHER.</span>
                <h1>
                  {user.displayName}，<br />
                  今天想<span>探索什么？</span>
                </h1>
                <p>
                  不止听懂，更要亲手发现。选择一间教室，
                  <br />
                  和你的 AI 老师一起，让抽象的知识变得具体。
                </p>
              </div>
              <div className="home-visual" aria-hidden="true">
                <svg viewBox="0 0 350 260">
                  <path d="M25 200H320 M110 240V25" stroke="var(--border)" />
                  <path
                    d="M30 80Q180 350 310 35"
                    fill="none"
                    stroke="#8e9ae9"
                    strokeWidth="2.5"
                  />
                  <ellipse
                    cx="210"
                    cy="110"
                    rx="100"
                    ry="39"
                    fill="none"
                    stroke="#b2c8bf"
                    transform="rotate(-38 210 110)"
                  />
                  <circle cx="210" cy="110" r="8" fill="#a0bcb0" />
                  <circle cx="271" cy="45" r="5" fill="#c7b397" />
                  <text
                    x="205"
                    y="231"
                    fontSize="26"
                    fill="#aab1d5"
                    fontFamily="Georgia"
                    fontStyle="italic"
                  >
                    ƒ(x)
                  </text>
                </svg>
                <span>从一个问题，打开一个世界。</span>
              </div>
            </div>
            <ErrorNotice message={error} />
            <div className="home-section-heading">
              <h2>
                六间教室，无限可能。<small>CHOOSE YOUR CLASSROOM</small>
              </h2>
              <span>
                为每一种好奇，找到方向 <ArrowUpRight size={15} />
              </span>
            </div>
            <div className="subject-grid">
              {subjects.map((s, i) => (
                <motion.button
                  className="subject-card"
                  style={{ "--card-color": s.color } as React.CSSProperties}
                  key={s.id}
                  onClick={() => void subject(s.id)}
                  disabled={creating}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.035, duration: 0.2 }}
                >
                  <span className="subject-card-top">
                    <span className="subject-card-icon">{s.icon}</span>
                    <ArrowUpRight size={19} />
                  </span>
                  <h3>
                    {s.name}
                    <small>{s.en}</small>
                  </h3>
                  <p>{s.topic}</p>
                  <span className="subject-card-footer">
                    {classrooms.some((c) => c.subjectId === s.id)
                      ? "继续探索"
                      : "进入教室"}
                    <ArrowRight size={14} />
                  </span>
                </motion.button>
              ))}
            </div>
            <div className="home-lower">
              <div className="recent-courses">
                <div className="home-section-heading">
                  <h2>接着上次的发现</h2>
                  <button
                    className="text-button"
                    onClick={() => setHistory(true)}
                  >
                    全部记录 <ArrowUpRight size={14} />
                  </button>
                </div>
                {classrooms.length ? (
                  classrooms.slice(0, 3).map((c) => (
                    <button
                      className="recent-course"
                      key={c.id}
                      onClick={() => setActive(c.id)}
                    >
                      <span className="recent-course-icon">
                        {subjects.find((s) => s.id === c.subjectId)?.icon}
                      </span>
                      <div>
                        <b>{c.title}</b>
                        <small>
                          {new Date(c.updatedAt).toLocaleString("zh-CN", {
                            timeZone: "Asia/Shanghai",
                          })}
                        </small>
                      </div>
                      <ArrowUpRight size={17} />
                    </button>
                  ))
                ) : (
                  <div className="history-empty">
                    <BookOpen size={24} />
                    <div>
                      <b>第一堂课，正等着你。</b>
                      <p>选择喜欢的学科，学习记录会自动保存在这里。</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="input-tip">
                <div>
                  <PenLine size={22} />
                  <AudioLines size={22} />
                </div>
                <h3>思考，不必拘于键盘。</h3>
                <p>
                  全屏写下公式，开口补充疑问。
                  <br />
                  让最自然的表达，成为学习的开始。
                </p>
                <span>
                  <kbd>Ctrl Shift H</kbd>全屏手写
                </span>
              </div>
            </div>
            <footer className="home-footer">
              <span className="status-dot" />
              你的每一次探索，都值得被记住。
              <span>AI Classroom 3.0 · Windows</span>
            </footer>
          </motion.main>
        )}
      </div>
      {settings && (
        <Settings
          user={user}
          onClose={() => setSettings(false)}
          onUser={setUser}
        />
      )}
      {history && (
        <Modal title="学习记录" onClose={() => setHistory(false)} wide>
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="搜索课堂"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索主题或学科…"
            />
          </div>
          <div className="history-list">
            {classrooms
              .filter((c) =>
                (
                  c.title + subjects.find((s) => s.id === c.subjectId)?.name
                ).includes(search),
              )
              .map((c) => (
                <div className="history-row" key={c.id}>
                  <button
                    onClick={() => {
                      setActive(c.id);
                      setHistory(false);
                    }}
                  >
                    <span className="recent-course-icon">
                      {subjects.find((s) => s.id === c.subjectId)?.icon}
                    </span>
                    <span>
                      <b>{c.title}</b>
                      <small>{new Date(c.updatedAt).toLocaleString()}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={"删除课堂 " + c.title}
                    onClick={() => {
                      if (!confirm("永久删除此课堂、聊天与服务端手写草稿？"))
                        return;
                      api(`/classrooms/${c.id}`, { method: "DELETE" })
                        .then(() => {
                          if (active === c.id) setActive(null);
                          void refresh();
                        })
                        .catch((e) => setError(errorText(e)));
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            {!classrooms.length && (
              <p className="muted">还没有课堂，选择一门学科开始。</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
