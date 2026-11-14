// Self-only refresh. JWT verification is performed against the live Auth service.
const ORIGIN = "https://health-pila.github.io";
const CENTER_ID = "01M67C55ZHBYVAZDVA8E1V56MK";
const PROJECT_URL = "https://cithfqbzszgiqjifhrqy.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const identifier = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= 500 && v === v.trim();
const validDate = (v: unknown): v is string => typeof v === "string" && /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
class SafeError extends Error {
  code: string; status: number; retry: number;
  constructor(code: string, status = 503, retry = 0) { super(code); this.code = code; this.status = status; this.retry = retry; }
}
const headers = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Expose-Headers": "Retry-After", "Cache-Control": "no-store", "Vary": "Origin" };
const reply = (data: Obj, status = 200, retry = 0) => Response.json(data, { status, headers: { ...headers, ...(retry ? { "Retry-After": String(retry) } : {}) } });
async function readObject(message: Request | Response, limit: number): Promise<Obj> {
  if (Number(message.headers.get("content-length") || 0) > limit) throw new SafeError("INVALID_RESPONSE", 502);
  const reader = message.body?.getReader(); if (!reader) throw new SafeError("INVALID_RESPONSE", 502);
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength; if (size > limit) { await reader.cancel(); throw new SafeError("INVALID_RESPONSE", 502); } chunks.push(part.value);
  } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data: unknown; try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new SafeError("INVALID_RESPONSE", 502); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new SafeError("INVALID_RESPONSE", 502);
  return data as Obj;
}
function settings() {
  const env = (name: string) => Deno.env.get(name) || ""; let keys: Obj = {};
  try { keys = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}"); } catch { /* Use the existing service key when available. */ }
  const base = env("SUPABASE_URL").replace(/\/+$/, ""), group = env("BROJ_GROUP_ID").trim();
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") || String(keys.default || "");
  const brojKey = env("BROJ_API_KEY").trim();
  if (base !== PROJECT_URL || group !== CENTER_ID || !key || !brojKey || /\s/.test(brojKey)) throw new SafeError("NOT_CONFIGURED");
  const service: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.split(".").length === 3) service.Authorization = "Bearer " + key;
  return { base, group, brojKey, key, service };
}
export async function handler(req: Request): Promise<Response> {
  let lease = "", user = "", config: ReturnType<typeof settings> | null = null, committed = false;
  const deadline = Date.now() + 55000;
  async function request(url: string, init: RequestInit, timeout = 8000, until = deadline) {
    const remaining = until - Date.now(); if (remaining < 100) throw new SafeError("TIMEOUT", 504);
    try { return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(Math.min(timeout, remaining)) }); }
    catch { throw new SafeError("NETWORK_RETRY", 503); }
  }
  async function rpc(name: string, args: Obj, until = deadline): Promise<Obj> {
    const response = await request(config!.base + "/rest/v1/rpc/" + name,
      { method: "POST", headers: config!.service, body: JSON.stringify(args) }, 10000, until);
    const data = await readObject(response, 524288);
    if (!response.ok) {
      if (["MEMBER_UNAVAILABLE", "MEMBER_REQUIRED"].includes(String(data.message))) throw new SafeError("MEMBER_UNAVAILABLE", 403);
      if (data.message === "REFRESH_CHANGED") throw new SafeError("BUSY", 409, 5);
      throw new SafeError("DATABASE_NOT_READY");
    }
    return data;
  }
  try {
    const origin = req.headers.get("origin"); if (origin && origin !== ORIGIN) throw new SafeError("ORIGIN_NOT_ALLOWED", 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
      settings(); return reply({ ok: true, revision: 345, broj_requests: 0 });
    }
    if (req.method !== "POST") throw new SafeError("METHOD_NOT_ALLOWED", 405);
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw new SafeError("BAD_REQUEST", 400);
    let body: Obj; try { body = await readObject(req, 4096); } catch { throw new SafeError("BAD_REQUEST", 400); }
    if (Object.keys(body).length !== 1 || typeof body.expected_user_id !== "string" || !UUID.test(body.expected_user_id)) throw new SafeError("BAD_REQUEST", 400);
    const auth = req.headers.get("authorization") || "";
    if (!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(auth)) throw new SafeError("AUTH_REQUIRED", 401);
    config = settings();
    const authResponse = await request(config.base + "/auth/v1/user", { headers: { apikey: config.key, Authorization: auth } });
    if (!authResponse.ok) throw new SafeError("AUTH_REQUIRED", 401);
    const identity = await readObject(authResponse, 65536);
    if (typeof identity.id !== "string" || !UUID.test(identity.id) || identity.id !== body.expected_user_id) throw new SafeError("ACCOUNT_CHANGED", 403);
    user = identity.id;
    const begun = await rpc("member_membership_refresh_begin_v345", { p_user_id: user });
    if (begun.started !== true) {
      const code = String(begun.code), retry = Number(begun.retry_after_seconds);
      if (code === "COOLDOWN" || code === "BUSY") throw new SafeError(code, code === "COOLDOWN" ? 429 : 409,
        Number.isInteger(retry) && retry > 0 && retry <= 120 ? retry : 5);
      throw new SafeError(code === "NOT_LINKED" ? "NOT_LINKED" : "SYNC_DISABLED", 409);
    }
    if (begun.user_id !== user || begun.group_id !== config.group || !identifier(begun.member_id) ||
      typeof begun.lease_id !== "string" || !UUID.test(begun.lease_id)) throw new SafeError("INVALID_RESPONSE");
    lease = begun.lease_id;
    const budget = await rpc("broj_reserve_api_call", { p_purpose: "members" });
    if (budget.allowed !== true || typeof budget.reservation_id !== "string" || !UUID.test(budget.reservation_id)) throw new SafeError("API_BUDGET", 429, 60);
    const response = await request(`https://api.broj.co.kr/v1/groups/${encodeURIComponent(config.group)}/members/tickets`, {
      method: "POST", headers: { "API-KEY": config.brojKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: [begun.member_id], include_expired: false }),
    }, 20000);
    if (!response.ok) { await response.body?.cancel(); throw new SafeError("BROJ_RETRY", 502); }
    const result = normalizeMemberResponse(await readObject(response, 2097152), config.group, begun.member_id);
    const saved = await rpc("member_membership_refresh_commit_v345", { p_user_id: user, p_lease_id: lease, p_results: [result] });
    if (saved.ok !== true || saved.user_id !== user || typeof saved.synced_at !== "string" || !Number.isFinite(Date.parse(saved.synced_at))) throw new SafeError("SAVE_UNCONFIRMED");
    committed = true;
    return reply({ ok: true, version: 1, user_id: user, synced_at: saved.synced_at });
  } catch (error) {
    if (lease && user && config && !committed) { try { await rpc("member_membership_refresh_cancel_v345", { p_user_id: user, p_lease_id: lease }, Date.now() + 3500); } catch { /* A lease expires without overwriting known snapshots. */ } }
    const safe = error instanceof SafeError ? error : new SafeError("RETRY_LATER");
    return reply({ ok: false, code: safe.code, ...(safe.retry ? { retry_after_seconds: safe.retry } : {}) }, safe.status, safe.retry);
  }
}

