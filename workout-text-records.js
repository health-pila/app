/* 사진 없는 기록도 기존 workout_records와 본인 RLS를 사용합니다. */
(() => {
  "use strict";
  const app = document.getElementById("appScreen"), tab = document.getElementById("workoutLogTabPanel");
  const trigger = document.getElementById("openWorkoutTextButton");
  if (!app || !tab || !trigger) return;
  const template = "근력운동 시간: \n유산소운동 시간: \n필라테스 시간: ";
  const dialog = document.createElement("dialog");
  dialog.id = "workoutTextDialog"; dialog.className = "workout-text-dialog";
  dialog.setAttribute("aria-labelledby", "workoutTextTitle");
  dialog.innerHTML = `<form><div class="workout-text-heading"><h2 id="workoutTextTitle">기록만 입력하기</h2><button type="button" data-text-close>닫기</button></div>
    <label for="workoutTextBody">운동 기록</label>
    <textarea id="workoutTextBody" name="body" rows="6" maxlength="120" required aria-describedby="workoutTextHelp"></textarea>
    <p id="workoutTextHelp">시간과 오늘의 운동을 자유롭게 적어 주세요. 미리 적힌 문구도 지울 수 있어요.</p>
    <p data-text-status role="status"></p><button type="button" data-text-check hidden>저장 상태 다시 확인</button>
    <button type="submit" class="workout-text-save">기록 저장</button></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form"), input = form.elements.body;
  const closeButton = dialog.querySelector("[data-text-close]"), saveButton = dialog.querySelector(".workout-text-save");
  const checkButton = dialog.querySelector("[data-text-check]"), status = dialog.querySelector("[data-text-status]");
  let client = null, owner = "", generation = 0, onSaved = null, draft = null, busy = false, previousOverflow = null;
  const current = (token, userId) => token === generation && owner === userId && !app.hidden;
  function setBusy(value) {
    busy = value; saveButton.disabled = value || Boolean(draft?.saved) || Boolean(draft?.uncertain);
    input.readOnly = value || Boolean(draft?.saved) || Boolean(draft?.uncertain);
    closeButton.disabled = value; checkButton.disabled = value;
  }
  function close(restoreFocus = true) {
    if (dialog.open) dialog.close();
    if (previousOverflow !== null) document.body.style.overflow = previousOverflow;
    previousOverflow = null; draft = null; input.value = ""; status.textContent = "";
    checkButton.hidden = true; setBusy(false);
    if (restoreFocus && trigger.isConnected && !app.hidden && !tab.hidden) trigger.focus({ preventScroll: true });
  }
  function reset() {
    generation++; close(false); client = null; owner = ""; onSaved = null; trigger.disabled = true;
  }
  function start(nextClient, userId, afterSave) {
    reset(); client = nextClient; owner = String(userId); onSaved = afterSave; trigger.disabled = false;
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
    const body = input.value.trim();
    if (!body || body.length > 120) { status.textContent = "운동 기록을 1 ~ 120자로 입력해 주세요."; return; }
    const state = draft, token = state.token, userId = state.owner;
    const payload = { user_id: userId, photo_path: null, caption: body, taken_at: state.takenAt };
    setBusy(true); status.textContent = "운동 기록을 저장하고 있어요."; checkButton.hidden = true;
    let sent = false;
    try {
      const { data, error: authError } = await client.auth.getUser();
      if (!current(token, userId) || draft !== state) return;
      if (authError || data?.user?.id !== userId) throw new Error("로그인 정보를 확인한 뒤 다시 시도해 주세요.");
      state.payload = payload; sent = true;
      const { data: saved, error } = await client.from("workout_records").insert(payload)
        .select("id, photo_path, caption, taken_at, user_id").single();
      if (!current(token, userId) || draft !== state) return;
      if (error) {
        // 서버가 거절한 요청은 수정 후 다시 저장할 수 있습니다.
        if (error.code && /^\d{5}$/.test(error.code)) sent = false;
        throw error;
      }
      if (saved?.id == null || saved.user_id !== userId || saved.photo_path !== null ||
        saved.caption !== body || Date.parse(saved.taken_at) !== Date.parse(state.takenAt)) throw new Error("INVALID_SAVE_RESPONSE");
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
        .select("id, photo_path, caption, taken_at, user_id").eq("user_id", userId).eq("taken_at", state.takenAt).is("photo_path", null);
      if (!current(token, userId) || draft !== state) return;
      if (error || !Array.isArray(rows)) throw error || new Error("INVALID_RESPONSE");
      if (rows.length === 1 && rows[0].user_id === userId && rows[0].caption === state.payload.caption) await finish(rows[0], token, userId);
      else status.textContent = rows.length ? "저장 상태를 확실히 확인하지 못했어요. 창을 닫고 운동 기록을 확인해 주세요."
        : "아직 저장된 기록을 찾지 못했어요. 잠시 후 다시 확인해 주세요. 입력한 내용은 복사할 수 있어요.";
    } catch (_) {
      if (current(token, userId) && draft === state) status.textContent = "저장 상태를 확인하지 못했어요. 연결을 확인하고 다시 눌러 주세요.";
    } finally { if (current(token, userId) && draft === state) setBusy(false); }
  });
  trigger.addEventListener("click", () => {
    if (!client || !owner || app.hidden || tab.hidden || dialog.open) return;
    draft = { token: generation, owner, takenAt: new Date().toISOString(), saved: false, uncertain: false };
    input.value = template; status.textContent = ""; checkButton.hidden = true; setBusy(false);
    previousOverflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = "hidden";
    input.focus({ preventScroll: true }); input.setSelectionRange(template.indexOf("\n"), template.indexOf("\n"));
  });
  closeButton.addEventListener("click", () => close());
  dialog.addEventListener("cancel", event => { event.preventDefault(); if (!busy) close(); });
  form.addEventListener("submit", submit);
  new MutationObserver(() => { if (app.hidden) reset(); else if (tab.hidden) close(false); })
    .observe(app, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
  window.addEventListener("pagehide", () => close(false));
  window.WorkoutTextRecords = Object.freeze({ start, reset });
})();
