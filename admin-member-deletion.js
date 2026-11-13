/* Staff account deletion. Credentials and deletion authority stay on the server. */
(() => {
 'use strict';
 if (window.AdminMemberDeletion) return;
 const $ = id => document.getElementById(id), uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
 const el = (tag,text,className) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
 const errors={AUTH_REQUIRED:'관리자 로그인을 다시 확인해 주세요.',ADMIN_REQUIRED:'현재 관리자 권한을 확인하지 못했어요.',MEMBER_ONLY:'회원 계정만 탈퇴 처리할 수 있어요.',MEMBER_NOT_FOUND:'이미 삭제되었거나 찾을 수 없는 회원이에요. 목록을 새로고침해 주세요.',MEMBER_CHANGED:'회원 정보가 바뀌었어요. 창을 닫고 대상을 다시 확인해 주세요.',OPEN_PAYMENT_REQUEST:'진행 중인 결제 요청을 먼저 취소한 뒤 다시 확인해 주세요.',MEDIA_REVIEW_REQUIRED:'다른 곳에서 함께 쓰는 사진이 있어 삭제를 멈췄어요. 사진 연결을 먼저 확인해 주세요.',FILES_RETRY:'사진 정리가 완료되지 않았어요. 다시 시도하면 이어서 처리해요.',AUTH_DELETE_RETRY:'계정 삭제가 완료되지 않았어요. 다시 시도하면 이어서 처리해요.',DELETION_INCOMPLETE:'삭제 결과를 확인하지 못했어요. 다시 시도해 주세요.',DATABASE_RETRY:'처리를 완료하지 못했어요. 다시 시도해 주세요.'};
 let client=null,owner='',generation=0,selection='',hooks={},busy=false,previewBusy=false,pendingBusy=false,preview=null,target='',returnFocus=null;
 let mounted=false;
 const active = ticket => ticket===generation && owner && client && !$('adminScreen').hidden;
 function mount(){
  if(mounted)return;mounted=true;
  const panel=el('details',undefined,'amd-panel');panel.id='adminMemberDeletionPanel';panel.hidden=true;
  panel.append(el('summary','앱 탈퇴 처리'),el('p','앱 계정과 연결된 루틴·운동 기록·사진·문의·결제 내역을 삭제합니다. 브로제이 원본과 결제사의 기록은 유지되며, 환불은 별도로 처리해야 해요.'));
  const open=el('button','회원 확인 후 탈퇴 처리','amd-outline');open.type='button';open.id='adminMemberDeletionOpen';open.onclick=()=>void show(selection);panel.append(open);
  $('awAccessSlot').append(panel);
  const pending=el('section',undefined,'amd-pending');pending.id='adminDeletionPending';pending.hidden=true;
  const heading=el('div',undefined,'amd-pending-heading');heading.append(el('strong','마무리가 필요한 탈퇴 처리'));
  const refresh=el('button','새로고침','aw-text-button');refresh.type='button';refresh.onclick=()=>void loadPending();heading.append(refresh);pending.append(heading,el('div',undefined,'amd-pending-list'));pending.lastChild.id='adminDeletionPendingList';
  $('awMemberRows').before(pending);
  const dialog=el('dialog',undefined,'amd-dialog');dialog.id='adminMemberDeletionDialog';dialog.setAttribute('aria-labelledby','amdTitle');
  dialog.innerHTML='<header><h2 id="amdTitle">앱 탈퇴 처리</h2><button id="amdClose" type="button" class="aw-secondary">닫기 ×</button></header><div class="amd-body"><p id="amdIdentity" class="amd-identity"></p><p id="amdStatus" class="amd-status" role="status" aria-live="polite"></p><div id="amdConfirmation" hidden><p>앱 계정·루틴·운동 기록·사진·출석 연결·문의·결제 내역을 영구 삭제해요. 삭제한 데이터는 되돌릴 수 없어요.</p><p>브로제이 원본·센터 회원권은 유지됩니다. 결제 취소·환불은 별도로 처리해 주세요.</p><dl id="amdCounts"></dl><label class="amd-ack"><input id="amdAck" type="checkbox"><span>탈퇴 요청과 삭제 대상을 확인했고, 별도 보관이 필요한 기록은 따로 보관했어요.</span></label><label id="amdVerifyLabel" for="amdVerify"></label><input id="amdVerify" type="text" autocomplete="off" inputmode="text"><button id="amdDelete" type="button" class="amd-delete" disabled>앱 계정과 데이터 영구 삭제</button></div><button id="amdRetryPreview" type="button" class="aw-secondary" hidden>대상 다시 확인</button><button id="amdDone" type="button" class="aw-secondary" hidden>닫기</button></div>';
  $('adminScreen').append(dialog);
  $('amdClose').onclick=close;$('amdDone').onclick=close;$('amdRetryPreview').onclick=()=>void show(target);
  $('amdAck').onchange=confirmState;$('amdVerify').oninput=confirmState;$('amdDelete').onclick=()=>void run();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  window.addEventListener('focus',()=>{if(owner)void loadPending();});
 }
 async function request(action,data={}){
  const {data:result,error}=await client.functions.invoke('admin-member-delete',{body:{action,expected_user_id:owner,...data}});
  if(error){let code='';try{const body=await error.context?.clone().json();code=body?.code||'';}catch(_){}throw new Error(code||'TEMPORARY_RETRY');}
  if(result?.ok!==true)throw new Error(result?.code||'BAD_RESPONSE');return result;
 }
 function confirmState(){
  const identity=preview?.member,expected=identity?.last4||identity?.name;
  $('amdDelete').disabled=busy||previewBusy||!identity||preview.open_payments>0||preview.blocked_files>0||!expected||!$('amdAck').checked||$('amdVerify').value.trim()!==expected;
 }
 function locked(value){
  busy=value;$('amdClose').disabled=value;$('amdAck').disabled=value;$('amdVerify').disabled=value;$('amdRetryPreview').disabled=value;confirmState();
 }
 function close(){if(busy)return;preview=null;previewBusy=false;target='';$('adminMemberDeletionDialog').close();$('amdIdentity').textContent='';$('amdStatus').textContent='';$('amdCounts').replaceChildren();$('amdVerify').value='';$('amdAck').checked=false;returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});}
 async function show(id){
  if(!owner||!uuid(id)||busy||hooks.isBusy?.())return;
  const ticket=generation;target=id;preview=null;previewBusy=true;
  returnFocus=document.activeElement;
  const dialog=$('adminMemberDeletionDialog');if(!dialog.open)dialog.showModal();
  $('amdIdentity').textContent='';
  $('amdStatus').textContent='삭제할 회원과 데이터를 확인하고 있어요.';
  $('amdConfirmation').hidden=true;$('amdRetryPreview').hidden=true;$('amdDone').hidden=true;$('amdAck').checked=false;$('amdVerify').value='';locked(false);
  try{
   const result=await request('preview',{member_id:id});
   if(!active(ticket)||target!==id||!dialog.open)return;
   if(result.member?.id!==id||typeof result.member.name!=='string'||typeof result.member.last4!=='string'||!/^[a-f0-9]{32}$/.test(result.fingerprint)||!['preview','files','auth'].includes(result.phase))throw new Error('BAD_RESPONSE');
   preview=result;
   const identity=result.member,expected=identity.last4||identity.name;
   $('amdIdentity').textContent=identity.name+(identity.last4?' · '+identity.last4:'');
   const list=$('amdCounts');list.replaceChildren();
   for(const [label,n] of [['사진',result.files],['운동 루틴',result.counts?.['public.member_routines']],['운동 기록',result.counts?.['public.workout_records']],['문의',result.counts?.['public.member_inquiries']],['결제 내역',result.counts?.['public.center_payapp_orders']]]){
    if(Number.isSafeInteger(n)&&n>=0)list.append(el('dt',label),el('dd',String(n)+'개'));
   }
   $('amdVerifyLabel').textContent=identity.last4?'회원 확인: 전화번호 끝 네 자리를 입력해 주세요.':'회원 확인: 위에 표시된 이름을 그대로 입력해 주세요.';
   $('amdVerify').inputMode=identity.last4?'numeric':'text';$('amdVerify').placeholder=identity.last4?'끝 네 자리':'회원 이름';
   $('amdDelete').textContent=result.phase==='preview'?'앱 계정과 데이터 영구 삭제':'이어서 삭제 처리';
   $('amdStatus').textContent=result.open_payments>0?errors.OPEN_PAYMENT_REQUEST:result.blocked_files>0?errors.MEDIA_REVIEW_REQUIRED:result.phase!=='preview'?'삭제가 시작된 계정이에요. 아래에서 이어서 마무리해 주세요.':expected?'아래 내용을 확인한 뒤 삭제를 진행해 주세요.':'회원 확인 정보가 부족해 삭제할 수 없어요.';
   $('amdConfirmation').hidden=false;
  }catch(error){if(active(ticket)&&target===id&&dialog.open){$('amdStatus').textContent=errors[error.message]||'대상을 확인하지 못했어요. 서버 배포 상태와 연결을 확인한 뒤 다시 시도해 주세요.';$('amdRetryPreview').hidden=false;}}
  finally{if(active(ticket)&&target===id){previewBusy=false;confirmState();}}
 }
 async function run(){
  confirmState();if(busy||$('amdDelete').disabled||!preview)return;
  const ticket=generation,id=target,identity=preview.member;let operation=preview.operation_id||'',remaining=null,stalled=0;
  locked(true);$('amdRetryPreview').hidden=true;$('amdStatus').textContent='삭제를 시작했어요. 완료될 때까지 기다려 주세요.';
  try{
   for(let batch=0;batch<500;batch++){
    const result=await request('run',{member_id:id,fingerprint:preview.fingerprint,...(operation?{operation_id:operation}:{}),confirm_delete:true,records_checked:true});
    if(!active(ticket))return;
    if(result.deleted===true){
     preview=null;$('amdConfirmation').hidden=true;$('amdStatus').textContent=identity.name+'님의 앱 계정과 데이터 삭제를 완료했어요.';$('amdDone').hidden=false;locked(false);
     try{await hooks.onDeleted?.(id);}catch(_){$('amdStatus').textContent+=' 목록을 새로고침해 주세요.';}
     if(active(ticket))void loadPending();return;
    }
    if(!uuid(result.operation_id)||!Number.isSafeInteger(result.remaining_files)||result.remaining_files<0)throw new Error('BAD_RESPONSE');
    operation=result.operation_id;preview.operation_id=operation;preview.phase='files';
    stalled=remaining!==null&&result.remaining_files>=remaining?stalled+1:0;remaining=result.remaining_files;
    if(stalled>=2)throw new Error('FILES_RETRY');
    $('amdStatus').textContent=remaining?'사진을 정리하고 있어요. '+remaining+'개 남았어요.':'사진 정리가 끝났어요. 계정과 연결 데이터를 삭제하고 있어요.';
   }
   throw new Error('FILES_RETRY');
  }catch(error){if(active(ticket)){$('amdStatus').textContent=errors[error.message]||'삭제가 완료되지 않았어요. 다시 시도하면 이어서 처리해요.';$('amdDelete').textContent='다시 시도 · 이어서 삭제';void loadPending();}}
  finally{if(active(ticket))locked(false);}
 }
 async function loadPending(){
  if(!owner||pendingBusy)return;const ticket=generation;pendingBusy=true;
  try{
   const result=await request('pending');if(!active(ticket))return;
   if(!Array.isArray(result.entries)||result.entries.length>100)throw Error();
   const list=$('adminDeletionPendingList');list.replaceChildren();
   for(const entry of result.entries){
    if(!uuid(entry.member?.id)||typeof entry.member.name!=='string')continue;
    const b=el('button',entry.member.name+(entry.member.last4?' · '+entry.member.last4:'')+' · 이어서 처리','amd-outline');b.type='button';b.onclick=()=>void show(entry.member.id);list.append(b);
   }
   $('adminDeletionPending').hidden=!list.childElementCount;
   if(result.total>100)list.append(el('p','표시된 처리를 마무리하면 나머지 항목을 확인할 수 있어요.'));
  }catch(_){/* Existing account operations remain usable when the new server is unavailable. */}
  finally{if(active(ticket))pendingBusy=false;}
 }
 function reset(){
  generation++;owner='';client=null;selection='';preview=null;target='';busy=false;previewBusy=false;pendingBusy=false;hooks={};
  if(mounted){$('adminMemberDeletionDialog').close();$('adminMemberDeletionPanel').hidden=true;$('adminMemberDeletionPanel').open=false;$('adminDeletionPending').hidden=true;$('adminDeletionPendingList').replaceChildren();$('amdIdentity').textContent='';$('amdStatus').textContent='';$('amdCounts').replaceChildren();$('amdVerify').value='';$('amdAck').checked=false;}
 }
 function start(connection,id,config={}){mount();reset();if(!connection||!uuid(id))return;client=connection;owner=id;hooks=config;void loadPending();}
 function selectMember(id,visible){selection=uuid(id)?id:'';if(mounted){$('adminMemberDeletionPanel').hidden=!visible||!selection;$('adminMemberDeletionOpen').disabled=busy;}}
 window.AdminMemberDeletion=Object.freeze({start,reset,selectMember,isBusy:()=>busy,refresh:loadPending});
})();
