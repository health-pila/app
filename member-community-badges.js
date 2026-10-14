// 회원별 읽음 표시는 이 브라우저에만 저장합니다. 본문과 개인정보는 저장하지 않습니다.
(() => {
  "use strict";
  let userId = "";
  let client = null;
  let generation = 0;
  let requestId = 0;
  let frame = 0;
  let news = [];
  let replies = [];
  let seenNews = new Set();
  let seenReplies = new Set();
  const watched = new Map();
  const key = () => `memberCommunityRead:v1:${userId}`;
  const byId = id => document.getElementById(id);

  function mergeSaved() {
    if (!userId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key()));
      if (saved?.version !== 1) return;
      for (const id of saved.news || []) if (typeof id === "string") seenNews.add(id);
      for (const id of saved.replies || []) if (typeof id === "string") seenReplies.add(id);
    } catch (_) { /* 저장소를 사용할 수 없어도 현재 화면에서는 동작합니다. */ }
  }

  function persist() {
    mergeSaved();
    try {
      localStorage.setItem(key(), JSON.stringify({
        version: 1, news: [...seenNews], replies: [...seenReplies]
      }));
    } catch (_) { /* 비공개 모드·저장 공간 부족 시 메모리만 사용합니다. */ }
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
    const newsCount = news.filter(post => !seenNews.has(String(post.id))).length;
    const unreadThreads = new Set(replies.filter(reply => !seenReplies.has(String(reply.id)))
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
      if (message.sender_role === "admin") watch(cards[index], "reply", message.id);
    });
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
      mergeSaved();
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
    userId = "";
    client = null;
    news = [];
    replies = [];
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
  }

  window.addEventListener("storage", event => {
    if (userId && event.key === key()) { mergeSaved(); render(); }
  });
  window.addEventListener("scroll", checkSoon, { passive: true });
  window.addEventListener("resize", checkSoon);
  document.addEventListener("visibilitychange", checkSoon);
  window.MemberCommunityBadges = Object.freeze({
    start, reset, syncNews, observeReplies, refreshReplies, render, checkSoon
  });
})();
