/* v281: authenticated, durable batches. UI never awaits statistics. */
(() => {
  'use strict';
  const app = document.getElementById('appScreen');
  const ids = {
    memberAssignedRoutineMenuButton:'menu_routine',memberCardioMenuButton:'menu_cardio',memberStretchingMenuButton:'menu_stretch',
    openOneDayPtCart:'pt_cart',submitOneDayPt:'pt_checkout',routineRequestButton:'routine_request',routineTutorialRequestButton:'routine_request',
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
  const uuid = () => crypto.randomUUID();
  const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
  const validRow = r => r && Object.keys(r).length===3 && allowed.has(r.code) && /^\d{4}-\d{2}-\d{2}$/.test(r.day) && Number.isInteger(r.hits) && r.hits>0 && r.hits<=100 && r.day<=dateKey() && r.day>=new Date(Date.now()-7*86400000+9*3600000).toISOString().slice(0,10);
  const validBatch = q => q && validId(q.id) && validId(q.uid) && Array.isArray(q.rows) && q.rows.length>0 && q.rows.length<=40 && q.rows.every(validRow);
  let state=null, database;
  const live = s => state===s && !s.stopped;
  const active = s => live(s) && app && !app.hidden;
  function openStore(){
    if(!database)database=new Promise(resolve=>{
      let settled=false;const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
      const timer=setTimeout(()=>finish(null),2000);
      try{const req=indexedDB.open('centerUsage-v281',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('outbox',{keyPath:'id'});
        req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();finish(db);};
        req.onerror=req.onblocked=()=>finish(null);
      }catch(_){finish(null);}
    });return database;
  }
  async function transaction(mode,fn){
    const db=await openStore();if(!db)throw Error('storage unavailable');
    return new Promise((resolve,reject)=>{try{
      const tx=db.transaction('outbox',mode),store=tx.objectStore('outbox');let result;
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('storage failed'));
      fn(store,value=>{result=value;});
    }catch(e){reject(e);}});
  }
  function addRow(q,row){
    const match=q?.rows.find(r=>r.day===row.day&&r.code===row.code);
    if(!q||q.sealed||match&&match.hits+row.hits>100||!match&&q.rows.length>=40)return null;
    if(match)match.hits+=row.hits;else q.rows.push({...row});return q;
  }
  function fresh(s,row){return {id:uuid(),uid:s.uid,rows:[{...row}],sealed:false,created:Date.now()};}
  function remember(s,row){let q=addRow(s.fallback.find(q=>q.id===s.draft),row);if(!q){q=fresh(s,row);s.fallback.push(q);}s.draft=q.id;}
  function queue(s,row){
    s.writes=s.writes.then(async()=>{
      if(s.paused)return;
      try{const id=await transaction('readwrite',(store,done)=>{
        const req=store.get(s.draft||'');req.onsuccess=()=>{
          let q=req.result;
          q=q?.uid===s.uid&&validBatch(q)?addRow(q,row):null;
          if(!q)q=fresh(s,row);
          store.put(q);done(q.id);
        };
      });s.draft=id;}catch(_){remember(s,row);}
    }).catch(()=>{});
  }
  async function nextBatch(s){
    let result=null;
    try{result=await transaction('readwrite',(store,done)=>{
      const req=store.getAll();req.onsuccess=()=>{
        const own=req.result.filter(q=>q.uid===s.uid).sort((a,b)=>(a.created||0)-(b.created||0));
        for(const q of own){if(q.migrated){if(q.created<Date.now()-8*86400000)store.delete(q.id);continue;}if(!validBatch(q)){store.delete(q.id);continue;}
          q.sealed=true;store.put(q);done(q);return;}
        done(null);
      };
    });}catch(_){}
    if(result)return result;
    // When site storage is denied, retain a bounded request in this page's memory.
    while(s.fallback.length&&!validBatch(s.fallback[0]))s.fallback.shift();
    result=s.fallback[0];if(result)result.sealed=true;return result||null;
  }
  async function ack(s,q){
    // Delete only after an explicit server acknowledgement. Ambiguous results retry the same ID.
    try{await transaction('readwrite',(store)=>{const req=store.get(q.id);req.onsuccess=()=>{if(req.result?.uid===s.uid)store.delete(q.id);};});}catch(_){}
    s.fallback=s.fallback.filter(x=>x.id!==q.id);
  }
  async function discard(s){
    s.paused=true;s.fallback=[];await s.writes;
    try{await transaction('readwrite',store=>{const req=store.getAll();req.onsuccess=()=>{for(const q of req.result)if(q.uid===s.uid)store.delete(q.id);};});}catch(_){}
  }
  async function importLegacy(s){
    // Only the legacy Web Locks path persisted this queue. Preserve its existing batch IDs.
    if(!navigator.locks?.request)return;
    await navigator.locks.request('centerUsage-v242:'+s.uid,{ifAvailable:true},async lock=>{
      if(!lock)return;
      const db=await new Promise(resolve=>{let done=false;const finish=v=>{if(done){v?.close();return;}done=true;clearTimeout(timer);resolve(v);};const timer=setTimeout(()=>finish(null),1500);
        try{const r=indexedDB.open('centerUsage-v242',1);r.onupgradeneeded=()=>r.result.createObjectStore('queue');r.onsuccess=()=>finish(r.result);r.onerror=r.onblocked=()=>finish(null);}catch(_){finish(null);}});
      if(!db)return;
      try{
        const old=await new Promise(resolve=>{try{const tx=db.transaction('queue','readonly'),r=tx.objectStore('queue').get(s.uid);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);}catch(_){resolve(null);}});
        if(!old)return;
        const items=[];
        if(validId(old.flight?.id)&&Array.isArray(old.flight.rows)&&old.flight.rows.length&&old.flight.rows.length<=40&&old.flight.rows.every(validRow))items.push({id:old.flight.id,rows:old.flight.rows});
        const rows=Array.isArray(old.rows)?old.rows.filter(validRow).slice(0,256):[];
        for(let i=0;i<rows.length;i+=40){const part=rows.slice(i,i+40),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.uid+JSON.stringify(old.flight||null)+JSON.stringify(part)+i));
          const hex=Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,'0')).join('');
          items.push({id:hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32),rows:part});
        }
        await transaction('readwrite',store=>{for(const item of items){const key='legacy:'+item.id,req=store.get(key);req.onsuccess=()=>{if(!req.result){store.put({...item,uid:s.uid,sealed:true,created:Date.now()-1});store.put({id:key,uid:s.uid,migrated:true,created:Date.now()});}};}});
        await new Promise((resolve,reject)=>{const tx=db.transaction('queue','readwrite');tx.objectStore('queue').delete(s.uid);tx.oncomplete=resolve;tx.onerror=tx.onabort=reject;});
      }finally{db.close();}
    });
  }
  function scheduleSend(s,delay=60000){
    if(!live(s)||s.paused)return;
    const due=Date.now()+delay;if(s.sendTimer&&s.due<=due)return;
    clearTimeout(s.sendTimer);s.due=due;s.sendTimer=setTimeout(()=>{s.sendTimer=null;void work(s);},delay);
  }
  function record(code){
    const s=state;if(!s||!active(s)||s.paused||!allowed.has(code))return;
    queue(s,{day:dateKey(),code,hits:1});scheduleSend(s,60000);
  }
  async function work(s){
    if(!live(s)||s.paused)return;
    if(s.busy){s.again=true;return;}
    if(!navigator.onLine){scheduleSend(s,15000);return;}
    s.busy=true;let retry=60000;
    try{
      await s.writes;if(!live(s)||s.paused)return;
      const q=await nextBatch(s);if(!q||!live(s))return;
      const controller=new AbortController();s.controller=controller;
      const timer=setTimeout(()=>controller.abort(),8000);
      try{
        let request=s.client.rpc('collect_center_usage_v242',{p_expected_user_id:s.uid,p_batch_id:q.id,p_rows:q.rows});
        if(typeof request.abortSignal==='function')request=request.abortSignal(controller.signal);
        const response=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))]);
        if(!live(s))return;
        if(response.error||!response.data?.ok)throw Error('not accepted');
        if(response.data.excluded){await discard(s);return;}
        await ack(s,q);s.failures=0;
        // Drain saved batches without flooding the server.
        retry=1000;
      }finally{clearTimeout(timer);if(s.controller===controller)s.controller=null;}
    }catch(_){s.failures=Math.min(6,s.failures+1);retry=Math.min(300000,5000*2**s.failures);}
    finally{s.busy=false;if(live(s)&&!s.paused){if(s.again){s.again=false;retry=Math.min(retry,1000);}scheduleSend(s,retry);}}
  }
  function reset(){const s=state;if(!s)return;state=null;s.stopped=true;clearTimeout(s.sendTimer);s.controller?.abort();/* queued writes still finish under the original account */}
  function start(client,uid){
    if(state?.uid===uid&&state.client===client)return;
    reset();if(!client||!validId(uid))return;
    const s=state={uid,client,draft:null,fallback:[],writes:Promise.resolve(),busy:false,paused:false,stopped:false,failures:0,again:false};
    // Legacy migration runs independently, so an old tab cannot delay the new visit.
    void importLegacy(s).then(()=>{if(live(s))scheduleSend(s,1000);}).catch(()=>{});
    record('app_open');
    for(const [tab,id] of Object.entries({routine:'routineTabPanel',workoutLog:'workoutLogTabPanel',services:'memberServicesTabPanel',community:'communityTabPanel'}))if(document.getElementById(id)?.hidden===false)screen(tab);
    // No network wait in start(): render/authentication continues immediately.
    scheduleSend(s,1000);
  }
  function screen(tab){const s=state,code=({routine:'tab_routine',workoutLog:'tab_records',services:'tab_services',community:'tab_community'})[tab];if(s&&active(s)&&code&&s.screen!==tab){s.screen=tab;record(code);}}
  document.addEventListener('click',event=>{
    try {
      const s=state;if(!s||!active(s)||!event.isTrusted)return;
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
  document.addEventListener('visibilitychange',()=>{const s=state;if(!s||!live(s))return;if(document.hidden)void work(s);else scheduleSend(s,1000);});
  window.addEventListener('pagehide',()=>{if(state)void work(state);});
  window.addEventListener('online',()=>{if(state)scheduleSend(state,1000);});
  // Retain auth headers and response handling from the Supabase SDK. No tokens in analytics storage.
  function createFetch(endpoint){
    const original=window.fetch.bind(window),url=new URL('/rest/v1/rpc/collect_center_usage_v242',endpoint).href;
    return (input,init)=>{
      const target=typeof input==='string'?input:input instanceof URL?input.href:input.url;
      const method=init?.method||(input instanceof Request?input.method:'GET');
      return target===url&&method.toUpperCase()==='POST'?original(input,{...init,keepalive:true}):original(input,init);
    };
  }
  window.AppUsage=Object.freeze({start,reset,screen,createFetch});
})();
