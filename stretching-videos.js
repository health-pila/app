/* 스트레칭 전용 모듈: 목록은 탭 진입 때 조회하고, 선택한 영상 하나만 iframe으로 재생합니다. */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const app = byId("appScreen"), admin = byId("adminScreen"), routine = byId("routineTabPanel");
  const panel = byId("memberStretchingPanel"), grid = byId("memberStretchingGrid");
  const memberStatus = byId("memberStretchingStatus"), memberRefresh = byId("refreshStretchingVideos");
  const pickStatus = byId("memberStretchingPickStatus"), pickFilter = byId("toggleStretchingPicks");
  const form = byId("adminStretchingForm"), list = byId("adminStretchingList");
  const titleInput = byId("adminStretchingTitle"), urlInput = byId("adminStretchingUrl");
  const orderInput = byId("adminStretchingOrder"), publishedInput = byId("adminStretchingPublished");
  const saveButton = byId("saveStretchingVideo"), cancelEdit = byId("cancelStretchingEdit");
  const formStatus = byId("adminStretchingFormStatus"), listStatus = byId("adminStretchingListStatus");
  const adminRefresh = byId("refreshAdminStretchingVideos");
  const dialog = byId("stretchingPlayerDialog"), stage = byId("stretchingPlayerStage");
  const playerTitle = byId("stretchingPlayerTitle"), closeButton = byId("closeStretchingPlayer");
  const youtubeLink = byId("stretchingYouTubeLink");
  if (![app, admin, routine, panel, grid, memberStatus, memberRefresh, pickStatus, pickFilter, form, list, titleInput, urlInput,
    orderInput, publishedInput, saveButton, cancelEdit, formStatus, listStatus, adminRefresh,
    dialog, stage, playerTitle, closeButton, youtubeLink].every(Boolean)) return;

  const TABLE = "stretching_videos";
  const PICKS_TABLE = "stretching_video_picks";
  const FIELDS = "id,title,video_id,sort_order,is_published,created_at,updated_at";
  const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const HISTORY_KEY = "stretchingPlayer";
  let client = null, userId = "", role = "", generation = 0, selected = false;
  let memberRows = [], adminRows = [], memberLoadedAt = 0, memberLoading = false;
  let memberRenderNeeded = false;
  let memberListFailure = null;
  let adminLoading = false, adminReady = false, busy = false, editing = null;
  let memberRequest = 0, adminRequest = 0;
  let returnFocus = null, returnScroll = null, previousOverflow = null;
  let historyToken = "", historyPending = false;
  let picks = new Set(), picksReady = false, picksLoading = false, pickBusyId = "", onlyPicks = false;
  let pickRequest = 0;
  let picksLoadedAt = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function status(node, text, error = false) {
    node.textContent = text;
    node.classList.toggle("is-error", error);
  }
  function isCurrent(token) { return token === generation && client && userId; }
  function isMemberVisible() {
    return role === "member" && selected && !app.hidden && !routine.hidden && !panel.hidden;
  }
  function missingTable(error) {
    return ["42P01", "PGRST205"].includes(error?.code);
  }
  function failureMessage(error, action) {
    if (missingTable(error)) return "스트레칭 영상 저장소 설정이 필요합니다. SETUP-v122-stretching.sql을 먼저 실행해 주세요.";
    if (error?.code === "23505") return "이미 등록한 유튜브 영상입니다. 목록에서 해당 영상을 수정해 주세요.";
    if (["42501", "PGRST301", "SESSION_CHANGED"].includes(error?.code)) return "관리자 로그인 상태와 권한을 확인한 뒤 다시 시도해 주세요.";
    if (error?.code === "CONFLICT") return "다른 작업에서 변경된 영상입니다. 목록을 새로고침한 뒤 다시 수정해 주세요. 입력 내용은 남겨두었습니다.";
    return `${action}에 실패했습니다. 연결을 확인하고 목록을 새로고침해 주세요.`;
  }
  function videoIdFromUrl(value) {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
      let id = "";
      if (["youtu.be", "www.youtu.be"].includes(url.hostname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length === 1) id = parts[0];
      } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length === 1 && parts[0] === "watch") id = url.searchParams.get("v") || "";
        else if (parts.length === 2 && ["shorts", "embed", "live"].includes(parts[0])) id = parts[1];
      }
      return ID_PATTERN.test(id) ? id : "";
    } catch (_) { return ""; }
  }
  function normalizeRows(rows) {
    return (rows || []).filter(row => row && ID_PATTERN.test(row.video_id) && typeof row.title === "string" && row.title.trim())
      .map(row => ({ ...row, title: row.title.trim() }));
  }
  function thumbnail(row) {
    const image = element("img", "stretching-thumbnail");
    image.alt = "";
    image.width = 480; image.height = 360;
    image.loading = "lazy"; image.decoding = "async";
    image.src = `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`;
    image.addEventListener("error", () => { image.hidden = true; }, { once: true });
    return image;
  }
  function pickControls() {
    const disabled = role !== "member" || !picksReady || picksLoading || Boolean(pickBusyId);
    pickFilter.disabled = disabled;
    pickFilter.setAttribute("aria-pressed", String(onlyPicks));
    pickFilter.textContent = onlyPicks ? "전체 영상 보기" : "Pick 영상만 모아보기";
    pickFilter.classList.toggle("is-active", onlyPicks);
    grid.querySelectorAll(".stretching-pick-button").forEach(button => {
      const picked = picks.has(button.dataset.videoId);
      button.disabled = disabled;
      button.setAttribute("aria-pressed", String(picked));
      button.classList.toggle("is-picked", picked);
      button.textContent = picked ? "★ Pick" : "☆ Pick";
      button.setAttribute("aria-busy", String(pickBusyId === button.dataset.videoId));
      button.setAttribute("aria-label", `${button.dataset.videoTitle} Pick ${picked ? "해제" : "선택"}`);
    });
    memberRefresh.disabled = memberLoading || picksLoading || Boolean(pickBusyId);
  }
  function renderMember(focusId = "") {
    const visibleRows = onlyPicks ? memberRows.filter(row => picks.has(row.id)) : memberRows;
    const previousButtons = [...grid.querySelectorAll(".stretching-pick-button")];
    const oldFocusIndex = previousButtons.findIndex(button => button.dataset.videoId === focusId);
    const fragment = document.createDocumentFragment();
    visibleRows.forEach(row => {
      const wrapper = element("article", "stretching-card");
      const card = element("button", "stretching-card-open");
      card.type = "button";
      card.setAttribute("aria-label", `${row.title} 재생`);
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-controls", dialog.id);
      const play = element("span", "stretching-card-play", "▶");
      play.setAttribute("aria-hidden", "true");
      const caption = element("span", "stretching-card-caption");
      caption.append(element("strong", "", row.title));
      card.append(thumbnail(row), play, caption);
      card.addEventListener("click", () => openPlayer(row, card));
      const pick = element("button", "stretching-pick-button");
      pick.type = "button";
      pick.dataset.videoId = row.id; pick.dataset.videoTitle = row.title;
      pick.addEventListener("click", () => { void togglePick(row); });
      wrapper.append(card, pick);
      fragment.append(wrapper);
    });
    grid.replaceChildren(fragment);
    memberRenderNeeded = false;
    pickControls();
    status(memberStatus, memberListFailure?.text || (!memberRows.length ? "스트레칭 영상을 준비 중이에요." :
      onlyPicks && !visibleRows.length ? "Pick한 영상이 없어요. 전체 영상에서 Pick을 눌러보세요." : ""), Boolean(memberListFailure?.error));
    if (focusId && isMemberVisible()) {
      const buttons = [...grid.querySelectorAll(".stretching-pick-button")];
      const target = buttons.find(button => button.dataset.videoId === focusId) ||
        buttons[Math.min(Math.max(oldFocusIndex, 0), buttons.length - 1)] || pickFilter;
      target.focus({ preventScroll: true });
    }
  }
  async function loadPicks(force = false) {
    if (role !== "member" || !client || picksLoading || pickBusyId ||
      (!force && picksReady && Date.now() - picksLoadedAt < 60000)) return;
    const token = generation, request = ++pickRequest, activeClient = client, activeUserId = userId;
    picksLoading = true; pickControls(); status(pickStatus, "");
    try {
      const ids = new Set(), size = 500;
      for (let offset = 0; ; offset += size) {
        const { data, error } = await activeClient.from(PICKS_TABLE).select("stretching_video_id")
          .eq("user_id", activeUserId).order("stretching_video_id", { ascending: true }).range(offset, offset + size - 1);
        if (!isCurrent(token) || request !== pickRequest) return;
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error("Invalid Pick response");
        data.forEach(row => { if (typeof row.stretching_video_id === "string") ids.add(row.stretching_video_id); });
        if (data.length < size) break;
      }
      picks = ids; picksReady = true; picksLoadedAt = Date.now(); status(pickStatus, "");
      if (isMemberVisible()) renderMember(); else memberRenderNeeded = true;
    } catch (error) {
      if (!isCurrent(token) || request !== pickRequest) return;
      picksReady = false;
      status(pickStatus, missingTable(error) ? "Pick 기능을 준비 중이에요. 일반 영상은 계속 볼 수 있어요." :
        "Pick 목록을 확인하지 못했어요. 아래 새로고침으로 다시 확인해 주세요.", !missingTable(error));
    } finally {
      if (isCurrent(token) && request === pickRequest) { picksLoading = false; pickControls(); }
    }
  }
  async function togglePick(row) {
    if (!isMemberVisible() || !picksReady || picksLoading || pickBusyId || !memberRows.some(item => item.id === row.id)) return;
    const token = generation, activeClient = client, activeUserId = userId;
    const nextPicked = !picks.has(row.id);
    pickBusyId = row.id; pickControls(); status(pickStatus, "");
    try {
      const { data: authData, error: authError } = await activeClient.auth.getUser();
      if (!isCurrent(token)) return;
      if (authError || authData?.user?.id !== activeUserId) throw { code: "SESSION_CHANGED" };
      let writeError;
      try {
        const query = nextPicked ? activeClient.from(PICKS_TABLE).upsert(
          { user_id: activeUserId, stretching_video_id: row.id },
          { onConflict: "user_id,stretching_video_id", ignoreDuplicates: true }
        ) : activeClient.from(PICKS_TABLE).delete().eq("user_id", activeUserId).eq("stretching_video_id", row.id);
        const result = await query;
        writeError = result.error;
      } catch (error) { writeError = error; }
      if (!isCurrent(token)) return;
      // 응답 유실도 정확한 회원/영상으로 재조회해 확인합니다. 확인 전에는 성공 표시하지 않습니다.
      const { data, error } = await activeClient.from(PICKS_TABLE).select("stretching_video_id")
        .eq("user_id", activeUserId).eq("stretching_video_id", row.id).maybeSingle();
      if (!isCurrent(token)) return;
      if (error) { picksReady = false; throw error; }
      if (data) picks.add(row.id); else picks.delete(row.id);
      if (Boolean(data) !== nextPicked) throw writeError || new Error("Pick was not saved");
      status(pickStatus, "");
    } catch (error) {
      if (!isCurrent(token)) return;
      if (!error?.code || missingTable(error)) picksReady = false;
      status(pickStatus, error?.code === "SESSION_CHANGED" ? "로그인 상태를 확인한 뒤 다시 시도해 주세요." :
        "Pick 저장을 확인하지 못했어요. 아래 새로고침으로 확인해 주세요.", true);
    } finally {
      if (isCurrent(token)) {
        pickBusyId = "";
        if (isMemberVisible()) renderMember(row.id); else { memberRenderNeeded = true; pickControls(); }
      }
    }
  }
  async function loadMember(force = false) {
    if (!isMemberVisible() || memberLoading || pickBusyId) return;
    if (!force && memberLoadedAt && Date.now() - memberLoadedAt < 60000) {
      if (memberRenderNeeded) renderMember();
      void loadPicks();
      return;
    }
    const token = generation, request = ++memberRequest;
    memberLoading = true; memberRefresh.disabled = true;
    status(memberStatus, "스트레칭 영상을 불러오고 있어요.");
    try {
      const { data, error } = await client.from(TABLE).select(FIELDS).eq("is_published", true)
        .order("sort_order", { ascending: true }).order("created_at", { ascending: false })
        .order("id", { ascending: true }).limit(500);
      if (!isCurrent(token) || request !== memberRequest) return;
      if (error) throw error;
      memberListFailure = null;
      memberRows = normalizeRows(data); memberLoadedAt = Date.now(); memberRenderNeeded = true;
      if (isMemberVisible()) renderMember();
    } catch (error) {
      if (!isCurrent(token) || request !== memberRequest) return;
      memberListFailure = { text: missingTable(error) ? "스트레칭 영상을 준비 중이에요." : "영상을 불러오지 못했어요. 새로고침을 눌러 다시 시도해 주세요.", error: !missingTable(error) };
      status(memberStatus, memberListFailure.text, memberListFailure.error);
    } finally {
      if (isCurrent(token) && request === memberRequest) { memberLoading = false; pickControls(); }
    }
    if (isCurrent(token) && isMemberVisible()) await loadPicks(force);
  }

  function clearHistoryMarker() {
    if (!historyToken || history.state?.[HISTORY_KEY] !== historyToken) return false;
    try {
      const state = { ...history.state };
      delete state[HISTORY_KEY];
      history.replaceState(state, "", location.href);
    } catch (_) {}
    return true;
  }
  function cleanupPlayer(restore) {
    stage.replaceChildren(); // iframe 제거로 닫힌 뒤 소리/재생이 남지 않도록 합니다.
    if (dialog.open) dialog.close();
    if (previousOverflow === null) return;
    document.body.style.overflow = previousOverflow;
    previousOverflow = null;
    if (restore && returnScroll) window.scrollTo({ ...returnScroll, behavior: "instant" });
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null; returnScroll = null;
  }
  function closePlayer({ restore = true, navigate = true } = {}) {
    const ownEntry = historyToken && history.state?.[HISTORY_KEY] === historyToken;
    cleanupPlayer(restore);
    if (ownEntry && navigate && !historyPending) {
      historyPending = true;
      try { history.back(); } catch (_) { historyPending = false; clearHistoryMarker(); }
    } else if (ownEntry && !navigate) clearHistoryMarker();
    historyToken = "";
  }
  function openPlayer(row, trigger) {
    if (dialog.open || historyPending || !ID_PATTERN.test(row.video_id)) return;
    if (!(isMemberVisible() || (role === "admin" && !admin.hidden))) return;
    returnFocus = trigger;
    returnScroll = { left: window.scrollX, top: window.scrollY };
    previousOverflow = document.body.style.overflow;
    playerTitle.textContent = row.title;
    youtubeLink.href = `https://www.youtube.com/watch?v=${row.video_id}`;
    try { dialog.showModal(); }
    catch (_) { cleanupPlayer(true); return; }
    document.body.style.overflow = "hidden";
    const iframe = element("iframe", "stretching-player-frame");
    iframe.title = `${row.title} 유튜브 영상`;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.src = `https://www.youtube-nocookie.com/embed/${row.video_id}?autoplay=1&playsinline=1&rel=0`;
    stage.replaceChildren(iframe);
    closeButton.focus({ preventScroll: true });
    try {
      historyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      history.pushState({ ...history.state, [HISTORY_KEY]: historyToken }, "", location.href);
    } catch (_) { historyToken = ""; }
  }
  closeButton.addEventListener("click", () => closePlayer());
  youtubeLink.addEventListener("click", () => closePlayer());
  dialog.addEventListener("cancel", event => { event.preventDefault(); closePlayer(); });
  dialog.addEventListener("close", () => {
    // native close 이벤트는 비동기이므로, 이미 새로 열린 창을 닫지 않습니다.
    if (!dialog.open && previousOverflow !== null) closePlayer();
  });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closePlayer();
  });
  window.addEventListener("popstate", () => {
    historyPending = false;
    if (dialog.open && history.state?.[HISTORY_KEY] !== historyToken) {
      cleanupPlayer(true); historyToken = "";
    } else if (!dialog.open && history.state?.[HISTORY_KEY]) {
      // 앞으로가기로 돌아와도 사용자가 누르지 않은 영상은 재생하지 않습니다.
      try { const state = { ...history.state }; delete state[HISTORY_KEY]; history.replaceState(state, "", location.href); } catch (_) {}
    }
  });
  window.addEventListener("pagehide", () => closePlayer({ restore: false, navigate: false }));

  function controls() {
    const disabled = role !== "admin" || !adminReady || busy || adminLoading;
    form.querySelectorAll("input, button").forEach(node => { node.disabled = disabled; });
    list.querySelectorAll("button").forEach(node => { node.disabled = disabled; });
    adminRefresh.disabled = role !== "admin" || busy || adminLoading;
  }
  function resetForm() {
    editing = null;
    form.reset();
    saveButton.textContent = "영상 등록"; cancelEdit.hidden = true;
  }
  function editRow(row) {
    if (busy || !adminReady) return;
    editing = { ...row };
    titleInput.value = row.title;
    urlInput.value = `https://www.youtube.com/shorts/${row.video_id}`;
    orderInput.value = String(row.sort_order);
    publishedInput.checked = row.is_published;
    saveButton.textContent = "수정 내용 저장"; cancelEdit.hidden = false;
    status(formStatus, "영상을 수정하고 있어요.");
    titleInput.focus();
  }
  function renderAdmin() {
    const fragment = document.createDocumentFragment();
    adminRows.forEach(row => {
      const item = element("article", "stretching-admin-item");
      const info = element("div", "stretching-admin-info");
      info.append(element("strong", "", row.title), element("span", "", `${row.is_published ? "공개" : "숨김"} · 순서 ${row.sort_order}`));
      const actions = element("div", "stretching-actions");
      [["미리보기", () => openPlayer(row, actions.firstElementChild)], ["수정", () => editRow(row)],
        [row.is_published ? "숨기기" : "공개하기", () => mutate("publish", row)], ["삭제", () => mutate("delete", row)]]
        .forEach(([label, action]) => {
          const button = element("button", "stretching-secondary", label); button.type = "button";
          if (label === "삭제") button.classList.add("stretching-delete");
          button.addEventListener("click", action); actions.append(button);
        });
      item.append(info, actions); fragment.append(item);
    });
    list.replaceChildren(fragment);
    controls();
  }
  async function loadAdmin() {
    if (role !== "admin" || adminLoading) return false;
    const token = generation, request = ++adminRequest;
    adminLoading = true; controls(); status(listStatus, "등록한 영상을 불러오고 있습니다.");
    try {
      const { data, error } = await client.from(TABLE).select(FIELDS)
        .order("sort_order", { ascending: true }).order("created_at", { ascending: false })
        .order("id", { ascending: true }).limit(500);
      if (!isCurrent(token) || request !== adminRequest) return false;
      if (error) throw error;
      adminRows = normalizeRows(data); adminReady = true;
      renderAdmin();
      status(listStatus, adminRows.length ? `${adminRows.length}개 등록 · ${adminRows.filter(row => row.is_published).length}개 공개` : "등록한 영상이 없습니다.");
      return true;
    } catch (error) {
      if (isCurrent(token) && request === adminRequest) {
        adminReady = false;
        status(listStatus, failureMessage(error, "목록 불러오기"), true);
      }
      return false;
    } finally {
      if (isCurrent(token) && request === adminRequest) { adminLoading = false; controls(); }
    }
  }
  function readPayload() {
    const title = titleInput.value.trim(), videoId = videoIdFromUrl(urlInput.value);
    const orderText = orderInput.value.trim(), order = Number(orderText);
    if (!title || title.length > 100) { titleInput.focus(); throw new Error("영상 제목을 1~100자로 입력해 주세요."); }
    if (!videoId) { urlInput.focus(); throw new Error("올바른 https 유튜브 쇼츠 주소를 입력해 주세요. youtu.be와 일반 영상 주소도 사용할 수 있습니다."); }
    if (!orderText || !Number.isInteger(order) || order < 0 || order > 9999) {
      orderInput.focus(); throw new Error("표시 순서는 0~9999 사이의 정수로 입력해 주세요.");
    }
    return { title, video_id: videoId, sort_order: order, is_published: publishedInput.checked };
  }
  async function mutate(action, row = null) {
    if (role !== "admin" || !adminReady || busy || adminLoading || admin.hidden) return;
    let payload;
    try { if (action === "save") payload = readPayload(); }
    catch (error) { status(formStatus, error.message, true); return; }
    if (action === "delete" && !window.confirm(`‘${row.title}’ 영상을 목록에서 삭제할까요? 유튜브 원본 영상은 삭제되지 않습니다.`)) return;
    const token = generation, activeClient = client, activeUserId = userId;
    const target = action === "save" ? editing : row;
    busy = true; controls(); status(formStatus, "저장 중입니다.");
    let completed = false;
    try {
      const { data: authData, error: authError } = await activeClient.auth.getUser();
      if (!isCurrent(token)) return;
      if (authError || authData?.user?.id !== activeUserId) throw { code: "SESSION_CHANGED" };
      let query;
      if (action === "save" && !target) query = activeClient.from(TABLE).insert(payload);
      else {
        if (!target?.updated_at) throw { code: "CONFLICT" };
        query = action === "delete" ? activeClient.from(TABLE).delete() : activeClient.from(TABLE)
          .update(action === "publish" ? { is_published: !target.is_published } : payload);
        query = query.eq("id", target.id).eq("updated_at", target.updated_at);
      }
      const { data, error } = await query.select(FIELDS).maybeSingle();
      if (!isCurrent(token)) return;
      if (error) throw error;
      if (!data) throw { code: "CONFLICT" };
      completed = true;
      if (action === "save" || (action === "delete" && editing?.id === target?.id)) resetForm();
      else if (action === "publish" && editing?.id === target?.id) {
        editing = { ...data }; publishedInput.checked = data.is_published;
      }
      memberLoadedAt = 0;
      status(formStatus, action === "delete" ? "영상을 삭제했습니다." : "저장했습니다.");
      await loadAdmin();
    } catch (error) {
      if (!isCurrent(token)) return;
      status(formStatus, failureMessage(error, "영상 저장") + (!error?.code ? " 저장 여부를 목록에서 확인한 뒤 다시 시도해 주세요." : ""), true);
      // 중복·동시 수정·응답 유실 시 목록은 재조회하되 입력하던 내용은 보존합니다.
      if (!["SESSION_CHANGED", "42501"].includes(error?.code)) await loadAdmin();
    } finally {
      if (isCurrent(token)) {
        busy = false; controls();
        if (completed && !adminReady) status(formStatus, "저장은 완료됐습니다. 목록을 새로고침해 주세요.");
      }
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); void mutate("save"); });
  cancelEdit.addEventListener("click", () => { resetForm(); status(formStatus, ""); });
  adminRefresh.addEventListener("click", () => { void loadAdmin(); });
  memberRefresh.addEventListener("click", () => { void loadMember(true); });
  pickFilter.addEventListener("click", () => {
    if (pickFilter.disabled || !isMemberVisible()) return;
    onlyPicks = !onlyPicks; renderMember();
  });

  function syncVisibility() {
    if (isMemberVisible()) void loadMember();
    else if (role !== "admin" || admin.hidden) closePlayer({ restore: false });
  }
  function setMemberVisible(visible) {
    selected = Boolean(visible);
    syncVisibility();
  }
  function reset() {
    generation++; memberRequest++; adminRequest++; pickRequest++;
    closePlayer({ restore: false });
    client = null; userId = ""; role = ""; selected = false;
    memberRows = []; adminRows = []; memberLoadedAt = 0; memberRenderNeeded = false;
    memberListFailure = null;
    memberLoading = false; adminLoading = false; adminReady = false; busy = false;
    picks = new Set(); picksReady = false; picksLoading = false; pickBusyId = ""; onlyPicks = false;
    picksLoadedAt = 0;
    grid.replaceChildren(); list.replaceChildren(); resetForm();
    status(memberStatus, ""); status(pickStatus, ""); status(formStatus, ""); status(listStatus, "");
    pickControls(); controls();
  }
  function startMember(nextClient, nextUserId) {
    reset(); client = nextClient; userId = String(nextUserId); role = "member";
  }
  async function startAdmin(nextClient, nextUserId) {
    reset(); client = nextClient; userId = String(nextUserId); role = "admin";
    await loadAdmin();
  }
  const visibilityObserver = new MutationObserver(syncVisibility);
  [app, admin, routine, panel].forEach(node => visibilityObserver.observe(node, { attributes: true, attributeFilter: ["hidden"] }));
  window.StretchingVideos = Object.freeze({ startMember, startAdmin, setMemberVisible, syncVisibility, reset });
  controls();
})();
