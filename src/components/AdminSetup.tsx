import { useEffect, useState, type FormEvent } from "react";
import { api, json } from "../services/api";
import { Brand, ErrorNotice, errorText } from "./ui";
export function AdminSetup() {
  const [token] = useState(() => location.hash.slice(1)),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    history.replaceState({}, "", "/setup");
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    setBusy(true);
    try {
      await api<{ user: unknown }>("/setup/admin", {
        method: "POST",
        body: json({ username, password, bootstrapToken: token }),
      });
      location.href = "/";
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setup-page">
      <div className="setup-card">
        <Brand />
        <h1>初始化管理员</h1>
        <p>
          使用部署所有者提供的一次性初始化链接创建首位管理员。没有默认密码，请设置自己的用户名与密码。
        </p>
        <form onSubmit={submit}>
          <label>
            管理员用户名
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
              maxLength={24}
              autoComplete="username"
            />
          </label>
          <label>
            管理员密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
          </label>
          <label>
            确认密码
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
          </label>
          <ErrorNotice message={error} />
          <button className="primary full" disabled={busy || !token}>
            创建管理员并进入后台
          </button>
        </form>
        {!token && (
          <p className="warning-text">
            请使用部署所有者保管的一次性初始化链接。管理功能仅在独立管理网站提供。
          </p>
        )}
      </div>
    </div>
  );
}
