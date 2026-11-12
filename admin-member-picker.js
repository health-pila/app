/* Keep the native member selector; classification is read-only and never changes access. */
(() => {
  'use strict';
  if (window.AdminMemberPicker) return;
  const $=id=>document.getElementById(id),select=$('adminMemberSelect'),screen=$('adminScreen');
  if(!select||!screen)return;
  let client=null,user='',epoch=0,seq=0,ready=false,busy=false,lastRead=0,linked=new Set(),revision=0,updates=new Map();
  let eligibilitySeq=0,eligibilityBusy=false,eligibilityLoaded=false,eligibilityReadAt=0,eligibilityFailed=false;
  let eligibility=new Map(),roster=[],chosenFilter='all',eligibilityTimer=null,eligibilityRevision=0,eligibilityChanges=new Map();
  const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
  const date=x=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
  const active=e=>e===epoch&&user&&client&&!screen.hidden;
  const linkState=id=>active(epoch)?updates.get(id)?.linked??(ready?linked.has(id):null):null;
  const notify=()=>select.dispatchEvent(new Event('attendance-status-change'));
  const notifyEligibility=()=>select.dispatchEvent(new Event('eligibility-status-change'));
  const captureSync=()=>({epoch,seq,revision});
  const labels={valid:'유효',expired:'만료·없음',review:'확인 필요'};
  const reasons={
    current_entitlement:'헬스 또는 필라테스 이용권이 유효해요.',
    expired_or_exhausted:'헬스·필라테스 이용권의 기간이 만료되었거나 수강 횟수가 소진됐어요.',
    no_qualifying_ticket:'이용 중인 헬스·필라테스 이용권이 없어요. PT만 보유한 경우도 포함돼요.',
    holding:'홀딩 중이거나 홀딩 기간 확인이 필요해요.',scheduled:'이용 예정인 이용권이 있어요. 현재 이용 가능 여부를 확인해 주세요.',
    attendance_not_allowed:'이용권에 입장 제한 상태가 있어요. 브로제이에서 확인해 주세요.',
    unlinked:'센터 출석 연결 후 이용권 정보를 확인할 수 있어요.',
    not_collected:'이용권 정보를 수집 중이에요. 아직 만료 여부를 판단하지 않아요.',
    incomplete:'일부 이용권 정보를 확인하지 못했어요. 브로제이에서 확인해 주세요.',
    sync_error:'최근 이용권 조회에 실패했어요. 만료로 판단하지 않아요.',
    stale:'이용권 정보를 다시 확인해야 해요. 분류 새로고침 후에도 같으면 브로제이에서 확인해 주세요.',
    invalid_period:'이용권 기간을 확인해 주세요.',lesson_kind_unknown:'필라테스 수강권 종류를 확인해 주세요.',
    lesson_count_unknown:'필라테스 잔여 횟수 또는 포인트 이용권을 확인해 주세요.',
    unknown_ticket:'이용권 종류나 상태를 확인해 주세요.',
    loading:'이용권 분류를 확인하고 있어요.',read_failed:'분류를 불러오지 못했어요. 분류 새로고침을 눌러 주세요.',
  };
  const review=reason=>({state:'review',reason,basis:null,valid_until:null,synced_at:null});
  function eligibilityState(id){
    if(!active(epoch))return review('loading');
    if(!eligibilityLoaded)return review(eligibilityFailed?'read_failed':'loading');
    const value=eligibility.get(id);
    if(!value)return review('not_collected');
    if(value.state==='review')return value;
    const time=Date.parse(value.synced_at),now=Date.now();
    const koreaDay=new Date(now+9*3600000).toISOString().slice(0,10);
    if(!Number.isFinite(time)||time<now-8*3600000||time>now+60000||
      value.state==='valid'&&value.valid_until<koreaDay)return {...value,state:'review',reason:'stale',basis:null,valid_until:null};
    return value;
  }
  function renderEligibility(){
    const enabled=Boolean(active(epoch)),counts={all:roster.length,valid:0,expired:0,review:0};
    for(const id of roster)counts[eligibilityState(id).state]++;
    for(const button of document.querySelectorAll('[data-eligibility-filter]')){
      button.setAttribute('aria-pressed',String(button.dataset.eligibilityFilter===chosenFilter));button.disabled=!enabled;
    }
    for(const count of document.querySelectorAll('[data-eligibility-count]')){
      const key=count.dataset.eligibilityCount;count.textContent=key==='all'||eligibilityLoaded?String(counts[key]):'—';
    }
    const refreshButton=$('adminMemberEligibilityRefresh');
    refreshButton.disabled=!enabled||eligibilityBusy;refreshButton.textContent=eligibilityBusy?'확인 중…':'분류 새로고침';
    $('adminMemberEligibilityStatus').textContent=eligibilityFailed?'분류를 불러오지 못했어요. 모든 회원은 확인 필요로 표시돼요.':
      eligibilityBusy?'이용권 분류를 확인하고 있어요.':'헬스·필라테스 기준 · 이용권 정보는 6시간마다 자동 수집돼요.';
    const selected=select.value,details=$('adminMemberEligibilityDetails'),value=eligibilityState(selected);
    details.hidden=!enabled||!selected;
    if(!details.hidden){
      const badge=$('adminMemberEligibilityBadge');badge.textContent=labels[value.state];badge.dataset.state=value.state;
      const basis={gym:'헬스회원권이 유효해요.',pilates:'필라테스 수강권이 유효하고 잔여 횟수가 있어요.',gym_and_pilates:'헬스회원권과 필라테스 수강권이 유효해요.'};
      $('adminMemberEligibilityReason').textContent=value.state==='valid'?basis[value.basis]||reasons.current_entitlement:reasons[value.reason]||reasons.unknown_ticket;
      const at=Date.parse(value.synced_at);
      $('adminMemberEligibilitySyncedAt').textContent=Number.isFinite(at)?'정보 확인: '+new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'';
    }
    $('adminMemberEligibilityPinned').hidden=!enabled||!selected||chosenFilter==='all'||value.state===chosenFilter;
  }
  function refresh(){
    for(const option of select.options){
      if(!option.value)continue;
      if(!option.dataset.memberBaseText)option.dataset.memberBaseText=option.textContent;
      const state=linkState(option.value);
      const attendance=state===null?'출석 확인 필요':state?'출석 연결':'출석 미연결';
      const text=labels[eligibilityState(option.value).state]+' · '+option.dataset.memberBaseText+' · '+attendance;
      if(option.textContent!==text)option.textContent=text;
    }
    renderEligibility();
  }
  function invalidateChangedLinks(before,after){
    if(!eligibilityLoaded)return false;
    let changed=false;
    for(const [id,value] of eligibility){
      if(before.has(id)!==after.has(id)){eligibility.set(id,{...review('not_collected'),user_id:id});eligibilityChanges.set(id,++eligibilityRevision);changed=true;}
    }
    if(changed)eligibilityReadAt=0;
    return changed;
  }
  function applySync(ids,ticket){
    if(!ticket||!active(ticket.epoch)||ticket.seq!==seq||!Array.isArray(ids)||ids.length>100000||!ids.every(uuid))return;
    const before=linked,hadSnapshot=ready;
    seq++;busy=false;linked=new Set(ids);ready=true;lastRead=Date.now();
    for(const [id,v] of updates){if(v.revision>ticket.revision){if(v.linked)linked.add(id);else linked.delete(id);}else updates.delete(id);}
    const changed=hadSnapshot&&invalidateChangedLinks(before,linked);
    refresh();notify();if(changed){notifyEligibility();void loadEligibility();}
  }
  async function loadLinks(force=false){
    const e=epoch;if(!active(e)||busy||(!force&&ready&&Date.now()-lastRead<30000))return;
    const request=++seq,version=revision;busy=true;notify();
    try{
      const {data,error}=await client.rpc('broj_admin_linked_member_ids');
      if(!active(e)||request!==seq)return;
      if(error||!data||!Array.isArray(data.linked_user_ids)||data.linked_user_ids.length>100000||!data.linked_user_ids.every(uuid))throw Error('invalid');
      const before=linked,hadSnapshot=ready;
      linked=new Set(data.linked_user_ids);ready=true;lastRead=Date.now();
      for(const [id,v] of updates){if(v.revision>version){if(v.linked)linked.add(id);else linked.delete(id);}else updates.delete(id);}
      if(hadSnapshot&&invalidateChangedLinks(before,linked)){notifyEligibility();void loadEligibility();}
    }catch(_){if(active(e)&&request===seq){ready=false;linked.clear();updates.clear();}}
    finally{if(active(e)&&request===seq){busy=false;refresh();notify();}}
  }
  async function loadEligibility(force=false){
    const e=epoch;if(!active(e)||document.visibilityState!=='visible'||eligibilityBusy||(!force&&Date.now()-eligibilityReadAt<30000))return;
    const request=++eligibilitySeq,db=client,version=eligibilityRevision;eligibilityBusy=true;refresh();
    let refreshAgain=false;
    const abort=new AbortController();let timer;
    try{
      let query=db.rpc('broj_admin_member_eligibility');if(query.abortSignal)query=query.abortSignal(abort.signal);
      const {data,error}=await Promise.race([query,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('TIMEOUT'));},10000);})]);
      if(!active(e)||request!==eligibilitySeq)return;
      if(error||data?.ok!==true||data.version!==1||data.automatic_restriction!==false||
        !Array.isArray(data.members)||data.members.length>100000)throw Error('INVALID_ELIGIBILITY');
      const entries=new Map();
      for(const value of data.members){
        if(!value||!uuid(value.user_id)||entries.has(value.user_id)||!['valid','expired','review'].includes(value.state)||
          typeof value.member_linked!=='boolean'||value.synced_at!==null&&(typeof value.synced_at!=='string'||!Number.isFinite(Date.parse(value.synced_at)))||
          value.state!=='review'&&value.member_linked!==true||
          value.state==='valid'&&(!['gym','pilates','gym_and_pilates'].includes(value.basis)||!date(value.valid_until)))throw Error('INVALID_ELIGIBILITY');
        entries.set(value.user_id,Object.freeze({user_id:value.user_id,state:value.state,reason:Object.hasOwn(reasons,value.reason)?value.reason:'unknown_ticket',
          basis:value.basis,valid_until:value.valid_until,synced_at:value.synced_at}));
      }
      for(const [id,changed] of eligibilityChanges){
        if(changed>version){entries.delete(id);refreshAgain=true;}else eligibilityChanges.delete(id);
      }
      eligibility=entries;eligibilityLoaded=true;eligibilityFailed=false;eligibilityReadAt=refreshAgain?0:Date.now();
    }catch(_){if(active(e)&&request===eligibilitySeq){eligibility.clear();eligibilityLoaded=false;eligibilityFailed=true;eligibilityReadAt=Date.now();}}
    finally{clearTimeout(timer);if(active(e)&&request===eligibilitySeq){eligibilityBusy=false;refresh();notifyEligibility();if(refreshAgain)void loadEligibility();}}
  }
  function setLink(id,value){
    if(!active(epoch)||!uuid(id)||typeof value!=='boolean')return;
    const previous=linkState(id);updates.set(id,{linked:value,revision:++revision});if(value)linked.add(id);else linked.delete(id);
    if(previous!==value){eligibility.delete(id);eligibilityChanges.set(id,++eligibilityRevision);eligibilityReadAt=0;notifyEligibility();void loadEligibility();}
    refresh();notify();
  }
  function setRoster(ids){if(!active(epoch)||!Array.isArray(ids)||!ids.every(uuid))return;roster=[...new Set(ids)];renderEligibility();}
  function reset(){
    epoch++;seq++;eligibilitySeq++;clearTimeout(eligibilityTimer);eligibilityTimer=null;
    client=null;user='';ready=false;busy=false;lastRead=0;linked.clear();updates.clear();revision=0;
    eligibility.clear();eligibilityChanges.clear();eligibilityRevision=0;eligibilityLoaded=false;eligibilityBusy=false;eligibilityReadAt=0;eligibilityFailed=false;roster=[];chosenFilter='all';
    refresh();notify();notifyEligibility();
  }
  function scheduleEligibility(){
    clearTimeout(eligibilityTimer);
    if(active(epoch))eligibilityTimer=setTimeout(()=>{if(document.visibilityState==='visible'){refresh();notifyEligibility();void loadEligibility();}scheduleEligibility();},300000);
  }
  function start(connection,id){reset();client=connection;user=id;refresh();void loadLinks();void loadEligibility();scheduleEligibility();}
  function revisit(){if(document.visibilityState==='visible'){void loadLinks();void loadEligibility();}}
  select.addEventListener('focus',revisit);
  window.addEventListener('focus',revisit);
  document.addEventListener('visibilitychange',revisit);
  $('adminMemberEligibilityRefresh').addEventListener('click',()=>void loadEligibility(true));
  $('adminMemberEligibilityFilters').addEventListener('click',event=>{
    const button=event.target.closest('[data-eligibility-filter]');
    if(!active(epoch)||!button||button.disabled)return;
    chosenFilter=button.dataset.eligibilityFilter;refresh();notifyEligibility();void loadEligibility();
  });
  new MutationObserver(refresh).observe(select,{childList:true});
  new MutationObserver(()=>{if(screen.hidden&&user)reset();}).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.AdminMemberPicker=Object.freeze({start,reset,refresh,setLink,linkState,captureSync,applySync,setRoster,
    eligibilityState,loadEligibility,filter:()=>chosenFilter,eligibilityReady:()=>eligibilityLoaded,
    isEligibilityLoading:()=>eligibilityBusy,isLoading:()=>busy});
})();
