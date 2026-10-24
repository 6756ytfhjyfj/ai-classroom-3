import { afterEach, describe, it, expect, vi } from "vitest";
import { AIProvider, providerError } from "../server/providers";
import { encrypt } from "../server/security";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Provider 错误协议分类（不替代真实密钥验收）", () => {
  it("Google 400密钥错误应分类认证失败并隐藏原始内容", () => {
    const e = providerError({
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          message: "API key not valid. confidential-value",
          details: [{ reason: "API_KEY_INVALID" }],
        },
      }),
    });
    expect(e.code).toBe("PROVIDER_AUTH_FAILED");
    expect(e.message).not.toContain("confidential-value");
  });
  it("认证失败和权限不足分别反馈", () => {
    expect(providerError({ statusCode: 401 }).code).toBe(
      "PROVIDER_AUTH_FAILED",
    );
    expect(providerError({ statusCode: 403 }).code).toBe("PROVIDER_FORBIDDEN");
  });
  it("配额与超时可安全重试", () => {
    expect(providerError({ statusCode: 429 }).code).toBe("PROVIDER_RATE_LIMIT");
    expect(providerError({ name: "TimeoutError" }).status).toBe(504);
  });
  it("服务繁忙、模型不存在和嵌套网络错误分别反馈且不泄露上游内容", () => {
    expect(
      providerError({
        statusCode: 503,
        responseBody: '{"error":{"message":"high demand secret-value"}}',
      }).code,
    ).toBe("PROVIDER_UNAVAILABLE");
    expect(
      providerError({
        statusCode: 503,
        responseBody: '{"error":{"message":"secret-value"}}',
      }).message,
    ).not.toContain("secret-value");
    expect(providerError({ statusCode: 404 }).code).toBe(
      "PROVIDER_MODEL_NOT_FOUND",
    );
    expect(providerError({ cause: { code: "UND_ERR_SOCKET" } }).code).toBe(
      "PROVIDER_NETWORK_ERROR",
    );
    expect(providerError({ cause: { name: "TimeoutError" } }).code).toBe(
      "PROVIDER_TIMEOUT",
    );
  });
  it("Interactions 使用官方地址、AQ 请求头和不保留状态，503 不伪报成功", async () => {
    vi.stubEnv("GEMINI_API_MODE", "interactions");
    const key = "AQ-format-protocol-test";
    const request = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            error: { code: 503, message: "high demand", status: "UNAVAILABLE" },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", request);
    const p = new AIProvider({
      id: "gemini",
      model: "configured-model",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      encryptedKey: encrypt(key),
      enabled: true,
      subjectMap: '["*"]',
      vision: true,
      timeoutMs: 5000,
      updatedAt: new Date(),
    });
    let failure: unknown;
    try {
      await p.generate({
        system: "test",
        messages: [{ role: "user", content: "OK?" }],
      });
    } catch (error) {
      failure = error;
    }
    expect(providerError(failure).code).toBe("PROVIDER_UNAVAILABLE");
    expect(String(request.mock.calls[0][0])).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    const init = request.mock.calls[0][1]!;
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(key);
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "configured-model",
      store: false,
    });
    expect(String(request.mock.calls[0][0])).not.toContain(key);
  });
  it("SDK 静默关闭超时流时仍报告超时，而非空响应", async () => {
    vi.stubEnv("GEMINI_API_MODE", "interactions");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method !== "POST") return new Response("{}");
        return new Promise<Response>((_, reject) => {
          const signal = init.signal!;
          if (signal.aborted) reject(signal.reason);
          else
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
        });
      }),
    );
    const p = new AIProvider({
      id: "gemini",
      model: "configured-model",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      encryptedKey: encrypt("AQ-format-only"),
      enabled: true,
      subjectMap: '["*"]',
      vision: true,
      timeoutMs: 30,
      updatedAt: new Date(),
    });
    let failure: unknown;
    try {
      await p.testConnection();
    } catch (error) {
      failure = error;
    }
    expect(providerError(failure).code).toBe("PROVIDER_TIMEOUT");
  });
});
