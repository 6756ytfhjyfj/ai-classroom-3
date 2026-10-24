import {
  generateText,
  streamText,
  ToolLoopAgent,
  isStepCount,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { AIProviderConfig } from "@prisma/client";
import { db } from "./db.js";
import { AppError, decrypt, validateProviderUrl } from "./security.js";

export interface GenerationInput {
  system: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  signal?: AbortSignal;
}
export class AIProvider {
  private controllers = new Set<AbortController>();
  constructor(public config: AIProviderConfig) {}
  get apiMode() {
    return this.config.id === "gemini" &&
      process.env.GEMINI_API_MODE === "interactions"
      ? "interactions"
      : "content";
  }
  private get providerOptions() {
    // Keep classroom history in our database; do not enable Google's
    // default server-side interaction retention.
    return this.apiMode === "interactions"
      ? { google: { store: false } }
      : undefined;
  }
  private get key() {
    return decrypt(this.config.encryptedKey);
  }
  private model() {
    const baseURL = validateProviderUrl(this.config.baseUrl);
    if (this.config.id !== "gemini")
      return createDeepSeek({ apiKey: this.key, baseURL })(this.config.model);
    const google = createGoogleGenerativeAI({ apiKey: this.key, baseURL });
    const model = this.config.model.replace(/^models\//, "");
    return this.apiMode === "interactions"
      ? google.interactions(model)
      : google(model);
  }
  private signal(signal?: AbortSignal) {
    return AbortSignal.any([
      AbortSignal.timeout(this.config.timeoutMs),
      ...(signal ? [signal] : []),
    ]);
  }
  generate(input: GenerationInput) {
    return generateText({
      model: this.model(),
      system: input.system,
      messages: input.messages,
      providerOptions: this.providerOptions,
      abortSignal: this.signal(input.signal),
      maxRetries: 0,
    });
  }
  stream(input: GenerationInput) {
    return streamText({
      model: this.model(),
      system: input.system,
      messages: input.messages,
      providerOptions: this.providerOptions,
      abortSignal: this.signal(input.signal),
      maxRetries: 0,
    });
  }
  async callTools(input: GenerationInput) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const agent = new ToolLoopAgent({
      model: this.model(),
      instructions: input.system,
      tools: input.tools ?? {},
      providerOptions: this.providerOptions,
      stopWhen: isStepCount(5),
      maxRetries: 0,
    });
    const result = await agent.stream({
      messages: input.messages,
      abortSignal: AbortSignal.any([
        this.signal(input.signal),
        controller.signal,
      ]),
    });
    Promise.resolve(result.text)
      .finally(() => this.controllers.delete(controller))
      .catch(() => undefined);
    return result;
  }
  cancel() {
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
  }
  async listModels() {
    const url = validateProviderUrl(this.config.baseUrl) + "/models";
    const headers: Record<string, string> =
      this.config.id === "gemini"
        ? { "x-goog-api-key": this.key }
        : { Authorization: `Bearer ${this.key}` };
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!res.ok)
      throw providerError({
        statusCode: res.status,
        responseBody: await res.text(),
      });
    const data = (await res.json()) as {
      models?: { name: string }[];
      data?: { id: string }[];
    };
    return this.config.id === "gemini"
      ? (data.models ?? []).map((m) => m.name.replace(/^models\//, ""))
      : (data.data ?? []).map((m) => m.id);
  }
  async testConnection(
    signal?: AbortSignal,
    progress?: (message: string) => void,
  ) {
    const started = performance.now();
    if (this.config.id === "gemini") {
      progress?.("正在验证 Google 认证与模型是否可访问…");
      const url =
        validateProviderUrl(this.config.baseUrl) +
        "/models/" +
        this.config.model.replace(/^models\//, "");
      const response = await fetch(url, {
        headers: { "x-goog-api-key": this.key },
        signal: AbortSignal.any([
          AbortSignal.timeout(15000),
          ...(signal ? [signal] : []),
        ]),
        redirect: "error",
      });
      if (!response.ok)
        throw providerError({
          statusCode: response.status,
          responseBody: await response.text(),
        });
      await response.body?.cancel();
    }
    progress?.(
      this.config.id === "gemini"
        ? "认证与模型检查通过，正在等待模型真实生成回复…"
        : "正在验证认证并等待模型真实生成回复…",
    );
    let streamError: unknown;
    const requestSignal = this.signal(signal);
    const result = streamText({
      model: this.model(),
      system: "Connection test. Reply OK only.",
      messages: [{ role: "user", content: "OK?" }],
      providerOptions:
        this.apiMode === "interactions"
          ? { google: { store: false, thinkingLevel: "low" } }
          : this.providerOptions,
      abortSignal: requestSignal,
      maxRetries: 0,
      onError: ({ error }) => {
        streamError = error;
      },
    });
    let text = "";
    try {
      for await (const delta of result.textStream) text += delta;
    } catch (e) {
      throw streamError ?? e;
    }
    // The SDK can close a stream normally on cancellation without calling
    // onError. Preserve the timeout/cancellation instead of reporting empty text.
    requestSignal.throwIfAborted();
    if (streamError) throw streamError;
    if (!text.trim())
      throw new AppError(
        502,
        "EMPTY_RESPONSE",
        "服务已连接但未生成文本，请检查模型能力",
      );
    return {
      ok: true,
      model: this.config.model,
      elapsedMs: Math.round(performance.now() - started),
      reply: text.slice(0, 100),
      apiMode: this.apiMode,
    };
  }
}
export function providerError(e: unknown, depth = 0): AppError {
  if (e instanceof AppError) return e;
  const p = (e ?? {}) as {
    statusCode?: number;
    name?: string;
    responseBody?: string;
    code?: string;
    cause?: unknown;
  };
  let reason = "";
  try {
    const body = JSON.parse(p.responseBody ?? "{}");
    reason =
      JSON.stringify(body.error?.details ?? []) +
      " " +
      String(body.error?.status ?? "") +
      " " +
      String(body.error?.message ?? "");
  } catch {}
  if (
    p.statusCode === 401 ||
    /API_KEY_(INVALID|EXPIRED)|UNAUTHENTICATED|api key.*(?:invalid|expired|revoked)/i.test(
      reason,
    )
  )
    return new AppError(
      502,
      "PROVIDER_AUTH_FAILED",
      "模型认证失败：请检查密钥是否有效或已撤销；AQ 密钥无需修改前缀",
    );
  if (
    p.statusCode === 403 ||
    /API_KEY_SERVICE_BLOCKED|PERMISSION_DENIED/.test(reason)
  )
    return new AppError(
      502,
      "PROVIDER_FORBIDDEN",
      "模型权限不足：检查密钥绑定的服务账号、API 和模型权限",
    );
  if (p.statusCode === 429)
    return new AppError(
      503,
      "PROVIDER_RATE_LIMIT",
      "模型配额或速率受限，请稍后重试",
    );
  if (p.statusCode === 404)
    return new AppError(
      502,
      "PROVIDER_MODEL_NOT_FOUND",
      "找不到此模型或接口，请读取模型列表并检查模型标识与 API 地址",
    );
  if (
    p.statusCode === 503 ||
    /UNAVAILABLE|high demand|overloaded/i.test(reason)
  )
    return new AppError(
      503,
      "PROVIDER_UNAVAILABLE",
      "Google / 模型服务当前繁忙或暂时不可用，请稍后重试；这不表示密钥无效",
    );
  if (p.statusCode === 408 || p.statusCode === 504 || p.name === "TimeoutError")
    return new AppError(
      504,
      "PROVIDER_TIMEOUT",
      "模型生成超时，未确认生成成功。服务可能繁忙，可稍后重试或在后台调大请求超时",
    );
  if (p.cause && depth < 3) {
    const cause = providerError(p.cause, depth + 1);
    if (["PROVIDER_TIMEOUT", "PROVIDER_NETWORK_ERROR"].includes(cause.code))
      return cause;
  }
  if (
    p.name === "TypeError" ||
    /^(UND_ERR_|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)/.test(p.code ?? "")
  )
    return new AppError(
      502,
      "PROVIDER_NETWORK_ERROR",
      "服务器到模型服务的网络连接中断，请稍后重试；无需修改密钥前缀",
    );
  return new AppError(
    502,
    "PROVIDER_FAILED",
    "模型调用失败，请检查模型名称、地址、网络与服务权限",
  );
}
export async function providerFor(subject: string, vision = false) {
  const configs = await db.aIProviderConfig.findMany({
    where: { enabled: true },
  });
  const config =
    configs.find(
      (c) =>
        (!vision || c.vision) && JSON.parse(c.subjectMap).includes(subject),
    ) ??
    configs.find(
      (c) => (!vision || c.vision) && JSON.parse(c.subjectMap).includes("*"),
    );
  if (!config)
    throw new AppError(
      503,
      "AI_NOT_CONFIGURED",
      vision
        ? "尚未配置支持图片的模型，请联系管理员配置 Gemini 或视觉模型"
        : "AI 教师尚未配置。请由管理员配置 DeepSeek / Gemini 后使用；实验与手写草稿仍可使用。",
    );
  return new AIProvider(config);
}
