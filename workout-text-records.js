/* 사진 없는 기록도 기존 workout_records와 본인 RLS를 사용합니다. */
(() => {
  "use strict";
  const app = document.getElementById("appScreen"), tab = document.getElementById("workoutLogTabPanel");
  const trigger = document.getElementById("openWorkoutTextButton");
  const dates = window.WorkoutRecordDates;
  if (!app || !tab || !trigger || !dates) return;
  const template = "근력운동 시간: \n유산소운동 시간: \n필라테스 시간: ";
  const dialog = document.createElement("dialog");
  dialog.id = "workoutTextDialog"; dialog.className = "workout-text-dialog";
  dialog.setAttribute("aria-labelledby", "workoutTextTitle");
  dialog.innerHTML = `<form><div class="workout-text-heading"><h2 id="workoutTextTitle">운동 시간∙세트 기록하기</h2><button type="button" data-text-close>닫기</button></div>
    <div class="workout-record-date-field"><label for="workoutTextDay">운동 날짜</label><input id="workoutTextDay" name="day" type="date" required></div>
    <div class="workout-text-tools"><label for="workoutTextBody">운동 기록</label><button type="submit" class="workout-text-save">기록 저장</button></div>
    <textarea id="workoutTextBody" name="body" rows="6" maxlength="120" aria-describedby="workoutTextHelp"></textarea>
    <p id="workoutTextHelp">시간을 적거나 아래에서 세트 기록을 입력해 주세요. 시간 없이 세트 기록만 저장할 수도 있어요.</p>
    <div data-set-editors></div><button type="button" data-add-sets>세트 기록 입력</button>
    <p data-text-status role="status"></p><button type="button" data-text-check hidden>저장 상태 다시 확인</button></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form"), input = form.elements.body;
  const dateInput = form.elements.day;
  const editors = window.WorkoutSetRecords.editor(dialog.querySelector('[data-set-editors]'));
  const addSets = dialog.querySelector('[data-add-sets]');
  function syncAddLabel() { addSets.textContent = dialog.querySelector('[data-set-editors]').children.length ? '운동 추가' : '세트 기록 입력'; }
  addSets.addEventListener('click', () => {
    if (busy || draft?.saved || draft?.uncertain) return;
    const name = editors.add(); syncAddLabel();
    if (name) name.focus(); else status.textContent = '한 기록에 운동을 최대 10개까지 추가할 수 있어요.';
  });
  dialog.querySelector('[data-set-editors]').addEventListener('click', () => queueMicrotask(syncAddLabel));
  const closeButton = dialog.querySelector("[data-text-close]"), saveButton = dialog.querySelector(".workout-text-save");
  const checkButton = dialog.querySelector("[data-text-check]"), status = dialog.querySelector("[data-text-status]");
  let client = null, owner = "", generation = 0, onSaved = null, draft = null, busy = false, previousOverflow = null;
  let getSelectedDate = () => "";
  const current = (token, userId) => token === generation && owner === userId && !app.hidden;
  // 이 입력창만 키보드를 제외한 실제 표시 영역 안에 맞춥니다.
  function syncDialogViewport() {
    if (!dialog.open) return;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const top = viewport?.offsetTop || 0;
    dialog.style.setProperty("--workout-text-max-height", `${Math.max(0, height - 24)}px`);
    dialog.style.setProperty("--workout-text-center", `${top + height / 2}px`);
  }
  function setBusy(value) {
    busy = value; saveButton.disabled = value || Boolean(draft?.saved) || Boolean(draft?.uncertain);
    input.readOnly = value || Boolean(draft?.saved) || Boolean(draft?.uncertain);
    dateInput.disabled = value || Boolean(draft?.saved) || Boolean(draft?.uncertain);
    closeButton.disabled = value; checkButton.disabled = value;
    const locked = value || Boolean(draft?.saved) || Boolean(draft?.uncertain);
    addSets.disabled = locked;
    dialog.querySelectorAll('[data-set-editors] input, [data-set-editors] textarea, [data-set-editors] button').forEach(e => e.disabled = locked);
  }
  function close(restoreFocus = true) {
    if (dialog.open) dialog.close();
    if (previousOverflow !== null) document.body.style.overflow = previousOverflow;
    previousOverflow = null; editors.clear(); syncAddLabel(); draft = null; input.value = ""; dateInput.value = ""; dateInput.setCustomValidity(""); status.textContent = "";
    checkButton.hidden = true; setBusy(false);
    if (restoreFocus && trigger.isConnected && !app.hidden && !tab.hidden) trigger.focus({ preventScroll: true });
  }
  function reset() {
    generation++; close(false); client = null; owner = ""; onSaved = null; getSelectedDate = () => ""; trigger.disabled = true;
  }
  function start(nextClient, userId, afterSave, selectedDate = () => "") {
    reset(); client = nextClient; owner = String(userId); onSaved = afterSave; trigger.disabled = false;
    getSelectedDate = selectedDate;
  }
  async function finish(record, token, userId) {
    if (!current(token, userId) || !draft) return;
    draft.saved = true; draft.uncertain = false; checkButton.hidden = true;
    let listed = false;
    try { listed = await onSaved?.(record); } catch (_) {}
    if (!current(token, userId) || !draft) return;
    if (listed) close();
    else { status.textContent = "기록은 저장됐지만 목록을 불러오지 못했어요. 창을 닫고 상단 새로고침 버튼으로 확인해 주세요."; setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !draft || draft.saved || draft.uncertain || !current(draft.token, draft.owner)) return;
    const entered = input.value.trim();
    let sets;
    try { sets = editors.read(); } catch (error) { status.textContent = error.message; return; }
    const memo = entered === template.trim() ? '' : entered;
    if ((!memo && !sets) || memo.length > 120) { status.textContent = '운동 시간이나 세트 기록을 입력해 주세요. 메모는 120자까지 작성할 수 있어요.'; return; }
    const body = memo || '세트별 운동 기록';
    const state = draft, token = state.token, userId = state.owner;
    const takenAt = dates.read(dateInput, state.openedAt);
    if (!takenAt) return;
    state.takenAt = takenAt.toISOString();
    const payload = { user_id: userId, photo_path: null, caption: body, taken_at: state.takenAt, set_records: sets };
    setBusy(true); status.textContent = "운동 기록을 저장하고 있어요."; checkButton.hidden = true;
    let sent = false;
    try {
      const { data, error: authError } = await client.auth.getUser();
      if (!current(token, userId) || draft !== state) return;
      if (authError || data?.user?.id !== userId) throw new Error("로그인 정보를 확인한 뒤 다시 시도해 주세요.");
      state.payload = payload; sent = true;
      const request = state.recordId != null
        ? client.from('workout_records').update(payload).eq('id', state.recordId).eq('user_id', userId)
        : client.from('workout_records').insert(payload);
      const { data: saved, error } = await request
        .select('id, photo_path, caption, taken_at, created_at, user_id, set_records').single();
      if (!current(token, userId) || draft !== state) return;
      if (error) {
        // 서버가 거절한 요청은 수정 후 다시 저장할 수 있습니다.
        if (error.code && /^\d{5}$/.test(error.code)) sent = false;
        throw error;
      }
      if (saved?.id == null || saved.user_id !== userId || saved.photo_path !== null ||
        saved.caption !== body || JSON.stringify(window.WorkoutSetRecords.clean(saved.set_records)) !== JSON.stringify(sets) ||
        (state.recordId != null && String(saved.id) !== String(state.recordId)) || Date.parse(saved.taken_at) !== Date.parse(state.takenAt)) throw new Error("INVALID_SAVE_RESPONSE");
      await finish(saved, token, userId);
    } catch (error) {
      if (!current(token, userId) || draft !== state) return;
      state.uncertain = sent;
      checkButton.hidden = !sent;
      status.textContent = sent
        ? "저장 완료를 확인하지 못했어요. 중복 저장을 막기 위해 저장 상태를 먼저 확인해 주세요."
        : "저장하지 못했어요. 입력한 내용은 유지됩니다. 연결과 로그인 상태를 확인한 뒤 다시 시도해 주세요.";
    } finally { if (current(token, userId) && draft === state) setBusy(false); }
  }
  checkButton.addEventListener("click", async () => {
    if (busy || !draft?.uncertain) return;
    const state = draft, token = state.token, userId = state.owner;
    setBusy(true);
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!current(token, userId) || draft !== state) return;
      if (authError || auth?.user?.id !== userId) throw new Error("LOGIN_REQUIRED");
      const { data: rows, error } = await client.from("workout_records")
        .select("id, photo_path, caption, taken_at, created_at, user_id, set_records").eq("user_id", userId).eq("taken_at", state.takenAt).is("photo_path", null);
      if (!current(token, userId) || draft !== state) return;
      if (error || !Array.isArray(rows)) throw error || new Error("INVALID_RESPONSE");
      const matches = rows.filter(row => row.user_id === userId && row.caption === state.payload.caption &&
        (state.recordId == null || String(row.id) === String(state.recordId)) &&
        JSON.stringify(window.WorkoutSetRecords.clean(row.set_records)) === JSON.stringify(state.payload.set_records));
      if (matches.length === 1) await finish(matches[0], token, userId);
      else status.textContent = rows.length ? "저장 상태를 확실히 확인하지 못했어요. 창을 닫고 운동 기록을 확인해 주세요."
        : "아직 저장된 기록을 찾지 못했어요. 잠시 후 다시 확인해 주세요. 입력한 내용은 복사할 수 있어요.";
    } catch (_) {
      if (current(token, userId) && draft === state) status.textContent = "저장 상태를 확인하지 못했어요. 연결을 확인하고 다시 눌러 주세요.";
    } finally { if (current(token, userId) && draft === state) setBusy(false); }
  });
  function openRecord(record = null) {
    if (!client || !owner || app.hidden || tab.hidden || dialog.open) return;
    const openedAt = new Date().toISOString();
    draft = { token: generation, owner, openedAt, recordId: record?.id ?? null, takenAt: openedAt, saved: false, uncertain: false };
    editors.load(record?.set_records); syncAddLabel();
    dates.prepare(dateInput, record ? dates.dayKey(record.taken_at) : getSelectedDate());
    input.value = record ? (record.caption || '') : template; status.textContent = ""; checkButton.hidden = true; setBusy(false);
    previousOverflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = "hidden"; syncDialogViewport();
    input.focus({ preventScroll: true }); input.setSelectionRange(template.indexOf("\n"), template.indexOf("\n"));
  }
  trigger.addEventListener('click', () => openRecord());
  function edit(record) {
    if (!record || record.photo_path !== null || !window.WorkoutSetRecords.has(record)) return;
    openRecord(record);
  }
  closeButton.addEventListener("click", () => close());
  dateInput.addEventListener("input", () => dateInput.setCustomValidity(""));
  dialog.addEventListener("cancel", event => { event.preventDefault(); if (!busy) close(); });
  form.addEventListener("submit", submit);
  new MutationObserver(() => { if (app.hidden) reset(); else if (tab.hidden) close(false); })
    .observe(app, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
  window.addEventListener("pagehide", () => close(false));
  window.addEventListener("resize", syncDialogViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", syncDialogViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", syncDialogViewport, { passive: true });
  window.WorkoutTextRecords = Object.freeze({ start, reset, edit });
})();

