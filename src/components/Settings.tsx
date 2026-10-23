import { useEffect, useState } from "react";
import type { PublicUser } from "../../shared/protocol";
import { api, json } from "../services/api";
import { bootstrapDevice, importDevice } from "../services/device";
import { clearUserDrafts } from "../services/drafts";
import { useClassroomUI } from "../state/classroom";
import { Modal, ErrorNotice, errorText, download } from "./ui";
export function Settings({
  user,
  onClose,
  onUser,
}: {
  user: PublicUser;
  onClose: () => void;
  onUser: (u: PublicUser) => void;
}) {
  const [name, setName] = useState(user.displayName),
    [avatar, setAvatar] = useState(user.avatar),
    [oldPassword, setOldPassword] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sessions, setSessions] = useState<
      { id: string; deviceId: string; expiresAt: string }[]
    >([]),
    [shortcuts, setShortcuts] = useState(
      () =>
        JSON.parse(user.preferences || "{}").shortcuts ?? {
          handwriting: "Ctrl+Shift+H",
          voice: "Ctrl+Shift+M",
        },
    );
  const rate = useClassroomUI((s) => s.rate),
    setRate = useClassroomUI((s) => s.setRate),
    volume = useClassroomUI((s) => s.volume),
    setVolume = useClassroomUI((s) => s.setVolume);
  useEffect(() => {
    api<{ sessions: typeof sessions }>("/account/sessions")
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(errorText(e)));
  }, []);
  async function save() {
    setError("");
    try {
      const r = await api<{ user: PublicUser }>("/account", {
        method: "PATCH",
        body: json({
          username: name,
          avatar,
          preferences: {
            ...JSON.parse(user.preferences),
            shortcuts,
            rate,
            volume,
          },
          ...(password ? { oldPassword, password } : {}),
        }),
      });
      onUser(r.user);
      setPassword("");
      setOldPassword("");
      setNotice("设置已保存");
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <Modal title="你的学习空间" onClose={onClose} wide>
      <div className="settings-grid">
        <section>
          <h3>个人资料</h3>
          <div className="avatar-options">
            {["✦", "☀", "☘", "☾", "Ω", "文"].map((a) => (
              <button
                key={a}
                className={avatar === a ? "active" : ""}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
          <label>
            用户名
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
            />
          </label>
          <label>
            原密码
            <input
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="修改密码时填写"
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 10 位；留空不修改"
            />
          </label>
          <h3>语音</h3>
          <label>
            语速 {rate.toFixed(1)}×
            <input
              type="range"
              min=".5"
              max="2"
              step=".1"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
          <label>
            音量 {Math.round(volume * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step=".1"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </label>
        </section>
        <section>
          <h3>快捷键</h3>
          {Object.entries(shortcuts as Record<string, string>).map(
            ([key, value]) => (
              <label key={key}>
                {key === "handwriting" ? "全屏手写" : "语音输入"}
                <input
                  readOnly
                  value={value}
                  onKeyDown={(e) => {
                    e.preventDefault();
                    if (["Control", "Shift", "Alt"].includes(e.key)) return;
                    if (!e.ctrlKey || !e.shiftKey) {
                      setError("请使用 Ctrl + Shift + 字母，避免与输入冲突");
                      return;
                    }
                    setError("");
                    setShortcuts({
                      ...shortcuts,
                      [key]: ["Ctrl", "Shift", e.key.toUpperCase()].join("+"),
                    });
                  }}
                />
              </label>
            ),
          )}
          <h3>设备恢复</h3>
          <p className="muted">
            备份凭证可在重装后恢复设备关联与名额。凭证等同设备身份证明，请妥善保管。
          </p>
          <button
            className="secondary full"
            onClick={async () => {
              try {
                const d = await bootstrapDevice();
                download(
                  "AI-Classroom-设备恢复凭证.json",
                  json({ secret: d.secret, deviceId: d.deviceId }),
                );
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            导出设备恢复凭证
          </button>
          <label>
            导入管理员签发或备份的凭证
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  await importDevice(JSON.parse(await f.text()).secret);
                  setNotice("设备凭证已更新，重新登录后生效");
                } catch (err) {
                  setError(errorText(err));
                }
              }}
            />
          </label>
          <h3>数据管理</h3>
          <button
            className="secondary full"
            onClick={() =>
              clearUserDrafts(user.id)
                .then(() =>
                  setNotice("此账号的本地手写草稿已清理；服务端课堂仍保留"),
                )
                .catch((e) => setError(errorText(e)))
            }
          >
            清理此账号的本地草稿
          </button>
          <button
            className="text-button danger"
            onClick={() => {
              if (
                !window.confirm(
                  "向管理员提交账号删除申请？审核后删除学习记录，设备名额按策略保留。",
                )
              )
                return;
              api("/account/delete-request", { method: "POST", body: "{}" })
                .then(() => setNotice("删除申请已提交，等待管理员审核"))
                .catch((e) => setError(errorText(e)));
            }}
          >
            申请删除账号
          </button>
        </section>
      </div>
      <details className="session-list">
        <summary>管理登录会话（{sessions.length}）</summary>
        {sessions.map((s) => (
          <div key={s.id}>
            <span>
              设备 {s.deviceId.slice(0, 8)} ·{" "}
              {new Date(s.expiresAt).toLocaleDateString()} 到期
            </span>
            <button
              className="text-button danger"
              onClick={() =>
                api(`/account/sessions/${s.id}`, { method: "DELETE" })
                  .then(() =>
                    setSessions((v) => v.filter((x) => x.id !== s.id)),
                  )
                  .catch((e) => setError(errorText(e)))
              }
            >
              撤销
            </button>
          </div>
        ))}
      </details>
      <ErrorNotice message={error} />
      {notice && <p className="success-notice">{notice}</p>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          关闭
        </button>
        <button className="primary" onClick={() => void save()}>
          保存设置
        </button>
      </div>
    </Modal>
  );
}
