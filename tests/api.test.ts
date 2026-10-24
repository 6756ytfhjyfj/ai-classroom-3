import { afterEach, describe, expect, it, vi } from "vitest";
import { api, testProviderConnection } from "../src/services/api";
afterEach(() => vi.unstubAllGlobals());
describe("连接测试错误协议（不替代真实模型验收）", () => {
  it("浏览器 fetch 断开得到可理解的网络错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(api("/admin/providers")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });
  it("SSE 心跳和分片解析保留上游繁忙错误", async () => {
    const text =
      ': heartbeat\n\ndata: {"type":"progress","message":"正在验证认证"}\n\ndata: {"type":"error","code":"PROVIDER_UNAVAILABLE","message":"模型服务当前繁忙"}\n\n';
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7)
          c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    const progress = vi.fn();
    await expect(
      testProviderConnection("gemini", progress),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(progress).toHaveBeenCalledWith("正在验证认证");
  });
  it("仅完成认证或连接中断均不能视为真实生成成功", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('data: {"type":"progress","message":"认证已通过"}\n\n'),
        ),
    );
    await expect(
      testProviderConnection("gemini", () => {}),
    ).rejects.toMatchObject({ code: "INCOMPLETE_TEST" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              c.error(new TypeError("terminated"));
            },
          }),
        ),
      ),
    );
    await expect(
      testProviderConnection("gemini", () => {}),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
