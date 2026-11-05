(() => {
  'use strict';
  const section = document.getElementById('adminPayments');
  const screen = document.getElementById('adminScreen');
  if (!section || !screen) return;
  const byId = id => document.getElementById(id);
  const filter = byId('adminPaymentsFilter'), refresh = byId('refreshAdminPayments');
  const list = byId('adminPaymentsList'), message = byId('adminPaymentsMessage');
  const previous = byId('previousAdminPayments'), next = byId('nextAdminPayments');
  const pageLabel = byId('adminPaymentsPage');
  const body=byId('adminPaymentsBody'),toggle=byId('toggleAdminPayments');
  const noticeButton=byId('adminPaymentNoticeButton'),noticeCount=byId('adminPaymentNoticeCount');
  const noticePreview=byId('adminPaymentNoticePreview'),noticeStatus=byId('adminPaymentNoticeStatus');
  let expanded=false,noticeRequest=0,noticeBusy=false,ackBusy=false,visibleFrame=null,ackTimer=null;
  const visibleChecked=new Set(),visibleQueue=new Set();
  const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  async function noticeRpc(db,name,args){
    const abort=new AbortController();let timeout;
    try{let query=db.rpc(name,args);if(query.abortSignal)query=query.abortSignal(abort.signal);
      const {data,error}=await Promise.race([query,new Promise((_,reject)=>{timeout=setTimeout(()=>{abort.abort();reject(Error('TIMEOUT'));},10000);})]);
      if(error)throw error;return data;
    }finally{clearTimeout(timeout);}
  }
  function validateNotices(data){
    if(data?.ok!==true||data.version!==1||!Number.isSafeInteger(data.count)||data.count<0||!Array.isArray(data.entries)||data.entries.length>20||data.count<data.entries.length||(data.count>0&&!data.entries.length)||new Set(data.entries.map(row=>row.order_id)).size!==data.entries.length||
      data.entries.some(row=>!uuid(row.order_id)||typeof row.member_name!=='string'||typeof row.product_name!=='string'||!Number.isSafeInteger(row.amount)||row.amount<0))throw Error('INVALID_NOTICES');
    return data;
  }
  function applyNotices(data,silent=false){
    validateNotices(data);noticeButton.hidden=data.count===0;
    setText(noticeCount,`새 결제 ${data.count}건`);
    const row=data.entries[0];
    setText(noticePreview,row?`${row.member_name} · ${row.product_name} · ${row.amount.toLocaleString('ko-KR')}원`+(data.count>1?` 외 ${data.count-1}건`:''):'');
    noticeButton.setAttribute('aria-label',`새 결제 ${data.count}건 확인하기`);
    setText(noticeStatus,data.count?'':'새 결제가 없어요.');noticeStatus.classList.remove('is-error');
    void window.AdminRoutineAlerts?.syncPayments(data.entries.map(row=>row.order_id),data.count,silent);
  }
  async function refreshNotices(){
    if(!active()||document.hidden||noticeBusy||ackBusy)return;
    const token=generation,serial=++noticeRequest,db=client,owner=userId;noticeBusy=true;
    try{const data=await noticeRpc(db,'payapp_admin_payment_notices',{p_expected_admin_id:owner});
      if(token!==generation||serial!==noticeRequest||!active()||owner!==userId)return;applyNotices(data);
    }catch(_){if(token===generation&&serial===noticeRequest&&active()){
      setText(noticeStatus,'새 결제 알림을 확인하지 못했어요. 펼쳐서 새로고침해 주세요.');noticeStatus.classList.add('is-error');window.AdminRoutineAlerts?.paymentError();
    }}finally{if(token===generation&&serial===noticeRequest){noticeBusy=false;schedule();}}
  }
  function cardVisible(card){
    const r=card.getBoundingClientRect(),height=Math.min(r.bottom,innerHeight)-Math.max(r.top,0);
    return r.width>0&&r.height>0&&height>=Math.min(r.height*.35,160);
  }
  function queueVisibleCheck(){
    if(visibleFrame!==null)return;
    visibleFrame=requestAnimationFrame(()=>{visibleFrame=null;
      if(!active()||!expanded||document.hidden)return;
      list.querySelectorAll('[data-payment-state="paid"]').forEach(card=>{
        if(!visibleChecked.has(card.dataset.paymentId)&&cardVisible(card))visibleQueue.add(card.dataset.paymentId);
      });
      if(visibleQueue.size&&!ackTimer&&!ackBusy)ackTimer=setTimeout(()=>{ackTimer=null;void acknowledgeVisible();},200);
    });
  }
  async function acknowledgeVisible(){
    if(!active()||!expanded||document.hidden){visibleQueue.clear();return;}
    if(ackBusy)return;
    const visible=new Set([...list.querySelectorAll('[data-payment-state="paid"]')].filter(cardVisible).map(card=>card.dataset.paymentId));
    const ids=[...visibleQueue].filter(id=>visible.has(id)&&uuid(id)&&!visibleChecked.has(id)).slice(0,50);visibleQueue.clear();
    if(!ids.length)return;
    const token=generation,serial=++noticeRequest,owner=userId,db=client;noticeBusy=false;ackBusy=true;
    try{const data=await noticeRpc(db,'payapp_ack_admin_payment_notices',{p_expected_admin_id:owner,p_order_ids:ids});
      if(token!==generation||serial!==noticeRequest||owner!==userId||!active())return;
      validateNotices(data);ids.forEach(id=>visibleChecked.add(id));applyNotices(data,true);
    }catch(_){if(token===generation&&serial===noticeRequest&&active()){
      setText(noticeStatus,'결제 알림 확인 상태를 저장하지 못했어요. 펼쳐서 새로고침해 주세요.');noticeStatus.classList.add('is-error');
    }}finally{if(token===generation&&serial===noticeRequest){ackBusy=false;schedule();if(visibleQueue.size)queueVisibleCheck();}}
  }
  function setExpanded(open,newOnly=false){
    expanded=open;body.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
    toggle.innerHTML=(open?'접기':'펼쳐보기')+' <span aria-hidden="true">⌄</span>';
    if(open){if(newOnly){filter.value='paid';offset=0;entries=[];render();}void load(offset);queueVisibleCheck();}
    else{clearTimeout(ackTimer);ackTimer=null;visibleQueue.clear();}
  }

  const labels = { paid: '결제 완료', cancelled: '취소', partial_refund: '일부 취소' };
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  let client = null, userId = '', generation = 0, requestId = 0, timer = null;
  let busy = false, blocked = false, offset = 0, hasMore = false, entries = [];
  let applicationStates = new Map(), applyingId = '';
  const active = () => Boolean(client && userId && !screen.hidden);
  const live = (token, serial) => token === generation && serial === requestId && active();
  function stop() { clearTimeout(timer); timer = null; }
  function status(text, error = false) { message.textContent = text; message.classList.toggle('is-error', error); }
  function controls() {
    const enabled = active() && !blocked;
    filter.disabled = !enabled || Boolean(applyingId);
    refresh.disabled = !enabled || busy || Boolean(applyingId);
    previous.disabled = !enabled || busy || Boolean(applyingId) || offset === 0;
    next.disabled = !enabled || busy || Boolean(applyingId) || !hasMore;
    toggle.disabled=!active()||Boolean(applyingId);
    pageLabel.textContent = `${Math.floor(offset / 20) + 1}페이지`;
    list.setAttribute('aria-busy', String(busy));
  }
  function textNode(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className; element.textContent = text; return element;
  }
  function time(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? formatter.format(date) : '확인 중';
  }
  function render() {
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const card = document.createElement('article'); card.className = 'admin-payment-card';card.dataset.paymentId=entry.id;card.dataset.paymentState=entry.payment_state;
      const heading = document.createElement('div'); heading.className = 'admin-payment-heading';
      const member = document.createElement('div'); member.className = 'admin-payment-member';
      member.append(textNode('strong', 'admin-payment-name', entry.member_name));
      member.append(textNode('span', 'admin-payment-phone', /^\d{4}$/.test(entry.phone_last4 || '') ? `연락처 끝 ${entry.phone_last4}` : '연락처 끝자리 미등록'));
      heading.append(member, textNode('span', `admin-payment-state is-${entry.payment_state}`, labels[entry.payment_state] || '상태 확인 필요'));
      card.append(heading, textNode('h3', 'admin-payment-product', entry.product_name));
      const options = [entry.options?.clothing && '운동복 대여', entry.options?.locker && '개인락커 이용'].filter(Boolean);
      if (entry.product_code === 'one-day-pt') {
        const selected = document.createElement('ol'); selected.className = 'one-day-pt-exercises';
        for (const exercise of (Array.isArray(entry.pt_exercises) ? entry.pt_exercises.slice(0, 5) : [])) selected.append(textNode('li', '', String(exercise.name || '')));
        card.append(textNode('p', 'admin-payment-options', '1DAY PT 선택 운동'), selected);
      } else card.append(textNode('p', 'admin-payment-options', options.length ? '추가 옵션: ' + options.join(' · ') : '추가 옵션 없음'));
      const amount = Number(entry.amount);
      const amountLabel = entry.payment_state === 'paid' ? '결제 금액' : '원 주문 금액';
      card.append(textNode('p', 'admin-payment-amount', `${amountLabel} ${Number.isSafeInteger(amount) && amount >= 0 ? amount.toLocaleString('ko-KR') + '원' : '확인 필요'}`));
      const details = document.createElement('dl'); details.className = 'admin-payment-dates';
      const dates = [];
      if (entry.paid_at && Number.isFinite(Date.parse(entry.paid_at))) dates.push(['결제 승인', entry.paid_at]);
      dates.push(['주문 접수', entry.requested_at], [entry.payment_state === 'cancelled' ? '취소 상태 확인' : '상태 확인', entry.status_changed_at]);
      for (const [label, value] of dates) {
        const row = document.createElement('div'); row.append(textNode('dt', '', label), textNode('dd', '', time(value))); details.append(row);
      }
      card.append(details);
      if (entry.payment_state === 'paid') {
        const application=applicationStates.get(entry.id), state=application?.state;
        const box=textNode('div','admin-payment-application','');
        if(state==='applied'){
          box.append(textNode('strong','admin-application-applied','상품 적용 완료'));
          box.append(textNode('p','admin-application-time','적용 일시: '+time(application.applied_at)));
          box.append(textNode('p','admin-application-time',application.acknowledged_at?'회원 확인: '+time(application.acknowledged_at):'회원 알림 확인 대기'));
        }else{
          box.append(textNode('p','admin-application-note',state==='pending'?'결제 완료 · 상품 적용 대기':state==='legacy'?'도입 이전 결제 · 적용 여부 미확인':'상품 적용 상태를 확인하지 못했어요. 새로고침해 주세요.'));
          const button=textNode('button','admin-application-button',applyingId===entry.id?'적용 처리 중…':'CRM 적용 완료');
          button.type='button';button.disabled=!['pending','legacy'].includes(state)||Boolean(applyingId)||busy;
          button.addEventListener('click',()=>{void markApplied(entry);});box.append(button);
        }
        card.append(box);
      }
      if (entry.payment_state === 'partial_refund') card.append(textNode('p', 'admin-payment-note', '일부 취소 금액과 잔액은 페이앱 판매자 내역에서 확인해 주세요.'));
      fragment.append(card);
    }
    list.replaceChildren(fragment); controls();queueVisibleCheck();
  }
  function schedule() {
    stop();
    if (active() && !document.hidden) timer = setTimeout(() => { void refreshNotices();if(expanded&&!busy&&!blocked&&!applyingId)void load(offset,true); }, 15000);
  }
  async function markApplied(entry) {
    if(!active()||blocked||busy||applyingId||entry.payment_state!=='paid')return;
    if(!window.confirm(entry.member_name+' 회원님의 '+entry.product_name+' 상품과 추가 옵션을 CRM에 모두 적용하셨나요?\n완료 처리하면 회원에게 상품 적용 알림이 표시됩니다.'))return;
    const token=generation,db=client,owner=userId;applyingId=entry.id;stop();render();
    try{
      const {data,error}=await window.PaymentFulfillment.request(db,'payapp_mark_order_applied',{p_order_id:entry.id});
      if(token!==generation||owner!==userId||!active())return;
      if(error||data?.ok!==true||data.version!==1||data.order_id!==entry.id||data.state!=='applied'||!Number.isFinite(Date.parse(data.applied_at)))throw Error('UNCONFIRMED');
      applicationStates.set(entry.id,{order_id:entry.id,state:'applied',applied_at:data.applied_at,acknowledged_at:data.acknowledged_at});
      status('상품 적용 완료로 표시했어요. 회원에게 안내가 표시됩니다.');
    }catch(_){if(token===generation&&owner===userId&&active())status('적용 처리 결과를 확인하지 못했어요. 새로고침 후 상태를 확인해 주세요.',true);}
    finally{if(token===generation&&owner===userId&&active()){applyingId='';render();schedule();}}
  }
  async function load(target = offset, quiet = false) {
    if (!active() || !expanded || document.hidden || blocked || applyingId) return;
    stop();
    const token = generation, serial = ++requestId, expectedUserId = userId, activeClient = client;
    const selectedFilter = filter.value;
    busy = true; controls();
    if (!quiet) status('결제 내역을 불러오고 있어요.');
    try {
      const { data: authData, error: authError } = await activeClient.auth.getUser();
      if (!live(token, serial)) return;
      if (authError || authData?.user?.id !== expectedUserId) { const error = new Error(); error.code = 'AUTH_REQUIRED'; throw error; }
      const { data, error } = await activeClient.functions.invoke('payapp-admin-orders', {
        body: { action: 'list', expected_user_id: expectedUserId, filter: selectedFilter, offset: target }
      });
      if (!live(token, serial)) return;
      if (error || !data?.ok) {
        let detail = data;
        if (!detail && error?.context?.json) { try { detail = await error.context.json(); } catch (_) {} }
        if (!live(token, serial)) return;
        const failure = new Error(); failure.code = detail?.code || 'NETWORK'; failure.dbCode = detail?.db_code; throw failure;
      }
      if (!Array.isArray(data.entries) || data.offset !== target || data.page_size !== 20 || typeof data.has_more !== 'boolean') throw new Error('BAD_RESPONSE');
      if (!data.entries.length && target > 0) { void load(Math.max(0, target - 20)); return; }
      let nextStates=new Map(),stateError=false;
      try{nextStates=await window.PaymentFulfillment.getStatuses(activeClient,data.entries.map(row=>row.id),true);}catch(_){stateError=true;}
      if(!live(token,serial))return;
      applicationStates=nextStates;
      offset = target; entries = data.entries; hasMore = data.has_more; render();
      status(entries.length ? stateError?'상품 적용 상태를 불러오지 못했어요. 새로고침해서 확인해 주세요.':'' : '표시할 결제 완료·취소 내역이 없어요.',stateError);
    } catch (error) {
      if (!live(token, serial)) return;
      if (['AUTH_REQUIRED', 'ADMIN_REQUIRED'].includes(error.code)) {
        entries = []; hasMore = false; blocked = true; render();
        status(error.code === 'ADMIN_REQUIRED' ? '관리자 권한이 필요한 내역이에요.' : '로그인 상태를 확인해 주세요.', true);
      } else {
        const safeCode = [error.code, error.dbCode].filter(value => typeof value === 'string' && /^[A-Z0-9_]{3,40}$/.test(value)).join('/');
        const hint = safeCode ? ' (확인 코드: ' + safeCode + ')' : '';
        status((entries.length ? '새로 불러오지 못했어요. 현재 표시된 내역은 이전 조회 결과예요.' : '결제 내역을 불러오지 못했어요. 잠시 후 새로고침해 주세요.') + hint, true);
      }
    } finally {
      if (live(token, serial)) { busy = false; render(); schedule(); }
    }
  }
  function reset() {
    generation++; requestId++;noticeRequest++;stop();client=null;userId='';
    noticeBusy=false;ackBusy=false;clearTimeout(ackTimer);ackTimer=null;cancelAnimationFrame(visibleFrame);visibleFrame=null;visibleChecked.clear();visibleQueue.clear();
    expanded=false;body.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.innerHTML='펼쳐보기 <span aria-hidden="true">⌄</span>';noticeButton.hidden=true;setText(noticePreview,'');setText(noticeStatus,'새 결제 알림을 확인하고 있어요.');noticeStatus.classList.remove('is-error');
    busy = false; blocked = false; offset = 0; hasMore = false; entries = [];
    applicationStates=new Map();applyingId='';
    filter.value = 'all'; status(''); render();
  }
  function start(nextClient, nextUserId) {
    if (client === nextClient && userId === String(nextUserId) && !blocked) {
      void refreshNotices();if(expanded&&!busy)void load(offset,true);return;
    }
    reset();client=nextClient;userId=String(nextUserId);controls();void refreshNotices();
  }
  toggle.addEventListener('click',()=>setExpanded(!expanded));
  noticeButton.addEventListener('click',()=>{setExpanded(true,true);section.scrollIntoView({behavior:'smooth',block:'start'});});
  refresh.addEventListener('click',()=>{void refreshNotices();void load(offset);queueVisibleCheck();});
  window.addEventListener('scroll',queueVisibleCheck,{passive:true});window.addEventListener('resize',queueVisibleCheck);
  filter.addEventListener('change', () => { entries = []; offset = 0; hasMore = false; render(); void load(0); });
  previous.addEventListener('click', () => { void load(Math.max(0, offset - 20)); });
  next.addEventListener('click', () => { if (hasMore) void load(offset + 20); });
  window.addEventListener('focus',()=>{if(active()){void refreshNotices();if(expanded&&!busy)void load(offset,true);queueVisibleCheck();}});
  document.addEventListener('visibilitychange', () => {
    if(document.hidden)stop();else if(active()){void refreshNotices();if(expanded&&!busy)void load(offset,true);queueVisibleCheck();}
  });
  new MutationObserver(() => { if (screen.hidden && userId) reset(); }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  window.AdminPayments = Object.freeze({ start, reset });
  controls();
})();
