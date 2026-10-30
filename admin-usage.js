(() => {
  'use strict';
  const $=id=>document.getElementById(id), panel=$('adminUsagePanel');
  if(!panel)return;
  let state=null;
  const nodes=['usagePeriod','usageRefresh','usageExclude','usageInclude'];
  const current=s=>state===s&&!$('adminScreen').hidden;
  function controls(){for(const id of nodes)$(id).disabled=!state||state.busy;}
  function reset(){state=null;$('usageRows').replaceChildren();$('usageMessage').textContent='';$('usageSummary').textContent='';$('usageExcludeMessage').textContent='';panel.open=false;controls();}
  function start(client,uid){reset();state={client,uid,busy:false};controls();}
  async function request(s,name,args){const {data,error}=await s.client.auth.getUser();if(!current(s))return null;if(error||data?.user?.id!==s.uid)throw Error('auth');const result=await s.client.rpc(name,args);if(!current(s))return null;if(result.error||!result.data?.ok)throw Error('rpc');return result.data;}
  const number=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
  async function load(){const s=state;if(!s||!current(s)||s.busy)return;s.busy=true;controls();$('usageMessage').textContent='집계 결과를 불러오고 있어요…';
    try{const r=await request(s,'admin_center_usage_report_v242',{p_days:Number($('usagePeriod').value)});if(!r||!current(s))return;if(!Array.isArray(r.features))throw Error('shape');const members=number(r.active_members);$('usageSummary').textContent=`이용 회원 ${members.toLocaleString('ko-KR')}명 · 행동 ${number(r.hits).toLocaleString('ko-KR')}회`;
      $('usageRows').replaceChildren();for(const row of r.features){if(!number(row.hits))continue;const tr=document.createElement('tr');for(const text of [String(row.label||row.code),number(row.members).toLocaleString('ko-KR')+'명',number(row.hits).toLocaleString('ko-KR')+'회']){const td=document.createElement('td');td.textContent=text;tr.append(td)}$('usageRows').append(tr)}
      const built=r.built_at?new Date(r.built_at):null;$('usageMessage').textContent=built&&Number.isFinite(built.getTime())?`${r.from_day} ~ ${r.through_day} · 집계: ${built.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}${number(r.hits)?'':' · 아직 집계된 사용 기록이 없어요.'}`:'첫 새벽 집계 이후에 결과가 표시됩니다.';
    }catch(_){if(current(s))$('usageMessage').textContent='통계를 불러오지 못했어요. 서버 설정과 로그인 상태를 확인하고 다시 눌러 주세요.'}finally{if(current(s)){s.busy=false;controls()}}
  }
  async function exclude(value){const s=state;if(!s||!current(s)||s.busy)return;const uid=$('adminMemberSelect')?.value;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid||'')){$('usageExcludeMessage').textContent='먼저 아래 회원 관리에서 대상 회원을 선택해 주세요.';return}s.busy=true;controls();$('usageExcludeMessage').textContent='설정 중…';
    try{const r=await request(s,'admin_center_usage_exclude_v242',{p_user_id:uid,p_excluded:value});if(!r||!current(s))return;$('usageExcludeMessage').textContent=value?'선택 회원을 제외했어요. 해당 회원의 기존 이용 통계도 삭제했습니다.':'선택 회원의 앞으로 전송되는 통계를 포함합니다. 삭제된 과거 통계는 복원되지 않습니다.'}catch(_){if(current(s))$('usageExcludeMessage').textContent='설정 결과를 확인하지 못했어요. 다시 눌러 확인해 주세요.'}finally{if(current(s)){s.busy=false;controls();void load()}}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)void load()});$('usagePeriod').addEventListener('change',load);$('usageRefresh').addEventListener('click',load);$('usageExclude').addEventListener('click',()=>exclude(true));$('usageInclude').addEventListener('click',()=>exclude(false));window.AdminUsage=Object.freeze({start,reset});controls();
})();
