import type { StreamEvent } from "../../shared/protocol";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ code: "NETWORK_ERROR", message: "网络请求失败" }));
    if (
      response.status === 401 &&
      path !== "/auth/me" &&
      path !== "/auth/login"
    )
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(error.code, error.message, response.status);
  }
  return response.json();
}
export const json = (value: unknown) => JSON.stringify(value);
export async function readSSE(
  response: Response,
  onEvent: (e: StreamEvent) => void,
) {
  if (!response.ok) {
    const e = await response.json();
    throw new ApiError(e.code, e.message, response.status);
  }
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const part = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const line = part
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("\n");
        if (line) onEvent(JSON.parse(line));
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
