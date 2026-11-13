/* 센터 출석은 저장된 내 기록만 조회합니다. CRM 조회는 관리자 버튼에서만 실행합니다. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const monthCache = new Map();
  const CACHE_MS = 60000;
  const FIRST_DAY = "2026-09-01";
  const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const validDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
  const koreanDate = value => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  };
  const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const stampFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const text = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
  let client = null, userId = "", role = "", sessionEpoch = 0;
  let monthRequest = 0, monthAbort = null, loadingMonth = "", monthError = "";
  let view = { key: "", selected: "" };
  let adminRequest = 0, selectedMember = "", adminContext = null, candidate = null, adminBusy = false;
  let authSubscription = null;

  function memberVisible() {
    const app = $("appScreen"), panel = $("workoutLogTabPanel");
    return Boolean(role === "member" && userId && client && app && !app.hidden && panel && !panel.hidden && document.visibilityState !== "hidden");
  }
  function adminCurrent(epoch, request, member) {
    return role === "admin" && userId && client && sessionEpoch === epoch && adminRequest === request &&
      selectedMember === member && $("adminMemberSelect")?.value === member && !$("adminScreen")?.hidden;
  }
  function reset() {
    window.CenterMemberships?.reset();
    sessionEpoch++; monthRequest++; adminRequest++;
    monthAbort?.abort(); monthAbort = null; loadingMonth = ""; monthError = "";
    client = null; userId = ""; role = ""; monthCache.clear(); view = { key: "", selected: "" };
    selectedMember = ""; adminContext = null; candidate = null; adminBusy = false;
    authSubscription?.unsubscribe(); authSubscription = null;
    if ($("adminAttendancePanel")) $("adminAttendancePanel").hidden = true;
    if ($("centerAttendanceDetails")) $("centerAttendanceDetails").hidden = true;
    $("centerAttendanceDetails")?.replaceChildren();
    text($("adminAttendanceCandidateName"), ""); text($("adminAttendanceStatus"), "");
    if ($("adminAttendanceCandidate")) $("adminAttendanceCandidate").hidden = true;
    if ($("refreshCenterAttendance")) $("refreshCenterAttendance").disabled = false;
    text($("centerAttendanceCount"), "센터 출석"); text($("centerAttendanceStatus"), "");
    decorate(null);
  }
  function start(connection, id, nextRole) {
    reset(); client = connection; userId = String(id || ""); role = nextRole;
    if (role === "member") window.CenterMemberships?.start(connection, userId);
    if (client?.auth?.onAuthStateChange) {
      const result = client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || (session?.user?.id && session.user.id !== userId)) reset();
      });
      authSubscription = result?.data?.subscription || null;
    }
  }
  function decorate(data) {
    const dates = new Set(data?.entries?.map(entry => entry.date) || []);
    document.querySelectorAll("#workoutCalendarDays [data-date]").forEach(button => {
      const day = button.dataset.date;
      const present = dates.has(day);
      button.classList.toggle("has-center-attendance", present);
      const [year, month, date] = day.split("-").map(Number);
      button.setAttribute("aria-label", `${year}년 ${month}월 ${date}일` +
        (button.classList.contains("has-record") ? ", 운동 기록 있음" : "") + (present ? ", 센터 출석 있음" : ""));
    });
  }
  function validateMonth(data, key) {
    if (!data || data.month_start !== key || typeof data.is_linked !== "boolean" ||
        typeof data.collection_enabled !== "boolean" || !validDay(data.initial_from) ||
        !["before_start", "future", "not_linked", "syncing", "ready"].includes(data.month_state) ||
        !Number.isInteger(data.attendance_days) || data.attendance_days < 0 || data.attendance_days > 31 ||
        !Array.isArray(data.entries) || data.entries.length > 2000 || data.visit_count !== data.entries.length ||
        ![data.history_through, data.live_date].every(value => value === null || validDay(value)) ||
        !(data.last_synced_at === null || (typeof data.last_synced_at === "string" && Number.isFinite(Date.parse(data.last_synced_at))))) throw new Error("INVALID_MONTH");
    const entries = data.entries.map(entry => {
      if (!validDay(entry?.date) || entry.date.slice(0, 7) !== key.slice(0, 7) ||
          typeof entry.entered_at !== "string" || !Number.isFinite(Date.parse(entry.entered_at)) ||
          koreanDate(entry.entered_at) !== entry.date) throw new Error("INVALID_ENTRY");
      return { date: entry.date, entered_at: entry.entered_at };
    });
    if (new Set(entries.map(entry => entry.date)).size !== data.attendance_days) throw new Error("INVALID_COUNT");
    return { is_linked: data.is_linked, month_start: key, initial_from: data.initial_from,
      collection_enabled: data.collection_enabled, month_state: data.month_state,
      history_through: data.history_through, live_date: data.live_date, last_synced_at: data.last_synced_at,
      attendance_days: data.attendance_days, visit_count: data.visit_count, entries };
  }
  function renderMonth() {
    const data = monthCache.get(view.key)?.data || null;
    decorate(data);
    const refreshing = loadingMonth === view.key;
    const button = $("refreshCenterAttendance");
    if (button) button.disabled = refreshing || !memberVisible();
    let message = "";
    let count = "센터 출석";
    if (!data) {
      if (view.key && view.key < FIRST_DAY) message = "센터 출석 기록은 2026년 9월 1일부터 표시됩니다.";
      else if (view.key > koreanDate(Date.now()).slice(0, 7) + "-01") message = "센터 출석은 이용 후 표시됩니다.";
      else if (monthError) message = "센터 출석을 불러오지 못했어요. 다시 확인해 주세요.";
      else if (refreshing) count = "센터 출석 확인 중";
    } else if (data.month_state === "not_linked") {
      count = "센터 출석 연결 전";
      message = "센터 출석은 앱 가입 후 1시간 정도 후에 표시됩니다.";
    } else if (data.month_state === "before_start") {
      message = "센터 출석 기록은 2026년 9월 1일부터 표시됩니다.";
    } else if (data.month_state === "future") {
      message = "센터 출석은 이용 후 표시됩니다.";
    } else {
      count = `이번달 출석 ${data.attendance_days}일`;
      message = data.month_state === "syncing"
        ? ""
        : data.last_synced_at ? "최근 확인: " + stampFormat.format(new Date(data.last_synced_at)) : "날짜를 누르면 입장 시간을 볼 수 있어요.";
      if (monthError) message = "새로 불러오지 못해 이전에 확인한 출석을 표시하고 있어요.";
    }
    text($("centerAttendanceCount"), count);
    text($("centerAttendanceStatus"), message);
    const details = $("centerAttendanceDetails");
    if (!details) return;
    details.hidden = !view.selected;
    details.replaceChildren();
    if (!view.selected) return;
    const heading = document.createElement("strong");
    const [, month, day] = view.selected.split("-").map(Number);
    heading.textContent = `${month}월 ${day}일 센터 입장`;
    details.append(heading);
    const times = data?.entries.filter(entry => entry.date === view.selected) || [];
    const body = document.createElement("span");
    if (times.length) body.textContent = times.map(entry => timeFormat.format(new Date(entry.entered_at))).join(" · ");
    else if (view.selected < (data?.initial_from || FIRST_DAY)) body.textContent = "출석 기록 제공 시작일 이전이에요.";
    else if (view.selected > koreanDate(Date.now())) body.textContent = "이용 후 출석 기록이 표시됩니다.";
    else if (!data || monthError) body.textContent = refreshing ? "출석을 확인하고 있어요." : "출석을 다시 확인해 주세요.";
    else if (!data.is_linked) body.textContent = "출석정보를 확인 중입니다.";
    else if ((data.history_through && view.selected <= data.history_through) ||
        (view.selected === data.live_date && data.last_synced_at)) body.textContent = "확인된 센터 출석 기록이 없어요.";
    else body.textContent = "이 날짜의 출석 기록은 아직 확인 중이에요.";
    details.append(body);
  }
  async function loadMonth(force = false) {
    if (!memberVisible() || !view.key) return;
    const key = view.key;
    if (key < FIRST_DAY || key > koreanDate(Date.now()).slice(0, 7) + "-01") { renderMonth(); return; }
    const cached = monthCache.get(key);
    if ((!force && cached && Date.now() - cached.at < CACHE_MS) || loadingMonth === key) { renderMonth(); return; }
    monthAbort?.abort();
    const controller = new AbortController(); monthAbort = controller;
    const request = ++monthRequest, epoch = sessionEpoch, owner = userId;
    loadingMonth = key; monthError = ""; renderMonth();
    try {
      let query = client.rpc("broj_my_attendance", { p_month: key });
      if (typeof query.abortSignal === "function") query = query.abortSignal(controller.signal);
      const { data, error } = await query;
      if (epoch !== sessionEpoch || request !== monthRequest || owner !== userId || view.key !== key) return;
      if (error) throw error;
      const prepared = validateMonth(data, key);
      monthCache.delete(key); monthCache.set(key, { data: prepared, at: Date.now() });
      while (monthCache.size > 12) monthCache.delete(monthCache.keys().next().value);
    } catch {
      if (epoch !== sessionEpoch || request !== monthRequest || owner !== userId || view.key !== key) return;
      monthError = "LOAD_FAILED";
    } finally {
      if (epoch === sessionEpoch && request === monthRequest) {
        loadingMonth = ""; monthAbort = null; renderMonth();
      }
    }
  }
  function onCalendar(year, monthIndex, selected) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return;
    const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    if (view.key !== key) { monthRequest++; monthAbort?.abort(); monthAbort = null; loadingMonth = ""; monthError = ""; }
    view = { key, selected: validDay(selected) && selected.slice(0, 7) === key.slice(0, 7) ? selected : "" };
    renderMonth(); void loadMonth(); void window.CenterMemberships?.load();
  }

  function showAdminMessage(message, state = "") {
    text($("adminAttendanceStatus"), message);
    if ($("adminAttendancePanel")) $("adminAttendancePanel").dataset.state = state;
  }
  function renderAdminContext() {
    const panel = $("adminAttendancePanel"), button = $("adminAttendanceLookup");
    if (!panel || !button) return;
    panel.hidden = !selectedMember || role !== "admin";
    $("adminAttendanceCandidate").hidden = !candidate;
    $("adminAttendanceConfirm").disabled = adminBusy || !candidate;
    text($("adminAttendanceCandidateName"), candidate ? `${candidate.name} · 전화번호 끝 ${candidate.phone_last4}` : "");
    const member = adminContext?.member;
    const linked = Boolean(adminContext?.link);
    button.textContent = !member || linked ? "연결 상태 새로고침" : "브로제이 회원 조회";
    button.disabled = adminBusy || !selectedMember || (member && !linked && member.identity_ready !== true);
  }
  async function selectAdminMember(id, force = false) {
    const member = String(id || "");
    if (!force && member === selectedMember && adminContext) return;
    const request = ++adminRequest, epoch = sessionEpoch;
    selectedMember = member; adminContext = null; candidate = null; adminBusy = false;
    renderAdminContext();
    if (!uuid(member) || role !== "admin" || !client || $("adminScreen")?.hidden) return;
    adminBusy = true; renderAdminContext(); showAdminMessage("센터 출석 연결 상태를 확인하고 있어요.");
    try {
      const { data, error } = await client.rpc("broj_admin_member_context", { p_user_id: member });
      if (!adminCurrent(epoch, request, member)) return;
      if (error || data?.member?.user_id !== member || typeof data.member.display_name !== "string" ||
          typeof data.member.identity_ready !== "boolean") throw new Error("INVALID_CONTEXT");
      if (data.link !== null && (typeof data.link?.crm_member_id !== "string" || !data.link.crm_member_id.trim())) throw new Error("INVALID_LINK");
      adminContext = data;
      window.AdminMemberPicker?.setLink(member, data.link !== null);
      if (data.link) {
        window.AdminMemberAlerts?.linked(member);
        const stamp = data.link.last_synced_at && Number.isFinite(Date.parse(data.link.last_synced_at))
          ? " 최근 출석 확인: " + stampFormat.format(new Date(data.link.last_synced_at)) : " 출석 기록 연결을 준비 중이에요.";
        showAdminMessage("센터 회원 연결 완료." + stamp, "linked");
      } else if (!data.member.identity_ready) showAdminMessage("앱 회원의 이름과 전화번호 끝 4자리를 먼저 확인해 주세요.");
      else showAdminMessage("회원 조회 후 이름과 전화번호 끝 4자리를 확인하고 연결해 주세요.");
    } catch {
      if (adminCurrent(epoch, request, member)) showAdminMessage("연결 상태를 확인하지 못했어요. 회원을 다시 선택해 주세요.");
    } finally {
      if (adminCurrent(epoch, request, member)) { adminBusy = false; renderAdminContext(); }
    }
  }
  async function lookup() {
    if (adminBusy || role !== "admin") return;
    const member = selectedMember;
    if (!adminContext) { await selectAdminMember(member, true); return; }
    if (adminContext.link) { await selectAdminMember(member, true); return; }
    if (!adminContext.member.identity_ready) return;
    const epoch = sessionEpoch, request = ++adminRequest;
    const profile = { ...adminContext.member };
    candidate = null; adminBusy = true; renderAdminContext(); showAdminMessage("센터 회원을 조회하고 있어요.");
    try {
      const { data, error } = await client.functions.invoke("broj-member-lookup", { body: { user_id: member } });
      if (!adminCurrent(epoch, request, member)) return;
      let code = data?.code;
      if (error && error.context?.clone) { try { code = (await error.context.clone().json()).code; } catch {} }
      if (!adminCurrent(epoch, request, member)) return;
      if (code === "already_linked" && data?.ok) { adminBusy = false; await selectAdminMember(member, true); return; }
      if (error || data?.ok !== true) {
        showAdminMessage(code === "API_BUDGET_REACHED" ? "현재 조회가 많아요. 잠시 후 다시 확인해 주세요." : "센터 회원을 조회하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (data.member?.user_id !== member || data.member.display_name !== profile.display_name ||
          data.member.phone_last4 !== profile.phone_last4) {
        showAdminMessage("회원 정보가 변경됐어요. 회원을 다시 선택해 주세요."); return;
      }
      if (data.code === "ambiguous") { showAdminMessage("같은 이름과 끝 번호의 센터 회원이 여러 명이에요. CRM에서 회원 정보를 먼저 확인해 주세요."); return; }
      if (data.code === "no_match") { showAdminMessage("일치하는 센터 회원을 찾지 못했어요. 앱과 CRM의 이름·끝 번호를 확인해 주세요."); return; }
      const found = data.candidates;
      if (data.code !== "match_found" || data.can_confirm !== true || data.search_complete !== true ||
          !Array.isArray(found) || found.length !== 1 || typeof found[0]?.crm_member_id !== "string" ||
          !found[0].crm_member_id.trim() || found[0].crm_member_id.length > 500 ||
          typeof found[0].name !== "string" || found[0].phone_last4 !== profile.phone_last4) throw new Error("INVALID_CANDIDATE");
      candidate = { crm_member_id: found[0].crm_member_id, name: found[0].name, phone_last4: found[0].phone_last4,
        expected_name: profile.display_name, expected_last4: profile.phone_last4 };
      showAdminMessage("아래 센터 회원이 선택한 앱 회원과 같은 분인지 확인해 주세요.");
    } catch {
      if (adminCurrent(epoch, request, member)) showAdminMessage("센터 회원을 조회하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      if (adminCurrent(epoch, request, member)) { adminBusy = false; renderAdminContext(); }
    }
  }
  async function confirmLink() {
    if (adminBusy || !candidate || !adminContext || role !== "admin" || adminContext.link) return;
    const member = selectedMember, preview = { ...candidate }, epoch = sessionEpoch, request = ++adminRequest;
    if (!adminCurrent(epoch, request, member)) return;
    adminBusy = true; renderAdminContext(); showAdminMessage("회원 연결을 저장하고 있어요.");
    try {
      const { data, error } = await client.rpc("broj_confirm_member_link", { p_user_id: member,
        p_crm_member_id: preview.crm_member_id, p_expected_name: preview.expected_name, p_expected_last4: preview.expected_last4 });
      if (!adminCurrent(epoch, request, member)) return;
      candidate = null;
      if (!error && data?.ok === true && ["linked", "already_linked"].includes(data.code)) {
        window.AdminMemberPicker?.setLink(member, true);
        window.AdminMemberAlerts?.linked(member);
        adminBusy = false;
        window.AdminWorkspace?.memberLinked(member);
        // The request workspace may have released this completed selection.
        // Do not restore its CRM context after the empty-selection handler ran.
        if (!adminCurrent(epoch, request, member)) return;
        await selectAdminMember(member, true); return;
      }
      if (data?.code === "profile_changed" || data?.code === "identity_not_ready") {
        adminContext = null; showAdminMessage("회원 정보가 바뀌었어요. 회원을 다시 선택해 주세요.");
      } else if (data?.code === "link_conflict") showAdminMessage("다른 회원과 연결된 정보가 있어요. CRM과 기존 연결을 먼저 확인해 주세요.");
      else showAdminMessage("연결을 확인하지 못했어요. 연결 상태를 다시 확인해 주세요.");
    } catch {
      if (adminCurrent(epoch, request, member)) { candidate = null; showAdminMessage("연결을 확인하지 못했어요. 회원을 다시 선택해 주세요."); }
    } finally {
      if (adminCurrent(epoch, request, member)) { adminBusy = false; renderAdminContext(); }
    }
  }

  $("refreshCenterAttendance")?.addEventListener("click", () => { void loadMonth(true); void window.CenterMemberships?.load(true); });
  $("adminAttendanceLookup")?.addEventListener("click", () => { void lookup(); });
  $("adminAttendanceConfirm")?.addEventListener("click", () => { void confirmLink(); });
  $("adminMemberSelect")?.addEventListener("attendance-status-change", () => {
    if (role !== "admin" || !adminContext || adminBusy || candidate || !selectedMember || $("adminScreen")?.hidden) return;
    const linked = window.AdminMemberPicker?.linkState(selectedMember);
    if (typeof linked === "boolean" && linked !== Boolean(adminContext.link)) void selectAdminMember(selectedMember, true);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { void loadMonth(); void window.CenterMemberships?.load(); } });
  window.CenterAttendance = Object.freeze({ reset,
    startMember: (connection, id) => start(connection, id, "member"),
    startAdmin: (connection, id) => start(connection, id, "admin"),
    onCalendar, onTab: () => {
      if (!memberVisible()) { monthRequest++; monthAbort?.abort(); monthAbort = null; loadingMonth = ""; }
      renderMonth(); void loadMonth(); void window.CenterMemberships?.load();
    }, selectAdminMember, isAdminBusy: () => role === "admin" && adminBusy });
})();
