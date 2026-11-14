/* Keep the native member selector; classification is read-only and never changes access. */
(() => {
  'use strict';
  if (window.AdminMemberPicker) return;
  const $=id=>document.getElementById(id),select=$('adminMemberSelect'),screen=$('adminScreen');
  if(!select||!screen)return;
  let client=null,user='',epoch=0,seq=0,ready=false,busy=false,lastRead=0,linked=new Set(),revision=0,updates=new Map();
  let eligibilitySeq=0,eligibilityBusy=false,eligibilityLoaded=false,eligibilityReadAt=0,eligibilityFailed=false;
  let eligibility=new Map(),roster=[],chosenFilter='all',eligibilityTimer=null,eligibilityRevision=0,eligibilityChanges=new Map();
  let membershipMember='',membershipData=null,membershipBusy=false,membershipReadAt=0,membershipSeq=0;
  const sortModes=new Set(['recent','name','gym','routines']);
  const nameOrder=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
  let chosenSort='recent',sortFacts=new Map(),sortSeq=0,sortBusy=false,sortLoaded=false,sortFailed=false,sortReadAt=0,sortAbort=null;
  const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
  const date=x=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
  const active=e=>e===epoch&&user&&client&&!screen.hidden;
  const linkState=id=>active(epoch)?updates.get(id)?.linked??(ready?linked.has(id):null):null;
  const notify=()=>select.dispatchEvent(new Event('attendance-status-change'));
  const notifyEligibility=()=>select.dispatchEvent(new Event('eligibility-status-change'));
  const notifySort=()=>select.dispatchEvent(new Event('member-sort-change'));
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
    renderMembershipDates(selected,!details.hidden);
    $('adminMemberEligibilityPinned').hidden=!enabled||!selected||chosenFilter==='all'||value.state===chosenFilter;
  }
  function renderMembershipDates(id,enabled){
    const box=$('adminMemberMembershipDates');if(!box)return;
    if(!enabled||!uuid(id)){membershipSeq++;membershipMember='';membershipData=null;membershipBusy=false;membershipReadAt=0;box.replaceChildren();return;}
    if(membershipMember!==id){membershipSeq++;membershipMember=id;membershipData=null;membershipBusy=false;membershipReadAt=0;}
    if(!membershipBusy&&Date.now()-membershipReadAt>=60000)void loadMembershipDates(id);
    box.replaceChildren();
    const add=(label,value)=>{const p=document.createElement('p'),strong=document.createElement('strong');p.append(document.createTextNode(label+' '));strong.textContent=value;p.append(strong);box.append(p);};
    if(!membershipData){add('회원권 만료일:',membershipBusy?'확인 중…':'불러오지 못했어요. 상태 새로고침을 눌러 주세요.');return;}
    const state=membershipData.state;
    if(state!=='ready'){const messages={not_linked:'센터 출석 연결 후 확인할 수 있어요.',not_collected:'회원권 정보를 수집 중이에요.',stale:'최신 정보 확인이 필요해요.',incomplete:'일부 회원권 정보 확인이 필요해요.',sync_error:'최근 회원권 조회에 실패했어요.'};add('회원권 만료일:',messages[state]||'확인 필요');return;}
    const format=value=>`${value.slice(2,4)}. ${value.slice(5,7)}. ${value.slice(8,10)}`;
    for(const [key,label] of [['gym','헬스회원권'],['pilates','필라테스 수강권']]){
      const item=membershipData[key];
      if(item.current_end_at)add(label+' 만료일:',format(item.current_end_at));
      else if(item.previous_end_at)add('최근 '+label+' 만료일:',format(item.previous_end_at));
      else add(label+' 만료일:',item.uncertain?'확인 필요':'확인 가능한 정보 없음');
      for(const end of item.scheduled_end_at)add('이용 대기 '+label+' 만료일:',format(end));
      if(item.uncertain&&(item.current_end_at||item.previous_end_at))add(label+':','일부 정보 확인 필요');
    }
  }
  async function loadMembershipDates(id){
    const e=epoch,number=++membershipSeq,db=client;membershipBusy=true;
    const current=()=>active(e)&&number===membershipSeq&&membershipMember===id&&select.value===id;
    const abort=new AbortController();let timer;
    try{
      let q=db.rpc('admin_member_memberships_v345',{p_user_id:id});if(q.abortSignal)q=q.abortSignal(abort.signal);
      const {data,error}=await Promise.race([q,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('TIMEOUT'));},10000);})]);
      if(!current())return;
      if(error||data?.ok!==true||data.version!==1||data.user_id!==id||!['ready','not_linked','not_collected','stale','incomplete','sync_error'].includes(data.state)||
        data.synced_at!==null&&(typeof data.synced_at!=='string'||!Number.isFinite(Date.parse(data.synced_at))))throw Error('INVALID_MEMBERSHIPS');
      if(data.state==='ready')for(const key of ['gym','pilates']){const item=data[key];if(!item||typeof item.uncertain!=='boolean'||
        !['current_end_at','previous_end_at'].every(k=>item[k]===null||date(item[k]))||!Array.isArray(item.scheduled_end_at)||item.scheduled_end_at.length>200||!item.scheduled_end_at.every(date))throw Error('INVALID_DATES');}
      membershipData=data;
    }catch(_){if(current())membershipData=null;}
    finally{clearTimeout(timer);if(current()){membershipBusy=false;membershipReadAt=Date.now();renderEligibility();}}
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
    renderEligibility();renderSort();
  }
  const koreaDay=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  function gymExpiry(id){
    if(!active(epoch))return null;
    const value=sortFacts.get(id),at=Date.parse(value?.synced_at),now=Date.now();
    return value&&date(value.gym_end_at)&&Number.isFinite(at)&&at>=now-8*3600000&&at<=now+60000?value.gym_end_at:null;
  }
  function renderSort(){
    const input=$('adminMemberSort'),status=$('adminMemberSortStatus');
    if(input){input.value=chosenSort;input.disabled=!active(epoch);}
    if(status){
      status.hidden=chosenSort!=='gym';
      status.textContent=sortBusy?'헬스 만료일을 확인하고 있어요.':sortFailed?'헬스 만료일을 불러오지 못했어요. 분류 새로고침을 눌러 주세요.':
        '기간이 남은 회원 → 만료된 회원 → 날짜 정보 없는 회원 순서예요.';
    }
  }
  function sortOptions(options){
    const created=o=>{const n=Date.parse(o.dataset.memberCreatedAt);return Number.isFinite(n)?n:0;};
    const newest=(a,b)=>created(b)-created(a)||b.value.localeCompare(a.value);
    const count=o=>/^\d+$/.test(o.dataset.assignmentCount||'')?Number(o.dataset.assignmentCount):0;
    const today=koreaDay();
    const expiryGroup=d=>!d?2:d>=today?0:1;
    return [...options].sort((a,b)=>{
      if(chosenSort==='name')return nameOrder.compare(a.dataset.memberName||'',b.dataset.memberName||'')||newest(a,b);
      if(chosenSort==='routines')return count(b)-count(a)||newest(a,b);
      if(chosenSort==='gym'){
        const x=gymExpiry(a.value),y=gymExpiry(b.value),gx=expiryGroup(x),gy=expiryGroup(y);
        return gx-gy||(x&&y?(gx===1?y.localeCompare(x):x.localeCompare(y)):0)||newest(a,b);
      }
      return newest(a,b);
    });
  }
  async function loadSortFacts(force=false){
    const e=epoch;
    if(!active(e)||chosenSort!=='gym'||document.visibilityState!=='visible'||sortBusy||(!force&&sortLoaded&&Date.now()-sortReadAt<30000))return;
    const request=++sortSeq,db=client,abort=new AbortController();let timer;
    sortAbort=abort;sortBusy=true;renderSort();
    try{
      let query=db.rpc('broj_admin_member_sort_facts');if(query.abortSignal)query=query.abortSignal(abort.signal);
      const {data,error}=await Promise.race([query,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('TIMEOUT'));},10000);})]);
      if(!active(e)||request!==sortSeq)return;
      if(error||data?.ok!==true||data.version!==1||!Array.isArray(data.members)||data.members.length>100000)throw Error('INVALID_SORT_FACTS');
      const entries=new Map();
      for(const row of data.members){
        if(!row||!uuid(row.user_id)||entries.has(row.user_id)||(row.gym_end_at!==null&&!date(row.gym_end_at))||
          (row.synced_at!==null&&(typeof row.synced_at!=='string'||!Number.isFinite(Date.parse(row.synced_at)))))throw Error('INVALID_SORT_FACT');
        entries.set(row.user_id,{gym_end_at:row.gym_end_at,synced_at:row.synced_at});
      }
      sortFacts=entries;sortLoaded=true;sortFailed=false;sortReadAt=Date.now();
    }catch(_){if(active(e)&&request===sortSeq){sortFacts.clear();sortLoaded=false;sortFailed=true;sortReadAt=Date.now();}}
    finally{clearTimeout(timer);if(active(e)&&request===sortSeq){sortBusy=false;sortAbort=null;renderSort();notifySort();}}
  }
  function setSort(value){
    if(!active(epoch)||!sortModes.has(value))return;
    chosenSort=value;
    try{localStorage.setItem('admin-member-sort:v1:'+user,value);}catch(_){}
    renderSort();notifySort();void loadSortFacts();
  }
  function invalidateSortFacts(id){
    sortSeq++;sortAbort?.abort();sortAbort=null;sortBusy=false;sortReadAt=0;sortLoaded=false;
    if(id)sortFacts.delete(id);else sortFacts.clear();renderSort();notifySort();void loadSortFacts();
  }
  function invalidateChangedLinks(before,after){
    if([...sortFacts.keys()].some(id=>before.has(id)!==after.has(id)))invalidateSortFacts();
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
    if(force)membershipReadAt=0;
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
    if(previous!==value){invalidateSortFacts(id);eligibility.delete(id);eligibilityChanges.set(id,++eligibilityRevision);eligibilityReadAt=0;notifyEligibility();void loadEligibility();}
    if(previous!==value&&membershipMember===id){membershipSeq++;membershipData=null;membershipBusy=false;membershipReadAt=0;}
    refresh();notify();
  }
  function setRoster(ids){if(!active(epoch)||!Array.isArray(ids)||!ids.every(uuid))return;const added=ids.some(id=>!roster.includes(id));roster=[...new Set(ids)];renderEligibility();if(added){sortReadAt=0;void loadSortFacts();}}
  function reset(){
    membershipSeq++;membershipMember='';membershipData=null;membershipBusy=false;membershipReadAt=0;
    epoch++;seq++;eligibilitySeq++;clearTimeout(eligibilityTimer);eligibilityTimer=null;
    client=null;user='';ready=false;busy=false;lastRead=0;linked.clear();updates.clear();revision=0;
    eligibility.clear();eligibilityChanges.clear();eligibilityRevision=0;eligibilityLoaded=false;eligibilityBusy=false;eligibilityReadAt=0;eligibilityFailed=false;roster=[];chosenFilter='all';
    sortSeq++;sortAbort?.abort();sortAbort=null;sortBusy=false;sortFacts.clear();sortLoaded=false;sortFailed=false;sortReadAt=0;chosenSort='recent';
    refresh();notify();notifyEligibility();
  }
  function scheduleEligibility(){
    clearTimeout(eligibilityTimer);
    if(active(epoch))eligibilityTimer=setTimeout(()=>{if(document.visibilityState==='visible'){refresh();notifyEligibility();notifySort();void loadEligibility();void loadSortFacts();}scheduleEligibility();},300000);
  }
  function start(connection,id){reset();client=connection;user=id;try{const saved=localStorage.getItem('admin-member-sort:v1:'+user);if(sortModes.has(saved))chosenSort=saved;}catch(_){}refresh();notifySort();void loadLinks();void loadEligibility();void loadSortFacts();scheduleEligibility();}
  function revisit(){if(document.visibilityState==='visible'){void loadLinks();void loadEligibility();void loadSortFacts();}}
  select.addEventListener('focus',revisit);
  select.addEventListener('change',renderEligibility);
  window.addEventListener('focus',revisit);
  document.addEventListener('visibilitychange',revisit);
  $('adminMemberEligibilityRefresh').addEventListener('click',()=>{void loadEligibility(true);void loadSortFacts(true);});
  document.addEventListener('change',event=>{if(event.target.id==='adminMemberSort')setSort(event.target.value);});
  $('adminMemberEligibilityFilters').addEventListener('click',event=>{
    const button=event.target.closest('[data-eligibility-filter]');
    if(!active(epoch)||!button||button.disabled)return;
    chosenFilter=button.dataset.eligibilityFilter;refresh();notifyEligibility();void loadEligibility();
  });
  new MutationObserver(refresh).observe(select,{childList:true});
  new MutationObserver(()=>{if(screen.hidden&&user)reset();}).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.AdminMemberPicker=Object.freeze({start,reset,refresh,setLink,linkState,captureSync,applySync,setRoster,
    sortOptions,setSort,sortMode:()=>chosenSort,gymExpiry,loadSortFacts,
    eligibilityState,loadEligibility,filter:()=>chosenFilter,eligibilityReady:()=>eligibilityLoaded,
    isEligibilityLoading:()=>eligibilityBusy,isLoading:()=>busy});
})();
