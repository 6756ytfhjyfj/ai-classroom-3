import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {db} from '../server/db.js';
import {createApp} from '../server/app.js';
import {createHash} from 'node:crypto';
import {IMAGE_CHUNK_BYTES, MAX_IMAGE_BYTES} from '../shared/image-limits.js';
let app:Awaited<ReturnType<typeof createApp>>,cookie='',other='',admin='';
const call=(method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',url:string,payload?:object,cookieValue=cookie)=>app.inject({method,url,...(payload?{payload}:{}),headers:cookieValue?{cookie:cookieValue}:{}});
const sessionCookie=(r:{headers:Record<string,unknown>})=>String(r.headers['set-cookie']).split(';')[0];
beforeAll(async()=>{
 new DatabaseSync('prisma/test.db').close();
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','reset','--force','--skip-generate'],{env:process.env,stdio:'pipe'});
 app=await createApp();
});
afterAll(async()=>{await app?.close();await db.$disconnect()});
describe('用户名密码与真实学习数据集成',()=>{
 it('不用设备凭证注册，安全会话且密码不泄漏',async()=>{
  const r=await call('POST','/api/auth/register',{username:'学习者1',password:'test-password-123'},'');
  expect(r.statusCode).toBe(200);cookie=sessionCookie(r);expect(r.headers['set-cookie']).toContain('HttpOnly');expect(r.json().user.passwordHash).toBeUndefined();expect(r.json().recoveryCode.length).toBeGreaterThan(32);
  expect((await db.authSession.findFirstOrThrow()).deviceId).toBeNull();expect(await db.device.count()).toBe(0);
 });
 it('第四个及以上账号正常注册，旧设备接口停用',async()=>{
  const results=await Promise.all(Array.from({length:4},(_,i)=>call('POST','/api/auth/register',{username:'用户'+i,password:'test-password-123'},'')));
  expect(results.map(r=>r.statusCode)).toEqual([200,200,200,200]);other=sessionCookie(results[0]);expect(await db.deviceAccountBinding.count()).toBe(0);
  expect((await call('POST','/api/device/bootstrap',{})).statusCode).toBe(410);
 });
 it('重复用户名、错误密码、跨站请求和越权拒绝',async()=>{
  expect((await call('POST','/api/auth/register',{username:'学习者1',password:'test-password-123'},'')).statusCode).toBe(409);
  expect((await call('POST','/api/auth/login',{username:'学习者1',password:'incorrect-password'},'')).statusCode).toBe(401);
  expect((await call('GET','/api/admin/providers')).statusCode).toBe(403);
  expect((await call('POST','/api/admin/providers/gemini/test/stream',{},'')).statusCode).toBe(401);
  expect((await call('POST','/api/admin/providers/gemini/test/stream',{})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/auth/logout',payload:{},headers:{cookie,origin:'https://evil.example'}})).statusCode).toBe(403);
 });
 it('题库不提前泄露答案，作答正确判分、错题自动归档',async()=>{
  const r=await call('GET','/api/questions?subjectId=math&page=1&pageSize=12');expect(r.statusCode).toBe(200);const q=r.json().items[0];expect(q.answer).toBeUndefined();expect(q.explanation).toBeUndefined();
  const attempt=await call('POST',`/api/questions/${q.id}/attempts`,{answer:'123456789'});expect(attempt.json().correct).toBe(false);
  expect((await call('POST',`/api/questions/${q.id}/attempts`,{answer:attempt.json().answer})).json().correct).toBe(true);
  const wrongs=(await call('GET','/api/wrongs')).json();expect(wrongs.total).toBe(1);expect(wrongs.items[0].questionId).toBe(q.id);
  expect((await call('GET','/api/wrongs',undefined,other)).json().total).toBe(0);
 });
 it('图片真实存储、私有读取，伪装格式和跨账号读取拒绝',async()=>{
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=';
  const r=await call('POST','/api/wrongs',{subjectId:'math',title:'上传测试',imageData:image});expect(r.statusCode).toBe(200);const id=r.json().id;
  const read=await call('GET',`/api/wrongs/${id}/image`);expect(read.statusCode).toBe(200);expect(read.headers['content-type']).toContain('image/png');expect(read.headers['cache-control']).toContain('no-store');
  expect((await call('GET',`/api/wrongs/${id}/image`,undefined,other)).statusCode).toBe(404);
  expect((await call('POST','/api/wrongs',{subjectId:'math',title:'假图片',imageData:'data:image/png;base64,'+Buffer.from('not a real image file').toString('base64')})).statusCode).toBe(400);
  expect((await call('PATCH',`/api/wrongs/${id}`,{expectedVersion:0,note:'已订正'})).json().revision).toBe(1);
  expect((await call('PATCH',`/api/wrongs/${id}`,{expectedVersion:0,note:'过期覆盖'})).statusCode).toBe(409);
 });
 it('10 MB 图片分段上传、读取无损，越界、乱序、越权与重复提交保护',async()=>{
  const bytes=Buffer.alloc(MAX_IMAGE_BYTES,37);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  expect((await call('POST','/api/image-uploads',{mime:'image/png',bytes:MAX_IMAGE_BYTES+1,sha256})).statusCode).toBe(400);
  const start=await call('POST','/api/image-uploads',{mime:'image/png',bytes:bytes.length,sha256});expect(start.statusCode).toBe(200);const id=start.json().id;
  const first={data:bytes.subarray(0,IMAGE_CHUNK_BYTES).toString('base64')};
  expect((await call('PUT',`/api/image-uploads/${id}/chunks/0`,first,other)).statusCode).toBe(404);
  expect((await call('PUT',`/api/image-uploads/${id}/chunks/${IMAGE_CHUNK_BYTES}`,first)).statusCode).toBe(409);
  expect((await call('POST','/api/wrongs',{subjectId:'math',title:'10 MB',imageUploadId:id})).statusCode).toBe(409);
  for(let offset=0;offset<bytes.length;offset+=IMAGE_CHUNK_BYTES){const r=await call('PUT',`/api/image-uploads/${id}/chunks/${offset}`,{data:bytes.subarray(offset,offset+IMAGE_CHUNK_BYTES).toString('base64')});expect(r.statusCode).toBe(200);}
  expect((await call('PUT',`/api/image-uploads/${id}/chunks/0`,first)).statusCode).toBe(200);
  const payload={subjectId:'math',title:'10 MB',imageUploadId:id};const saved=await call('POST','/api/wrongs',payload);expect(saved.statusCode).toBe(200);expect(saved.json().imageBytes).toBe(MAX_IMAGE_BYTES);
  expect((await call('POST','/api/wrongs',payload)).json().id).toBe(id);expect(await db.imageUpload.count({where:{id}})).toBe(0);
  const chunks:Buffer[]=[];for(let index=0;index<Math.ceil(bytes.length/IMAGE_CHUNK_BYTES);index++){const r=await call('GET',`/api/wrongs/${id}/image/chunks/${index}`);expect(r.statusCode).toBe(200);expect(r.body.length).toBeLessThan(2*1024*1024);chunks.push(Buffer.from(r.json().data,'base64'));}
  expect(createHash('sha256').update(Buffer.concat(chunks)).digest('hex')).toBe(sha256);
  expect((await call('GET',`/api/wrongs/${id}/image/chunks/0`,undefined,other)).statusCode).toBe(404);
  expect((await call('POST','/api/image-uploads',{mime:'image/png',bytes:MAX_IMAGE_BYTES,sha256})).statusCode).toBe(409);
  await call('DELETE',`/api/wrongs/${id}`);
 });
 it('分段校验失败不会保存错题，取消、过期与并发预留保护',async()=>{
  const p={mime:'image/png',bytes:12,sha256:'0'.repeat(64)};
  const r=await call('POST','/api/image-uploads',p),id=r.json().id;
  await call('PUT',`/api/image-uploads/${id}/chunks/0`,{data:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')});
  expect((await call('POST','/api/wrongs',{subjectId:'math',title:'校验失败',imageUploadId:id})).json().code).toBe('IMAGE_INTEGRITY');
  expect((await call('DELETE',`/api/image-uploads/${id}`,undefined,other)).statusCode).toBe(200);expect(await db.imageUpload.count({where:{id}})).toBe(1);
  await db.imageUpload.update({where:{id},data:{expiresAt:new Date(0)}});
  expect((await call('PUT',`/api/image-uploads/${id}/chunks/0`,{data:Buffer.alloc(12).toString('base64')})).statusCode).toBe(404);
  const next=await call('POST','/api/image-uploads',p);expect(await db.imageUpload.count({where:{id}})).toBe(0);await call('DELETE',`/api/image-uploads/${next.json().id}`);
  const results=await Promise.all([call('POST','/api/image-uploads',{...p,bytes:MAX_IMAGE_BYTES}),call('POST','/api/image-uploads',{...p,bytes:MAX_IMAGE_BYTES})]);expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
  for(const r of results)if(r.statusCode===200)await call('DELETE',`/api/image-uploads/${r.json().id}`);
 });
 it('笔记持久化、并发版本保护和账号隔离',async()=>{
  const book=(await call('POST','/api/notebooks',{name:'我的数学'})).json();
  const note=(await call('POST','/api/notes',{notebookId:book.id,title:'公式笔记'})).json();
  const update={expectedVersion:0,title:'公式笔记',content:'面积 $S=ab/2$\n\n自己的理解',subjectId:'math',pinned:true};
  const saved=await call('PUT',`/api/notes/${note.id}`,update);expect(saved.statusCode).toBe(200);expect(saved.json().revision).toBe(1);
  expect((await call('PUT',`/api/notes/${note.id}`,update)).statusCode).toBe(409);
  expect((await call('GET',`/api/notes?notebookId=${book.id}`,undefined,other)).json().items).toEqual([]);
  expect((await call('POST','/api/notes',{notebookId:book.id},other)).statusCode).toBe(404);
  await call('DELETE',`/api/notebooks/${book.id}`,undefined,other);expect(await db.note.count({where:{id:note.id}})).toBe(1);
  expect((await call('GET','/api/library/export')).json().notebooks[0].notes[0].content).toBe(update.content);
 });
 it('独立后台仅管理员可用，AQ密钥保存脱敏、题库导入校验',async()=>{
  process.env.CLASSROOM_BOOTSTRAP_TOKEN='test-bootstrap-token-with-more-than-32-characters';
  const initialized=await call('POST','/api/setup/admin',{username:'admin-test',password:'admin-password-123',bootstrapToken:process.env.CLASSROOM_BOOTSTRAP_TOKEN},'');expect(initialized.statusCode).toBe(200);expect(await db.device.count()).toBe(0);
  expect((await call('POST','/api/setup/admin',{username:'another-admin',password:'admin-password-123',bootstrapToken:'test-bootstrap-token-with-more-than-32-characters'},'')).statusCode).toBe(403);
  const login=await call('POST','/api/auth/login',{username:'admin-test',password:'admin-password-123'},'');admin=sessionCookie(login);
  const save=await call('PUT','/api/admin/providers/gemini',{key:'AQ-test-key-format-only',model:'configured-model',baseUrl:'https://generativelanguage.googleapis.com/v1beta',enabled:true,subjects:['*'],vision:true},admin);expect(save.statusCode).toBe(200);
  const read=await call('GET','/api/admin/providers',undefined,admin);expect(read.body).not.toContain('AQ-test');expect(read.body).not.toContain('encryptedKey');
  const q={id:'q:math-001',subjectId:'math',topic:'测试',difficulty:1,kind:'number',stem:'一加一等于多少？',answer:'2',explanation:'1+1=2',source:'自行编写'};
  expect((await call('POST','/api/admin/questions/import',{items:[q]})).statusCode).toBe(403);
  expect((await call('POST','/api/admin/questions/import',{items:[{...q,answer:'invalid'}]},admin)).statusCode).toBe(400);
  expect((await call('POST','/api/admin/questions/import',{items:[q]},admin)).json().imported).toBe(1);
  expect((await call('POST','/api/questions/q:math-001/attempts',{answer:'2'})).json().correct).toBe(true);
  expect(await db.administratorAuditLog.count({where:{action:'IMPORT_QUESTIONS'}})).toBe(1);
 });
 it('后台流式测试保留进度与认证错误并写入审计（协议回归）',async()=>{
  const upstream=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:{code:403,message:'private-upstream-error',status:'PERMISSION_DENIED'}}),{status:403}));
  try{
   const tested=await call('POST','/api/admin/providers/gemini/test/stream',{},admin);
   expect(tested.statusCode).toBe(200);expect(tested.headers['content-type']).toContain('text/event-stream');
   expect(tested.body).toContain('"type":"progress"');expect(tested.body).toContain('PROVIDER_FORBIDDEN');
   expect(tested.body).not.toContain('"type":"result"');expect(tested.body).not.toContain('private-upstream-error');
   expect(await db.administratorAuditLog.count({where:{action:'PROVIDER_TEST_FAILED'}})).toBe(1);
  }finally{upstream.mockRestore();}
 });
 it('恢复码一次使用并撤销旧会话',async()=>{
  const r=await call('POST','/api/auth/register',{username:'恢复测试',password:'test-password-123'},'');const old=sessionCookie(r),p={username:'恢复测试',password:'new-password-456',recoveryCode:r.json().recoveryCode};
  expect((await call('POST','/api/auth/recover',p,'')).statusCode).toBe(200);expect((await call('POST','/api/auth/recover',p,'')).statusCode).toBe(400);expect((await call('GET','/api/auth/me',undefined,old)).statusCode).toBe(401);
 });
});
