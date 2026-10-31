const http=require('node:http'),crypto=require('node:crypto'),cloudbase=require('@cloudbase/node-sdk'),{parse,format}=require('./query')
if(!process.env.ADMIN_TOKEN||process.env.ADMIN_TOKEN.length<32)throw Error('ADMIN_TOKEN 至少32字符')
if(!process.env.CLOUDBASE_ENV_ID)throw Error('缺少 CLOUDBASE_ENV_ID')
const db=cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  accessKey: process.env.CLOUDBASE_APIKEY
}).database(),stateDoc=db.collection('bot_state').doc('weixin')
let account=null,cursor='',qr=null,lastSuccess=null,stopped=false
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
async function persist(){try{await stateDoc.set({account,cursor})}catch(e){logDbError('bot_state.set',e);throw Error('Database state save failed')}}
async function load(){const result=await stateDoc.get(),data=Array.isArray(result.data)?result.data[0]:result.data;account=data?.account||null;cursor=data?.cursor||''}
async function reply(msg){
 if(msg.message_type!==1||msg.from_user_id!==account.owner||!msg.context_token)return
 const text=(msg.item_list||[]).filter(i=>i.type===1).map(i=>i.text_item?.text||'').join('\n')
 let answer,query
 try{query=parse(text)}catch(e){answer=e.message}
 if(query){try{const result=await db.collection('schedules').where({date:query.date}).limit(100).get();answer=format(query,result.data)}catch(e){logDbError('schedules.get',e);answer='档期查询暂时失败，请稍后重试。'}}
 const id=crypto.createHash('sha256').update(String(msg.message_id??msg.client_id??msg.seq)+':'+msg.from_user_id).digest('hex')
 await api('/ilink/bot/sendmessage',{msg:{from_user_id:'',to_user_id:msg.from_user_id,client_id:id,message_type:2,message_state:2,context_token:msg.context_token,item_list:[{type:1,text_item:{text:answer}}]},base_info:metadata},account.token,account.base)
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function poll(){while(!stopped){if(!account){await sleep(1000);continue}try{const data=await api('/ilink/bot/getupdates',{get_updates_buf:cursor,base_info:metadata},account.token,account.base);for(const msg of data.msgs||[])await reply(msg);if(data.get_updates_buf){cursor=data.get_updates_buf;await persist()}lastSuccess=new Date().toISOString()}catch(e){console.error('微信轮询失败',e.message);await sleep(e.message.includes('-14')?3600000:5000)}}}
function authorized(req){const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+process.env.ADMIN_TOKEN);return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected)}
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store')
 const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data))}
 if(req.url==='/healthz')return send(200,{ok:true})
 if(!authorized(req))return send(401,{error:'Unauthorized'})
 try{
 if(req.method==='GET'&&req.url==='/admin/status')return send(200,{bound:!!account,lastSuccess})
 if(req.method==='POST'&&req.url==='/admin/login'){
 if(account)return send(409,{error:'已绑定，无需重复登录'})
 const data=await api('/ilink/bot/get_bot_qrcode?bot_type=3',{local_token_list:[]});qr={id:data.qrcode,base:'https://ilinkai.weixin.qq.com'};return send(200,{qrcode:data.qrcode,qrcode_img_content:data.qrcode_img_content})
 }
 if(req.method==='POST'&&req.url==='/admin/login/status'){
 if(!qr)return send(400,{error:'请先获取二维码'})
 const data=await api('/ilink/bot/get_qrcode_status?qrcode='+encodeURIComponent(qr.id),undefined,null,qr.base)
 if(data.status==='scaned_but_redirect'&&data.redirect_host)qr.base=safeBase(data.redirect_host.includes('://')?data.redirect_host:'https://'+data.redirect_host)
 if(data.status==='confirmed'){
 if(!data.bot_token||!data.ilink_user_id)throw Error('绑定信息不完整')
 account={token:data.bot_token,owner:data.ilink_user_id,base:safeBase(data.baseurl)};cursor='';try{await persist()}catch(e){account=null;throw e}qr=null
 }
 return send(200,{status:data.status})
 }
 send(404,{error:'Not found'})
 }catch{console.error('管理操作失败');send(502,{error:'操作失败，请检查数据库权限、配置和微信连接'})}
}).listen(Number(process.env.PORT||8080),'0.0.0.0',()=>{load().then(()=>poll()).catch(e=>{logDbError('bot_state.get',e);console.error('无法读取 bot_state，请检查集合、API Key 和数据库权限');process.exit(1)})})
process.on('SIGTERM',()=>{stopped=true;process.exit(0)})