export function normalizeMemberResponse(response: Obj, group: string, member: string): Obj {
  if (!Array.isArray(response.data) || response.data.length !== 1) throw new SafeError("INVALID_RESPONSE", 502);
  const row = object(response.data[0]), summary = object(row.membership_summary);
  if (row.group_id !== group || row.member_id !== member || !Array.isArray(summary.tickets) || summary.tickets.length > 200) throw new SafeError("INVALID_RESPONSE", 502);
  let periodCheckNeeded = 0, inactiveTicketsIgnored = 0;
      const tickets: Obj[] = [], ticketIds = new Set<string>();
      function add(source: unknown) {
        const t = object(source);
        if (!identifier(t.membership_id) || typeof t.name !== "string" || !t.name.trim() || t.name.length > 200 ||
          !["ACTIVE", "INACTIVE", "SOON_ACTIVE", "SOON_INACTIVE", "HOLDING", "UNKNOWN"].includes(String(t.ticket_status))) {
          throw new SafeError("MEMBERSHIP_TICKET_INVALID");
        }
        const id = String(t.membership_id);
        if (ticketIds.has(id)) throw new SafeError("MEMBERSHIP_DUPLICATE_TICKET");
        ticketIds.add(id);
        // Some groups still contain inactive legacy tickets despite include_expired:false.
        // They are outside the current/future entitlement display and are not persisted.
        if (t.ticket_status === "INACTIVE") { inactiveTicketsIgnored++; return; }
        const dates: Obj = { holding_start_at: null, holding_end_at: null };
        for (const field of ["start_at", "end_at"]) {
          const d = t[field] ?? null;
          if (d !== null && !validDate(d)) throw new SafeError("MEMBERSHIP_DATE_INVALID");
          dates[field] = d;
        }
        let status = t.ticket_status;
        // Never swap or guess contradictory dates. Keep this ticket visibly unconfirmed
        // while allowing the other validated tickets in the batch to be saved.
        if (dates.start_at && dates.end_at && String(dates.start_at) > String(dates.end_at)) {
          dates.start_at = null; dates.end_at = null; status = "UNKNOWN";
          periodCheckNeeded++;
        }
        tickets.push({ kind: "membership", name: t.name, ...dates, status, remaining_count: null });
        if (tickets.length > 200) throw new SafeError("MEMBERSHIP_TICKET_LIMIT");
      }
      // Keep the member-facing expiry snapshot membership-only.
      for (const t of summary.tickets) add(t);
  const eligibility = normalizeEligibility(row);
  return { crm_member_id: member, tickets, eligibility_tickets: eligibility.tickets, eligibility_complete: eligibility.complete };
}

