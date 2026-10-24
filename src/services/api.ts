import type { StreamEvent, ProviderTestEvent } from "../../shared/protocol";
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
  return (await apiResponse(path, options)).json();
}
export async function apiResponse(path: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      ...options,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      "NETWORK_ERROR",
      "无法连接 ONclasstime 服务器，连接可能已中断。请检查网络后重试；此错误不代表 API 密钥无效。",
      0,
    );
  }
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
    throw new ApiError(
      error.code ?? "SERVER_ERROR",
      error.message ?? `服务器返回 ${response.status}，请稍后重试`,
      response.status,
    );
  }
  return response;
}
export const json = (value: unknown) => JSON.stringify(value);
export async function readSSE<T = StreamEvent>(
  response: Response,
  onEvent: (e: T) => void,
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
export async function testProviderConnection(
  id: string,
  onProgress: (message: string) => void,
) {
  const response = await apiResponse(
    "/admin/providers/" + encodeURIComponent(id) + "/test/stream",
    { method: "POST", body: "{}" },
  );
  let result: Extract<ProviderTestEvent, { type: "result" }> | undefined;
  let failure: ApiError | undefined;
  try {
    await readSSE<ProviderTestEvent>(response, (event) => {
      if (event.type === "progress") onProgress(event.message);
      else if (event.type === "result") result = event;
      else failure = new ApiError(event.code, event.message, 502);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "NETWORK_ERROR",
      "测试连接在返回完整结果前中断，尚未确认成功。请检查网络后重试。",
      0,
    );
  }
  if (failure) throw failure;
  if (!result)
    throw new ApiError(
      "INCOMPLETE_TEST",
      "测试未返回完整结果，尚未确认成功，请重试。",
      502,
    );
  return result;
}
