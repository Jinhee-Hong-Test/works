// Business data uses direct Postgres only; Auth validates the user token.
import postgres from 'npm:postgres@3.4.7';

const empty = () => ({version:3,tasks:[],projects:[],vacations:[],projectColors:{},projectDeadlines:{},projectCompletions:{},dayNotes:{},meetings:[]});
const failure = (code, status) => Object.assign(new Error(code), {code,status});
export function validSave(body) {
  const p=body.new_payload;
  return Number.isSafeInteger(body.expected_revision) && body.expected_revision>=0 &&
    typeof body.request_id==='string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.request_id) &&
    p && p.version===3 && ['tasks','projects','vacations'].every(k=>Array.isArray(p[k])) &&
    ['projectColors','projectDeadlines','projectCompletions'].every(k=>p[k] && typeof p[k]==='object' && !Array.isArray(p[k]));
}
export function createHandler({authenticate,execute,origins}) {
  return async req => {
    const origin=req.headers.get('origin');
    const headers={'Content-Type':'application/json','Vary':'Origin',
      'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods':'POST, OPTIONS'};
    if(origin && origins.includes(origin)) headers['Access-Control-Allow-Origin']=origin;
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    try {
      if(origin && !origins.includes(origin))throw failure('ORIGIN_DENIED',403);
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(req.method!=='POST')throw failure('METHOD_NOT_ALLOWED',405);
      const authorization=req.headers.get('authorization')||'';
      if(!/^Bearer \S+$/i.test(authorization))throw failure('AUTH_REQUIRED',401);
      const user=await authenticate(authorization);
      if(!user)throw failure('AUTH_REQUIRED',401);
      // Bound the stream before parsing, including requests without Content-Length.
      let size=0;const chunks=[];const reader=req.body?.getReader();
      if(!reader)throw failure('INVALID_REQUEST',400);
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5000000){await reader.cancel();throw failure('PAYLOAD_TOO_LARGE',413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw failure('INVALID_REQUEST',400);}
      if(!body||!['read','save'].includes(body.action)||(body.action==='save'&&!validSave(body)))throw failure('INVALID_REQUEST',400);
      const data=await execute(user,body);
      return reply(200,{ok:true,code:'OK',data});
    } catch(e) {
      return reply(e.status||500,{ok:false,code:e.code&&e.status?e.code:'SERVER_ERROR'});
    }
  };
}

// Runtime adapter: credentials remain inside Supabase, never in browser files.
const sql=postgres(Deno.env.get('SUPABASE_DB_URL'),{prepare:false,max:1,ssl:'require',connect_timeout:10,idle_timeout:20});
const authenticate=async authorization=>{
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/user',{
    headers:{Authorization:authorization,apikey:Deno.env.get('SUPABASE_ANON_KEY')},signal:AbortSignal.timeout(10000)});
  if(response.status===401||response.status===403)return null;
  if(!response.ok)throw Error('Auth unavailable');
  const user=await response.json();return user.id||null;
};
const execute=(user,body)=>sql.begin(async tx=>{
  const allowed=await tx`select user_id from public.pworks_allowed_users where user_id=${user} for share`;
  if(!allowed.length)throw failure('FORBIDDEN',403);
  if(body.action==='read'){
    const rows=await tx`select revision,payload from public.pworks_documents where user_id=${user}`;
    return rows[0]||{revision:0,payload:empty()};
  }
  await tx`insert into public.pworks_documents(user_id) values(${user}) on conflict do nothing`;
  const [current]=await tx`select revision,payload,mutation_id from public.pworks_documents where user_id=${user} for update`;
  if(current.mutation_id===body.request_id)return {revision:current.revision,payload:current.payload};
  if(current.revision!==body.expected_revision)throw failure('REVISION_CONFLICT',409);
  const [saved]=await tx`update public.pworks_documents set payload=${tx.json(body.new_payload)},revision=revision+1,mutation_id=${body.request_id},updated_at=now() where user_id=${user} returning revision,payload`;
  return saved;
});
Deno.serve(createHandler({authenticate,execute,origins:(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean)}));
