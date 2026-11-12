/* Opt-in, device-local duration diagnostics. Never reads credentials or profile data. */
(() => {
  'use strict';
  const scriptVersion = document.querySelector('meta[name="app-version"]')?.content || new URL(document.currentScript?.src || location.href).searchParams.get('v');
  const VERSION = /^[0-9]{1,5}$/.test(scriptVersion || '') ? scriptVersion : '258';
  const KEY = 'centerLoginTiming:v1';
  const MAX_AGE = 7 * 86400000;
  const labels = {session:'로그인 상태 확인',return:'인증 복귀 확인',password:'이메일 로그인',user:'본인 확인',profile:'회원 정보 조회'};
  const modes = {restore:'자동로그인·인증 복귀',email:'이메일 로그인'};
  const outcomes = {ready:'화면 표시 완료',error:'확인 실패',signed_out:'저장된 로그인 없음',cancelled:'다른 로그인·로그아웃으로 취소'};
  let enabled = false, until = 0, records = [], current = null, sequence = 0;
  let cacheInfo = null;
  let codeReady = null, dialog = null, output = null, tick = null;
  const buttons = [];
  const now = () => performance.now();
  const rounded = n => Number.isFinite(n) ? Math.max(0, Math.min(3600000, Math.round(n))) : 0;
  function clean(row) {
    if (!row || !/^[0-9]{1,5}$/.test(row.version || '') || !Object.hasOwn(modes,row.mode) || !Object.hasOwn(outcomes,row.result) ||
        !Number.isFinite(row.at) || row.at < Date.now()-MAX_AGE || row.at > Date.now()+60000 ||
        !Array.isArray(row.stages) || row.stages.length > 8) return null;
    return {version:row.version,at:row.at,mode:row.mode,result:row.result,total:rounded(row.total),code:row.code==null?null:rounded(row.code),
      content:row.content==null?null:rounded(row.content),refresh:row.refresh==null?null:rounded(row.refresh),stages:row.stages.filter(s=>s && Object.hasOwn(labels,s.name) && ['ok','error'].includes(s.status))
        .map(s=>({name:s.name,ms:rounded(s.ms),status:s.status}))};
  }
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw && raw.length <= 16384 ? JSON.parse(raw) : null;
    if(raw && raw.length > 16384) localStorage.removeItem(KEY);
    if (saved && Number.isFinite(saved.until) && saved.until > Date.now() && saved.until <= Date.now()+MAX_AGE+60000) {
      enabled = true; until = saved.until;
      records = Array.isArray(saved.records) ? saved.records.slice(-5).map(clean).filter(Boolean) : [];
    } else if(saved) localStorage.removeItem(KEY);
    const setting = new URL(location.href).searchParams.get('login-debug');
    if (setting === '1') { enabled = true; until = Date.now()+MAX_AGE; }
    if (setting === '0') { enabled = false; records = []; localStorage.removeItem(KEY); }
  } catch (_) { enabled = new URL(location.href).searchParams.get('login-debug') === '1'; if(enabled) until=Date.now()+MAX_AGE; }
  function live() {
    if (enabled && Date.now() >= until) disable();
    return enabled;
  }
  function save() {
    if (!enabled) return;
    try { localStorage.setItem(KEY,JSON.stringify({until,records:records.slice(-5)})); } catch (_) { /* Memory diagnostics still work. */ }
  }
  function ready() { if (live()) codeReady = rounded(now()); }
  function begin(mode) {
    if (!live() || !Object.hasOwn(modes,mode)) return null;
    if (current) finish(current,'cancelled');
    current = {id:++sequence,version:VERSION,at:Date.now(),mode,start:now(),code:mode==='restore'?codeReady:null,stages:[],pending:new Map()};
    render(); return current;
  }
  async function measure(run,name,operation) {
    if (!run || current !== run || !live() || !Object.hasOwn(labels,name)) return operation();
    const start = now(); run.pending.set(name,start); render();
    let status='ok';
    try { const value=await operation(); if(value?.error)status='error'; return value; }
    catch(error) {status='error';throw error;}
    finally {
      if(current===run){run.pending.delete(name);if(run.stages.length<8)run.stages.push({name,ms:rounded(now()-start),status});render();}
    }
  }
  function refreshDuration(run) {
    try {
      const entries=performance.getEntriesByType('resource').slice(-200).filter(entry=>{
        if(entry.startTime<run.start-1 || !entry.name.includes('/auth/v1/token'))return false;
        const url=new URL(entry.name);
        return url.origin==='https://cithfqbzszgiqjifhrqy.supabase.co' && url.pathname==='/auth/v1/token' && url.searchParams.get('grant_type')==='refresh_token';
      });
      return entries.length?rounded(entries.reduce((sum,e)=>sum+e.duration,0)):null;
    } catch(_){return null;}
  }
  function finish(run,result='ready') {
    if (!run || current!==run || !live() || !Object.hasOwn(outcomes,result)) return;
    run.record={version:run.version,at:run.at,mode:run.mode,result,total:rounded(now()-run.start),code:run.code,refresh:refreshDuration(run),stages:run.stages.slice()};
    records.push(run.record);
    records=records.slice(-5);current=null;save();render();
  }
  function contentReady(run) {
    if (!run?.record || !live() || !records.includes(run.record)) return;
    // The data/rendering operation has finished; this is separate from authentication.
    run.record.content = rounded(now()); save(); render();
  }
  function cacheReady(info) {
    if (!live() || !Number.isFinite(info.ms) || info.ms<0 || info.ms>3600000 ||
        !Number.isInteger(info.reused) || !Number.isInteger(info.downloaded) ||
        info.reused<0 || info.downloaded<0 || info.reused+info.downloaded>500) return;
    cacheInfo={ms:rounded(info.ms), reused:info.reused, downloaded:info.downloaded}; render();
  }
  function cancel() { if(current) finish(current,'cancelled'); }
  const seconds = ms => (ms/1000).toFixed(2)+'초';
  function report() {
    const all=records.slice();
    if(current)all.push({version:current.version,at:current.at,mode:current.mode,result:null,total:rounded(now()-current.start),code:current.code,stages:current.stages,
      pending:[...current.pending].map(([name,start])=>({name,ms:rounded(now()-start)}))});
    const lines=['로그인 속도 진단 · v'+VERSION,'본인 확인·회원 정보 조회는 동시에 진행합니다.'];
    for(const row of all.slice(-5).reverse()){
      lines.push('',new Date(row.at).toLocaleString('ko-KR')+' · v'+row.version,modes[row.mode]+' · '+(outcomes[row.result]||'확인 중'),
        '로그인 처리 경과: '+seconds(row.total));
      if(row.code!=null)lines.push('앱 코드 준비(페이지 시작부터): '+seconds(row.code));
      if(row.content!=null)lines.push('첫 화면 콘텐츠 조회·구성 완료(페이지 시작부터): '+seconds(row.content));
      for(const s of row.stages)lines.push(labels[s.name]+': '+seconds(s.ms)+(s.status==='error'?' · 실패':''));
      for(const s of row.pending||[])lines.push(labels[s.name]+': '+seconds(s.ms)+' · 진행 중');
      if(row.refresh!=null)lines.push('로그인 갱신 요청(브라우저 관측): '+seconds(row.refresh));
    }
    if(cacheInfo)lines.push('','이번 실행 중 백그라운드 캐시 준비: '+seconds(cacheInfo.ms),'기존 파일 재사용: '+cacheInfo.reused+'개 · 새로 준비: '+cacheInfo.downloaded+'개');
    if(!all.length)lines.push('','다음 로그인부터 결과가 표시됩니다.');
    return lines.join('\n');
  }
  function render() { if(dialog?.open && output)output.textContent=report(); }
  function disable() {
    enabled=false;records=[];current=null;
    try{localStorage.removeItem(KEY);}catch(_){}
    buttons.forEach(button=>button.remove());
    if(tick){clearInterval(tick);tick=null;}
    if(dialog?.open)dialog.close();
    // Remove only the explicit diagnostic switch, preserving all auth/payment URL data.
    try{const url=new URL(location.href);url.searchParams.delete('login-debug');history.replaceState(history.state,'',url.href);}catch(_){}
  }
  function open() {
    if(!live())return;
    if(!dialog){
      dialog=document.createElement('dialog');dialog.className='login-timing-dialog';dialog.setAttribute('aria-labelledby','loginTimingTitle');
      const head=document.createElement('div');head.className='login-timing-heading';
      const title=document.createElement('h2');title.id='loginTimingTitle';title.textContent='로그인 속도 확인';
      const close=document.createElement('button');close.type='button';close.textContent='닫기';close.addEventListener('click',()=>dialog.close());
      head.append(title,close);
      const note=document.createElement('p');note.textContent='이 기기에서만 최대 7일 동안 측정합니다. 최근 5회 시간만 저장하며 계정 정보나 서버 전송은 포함하지 않습니다.';
      output=document.createElement('pre');output.tabIndex=0;
      const actions=document.createElement('div');actions.className='login-timing-actions';
      const copy=document.createElement('button');copy.type='button';copy.textContent='결과 복사';
      copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(report());copy.textContent='복사했어요';}catch(_){copy.textContent='결과를 길게 눌러 복사해 주세요';}});
      const off=document.createElement('button');off.type='button';off.textContent='진단 끄기·기록 삭제';off.addEventListener('click',disable);
      actions.append(copy,off);dialog.append(head,note,output,actions);document.body.append(dialog);
      dialog.addEventListener('close',()=>{if(tick){clearInterval(tick);tick=null;}});
    }
    if(!dialog.open)dialog.showModal();render();
    if(!tick)tick=setInterval(()=>{if(live())render();},1000);
  }
  if(enabled){
    save();
    for(const selector of ['#loginForm','#memberMenuPanel','#adminMenuPanel']){
      const parent=document.querySelector(selector);if(!parent)continue;
      const button=document.createElement('button');button.className='login-timing-open';button.type='button';button.textContent='로그인 속도 확인';
      button.setAttribute('aria-haspopup','dialog');button.addEventListener('click',open);parent.append(button);buttons.push(button);
    }
  }
  window.LoginTiming=Object.freeze({ready,begin,measure,finish,cancel,contentReady,cacheReady});
})();
