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
import { db } from "./db";
import { AppError, decrypt, validateProviderUrl } from "./security";

export interface GenerationInput {
  system: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  signal?: AbortSignal;
}
export class AIProvider {
  private controllers = new Set<AbortController>();
  constructor(public config: AIProviderConfig) {}
  private get key() {
    return decrypt(this.config.encryptedKey);
  }
  private model() {
    const baseURL = validateProviderUrl(this.config.baseUrl);
    return this.config.id === "gemini"
      ? createGoogleGenerativeAI({ apiKey: this.key, baseURL })(
          this.config.model.replace(/^models\//, ""),
        )
      : createDeepSeek({ apiKey: this.key, baseURL })(this.config.model);
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
      abortSignal: this.signal(input.signal),
      maxRetries: 0,
    });
  }
  stream(input: GenerationInput) {
    return streamText({
      model: this.model(),
      system: input.system,
      messages: input.messages,
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
    if (!res.ok) throw providerError({ statusCode: res.status });
    const data = (await res.json()) as {
      models?: { name: string }[];
      data?: { id: string }[];
    };
    return this.config.id === "gemini"
      ? (data.models ?? []).map((m) => m.name.replace(/^models\//, ""))
      : (data.data ?? []).map((m) => m.id);
  }
  async testConnection() {
    const started = performance.now();
    const result = await this.generate({
      system: "Connection test. Reply OK only.",
      messages: [{ role: "user", content: "OK?" }],
    });
    if (!result.text.trim())
      throw new AppError(
        502,
        "EMPTY_RESPONSE",
        "服务已连接但未生成文本，请检查模型能力",
      );
    return {
      ok: true,
      model: this.config.model,
      elapsedMs: Math.round(performance.now() - started),
      reply: result.text.slice(0, 100),
    };
  }
}
export function providerError(e: unknown) {
  if (e instanceof AppError) return e;
  const p = e as { statusCode?: number; name?: string; responseBody?: string };
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
  if (p.name === "TimeoutError")
    return new AppError(504, "PROVIDER_TIMEOUT", "模型请求超时，可安全重试");
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
