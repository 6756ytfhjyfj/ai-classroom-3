import { describe, it, expect } from "vitest";
import { providerError } from "../server/providers";
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
});
