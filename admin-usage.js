(() => {
  'use strict';
  if (window.AdminUsage) return;
  const $=id=>document.getElementById(id), panel=$('adminUsagePanel');
  if(!panel)return;
  let state=null;
  const nodes=['usagePeriod','usageRefresh','usageExclude','usageInclude'];
  const current=s=>state===s&&!$('adminScreen').hidden;
  function controls(){for(const id of nodes)$(id).disabled=!state||state.busy;}
  function reset(){state=null;$('usageRows').replaceChildren();$('usageMessage').textContent='';$('usageSummary').textContent='';$('usageExcludeMessage').textContent='';$('usageCollectionHealth').textContent='';panel.open=false;controls();}
  function start(client,uid){reset();state={client,uid,busy:false};controls();}
  async function request(s,name,args){const {data,error}=await s.client.auth.getUser();if(!current(s))return null;if(error||data?.user?.id!==s.uid)throw Error('auth');const result=await s.client.rpc(name,args);if(!current(s))return null;if(result.error||!result.data?.ok)throw Error('rpc');return result.data;}
  const number=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
  async function load(){const s=state;if(!s||!current(s)||s.busy)return;s.busy=true;controls();$('usageMessage').textContent='집계 결과를 불러오고 있어요…';
    try{const r=await request(s,'admin_center_usage_report_v242',{p_days:Number($('usagePeriod').value)});if(!r||!current(s))return;if(!Array.isArray(r.features))throw Error('shape');const members=number(r.active_members);$('usageSummary').textContent=`이용 회원 ${members.toLocaleString('ko-KR')}명 · 수집 기록 ${number(r.hits).toLocaleString('ko-KR')}회`;
      $('usageRows').replaceChildren();for(const row of r.features){if(document.documentElement.dataset.oneDayPtEnabled==='false'&&['pt_add','pt_cart','pt_checkout'].includes(row.code))continue;if(!number(row.hits))continue;const tr=document.createElement('tr');for(const text of [String(row.label||row.code),number(row.members).toLocaleString('ko-KR')+'명',number(row.hits).toLocaleString('ko-KR')+'회']){const td=document.createElement('td');td.textContent=text;tr.append(td)}$('usageRows').append(tr)}
      const singleDay=r.from_day===r.through_day;
      $('usageCollectionHealth').textContent=r.report_version>=281
        ? `${singleDay?'선택일':'선택 기간'} 신규 가입 ${number(r.new_members)}명 · 이용 기록 수신 ${number(r.new_with_usage)}명 · 미수신 ${Math.max(0,number(r.new_members)-number(r.new_with_usage))}명${singleDay?'':`\n어제(${String(r.yesterday_day||'')}) 가입 ${number(r.yesterday_new)}명 · 현재까지 기록 수신 ${number(r.yesterday_collected)}명`}\n미수신은 미이용 또는 전송 누락·지연을 포함하며, 가입자 중 수신 현황이 전체 정확도를 뜻하지는 않습니다.`
        : '통계 서버 업데이트가 필요합니다. v282 쿼리 적용 후 다시 조회해 주세요.';
      const built=r.built_at?new Date(r.built_at):null;$('usageMessage').textContent=built&&Number.isFinite(built.getTime())?`${singleDay?r.from_day+' 하루 통계':r.from_day+' ~ '+r.through_day} · 조회: ${built.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}${number(r.hits)?'':' · 아직 집계된 사용 기록이 없어요.'}`:'조회 시각을 확인하지 못했어요. 다시 조회해 주세요.';
    }catch(_){if(current(s)){$('usageCollectionHealth').textContent='';$('usageSummary').textContent='';$('usageMessage').textContent='통계를 불러오지 못했어요. 서버 설정과 로그인 상태를 확인하고 다시 눌러 주세요.'}}finally{if(current(s)){s.busy=false;controls()}}
  }
  async function exclude(value){const s=state;if(!s||!current(s)||s.busy)return;const uid=$('adminMemberSelect')?.value;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid||'')){$('usageExcludeMessage').textContent='먼저 아래 회원 관리에서 대상 회원을 선택해 주세요.';return}s.busy=true;controls();$('usageExcludeMessage').textContent='설정 중…';
    try{const r=await request(s,'admin_center_usage_exclude_v242',{p_user_id:uid,p_excluded:value});if(!r||!current(s))return;$('usageExcludeMessage').textContent=value?'선택 회원을 제외했어요. 해당 회원의 기존 이용 통계도 삭제했습니다.':'선택 회원의 앞으로 전송되는 통계를 포함합니다. 삭제된 과거 통계는 복원되지 않습니다.'}catch(_){if(current(s))$('usageExcludeMessage').textContent='설정 결과를 확인하지 못했어요. 다시 눌러 확인해 주세요.'}finally{if(current(s)){s.busy=false;controls();void load()}}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)void load()});$('usagePeriod').addEventListener('change',load);$('usageRefresh').addEventListener('click',load);$('usageExclude').addEventListener('click',()=>exclude(true));$('usageInclude').addEventListener('click',()=>exclude(false));window.AdminUsage=Object.freeze({start,reset});controls();
})();
