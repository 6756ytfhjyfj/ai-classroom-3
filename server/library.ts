import type { FastifyInstance } from "fastify";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { db,audit } from "./db.js";
import { authenticate,adminOnly } from "./auth.js";
import { AppError } from "./security.js";
import { subjectId } from "../shared/protocol.js";
import { checkAnswer,generatedQuestion,listGenerated,publicQuestion,questionCatalog,questionCount,type SolvedQuestion } from "../shared/questions.js";
import { questionImportSchema,wrongCreateSchema,wrongUpdateSchema } from "../shared/library.js";
import { IMAGE_STORAGE_BYTES, MAX_IMAGE_BYTES } from "../shared/image-limits.js";
import { imageUploadRoutes } from "./image-uploads.js";
const paging=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),subjectId:subjectId.optional(),topic:z.string().max(60).optional(),q:z.string().max(100).optional(),difficulty:z.coerce.number().int().min(1).max(3).optional()});
const wrongSelect={id:true,subjectId:true,title:true,prompt:true,answer:true,correctAnswer:true,explanation:true,note:true,questionId:true,imageMime:true,imageBytes:true,status:true,reviewAt:true,revision:true,updatedAt:true} as const;
export function parseUpload(data:string){
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);if(!match)throw new AppError(400,"IMAGE_TYPE","仅支持 PNG、JPEG 或 WebP 图片");
 const b=Buffer.from(match[2],"base64");if(b.length>MAX_IMAGE_BYTES||b.length<12)throw new AppError(400,"IMAGE_SIZE","单张图片不能超过 10 MB");
 if(b.toString("base64")!==match[2])throw new AppError(400,"IMAGE_TYPE","图片编码无效");
 const mime=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":b[0]===255&&b[1]===216&&b[2]===255?"image/jpeg":b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP"?"image/webp":null;
 if(mime!==match[1])throw new AppError(400,"IMAGE_TYPE","图片文件内容与类型不符");return {imageData:match[2],imageMime:mime,imageBytes:b.length};
}
async function question(id:string):Promise<SolvedQuestion>{const generated=generatedQuestion(id);if(generated)return generated;const row=await db.questionRecord.findFirst({where:{id,enabled:true}});if(!row)throw new AppError(404,"QUESTION_NOT_FOUND","题目不存在");return questionImportSchema.parse({...row,options:JSON.parse(row.options)}) as SolvedQuestion}
export async function libraryRoutes(app:FastifyInstance){
 app.addHook("preHandler",authenticate);
 await imageUploadRoutes(app);
 app.get("/api/library/stats",async req=>({questions:questionCount+await db.questionRecord.count({where:{enabled:true}}),wrong:await db.wrongProblem.count({where:{userId:req.account.id,status:"REVIEW"}}),notebooks:await db.notebook.count({where:{userId:req.account.id}}),notes:await db.note.count({where:{userId:req.account.id}}),attempts:await db.questionAttempt.count({where:{userId:req.account.id}})}));
 app.get("/api/questions/catalog",async()=>({catalog:questionCatalog,total:questionCount,imported:await db.questionRecord.count({where:{enabled:true}}),description:"数理化原创可计算变式与六学科基础题。可计算变式不是历年考试真题。"}));
 app.get("/api/questions",async req=>{
  const p=paging.extend({source:z.enum(["generated","imported"]).default("generated")}).parse(req.query);
  if(p.source==="generated"){const r=listGenerated(p);return {...r,items:r.items.map(publicQuestion)}}
  const where={enabled:true,...(p.subjectId?{subjectId:p.subjectId}:{}),...(p.difficulty?{difficulty:p.difficulty}:{}),...(p.q?{OR:[{stem:{contains:p.q}},{topic:{contains:p.q}}]}:{})};
  const [total,rows]=await Promise.all([db.questionRecord.count({where}),db.questionRecord.findMany({where,orderBy:{id:"asc"},skip:(p.page-1)*p.pageSize,take:p.pageSize})]);return {total,items:rows.map(r=>publicQuestion({...r,options:JSON.parse(r.options)} as SolvedQuestion))};
 });
 app.get("/api/questions/:id",async req=>publicQuestion(await question((req.params as {id:string}).id)));
 app.post("/api/questions/:id/attempts",async req=>{
  const p=z.object({answer:z.string().min(1).max(200)}).parse(req.body),q=await question((req.params as {id:string}).id),correct=checkAnswer(q,p.answer);
  const attempt=await db.questionAttempt.create({data:{userId:req.account.id,questionId:q.id,answer:p.answer,correct,snapshot:JSON.stringify(q)}});
  if(!correct)await db.wrongProblem.upsert({where:{userId_questionId:{userId:req.account.id,questionId:q.id}},create:{userId:req.account.id,questionId:q.id,subjectId:q.subjectId,title:q.topic,prompt:q.stem,answer:p.answer,correctAnswer:q.answer,explanation:q.explanation},update:{answer:p.answer,status:"REVIEW",reviewAt:new Date(),revision:{increment:1}}});
  return {id:attempt.id,correct,answer:q.answer,explanation:q.explanation,addedToWrongBook:!correct};
 });
 app.get("/api/wrongs",async req=>{
  const p=paging.extend({status:z.enum(["REVIEW","MASTERED"]).optional()}).parse(req.query);const where={userId:req.account.id,...(p.subjectId?{subjectId:p.subjectId}:{}),...(p.status?{status:p.status}:{}),...(p.q?{OR:[{title:{contains:p.q}},{prompt:{contains:p.q}},{note:{contains:p.q}}]}:{})};
  return {total:await db.wrongProblem.count({where}),items:await db.wrongProblem.findMany({where,select:wrongSelect,orderBy:{updatedAt:"desc"},take:p.pageSize,skip:(p.page-1)*p.pageSize}),uploadBytes:(await db.wrongProblem.aggregate({where:{userId:req.account.id},_sum:{imageBytes:true}}))._sum.imageBytes??0,uploadLimit:IMAGE_STORAGE_BYTES};
 });
 app.post("/api/wrongs",async req=>{
  const p=wrongCreateSchema.parse(req.body),{imageData,imageUploadId,...data}=p;
  return db.$transaction(async tx=>{
   // Lock the account row so simultaneous image uploads cannot exceed its quota.
   await tx.user.update({where:{id:req.account.id},data:{updatedAt:new Date()}});
   if(imageUploadId){const existing=await tx.wrongProblem.findFirst({where:{id:imageUploadId,userId:req.account.id},select:wrongSelect});if(existing)return existing;}
   const pending=imageUploadId?await tx.imageUpload.findFirst({where:{id:imageUploadId,userId:req.account.id,expiresAt:{gt:new Date()}}}):null;
   if(imageUploadId&&(!pending||pending.receivedBytes!==pending.bytes))throw new AppError(409,"UPLOAD_INCOMPLETE","图片未上传完整或已过期，请重试");
   const upload=pending?parseUpload(`data:${pending.mime};base64,${pending.data}`):imageData?parseUpload(imageData):{imageBytes:0};
   if(pending&&createHash("sha256").update(Buffer.from(pending.data,"base64")).digest("hex")!==pending.sha256)throw new AppError(400,"IMAGE_INTEGRITY","图片校验失败，请重新上传");
   const used=(await tx.wrongProblem.aggregate({where:{userId:req.account.id},_sum:{imageBytes:true}}))._sum.imageBytes??0;
   const reserved=(await tx.imageUpload.aggregate({where:{userId:req.account.id,expiresAt:{gt:new Date()},...(imageUploadId?{id:{not:imageUploadId}}:{})},_sum:{bytes:true}}))._sum.bytes??0;
   if(used+reserved+upload.imageBytes>IMAGE_STORAGE_BYTES)throw new AppError(409,"UPLOAD_QUOTA","图片存储已达 20 MB，请清理不再需要的错题图片");
   const result=await tx.wrongProblem.create({data:{...data,...upload,...(imageUploadId?{id:imageUploadId}:{}),userId:req.account.id},select:wrongSelect});
   if(pending)await tx.imageUpload.delete({where:{id:pending.id}});
   return result;
  },{maxWait:15000,timeout:15000});
 });
 app.get("/api/wrongs/:id/image",async(req,reply)=>{
  const row=await db.wrongProblem.findFirst({where:{id:(req.params as {id:string}).id,userId:req.account.id},select:{imageData:true,imageMime:true}});if(!row?.imageData||!row.imageMime)throw new AppError(404,"IMAGE_NOT_FOUND","图片不存在");return reply.type(row.imageMime).header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff").send(Buffer.from(row.imageData,"base64"));
 });
 app.patch("/api/wrongs/:id",async req=>{
  const {expectedVersion,reviewDays,...p}=wrongUpdateSchema.parse(req.body),id=(req.params as {id:string}).id;
  const row=await db.wrongProblem.updateMany({where:{id,userId:req.account.id,revision:expectedVersion},data:{...p,...(reviewDays?{reviewAt:new Date(Date.now()+reviewDays*86400000)}:{}),revision:{increment:1}}});if(!row.count)throw new AppError(409,"WRONG_CONFLICT","错题已在其他窗口更新，请重新打开；当前编辑内容仍保留");return db.wrongProblem.findFirstOrThrow({where:{id,userId:req.account.id},select:wrongSelect});
 });
 app.delete("/api/wrongs/:id",async req=>{await db.wrongProblem.deleteMany({where:{id:(req.params as {id:string}).id,userId:req.account.id}});return {ok:true}});
 app.get("/api/notebooks",async req=>({items:await db.notebook.findMany({where:{userId:req.account.id},orderBy:{updatedAt:"desc"},include:{_count:{select:{notes:true}}}})}));
 app.post("/api/notebooks",async req=>{const p=z.object({name:z.string().min(1).max(80),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6578e6")}).parse(req.body);return db.notebook.create({data:{...p,userId:req.account.id},include:{_count:{select:{notes:true}}}})});
 app.patch("/api/notebooks/:id",async req=>{const p=z.object({name:z.string().min(1).max(80)}).parse(req.body);await db.notebook.updateMany({where:{id:(req.params as {id:string}).id,userId:req.account.id},data:p});return {ok:true}});
 app.delete("/api/notebooks/:id",async req=>{await db.notebook.deleteMany({where:{id:(req.params as {id:string}).id,userId:req.account.id}});return {ok:true}});
 app.get("/api/notes",async req=>{const p=z.object({notebookId:z.string().optional(),q:z.string().max(100).optional()}).parse(req.query);return {items:await db.note.findMany({where:{userId:req.account.id,...(p.notebookId?{notebookId:p.notebookId}:{}),...(p.q?{OR:[{title:{contains:p.q}},{content:{contains:p.q}}]}:{})},orderBy:[{pinned:"desc"},{updatedAt:"desc"}],take:300})}});
 app.post("/api/notes",async req=>{const p=z.object({notebookId:z.string(),title:z.string().min(1).max(160).default("未命名笔记"),content:z.string().max(150000).default(""),subjectId:subjectId.default("math")}).parse(req.body);if(!await db.notebook.findFirst({where:{id:p.notebookId,userId:req.account.id}}))throw new AppError(404,"NOTEBOOK_NOT_FOUND","笔记本不存在");return db.note.create({data:{...p,userId:req.account.id}})});
 app.put("/api/notes/:id",async req=>{const {expectedVersion,...p}=z.object({expectedVersion:z.number().int().nonnegative(),title:z.string().min(1).max(160),content:z.string().max(150000),subjectId,pinned:z.boolean().default(false)}).parse(req.body);const id=(req.params as {id:string}).id;const r=await db.note.updateMany({where:{id,userId:req.account.id,revision:expectedVersion},data:{...p,revision:{increment:1}}});if(!r.count)throw new AppError(409,"NOTE_CONFLICT","笔记已在其他窗口更新；已保留本地草稿，请复制内容后重新打开");return db.note.findFirstOrThrow({where:{id,userId:req.account.id}})});
 app.delete("/api/notes/:id",async req=>{await db.note.deleteMany({where:{id:(req.params as {id:string}).id,userId:req.account.id}});return {ok:true}});
 app.get("/api/library/export",async req=>({version:1,exportedAt:new Date(),wrongs:await db.wrongProblem.findMany({where:{userId:req.account.id},select:wrongSelect}),notebooks:await db.notebook.findMany({where:{userId:req.account.id},include:{notes:true}})}));
}
export async function questionAdminRoutes(app:FastifyInstance){
 app.addHook("preHandler",adminOnly);
 app.get("/api/admin/questions",async()=>({generated:questionCount,imported:await db.questionRecord.count(),catalog:questionCatalog}));
 app.post("/api/admin/questions/import",async req=>{
  const {items}=z.object({items:z.array(questionImportSchema).min(1).max(500)}).parse(req.body);if(new Set(items.map(q=>q.id)).size!==items.length)throw new AppError(400,"DUPLICATE_QUESTION","同一批次存在重复题目 ID");
  if(items.some(q=>!checkAnswer(q,q.answer)))throw new AppError(400,"INVALID_ANSWER","存在无法按题型判分的答案，请检查数字、根或选项格式");
  await db.$transaction(items.map(({options,...q})=>db.questionRecord.upsert({where:{id:q.id},create:{...q,options:JSON.stringify(options)},update:{...q,options:JSON.stringify(options)}})));
  await audit(req.account.id,"IMPORT_QUESTIONS",randomUUID(),{count:items.length});return {imported:items.length};
 });
}
