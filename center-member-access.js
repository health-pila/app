/* Account access is verified with the existing login profile round trip. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),notice=$('centerAccessNotice'),panel=$('adminMemberAccessPanel');
  let member=null,memberGeneration=0,pollTimer=null,busy=false,dismissed='',acknowledging=false;
  let admin=null,adminGeneration=0,selection=0,selected='',adminState=null,adminBusy=false;
  const validProfile=(p,id)=>p&&p.id===id&&['member','admin'].includes(p.role)&&typeof p.restricted==='boolean'&&
    (!p.restricted||(p.role==='member'&&typeof p.notice_id==='string'&&/^[0-9a-f-]{36}$/i.test(p.notice_id)));
  async function rpc(db,name,args){
    const abort=new AbortController();let timer;
    try{
      let query=db.rpc(name,args);if(query.abortSignal)query=query.abortSignal(abort.signal);
      const result=await Promise.race([query,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('TIMEOUT'));},10000);})]);
      if(result.error)throw result.error;return result.data;
    }finally{clearTimeout(timer);}
  }
  function resetMember(){
    memberGeneration++;clearTimeout(pollTimer);pollTimer=null;member=null;busy=false;dismissed='';acknowledging=false;
    if(notice.open)notice.close();$('centerAccessNoticeStatus').textContent='';$('centerAccessNoticeConfirm').disabled=false;
  }
  function showNotice(){
    if(!member||!member.profile.restricted||member.profile.acknowledged_at||dismissed===member.profile.notice_id||notice.open)return;
    // The account page stays available even when a member postpones the notice.
    $('centerAccessNoticeStatus').textContent='';notice.showModal();$('centerAccessNoticeConfirm').focus();
  }
  function schedule(){clearTimeout(pollTimer);if(member)pollTimer=setTimeout(()=>void refresh(),60000);}
  async function refresh(force=false){
    const state=member,g=memberGeneration;if(!state||busy||document.visibilityState!=='visible'){schedule();return;}
    if(!force&&Date.now()-state.checkedAt<15000){schedule();return;}
    busy=true;
    try{
      const p=await rpc(state.db,'center_my_access_profile');
      if(g!==memberGeneration||member!==state)return;
      if(!validProfile(p,state.id))throw Error('INVALID_PROFILE');
      state.checkedAt=Date.now();
      if(p.restricted!==state.profile.restricted||p.role!==state.profile.role){
        // Stop exposing the previous screen before refreshing the authoritative login gate.
        document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        for(const id of ['appScreen','adminScreen','restrictedScreen'])$(id).hidden=true;
        location.reload();return;
      }
      // A late unread response must never resurrect an acknowledgement just committed here.
      if(state.acknowledgedId===p.notice_id)p.acknowledged_at=state.profile.acknowledged_at;
      state.profile=p;if(p.restricted)showNotice();
    }catch(_){/* Keep a known restriction; the server continues to enforce it. */}
    finally{if(g===memberGeneration){busy=false;schedule();}}
  }
  function startMember(db,id,profile){
    resetMember();if(!validProfile(profile,id))return;
    member={db,id,profile,checkedAt:Date.now(),acknowledgedId:''};schedule();showNotice();
  }
  async function acknowledge(){
    const state=member,g=memberGeneration;if(!state?.profile.restricted||acknowledging)return;
    const id=state.profile.notice_id;acknowledging=true;$('centerAccessNoticeConfirm').disabled=true;
    $('centerAccessNoticeStatus').textContent='확인 상태를 저장하고 있어요…';
    try{
      const data=await rpc(state.db,'center_ack_access_notice',{p_notice_id:id});
      if(g!==memberGeneration||member!==state)return;
      if(data?.ok!==true)throw Error('INVALID_ACK');
      if(!data.available){notice.close();await refresh(true);return;}
      if(!data.acknowledged_at||!Number.isFinite(Date.parse(data.acknowledged_at)))throw Error('INVALID_ACK');
      if(state.profile.notice_id!==id){notice.close();showNotice();return;}
      state.acknowledgedId=id;state.profile.acknowledged_at=data.acknowledged_at;dismissed=id;notice.close();
    }catch(_){if(g===memberGeneration)$('centerAccessNoticeStatus').textContent='확인 상태를 저장하지 못했어요. 다시 눌러 주세요.';}
    finally{if(g===memberGeneration){acknowledging=false;$('centerAccessNoticeConfirm').disabled=false;}}
  }
  function dismiss(){if(member)dismissed=member.profile.notice_id;notice.close();}
  $('centerAccessNoticeConfirm').addEventListener('click',()=>void acknowledge());
  $('centerAccessNoticeClose').addEventListener('click',dismiss);
  notice.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
  window.addEventListener('focus',()=>void refresh());
  document.addEventListener('visibilitychange',()=>void refresh());

  function resetAdmin(){adminGeneration++;selection++;admin=null;selected='';adminState=null;adminBusy=false;panel.hidden=true;}
  function startAdmin(db,id){resetAdmin();admin={db,id};}
  const adminCurrent=(g,s,id)=>admin&&g===adminGeneration&&s===selection&&id===selected&&!$('adminScreen').hidden;
  function renderAdmin(){
    const restricted=adminState?.restricted===true;
    $('adminMemberAccessRestrict').hidden=!adminState||restricted;
    $('adminMemberAccessRelease').hidden=!adminState||!restricted;
    $('adminMemberAccessRestrict').disabled=adminBusy;$('adminMemberAccessRelease').disabled=adminBusy;$('adminMemberAccessRefresh').disabled=adminBusy;
    panel.dataset.restricted=String(restricted);
    if(!adminState)return;
    $('adminMemberAccessState').textContent=restricted?'이용 제한 중 · 내 정보와 탈퇴 요청만 이용할 수 있어요.':'일반 이용 · 회원 확인이 필요한 경우에만 지정해 주세요.';
    const at=adminState.acknowledged_at;
    $('adminMemberAccessRead').textContent=!restricted?'':at?'안내 확인: '+new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'안내 미확인 · 다음 앱 이용 시 표시됩니다.';
  }
  async function selectAdminMember(id){
    selected=String(id||'');const s=++selection,g=adminGeneration;adminState=null;adminBusy=false;
    panel.hidden=!admin||!selected;$('adminMemberAccessStatus').textContent='';renderAdmin();
    if(panel.hidden)return;
    $('adminMemberAccessState').textContent='앱 이용 상태를 확인하고 있어요.';
    const target=selected;
    try{
      const data=await rpc(admin.db,'center_admin_member_access',{p_user_id:target});
      if(!adminCurrent(g,s,target))return;
      if(data?.user_id!==target||typeof data.restricted!=='boolean')throw Error('INVALID_STATE');
      adminState=data;renderAdmin();
    }catch(_){if(adminCurrent(g,s,target))$('adminMemberAccessStatus').textContent='이용 상태를 확인하지 못했어요. 회원을 다시 선택해 주세요.';}
  }
  async function changeAccess(restricted){
    const id=selected,s=selection,g=adminGeneration;if(!adminCurrent(g,s,id)||!adminState||adminBusy)return;
    const name=adminState.display_name||'선택 회원';
    const prompt=restricted?name+' 님에게 센터 회원 확인 안내를 표시하고 앱 이용을 제한할까요?\n내 정보·탈퇴 요청·로그아웃만 이용할 수 있습니다.\n가입 이름과 전화번호 끝 4자리를 먼저 확인해 주세요.':name+' 님의 센터 회원 확인을 완료하고 앱 이용 제한을 해제할까요?';
    if(!window.confirm(prompt))return;
    adminBusy=true;renderAdmin();$('adminMemberAccessStatus').textContent='변경 내용을 저장하고 있어요.';
    try{
      const data=await rpc(admin.db,'center_admin_set_member_access',{p_user_id:id,p_restricted:restricted});
      if(!adminCurrent(g,s,id))return;
      if(data?.user_id!==id||data.restricted!==restricted)throw Error('INVALID_STATE');
      adminState=data;renderAdmin();$('adminMemberAccessStatus').textContent=restricted?'안내와 이용 제한이 설정됐어요.':'회원 확인 완료 · 이용 제한을 해제했어요.';
    }catch(_){if(adminCurrent(g,s,id))$('adminMemberAccessStatus').textContent='변경 결과를 확인하지 못했어요. 회원을 다시 선택해 상태를 확인해 주세요.';}
    finally{if(adminCurrent(g,s,id)){adminBusy=false;renderAdmin();}}
  }
  $('adminMemberAccessRestrict').addEventListener('click',()=>void changeAccess(true));
  $('adminMemberAccessRelease').addEventListener('click',()=>void changeAccess(false));
  $('adminMemberAccessRefresh').addEventListener('click',()=>void selectAdminMember(selected));
  window.CenterMemberAccess=Object.freeze({startMember,resetMember,startAdmin,resetAdmin,selectAdminMember,refresh,
    isRestricted:()=>member?.profile.restricted===true,
    validProfile});
})();
