// v398. Deploy as "admin-web-push", with platform Verify JWT disabled.
// Authentication is enforced below: live user JWT + administrator RPC for setup,
// and a separate random Vault token for the database dispatcher. No anonymous send API.
import webpush from "npm:web-push@3.6.7";

const PROJECT_URL = "https://cithfqbzszgiqjifhrqy.supabase.co";
const APP_ORIGIN = "https://health-pila.github.io";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_KEY = /^B[A-Za-z0-9_-]{86}$/;
const PRIVATE_KEY = /^[A-Za-z0-9_-]{43}$/;
const ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[^\s#]+$/;
const KINDS = new Set(["signup", "inquiry", "routine", "oneDayPt", "payment", "test"]);
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => typeof v === "string" ? v : "";

class SafeError extends Error {
  code: string; status: number;
  constructor(code: string, status = 503) { super(code); this.code = code; this.status = status; }
}
const cors = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store", "Vary": "Origin",
};
const reply = (data: Obj, status = 200) => Response.json(data, { status, headers: cors });

function settings() {
  const env = (name: string) => Deno.env.get(name) || "";
  const dictionary = (name: string) => {
    try { const v = JSON.parse(env(name) || "{}"); return object(v) ? v : {}; } catch { return {}; }
  };
  const base = env("SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") || text(dictionary("SUPABASE_SECRET_KEYS").default);
  const anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || text(dictionary("SUPABASE_PUBLISHABLE_KEYS").default);
  if (base !== PROJECT_URL || !key || !anon) throw new SafeError("PUSH_ENV_NOT_READY");
  const service: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.split(".").length === 3) service.Authorization = "Bearer " + key;
  return { base, anon, service };
}

async function readJson(message: Request | Response, limit: number): Promise<unknown> {
  if (Number(message.headers.get("content-length") || 0) > limit) throw new SafeError("PUSH_BAD_JSON", 400);
  const reader = message.body?.getReader();
  if (!reader) throw new SafeError("PUSH_BAD_JSON", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > limit) { await reader.cancel(); throw new SafeError("PUSH_BAD_JSON", 400); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new SafeError("PUSH_BAD_JSON", 400); }
}

// Fixed length, no early exit based on the first differing token character.
function tokenMatches(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  let mismatch = 0;
  for (let i = 0; i < 64; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function allowedEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || !ENDPOINT.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash;
  } catch { return false; }
}

function validDelivery(row: unknown): row is Obj {
  if (!object(row)) return false;
  return UUID.test(text(row.id)) && UUID.test(text(row.lease_token)) && UUID.test(text(row.event_id)) &&
    UUID.test(text(row.binding)) && KINDS.has(text(row.kind)) && allowedEndpoint(row.endpoint) &&
    PUBLIC_KEY.test(text(row.p256dh)) && /^[A-Za-z0-9_-]{22}$/.test(text(row.auth)) &&
    typeof row.sound === "boolean" && Number.isFinite(Date.parse(text(row.created_at))) &&
    Number.isFinite(Date.parse(text(row.expires_at)));
}

