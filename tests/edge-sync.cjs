const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('supabase/functions/pworks-sync/index.ts','utf8').replace(/^import .*;$/m,'').split('// Runtime adapter:')[0].replaceAll('export function','function');
const ctx={Request,Response,TextDecoder,Uint8Array};vm.createContext(ctx);vm.runInContext(source+';this.handler=createHandler;this.validate=validSave',ctx);
(async()=>{
 let calls=0;const handler=ctx.handler({origins:['https://example.com'],authenticate:async a=>a==='Bearer good'?'user-a':null,execute:async(user,body)=>{calls++;assert.equal(user,'user-a');if(body.action==='save')throw Object.assign(Error(),{code:'REVISION_CONFLICT',status:409});return {revision:0,payload:{}};}});
 const req=(body,auth='Bearer good',origin='https://example.com')=>new Request('https://edge.example',{method:'POST',headers:{authorization:auth,origin},body:JSON.stringify(body)});
 assert.equal((await handler(req({action:'read'},'Bearer bad'))).status,401);
 assert.equal((await handler(req({action:'read'},'Bearer good','https://evil.example'))).status,403);
 assert.equal(calls,0);
 assert.equal((await handler(req({action:'save'}))).status,400);
 assert.equal((await handler(req({action:'read',user_id:'other-user'}))).status,200);
 const save={action:'save',expected_revision:0,request_id:'12345678-1234-1234-1234-123456789abc',new_payload:{version:3,tasks:[],projects:[],vacations:[],projectColors:{},projectDeadlines:{},projectCompletions:{}}};
 const conflict=await handler(req(save));assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'REVISION_CONFLICT');
 save.expected_revision=-1;assert.equal((await handler(req(save))).status,400);
 console.log('Edge handler checks passed: auth, origin, validation, trusted identity, conflict.');
})().catch(e=>{console.error(e);process.exitCode=1;});
