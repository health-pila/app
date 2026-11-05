/* Payment application is independent of payment approval. Acknowledgements are saved to the account. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), dialog=$('paymentAppliedDialog'), screen=$('appScreen');
  if(!dialog||!screen)return;
  const product=$('paymentAppliedProduct'),stamp=$('paymentAppliedTime'),message=$('paymentAppliedMessage');
  const confirm=$('paymentAppliedConfirm'),historyButton=$('paymentAppliedHistory'),closeButton=$('paymentAppliedClose');
  const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  const formatter=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const formatTime=v=>date(v)?formatter.format(new Date(v)):'확인 필요';
  const states=new Set(['pending','applied','legacy','not_applicable']);
  async function request(db,name,args){
    const controller=new AbortController();let timeout;
    try{
      let query=db.rpc(name,args);if(typeof query.abortSignal==='function')query=query.abortSignal(controller.signal);
      return await Promise.race([query,new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('REQUEST_TIMEOUT'));},10000);})]);
    }finally{clearTimeout(timeout);}
  }
  async function getStatuses(db,ids,admin=false){
    if(!Array.isArray(ids)||ids.length>50||!ids.every(uuid))throw Error('INVALID_ORDERS');
    if(!ids.length)return new Map();
    const {data,error}=await request(db,admin?'payapp_admin_fulfillment_statuses':'payapp_my_fulfillment_statuses',{p_order_ids:ids});
    if(error||data?.ok!==true||data.version!==1||!Array.isArray(data.entries)||data.entries.length>ids.length)throw Error('STATUS_UNAVAILABLE');
    const expected=new Set(ids),result=new Map();
    for(const row of data.entries){
      if(!row||!expected.has(row.order_id)||result.has(row.order_id)||!states.has(row.state)||
        !(row.applied_at===null||date(row.applied_at))||!(row.acknowledged_at===null||date(row.acknowledged_at))||
        row.state==='applied'&&!date(row.applied_at))throw Error('INVALID_STATUS');
      result.set(row.order_id,{...row});
    }
    return result;
  }
  let client=null,owner='',generation=0,timer=null,presentTimer=null,loading=false,ackBusy=false,lastChecked=0;
  let pending=[],current=null;const postponed=new Set(),acknowledged=new Set();
  const active=()=>Boolean(client&&owner&&!screen.hidden);
  const live=g=>g===generation&&active();
  function buttons(){confirm.disabled=historyButton.disabled=closeButton.disabled=ackBusy;}
  function clearNotice(){current=null;product.textContent='';stamp.textContent='';message.textContent='';if(dialog.open)dialog.close();}
  function present(){
    if(!active()||document.hidden||dialog.open||document.querySelector('dialog[open]'))return;
    const row=pending.find(row=>!postponed.has(row.order_id));if(!row)return;
    current=row;product.textContent=row.product_name;stamp.textContent='상품 적용 일시: '+formatTime(row.applied_at);message.textContent='';buttons();
    dialog.showModal();confirm.focus({preventScroll:true});
  }
  function presentSoon(){clearTimeout(presentTimer);if(active())presentTimer=setTimeout(present,300);}
  function schedule(delay=60000){clearTimeout(timer);timer=null;if(active()&&!document.hidden)timer=setTimeout(()=>{void check();},delay);}
  async function check(){
    if(!active()||document.hidden)return;
    if(loading||ackBusy){schedule(1500);return;}
    const elapsed=Date.now()-lastChecked;
    if(elapsed<30000){schedule(30000-elapsed);return;}
    const g=generation,db=client;loading=true;lastChecked=Date.now();
    try{
      const {data,error}=await request(db,'payapp_my_application_notices');
      if(!live(g))return;
      if(error||data?.ok!==true||data.version!==1||!Array.isArray(data.entries)||data.entries.length>10)throw Error('NOTICE_UNAVAILABLE');
      const ids=new Set();
      for(const row of data.entries){
        if(!row||!uuid(row.order_id)||ids.has(row.order_id)||typeof row.product_name!=='string'||!row.product_name.trim()||row.product_name.length>500||!date(row.applied_at))throw Error('INVALID_NOTICE');
        ids.add(row.order_id);
      }
      // An acknowledgement on another device, or a later cancellation, removes an open notice too.
      // A lookup started before Confirm may finish after the acknowledgement was saved.
      // Such a stale response must never redisplay a confirmed order in this session.
      pending=data.entries.filter(row=>!acknowledged.has(row.order_id)).map(row=>({...row}));
      if(current&&!ids.has(current.order_id)&&!ackBusy)clearNotice();
      present();
    }catch(_){/* Notification checks must not block login or overwrite account/payment screens. */}
    finally{if(live(g)){loading=false;schedule();}}
  }
  function postpone(){
    if(ackBusy||!current)return;
    postponed.add(current.order_id);clearNotice();
  }
  async function acknowledge(openHistory=false){
    if(!active()||!current||ackBusy)return;
    const g=generation,id=current.order_id,db=client;ackBusy=true;message.textContent='확인한 기록을 저장하고 있어요…';buttons();
    try{
      const {data,error}=await request(db,'payapp_ack_application_notice',{p_order_id:id});
      if(!live(g)||current?.order_id!==id)return;
      if(error||data?.ok!==true||data.version!==1||data.order_id!==id||!['acknowledged','not_available'].includes(data.code))throw Error('ACK_UNCONFIRMED');
      acknowledged.add(id);pending=pending.filter(row=>row.order_id!==id);postponed.delete(id);clearNotice();
      window.dispatchEvent(new CustomEvent('paymentapplicationacknowledged',{detail:{orderId:id}}));
      if(openHistory)window.MemberAccount?.openPayments?.();
      else presentSoon();
    }catch(_){if(live(g)&&current?.order_id===id)message.textContent='확인 기록을 저장하지 못했어요. 다시 눌러 주세요.';}
    finally{if(live(g)){ackBusy=false;buttons();}}
  }
  function reset(){
    generation++;clearTimeout(timer);clearTimeout(presentTimer);timer=presentTimer=null;client=null;owner='';loading=false;ackBusy=false;lastChecked=0;pending=[];postponed.clear();acknowledged.clear();clearNotice();buttons();
  }
  function start(db,id){reset();if(!uuid(id))return;client=db;owner=id;schedule(1500);}
  confirm.addEventListener('click',()=>{void acknowledge();});historyButton.addEventListener('click',()=>{void acknowledge(true);});
  closeButton.addEventListener('click',postpone);dialog.addEventListener('cancel',e=>{e.preventDefault();postpone();});
  dialog.addEventListener('close',()=>{if(current){postponed.add(current.order_id);current=null;}});
  document.addEventListener('close',presentSoon,true);
  window.addEventListener('focus',()=>schedule(1000));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else schedule(1000);});
  new MutationObserver(()=>{if(screen.hidden&&owner)reset();}).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.PaymentFulfillment=Object.freeze({start,reset,getStatuses,formatTime,request});
})();