function normalizeEligibility(row: Obj): { tickets: Obj[]; complete: boolean } {
  const tickets: Obj[] = [];
  let complete = true;
  const seen = new Set<string>();
  const statuses = ["ACTIVE", "INACTIVE", "SOON_ACTIVE", "SOON_INACTIVE", "HOLDING", "UNKNOWN"];
  const hints = (value: unknown) => ({
    pilates: typeof value === "string" && /필라|pilates/i.test(value),
    pt: typeof value === "string" && /(^|[^A-Za-z])p\.?\s*t\.?(?=$|[^A-Za-z])|피티|퍼스널|personal\s*training/i.test(value),
  });
  function add(value: unknown, gym: boolean) {
    if (tickets.length >= 200) { complete = false; return; }
    const t = object(value);
    let uncertain = !value || typeof value !== "object" || Array.isArray(value);
    let scope = gym ? "gym" : "unknown";
    if (!gym) {
      const name = hints(t.name);
      let pilates = name.pilates, pt = name.pt;
      if (Array.isArray(t.categories)) {
        if (t.categories.length > 50) uncertain = true;
        for (const value of t.categories.slice(0, 50)) {
          const category = object(value), hint = hints(category.name);
          pilates ||= hint.pilates; pt ||= hint.pt;
          if (!value || typeof value !== "object" || Array.isArray(value)) uncertain = true;
        }
      } else if (t.categories !== undefined && t.categories !== null) uncertain = true;
      scope = pilates && !pt ? "pilates" : pt && !pilates ? "pt" : "unknown";
    }
    const sourceId = gym ? t.membership_id : t.lesson_ticket_id;
    if (!identifier(sourceId)) { complete = false; uncertain = true; }
    else {
      const key = (gym ? "g:" : "l:") + sourceId;
      if (seen.has(key)) { complete = false; uncertain = true; }
      seen.add(key);
    }
    const status = statuses.includes(String(t.ticket_status)) ? String(t.ticket_status) : "UNKNOWN";
    if (status === "UNKNOWN") uncertain = true;
    const fact: Obj = { scope, status, kind: gym ? "MEMBERSHIP" : ["CLASS", "ENTRY"].includes(String(t.kind)) ? String(t.kind) : "UNKNOWN" };
    for (const key of ["start_at", "end_at", "holding_start_at", "holding_end_at"]) {
      fact[key] = validDate(t[key]) ? t[key] : null;
      if (t[key] !== undefined && t[key] !== null && fact[key] === null) uncertain = true;
    }
    if (!fact.start_at || !fact.end_at || String(fact.start_at) > String(fact.end_at)) uncertain = true;
    fact.holding = typeof t.has_holding_period === "boolean" ? t.has_holding_period : null;
    if (fact.holding === null) uncertain = true;
    if (fact.holding === true && (!fact.holding_start_at || !fact.holding_end_at ||
      String(fact.holding_start_at) > String(fact.holding_end_at))) uncertain = true;
    fact.attendance_type = ["ALLOWED", "DENIED", "BLOCKED", "NOT_ALLOWED"].includes(String(t.attendance_type))
      ? String(t.attendance_type) : "UNKNOWN";
    for (const [source, target] of [["usage_count", "remaining_count"], ["origin_usage_count", "original_count"],
      ["point", "points"], ["origin_point", "original_points"]]) {
      const count = t[source];
      fact[target] = typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 999999999 ? count : null;
      if (!gym && count !== undefined && count !== null && fact[target] === null) uncertain = true;
    }
    if (!gym && fact.remaining_count !== null && fact.original_count !== null &&
      Number(fact.remaining_count) > Number(fact.original_count)) uncertain = true;
    fact.uncertain = uncertain;
    tickets.push(fact);
  }
  const summary = object(row.membership_summary);
  if (Array.isArray(summary.tickets) && summary.tickets.length <= 200) {
    for (const t of summary.tickets) add(t, true);
  } else complete = false;
  if (!Array.isArray(row.lesson_ticket_groups) || row.lesson_ticket_groups.length > 200) complete = false;
  else for (const value of row.lesson_ticket_groups) {
    const group = object(value);
    if (!Array.isArray(group.tickets) || group.tickets.length > 200) { complete = false; continue; }
    for (const t of group.tickets) add(t, false);
  }
  return { tickets, complete };
}

Deno.serve(handler);
