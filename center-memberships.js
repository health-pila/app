/* Read saved, own-account snapshots only. No BROJ request or persistent browser cache. */
(() => {
  'use strict';
  const panel=document.getElementById('centerMemberships');
  if(!panel)return;
  const message=document.getElementById('centerMembershipMessage'),list=document.getElementById('centerMembershipList');
  let client=null,user='',epoch=0,request=0,abort=null,busy=false,cache=null,loadedAt=0,error=false;
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
    panel.hidden=!user;list.replaceChildren();
    let msg='헬스회원권 만료일을 확인하고 있어요.';
    if(!cache){if(error)msg='헬스회원권 만료일을 불러오지 못했어요. 새로고침해 주세요.';}
    else if(!cache.is_linked)msg='센터 회원 연결 후 헬스회원권 만료일을 확인할 수 있어요.';
    else if(!cache.synced_at)msg='헬스회원권 정보를 연결하고 있어요.';
    else {
      const ends=expiries(cache.tickets,today());
      const uncertain=cache.tickets.some(t=>t.status!=='INACTIVE'&&(t.status==='UNKNOWN'||!t.end_at||t.start_at&&t.start_at>t.end_at));
      const hasDates=ends.current||ends.waiting.length;
      msg=hasDates?'':uncertain?'헬스회원권 만료일 확인이 필요해요. 센터에 문의해 주세요.':'현재 이용 중이거나 시작 예정인 헬스회원권이 없어요.';
      if(hasDates){
        function add(label,value,state){
          const li=node('li','center-membership-item','');li.dataset.state=state;
          li.append(node('span','center-membership-label',label),node('strong','center-membership-expiry',value));
          list.append(li);
        }
        add('현재 헬스회원권 만료일: ',ends.current?date(ends.current):uncertain?'확인 필요':'없음','current');
        for(const end of ends.waiting)add('이용 대기 회원권 만료일: ',date(end),'waiting');
        if(uncertain)msg='일부 헬스회원권의 만료일은 확인이 필요해요.';
      }
      if(error||cache.stale)msg='정보 갱신이 늦어지고 있어요. 변경 사항은 센터에 확인해 주세요.';
    }
    message.textContent=msg;message.hidden=!msg;
  }
  function reset(){epoch++;request++;abort?.abort();abort=null;client=null;user='';busy=false;cache=null;loadedAt=0;error=false;render();}
  function start(connection,id){reset();client=connection;user=id;render();}
  async function load(force=false){
    if(!visible()||busy||!force&&cache&&Date.now()-loadedAt<60000)return;
    const e=epoch,r=++request,owner=user;busy=true;error=false;abort=new AbortController();const controller=abort;render();
    try{
      let q=client.rpc('broj_my_memberships');if(typeof q.abortSignal==='function')q=q.abortSignal(controller.signal);
      const result=await q;if(e!==epoch||r!==request||owner!==user)return;
      if(result.error)throw Error('LOAD_FAILED');cache=validate(result.data);loadedAt=Date.now();
    }catch(_){if(e===epoch&&r===request)error=true;}
    finally{if(e===epoch&&r===request){busy=false;abort=null;render();}}
  }
  window.CenterMemberships=Object.freeze({start,reset,load});
})();
