/* Native select remains the selection model; custom picker adds per-status colors. */
(() => {
  'use strict';
  const select=document.getElementById('adminMemberSelect'),screen=document.getElementById('adminScreen');
  if(!select||!screen)return;
  const placeholder='루틴 | 출석연결을 관리할 회원 선택';
  const button=document.createElement('button');button.id='adminMemberPickerButton';button.type='button';button.className='admin-member-picker-trigger';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','adminMemberPickerDialog');
  select.after(button);select.hidden=true;
  document.querySelector('label[for="adminMemberSelect"]')?.setAttribute('for',button.id);
  const dialog=document.createElement('dialog');dialog.id='adminMemberPickerDialog';dialog.className='admin-member-picker-dialog';dialog.setAttribute('aria-labelledby','adminMemberPickerTitle');
  const head=document.createElement('div');head.className='admin-member-picker-heading';
  const title=document.createElement('h2');title.id='adminMemberPickerTitle';title.textContent='루틴 | 출석연결을 관리할 회원 선택';
  const close=document.createElement('button');close.type='button';close.textContent='닫기';close.autofocus=true;close.addEventListener('click',()=>dialog.close());head.append(title,close);
  const search=document.createElement('input');search.type='search';search.placeholder='이름, 전화번호 뒷자리, 이메일 검색';search.setAttribute('aria-label','회원 목록 검색');search.autocomplete='off';
  const status=document.createElement('p');status.className='admin-member-picker-status';status.setAttribute('role','status');
  const retry=document.createElement('button');retry.type='button';retry.textContent='연결 상태 새로고침';retry.className='admin-member-picker-retry';retry.addEventListener('click',()=>void loadLinks(true));
  const list=document.createElement('div');list.className='admin-member-picker-list';
  dialog.append(head,search,status,retry,list);document.body.append(dialog);
  let client=null,user='',epoch=0,seq=0,ready=false,busy=false,lastRead=0,failed=false,linked=new Set(),revision=0,updates=new Map();
  const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
  const active=e=>e===epoch&&user&&client&&!screen.hidden;
  function pill(text,kind){const el=document.createElement('span');el.className='admin-member-state '+kind;el.textContent=text;return el;}
  function content(option){
    const wrap=document.createElement('span');wrap.className='admin-member-picker-content';
    const name=document.createElement('strong');name.textContent=option.dataset.memberName||option.textContent;
    if(option.dataset.phoneLast4)name.append(document.createTextNode(' · '+option.dataset.phoneLast4));
    const states=document.createElement('span');states.className='admin-member-picker-states';
    states.append(pill((option.dataset.assignmentCount||'0')+'회 배정','neutral'),pill(option.dataset.routineAssigned==='true'?'루틴 있음':'루틴 없음',option.dataset.routineAssigned==='true'?'yes':'no'));
    const state=updates.get(option.value)?.linked??(ready?linked.has(option.value):null);
    states.append(pill(state===null?'출석 확인 필요':state?'출석 연결':'출석 미연결',state===null?'unknown':state?'yes':'no'));
    wrap.append(name,states);return wrap;
  }
  function refresh(){
    const option=select.options[select.selectedIndex];button.replaceChildren();button.disabled=select.disabled||!user||screen.hidden;
    if(option?.value)button.append(content(option));else {const text=document.createElement('span');text.textContent=option?.textContent||placeholder;button.append(text);}
    const arrow=document.createElement('span');arrow.className='admin-member-picker-arrow';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');button.append(arrow);
    if(dialog.open)renderList();
  }
  function renderList(){
    const query=search.value.trim().toLowerCase();list.replaceChildren();
    status.textContent=busy?'출석 연결 상태를 확인하고 있어요.':failed?'출석 연결 상태를 불러오지 못했어요. 새로고침해 주세요.':ready?'초록색: 있음·연결 / 회색: 없음·미연결':'출석 연결 상태 확인이 필요해요.';
    retry.disabled=busy;
    const options=Array.from(select.options).filter(o=>o.value&&!o.disabled&&[o.textContent,o.dataset.email||''].join(' ').toLowerCase().includes(query));
    for(const option of options){
      const row=document.createElement('button');row.type='button';row.className='admin-member-picker-row';row.setAttribute('aria-pressed',String(option.value===select.value));row.disabled=select.disabled;row.append(content(option));
      row.addEventListener('click',()=>{if(button.disabled||screen.hidden)return;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();dialog.close();});list.append(row);
    }
    if(!options.length){const empty=document.createElement('p');empty.textContent='일치하는 회원이 없어요.';list.append(empty);}
  }
  async function loadLinks(force=false){
    const e=epoch;if(!active(e)||busy||(!force&&ready&&Date.now()-lastRead<30000))return;
    const request=++seq,version=revision;busy=true;failed=false;refresh();
    try{
      const {data,error}=await client.rpc('broj_admin_linked_member_ids');
      if(!active(e)||request!==seq)return;
      if(error||!data||!Array.isArray(data.linked_user_ids)||data.linked_user_ids.length>100000||!data.linked_user_ids.every(uuid))throw Error('invalid');
      linked=new Set(data.linked_user_ids);ready=true;lastRead=Date.now();
      for(const [id,v] of updates){if(v.revision>version){if(v.linked)linked.add(id);else linked.delete(id);}else updates.delete(id);}
    }catch(_){if(active(e)&&request===seq){ready=false;failed=true;linked.clear();updates.clear();}}
    finally{if(active(e)&&request===seq){busy=false;refresh();}}
  }
  function setLink(id,value){if(!active(epoch)||!uuid(id)||typeof value!=='boolean')return;updates.set(id,{linked:value,revision:++revision});if(value)linked.add(id);else linked.delete(id);refresh();}
  function reset(){epoch++;seq++;client=null;user='';ready=false;busy=false;failed=false;lastRead=0;linked.clear();updates.clear();revision=0;if(dialog.open)dialog.close();refresh();}
  function start(connection,id){reset();client=connection;user=id;refresh();void loadLinks();}
  button.addEventListener('click',()=>{if(button.disabled)return;search.value='';renderList();dialog.showModal();void loadLinks();});
  dialog.addEventListener('close',()=>{if(!button.disabled)button.focus();});search.addEventListener('input',renderList);select.addEventListener('change',refresh);
  new MutationObserver(refresh).observe(select,{childList:true,subtree:true,attributes:true});
  new MutationObserver(()=>{if(screen.hidden&&user)reset();else refresh();}).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.AdminMemberPicker=Object.freeze({start,reset,refresh,setLink});refresh();
})();
