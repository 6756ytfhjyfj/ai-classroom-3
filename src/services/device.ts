import { api, json } from "./api";
export interface DeviceInfo {
  secret: string;
  deviceId: string;
  used: number;
  limit: number;
  accounts: { username: string; avatar: string }[];
}
export async function bootstrapDevice(): Promise<DeviceInfo> {
  const stored = window.desktop
    ? await window.desktop.deviceRead()
    : JSON.parse(localStorage.getItem("classroom-device") ?? "null");
  const installationId = stored?.installationId ?? crypto.randomUUID();
  const data = await api<DeviceInfo>("/device/bootstrap", {
    method: "POST",
    body: json({ installationId, secret: stored?.secret }),
  });
  const proof = { installationId, secret: data.secret };
  if (window.desktop) await window.desktop.deviceWrite(proof);
  else localStorage.setItem("classroom-device", json(proof));
  return data;
}
export async function importDevice(secret: string) {
  const proof = { installationId: crypto.randomUUID(), secret };
  if (window.desktop) await window.desktop.deviceWrite(proof);
  else localStorage.setItem("classroom-device", json(proof));
  return bootstrapDevice();
}
