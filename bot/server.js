const http=require('node:http'),crypto=require('node:crypto'),cloudbase=require('@cloudbase/node-sdk'),{parse,format}=require('./query')
if(!process.env.ADMIN_TOKEN||process.env.ADMIN_TOKEN.length<32)throw Error('ADMIN_TOKEN 至少32字符')
if(!process.env.CLOUDBASE_ENV_ID)throw Error('缺少 CLOUDBASE_ENV_ID')
if(!process.env.CLOUDBASE_APIKEY?.trim())throw Error('未收到 CLOUDBASE_APIKEY，请检查当前版本的 API Key 注入')
console.info('CloudBase startup configuration',{
 sdkVersion:cloudbase.version||'UNKNOWN',
 env:process.env.CLOUDBASE_ENV_ID,
 apiKeyPresent:true,
 apiKeyHasOuterWhitespace:process.env.CLOUDBASE_APIKEY!==process.env.CLOUDBASE_APIKEY.trim(),
 legacySessionTokenPresent:!!process.env.TENCENTCLOUD_SESSIONTOKEN,
 legacySecretIdPresent:!!process.env.TENCENTCLOUD_SECRETID,
 legacySecretKeyPresent:!!process.env.TENCENTCLOUD_SECRETKEY
})
const db=cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  accessKey: process.env.CLOUDBASE_APIKEY
}).database(),stateDoc=db.collection('bot_state').doc('weixin')
let accounts=[],qr=null,stopped=false,saveQueue=Promise.resolve()
const polling=new Set()
const metadata={channel_version:'2.4.8',bot_agent:'ScheduleBot/1.0'},headers={'iLink-App-Id':'bot','iLink-App-ClientVersion':String(0x020408)}
function safeBase(value){const u=new URL(value||'https://ilinkai.weixin.qq.com');if(u.protocol!=='https:'||!(u.hostname==='ilinkai.weixin.qq.com'||u.hostname.endsWith('.weixin.qq.com'))||u.port||u.username||u.password)throw Error('不可信微信地址');return u.origin}
async function api(path,body,token,base){
 const res=await fetch(safeBase(base)+path,{method:body===undefined?'GET':'POST',headers:{...headers,'Content-Type':'application/json',...(body===undefined?{}:{AuthorizationType:'ilink_bot_token','X-WECHAT-UIN':Buffer.from(String(crypto.randomBytes(4).readUInt32BE())).toString('base64')}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)})
 if(!res.ok)throw Error('微信HTTP '+res.status)
 const data=await res.json();if(data.ret||data.errcode)throw Error('微信API '+String(data.ret||data.errcode));return data
}
function logDbError(operation,error){
 const raw=error?.code??error?.errCode??error?.errorCode
 const code=typeof raw==='number'&&Number.isFinite(raw)?raw:typeof raw==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(raw)&&!raw.includes(process.env.CLOUDBASE_APIKEY||'\0')?raw:'UNKNOWN'
 console.error('Database operation failed',{operation,code})
}
function persist(){
 const snapshot=JSON.parse(JSON.stringify({version:2,accounts}))
 const save=saveQueue.then(()=>stateDoc.set(snapshot));saveQueue=save.catch(()=>{})
 return save.catch(e=>{logDbError('bot_state.set',e);throw Error('Database state save failed')})
}
async function load(){
 const result=await stateDoc.get(),data=Array.isArray(result.data)?result.data[0]:result.data
 accounts=Array.isArray(data?.accounts)?data.accounts:data?.account?[{...data.account,cursor:data.cursor||''}]:[]
 for(const account of accounts)startPoll(account)
}
async function reply(msg,account){
 if(msg.message_type!==1||msg.from_user_id!==account.owner||!msg.context_token)return
 const text=(msg.item_list||[]).filter(i=>i.type===1).map(i=>i.text_item?.text||'').join('\n')
 let answer,query
 try{query=parse(text)}catch(e){answer=e.message}
 if(query){try{const result=await db.collection('schedules').where({date:query.date}).limit(100).get();answer=format(query,result.data)}catch(e){logDbError('schedules.get',e);answer='档期查询暂时失败，请稍后重试。'}}
 const id=crypto.createHash('sha256').update(String(msg.message_id??msg.client_id??msg.seq)+':'+msg.from_user_id).digest('hex')
 await api('/ilink/bot/sendmessage',{msg:{from_user_id:'',to_user_id:msg.from_user_id,client_id:id,message_type:2,message_state:2,context_token:msg.context_token,item_list:[{type:1,text_item:{text:answer}}]},base_info:metadata},account.token,account.base)
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function notifyLifecycle(account,event){
 try{await api('/ilink/bot/msg/notify'+event,{base_info:metadata},account.token,account.base)}
 catch(e){console.error('微信连接状态通知失败',event,e.message)}
}
function startPoll(account){
 // 微信主动拉取已停用；不在启动或扫码后创建后台任务。
 return
}
async function poll(account){while(!stopped&&accounts.includes(account)){try{
 const data=await api('/ilink/bot/getupdates',{get_updates_buf:account.cursor||'',base_info:metadata},account.token,account.base)
 if(!accounts.includes(account))return
 for(const msg of data.msgs||[])await reply(msg,account)
 if(data.get_updates_buf){const previous=account.cursor;account.cursor=data.get_updates_buf;try{await persist()}catch(e){account.cursor=previous;throw e}}
 account.lastSuccess=new Date().toISOString();delete account.lastError
 }catch(e){account.lastError=e.message;console.error('微信轮询失败',e.message);await sleep(e.message.includes('-14')?3600000:5000)}}}
function authorized(req){const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+process.env.ADMIN_TOKEN);return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected)}
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store')
 const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data))}
 if(req.url==='/healthz')return send(200,{ok:true})
 if(!authorized(req))return send(401,{error:'Unauthorized'})
 try{
 if(req.method==='POST'&&req.url==='/admin/query'){
 let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>8192)return send(413,{error:'请求过长'})}
 let query
 try{query=parse(JSON.parse(raw).text)}catch{return send(400,{error:'请提供 text 和一个具体日期、摄影师姓名或谁有空'})}
 try{const result=await db.collection('schedules').where({date:query.date}).limit(100).get();return send(200,{answer:format(query,result.data)})}
 catch(e){logDbError('schedules.get',e);return send(503,{error:'档期查询暂时失败，请稍后重试'})}
 }
 await load()
 if(req.method==='GET'&&req.url==='/admin/status')return send(200,{bound:accounts.length>0,accountCount:accounts.length,accounts:accounts.map((a,index)=>({index:index+1,lastSuccess:a.lastSuccess||null,lastError:a.lastError||null}))})
 if(req.method==='POST'&&req.url==='/admin/login'){
 if(accounts.length>=10)return send(409,{error:'最多支持10个微信绑定'})
 const data=await api('/ilink/bot/get_bot_qrcode?bot_type=3',{local_token_list:accounts.map(a=>a.token)});qr={id:data.qrcode,base:'https://ilinkai.weixin.qq.com'};return send(200,{qrcode:data.qrcode,qrcode_img_content:data.qrcode_img_content})
 }
 if(req.method==='POST'&&req.url==='/admin/login/status'){
 if(!qr)return send(400,{error:'请先获取二维码'})
 const pending=qr
 if(pending.checking)return send(409,{error:'正在检查扫码结果'})
 pending.checking=true
 let data
 try{data=await api('/ilink/bot/get_qrcode_status?qrcode='+encodeURIComponent(pending.id),undefined,null,pending.base)}finally{pending.checking=false}
 if(qr!==pending)return send(409,{error:'二维码已刷新，请检查新二维码'})
 if(data.status==='scaned_but_redirect'&&data.redirect_host)qr.base=safeBase(data.redirect_host.includes('://')?data.redirect_host:'https://'+data.redirect_host)
 if(data.status==='confirmed'){
 if(!data.bot_token||!data.ilink_user_id)throw Error('绑定信息不完整')
 const account={token:data.bot_token,owner:data.ilink_user_id,botId:data.ilink_bot_id,base:safeBase(data.baseurl),cursor:''}
 const previous=accounts;accounts=accounts.filter(a=>a.owner!==account.owner).concat(account)
 try{await persist()}catch(e){accounts=previous;throw e}qr=null;startPoll(account)
 }
 return send(200,{status:data.status})
 }
 send(404,{error:'Not found'})
 }catch{console.error('管理操作失败');send(502,{error:'操作失败，请检查数据库权限、配置和微信连接'})}
}).listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.info('按需查询模式：微信轮询已停用'))
process.on('SIGTERM',()=>{stopped=true;process.exit(0)})
