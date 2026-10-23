import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tool, type ToolSet, type ModelMessage } from "ai";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { AppError } from "./security.js";
import { providerFor, providerError } from "./providers.js";
import {
  subjectId,
  initialLab,
  labSchema,
  inkSchema,
  type StreamEvent,
  type SubjectId,
} from "../shared/protocol.js";
import { skillRegistry, executeSkill } from "../shared/skills.js";
export const activeRequests = new Map<string, AbortController>();
async function owned(id: string, userId: string) {
  const c = await db.classroom.findFirst({ where: { id, userId } });
  if (!c) throw new AppError(404, "CLASSROOM_NOT_FOUND", "找不到这个课堂");
  return c;
}
const image = z
  .string()
  .max(8_000_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
export async function classroomRoutes(app: FastifyInstance) {
  app.get("/api/classrooms", { preHandler: authenticate }, async (req) => ({
    classrooms: await db.classroom.findMany({
      where: { userId: req.account.id },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  }));
  app.post("/api/classrooms", { preHandler: authenticate }, async (req) => {
    const p = z
      .object({
        subjectId,
        title: z.string().min(1).max(100),
        mode: z.enum(["qa", "teach"]).default("qa"),
      })
      .parse(req.body);
    const c = await db.classroom.create({
      data: {
        userId: req.account.id,
        ...p,
        conversation: { create: {} },
        visualization: {
          create: { data: JSON.stringify(initialLab(p.subjectId)) },
        },
        sessions: { create: {} },
      },
    });
    return c;
  });
  app.get("/api/classrooms/:id", { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    await owned(id, req.account.id);
    return db.classroom.findUnique({
      where: { id },
      include: {
        conversation: {
          include: { messages: { orderBy: { createdAt: "asc" }, take: 300 } },
        },
        visualization: true,
        handwriting: true,
        plans: true,
        progress: true,
      },
    });
  });
  app.patch(
    "/api/classrooms/:id",
    { preHandler: authenticate },
    async (req) => {
      const { id } = req.params as { id: string };
      await owned(id, req.account.id);
      const p = z
        .object({
          title: z.string().min(1).max(100).optional(),
          mode: z.enum(["qa", "teach"]).optional(),
        })
        .parse(req.body);
      return db.classroom.update({ where: { id }, data: p });
    },
  );
  app.delete(
    "/api/classrooms/:id",
    { preHandler: authenticate },
    async (req) => {
      const { id } = req.params as { id: string };
      await owned(id, req.account.id);
      activeRequests.get(id)?.abort();
      await db.classroom.delete({ where: { id } });
      return { ok: true };
    },
  );
  app.put(
    "/api/classrooms/:id/state",
    { preHandler: authenticate },
    async (req) => {
      const { id } = req.params as { id: string };
      await owned(id, req.account.id);
      const p = z
        .object({
          state: labSchema,
          expectedVersion: z.number().int().nonnegative(),
        })
        .parse(req.body);
      const updated = await db.visualizationState.updateMany({
        where: { classroomId: id, revision: p.expectedVersion },
        data: { data: JSON.stringify(p.state), revision: { increment: 1 } },
      });
      if (!updated.count)
        throw new AppError(
          409,
          "STATE_CONFLICT",
          "实验已更新，请重新载入后再操作",
        );
      await db.classroom.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      return { revision: p.expectedVersion + 1 };
    },
  );
  app.put(
    "/api/classrooms/:id/ink",
    { preHandler: authenticate },
    async (req) => {
      const { id } = req.params as { id: string };
      await owned(id, req.account.id);
      const p = z
        .object({
          document: inkSchema,
          expectedVersion: z.number().int().min(-1),
        })
        .parse(req.body);
      return db.$transaction(async (tx) => {
        const old = await tx.handwritingDocument.findUnique({
          where: { classroomId: id },
        });
        if ((old?.revision ?? -1) !== p.expectedVersion)
          throw new AppError(
            409,
            "INK_CONFLICT",
            "另一窗口已保存草稿；本地草稿保留，请重新打开课堂",
          );
        const data = {
          data: JSON.stringify(p.document),
          revision: (old?.revision ?? -1) + 1,
        };
        return old
          ? tx.handwritingDocument.update({ where: { id: old.id }, data })
          : tx.handwritingDocument.create({
              data: { classroomId: id, ...data },
            });
      });
    },
  );
  app.post(
    "/api/classrooms/:id/cancel",
    { preHandler: authenticate },
    async (req) => {
      const { id } = req.params as { id: string };
      await owned(id, req.account.id);
      activeRequests.get(id)?.abort();
      return { ok: true };
    },
  );
  app.post(
    "/api/classrooms/:id/recognize",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = await owned(id, req.account.id);
      const p = z
        .object({
          image,
          revision: z.number().int(),
          kind: z.enum(["auto", "text", "math", "diagram"]),
          consent: z.literal(true),
        })
        .parse(req.body);
      const provider = await providerFor(c.subjectId, true);
      const controller = new AbortController();
      req.raw.on("aborted", () => controller.abort());
      try {
        const r = await provider.generate({
          system:
            '你是谨慎的手写识别器。保留简体中文、英文、数字、LaTeX公式。区分文字、公式、图形。不要解答，不补造不可辨认内容，使用[不清楚]。仅输出JSON: {"text":"候选文字或LaTeX","kind":"text|math|diagram","uncertain":true或false}。图形用简短客观描述。',
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `识别模式${p.kind}，学科${c.subjectId}。仅转录。`,
                },
                { type: "image", image: p.image },
              ],
            },
          ],
          signal: controller.signal,
        });
        const parsed = z
          .object({
            text: z.string().max(20000),
            kind: z.enum(["text", "math", "diagram"]),
            uncertain: z.boolean(),
          })
          .parse(JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
        const doc = await db.handwritingDocument.findUnique({
          where: { classroomId: id },
        });
        if (doc)
          await db.recognitionResult.create({
            data: {
              documentId: doc.id,
              revision: p.revision,
              content: parsed.text,
              kind: parsed.kind,
            },
          });
        return { ...parsed, revision: p.revision };
      } catch (e) {
        throw providerError(e);
      }
    },
  );
  app.post(
    "/api/classrooms/:id/chat",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 60, timeWindow: "1 hour" } },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = await owned(id, req.account.id);
      const p = z
        .object({
          requestId: z.uuid(),
          text: z.string().max(20000),
          image: image.optional(),
          consent: z.boolean().default(false),
        })
        .refine((p) => p.text.trim() || p.image, "请输入问题")
        .parse(req.body);
      if (p.image && !p.consent)
        throw new AppError(
          400,
          "CONSENT_REQUIRED",
          "发送原始笔迹图片前需要授权",
        );
      const provider = await providerFor(c.subjectId, !!p.image);
      if (await db.message.findUnique({ where: { id: p.requestId } }))
        throw new AppError(
          409,
          "DUPLICATE_REQUEST",
          "该问题已提交，请查看课堂记录",
        );
      activeRequests.get(id)?.abort();
      const controller = new AbortController();
      activeRequests.set(id, controller);
      const conversation = await db.conversation.findUniqueOrThrow({
        where: { classroomId: id },
      });
      await db.message.create({
        data: {
          id: p.requestId,
          conversationId: conversation.id,
          role: "user",
          content: p.text || "请解释这些笔迹",
          metadata: JSON.stringify({ hasInk: !!p.image }),
        },
      });
      const history = await db.message.findMany({
        where: {
          conversationId: conversation.id,
          role: { in: ["user", "assistant"] },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      });
      history.reverse();
      const vis = await db.visualizationState.findUniqueOrThrow({
        where: { classroomId: id },
      });
      let expectedRevision = vis.revision;
      const messages: ModelMessage[] = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      if (p.image)
        messages[messages.length - 1] = {
          role: "user",
          content: [
            { type: "text", text: p.text || "请解释这些笔迹" },
            { type: "image", image: p.image },
          ],
        };
      const subject = await db.subject.findUniqueOrThrow({
          where: { id: c.subjectId },
        }),
        enabled = await db.skillDefinition.findMany({
          where: { enabled: true },
        });
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const send = (event: StreamEvent) => {
        if (!reply.raw.destroyed)
          reply.raw.write("data: " + JSON.stringify(event) + "\n\n");
      };
      reply.raw.on("close", () => controller.abort());
      const keepalive = setInterval(() => {
        if (!reply.raw.destroyed) reply.raw.write(": heartbeat\n\n");
      }, 15000);
      send({ type: "meta", requestId: p.requestId });
      let content = "",
        status = "COMPLETE";
      const tools: ToolSet = {};
      for (const s of skillRegistry.filter(
        (s) =>
          (s.subject === c.subjectId || s.subject === "all") &&
          enabled.some((e) => e.id === s.id),
      )) {
        tools[s.id] = tool({
          description: s.description,
          inputSchema: s.inputSchema,
          execute: async (input) => {
            if (controller.signal.aborted) throw new Error("课堂已打断");
            const output = executeSkill(s.id, input, c.subjectId as SubjectId);
            if (output.state) {
              const changed = await db.$transaction(async (tx) => {
                if (controller.signal.aborted) throw new Error("已取消");
                const result = await tx.visualizationState.updateMany({
                  where: { classroomId: id, revision: expectedRevision },
                  data: {
                    data: JSON.stringify(output.state),
                    revision: { increment: 1 },
                  },
                });
                if (!result.count) return false;
                await tx.skillExecution.create({
                  data: {
                    classroomId: id,
                    skillId: s.id,
                    input: JSON.stringify(input),
                    output: JSON.stringify(output.result),
                    status: "COMPLETE",
                  },
                });
                return true;
              });
              if (!changed)
                return {
                  error:
                    "学生已修改实验，旧工具操作已拒绝。请基于最新状态继续。",
                  state: JSON.parse(
                    (
                      await db.visualizationState.findUniqueOrThrow({
                        where: { classroomId: id },
                      })
                    ).data,
                  ),
                };
              expectedRevision++;
              if (!controller.signal.aborted)
                send({
                  type: "tool",
                  id: s.id,
                  input,
                  output: output.result,
                  state: output.state,
                  revision: expectedRevision,
                });
            } else {
              await db.skillExecution.create({
                data: {
                  classroomId: id,
                  skillId: s.id,
                  input: JSON.stringify(input),
                  output: JSON.stringify(output.result),
                  status: "COMPLETE",
                },
              });
              if (s.id === "TeachingPlan")
                await db.$transaction([
                  db.teachingPlan.create({
                    data: {
                      classroomId: id,
                      data: JSON.stringify(output.result),
                    },
                  }),
                  db.teachingProgress.create({
                    data: {
                      classroomId: id,
                      data: JSON.stringify(output.result),
                    },
                  }),
                ]);
              const current = await db.visualizationState.findUniqueOrThrow({
                where: { classroomId: id },
              });
              send({
                type: "tool",
                id: s.id,
                input,
                output: output.result,
                state: JSON.parse(current.data),
                revision: current.revision,
              });
            }
            return output.result;
          },
        });
      }
      try {
        const plan = await db.teachingPlan.findFirst({
          where: { classroomId: id },
          orderBy: { createdAt: "desc" },
        });
        const result = await provider.callTools({
          system: `${subject.prompt}\n${c.mode === "teach" ? "主动教学：先了解目标，用TeachingPlan保存简短课程计划，每次只讲一个步骤，然后提问等待回答，随时允许打断。学生确认理解后再更新TeachingPlan的进度。" : "自由问答：先直接解释关键疑问，再提供可操作的演示。"}\n学生优先。可以使用已注册工具修改实验，必须真正调用，不要仅声称已操作。不得执行脚本。数值以工具结果为准。当前实验 revision=${vis.revision}: ${vis.data}\n最新课程计划与进度：${plan?.data ?? "尚无，请先了解学习目标"}\n历史可能被打断，不要重启整堂课。不确定时说明。用 Markdown 与 $LaTeX$。`,
          messages,
          tools,
          signal: controller.signal,
        });
        for await (const part of result.fullStream) {
          if (controller.signal.aborted) break;
          if (part.type === "text-delta") {
            content += part.text;
            send({ type: "text", delta: part.text });
          }
          if (part.type === "error") throw part.error;
        }
        if (controller.signal.aborted) status = "INTERRUPTED";
      } catch (e) {
        status = controller.signal.aborted ? "INTERRUPTED" : "ERROR";
        if (status === "ERROR") {
          const error = providerError(e);
          send({ type: "error", code: error.code, message: error.message });
        }
      } finally {
        clearInterval(keepalive);
        try {
          if (content) {
            const message = await db.message.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content,
                status,
              },
            });
            send({ type: "done", messageId: message.id });
          } else if (status === "COMPLETE")
            send({
              type: "error",
              code: "EMPTY_RESPONSE",
              message: "模型未生成文本，请尝试重新提问",
            });
          await db.classroom.update({
            where: { id },
            data: { updatedAt: new Date() },
          });
        } catch {
          /* Classroom may have been explicitly deleted. */
        }
        if (activeRequests.get(id) === controller) activeRequests.delete(id);
        reply.raw.end();
      }
    },
  );
}
