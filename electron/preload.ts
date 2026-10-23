import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  deviceRead: () => ipcRenderer.invoke("device:read"),
  deviceWrite: (data: { installationId: string; secret: string }) =>
    ipcRenderer.invoke("device:write", data),
  fullscreen: (enabled: boolean) =>
    ipcRenderer.invoke("window:fullscreen", enabled),
  speechStart: (language: string) =>
    ipcRenderer.invoke("speech:start", language),
  speechStop: () => ipcRenderer.invoke("speech:stop"),
  speechSubscribe: (callback: (event: unknown) => void) => {
    const listener = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on("speech:event", listener);
    return () => ipcRenderer.removeListener("speech:event", listener);
  },
  version: () => ipcRenderer.invoke("app:version"),
});
