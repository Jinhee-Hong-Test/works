(() => {
  const bridge=window.PWorksBridge, cfg=window.P_WORKS_CLOUD||{};
  const empty=()=>({version:3,dayNotes:{},meetings:[],tasks:[],projects:[],projectColors:{},projectDeadlines:{},vacations:[],projectCompletions:{}});
  const style=document.createElement('style');style.textContent=`
  .cloud-controls{margin-top:auto;padding-top:24px;display:grid;gap:8px;font-size:12px;flex-shrink:0}.cloud-controls button{font-size:var(--sidebar-button-font-size,16px);height:48px;min-height:48px;padding-top:0;padding-bottom:0;line-height:1.25}@media(max-width:720px){.main > .cloud-controls{margin:24px 16px 0;padding:20px 0 calc(24px + env(safe-area-inset-bottom,0px));width:auto}.main > .cloud-controls button{width:100%}}
  #cloud-gate{position:fixed;inset:0;z-index:10000;background:#f5f5f5;display:grid;place-items:center;padding:20px}
  #cloud-gate[hidden],.cloud-controls [hidden]{display:none!important}
  .cloud-card{width:min(100%,400px);background:white;padding:28px;display:grid;gap:14px}
  .cloud-card input{width:100%;font-size:16px;background:#f3f3f3;padding:12px;border:0}
  .cloud-card .remember-login{display:flex;align-items:center;gap:8px;font-size:14px}.cloud-card .remember-login input{width:16px;height:16px;margin:0;accent-color:#000}.cloud-card h2{margin:0}.cloud-card button{padding:12px}.cloud-card p{font-size:13px;line-height:1.6}
  #cloud-message{font-size:13px;white-space:pre-wrap}#cloud-state{line-height:1.5}
  `;document.head.append(style);
  const controls=document.createElement('div');controls.className='cloud-controls';controls.innerHTML=`<span id="cloud-state" role="status">이 기기에 저장 중</span><button id="cloud-login">로그인 · 동기화</button><button id="cloud-migrate" hidden>이 기기 데이터 가져오기</button><button id="cloud-backup" hidden>미동기화 데이터 백업</button><button id="cloud-resolve" hidden>서버 데이터 불러오기</button><button id="cloud-logout" hidden>로그아웃</button>`;
  const sidebarActions=document.querySelector('.sidebar-actions');
  const mobileLayout=window.matchMedia('(max-width:720px)');
  function placeCloudControls(){
    if(mobileLayout.matches)document.querySelector('.main').append(controls);
    else sidebarActions.prepend(controls);
  }
  placeCloudControls();
  mobileLayout.addEventListener('change',placeCloudControls);
  const $=id=>document.getElementById(id);
  // Local file previews retain local storage; cloud authentication is for hosted sites.
  if(window.location.protocol==='file:'){
    $('cloud-state').textContent='';$('cloud-state').hidden=true;
    $('cloud-login').onclick=()=>alert('현재는 컴퓨터의 HTML 파일을 열고 있습니다. 로그인·자동 동기화는 배포된 사이트 주소에서 사용할 수 있습니다. 기존 업무는 이 기기에 계속 저장됩니다.');
    return;
  }
  if(!cfg.url||!cfg.publishableKey){$('cloud-login').onclick=()=>alert('클라우드 연결 준비가 필요합니다. cloud/SETUP.md를 따라 Supabase를 설정한 뒤 cloud/config.js에 프로젝트 URL과 공개 키를 입력하세요.');return;}
  let base;
  try {const u=new URL(cfg.url);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error();base=u.origin;
    if(cfg.publishableKey.startsWith('sb_secret_'))throw Error();
    if(cfg.publishableKey.startsWith('eyJ')){const payload=JSON.parse(atob(cfg.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error();}
    else if(!cfg.publishableKey.startsWith('sb_publishable_'))throw Error();
  }catch{alert('클라우드 설정을 확인하세요. Supabase HTTPS 주소와 publishable 또는 anon 키만 사용할 수 있습니다.');return;}
  const app=document.querySelector('.app');
  const localSnapshot=bridge.snapshot();
  const gate=document.createElement('section');gate.id='cloud-gate';gate.innerHTML=`<form class="cloud-card" id="cloud-form"><h2>WORKs</h2><p>같은 계정으로 로그인하면 PC와 아이폰에서 업무를 함께 사용할 수 있습니다.</p><input name="email" type="email" placeholder="이메일" aria-label="이메일" autocomplete="username" required><input name="password" type="password" placeholder="비밀번호" aria-label="비밀번호" autocomplete="current-password" required><label class="remember-login"><input name="remember" type="checkbox">로그인 상태 유지</label><button class="primary" type="submit">로그인</button><div id="cloud-message" role="status"></div></form>`;document.body.append(gate);
  let session=null,engine=null,applying=false,connecting=false,refreshing=null,releaseLock=null,lockUser=null;
  const sessionKey='pworks-auth:'+base;
  let rememberLogin=false;
  function clearSession(){sessionStorage.removeItem(sessionKey);localStorage.removeItem(sessionKey);}
  const userKey=id=>'pworks-draft:'+base+':'+id;
  const lock=()=>{gate.hidden=false;app.inert=true;};
  const unlock=()=>{gate.hidden=true;app.inert=false;};
  const apply=data=>{applying=true;try{bridge.apply(structuredClone(data));}finally{applying=false;}};
  function setStatus(state){
    const texts={synced:'동기화 완료',pending:'서버에 저장 대기 중',offline:'연결 오류 · 변경사항은 이 기기에 보관 중',conflict:'다른 기기의 변경과 충돌했습니다. 백업 후 서버 데이터를 불러오세요.',auth:'로그인이 만료되었습니다. 다시 로그인하세요.',forbidden:'계정 접근 권한을 확인하세요.'};
    $('cloud-state').textContent=texts[state]||state;
    $('cloud-resolve').hidden=state!=='conflict';$('cloud-backup').hidden=!engine?.state?.dirty&&!engine?.state?.pending;
    if(state==='auth'){lock();$('cloud-message').textContent=texts.auth;}
  }
  window.PWorksCloudSave=()=>{
    if(applying)return true;
    if(!engine||gate.hidden===false){bridge.notify('로그인 후 수정해주세요.');return false;}
    try{engine.change(bridge.snapshot());return true;}catch{bridge.notify('기기 저장 공간이 부족합니다. JSON 백업 후 다시 시도해주세요.');return false;}
  };
  async function request(path,body,token){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
      const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch{}
      if(!response.ok){const error=Error('Request failed');error.status=response.status;error.code=data?.error_code||data?.code||'';error.endpoint=path;error.auth=response.status===401;error.forbidden=response.status===403;error.conflict=(data?.code==='40001'||data?.code==='REVISION_CONFLICT');throw error;}
      return data;
    }finally{clearTimeout(timeout);}
  }
  function loginError(e,stage){
    const detail=e.status?' (HTTP '+e.status+(e.code?' · '+String(e.code).replace(/[^a-zA-Z0-9_]/g,'').slice(0,60):'')+')':'';
    if(e.message.startsWith('같은 계정')||e.message.startsWith('이 브라우저')||e.message.startsWith('저장된 동기화'))return e.message;
    if(stage==='auth'){
      if(e.code==='email_not_confirmed')return '이메일 확인이 필요합니다. Supabase Authentication에서 계정 확인 상태를 확인해주세요.'+detail;
      if(e.code==='invalid_credentials')return '이메일 또는 비밀번호가 일치하지 않습니다.'+detail;
      return '로그인 인증 단계에서 실패했습니다. Supabase 계정·공개키 또는 네트워크 연결을 확인해주세요.'+detail;
    }
    if(e.code==='ORIGIN_DENIED')return '로그인은 성공했지만 사이트 주소가 허용되지 않았습니다. ALLOWED_ORIGINS 설정을 확인해주세요.'+detail;
    if(e.code==='FORBIDDEN')return '로그인은 성공했지만 사용 권한이 없습니다. pworks_allowed_users의 User UID를 확인해주세요.'+detail;
    if(e.status===404)return '로그인은 성공했지만 pworks-sync 서버 함수를 찾지 못했습니다. 함수 이름과 배포 상태를 확인해주세요.'+detail;
    if(e.status===401)return '로그인은 성공했지만 서버 함수가 로그인 토큰을 거부했습니다. Edge Function의 JWT 설정을 확인해야 합니다.'+detail;
    if(e.status>=500)return '로그인은 성공했지만 서버 함수 실행에 실패했습니다. pworks-sync의 Logs를 확인해주세요.'+detail;
    return '로그인은 성공했지만 동기화 연결에 실패했습니다. 서버 함수의 CORS 설정·네트워크 연결을 확인해주세요.'+detail;
  }
  function storeSession(s){
    const next={access_token:s.access_token,refresh_token:s.refresh_token,user:s.user,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};
    const target=rememberLogin?localStorage:sessionStorage,other=rememberLogin?sessionStorage:localStorage;
    target.setItem(sessionKey,JSON.stringify(next));other.removeItem(sessionKey);session=next;
  }
  async function token(){
    if(!session)throw Object.assign(Error('Login required'),{auth:true});
    if(session.expires_at*1000>Date.now()+60000)return session.access_token;
    if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(storeSession).finally(()=>{refreshing=null;});
    await refreshing;return session.access_token;
  }
  const edge=async body=>{
    const result=await request('/functions/v1/pworks-sync',body,await token());
    if(!result.ok||!result.data||!Number.isInteger(result.data.revision))throw Error('Invalid server response');
    return result.data;
  };
  const read=()=>edge({action:'read'});
  const write=pending=>edge({action:'save',expected_revision:pending.revision,new_payload:pending.payload,request_id:pending.id});
  function backup(payload){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='J-WORKs-unsynced-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function acquireAccountLock(){
    if(lockUser===session.user.id)return;
    if(releaseLock){releaseLock();releaseLock=null;lockUser=null;}
    engine=null;
    if(!navigator.locks)throw Error('이 브라우저는 안전한 동기화를 지원하지 않습니다. 최신 Safari 또는 Chrome을 사용해주세요.');
    const user=session.user.id;
    await new Promise((resolve,reject)=>{
      navigator.locks.request('pworks:'+base+':'+user,{ifAvailable:true},async lock=>{
        if(!lock){reject(Error('같은 계정의 WORKs가 다른 탭에 열려 있습니다. 다른 탭을 닫고 다시 로그인해주세요.'));return;}
        await new Promise(release=>{releaseLock=release;lockUser=user;resolve();});
      }).catch(reject);
    });
  }
  async function connect(){
    await acquireAccountLock();
    const key=userKey(session.user.id);let cached=null;
    const raw=localStorage.getItem(key);
    if(raw){try{cached=JSON.parse(raw);if(!Number.isInteger(cached.revision)||cached.revision<0||!cached.payload)throw Error();}catch{throw Error('저장된 동기화 초안을 읽지 못했습니다. 저장소를 지우지 말고 문의해주세요.');}}
    const row=await read();
    const initial=cached&&(cached.dirty||cached.pending)?cached:{revision:row.revision,payload:row.payload,pending:null,dirty:false};
    apply(initial.payload);
    const nextEngine=new window.PWorksSyncEngine({read,write,apply,persist:s=>localStorage.setItem(key,JSON.stringify(s)),status:setStatus,uuid:()=>crypto.randomUUID(),initial});
    engine=nextEngine;unlock();$('cloud-login').hidden=true;$('cloud-logout').hidden=false;
    $('cloud-migrate').hidden=!(localSnapshot.tasks.length||localSnapshot.projects.length||localSnapshot.vacations.length||localSnapshot.meetings?.length||Object.keys(localSnapshot.dayNotes||{}).length);
    $('cloud-message').textContent='';
    await engine.tick();
  }
  $('cloud-form').onsubmit=async event=>{
    event.preventDefault();if(connecting)return;let stage='auth';connecting=true;const f=event.target;f.querySelector('button').disabled=true;$('cloud-message').textContent='로그인 중…';
    try{
      const result=await request('/auth/v1/token?grant_type=password',{email:f.elements.email.value.trim(),password:f.elements.password.value});
      // Pending work from another account remains in its own account-specific cache.
      stage='sync';rememberLogin=f.elements.remember.checked;storeSession(result);f.elements.password.value='';await connect();
    }catch(e){$('cloud-message').textContent=loginError(e,stage);}
    finally{connecting=false;f.querySelector('button').disabled=false;}
  };
  $('cloud-backup').onclick=()=>backup(engine.state.payload);
  $('cloud-resolve').onclick=async()=>{
    if(!engine||engine.busy)return;
    if(!confirm('이 기기의 변경사항을 JSON으로 백업한 뒤 서버의 최신 내용으로 교체할까요?'))return;
    backup(engine.state.payload);app.inert=true;
    try{await engine.useServer();}catch{setStatus('conflict');bridge.notify('서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');}finally{app.inert=false;}
  };
  $('cloud-migrate').onclick=()=>{
    if(!engine||engine.conflict||engine.busy)return;
    if(!confirm('기존 이 기기의 데이터를 현재 클라우드 계정으로 가져올까요? 서버의 현재 데이터는 교체되며 먼저 JSON으로 백업됩니다.'))return;
    backup(engine.state.payload);
    try{engine.change(localSnapshot);apply(localSnapshot);$('cloud-migrate').hidden=true;}catch{bridge.notify('데이터를 가져오지 못했습니다. 저장 공간을 확인해주세요.');}
  };
  $('cloud-logout').onclick=async()=>{
    if(engine?.busy){bridge.notify('동기화가 끝난 후 다시 시도해주세요.');return;}
    if((engine?.state.dirty||engine?.state.pending)&&!confirm('미동기화 내용은 이 기기에 보관됩니다. 같은 계정으로 다시 로그인하면 이어서 동기화합니다. 로그아웃할까요?'))return;
    const old=session;session=null;engine=null;if(releaseLock)releaseLock();releaseLock=null;lockUser=null;clearSession();$('cloud-form').elements.remember.checked=false;rememberLogin=false;apply(empty());lock();$('cloud-message').textContent='';
    if(old)request('/auth/v1/logout?scope=local',{},old.access_token).catch(()=>{});
  };
  // Foreground polling works on iPhone too; background tabs are not promised real-time delivery.
  const tick=()=>{if(engine&&gate.hidden&&!bridge.editing()&&!document.hidden)engine.tick();};
  setInterval(tick,3000);window.addEventListener('online',tick);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
  window.addEventListener('beforeunload',event=>{if(engine?.state.dirty||engine?.state.pending){event.preventDefault();event.returnValue='';}});
  lock();
  try{
    const persistent=localStorage.getItem(sessionKey);
    const saved=persistent||sessionStorage.getItem(sessionKey);
    if(saved){
      rememberLogin=!!persistent;$('cloud-form').elements.remember.checked=rememberLogin;
      session=JSON.parse(saved);
      if(!session?.user?.id||!session.access_token||!session.refresh_token){clearSession();session=null;}
      else connect().catch(e=>{$('cloud-message').textContent=loginError(e,'sync');});
    }
  }catch{$('cloud-message').textContent='저장된 로그인 정보를 읽지 못했습니다. 다시 로그인해주세요.';}
})();
