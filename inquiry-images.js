/* Private chat photos. The server checks the caller, room and immutable upload slots. */
(() => {
 'use strict';
 if (window.InquiryImages) return;
 const MAX=3,MAX_BYTES=1048576,TARGET_BYTES=300*1024,JOURNAL='center-inquiry-pending-v404:';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 const PATH=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/;
 const FALLBACK='사진을 보냈습니다.';
 const errors={INQUIRY_INTAKE_CLOSED:'현재 문의 접수가 중단되어 있어요.',MEMBER_DELETED_INQUIRY:'회원이 삭제한 대화에는 사진을 보낼 수 없어요.',INQUIRY_UNAVAILABLE:'현재 이 대화에 사진을 보낼 수 없어요.',INQUIRY_AUTH_REQUIRED:'로그인 상태를 다시 확인해 주세요.',INQUIRY_UPLOAD_EXPIRED:'전송 대기 시간이 지났어요. 사진을 다시 선택해 주세요.',INQUIRY_IMAGE_BUSY:'다른 작업이 진행 중이에요. 잠시 후 다시 시도해 주세요.',APP_ACCOUNT_DELETING:'계정 상태가 변경되어 전송할 수 없어요.',INQUIRY_UPLOAD_RETRY_LIMIT:'대기 중인 사진이 많아요. 잠시 후 다시 시도해 주세요.'};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let client=null,userId='',role='',origin='',isCurrent=()=>false,epoch=0,observer=null,dialog=null,viewerImage=null,viewerStatus=null,viewerTicket=0,viewerFocus=null,cleanupTimer=0,cleanupBusy=false;
 const states=new Map(),inputs=new WeakMap(),tiles=new Set(),urlCache=new Map();
 const current=t=>t===epoch&&!!userId&&!!client&&isCurrent();
 const stateKey=(kind,room)=>kind+':'+(room||'new');
 const journalKey=()=>JOURNAL+role+':'+userId;
 function saveJournal(){
  if(!userId)return;
  try {const entries=[...states.values()].filter(s=>s.attempt?.uncertain).map(s=>({kind:s.kind,room:s.room,clientId:s.attempt.clientId,body:s.attempt.body,items:s.attempt.items.map(i=>({id:i.id,mime_type:i.mime_type,width:i.width,height:i.height,bytes:i.bytes})),at:s.attempt.at}));
   if(entries.length)sessionStorage.setItem(journalKey(),JSON.stringify(entries));else sessionStorage.removeItem(journalKey());
  } catch(_){/* In-memory retry protection remains available if browser storage is blocked. */}
 }
 function validSpec(i){return i&&UUID.test(i.id)&&['image/webp','image/jpeg'].includes(i.mime_type)&&Number.isInteger(i.bytes)&&i.bytes>0&&i.bytes<=MAX_BYTES&&Number.isInteger(i.width)&&i.width>0&&i.width<=2048&&Number.isInteger(i.height)&&i.height>0&&i.height<=2048;}
 function abandon(s){if(s.attempt)for(const item of s.items)item.id=crypto.randomUUID();s.attempt=null;saveJournal();}
 function loadJournal(){
  try {const data=JSON.parse(sessionStorage.getItem(journalKey())||'[]');if(!Array.isArray(data)||data.length>50)return;
   for(const x of data){if(!['new','member','admin'].includes(x.kind)||(x.kind==='admin')!==(role==='admin')||x.room!==null&&!UUID.test(x.room)||x.kind==='new'&&x.room!==null||x.kind!=='new'&&x.room===null||!UUID.test(x.clientId)||typeof x.body!=='string'||x.body.length>5000||!Array.isArray(x.items)||x.items.length<1||x.items.length>MAX||!x.items.every(validSpec)||!Number.isFinite(x.at))continue;
    const s={key:stateKey(x.kind,x.room),kind:x.kind,room:x.room,items:x.items.map(i=>({...i,blob:null,preview:''})),caption:x.body,attempt:{clientId:x.clientId,body:x.body,items:x.items,at:x.at,uncertain:true},busy:false,processing:false};states.set(s.key,s);
   }
  }catch(_){}
 }
 async function timed(p,ms=30000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('INQUIRY_NETWORK_TIMEOUT')),ms);})]);}finally{clearTimeout(timer);}}
 async function rpc(name,args,t){
  if(!current(t))throw new Error('INQUIRY_STALE');
  const {data,error}=await timed(client.rpc(name,args));
  if(!current(t))throw new Error('INQUIRY_STALE');
  if(error)throw error;
  if(data?.ok!==true||data.version!==404)throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');return data;
 }
 function setStatus(s,text){if(s.status?.isConnected)s.status.textContent=text;}
 function blocked(s){return !!s.input?.disabled||!!s.originalReadOnly||s.input?.closest('.admin-inquiry-thread')?.dataset.memberDeleted==='true';}
 function sync(s){
  if(!s.input)return;const lock=s.busy||s.processing||s.attempt?.uncertain||blocked(s);
  s.add.disabled=!!lock;s.file.disabled=!!lock;
  if(lock){s.button.disabled=!!(s.busy||s.processing||blocked(s));s.input.readOnly=true;s.managed=true;}
  else if(s.managed){s.button.disabled=false;s.input.readOnly=false;s.managed=false;}
  if(s.kind==='new')s.button.disabled=!!(s.busy||s.processing||blocked(s)||!s.input.value.trim()&&!s.items.length&&!s.attempt);
  s.count.textContent=s.items.length?s.items.length+'/'+MAX:'';
  s.preview.hidden=!s.items.length;s.preview.replaceChildren();
  for(const [index,item]of s.items.entries()){
   const cell=el('div','inquiry-photo-draft');
   if(item.preview){const img=el('img');img.src=item.preview;img.alt='첨부 사진 '+(index+1);cell.append(img);}else cell.append(el('span','inquiry-photo-pending','사진 '+(index+1)));
   const remove=el('button','inquiry-photo-remove','×');remove.type='button';remove.setAttribute('aria-label','사진 '+(index+1)+' 선택 취소');remove.disabled=!!(s.busy||s.processing||s.attempt?.uncertain);
   remove.addEventListener('click',()=>{if(!current(s.ticket)||remove.disabled)return;if(item.preview)URL.revokeObjectURL(item.preview);s.items.splice(index,1);abandon(s);sync(s);});cell.append(remove);s.preview.append(cell);
  }
 }
 function attach(input,button,status,kind,room){
  if(!input||!button||!status||!current(epoch))return;
  const key=stateKey(kind,room);let s=states.get(key);
  if(!s){s={key,kind,room,items:[],attempt:null,busy:false,processing:false,caption:''};states.set(key,s);}
  if(s.input===input){sync(s);return;}
  if(s.input&&(s.items.length||s.attempt||s.busy||s.processing))s.caption=s.input.value;
  const label=input.parentElement.querySelector('label');
  if(!label)return;
  if(!s.tools){
   s.tools=el('span','inquiry-image-tools');s.add=el('button','inquiry-photo-add','＋ 사진 첨부');s.add.type='button';
   if(kind==='new'){
    s.add.setAttribute('aria-label','사진 첨부');s.add.title='사진 첨부';
    s.add.replaceChildren(document.getElementById('memberChatPhotoIcon').content.cloneNode(true));
   }
   s.count=el('small','inquiry-photo-count');s.file=el('input');s.file.type='file';s.file.accept='image/*';s.file.multiple=true;s.file.hidden=true;s.file.setAttribute('aria-label','대화에 첨부할 사진 선택');
   s.add.addEventListener('click',()=>{if(current(s.ticket)&&!s.add.disabled)s.file.click();});
   s.file.addEventListener('change',()=>{const files=Array.from(s.file.files||[]);s.file.value='';void select(s,files);});
   s.tools.append(s.add,s.count,s.file);s.preview=el('div','inquiry-photo-previews');s.preview.hidden=true;
  }
  const heading=el('div','inquiry-compose-heading');label.replaceWith(heading);heading.append(label,s.tools);input.after(s.preview);
  if(!s.normalLabel||!s.busy)s.normalLabel=button.textContent;
  s.input=input;s.button=button;s.status=status;s.originalReadOnly=input.readOnly;s.managed=false;s.ticket=epoch;inputs.set(input,s);
  if(s.items.length||s.attempt||s.busy||s.processing)input.value=s.caption;
  input.addEventListener('input',()=>{if(s.input===input&&!s.busy){s.caption=input.value;if(s.kind==='new'&&!s.processing&&!blocked(s))s.button.disabled=!input.value.trim()&&!s.items.length&&!s.attempt;}});
  sync(s);if(s.attempt?.uncertain)setStatus(s,'전송 결과를 확인할 사진이 있어요. 같은 내용으로 다시 전송하면 중복 없이 확인해요.');
 }
 function scan(){
  if(!current(epoch))return;
  if(role==='member'){
   const input=document.getElementById('memberInquiryBody');attach(input,document.getElementById('sendMemberInquiryButton'),document.getElementById('memberInquirySubmitMessage'),'new',null);

  }else document.querySelectorAll('#adminScreen .admin-inquiry-reply-area textarea').forEach(input=>{const area=input.closest('.admin-inquiry-reply-area'),thread=input.closest('.admin-inquiry-thread'),room=thread?.id.replace(/^adminInquiryThread-/,'');if(UUID.test(room||''))attach(input,thread.querySelector('.admin-inquiry-send-button'),area.querySelector('.admin-inquiry-reply-message'),'admin',room);});
  for(const [key,s]of states)if(s.input&&!s.input.isConnected&&!s.items.length&&!s.attempt&&!s.busy&&!s.processing){s.tools?.remove();s.preview?.remove();states.delete(key);}
 }
 async function compress(file){
  if(!file||file.size<=0||file.size>25*1024*1024||file.type&&!file.type.startsWith('image/')||file.type==='image/svg+xml'||/\.svgz?$/i.test(file.name||''))throw new Error('25MB 이하의 사진 파일을 선택해 주세요.');
  const source=URL.createObjectURL(file);let image;
  try{
   image=await timed(new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('사진을 읽을 수 없어요. JPG나 PNG 사진으로 다시 선택해 주세요.'));img.src=source;}),20000);
   const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height||width*height>80000000)throw new Error('사진 크기가 너무 커요. 작은 크기로 저장한 사진을 선택해 주세요.');
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('사진을 압축하지 못했어요. 다시 시도해 주세요.');
   let best=null,previous='';
   for(const edge of [1920,1600,1280,960]){
    const ratio=Math.min(1,edge/Math.max(width,height)),w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));if(previous===w+'x'+h)continue;previous=w+'x'+h;canvas.width=w;canvas.height=h;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,w,h);
    for(const quality of [.82,.72,.62]){
     let blob=await timed(new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality)),15000);
     if(blob?.type!=='image/webp')blob=await timed(new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality)),15000);
     if(!blob||!['image/webp','image/jpeg'].includes(blob.type))throw new Error('사진 압축에 실패했어요. 다시 선택해 주세요.');
     if(!best||blob.size<best.blob.size)best={blob,width:w,height:h};
     if(blob.size<=TARGET_BYTES)return {blob,width:w,height:h};
    }
   }
   if(!best||best.blob.size>MAX_BYTES)throw new Error('사진을 충분히 줄이지 못했어요. 작은 사진을 선택해 주세요.');return best;
  }finally{if(image)image.src='';URL.revokeObjectURL(source);}
 }
 async function select(s,files){
  if(!files.length||!current(s.ticket)||s.busy||s.processing||s.attempt?.uncertain||blocked(s))return;
  if(files.length+s.items.length>MAX){setStatus(s,'사진은 한 번에 최대 3장까지 첨부할 수 있어요.');return;}
  s.processing=true;sync(s);setStatus(s,'사진을 준비하고 있어요.');const t=s.ticket,added=[];
  try{for(const file of files){const out=await compress(file);if(!current(t))return;added.push({id:crypto.randomUUID(),blob:out.blob,mime_type:out.blob.type,bytes:out.blob.size,width:out.width,height:out.height,preview:URL.createObjectURL(out.blob)});}
   if(!current(t))return;abandon(s);s.items.push(...added.splice(0));setStatus(s,'');
  }catch(error){if(current(t))setStatus(s,error.message||'사진을 준비하지 못했어요. 다시 선택해 주세요.');}
  finally{for(const item of added)URL.revokeObjectURL(item.preview);s.processing=false;if(current(t))sync(s);}
 }
 function validPath(path){return typeof path==='string'&&PATH.test(path)&&path.split('/').slice(0,3).every(x=>UUID.test(x))&&UUID.test(path.split('/')[3].split('.')[0]);}
 async function send(input){
  const s=inputs.get(input),t=epoch;if(!s||s.ticket!==t||states.get(s.key)!==s||!current(t)||s.busy||s.processing||blocked(s))return null;
  if(!s.items.length&&!s.attempt)return null;
  if(!s.attempt)s.attempt={clientId:crypto.randomUUID(),body:s.input.value.trim(),items:s.items.map(i=>({...i})),at:Date.now(),uncertain:false};
  const a=s.attempt;if(!a.uncertain)a.body=s.input.value.trim();s.lastCode='';if(a.body.length>5000){setStatus(s,'문의 내용은 5000자 이하로 입력해 주세요.');return null;}
  s.busy=true;sync(s);setStatus(s,'');const normalLabel=s.normalLabel||s.button.textContent;s.button.textContent='사진 전송 중...';
  try{
   const specs=a.items.map(i=>({id:i.id,mime_type:i.mime_type,width:i.width,height:i.height,bytes:i.bytes}));
   const prepared=await rpc('prepare_inquiry_images_v404',{p_expected_user_id:userId,p_client_id:a.clientId,p_inquiry_id:s.room,p_files:specs},t);
   if(prepared.client_id!==a.clientId||s.room&&prepared.inquiry_id!==s.room||typeof prepared.already_sent!=='boolean'||!Array.isArray(prepared.files)||!prepared.already_sent&&prepared.files.length!==specs.length)throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');
   if(!prepared.already_sent){
    const seen=new Set();for(const f of prepared.files){const item=a.items.find(i=>i.id===f.id),ext=item?.mime_type==='image/webp'?'webp':'jpg';
     const root=s.kind==='admin'?f.path?.split('/')[0]:userId;
     if(!item||seen.has(f.id)||!validPath(f.path)||f.path!==`${root}/${userId}/${a.clientId}/${item.id}.${ext}`||typeof f.uploaded!=='boolean')throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');seen.add(f.id);
     if(!f.uploaded){if(!item.blob)throw new Error('INQUIRY_UPLOAD_EXPIRED');
      const {error}=await timed(client.storage.from('inquiry-images').upload(f.path,item.blob,{contentType:item.mime_type,cacheControl:'60',upsert:false}),45000);
      if(!current(t))return null;if(error)throw error;
     }
    }
   }
   // Persist before the commit request. A lost response or same-tab reload can
   // retry the same immutable attempt without duplicating a delivered message.
   a.uncertain=true;saveJournal();
   const result=await rpc('send_inquiry_images_v404',{p_expected_user_id:userId,p_client_id:a.clientId,p_inquiry_id:s.room,p_body:a.body},t);
   if(result.client_id!==a.clientId||!UUID.test(result.message_id||'')||!UUID.test(result.inquiry_id||'')||s.room&&result.inquiry_id!==s.room||typeof result.already_sent!=='boolean')throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');
   for(const item of s.items)if(item.preview)URL.revokeObjectURL(item.preview);s.items=[];s.attempt=null;s.caption='';s.input.value='';s.input.dispatchEvent(new Event('input',{bubbles:true}));saveJournal();setStatus(s,'');return result;
  }catch(error){
   if(!current(t))return null;
   const code=String(error.message||''),known=Object.keys(errors).find(k=>code.includes(k));
   s.lastCode=known||'';
   if(known==='INQUIRY_UPLOAD_EXPIRED'){for(const item of s.items)if(item.preview)URL.revokeObjectURL(item.preview);s.items=[];s.attempt=null;}
   saveJournal();setStatus(s,known?errors[known]:a.uncertain?'전송 결과를 확인하지 못했어요. 같은 내용으로 다시 시도하면 중복 없이 확인해요.':'사진 전송을 완료하지 못했어요. 사진과 글은 그대로 있어요. 다시 시도해 주세요.');return null;
  }finally{if(current(t)){s.busy=false;s.button.textContent=normalLabel;sync(s);}}
 }
 async function read(messages,valid=()=>true){
  const t=epoch;if(!current(t)||!valid())return null;const ids=[...new Set(messages.map(m=>m.id))],map=new Map(),seen=new Set(),paths=new Set();
  if(!ids.every(id=>UUID.test(id)))throw new Error('INVALID_INQUIRY_MESSAGE_IDS');
  for(let offset=0;offset<ids.length;offset+=200){const batch=ids.slice(offset,offset+200),allowed=new Set(batch);
   const data=await rpc('read_inquiry_images_v404',{p_expected_user_id:userId,p_message_ids:batch},t);if(!current(t)||!valid())return null;
   if(!Array.isArray(data.entries)||data.entries.length>batch.length*MAX)throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');
   for(const item of data.entries){if(!validSpec(item)||!allowed.has(item.message_id)||!validPath(item.path)||role==='member'&&item.path.split('/')[0]!==userId||seen.has(item.id)||paths.has(item.path)||!Number.isInteger(item.position)||item.position<0||item.position>=MAX)throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');
    const group=map.get(item.message_id)||[];if(group.length>=MAX||group.some(x=>x.position===item.position))throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');group.push(item);map.set(item.message_id,group);seen.add(item.id);paths.add(item.path);
   }
  }
  for(const group of map.values())group.sort((a,b)=>a.position-b.position);return map;
 }
 async function signed(path,t){
  if(!validPath(path)||!current(t))throw new Error('INQUIRY_STALE');const cached=urlCache.get(path);if(cached&&cached.until>Date.now())return cached.url;
  const {data,error}=await timed(client.storage.from('inquiry-images').createSignedUrl(path,300));if(!current(t))throw new Error('INQUIRY_STALE');if(error)throw error;
  const url=new URL(data?.signedUrl||'',origin);
  if(url.origin!==origin||decodeURIComponent(url.pathname)!=='/storage/v1/object/sign/inquiry-images/'+path||!url.searchParams.get('token'))throw new Error('INQUIRY_IMAGE_BAD_URL');
  urlCache.set(path,{url:url.href,until:Date.now()+240000});if(urlCache.size>200)urlCache.delete(urlCache.keys().next().value);return url.href;
 }
 function closeViewer(restore=true){viewerTicket++;if(dialog?.open)dialog.close();if(viewerImage)viewerImage.removeAttribute('src');if(viewerStatus)viewerStatus.textContent='';if(restore&&viewerFocus?.isConnected)viewerFocus.focus({preventScroll:true});viewerFocus=null;}
 function mountViewer(){
  if(dialog)return;dialog=el('dialog','inquiry-image-viewer');dialog.setAttribute('aria-label','대화 사진 확대 보기');
  const close=el('button','inquiry-image-viewer-close','닫기 ×');close.type='button';close.addEventListener('click',closeViewer);
  viewerImage=el('img');viewerImage.alt='첨부 사진 확대';viewerStatus=el('p','inquiry-image-viewer-status');viewerStatus.setAttribute('role','status');
  dialog.append(close,viewerImage,viewerStatus);dialog.addEventListener('cancel',event=>{event.preventDefault();closeViewer();});dialog.addEventListener('click',event=>{if(event.target===dialog)closeViewer();});document.body.append(dialog);
 }
 async function openViewer(item,focus,t){if(!current(t))return;mountViewer();viewerFocus=focus;const request=++viewerTicket;viewerImage.removeAttribute('src');viewerStatus.textContent='사진을 불러오는 중이에요.';if(!dialog.open)dialog.showModal();
  try{const url=await signed(item.path,t);if(!current(t)||request!==viewerTicket||!dialog.open)return;viewerImage.onload=()=>{if(request===viewerTicket)viewerStatus.textContent='';};viewerImage.onerror=()=>{urlCache.delete(item.path);if(request===viewerTicket)viewerStatus.textContent='사진을 불러오지 못했어요. 창을 닫고 다시 눌러 주세요.';};viewerImage.src=url;}catch(_){if(current(t)&&request===viewerTicket)viewerStatus.textContent='사진을 불러오지 못했어요. 창을 닫고 다시 눌러 주세요.';}
 }
 async function loadTile(tile){if(tile.loading||tile.done||!current(tile.ticket)||!tile.node.isConnected)return;tile.loading=true;observer?.unobserve(tile.node);
  try{const url=await signed(tile.item.path,tile.ticket);if(!current(tile.ticket)||!tile.node.isConnected)return;const img=el('img');img.alt='대화 첨부 사진';img.decoding='async';img.loading='lazy';img.onerror=()=>{urlCache.delete(tile.item.path);if(current(tile.ticket)&&tile.node.isConnected){tile.node.replaceChildren(el('span','','사진 다시 보기'));tile.done=false;}};img.src=url;tile.node.replaceChildren(img);tile.done=true;}catch(_){if(current(tile.ticket)&&tile.node.isConnected)tile.node.textContent='사진 다시 보기';}finally{tile.loading=false;}
 }
 function render(message,body){
  const images=message.images;if(!current(epoch)||!Array.isArray(images)||!images.length)return;
  body.replaceChildren();body.classList.add('has-inquiry-images');if(message.body&&message.body!==FALLBACK)body.append(el('div','inquiry-photo-caption',message.body));
  const gallery=el('div','inquiry-message-gallery');
  for(const [index,item]of images.entries()){
   const button=el('button','inquiry-photo-tile','사진 불러오기');button.type='button';button.style.aspectRatio=item.width+'/'+item.height;button.setAttribute('aria-label','첨부 사진 '+(index+1)+' 크게 보기');
   const tile={node:button,item,ticket:epoch,loading:false,done:false};tiles.add(tile);
   button.addEventListener('click',()=>{if(!current(tile.ticket))return;if(!tile.done)void loadTile(tile);void openViewer(item,button,tile.ticket);});gallery.append(button);
   if(observer)observer.observe(button);else queueMicrotask(()=>void loadTile(tile));
  }
  body.append(gallery);queueMicrotask(()=>{for(const tile of tiles)if(!tile.node.isConnected){observer?.unobserve(tile.node);tiles.delete(tile);}});
 }
 async function cleanup(){
  clearTimeout(cleanupTimer);cleanupTimer=0;if(role!=='admin'||cleanupBusy||!current(epoch)||document.visibilityState==='hidden')return;
  const t=epoch;cleanupBusy=true;
  try{const data=await rpc('inquiry_media_cleanup_list_v404',{p_expected_admin_id:userId},t);
   if(!Array.isArray(data.entries)||data.entries.length>25||!data.entries.every(i=>UUID.test(i.id)&&validPath(i.path))||new Set(data.entries.map(i=>i.id)).size!==data.entries.length)throw new Error('INQUIRY_IMAGE_BAD_RESPONSE');
   if(data.entries.length){const {error}=await timed(client.storage.from('inquiry-images').remove(data.entries.map(i=>i.path)));if(!current(t))return;if(error)throw error;await rpc('inquiry_media_cleanup_finish_v404',{p_expected_admin_id:userId,p_image_ids:data.entries.map(i=>i.id)},t);}
  }catch(_){/* A later admin session retries orphan cleanup. Never interrupt chat. */}
  finally{if(t===epoch){cleanupBusy=false;if(current(t)&&role==='admin')cleanupTimer=setTimeout(()=>void cleanup(),3600000);}}
 }
 function reset(){
  if(userId){try{sessionStorage.removeItem(journalKey());}catch(_){}}
  epoch++;clearTimeout(cleanupTimer);cleanupTimer=0;cleanupBusy=false;observer?.disconnect();observer=null;closeViewer(false);dialog?.remove();dialog=null;viewerImage=null;viewerStatus=null;
  for(const s of states.values()){for(const i of s.items)if(i.preview)URL.revokeObjectURL(i.preview);s.items=[];s.attempt=null;if(s.managed&&s.input){s.input.readOnly=!!s.originalReadOnly;s.button.disabled=blocked(s);if(s.normalLabel)s.button.textContent=s.normalLabel;}const heading=s.tools?.parentElement;s.tools?.remove();if(heading?.classList.contains('inquiry-compose-heading')){const label=heading.querySelector('label');if(label)heading.replaceWith(label);}s.preview?.remove();}
  for(const tile of tiles){tile.node.replaceChildren();tile.node.removeAttribute('style');}tiles.clear();states.clear();urlCache.clear();client=null;userId='';role='';origin='';isCurrent=()=>false;
 }
 function start(config){
  if(client===config.client&&userId===config.userId&&role===config.role&&current(epoch)){isCurrent=config.isCurrent;return;}
  reset();if(!config.client||!UUID.test(config.userId)||!['member','admin'].includes(config.role))return;
  client=config.client;userId=config.userId;role=config.role;origin=new URL(config.baseUrl).origin;isCurrent=config.isCurrent;
  if(typeof IntersectionObserver==='function')observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)for(const tile of tiles)if(tile.node===entry.target){void loadTile(tile);break;}},{rootMargin:'100px'});
  loadJournal();if(role==='admin')cleanupTimer=setTimeout(()=>void cleanup(),2000);
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&role==='admin'&&current(epoch)&&!cleanupTimer)cleanupTimer=setTimeout(()=>void cleanup(),2000);});
 window.InquiryImages=Object.freeze({start,reset,scan,send,read,render,sync:input=>{const s=inputs.get(input);if(s?.ticket===epoch&&current(epoch))sync(s);},errorCode:input=>inputs.get(input)?.lastCode||'',hasDraft:input=>{const s=inputs.get(input);return !!s&&s.ticket===epoch&&states.get(s.key)===s&&current(epoch)&&(s.items.length>0||!!s.attempt||s.processing);}});
})();
