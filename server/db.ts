import { PrismaClient } from "@prisma/client";
import { subjects } from "../shared/protocol";
import { skillRegistry } from "../shared/skills";
export const db = new PrismaClient();
export async function seed() {
  for (const s of subjects)
    await db.subject.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        prompt: `你是${s.name}专科教师。循序渐进，用直观演示和短问题引导。优先工具验证数值。不伪造实验结果。学生主动输入优先。`,
      },
      update: {},
    });
  for (const s of skillRegistry)
    await db.skillDefinition.upsert({
      where: { id: s.id },
      create: { id: s.id },
      update: {},
    });
}
export const audit = (
  actorId: string,
  action: string,
  targetId: string,
  detail: unknown = {},
) =>
  db.administratorAuditLog.create({
    data: { actorId, action, targetId, detail: JSON.stringify(detail) },
  });
// All callers still lock/update the device inside the database transaction. The local queue avoids SQLite writer starvation.
let tail: Promise<unknown> = Promise.resolve();
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = tail.then(fn, fn);
  tail = next.catch(() => undefined);
  return next;
}
