import {app,BrowserWindow,ipcMain,safeStorage,session,dialog,net as electronNet,screen} from 'electron';
import type {IpcMainInvokeEvent} from 'electron';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer,type Server} from 'node:http';
let win:BrowserWindow|null=null,server:Server|null=null,recognizer:ChildProcess|null=null,baseURL='';
app.setName('ONclasstime');
const root=app.getAppPath();
function verify(e:IpcMainInvokeEvent){if(!win||e.sender!==win.webContents||e.senderFrame!==e.sender.mainFrame||e.senderFrame?.origin!==baseURL)throw Error('Untrusted IPC sender')}
async function config(){const file=join(app.getPath('userData'),'desktop.bin');if(existsSync(file))return JSON.parse((await safeStorage.decryptStringAsync(readFileSync(file))).result) as {port:number};return {port:0}}
async function main(){
 if(!app.requestSingleInstanceLock()){app.quit();return}await app.whenReady();
 if(process.env.CLASSROOM_USER_DATA)app.setPath('userData',process.env.CLASSROOM_USER_DATA);
 mkdirSync(app.getPath('userData'),{recursive:true});
 app.on('second-instance',()=>{win?.show();win?.focus()});
 const remote=new URL(process.env.CLASSROOM_SERVER_URL??'https://onclasstime.vercel.app');
 if(remote.protocol!=='https:'&&!(process.env.ONCLASSTIME_ALLOW_LOCAL_TEST==='1'&&remote.protocol==='http:'&&['127.0.0.1','localhost'].includes(remote.hostname)))throw Error('学习服务必须使用 HTTPS');
 const cfg=await config(),staticRoot=join(root,'dist');
 const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.ico':'image/x-icon'};
 server=createServer(async(req,res)=>{try{
  const local=new URL(req.url??'/',baseURL||'http://127.0.0.1');
  if(local.pathname.startsWith('/api/')){
   if(req.headers.origin&&req.headers.origin!==baseURL){res.writeHead(403);res.end('来源未获授权');return}
   if(req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end('跨站请求已拒绝');return}
   let bytes=0;const chunks:Buffer[]=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024){res.writeHead(413);res.end('请求超过4 MB');return}chunks.push(Buffer.from(chunk))}
   const abort=new AbortController();res.once('close',()=>abort.abort());
   const upstream=await electronNet.fetch(new URL(local.pathname+local.search,remote).href,{method:req.method,headers:{'Content-Type':String(req.headers['content-type']??'application/json'),Accept:String(req.headers.accept??'*/*'),Origin:remote.origin,...(req.headers.cookie?{Cookie:req.headers.cookie}:{})},body:['GET','HEAD'].includes(req.method??'GET')?undefined:Buffer.concat(chunks).toString('utf8'),redirect:'error',credentials:'omit',signal:abort.signal});
   res.statusCode=upstream.status;
   for(const key of ['content-type','cache-control','content-disposition','x-content-type-options']){const value=upstream.headers.get(key);if(value)res.setHeader(key,value)}
   const cookies=upstream.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies.map(c=>c.replace(/;\s*Secure\b/gi,'')));
   res.setHeader('Cache-Control','private, no-store');
   if(upstream.body){const reader=upstream.body.getReader();try{while(true){const {done,value}=await reader.read();if(done||res.destroyed)break;if(!res.write(value))await new Promise<void>(resolve=>res.once('drain',resolve))}}finally{reader.releaseLock()}}res.end();return;
  }
  if(local.pathname.startsWith('/admin')||local.pathname==='/setup'){res.writeHead(404);res.end('管理控制台在独立网站提供');return}
  const path=local.pathname==='/'?join(staticRoot,'index.html'):resolve(staticRoot,'.'+decodeURIComponent(local.pathname));
  if(!path.startsWith(staticRoot+'\\')&&path!==join(staticRoot,'index.html')){res.writeHead(404);res.end();return}
  if(!existsSync(path)){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");res.setHeader('X-Content-Type-Options','nosniff');res.end(readFileSync(path));
 }catch{if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'SERVICE_UNAVAILABLE',message:'暂时无法连接学习服务，请检查网络后重试；本机草稿仍保留。'}))}else res.end()}});
 await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(cfg.port,'127.0.0.1',resolve)});
 const address=server.address();if(!address||typeof address==='string')throw Error('本地界面启动失败');baseURL='http://127.0.0.1:'+address.port;
 await safeStorage.isAsyncEncryptionAvailable().then(ok=>{if(!ok)throw Error('Windows DPAPI 不可用')});
 writeFileSync(join(app.getPath('userData'),'desktop.bin'),await safeStorage.encryptStringAsync(JSON.stringify({port:address.port})));
 const area=screen.getPrimaryDisplay().workAreaSize;
 win=new BrowserWindow({width:Math.min(1500,area.width),height:Math.min(980,area.height),minWidth:1100,minHeight:700,title:'ONclasstime',backgroundColor:'#f6f7fb',autoHideMenuBar:true,webPreferences:{preload:join(root,'dist-electron','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==baseURL)e.preventDefault()});
 win.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(win!,{type:'question',title:'保留当前学习内容',message:'未提交的文字、笔记与手写草稿会保留在本机。确定退出？',buttons:['继续学习','保留草稿并退出'],defaultId:0,cancelId:0});if(choice===1)event.preventDefault()});
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===win?.webContents&&new URL(contents.getURL()).origin===baseURL&&['media','fullscreen'].includes(permission)));
  ipcMain.handle("window:fullscreen", (event, enabled) => {
    verify(event);
    win?.setFullScreen(enabled === true);
    return true;
  });
  ipcMain.handle("app:version", (event) => {
    verify(event);
    return app.getVersion();
  });
  ipcMain.handle("speech:start", (event, language) => {
    verify(event);
    if (!["zh-CN", "en-US"].includes(language))
      throw new Error("Unsupported language");
    recognizer?.kill();
    const path = join(
      app.isPackaged ? process.resourcesPath : root,
      "electron",
      "native-speech.ps1",
    );
    recognizer = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path,
        "-Language",
        language,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const child = recognizer;
    let buffer = "";
    recognizer.stdout?.setEncoding("utf8");
    recognizer.stdout?.on("data", (chunk: string) => {
      if (recognizer !== child) return;
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        try {
          win?.webContents.send("speech:event", JSON.parse(line));
        } catch {}
      }
    });
    recognizer.on("error", () =>
      win?.webContents.send("speech:event", {
        type: "error",
        message: "Windows 本地语音引擎启动失败",
      }),
    );
    recognizer.on("exit", () => {
      if (recognizer === child) {
        recognizer = null;
        win?.webContents.send("speech:event", { type: "end" });
      }
    });
    return true;
  });
  ipcMain.handle("speech:stop", (event) => {
    verify(event);
    recognizer?.kill();
    recognizer = null;
    return true;
  });

 await win.loadURL(baseURL);
 win.on('closed',()=>{recognizer?.kill();server?.close();win=null;app.quit()});
}
main().catch(e=>{dialog.showErrorBox('ONclasstime 启动失败',e instanceof Error?e.message:String(e));app.quit()});app.on('window-all-closed',()=>app.quit());
