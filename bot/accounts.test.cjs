const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),test=require('node:test')
test('迁移旧绑定，分离授权、凭证和游标，持久化多个微信',async()=>{
 const writes=[],calls=[]
 const sandbox={require(name){if(name==='@cloudbase/node-sdk')return {init:()=>({database:()=>({collection:()=>({doc:()=>({set:async value=>writes.push(value),get:async()=>({data:{account:{owner:'first',token:'token1'},cursor:'old-cursor'}})})})})})};return require(name==='./query'?'./query':name)},process:{env:{ADMIN_TOKEN:'x'.repeat(32),CLOUDBASE_ENV_ID:'test',CLOUDBASE_APIKEY:'test-key'},on(){}},console:{info(){},error(){}},URL,Buffer,AbortSignal,setTimeout,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({})}}}
 let source=fs.readFileSync(__dirname+'/server.js','utf8')
 source=source.slice(0,source.indexOf('http.createServer'))
 const context=vm.createContext(sandbox);vm.runInContext(source,context)
 await vm.runInContext("startPoll=()=>{};load()",context)
 assert.equal(vm.runInContext('accounts[0].cursor',context),'old-cursor')
 await vm.runInContext("accounts.push({owner:'second',token:'token2',cursor:'second-cursor'});persist()",context)
 assert.equal(writes[0].accounts.length,2)
 assert.equal(writes[0].accounts[1].cursor,'second-cursor')
 await vm.runInContext("reply({message_type:1,from_user_id:'first',context_token:'ctx'},accounts[1])",context)
 assert.equal(calls.length,0)
 await vm.runInContext("reply({message_type:1,from_user_id:'second',context_token:'ctx',item_list:[]},accounts[1])",context)
 assert.equal(calls.length,1)
 assert.equal(calls[0].options.headers.Authorization,'Bearer token2')
 assert.equal(JSON.parse(calls[0].options.body).msg.to_user_id,'second')
})
