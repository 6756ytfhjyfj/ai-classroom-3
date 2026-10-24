import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { AppError } from "./security.js";
import {
  IMAGE_CHUNK_BYTES,
  IMAGE_CHUNK_CHARS,
  IMAGE_STORAGE_BYTES,
  IMAGE_UPLOAD_LIFETIME_MS,
  MAX_IMAGE_BYTES,
} from "../shared/image-limits.js";

const uploadParams = z.object({ id: z.string().uuid() });
const chunkParams = uploadParams.extend({
  offset: z.coerce.number().int().nonnegative().max(MAX_IMAGE_BYTES),
});
export async function imageUploadRoutes(app: FastifyInstance) {
  // Authentication is inherited from libraryRoutes, including on chunk reads.
  app.post("/api/image-uploads", async (req) => {
    const p = z
      .object({
        mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
        bytes: z.number().int().min(12).max(MAX_IMAGE_BYTES),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(req.body);
    return db.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: req.account.id },
          data: { updatedAt: new Date() },
        });
        await tx.imageUpload.deleteMany({
          where: { expiresAt: { lte: new Date() } },
        });
        const pending = await tx.imageUpload.aggregate({
          where: { userId: req.account.id },
          _sum: { bytes: true },
          _count: true,
        });
        const used =
          (
            await tx.wrongProblem.aggregate({
              where: { userId: req.account.id },
              _sum: { imageBytes: true },
            })
          )._sum.imageBytes ?? 0;
        if (pending._count >= 2)
          throw new AppError(
            409,
            "UPLOAD_BUSY",
            "已有图片正在上传，请稍后重试",
          );
        if (used + (pending._sum.bytes ?? 0) + p.bytes > IMAGE_STORAGE_BYTES)
          throw new AppError(
            409,
            "UPLOAD_QUOTA",
            "图片存储已达 20 MB，请清理不再需要的错题图片",
          );
        const row = await tx.imageUpload.create({
          data: {
            ...p,
            userId: req.account.id,
            expiresAt: new Date(Date.now() + IMAGE_UPLOAD_LIFETIME_MS),
          },
        });
        return {
          id: row.id,
          chunkBytes: IMAGE_CHUNK_BYTES,
          expiresAt: row.expiresAt,
        };
      },
      { maxWait: 15000, timeout: 15000 },
    );
  });
  app.put(
    "/api/image-uploads/:id/chunks/:offset",
    { bodyLimit: IMAGE_CHUNK_CHARS + 128 },
    async (req) => {
      const { id, offset } = chunkParams.parse(req.params);
      const { data } = z
        .object({
          data: z
            .string()
            .min(4)
            .max(IMAGE_CHUNK_CHARS)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        })
        .parse(req.body);
      const chunk = Buffer.from(data, "base64");
      if (chunk.toString("base64") !== data || offset % IMAGE_CHUNK_BYTES !== 0)
        throw new AppError(400, "IMAGE_CHUNK", "图片分段无效，请重新上传");
      return db.$transaction(
        async (tx) => {
          await tx.user.update({
            where: { id: req.account.id },
            data: { updatedAt: new Date() },
          });
          const row = await tx.imageUpload.findFirst({
            where: {
              id,
              userId: req.account.id,
              expiresAt: { gt: new Date() },
            },
          });
          if (!row)
            throw new AppError(
              404,
              "UPLOAD_NOT_FOUND",
              "上传已过期，请重新保存图片",
            );
          if (chunk.length !== Math.min(IMAGE_CHUNK_BYTES, row.bytes - offset))
            throw new AppError(400, "IMAGE_CHUNK", "图片分段长度不正确");
          if (
            offset < row.receivedBytes &&
            row.data.slice((offset / 3) * 4, (offset / 3) * 4 + data.length) ===
              data
          )
            return { receivedBytes: row.receivedBytes };
          if (offset !== row.receivedBytes)
            throw new AppError(
              409,
              "UPLOAD_OFFSET",
              "图片分段顺序不正确，请重试",
            );
          await tx.imageUpload.update({
            where: { id },
            data: {
              data: row.data + data,
              receivedBytes: row.receivedBytes + chunk.length,
            },
          });
          return { receivedBytes: row.receivedBytes + chunk.length };
        },
        { maxWait: 15000, timeout: 30000 },
      );
    },
  );
  app.delete("/api/image-uploads/:id", async (req) => {
    const { id } = uploadParams.parse(req.params);
    await db.imageUpload.deleteMany({ where: { id, userId: req.account.id } });
    return { ok: true };
  });
  app.get("/api/wrongs/:id/image/chunks/:index", async (req, reply) => {
    const { id, index } = z
      .object({
        id: z.string(),
        index: z.coerce
          .number()
          .int()
          .min(0)
          .max(Math.ceil(MAX_IMAGE_BYTES / IMAGE_CHUNK_BYTES) - 1),
      })
      .parse(req.params);
    // Fetch only this slice from PostgreSQL/SQLite rather than the entire image.
    const rows = await db.$queryRaw<
      Array<{ data: string | null; mime: string | null; bytes: number }>
    >`SELECT substr("imageData", CAST(${index * IMAGE_CHUNK_CHARS + 1} AS INTEGER), CAST(${IMAGE_CHUNK_CHARS} AS INTEGER)) AS "data", "imageMime" AS "mime", "imageBytes" AS "bytes" FROM "WrongProblem" WHERE "id" = ${id} AND "userId" = ${req.account.id}`;
    const row = rows[0];
    if (!row?.data || !row.mime)
      throw new AppError(404, "IMAGE_NOT_FOUND", "图片不存在");
    return reply
      .header("Cache-Control", "private, no-store")
      .send({ data: row.data, mime: row.mime, bytes: row.bytes });
  });
}
