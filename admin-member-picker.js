/* Original native dropdown; only append the server-confirmed attendance label. */
(() => {
  'use strict';
  const select=document.getElementById('adminMemberSelect'),screen=document.getElementById('adminScreen');
  if(!select||!screen)return;
  let client=null,user='',epoch=0,seq=0,ready=false,busy=false,lastRead=0,linked=new Set(),revision=0,updates=new Map();
  const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
  const active=e=>e===epoch&&user&&client&&!screen.hidden;
  const linkState=id=>active(epoch)?updates.get(id)?.linked??(ready?linked.has(id):null):null;
  const notify=()=>select.dispatchEvent(new Event('attendance-status-change'));
  function refresh(){
    for(const option of select.options){
      if(!option.value)continue;
      if(!option.dataset.memberBaseText)option.dataset.memberBaseText=option.textContent;
      const state=linkState(option.value);
      const label=state===null?'출석 확인 필요':state?'출석 연결':'출석 미연결';
      const text=option.dataset.memberBaseText+' · '+label;
      if(option.textContent!==text)option.textContent=text;
    }
  }
  async function loadLinks(force=false){
    const e=epoch;if(!active(e)||busy||(!force&&ready&&Date.now()-lastRead<30000))return;
    const request=++seq,version=revision;busy=true;notify();
    try{
      const {data,error}=await client.rpc('broj_admin_linked_member_ids');
      if(!active(e)||request!==seq)return;
      if(error||!data||!Array.isArray(data.linked_user_ids)||data.linked_user_ids.length>100000||!data.linked_user_ids.every(uuid))throw Error('invalid');
      linked=new Set(data.linked_user_ids);ready=true;lastRead=Date.now();
      for(const [id,v] of updates){if(v.revision>version){if(v.linked)linked.add(id);else linked.delete(id);}else updates.delete(id);}
    }catch(_){if(active(e)&&request===seq){ready=false;linked.clear();updates.clear();}}
    finally{if(active(e)&&request===seq){busy=false;refresh();notify();}}
  }
  function setLink(id,value){if(!active(epoch)||!uuid(id)||typeof value!=='boolean')return;updates.set(id,{linked:value,revision:++revision});if(value)linked.add(id);else linked.delete(id);refresh();notify();}
  function reset(){epoch++;seq++;client=null;user='';ready=false;busy=false;lastRead=0;linked.clear();updates.clear();revision=0;refresh();notify();}
  function start(connection,id){reset();client=connection;user=id;refresh();void loadLinks();}
  // Recheck when revisiting the list; no timer or extra BROJ calls.
  select.addEventListener('focus',()=>void loadLinks());
  new MutationObserver(refresh).observe(select,{childList:true});
  new MutationObserver(()=>{if(screen.hidden&&user)reset();}).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.AdminMemberPicker=Object.freeze({start,reset,refresh,setLink,linkState,isLoading:()=>busy});
})();
