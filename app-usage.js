/* 이용 통계만 수집합니다. 기존 기능은 이 모듈의 결과를 기다리지 않습니다. */
(() => {
  'use strict';
  const app = document.getElementById('appScreen');
  const ids = {
    memberAssignedRoutineMenuButton:'menu_routine',memberCardioMenuButton:'menu_cardio',memberStretchingMenuButton:'menu_stretch',
    openOneDayPtCart:'pt_cart',submitOneDayPt:'pt_checkout',routineRequestButton:'routine_request',
    openWorkoutCameraButton:'photo_open',openWorkoutTextButton:'time_open',saveWorkoutRecordButton:'photo_save_click',
    showPhotoWorkoutRecordsButton:'filter_photo',showTextWorkoutRecordsButton:'filter_time',showSetWorkoutRecordsButton:'filter_sets',showAllWorkoutRecordsButton:'filter_all',
    previousWorkoutMonthButton:'calendar_month',nextWorkoutMonthButton:'calendar_month',restTimerToggle:'timer_open',restTimerStart:'timer_start',
    toggleStretchingPicks:'stretch_filter',communityNewsMenuButton:'news_open',communityInquiryMenuButton:'inquiry_open',sendMemberInquiryButton:'inquiry_send_click',loadMoreMemberInquiriesButton:'inquiry_more',memberInfoButton:'account_open',submitPayAppCheckout:'checkout_submit_click'
  };
  const rules = [
    ['.routine-pattern-tab','pattern_change'],['.routine-component-image-button','exercise_photo'],['.routine-weight-button','sets_open'],['.routine-weight-reset','sets_reset'],['.routine-weight-capture','sets_save_click'],['.exercise-replacement-change','exercise_replace'],['.exercise-dose-edit','exercise_target'],['.routine-details-button','exercise_detail'],['.routine-video-button','exercise_video'],['.one-day-pt-add-button','pt_add'],['.workout-text-save','time_save_click'],['.workout-exercise-history-toggle','record_history'],['.edit-workout-record-button','record_edit'],['.delete-workout-record-button','record_delete_click'],['.workout-calendar-day','calendar_day'],['.stretching-card-open','stretch_video'],['.stretching-pick-button','stretch_pick'],['[data-account-open="payments"]','account_payments'],['[data-account-open="privacy"]','account_privacy'],['[data-payapp-product]','checkout_open'],['.member-service-card','naver_product']
  ];
  const allowed = new Set([...Object.values(ids),...rules.map(x=>x[1]),'app_open','exercise_expand','cardio_open','tab_routine','tab_records','tab_services','tab_community']);
  const dateKey = () => new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const validRow = row => row && Object.keys(row).length===3 && allowed.has(row.code) && /^\d{4}-\d{2}-\d{2}$/.test(row.day) && Number.isInteger(row.hits) && row.hits>0 && row.hits<=100 && row.day<=dateKey() && row.day>=new Date(Date.now()-7*86400000+9*3600000).toISOString().slice(0,10);
  let state = null, database;
  const live = s => state===s && !s.stopped;
  const active = s => live(s) && app && !app.hidden;
  function openStore() {
    if (!database) database = new Promise(resolve => {
      try {
        const request = indexedDB.open('centerUsage-v242',1);
        request.onupgradeneeded = () => request.result.createObjectStore('queue');
        request.onsuccess = () => { const db=request.result; db.onversionchange=()=>db.close(); resolve(db);try{const tx=db.transaction('queue','readwrite'),req=tx.objectStore('queue').openCursor();let n=0;req.onsuccess=()=>{const c=req.result;if(!c||n++>=100)return;const q=clean(c.value);if(!q.rows.length&&!q.flight)c.delete();else c.update(q);c.continue();};}catch(_){} };
        request.onerror = request.onblocked = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    return database;
  }
  async function storage(s, value) {
    const db = await openStore();
    if (!db || !live(s)) return null;
    return new Promise(resolve => {
      try {
        const tx=db.transaction('queue',value===undefined?'readonly':'readwrite'), store=tx.objectStore('queue');
        let data=null;
        const req=value===undefined?store.get(s.uid):store.put(value,s.uid);
        req.onsuccess=()=>{data=req.result}; tx.oncomplete=()=>resolve(value===undefined?data:true);
        tx.onerror=tx.onabort=()=>resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  function clean(value) {
    const rows=Array.isArray(value?.rows)?value.rows.filter(validRow).slice(0,256):[];
    const f=value?.flight;
    const flight=f && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.id) && Array.isArray(f.rows) && f.rows.length>0 && f.rows.length<=40 && f.rows.every(validRow)?{id:f.id,rows:f.rows}:null;
    return {rows,flight};
  }
  function append(rows, extra) {
    const map=new Map(rows.map(r=>[r.day+'|'+r.code,{...r}]));
    for (const row of extra) { const k=row.day+'|'+row.code, old=map.get(k); if(old)old.hits=Math.min(100,old.hits+row.hits);else if(map.size<256)map.set(k,{...row}); }
    return [...map.values()];
  }
  function subtract(s, rows) {
    for(const row of rows){const k=row.day+'|'+row.code,n=s.memory.get(k)||0;if(n>row.hits)s.memory.set(k,n-row.hits);else s.memory.delete(k);}
  }
  function pending(s) { return [...s.memory].map(([key,hits])=>{const [day,code]=key.split('|');return {day,code,hits}}).filter(validRow); }
  function idle(s,fn) {
    if (!live(s)) return;
    if ('requestIdleCallback' in window) { const id=requestIdleCallback(()=>{s.idles.delete(id);if(live(s))void fn()}, {timeout:5000});s.idles.add(id); }
    else {const id=setTimeout(()=>{s.timeouts.delete(id);if(live(s))void fn()},1000);s.timeouts.add(id);}
  }
  function scheduleSave(s) {
    if(s.saveTimer||!live(s))return;
    s.saveTimer=setTimeout(()=>{s.saveTimer=null;idle(s,()=>work(s,false))},30000);
  }
  function scheduleSend(s,delay=600000) {
    clearTimeout(s.sendTimer);if(!live(s))return;
    s.sendTimer=setTimeout(()=>{s.sendTimer=null;idle(s,()=>work(s,true))},delay);
  }
  function record(code) {
    const s=state;if(!s||!active(s)||s.paused||!allowed.has(code))return;
    const k=dateKey()+'|'+code;
    if(s.memory.size<256||s.memory.has(k))s.memory.set(k,Math.min(100,(s.memory.get(k)||0)+1));
    scheduleSave(s);
  }
  async function work(s,send) {
    if(!live(s)||s.paused)return;
    if(s.busy){if(send)scheduleSend(s,60000);else scheduleSave(s);return;}
    if(send && (!active(s)||document.hidden||!navigator.onLine||Date.now()-s.lastAction<10000||document.querySelector('#payAppCheckoutDialog[open],#workoutCameraModal:not([hidden]),#workoutTextDialog[open]')||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||''))){scheduleSend(s,60000);return;}
    s.busy=true;
    try {
      const run=async persistent=>{
        if(!live(s))return;
        let q=persistent?clean(await storage(s)):clean(s.fallback);
        if(!live(s))return;
        const added=pending(s);q.rows=append(q.rows,added);
        if(persistent && !await storage(s,q))return;
        if(!live(s))return;
        if(!persistent)s.fallback=q;
        subtract(s,added);
        if(!send||(!q.flight&&!q.rows.length))return;
        if(!q.flight){q.flight={id:crypto.randomUUID(),rows:q.rows.splice(0,40)};if(persistent&&!await storage(s,q))return;}
        if(!live(s))return;
        s.fallback=q;
        const controller=new AbortController();s.controller=controller;
        const timeout=setTimeout(()=>controller.abort(),8000);
        try {
          let request=s.client.rpc('collect_center_usage_v242',{p_expected_user_id:s.uid,p_batch_id:q.flight.id,p_rows:q.flight.rows});
          if(typeof request.abortSignal==='function')request=request.abortSignal(controller.signal);
          const response=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}))]);
          if(!live(s))return;
          if(response.error||!response.data?.ok)throw new Error('not accepted');
          if(response.data.excluded){s.paused=true;s.memory.clear();q={rows:[],flight:null};}
          else q.flight=null;
          if(persistent)await storage(s,q);else s.fallback=q;
        } finally {clearTimeout(timeout);if(s.controller===controller)s.controller=null;}
      };
      // 지원 브라우저에서는 회원 단위 잠금으로 여러 탭의 중복 전송을 막습니다.
      if(navigator.locks?.request)await navigator.locks.request('centerUsage-v242:'+s.uid,{ifAvailable:true},async lock=>lock?run(Boolean(await openStore())):undefined);
      else await run(false); // 미지원 브라우저는 메모리만 사용하며 기존 기록 기능을 우선합니다.
    } catch (_) { /* 통계 전송 실패는 화면에 알리지 않고 나중에 재시도합니다. */ }
    finally {s.busy=false;if(live(s)&&send&&!s.paused)scheduleSend(s);}
  }
  function reset(){const s=state;if(!s)return;state=null;s.stopped=true;clearTimeout(s.saveTimer);clearTimeout(s.sendTimer);for(const id of s.idles)cancelIdleCallback(id);for(const id of s.timeouts)clearTimeout(id);s.controller?.abort();s.memory.clear();}
  function start(client,uid){if(state?.uid===uid&&state.client===client)return;reset();if(!client||!uid)return;state={uid,client,memory:new Map(),fallback:{rows:[],flight:null},busy:false,paused:false,stopped:false,lastAction:Date.now(),idles:new Set(),timeouts:new Set()};record('app_open');for(const [tab,id] of Object.entries({routine:'routineTabPanel',workoutLog:'workoutLogTabPanel',services:'memberServicesTabPanel',community:'communityTabPanel'}))if(document.getElementById(id)?.hidden===false)screen(tab);scheduleSend(state,90000);}
  function screen(tab){const s=state,code=({routine:'tab_routine',workoutLog:'tab_records',services:'tab_services',community:'tab_community'})[tab];if(s&&active(s)&&code&&s.screen!==tab){s.screen=tab;record(code)}}
  document.addEventListener('click',event=>{
    try {
      const s=state;if(!s||!active(s)||!event.isTrusted)return;
      s.lastAction=Date.now();
      const el=event.target instanceof Element?event.target.closest('button,a,summary'):null;
      if(el&&(el.matches(':disabled')||el.closest('[hidden],#guestDemoDialog,#adminScreen')))return;
      let code=el&&ids[el.id];
      if(el?.getAttribute('aria-selected')==='true')return;
      if(!code&&el)for(const [selector,value] of rules)if(el.matches(selector)){code=value;break;}
      if(code){if(code==='pt_add'&&el.getAttribute('aria-pressed')==='true')return;if(['sets_open','exercise_detail','exercise_video','record_history','timer_open'].includes(code)&&el.getAttribute('aria-expanded')==='true')return;record(code);return;}
      if(event.target.closest('#memberRoutineComponents .routine-component-main')&&!event.target.closest('.routine-component-image-area,.routine-card-dose-record button')){
        const toggle=event.target.closest('.routine-component-card')?.querySelector('.routine-card-toggle');if(toggle?.getAttribute('aria-expanded')==='false')record('exercise_expand');
      }else if(el?.matches('#memberCardioPanel summary')&&!el.parentElement.open)record('cardio_open');
    } catch (_) { /* 원래 클릭 처리를 방해하지 않습니다. */ }
  },{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{const s=state;if(!s||!live(s))return;if(document.hidden)void work(s,false);else scheduleSend(s,90000)});
  window.AppUsage=Object.freeze({start,reset,screen});
})();
