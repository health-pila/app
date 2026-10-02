/* 1DAY PT: 운동 선택 → 신청 → 센터의 개별 연락. 온라인 결제는 사용하지 않습니다. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const dialog = $("oneDayPtDialog");
  const MAX_ITEMS = 5;
  const LABELS = { pending: "접수 완료", contacted: "예약 조율 중", completed: "진행 완료", cancelled: "취소" };
  const FIELDS = "id,user_id,exercises,status,created_at,updated_at";
  let client, role = "", userId = "", generation = 0;
  let cart = [], requestId = "", memberRows = [], memberReady = false;
  let memberLoading = false, memberSequence = 0, submitting = false;
  let adminRows = [], adminSequence = 0, adminLoading = false, adminSaving = false;
  let adminLimit = 20, adminHasMore = false;
  let channel = null, refreshTimer = null, feedbackTimer = null;

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function active(row) { return row.status === "pending" || row.status === "contacted"; }
  function current(ticket, expectedRole) { return ticket === generation && role === expectedRole; }
  function storageKey() { return "oneDayPtCart:" + userId; }
  function saveCart() {
    if (role !== "member") return;
    try { localStorage.setItem(storageKey(), JSON.stringify({ ids: cart, requestId })); } catch (_) {}
  }
  function restoreCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()));
      cart = Array.isArray(saved?.ids) ? [...new Set(saved.ids)].filter(id => typeof id === "string" && window.ExerciseDB.getExerciseById(id)).slice(0, MAX_ITEMS) : [];
      requestId = typeof saved?.requestId === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved.requestId) ? saved.requestId : "";
    } catch (_) { cart = []; requestId = ""; }
  }
  function feedback(text) {
    clearTimeout(feedbackTimer);
    $("oneDayPtFeedback").textContent = text;
    $("oneDayPtFeedback").hidden = false;
    feedbackTimer = setTimeout(() => { $("oneDayPtFeedback").hidden = true; }, 4000);
  }
  function updateAddButton(button) {
    const added = cart.includes(button.dataset.exerciseId);
    button.textContent = added ? "✓ 1DAY PT에 담았어요" : "+ 이 운동을 1DAY PT에 담기";
    button.classList.toggle("is-added", added);
    button.setAttribute("aria-pressed", String(added));
    button.disabled = role !== "member" || added || submitting;
  }
  function createAddButton(exerciseId) {
    const button = node("button", "one-day-pt-add-button");
    button.type = "button";
    button.dataset.exerciseId = exerciseId;
    updateAddButton(button);
    button.addEventListener("click", () => {
      if (role !== "member" || submitting || cart.includes(exerciseId)) return;
      if (!window.ExerciseDB.getExerciseById(exerciseId)) return;
      if (cart.length >= MAX_ITEMS) { feedback("운동은 최대 5개까지 담을 수 있어요. 장바구니에서 운동을 빼고 다시 담아 주세요."); return; }
      cart.push(exerciseId); requestId = ""; saveCart(); renderCart();
      $("oneDayPtSubmitMessage").textContent = "";
      feedback(window.ExerciseDB.getExerciseById(exerciseId).name + "을(를) 담았어요. (" + cart.length + " / 5)");
    });
    return button;
  }
  function renderCart() {
    $("oneDayPtCartCount").textContent = cart.length + " / 5";
    document.querySelectorAll("#appScreen .one-day-pt-add-button").forEach(updateAddButton);
    $("oneDayPtEmpty").hidden = cart.length > 0;
    $("oneDayPtCartList").replaceChildren();
    cart.forEach(id => {
      const exercise = window.ExerciseDB.getExerciseById(id);
      if (!exercise) return;
      const item = node("li", "one-day-pt-cart-item");
      item.append(node("span", "", exercise.name));
      const remove = node("button", "one-day-pt-remove", "빼기");
      remove.type = "button"; remove.disabled = submitting;
      remove.setAttribute("aria-label", exercise.name + " 장바구니에서 빼기");
      remove.addEventListener("click", () => {
        if (submitting || role !== "member") return;
        cart = cart.filter(value => value !== id); requestId = ""; saveCart(); renderCart();
        $("oneDayPtSubmitMessage").textContent = "";
        const next = $("oneDayPtCartList").querySelector("button");
        (next || $("closeOneDayPtCart")).focus({ preventScroll: true });
      });
      item.append(remove); $("oneDayPtCartList").append(item);
    });
    $("submitOneDayPt").disabled = role !== "member" || !cart.length || submitting || memberLoading || !memberReady || memberRows.some(active);
    $("submitOneDayPt").textContent = submitting ? "신청을 접수하고 있어요…" : "이 구성으로 1DAY PT 신청하기";
    $("refreshMemberOneDayPt").disabled = memberLoading || submitting;
  }
  function requestCard(row) {
    const card = node("article", "one-day-pt-request-card");
    const heading = node("div", "one-day-pt-request-heading");
    const badge = node("span", "one-day-pt-status", LABELS[row.status] || "상태 확인 필요");
    badge.dataset.status = row.status;
    const date = new Date(row.created_at);
    heading.append(badge, node("time", "", Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })));
    card.append(heading);
    const list = node("ol", "one-day-pt-exercises");
    (Array.isArray(row.exercises) ? row.exercises : []).forEach(exercise => list.append(node("li", "", exercise.name || exercise.exerciseId)));
    card.append(list); return card;
  }
  function renderMemberHistory() {
    const list = $("oneDayPtHistoryList"); list.replaceChildren();
    memberRows.forEach(row => list.append(requestCard(row)));
    if (memberReady) $("oneDayPtHistoryMessage").textContent = memberRows.some(active)
      ? "진행 중인 신청이 있어요. 센터가 연락해 일정을 안내해 드립니다."
      : memberRows.length ? "최근 신청 내역입니다." : "아직 신청한 내역이 없어요.";
  }
  function errorMessage(error, admin) {
    if (["42P01", "PGRST205", "PGRST202", "42883"].includes(error?.code)) {
      return admin ? "1DAY PT DB 설정이 필요합니다. 제공된 v64 SQL을 먼저 실행해 주세요." : "1DAY PT 신청 기능을 준비하고 있어요. 센터에 문의해 주세요.";
    }
    return admin ? "신청 내역을 불러오지 못했습니다. 새로고침해 주세요." : "신청 내역을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.";
  }
  async function loadMember() {
    if (role !== "member" || submitting) return;
    const ticket = generation, seq = ++memberSequence;
    memberLoading = true; renderCart();
    $("oneDayPtHistoryMessage").textContent = "신청 내역을 확인하고 있어요…";
    try {
      const { data, error } = await client.from("one_day_pt_requests").select(FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
      if (!current(ticket, "member") || seq !== memberSequence) return;
      if (error) throw error;
      memberRows = data || []; memberReady = true;
      // 응답 유실 또는 앱 종료 뒤에도 서버에 저장된 동일 신청을 확인해 정리합니다.
      if (requestId && memberRows.some(row => row.id === requestId)) {
        cart = []; requestId = ""; saveCart();
        $("oneDayPtSubmitMessage").textContent = "접수된 신청을 확인했어요. 아래 신청 내역을 확인해 주세요.";
      }
      renderMemberHistory();
    } catch (error) {
      if (!current(ticket, "member") || seq !== memberSequence) return;
      memberReady = false; $("oneDayPtHistoryMessage").textContent = errorMessage(error, false);
    } finally {
      if (current(ticket, "member") && seq === memberSequence) { memberLoading = false; renderCart(); }
    }
  }
  async function submit() {
    if ($("submitOneDayPt").disabled || role !== "member") return;
    const exercises = cart.map(id => ({ exerciseId: id, name: window.ExerciseDB.getExerciseById(id).name }));
    if (!window.confirm("선택한 " + exercises.length + "개 운동으로 1DAY PT를 신청할까요?\n센터가 별도로 연락해 일정을 예약하며, 결제는 현장에서 진행합니다.")) return;
    const ticket = generation;
    submitting = true; requestId = requestId || crypto.randomUUID(); saveCart(); renderCart();
    $("oneDayPtSubmitMessage").textContent = "신청을 접수하고 있어요…";
    try {
      const { data, error } = await client.rpc("submit_one_day_pt_request", { p_request_id: requestId, p_exercises: exercises }).single();
      if (!current(ticket, "member")) return;
      if (error) throw error;
      if (!data?.id || data.user_id !== userId) throw new Error("NO_RECEIPT");
      cart = []; requestId = ""; saveCart();
      memberRows = [data, ...memberRows.filter(row => row.id !== data.id)].slice(0, 20);
      memberReady = true; renderMemberHistory();
      $("oneDayPtSubmitMessage").textContent = "1DAY PT 신청이 접수됐어요. 센터가 연락해 일정을 안내해 드립니다.";
    } catch (error) {
      if (!current(ticket, "member")) return;
      if (error?.code === "23505" || String(error?.message).includes("ONE_DAY_PT_ACTIVE_REQUEST")) {
        $("oneDayPtSubmitMessage").textContent = "이미 진행 중인 신청이 있어요. 아래 신청 내역을 확인해 주세요.";
      } else if (["PGRST202", "42883", "42P01"].includes(error?.code)) {
        $("oneDayPtSubmitMessage").textContent = errorMessage(error, false);
      } else {
        $("oneDayPtSubmitMessage").textContent = "접수 결과를 확인하지 못했어요. 담은 운동은 유지됩니다. 다시 신청하면 같은 요청의 접수 여부부터 확인합니다.";
      }
    } finally {
      if (current(ticket, "member")) { submitting = false; renderCart(); await loadMember(); }
    }
  }
  function renderAdmin() {
    $("adminOneDayPtList").replaceChildren();
    adminRows.forEach(row => {
      const card = requestCard(row), profile = row.profile || {};
      const identity = node("div", "one-day-pt-member");
      identity.append(node("strong", "", profile.display_name || "회원 정보 확인 필요"));
      identity.append(node("p", "", [profile.phone_last4 ? "전화번호 뒤 4자리 " + profile.phone_last4 : "", profile.email || ""].filter(Boolean).join(" · ")));
      card.prepend(identity);
      const controls = node("div", "one-day-pt-status-controls");
      const label = node("label", "", "처리 상태");
      const select = node("select"); select.id = "oneDayPtStatus-" + row.id; label.htmlFor = select.id;
      Object.entries(LABELS).forEach(([value, text]) => { const option = node("option", "", text); option.value = value; select.append(option); });
      select.value = row.status;
      const save = node("button", "", "상태 저장"); save.type = "button";
      select.disabled = adminSaving || adminLoading; save.disabled = adminSaving || adminLoading;
      save.addEventListener("click", () => updateStatus(row, select.value));
      controls.append(label, select, save); card.append(controls); $("adminOneDayPtList").append(card);
    });
    $("moreAdminOneDayPt").hidden = !adminHasMore;
    $("moreAdminOneDayPt").disabled = adminLoading || adminSaving;
    $("refreshAdminOneDayPt").disabled = adminLoading || adminSaving;
    $("adminOneDayPtFilter").disabled = adminSaving;
  }
  async function loadAdmin() {
    if (role !== "admin" || adminSaving) return;
    const ticket = generation, seq = ++adminSequence;
    const filter = $("adminOneDayPtFilter").value;
    adminLoading = true; renderAdmin();
    $("adminOneDayPtMessage").textContent = "1DAY PT 신청을 불러오고 있습니다…";
    try {
      let query = client.from("one_day_pt_requests").select(FIELDS).order("created_at", { ascending: false });
      if (filter === "active") query = query.in("status", ["pending", "contacted"]);
      else if (filter !== "all") query = query.eq("status", filter);
      const { data, error } = await query.range(0, adminLimit);
      if (!current(ticket, "admin") || seq !== adminSequence) return;
      if (error) throw error;
      const rows = data || [], ids = [...new Set(rows.slice(0, adminLimit).map(row => row.user_id))];
      let profiles = [];
      if (ids.length) {
        const result = await client.from("profiles").select("id,display_name,email,phone_last4").in("id", ids);
        if (result.error) throw result.error;
        profiles = result.data || [];
      }
      if (!current(ticket, "admin") || seq !== adminSequence) return;
      const byId = new Map(profiles.map(profile => [profile.id, profile]));
      adminRows = rows.slice(0, adminLimit).map(row => ({ ...row, profile: byId.get(row.user_id) }));
      adminHasMore = rows.length > adminLimit;
      $("adminOneDayPtMessage").textContent = adminRows.length ? "총 " + adminRows.length + "건 표시 중" : "해당 상태의 1DAY PT 신청이 없습니다.";
    } catch (error) {
      if (!current(ticket, "admin") || seq !== adminSequence) return;
      adminRows = []; adminHasMore = false;
      $("adminOneDayPtMessage").textContent = errorMessage(error, true);
    } finally {
      if (current(ticket, "admin") && seq === adminSequence) { adminLoading = false; renderAdmin(); }
    }
  }
  async function updateStatus(row, status) {
    if (role !== "admin" || adminSaving || adminLoading || row.status === status || !LABELS[status]) return;
    if (!window.confirm((row.profile?.display_name || "회원") + "님의 신청을 ‘" + LABELS[status] + "’ 상태로 변경할까요?")) return;
    const ticket = generation;
    adminSaving = true; renderAdmin();
    $("adminOneDayPtMessage").textContent = "상태를 저장하고 있습니다…";
    let resultMessage = "";
    try {
      const { data, error } = await client.from("one_day_pt_requests").update({ status }).eq("id", row.id).eq("status", row.status).select("id,status").maybeSingle();
      if (!current(ticket, "admin")) return;
      if (error) throw error;
      if (!data) { resultMessage = "다른 관리자에 의해 변경됐거나 권한이 없습니다. 현재 목록을 확인해 주세요."; }
      else resultMessage = "신청 상태를 저장했습니다.";
    } catch (error) {
      resultMessage = error?.code === "23505" ? "이 회원에게 다른 진행 중인 신청이 있어 이 상태로 변경할 수 없습니다." : "저장 결과를 확인하지 못했습니다. 현재 상태를 확인한 뒤 다시 시도해 주세요.";
    } finally {
      if (current(ticket, "admin")) {
        adminSaving = false; await loadAdmin();
        if (current(ticket, "admin")) $("adminOneDayPtMessage").textContent += " " + resultMessage;
      }
    }
  }
  function reset() {
    generation++; memberSequence++; adminSequence++;
    clearTimeout(refreshTimer); clearTimeout(feedbackTimer);
    if (channel && client) Promise.resolve(client.removeChannel(channel)).catch(() => {});
    channel = null; role = ""; userId = "";
    cart = []; requestId = ""; memberRows = []; memberReady = false; memberLoading = false; submitting = false;
    adminRows = []; adminLimit = 20; adminHasMore = false; adminLoading = false; adminSaving = false;
    if (dialog.open) dialog.close();
    $("oneDayPtFeedback").hidden = true;
    $("oneDayPtSubmitMessage").textContent = ""; $("oneDayPtHistoryMessage").textContent = "";
    $("oneDayPtHistoryList").replaceChildren(); $("adminOneDayPtList").replaceChildren();
    $("adminOneDayPtMessage").textContent = "";
    renderCart();
  }
  function subscribe() {
    const ticket = generation;
    const options = { event: "*", schema: "public", table: "one_day_pt_requests" };
    if (role === "member") options.filter = "user_id=eq." + userId;
    channel = client.channel("one-day-pt-" + userId + "-" + ticket).on("postgres_changes", options, () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (ticket !== generation || document.hidden) return;
        if (role === "admin") loadAdmin(); else if (role === "member") loadMember();
      }, 300);
    }).subscribe();
  }
  async function showMember(db, id) {
    reset(); client = db; userId = id; role = "member"; restoreCart(); renderCart(); subscribe(); await loadMember();
  }
  async function showAdmin(db, id) {
    reset(); client = db; userId = id || "admin"; role = "admin";
    $("adminOneDayPtFilter").value = "active"; subscribe(); await loadAdmin();
  }
  $("openOneDayPtCart").addEventListener("click", () => {
    if (role !== "member") return;
    renderCart(); if (!dialog.open) dialog.showModal(); loadMember();
  });
  $("closeOneDayPtCart").addEventListener("click", () => dialog.close());
  $("submitOneDayPt").addEventListener("click", submit);
  $("refreshMemberOneDayPt").addEventListener("click", loadMember);
  $("refreshAdminOneDayPt").addEventListener("click", loadAdmin);
  $("adminOneDayPtFilter").addEventListener("change", () => { adminLimit = 20; loadAdmin(); });
  $("moreAdminOneDayPt").addEventListener("click", () => { adminLimit += 20; loadAdmin(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (role === "admin") loadAdmin(); else if (role === "member" && dialog.open) loadMember();
  });
  window.OneDayPT = Object.freeze({ showMember, showAdmin, reset, createAddButton });
})();
