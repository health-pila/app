// 읽은 항목 ID만 본인 계정에 동기화하며, 기존 기기 기록도 유지합니다.
(() => {
  "use strict";
  let userId = "";
  let client = null;
  let generation = 0;
  let requestId = 0;
  let frame = 0;
  let news = [];
  let replies = [];
  let replyIds = new Set();
  let seenNews = new Set();
  let seenReplies = new Set();
  const watched = new Map();
  let hydrated = false, hydration = null, sending = false, sendTimer = 0;
  let serverNews = new Set(), serverReplies = new Set();
  const pendingNews = new Set(), pendingReplies = new Set();
  const ids = rows => Array.isArray(rows) && rows.every(id => typeof id === "string" && id.length > 0 && id.length <= 100);
  function current(ticket, member) { return ticket === generation && member === userId && !!userId; }
  function queueLocal() {
    seenNews.forEach(id => { if(!serverNews.has(id)) pendingNews.add(id); });
    seenReplies.forEach(id => { if(replyIds.has(id) && !serverReplies.has(id)) pendingReplies.add(id); });
  }
  function scheduleSend() {
    if (!userId || !client || !hydrated || sendTimer || sending || (!pendingNews.size && !pendingReplies.size)) return;
    sendTimer = setTimeout(() => { sendTimer=0; void flush(); }, 400);
  }
  async function flush() {
    if (!userId || !client || !hydrated || sending || (!pendingNews.size && !pendingReplies.size)) return;
    const ticket=generation, member=userId, db=client;
    const a=[...pendingNews].slice(0,500), b=[...pendingReplies].slice(0,500-a.length);
    sending=true;let success=false;
    try {
      const {error}=await db.rpc("member_community_mark_read", {p_news_ids:a,p_reply_ids:b});
      if(!current(ticket,member))return;
      if(error)throw error;
      a.forEach(id=>{serverNews.add(id);pendingNews.delete(id);});
      b.forEach(id=>{serverReplies.add(id);pendingReplies.delete(id);});success=true;
    } catch (_) { /* Keep the local read state and retry at the next viewing/online event. */ }
    finally { if(current(ticket,member)){sending=false;if(success)scheduleSend();} }
  }
  function hydrate(force=false) {
    if(!userId || !client || hydration || (hydrated && !force))return hydration;
    const ticket=generation, member=userId, db=client;
    const operation=(async()=>{
      try {
        const {data,error}=await db.rpc("member_community_read_state");
        if(!current(ticket,member))return;
        if(error || !ids(data?.news) || !ids(data?.replies))throw Error("READ_STATE_UNAVAILABLE");
        hydrated=true;serverNews=new Set(data.news);serverReplies=new Set(data.replies);
        data.news.forEach(id=>seenNews.add(id));data.replies.forEach(id=>seenReplies.add(id));
        // Persist does not discard local reads made while the RPC was in flight.
        persist();
      } catch (_) { /* Browser state remains a fallback when the server is unavailable. */ }
      finally { if(current(ticket,member)){hydration=null;queueLocal();render();checkSoon();scheduleSend();} }
    })();
    hydration=operation;return operation;
  }
  const key = () => `memberCommunityRead:v1:${userId}`;
  const byId = id => document.getElementById(id);

  function mergeSaved() {
    if (!userId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key()));
      if (saved?.version !== 1) return;
      for (const id of Array.isArray(saved.news) ? saved.news : []) if (typeof id === "string" && id.length > 0 && id.length <= 100) seenNews.add(id);
      for (const id of Array.isArray(saved.replies) ? saved.replies : []) if (typeof id === "string" && id.length > 0 && id.length <= 100) seenReplies.add(id);
    } catch (_) { /* 저장소를 사용할 수 없어도 현재 화면에서는 동작합니다. */ }
  }

  function persist() {
    mergeSaved();
    try {
      localStorage.setItem(key(), JSON.stringify({
        version: 1, news: [...seenNews], replies: [...seenReplies]
      }));
    } catch (_) { /* 서버 동기화는 로컬 저장 실패와 무관하게 계속합니다. */ }
    queueLocal(); scheduleSend();
  }

  function badge(parent, count, label, inline = false) {
    if (!parent) return;
    let node = parent.querySelector(".member-community-badge");
    if (!node) {
      node = document.createElement("span");
      node.className = "member-community-badge" + (inline ? " is-inline" : "");
      node.setAttribute("role", "img");
      parent.append(node);
    }
    node.hidden = count === 0;
    node.textContent = inline ? "새 답변" : count > 99 ? "99+" : String(count);
    node.setAttribute("aria-label", `${label} ${count}건`);
  }

  function render() {
    const newsCount = !hydrated ? 0 : news.filter(post => !seenNews.has(String(post.id))).length;
    const unreadThreads = new Set((hydrated ? replies : []).filter(reply => !seenReplies.has(String(reply.id)))
      .map(reply => String(reply.inquiry_id)));
    badge(byId("communityTabButton"), newsCount + unreadThreads.size, "미확인 소식 및 답변");
    badge(byId("communityNewsMenuButton"), newsCount, "미확인 센터 소식");
    badge(byId("communityInquiryMenuButton"), unreadThreads.size, "새 답변이 있는 문의");
    document.querySelectorAll("[data-member-inquiry-id]").forEach(card => {
      badge(card.querySelector(".member-inquiry-summary-top"),
        unreadThreads.has(card.dataset.memberInquiryId) ? 1 : 0, "새 답변", true);
    });
  }

  function isVisible(node) {
    if (!userId || document.visibilityState !== "visible" || !node.isConnected ||
        node.closest("[hidden]") || byId("appScreen")?.hidden) return false;
    const rect = node.getBoundingClientRect();
    const bottom = Math.min(innerHeight, byId("appScreen")?.querySelector(".member-bottom-nav")
      ?.getBoundingClientRect().top || innerHeight);
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth &&
      Math.min(rect.bottom, bottom) - Math.max(rect.top, 0) >= Math.min(32, rect.height);
  }

  function checkVisible() {
    frame = 0;
    let changed = false;
    watched.forEach((item, node) => {
      if (!node.isConnected) {
        observer?.unobserve(node);
        watched.delete(node);
        return;
      }
      if (!isVisible(node)) return;
      const seen = item.kind === "news" ? seenNews : seenReplies;
      if (!seen.has(item.id)) { seen.add(item.id); changed = true; }
      observer?.unobserve(node);
      watched.delete(node);
    });
    if (changed) { persist(); render(); }
  }

  function checkSoon() {
    if (!frame) frame = requestAnimationFrame(checkVisible);
  }

  const observer = typeof IntersectionObserver === "function" ?
    new IntersectionObserver(checkSoon, { threshold: [0, 0.1, 0.5, 1] }) : null;

  function watch(node, kind, id) {
    if (!userId || !node) return;
    watched.set(node, { kind, id: String(id) });
    observer?.observe(node);
    checkSoon();
  }

  function syncNews(posts) {
    if (!userId) return;
    mergeSaved();
    news = posts;
    render();
    document.querySelectorAll("[data-community-post-id]").forEach(card => {
      // 사진만 보였을 때보다 제목과 본문이 화면에 들어왔을 때 읽음으로 처리합니다.
      watch(card.querySelector(".community-post-title") || card, "news", card.dataset.communityPostId);
    });
  }

  function observeReplies(inquiryId, messages, list) {
    if (!userId || !list.isConnected) return;
    const cards = list.querySelectorAll(".member-inquiry-message");
    messages.forEach((message, index) => {
      if (message.sender_role === "admin") { replyIds.add(String(message.id)); watch(cards[index], "reply", message.id); }
    });
    queueLocal(); scheduleSend();
  }

  async function refreshReplies() {
    if (!userId || !client) return;
    const version = generation;
    const request = ++requestId;
    const member = userId;
    const db = client;
    const current = () => version === generation && request === requestId;
    async function allPages(makeQuery) {
      const rows = [];
      for (let offset = 0; current();) {
        const { data, error, count } = await makeQuery().order("id", { ascending: true })
          .range(offset, offset + 499);
        if (!current()) return [];
        if (error) throw error;
        rows.push(...(data || []));
        offset += data?.length || 0;
        if (!data?.length || (typeof count === "number" ? offset >= count : data.length < 500)) break;
      }
      return rows;
    }
    try {
      // 문의 목록의 '이전 문의 더 보기' 범위와 무관하게 본인의 전체 답변을 확인합니다.
      const inquiries = await allPages(() => db.from("member_inquiries")
        .select("id", { count: "exact" }).eq("user_id", member));
      const result = [];
      for (let offset = 0; offset < inquiries.length && current(); offset += 100) {
        const ids = inquiries.slice(offset, offset + 100).map(row => row.id);
        result.push(...await allPages(() => db.from("inquiry_messages")
          .select("id, inquiry_id", { count: "exact" })
          .eq("sender_role", "admin").in("inquiry_id", ids)));
      }
      if (!current()) return;
      replies = result;
      replyIds = new Set(result.map(reply => String(reply.id)));
      for (const id of pendingReplies) if (!replyIds.has(id)) pendingReplies.delete(id);
      mergeSaved();
      queueLocal(); scheduleSend();
      render();
      checkSoon();
    } catch (error) {
      // 일시적인 조회 실패로 기존 배지를 없애거나 문의 사용을 막지 않습니다.
      if (current()) console.warn("회원 답변 배지 갱신 실패:", error);
    }
  }

  function reset() {
    generation++;
    requestId++;
    clearTimeout(sendTimer);sendTimer=0;sending=false;hydrated=false;hydration=null;
    serverNews=new Set();serverReplies=new Set();pendingNews.clear();pendingReplies.clear();
    userId = "";
    client = null;
    news = [];
    replies = [];
    replyIds = new Set();
    seenNews = new Set();
    seenReplies = new Set();
    watched.clear();
    observer?.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    render();
  }

  function start(id, db) {
    reset();
    userId = String(id);
    client = db;
    mergeSaved();
    void hydrate();
  }

  window.addEventListener("storage", event => {
    if (userId && event.key === key()) { mergeSaved(); queueLocal(); render(); scheduleSend(); }
  });
  window.addEventListener("scroll", checkSoon, { passive: true });
  window.addEventListener("resize", checkSoon);
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") { void hydrate(true); scheduleSend(); checkSoon(); }
    else { clearTimeout(sendTimer);sendTimer=0;void flush(); }
  });
  window.addEventListener("pagehide", () => { checkVisible(); clearTimeout(sendTimer);sendTimer=0;void flush(); });
  window.addEventListener("online", () => { void hydrate(true); scheduleSend(); });
  window.MemberCommunityBadges = Object.freeze({
    start, reset, syncNews, observeReplies, refreshReplies, render, checkSoon
  });
})();