export async function handler(req: Request): Promise<Response> {
  const deadline = Date.now() + 50000;
  let config: ReturnType<typeof settings>;
  async function request(url: string, init: RequestInit, timeout = 8000): Promise<Response> {
    const remaining = deadline - Date.now();
    if (remaining < 200) throw new SafeError("PUSH_DEADLINE");
    try { return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(Math.min(timeout, remaining)) }); }
    catch { throw new SafeError("PUSH_NETWORK_RETRY"); }
  }
  async function rpc(name: string, args: Obj = {}, headers = config.service): Promise<unknown> {
    const response = await request(config.base + "/rest/v1/rpc/center_admin_push_" + name + "_v398", {
      method: "POST", headers, body: JSON.stringify(args),
    });
    // PostgREST returns 204 No Content for the two SQL functions returning void.
    if (response.status === 204 && (name === "server_init" || name === "server_finish")) return null;
    const result = await readJson(response, 262144);
    if (!response.ok) {
      if (object(result) && result.message === "PUSH_ADMIN_REQUIRED") throw new SafeError("PUSH_ADMIN_REQUIRED", 403);
      throw new SafeError("PUSH_DATABASE_NOT_READY");
    }
    return result;
  }
  async function serverConfig(): Promise<Obj> {
    const result = await rpc("server_config");
    if (!object(result) || !/^[a-f0-9]{64}$/.test(text(result.dispatch_token))) throw new SafeError("PUSH_DATABASE_NOT_READY");
    return result;
  }
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== APP_ORIGIN) throw new SafeError("PUSH_ORIGIN_NOT_ALLOWED", 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
      settings();
      // Health has no database side effect and discloses no keys or subscriber information.
      return reply({ ok: true, revision: 398, build: "398.1" });
    }
    if (req.method !== "POST") throw new SafeError("PUSH_METHOD_NOT_ALLOWED", 405);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) throw new SafeError("PUSH_BAD_REQUEST", 400);
    const body = await readJson(req, 4096);
    if (!object(body)) throw new SafeError("PUSH_BAD_REQUEST", 400);

    if (body.action === "config") {
      if (Object.keys(body).length !== 2 || !UUID.test(text(body.expected_admin_id))) throw new SafeError("PUSH_BAD_REQUEST", 400);
      const auth = req.headers.get("authorization") || "";
      if (!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(auth)) throw new SafeError("PUSH_AUTH_REQUIRED", 401);
      config = settings();
      const userHeaders = { apikey: config.anon, Authorization: auth, "Content-Type": "application/json" };
      const authResponse = await request(config.base + "/auth/v1/user", { headers: userHeaders });
      if (!authResponse.ok) { await authResponse.body?.cancel(); throw new SafeError("PUSH_AUTH_REQUIRED", 401); }
      const identity = await readJson(authResponse, 65536);
      if (!object(identity) || identity.id !== body.expected_admin_id) throw new SafeError("PUSH_ACCOUNT_CHANGED", 403);
      // The user-scoped RPC verifies the current admin role AND account-deletion state.
      const state = await rpc("state", { p_expected_admin_id: identity.id, p_endpoint: "" }, userHeaders);
      if (!object(state) || state.ok !== true) throw new SafeError("PUSH_ADMIN_REQUIRED", 403);
      let keys = await serverConfig();
      if (!keys.public_key) {
        const generated = webpush.generateVAPIDKeys();
        await rpc("server_init", { p_public_key: generated.publicKey, p_private_key: generated.privateKey });
        // Re-read: concurrent administrator requests share the first committed key pair.
        keys = await serverConfig();
      }
      if (!PUBLIC_KEY.test(text(keys.public_key)) || !PRIVATE_KEY.test(text(keys.private_key))) throw new SafeError("PUSH_KEYS_NOT_READY");
      return reply({ ok: true, revision: 398, public_key: keys.public_key });
    }

    if (body.action !== "dispatch" || Object.keys(body).length !== 1) throw new SafeError("PUSH_BAD_REQUEST", 400);
    const suppliedToken = req.headers.get("x-center-dispatch") || "";
    if (!/^[a-f0-9]{64}$/.test(suppliedToken)) throw new SafeError("PUSH_DISPATCH_AUTH_REQUIRED", 401);
    config = settings();
    const keys = await serverConfig();
    if (!tokenMatches(suppliedToken, text(keys.dispatch_token))) throw new SafeError("PUSH_DISPATCH_AUTH_REQUIRED", 401);
    if (!PUBLIC_KEY.test(text(keys.public_key)) || !PRIVATE_KEY.test(text(keys.private_key))) throw new SafeError("PUSH_KEYS_NOT_READY");
    const rows = await rpc("server_claim");
    if (!Array.isArray(rows) || rows.length > 25) throw new SafeError("PUSH_INVALID_BATCH");
    let cursor = 0, accepted = 0, deferred = 0;
    async function send(row: unknown) {
      if (!object(row) || !UUID.test(text(row.id)) || !UUID.test(text(row.lease_token))) { deferred++; return; }
      let status = 400;
      if (validDelivery(row)) {
        const ttl = Math.min(300, Math.floor((Date.parse(text(row.expires_at)) - Date.now()) / 1000));
        if (ttl > 0) {
          try {
            const payload = JSON.stringify({
              v: 398, eventId: row.event_id, kind: row.kind, binding: row.binding,
              createdAt: row.created_at, expiresAt: row.expires_at, sound: row.sound,
            });
            const details = webpush.generateRequestDetails({ endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
              vapidDetails: { subject: "https://health-pila.github.io/app/", publicKey: keys.public_key, privateKey: keys.private_key },
              TTL: ttl, urgency: "high", contentEncoding: "aes128gcm",
            });
            // HTTP fetch has an explicit deadline and refuses redirects to arbitrary hosts.
            const response = await request(details.endpoint, { method: "POST", headers: details.headers, body: details.body }, 5000);
            status = response.status;
            await response.body?.cancel().catch(() => {});
          } catch (error) { status = error instanceof SafeError ? 0 : 400; }
        }
      }
      try {
        await rpc("server_finish", { p_delivery_id: row.id, p_lease_token: row.lease_token, p_status: status });
        if (status >= 200 && status <= 299) accepted++; else deferred++;
      } catch { deferred++; /* An unacknowledged lease expires; retry uses the same event ID. */ }
    }
    await Promise.all(Array.from({ length: Math.min(5, rows.length) }, async () => {
      while (cursor < rows.length && Date.now() < deadline - 1000) await send(rows[cursor++]);
    }));
    return reply({ ok: true, revision: 398, claimed: rows.length, accepted, deferred: deferred + rows.length - cursor });
  } catch (error) {
    const safe = error instanceof SafeError ? error : new SafeError("PUSH_TEMPORARILY_UNAVAILABLE");
    // Never echo provider bodies, URLs, tokens, subscriptions, VAPID secrets or raw errors.
    return reply({ ok: false, code: safe.code }, safe.status);
  }
}

Deno.serve(handler);
