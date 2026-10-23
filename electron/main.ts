import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  utilityProcess,
  session,
  dialog,
} from "electron";
import type { UtilityProcess, IpcMainInvokeEvent } from "electron";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import net from "node:net";
let win: BrowserWindow | null = null,
  server: UtilityProcess | null = null,
  recognizer: ChildProcess | null = null,
  baseURL = "";
const root = app.getAppPath();
function verify(event: IpcMainInvokeEvent) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame?.origin !== baseURL
  )
    throw new Error("Untrusted IPC sender");
}
async function safeRead(name: string) {
  const path = join(app.getPath("userData"), name);
  return existsSync(path)
    ? JSON.parse(
        (await safeStorage.decryptStringAsync(readFileSync(path))).result,
      )
    : null;
}
async function safeWrite(name: string, value: unknown) {
  if (!(await safeStorage.isAsyncEncryptionAvailable()))
    throw new Error("Windows DPAPI 不可用");
  writeFileSync(
    join(app.getPath("userData"), name),
    await safeStorage.encryptStringAsync(JSON.stringify(value)),
  );
}
async function port(preferred = 0) {
  return new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(preferred, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}
async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await app.whenReady();
  app.on("second-instance", () => {
    win?.show();
    win?.focus();
  });
  if (process.env.CLASSROOM_USER_DATA)
    app.setPath("userData", process.env.CLASSROOM_USER_DATA);
  const dataDir = app.getPath("userData");
  mkdirSync(dataDir, { recursive: true });
  const remote = process.env.CLASSROOM_SERVER_URL;
  const bootstrapToken = process.argv.includes("--initialize-admin")
    ? randomBytes(32).toString("base64url")
    : undefined;
  if (remote) {
    const u = new URL(remote);
    if (u.protocol !== "https:") throw new Error("集中服务端必须使用 HTTPS");
    baseURL = u.origin;
  } else {
    const config = (await safeRead("server-key.bin")) ?? {
      key: randomBytes(32).toString("base64"),
      port: await port(),
    };
    await safeWrite("server-key.bin", config);
    const dbPath = join(dataDir, "classroom.db");
    const sqlite = new DatabaseSync(dbPath);
    sqlite.exec("PRAGMA foreign_keys=ON;");
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS _desktop_migrations (name TEXT PRIMARY KEY)",
    );
    const migrations = join(
      app.isPackaged ? process.resourcesPath : root,
      "prisma",
      "migrations",
    );
    for (const name of readdirSync(migrations)
      .filter((n) => /^\d/.test(n))
      .sort()) {
      if (
        !sqlite
          .prepare("SELECT name FROM _desktop_migrations WHERE name=?")
          .get(name)
      ) {
        const sql = readFileSync(
          join(migrations, name, "migration.sql"),
          "utf8",
        );
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          sqlite.exec(sql);
          sqlite
            .prepare("INSERT INTO _desktop_migrations (name) VALUES (?)")
            .run(name);
          sqlite.exec("COMMIT");
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      }
    }
    sqlite.close();
    const p = await port(config.port);
    baseURL = `http://127.0.0.1:${p}`;
    server = utilityProcess.fork(join(root, "dist-server", "index.cjs"), [], {
      cwd: dataDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "file:" + dbPath.replace(/\\/g, "/"),
        ENCRYPTION_KEY: config.key,
        PORT: String(p),
        HOST: "127.0.0.1",
        APP_ORIGIN: baseURL,
        CLASSROOM_STATIC_DIR: join(root, "dist"),
        ...(bootstrapToken
          ? { CLASSROOM_BOOTSTRAP_TOKEN: bootstrapToken }
          : {}),
      },
      stdio: "pipe",
    });
    server.stderr?.on("data", (chunk) =>
      writeFileSync(join(dataDir, "last-server-error.log"), chunk),
    );
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(baseURL + "/api/health");
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready)
      throw new Error(
        "本地服务启动失败，请查看应用数据目录 last-server-error.log",
      );
  }
  win = new BrowserWindow({
    width: 1530,
    height: 980,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#f6f7fb",
    title: "AI Classroom",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(root, "dist-electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win!, {
      type: "question",
      title: "保留当前学习内容",
      message:
        "当前有未提交内容。文字与手写草稿会保留在此设备，尚未同步的实验参数可能需要重试。",
      buttons: ["返回课堂", "保留草稿并退出"],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (new URL(url).origin !== baseURL) e.preventDefault();
  });
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(
        contents === win?.webContents &&
          new URL(contents.getURL()).origin === baseURL &&
          ["media", "fullscreen"].includes(permission),
      ),
  );
  ipcMain.handle("device:read", (event) => {
    verify(event);
    return safeRead("device.bin");
  });
  ipcMain.handle("device:write", async (event, data) => {
    verify(event);
    if (
      !data ||
      typeof data.secret !== "string" ||
      data.secret.length < 32 ||
      data.secret.length > 200 ||
      !/^[-\w]{36}$/.test(data.installationId)
    )
      throw new Error("Invalid device proof");
    await safeWrite("device.bin", data);
    return true;
  });
  ipcMain.handle("window:fullscreen", (event, enabled) => {
    verify(event);
    win?.setFullScreen(enabled === true);
    return true;
  });
  ipcMain.handle("app:version", (event) => {
    verify(event);
    return app.getVersion();
  });
  ipcMain.handle("speech:start", (event, language) => {
    verify(event);
    if (!["zh-CN", "en-US"].includes(language))
      throw new Error("Unsupported language");
    recognizer?.kill();
    const path = join(
      app.isPackaged ? process.resourcesPath : root,
      "electron",
      "native-speech.ps1",
    );
    recognizer = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path,
        "-Language",
        language,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const child = recognizer;
    let buffer = "";
    recognizer.stdout?.setEncoding("utf8");
    recognizer.stdout?.on("data", (chunk: string) => {
      if (recognizer !== child) return;
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        try {
          win?.webContents.send("speech:event", JSON.parse(line));
        } catch {}
      }
    });
    recognizer.on("error", () =>
      win?.webContents.send("speech:event", {
        type: "error",
        message: "Windows 本地语音引擎启动失败",
      }),
    );
    recognizer.on("exit", () => {
      if (recognizer === child) {
        recognizer = null;
        win?.webContents.send("speech:event", { type: "end" });
      }
    });
    return true;
  });
  ipcMain.handle("speech:stop", (event) => {
    verify(event);
    recognizer?.kill();
    recognizer = null;
    return true;
  });
  await win.loadURL(
    baseURL +
      (bootstrapToken && !remote
        ? "/admin/setup#" + bootstrapToken
        : process.argv.includes("--admin")
          ? "/admin"
          : ""),
  );
  win.on("closed", () => {
    recognizer?.kill();
    server?.kill();
    win = null;
    app.quit();
  });
}
main().catch((e) => {
  dialog.showErrorBox(
    "AI Classroom 启动失败",
    e instanceof Error ? e.message : String(e),
  );
  app.quit();
});
app.on("window-all-closed", () => app.quit());
