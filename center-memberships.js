/* Read own snapshots automatically; the explicit refresh uses a self-only server endpoint. */
(() => {
  'use strict';
  const panel=document.getElementById('centerMemberships');
  if(!panel)return;
  const message=document.getElementById('centerMembershipMessage'),list=document.getElementById('centerMembershipList');
  let client=null,user='',epoch=0,request=0,abort=null,busy=false,cache=null,loadedAt=0,error=false;
  let refreshing=false,refreshMessage='',refreshFailed=false,cooldownUntil=0,cooldownTimer=0;
  const refreshButton=document.createElement('button');
  refreshButton.id='refreshMemberMemberships';refreshButton.type='button';
  refreshButton.setAttribute('aria-label','브로제이 최신 회원권 정보 확인');
  refreshButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 7a8 8 0 1 0 1 7M20 3v5h-5"/></svg>';
  const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const visible=()=>client&&user&&!document.getElementById('appScreen').hidden&&!document.getElementById('workoutLogTabPanel').hidden&&document.visibilityState!=='hidden';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const date=v=>`${v.slice(2,4)}. ${v.slice(5,7)}. ${v.slice(8,10)}`;
  function node(tag,cls,value){const n=document.createElement(tag);n.className=cls;n.textContent=value;return n;}
  function validate(data){
    if(!data||typeof data.is_linked!=='boolean'||typeof data.stale!=='boolean'||!Array.isArray(data.tickets)||data.tickets.length>200||
      !(data.synced_at===null||typeof data.synced_at==='string'&&Number.isFinite(Date.parse(data.synced_at))))throw Error('INVALID_MEMBERSHIPS');
    // Older snapshots may still contain other ticket types. They never affect this display.
    const tickets=data.tickets.filter(t=>t&&t.kind==='membership');
    for(const t of tickets){
      if(typeof t.name!=='string'||!t.name.trim()||t.name.length>200||
        !['ACTIVE','INACTIVE','SOON_ACTIVE','SOON_INACTIVE','HOLDING','UNKNOWN'].includes(t.status)||
        !['start_at','end_at'].every(k=>t[k]===null||day(t[k])))throw Error('INVALID_TICKET');
    }
    return {...data,tickets};
  }
  function expiries(tickets,now){
    const items=tickets.filter(t=>!['INACTIVE','UNKNOWN'].includes(t.status)&&t.end_at&&t.end_at>=now&&(!t.start_at||t.start_at<=t.end_at));
    const waiting=t=>t.status==='SOON_ACTIVE'||t.start_at&&t.start_at>now;
    const current=items.filter(t=>!waiting(t)).map(t=>t.end_at).sort().at(-1)||null;
    const pending=items.filter(waiting).sort((a,b)=>(a.start_at||'9999-12-31').localeCompare(b.start_at||'9999-12-31')||a.end_at.localeCompare(b.end_at));
    // Keep scheduled entitlements separate even when the periods are continuous.
    return {current,waiting:[...new Set(pending.map(t=>t.end_at))]};
  }
  function render(){
    const wasFocused=document.activeElement===refreshButton;
    panel.hidden=!user;list.replaceChildren();
    let msg='헬스회원권 만료일을 확인하고 있어요.';
    if(!cache){if(error)msg='헬스회원권 만료일을 불러오지 못했어요. 새로고침해 주세요.';}
    else if(!cache.is_linked)msg='앱 가입 후 1시간 정도 후에 만료일을 확인할 수 있어요.';
    else if(!cache.synced_at)msg='헬스회원권 정보를 연결하고 있어요.';
    else {
      const ends=expiries(cache.tickets,today());
      const uncertain=cache.tickets.some(t=>t.status!=='INACTIVE'&&(t.status==='UNKNOWN'||!t.end_at||t.start_at&&t.start_at>t.end_at));
      const hasDates=ends.current||ends.waiting.length;
      msg=hasDates?'':uncertain?'헬스회원권 만료일 확인이 필요해요. 센터에 문의해 주세요.':'현재 이용 중이거나 시작 예정인 헬스회원권이 없어요.';
      add('현재 헬스회원권 만료일: ',ends.current?date(ends.current):uncertain?'확인 필요':'없음','current');
      for(const end of ends.waiting)add('이용 대기 회원권 만료일: ',date(end),'waiting');
      if(hasDates&&uncertain)msg='일부 헬스회원권의 만료일은 확인이 필요해요.';
      if(error||cache.stale)msg='정보 갱신이 늦어지고 있어요. 변경 사항은 센터에 확인해 주세요.';
    }
    function add(label,value,state){
      const li=node('li','center-membership-item','');li.dataset.state=state;
      const end=node('span','center-membership-date-actions','');end.append(node('strong','center-membership-expiry',value));
      if(state==='current')end.append(refreshButton);
      li.append(node('span','center-membership-label',label),end);list.append(li);
    }
    if(user&&!list.children.length)add('현재 헬스회원권 만료일: ',cache?.is_linked===false?'연결 전':'확인 중','current');
    const remaining=Math.max(0,cooldownUntil-Date.now());
    refreshButton.disabled=!user||!client||busy||refreshing||remaining>0||cache?.is_linked===false;
    refreshButton.setAttribute('aria-busy',String(refreshing));
    refreshButton.title=refreshing?'브로제이에서 회원권을 확인하고 있어요':remaining>0?`${Math.ceil(remaining/1000)}초 후 다시 확인할 수 있어요`:'브로제이 최신 회원권 정보 확인';
    clearTimeout(cooldownTimer);cooldownTimer=remaining>0?setTimeout(()=>{cooldownTimer=0;render();},remaining+30):0;
    if(wasFocused&&!refreshButton.disabled)refreshButton.focus({preventScroll:true});
    message.textContent=[msg,refreshMessage].filter(Boolean).join(' ');message.hidden=!message.textContent;
    message.classList.toggle('is-error',refreshFailed);
  }
  function reset(){epoch++;request++;abort?.abort();abort=null;client=null;user='';busy=false;cache=null;loadedAt=0;error=false;
    refreshing=false;refreshMessage='';refreshFailed=false;cooldownUntil=0;clearTimeout(cooldownTimer);cooldownTimer=0;render();}
  function start(connection,id){reset();client=connection;user=id;render();}
  async function load(force=false,afterRefresh=false){
    if(!visible()||busy||refreshing&&!afterRefresh||!force&&cache&&Date.now()-loadedAt<60000)return false;
    const e=epoch,r=++request,owner=user;let timer;busy=true;error=false;abort=new AbortController();const controller=abort;render();
    try{
      let q=client.rpc('broj_my_memberships');if(typeof q.abortSignal==='function')q=q.abortSignal(controller.signal);
      const result=await Promise.race([q,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'));},10000);})]);if(e!==epoch||r!==request||owner!==user)return;
      if(result.error)throw Error('LOAD_FAILED');cache=validate(result.data);loadedAt=Date.now();return true;
    }catch(_){if(e===epoch&&r===request)error=true;return false;}
    finally{clearTimeout(timer);if(e===epoch&&r===request){busy=false;abort=null;render();}}
  }
  async function refreshLatest(){
    if(!visible()||busy||refreshing||Date.now()<cooldownUntil||cache?.is_linked===false)return;
    const e=epoch,owner=user,db=client,started=Date.now();let timer,failureText='';
    const current=()=>e===epoch&&owner===user&&client===db;
    refreshing=true;refreshFailed=false;refreshMessage='브로제이에서 최신 회원권 정보를 확인하고 있어요.';render();
    try{
      const result=await Promise.race([db.functions.invoke('member-membership-refresh',{body:{expected_user_id:owner}}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TIMEOUT')),65000);})]);
      if(!current())return;
      let body=result.data;
      if(result.error){try{body=await result.error.context?.json();}catch(_){}if(!current())return;}
      if(result.error||body?.ok!==true){
        const retry=body?.retry_after_seconds;
        cooldownUntil=Date.now()+(Number.isInteger(retry)&&retry>0&&retry<=120?retry:60)*1000;
        const messages={COOLDOWN:'잠시 후 다시 확인해 주세요.',BUSY:'회원권 정보를 갱신 중이에요. 잠시 후 다시 눌러 주세요.',
          NOT_LINKED:'센터 출석 연결 후 회원권을 확인할 수 있어요.',SYNC_DISABLED:'회원권 정보 확인이 잠시 중단됐어요. 센터에 문의해 주세요.',
          API_BUDGET:'조회가 많아 잠시 후 다시 확인할 수 있어요.',AUTH_REQUIRED:'로그인 상태를 확인한 뒤 다시 시도해 주세요.',ACCOUNT_CHANGED:'로그인 상태가 변경됐어요.'};
        failureText=Object.hasOwn(messages,body?.code)?messages[body.code]:'최신 회원권 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';throw Error('REFRESH_FAILED');
      }
      if(body.user_id!==owner||body.version!==1||typeof body.synced_at!=='string'||!Number.isFinite(Date.parse(body.synced_at)))throw Error('INVALID_RESPONSE');
      cooldownUntil=Math.max(Date.now(),started+60000);
      if(!visible()){loadedAt=0;refreshMessage='';return;}
      const listed=await load(true,true);if(!current())return;
      if(!listed){failureText='정보 조회는 완료됐지만 화면에 불러오지 못했어요. 잠시 후 다시 확인해 주세요.';throw Error('READ_FAILED');}
      refreshMessage='브로제이의 최신 회원권 정보를 확인했어요.';
    }catch(err){if(current()){
      cooldownUntil=Math.max(cooldownUntil,started+60000);refreshFailed=true;
      refreshMessage=failureText||'조회 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
    }}finally{clearTimeout(timer);if(current()){refreshing=false;render();}}
  }
  refreshButton.addEventListener('click',()=>void refreshLatest());
  window.CenterMemberships=Object.freeze({start,reset,load});
})();
