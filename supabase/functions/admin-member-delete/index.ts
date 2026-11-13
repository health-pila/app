// Supabase Edge Function: admin-member-delete. Verify JWT OFF.
// Each request verifies the live Auth user, and each RPC rechecks the admin role.
// No service credential, storage path, or provider secret is returned to the app.
const ORIGIN='https://health-pila.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class SafeError extends Error {
 code:string; status:number;
 constructor(code:string,status=400){super(code);this.code=code;this.status=status;}
}
const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
function settings(){
 const env=(n:string)=>Deno.env.get(n)||'';
 let keys:Record<string,string>={};try{keys=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}');}catch(_){}
 const base=env('SUPABASE_URL').replace(/\/$/,''),key=env('SUPABASE_SERVICE_ROLE_KEY')||env('SUPABASE_SECRET_KEY')||keys.default||'';
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(base)||!key)throw new SafeError('NOT_CONFIGURED',503);
 const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
 if(key.split('.').length===3)headers.Authorization='Bearer '+key;
 return {base,key,headers};
}
async function request(url:string,headers:Record<string,string>,options:RequestInit={}){
 return fetch(url,{...options,headers,redirect:'error',signal:AbortSignal.timeout(15000)});
}
async function readInput(req:Request){
 if(!req.headers.get('content-type')?.startsWith('application/json')||Number(req.headers.get('content-length')||0)>4096)throw new SafeError('BAD_REQUEST');
 const reader=req.body?.getReader();if(!reader)throw new SafeError('BAD_REQUEST');
 const chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();throw new SafeError('BAD_REQUEST');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data as Record<string,unknown>;}catch(_){throw new SafeError('BAD_REQUEST');}
}
async function caller(s:ReturnType<typeof settings>,req:Request){
 const token=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(token))throw new SafeError('AUTH_REQUIRED',401);
 const response=await request(s.base+'/auth/v1/user',{apikey:s.key,Authorization:token});
 const user=await response.json().catch(()=>null);
 if(!response.ok||!UUID.test(user?.id||''))throw new SafeError('AUTH_REQUIRED',401);
 return user.id as string;
}
const KNOWN_DB_ERRORS=new Set(['ADMIN_REQUIRED','MEMBER_ONLY','MEMBER_NOT_FOUND','MEMBER_CHANGED','OPEN_PAYMENT_REQUEST','MEDIA_REVIEW_REQUIRED','DELETION_NOT_STARTED','OPERATION_MISMATCH','FILES_REMAIN','APP_DATA_REMAIN','DELETION_INCOMPLETE']);
async function rpc(s:ReturnType<typeof settings>,name:string,args:Record<string,unknown>){
 const response=await request(s.base+'/rest/v1/rpc/'+name,s.headers,{method:'POST',body:JSON.stringify(args)});
 const result=await response.json().catch(()=>null);
 if(!response.ok){const code=KNOWN_DB_ERRORS.has(result?.message)?result.message:'DATABASE_RETRY';throw new SafeError(code,code==='ADMIN_REQUIRED'||code==='MEMBER_ONLY'?403:code==='MEMBER_NOT_FOUND'?404:409);}
 if(result?.ok!==true)throw new SafeError('BAD_RESPONSE',503);
 return result;
}
async function run(s:ReturnType<typeof settings>,admin:string,member:string,data:Record<string,unknown>){
 const args={p_admin_user_id:admin,p_member_user_id:member};
 let operation=data.operation_id as string|undefined;
 if(!operation){
  if(typeof data.fingerprint!=='string'||!/^[0-9a-f]{32}$/.test(data.fingerprint)||data.confirm_delete!==true||data.records_checked!==true)throw new SafeError('CONFIRMATION_REQUIRED');
  const begun=await rpc(s,'admin_member_deletion_begin_v310',{...args,p_fingerprint:data.fingerprint});
  if(!UUID.test(begun.operation_id||''))throw new SafeError('BAD_RESPONSE',503);
  operation=begun.operation_id;
 }else if(!UUID.test(operation)||data.confirm_delete!==true||data.records_checked!==true)throw new SafeError('CONFIRMATION_REQUIRED');
 const step=(action:string)=>rpc(s,'admin_member_deletion_step_v310',{...args,p_operation_id:operation,p_action:action});
 let manifest;
 try{manifest=await step('manifest');}catch(error){
  // A completed request may have lost its response after the transient job was
  // removed. Finish independently verifies Auth, files and app rows are absent.
  if(error instanceof SafeError&&error.code==='DELETION_NOT_STARTED')return await step('finish');
  throw error;
 }
 if(!Array.isArray(manifest.objects)||manifest.objects.length>100||!Number.isSafeInteger(manifest.remaining_files)||manifest.remaining_files<0)throw new SafeError('BAD_RESPONSE',503);
 if(manifest.objects.length){
  for(const bucket of ['routine-images','workout-photos']){
   const names=manifest.objects.filter((o:{bucket:string})=>o.bucket===bucket).map((o:{name:string})=>o.name);
   if(names.some((n:unknown)=>typeof n!=='string'||!n||n.length>2048)||manifest.objects.some((o:{bucket:string})=>!['routine-images','workout-photos'].includes(o.bucket)))throw new SafeError('BAD_RESPONSE',503);
   if(!names.length)continue;
   const response=await request(s.base+'/storage/v1/object/'+bucket,s.headers,{method:'DELETE',body:JSON.stringify({prefixes:names})});
   if(!response.ok)throw new SafeError('FILES_RETRY',503);
  }
  const after=await step('manifest');
  // One bounded batch per request keeps large photo libraries resumable.
  return {ok:true,deleted:false,operation_id:operation,phase:'files',remaining_files:after.remaining_files};
 }
 await step('purge');
 const response=await request(s.base+'/auth/v1/admin/users/'+member,s.headers,{method:'DELETE',body:JSON.stringify({should_soft_delete:false})});
 if(!response.ok&&response.status!==404)throw new SafeError('AUTH_DELETE_RETRY',503);
 // Even a 404 is never trusted as proof of deletion; SQL verifies auth.users.
 return await step('finish');
}
export async function handler(req:Request){
 const origin=req.headers.get('origin');
 const cors:Record<string,string>=origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN,Vary:'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST, OPTIONS'}:{};
 try{
  if(origin&&origin!==ORIGIN)throw new SafeError('ORIGIN',403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/health')){
   settings();return json({ready:true,revision:'310',database_checked:false},200,cors);
  }
  if(req.method!=='POST')throw new SafeError('METHOD',405);
  const s=settings(),admin=await caller(s,req),data=await readInput(req);
  const allowed=['action','expected_user_id','member_id','fingerprint','operation_id','confirm_delete','records_checked'];
  if(Object.keys(data).some(k=>!allowed.includes(k)))throw new SafeError('BAD_REQUEST');
  if(data.expected_user_id!==admin)throw new SafeError('AUTH_REQUIRED',401);
  if(data.action==='pending')return json(await rpc(s,'admin_member_deletion_pending_v310',{p_admin_user_id:admin}),200,cors);
  if(!UUID.test(String(data.member_id||''))||data.member_id===admin)throw new SafeError('MEMBER_ONLY',403);
  const member=data.member_id as string;
  if(data.action==='preview')return json(await rpc(s,'admin_member_deletion_preview_v310',{p_admin_user_id:admin,p_member_user_id:member}),200,cors);
  if(data.action!=='run')throw new SafeError('BAD_REQUEST');
  return json(await run(s,admin,member,data),200,cors);
 }catch(error){
  const safe=error instanceof SafeError?error:new SafeError('TEMPORARY_RETRY',503);
  return json({ok:false,code:safe.code},safe.status,cors);
 }
}
Deno.serve(handler);
