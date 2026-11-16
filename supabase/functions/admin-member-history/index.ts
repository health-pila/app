// v399. Administrator-only, selected-member gym date lookup including expired tickets.
// Deploy as admin-member-history with platform Verify JWT OFF; live Auth is checked here.
const PROJECT_URL = "https://cithfqbzszgiqjifhrqy.supabase.co";
const GROUP = "01M67C55ZHBYVAZDVA8E1V56MK";
const ORIGIN = "https://health-pila.github.io";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const identifier = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 500 && v === v.trim();
const date = (v: unknown): v is string => typeof v === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(v) &&
 Number.isFinite(Date.parse(v+"T00:00:00Z")) && new Date(v+"T00:00:00Z").toISOString().slice(0,10) === v;
class SafeError extends Error {
 code: string; status: number; retry: number;
 constructor(code: string,status=503,retry=0){super(code);this.code=code;this.status=status;this.retry=retry;}
}
const headers = {"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
 "Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Expose-Headers":"Retry-After","Cache-Control":"no-store","Vary":"Origin"};
const reply=(data:Obj,status=200,retry=0)=>Response.json(data,{status,headers:{...headers,...(retry?{"Retry-After":String(retry)}:{})}});
async function readJson(message:Request|Response,limit:number):Promise<unknown>{
 if(Number(message.headers.get("content-length")||0)>limit)throw new SafeError("INVALID_RESPONSE",502);
 const reader=message.body?.getReader();if(!reader)throw new SafeError("INVALID_RESPONSE",502);
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;
  if(size>limit){await reader.cancel();throw new SafeError("INVALID_RESPONSE",502);}chunks.push(part.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new SafeError("INVALID_RESPONSE",502);}
}
function settings(){
 const env=(name:string)=>Deno.env.get(name)||"";let keys:Obj={};try{keys=object(JSON.parse(env("SUPABASE_SECRET_KEYS")||"{}"));}catch{}
 const key=env("SUPABASE_SERVICE_ROLE_KEY")||env("SUPABASE_SECRET_KEY")||String(keys.default||"");
 const base=env("SUPABASE_URL").replace(/\/+$/,"");const broj=env("BROJ_API_KEY").trim();
 if(base!==PROJECT_URL||env("BROJ_GROUP_ID").trim()!==GROUP||!key||!broj||/\s/.test(broj))throw new SafeError("NOT_CONFIGURED");
 const service:Record<string,string>={apikey:key,"Content-Type":"application/json"};if(key.split('.').length===3)service.Authorization="Bearer "+key;
 return {base,key,broj,service};
}

export function normalizeGymHistory(raw:unknown,group:string,member:string,today:string):Obj{
 const data=object(raw).data;
 if(!date(today)||!Array.isArray(data)||data.length!==1)throw new SafeError("INVALID_RESPONSE",502);
 const row=object(data[0]),tickets=object(row.membership_summary).tickets;
 if(row.group_id!==group||row.member_id!==member||!Array.isArray(tickets)||tickets.length>2000)throw new SafeError("INVALID_RESPONSE",502);
 const seen=new Set<string>(),scheduled=new Set<string>();let current:string|null=null,previous:string|null=null,uncertain=false;
 for(const value of tickets){
  const t=object(value);
  if(!identifier(t.membership_id)||seen.has(t.membership_id))throw new SafeError("INVALID_RESPONSE",502);
  seen.add(t.membership_id);
  if(!["ACTIVE","INACTIVE","SOON_ACTIVE","SOON_INACTIVE","HOLDING"].includes(String(t.ticket_status))||
     !date(t.start_at)||!date(t.end_at)||t.start_at>t.end_at){uncertain=true;continue;}
  if(t.end_at<today){if(!previous||t.end_at>previous)previous=t.end_at;continue;}
  if(t.ticket_status==="INACTIVE")continue;
  if(t.ticket_status==="SOON_ACTIVE"||t.start_at>today)scheduled.add(t.end_at);
  else if(!current||t.end_at>current)current=t.end_at;
 }
 if(scheduled.size>200)throw new SafeError("INVALID_RESPONSE",502);
 // An unknown ticket might be more recent: never guess a definitive last expiry date.
 return {current_end_at:current,previous_end_at:uncertain?null:previous,scheduled_end_at:[...scheduled].sort(),uncertain};
}

