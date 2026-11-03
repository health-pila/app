/* Uses the existing admin member refresh. No extra requests or member-side work. */
(() => {
  'use strict';
  const screen=document.getElementById('adminScreen'), list=document.getElementById('adminMemberSignupList');
  const count=document.getElementById('adminMemberSignupCount'), status=document.getElementById('adminMemberSignupStatus');
  if(!screen||!list||!count||!status)return;
  let user='',generation=0,choose=null,rows=[],memory=null,storageFailed=false,queue=Promise.resolve();
  const active=g=>g===generation&&user&&!screen.hidden;
  const key=()=> 'adminMemberSignup:v1:'+user;
  function read(){
    try{
      const raw=localStorage.getItem(key());
      if(!raw)return memory;
      if(raw.length>2000000)throw Error('size');
      const v=JSON.parse(raw);
      if(v.version!==1||!Array.isArray(v.known)||!Array.isArray(v.pending)||![...v.known,...v.pending].every(x=>typeof x==='string'))throw Error('state');
      return v;
    }catch(_){storageFailed=true;return memory;}
  }
  function save(v){memory=v;try{localStorage.setItem(key(),JSON.stringify(v));storageFailed=false;}catch(_){storageFailed=true;}}
  function render(v){
    const pending=new Set(v?.pending||[]), current=rows.filter(r=>pending.has(r.id));
    count.textContent=`미확인 ${current.length}명`;count.classList.toggle('has-requests',current.length>0);
    status.textContent=storageFailed?'알림 확인 상태를 저장하지 못했어요. 현재 화면에서는 확인할 수 있어요.':current.length?'새로 가입한 회원이에요. 출석 연결을 확인해 주세요.':'미확인 신규 가입 회원이 없어요.';
    list.replaceChildren();
    for(const row of current){
      const card=document.createElement('div');card.className='admin-member-signup-card';
      const info=document.createElement('div'), name=document.createElement('strong'), date=document.createElement('span');
      name.textContent=(row.display_name||'이름 없음')+(row.phone_last4?' · '+row.phone_last4:' · 전화번호 미등록');
      const d=new Date(row.created_at);date.textContent=Number.isFinite(d.getTime())?'가입 '+d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'가입일 확인 필요';
      info.append(name,date);
      const actions=document.createElement('div');actions.className='admin-member-signup-actions';
      const select=document.createElement('button');select.type='button';select.textContent='회원 선택';select.addEventListener('click',()=>{if(active(generation))choose?.(row.id);});
      const seen=document.createElement('button');seen.type='button';seen.textContent='확인';seen.setAttribute('aria-label',(row.display_name||'회원')+' 가입 알림 확인');seen.addEventListener('click',()=>update(null,row.id));
      actions.append(select,seen);card.append(info,actions);list.append(card);
    }
    void window.AdminRoutineAlerts?.syncMembers(current.map(r=>r.id));
  }
  function update(next,ack){
    const g=generation;
    queue=queue.catch(()=>{}).then(async()=>{
      if(!active(g))return;
      const work=()=>{
        if(!active(g))return;
        if(next)rows=next;
        let v=read();const ids=rows.map(r=>r.id);
        // First complete snapshot establishes a baseline; historical users are not new alerts.
        if(!v)v={version:1,known:ids,pending:[]};
        else{
          const known=new Set(v.known), pending=new Set(v.pending);
          for(const id of ids)if(!known.has(id)){known.add(id);pending.add(id);}
          if(ack)pending.delete(ack);
          v={version:1,known:[...known],pending:[...pending]};
        }
        save(v);render(v);
      };
      if(navigator.locks?.request)await navigator.locks.request(key(),work);else work();
    }).catch(()=>{if(active(g))status.textContent=' 가입 알림을 갱신하지 못했어요. 새로고침해 주세요.';});
    return queue;
  }
  function reset(){generation++;user='';choose=null;rows=[];memory=null;storageFailed=false;list.replaceChildren();count.textContent='미확인 0명';count.classList.remove('has-requests');status.textContent='신규 가입 회원을 확인하고 있어요.';}
  function start(id,onChoose){reset();user=id;choose=onChoose;}
  function sync(data){if(!Array.isArray(data)||!active(generation))return;return update(data.filter(r=>r&&typeof r.id==='string'));}
  new MutationObserver(()=>{if(screen.hidden&&user)reset();}).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('storage',e=>{if(active(generation)&&e.key===key())void update(rows);});
  window.AdminMemberAlerts=Object.freeze({start,sync,reset,error:()=>{if(active(generation))status.textContent='가입 알림을 불러오지 못했어요. 새로고침해 주세요.';}});
})();
