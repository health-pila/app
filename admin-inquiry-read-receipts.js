// 회원이 화면에서 본 답변의 기존 서버 기록을 조회합니다. 대화와 작성 중인 답변은 교체하지 않습니다.
(() => {
  "use strict";
  const POLL_MS = 15000;
  const TIMEOUT_MS = 8000;
  const uuid = value => typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  let client = null, adminId = "", generation = 0, timer = 0, frame = 0;
  const threads = new Map();
  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(() => checkSoon()) : null;

  function visible(entry) {
    if (!client || !adminId || document.visibilityState !== "visible" ||
        document.getElementById("adminScreen")?.hidden !== false ||
        !entry.list.isConnected || entry.list.closest("[hidden]")) return false;
    const rect = entry.list.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 &&
      rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

  function paint(marker, state) {
    const label = { checking: "확인 중", unread: "미확인", read: "읽음", unavailable: "확인 불가" }[state];
    if (marker.dataset.readState === state) return;
    marker.dataset.readState = state;
    marker.textContent = label;
    marker.title = state === "unread" ? "회원의 읽음 기록이 아직 확인되지 않았어요." :
      state === "read" ? "회원 화면에 이 답변이 표시된 기록을 확인했어요." :
      state === "unavailable" ? "읽음 상태를 확인하지 못했어요. 연결되면 다시 확인합니다." : "읽음 기록을 확인하고 있어요.";
    marker.setAttribute("aria-label", `회원 읽음 상태: ${label}`);
  }

  function forget(entry) {
    observer?.unobserve(entry.list);
    entry.controller?.abort();
    threads.delete(entry.list);
  }

  function complete(entry) {
    return entry.confirmed.size === entry.markers.size;
  }

  function schedule() {
    clearTimeout(timer); timer = 0;
    let next = Infinity;
    for (const entry of threads.values()) {
      if (!entry.list.isConnected) { forget(entry); continue; }
      if (visible(entry) && !entry.inFlight && !complete(entry)) next = Math.min(next, entry.nextCheck);
    }
    if (Number.isFinite(next)) timer = setTimeout(() => { timer = 0; check(); }, Math.max(0, next - Date.now()));
  }

  async function refresh(entry) {
    const ticket = generation, db = client;
    const current = () => ticket === generation && db === client &&
      threads.get(entry.list) === entry && visible(entry);
    const controller = new AbortController();
    entry.controller = controller; entry.inFlight = true;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { data, error } = await db.rpc("admin_inquiry_reply_read_state", {
        p_inquiry_id: entry.inquiryId
      }).abortSignal(controller.signal);
      if (!current()) return;
      if (error || data?.inquiry_id !== entry.inquiryId || !Array.isArray(data.read_reply_ids) ||
          !data.read_reply_ids.every(uuid)) throw Error("READ_RECEIPTS_UNAVAILABLE");
      const readIds = new Set(data.read_reply_ids);
      for (const [id, marker] of entry.markers) {
        // A late snapshot or temporary network failure cannot turn a confirmed read back into unread.
        if (readIds.has(id)) entry.confirmed.add(id);
        paint(marker, entry.confirmed.has(id) ? "read" : "unread");
      }
    } catch (_) {
      if (current()) for (const [id, marker] of entry.markers) {
        paint(marker, entry.confirmed.has(id) ? "read" : "unavailable");
      }
    } finally {
      clearTimeout(timeout);
      entry.inFlight = false; entry.controller = null;
      entry.nextCheck = entry.refreshAgain ? 0 : Date.now() + POLL_MS;
      entry.refreshAgain = false;
      if (ticket === generation) schedule();
    }
  }

  function check() {
    for (const entry of threads.values()) {
      if (!entry.list.isConnected) { forget(entry); continue; }
      if (visible(entry) && !entry.inFlight && !complete(entry) && entry.nextCheck <= Date.now()) void refresh(entry);
    }
    schedule();
  }

  function checkSoon(force = false) {
    if (force) for (const entry of threads.values()) if (visible(entry)) {
      entry.nextCheck = 0;
      if (entry.inFlight) entry.refreshAgain = true;
    }
    if (frame || !client || !adminId) return;
    frame = requestAnimationFrame(() => { frame = 0; check(); });
  }

  function reset() {
    generation += 1;
    clearTimeout(timer); timer = 0;
    cancelAnimationFrame(frame); frame = 0;
    for (const entry of threads.values()) {
      entry.controller?.abort();
      for (const marker of entry.markers.values()) marker.remove();
    }
    threads.clear(); observer?.disconnect();
    client = null; adminId = "";
  }

  function start(db, userId) {
    reset();
    if (!db || !uuid(userId)) return;
    client = db; adminId = userId;
  }

  function watch(inquiryId, messages, list) {
    if (!client || !adminId || !uuid(inquiryId) || !list?.isConnected) return;
    const previous = threads.get(list);
    if (previous) forget(previous);
    list.querySelectorAll(".admin-inquiry-read-receipt").forEach(marker => marker.remove());
    const cards = new Map([...list.querySelectorAll(".member-inquiry-message.is-admin")]
      .map(card => [card.dataset.messageId, card]));
    const markers = new Map();
    for (const message of messages) {
      if (message.sender_role !== "admin" || !uuid(message.id)) continue;
      const card = cards.get(message.id);
      if (!card) continue;
      const marker = document.createElement("span");
      marker.className = "admin-inquiry-read-receipt";
      marker.dataset.replyId = message.id;
      paint(marker, "checking");
      card.append(marker); markers.set(message.id, marker);
    }
    if (!markers.size) return;
    const entry = { inquiryId, list, markers, confirmed: new Set(), inFlight: false, controller: null, nextCheck: 0 };
    threads.set(list, entry); observer?.observe(list); checkSoon();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      clearTimeout(timer); timer = 0;
      for (const entry of threads.values()) entry.controller?.abort();
    } else checkSoon(true);
  });
  window.addEventListener("pageshow", () => checkSoon(true));
  window.addEventListener("focus", () => checkSoon(true));
  window.addEventListener("online", () => checkSoon(true));
  window.addEventListener("scroll", () => checkSoon(), { passive: true, capture: true });
  window.addEventListener("resize", () => checkSoon(), { passive: true });
  window.AdminInquiryReadReceipts = { start, reset, watch, refresh: () => checkSoon(true) };
})();
