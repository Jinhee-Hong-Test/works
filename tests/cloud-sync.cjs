const {readFileSync}=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(readFileSync('cloud/engine.js','utf8'),ctx);const Engine=ctx.window.PWorksSyncEngine;
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 let server={revision:0,payload:{tasks:[]}},stored,status,applied,ids=0,calls=0;
 const write=async p=>{calls++;if(server.id===p.id)return clone(server);if(server.revision!==p.revision)throw Object.assign(Error(),{conflict:true});server={revision:server.revision+1,payload:clone(p.payload),id:p.id};return clone(server)};
 const make=(overrides={})=>new Engine({read:async()=>clone(server),write,persist:s=>stored=clone(s),apply:p=>applied=clone(p),status:s=>status=s,uuid:()=>String(++ids),...overrides});
 let e=make();await e.tick();assert.equal(e.state.revision,0);e.change({tasks:['A']});await e.tick();assert.equal(server.payload.tasks[0],'A');assert.equal(status,'synced');
 server={revision:2,payload:{tasks:['B']}};await e.tick();assert.equal(applied.tasks[0],'B');
 e.change({tasks:['C']});server={revision:3,payload:{tasks:['D']}};await e.tick();assert.equal(status,'conflict');assert.equal(e.state.payload.tasks[0],'C');assert.equal(server.payload.tasks[0],'D');await e.useServer();assert.equal(e.state.payload.tasks[0],'D');
 // Lost response retries use the same request ID without incrementing twice.
 let lost=true;e=make({initial:clone(e.state),write:async p=>{const row=await write(p);if(lost){lost=false;throw Error('network');}return row;}});e.change({tasks:['E']});await e.tick();const revision=server.revision;assert(e.state.pending);await e.tick();assert.equal(server.revision,revision);assert.equal(e.state.pending,null);
 // Edit during a pending write is saved by the following write.
 let release;e=make({initial:clone(e.state),write:async p=>{await new Promise(r=>release=r);return write(p)}});e.change({tasks:['F']});const sending=e.tick();e.change({tasks:['G']});release();await sending;assert.equal(e.state.dirty,true);assert.equal(e.state.payload.tasks[0],'G');e.write=write;await e.tick();assert.equal(server.payload.tasks[0],'G');
 // A pending read cannot overwrite a new edit.
 e=make({initial:clone(e.state),read:()=>new Promise(r=>release=r)});const reading=e.tick();e.change({tasks:['H']});release({revision:99,payload:{tasks:['remote']}});await reading;assert.equal(e.state.payload.tasks[0],'H');
 // Queued work survives recreation, quota errors do not acknowledge edits.
 const recovered=make({initial:clone(stored)});await recovered.tick();assert.equal(server.payload.tasks[0],'H');
 const quota=make({persist:()=>{throw Error('quota')}});assert.throws(()=>quota.change({tasks:['lost']}));assert.equal(quota.state.payload,null);
 // Anonymous/expired auth never clears dirty content.
 e=make({initial:clone(recovered.state),write:async()=>{throw Object.assign(Error(),{auth:true})}});e.change({tasks:['I']});await e.tick();assert.equal(status,'auth');assert.equal(e.state.payload.tasks[0],'I');
 console.log('PASS: upload, pull, conflict, retry idempotency, edits during requests, draft recovery, quota and auth failures');
})().catch(e=>{console.error(e);process.exitCode=1});