export async function handler(req:Request):Promise<Response>{
 let config:ReturnType<typeof settings>|null=null,lease="",user="",admin="",saved=false;
 const deadline=Date.now()+50000;
 async function request(url:string,init:RequestInit,timeout=8000){
  const left=deadline-Date.now();if(left<200)throw new SafeError("TIMEOUT",504);
  try{return await fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(Math.min(left,timeout))});}
  catch{throw new SafeError("NETWORK_RETRY");}
 }
 async function rpc(name:string,args:Obj):Promise<unknown>{
  const response=await request(config!.base+"/rest/v1/rpc/"+name,{method:"POST",headers:config!.service,body:JSON.stringify(args)});
  if(response.status===204&&name==="center_admin_history_cancel_v399")return null;
  const data=await readJson(response,65536);
  if(!response.ok){const code=String(object(data).message);
   if(code==='ADMIN_REQUIRED')throw new SafeError('ADMIN_REQUIRED',403);
   if(code==='MEMBER_UNAVAILABLE')throw new SafeError('MEMBER_UNAVAILABLE',404);
   if(code==='HISTORY_CHANGED')throw new SafeError('HISTORY_CHANGED',409);
   throw new SafeError('DATABASE_NOT_READY');}
  return data;
 }
 try{
  const origin=req.headers.get('origin');if(origin&&origin!==ORIGIN)throw new SafeError('ORIGIN_NOT_ALLOWED',403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/health')){settings();return reply({ok:true,revision:399});}
  if(req.method!=='POST')throw new SafeError('METHOD_NOT_ALLOWED',405);
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))throw new SafeError('BAD_REQUEST',400);
  let body:Obj;try{body=object(await readJson(req,4096));}catch{throw new SafeError('BAD_REQUEST',400);}
  if(!UUID.test(String(body.expected_admin_id||''))||!UUID.test(String(body.user_id||''))||
    typeof body.force!=='boolean'||Object.keys(body).length!==3)throw new SafeError('BAD_REQUEST',400);
  const auth=req.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(auth))throw new SafeError('AUTH_REQUIRED',401);
  config=settings();
  const response=await request(config.base+'/auth/v1/user',{headers:{apikey:config.key,Authorization:auth}});
  if(!response.ok){await response.body?.cancel();throw new SafeError('AUTH_REQUIRED',401);}
  const identity=object(await readJson(response,65536));
  if(identity.id!==body.expected_admin_id)throw new SafeError('ACCOUNT_CHANGED',403);
  admin=String(identity.id);user=String(body.user_id);
  const begun=object(await rpc('center_admin_history_begin_v399',{p_admin_id:admin,p_user_id:user,p_force:body.force}));
  if(begun.started!==true){
   if(begun.code==='CACHED'){
    const cached=object(begun.result);if(cached.ok!==true||cached.user_id!==user||cached.version!==399)throw new SafeError('INVALID_RESPONSE',502);
    return reply(cached);
   }
   const code=String(begun.code);const retry=Number(begun.retry_after_seconds);
   if(['BUSY','COOLDOWN'].includes(code))throw new SafeError(code,code==='BUSY'?409:429,Number.isInteger(retry)&&retry>0&&retry<=120?retry:5);
   throw new SafeError(code==='NOT_LINKED'?'NOT_LINKED':'SYNC_DISABLED',409);
  }
  if(begun.user_id!==user||begun.group_id!==GROUP||!identifier(begun.member_id)||!UUID.test(String(begun.lease_id||'')))throw new SafeError('INVALID_RESPONSE',502);
  lease=String(begun.lease_id);
  const budget=object(await rpc('broj_reserve_api_call',{p_purpose:'members'}));
  if(budget.allowed!==true||!UUID.test(String(budget.reservation_id||'')))throw new SafeError('API_BUDGET',429,60);
  const upstream=await request('https://api.broj.co.kr/v1/groups/'+GROUP+'/members/tickets',{
   method:'POST',headers:{'API-KEY':config.broj,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({member_ids:[begun.member_id],include_expired:true}),
  },20000);
  if(!upstream.ok){await upstream.body?.cancel();throw new SafeError('BROJ_RETRY',502);}
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const gym=normalizeGymHistory(await readJson(upstream,4194304),GROUP,String(begun.member_id),today);
  const result=object(await rpc('center_admin_history_commit_v399',{p_admin_id:admin,p_user_id:user,p_lease_id:lease,p_gym:gym}));
  if(result.ok!==true||result.version!==399||result.user_id!==user)throw new SafeError('INVALID_RESPONSE',502);
  saved=true;return reply(result);
 }catch(error){const safe=error instanceof SafeError?error:new SafeError('TEMPORARILY_UNAVAILABLE');return reply({ok:false,code:safe.code},safe.status,safe.retry);}
 finally{if(config&&lease&&!saved)try{await rpc('center_admin_history_cancel_v399',{p_user_id:user,p_lease_id:lease});}catch{}}
}
Deno.serve(handler);
