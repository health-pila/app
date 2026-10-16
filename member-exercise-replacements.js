/* 원본 루틴을 변경하지 않고 회원별·배정 버전별 교체 설정을 적용합니다. */
(() => {
  "use strict";
  const app = document.getElementById("appScreen");
  const assigned = document.getElementById("memberAssignedRoutinePanel");
  const routinePanel = document.getElementById("routineTabPanel");
  if (!app || !assigned || !routinePanel) return;
  const notice = document.createElement("div");
  notice.className = "exercise-replacement-notice"; notice.hidden = true;
  const noticeText = document.createElement("p"); noticeText.setAttribute("role", "status");
  const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "다시 불러오기"; retry.hidden = true;
  notice.append(noticeText, retry);
  document.getElementById("memberWorkoutTitle").parentElement.insertAdjacentElement("afterend", notice);
  const dialog = document.createElement("dialog");
  dialog.id = "exerciseReplacementDialog"; dialog.className = "exercise-replacement-dialog";
  dialog.setAttribute("aria-labelledby", "exerciseReplacementTitle");
  dialog.innerHTML = `<div class="exercise-replacement-heading"><h2 id="exerciseReplacementTitle">종목변경</h2><button type="button" data-replace-close>닫기</button></div>
    <div class="exercise-replacement-content">
      <p class="exercise-replacement-safety">운동 경험과 몸 상태에 맞는 종목을 선택해 주세요.</p>
      <p class="exercise-replacement-current"></p>
      <div data-replace-choices><h3>추천 대체 운동</h3><div data-replace-recommended class="exercise-replacement-list"></div>
        <details class="exercise-replacement-all"><summary>전체 운동에서 선택</summary>
          <label for="replacementSearch">운동명 검색</label><input id="replacementSearch" type="search" maxlength="100" placeholder="운동 이름을 입력해 주세요">
          <label for="replacementBodyPart">운동 부위</label><select id="replacementBodyPart"><option value="">전체 부위</option></select>
          <p data-replace-count class="exercise-replacement-help" role="status"></p><div data-replace-all-list class="exercise-replacement-list"></div>
        </details>
      </div>
      <form data-replace-confirm hidden>
        <button type="button" data-replace-back>← 다른 운동 선택</button>
        <h3 data-replace-target></h3><p data-replace-meta class="exercise-replacement-help"></p>
        <p data-replace-dose-help class="exercise-replacement-help"></p>
        <div class="exercise-replacement-dose-fields">
          <label>세트<input name="sets" type="number" min="1" max="20" step="1" required inputmode="numeric"></label>
          <label>세트당 횟수<input name="reps" type="number" min="1" max="1000" step="1" required inputmode="numeric"></label>
          <label>휴식(초)<input name="rest" type="number" min="0" max="3600" step="1" required inputmode="numeric"></label>
        </div>
        <button type="submit" data-replace-save class="exercise-replacement-save">확인하고 저장</button>
      </form>
      <p data-replace-status class="exercise-replacement-status" role="status"></p>
      <button type="button" data-replace-check hidden>저장 상태 다시 확인</button>
    </div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const choices = $("[data-replace-choices]"), recommended = $("[data-replace-recommended]");
  const allList = $("[data-replace-all-list]"), search = $("#replacementSearch"), bodyPart = $("#replacementBodyPart");
  const form = $("[data-replace-confirm]"), fields = $(".exercise-replacement-dose-fields");
  const closeButton = $("[data-replace-close]");
  const status = $("[data-replace-status]"), checkButton = $("[data-replace-check]");
  let client = null, userId = "", generation = 0, active = null, view = null, busy = false, reload = null;
  let returnFocus = null, previousOverflow = null, returnScroll = null, historyToken = "", historyPending = false;
  const historyKey = "memberExerciseReplacement";
  const slotKey = (day, order) => `${day}:${order}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  function element(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function current(context, token = generation) {
    return token === generation && context?.userId === userId && context?.key === active?.key && !app.hidden;
  }
  function visible() { return !app.hidden && !assigned.hidden && !routinePanel.hidden; }
  function showNotice(text, error = false) {
    noticeText.textContent = text; notice.hidden = !text;
    retry.hidden = !error;
    notice.classList.toggle("is-error", error);
  }
  function errorMessage(error) {
    const message = String(error?.message || "");
    if (message.includes("ROUTINE_CHANGED")) return "새 운동 루틴이 배정됐어요. 다시 불러온 뒤 변경해 주세요.";
    if (message.includes("REPLACEMENT_CONFLICT")) return "다른 기기에서 이 운동을 변경했어요. 저장 상태를 다시 확인한 뒤 선택해 주세요.";
    if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error?.code)) return "운동 교체 저장소 설정이 필요해요. 현재는 원본 루틴을 표시합니다.";
    if (error?.code === "42501" || message.includes("LOGIN_REQUIRED")) return "로그인 상태와 본인의 루틴인지 확인한 뒤 다시 시도해 주세요.";
    if (error?.code === "22023") return "운동과 세트·횟수·휴식시간을 확인해 주세요.";
    return "개인 변경 내용을 확인하지 못했어요. 연결을 확인하고 다시 불러와 주세요.";
  }
  async function prepare(data, id) {
    const token = generation;
    const base = window.RoutineComponents.parseRoutineJson(JSON.stringify(data.routine_json));
    const context = { userId: String(id), routineId: String(data.id), source: base, effective: clone(base), revision: "", rows: new Map(), ready: false, warning: "" };
    try {
      if (!client || String(id) !== userId) throw new Error("LOGIN_REQUIRED");
      const { data: result, error } = await client.rpc("get_member_exercise_replacements", { p_routine_id: String(data.id) });
      if (error) throw error;
      if (token !== generation || userId !== String(id)) return null;
      if (!result?.revision || String(result.routine_id) !== String(data.id) || !Array.isArray(result.replacements)) throw new Error("INVALID_RESPONSE");
      context.source = window.RoutineComponents.parseRoutineJson(JSON.stringify(result.source_json));
      context.effective = clone(context.source); context.revision = result.revision; context.ready = true;
      result.replacements.forEach(row => {
        if (row.user_id !== userId || String(row.routine_id) !== context.routineId || row.routine_revision !== context.revision) return;
        const day = context.effective.days.find(day => day.day === row.pattern_day);
        const entry = day?.exercises.find(entry => entry.order === row.exercise_order);
        if (!entry || entry.exerciseId !== row.original_exercise_id) return;
        const exercise = window.ExerciseDB.getExerciseById(row.replacement_exercise_id);
        const valid = exercise?.enabled && row.replacement_exercise_id !== entry.exerciseId && row.change_token &&
          Number.isInteger(row.sets) && row.sets >= 1 && row.sets <= 20 &&
          Number.isInteger(row.reps) && row.reps >= 1 && row.reps <= 1000 &&
          Number.isInteger(row.rest_sec) && row.rest_sec >= 0 && row.rest_sec <= 3600;
        context.rows.set(slotKey(row.pattern_day, row.exercise_order), { ...row, valid: Boolean(valid) });
        if (valid) Object.assign(entry, { exerciseId: row.replacement_exercise_id, sets: row.sets, reps: row.reps, restSec: row.rest_sec });
        else context.warning = "사용할 수 없는 운동의 변경 설정이 있어요. 원본을 표시한 블록은 복원하거나 다시 선택해 주세요.";
      });
    } catch (error) {
      if (token !== generation || userId !== String(id)) return null;
      context.warning = errorMessage(error);
      if (!context.warning.includes("원본")) context.warning += " 현재는 원본 루틴을 표시합니다.";
      context.source = base; context.effective = clone(base);
      context.ready = false; context.rows.clear(); context.revision = "";
    }
    context.key = JSON.stringify([context.userId, context.routineId, context.revision, context.source, [...context.rows.values()], context.ready]);
    return context;
  }
  function controls(context, day, entry) {
    const root = element("div", "exercise-replacement-controls");
    const row = context.rows.get(slotKey(day, entry.order));
    const change = element("button", "exercise-replacement-change", "종목변경");
    change.type = "button"; change.disabled = !context.ready;
    change.setAttribute("aria-haspopup", "dialog"); change.setAttribute("aria-controls", dialog.id);
    change.addEventListener("click", () => open(context, day, entry, change));
    root.append(change);
    if (row) {
      const original = window.ExerciseDB.getExerciseById(row.original_exercise_id);
      root.prepend(element("span", "exercise-replacement-badge", row.valid ? "직접 변경한 운동" : "변경 설정 확인 필요"));
      const restore = element("button", "exercise-replacement-restore", "원래 운동으로 복원"); restore.type = "button";
      restore.disabled = !context.ready;
      restore.addEventListener("click", () => {
        if (open(context, day, entry, restore)) choose(original, true);
      });
      root.append(restore);
      root.append(element("small", "exercise-replacement-original", `원래 배정: ${original?.name || row.original_exercise_id}`));
    }
    return root;
  }
  function cleanup(restore) {
    if (dialog.open) dialog.close();
    if (previousOverflow === null) return;
    document.body.style.overflow = previousOverflow; previousOverflow = null;
    if (restore && returnScroll) window.scrollTo({ ...returnScroll, behavior: "instant" });
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null; returnScroll = null; view = null;
    recommended.replaceChildren(); allList.replaceChildren(); form.reset();
  }
  function close({ restore = true, navigate = true } = {}) {
    const own = historyToken && history.state?.[historyKey] === historyToken;
    cleanup(restore);
    if (own && navigate && !historyPending) {
      historyPending = true;
      try { history.back(); } catch (_) { historyPending = false; }
    } else if (own && !navigate) {
      try { const state = { ...history.state }; delete state[historyKey]; history.replaceState(state, "", location.href); } catch (_) {}
    }
    historyToken = "";
  }
  function item(exercise) {
    const button = element("button", "exercise-replacement-option"); button.type = "button";
    button.append(element("strong", "", exercise.name), element("span", "", `${exercise.bodyParts.join(" · ")} · 난이도 ${exercise.difficulty}/5`));
    button.addEventListener("click", () => choose(exercise)); return button;
  }
  function renderAll() {
    if (!view) return;
    const query = search.value.trim().replace(/\s/g, "").toLocaleLowerCase();
    const rows = window.ExerciseDB.getActiveExercises().filter(exercise => exercise.exerciseId !== view.entry.exerciseId &&
      (!bodyPart.value || exercise.bodyParts.includes(bodyPart.value)) && exercise.name.replace(/\s/g, "").toLocaleLowerCase().includes(query));
    allList.replaceChildren(...rows.map(item));
    $("[data-replace-count]").textContent = rows.length ? `${rows.length}개 운동` : "조건에 맞는 운동이 없어요.";
  }
  function open(context, day, entry, trigger) {
    if (!current(context) || !context.ready || !visible() || busy || historyPending || dialog.open) return false;
    const source = context.source.days.find(item => item.day === day)?.exercises.find(item => item.order === entry.order);
    if (!source) return false;
    view = { context, day, entry, source, target: null, restore: false };
    returnFocus = trigger; returnScroll = { left: window.scrollX, top: window.scrollY }; previousOverflow = document.body.style.overflow;
    status.textContent = ""; checkButton.hidden = true; form.hidden = true; choices.hidden = false;
    $(".exercise-replacement-current").textContent = `패턴 ${day} · ${entry.order}번 ${window.ExerciseDB.getExerciseById(entry.exerciseId)?.name || entry.exerciseId}`;
    const alternatives = [...new Map(window.ExerciseDB.getAlternativeExercises(entry.exerciseId)
      .filter(exercise => exercise.exerciseId !== entry.exerciseId).map(exercise => [exercise.exerciseId, exercise])).values()];
    recommended.replaceChildren(...(alternatives.length ? alternatives.map(item) : [element("p", "exercise-replacement-help", "등록된 추천 대체 운동이 없어요. 전체 운동에서 선택할 수 있어요.")]));
    search.value = ""; bodyPart.replaceChildren(new Option("전체 부위", ""));
    [...new Set(window.ExerciseDB.getActiveExercises().flatMap(exercise => exercise.bodyParts))].sort().forEach(part => bodyPart.append(new Option(part, part)));
    $(".exercise-replacement-all").open = false; renderAll();
    try { dialog.showModal(); } catch (_) { cleanup(true); return false; }
    document.body.style.overflow = "hidden"; $(".exercise-replacement-content").scrollTop = 0; closeButton.focus({ preventScroll: true });
    try { historyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`; history.pushState({ ...history.state, [historyKey]: historyToken }, "", location.href); } catch (_) { historyToken = ""; }
    return true;
  }
  function choose(exercise, restore = false) {
    if (!view || !exercise || !exercise.enabled || busy) return;
    view.target = exercise; view.restore = restore || exercise.exerciseId === view.source.exerciseId;
    choices.hidden = true; form.hidden = false; form.reset(); status.textContent = ""; checkButton.hidden = true;
    $("[data-replace-target]").textContent = `${window.ExerciseDB.getExerciseById(view.entry.exerciseId).name} → ${exercise.name}`;
    $("[data-replace-meta]").textContent = `${exercise.bodyParts.join(" · ")} · 난이도 ${exercise.difficulty}/5`;
    const sameType = window.ExerciseDB.getExerciseById(view.entry.exerciseId).exerciseType === exercise.exerciseType;
    fields.hidden = view.restore;
    fields.querySelectorAll("input").forEach(input => { input.required = !view.restore; input.disabled = view.restore; });
    if (!view.restore && sameType) {
      form.elements.sets.value = view.entry.sets; form.elements.reps.value = view.entry.reps; form.elements.rest.value = view.entry.restSec;
    }
    $("[data-replace-dose-help]").textContent = view.restore
      ? `원래 추천한 ${view.source.reps}회 × ${view.source.sets}세트 · 휴식 ${view.source.restSec}초로 복원합니다. 운동 기록과 중량 기록은 유지됩니다.`
      : sameType ? ""
        : "원하는 세트·횟수·휴식시간을 직접 입력해 주세요.";
    $("[data-replace-save]").textContent = view.restore ? "확인하고 원래 운동으로 복원" : "확인하고 저장";
    $("[data-replace-back]").focus({ preventScroll: true });
  }
  function setBusy(value) {
    busy = value;
    form.querySelectorAll("input, button").forEach(node => { node.disabled = value || (node.closest(".exercise-replacement-dose-fields") && Boolean(view?.restore)); });
    checkButton.disabled = value;
  }
  async function save(event) {
    event.preventDefault();
    if (!view || busy || !current(view.context)) return;
    const state = view, context = state.context, token = generation;
    const row = context.rows.get(slotKey(state.day, state.entry.order));
    const sets = state.restore ? null : Number(form.elements.sets.value);
    const reps = state.restore ? null : Number(form.elements.reps.value);
    const rest = state.restore ? null : Number(form.elements.rest.value);
    if (!state.restore && (!state.target?.enabled || !Number.isInteger(sets) || sets < 1 || sets > 20 ||
      !Number.isInteger(reps) || reps < 1 || reps > 1000 || !Number.isInteger(rest) || rest < 0 || rest > 3600)) {
      status.textContent = "세트(1 ~ 20), 횟수(1 ~ 1000), 휴식(0 ~ 3600초)을 정수로 입력해 주세요."; return;
    }
    setBusy(true); status.textContent = "저장 중이에요.";
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!current(context, token)) return;
      if (authError || auth?.user?.id !== userId) throw { code: "42501" };
      const { data: result, error } = await client.rpc("set_member_exercise_replacement", {
        p_routine_id: context.routineId, p_revision: context.revision, p_day: state.day, p_order: state.entry.order,
        p_original_id: state.source.exerciseId, p_replacement_id: state.restore ? null : state.target.exerciseId,
        p_sets: sets, p_reps: reps, p_rest_sec: rest, p_expected_token: row?.change_token || null, p_restore: state.restore
      });
      if (!current(context, token)) return;
      if (error) throw error;
      if (state.restore ? result?.restored !== true : result?.replacement?.replacement_exercise_id !== state.target.exerciseId) throw new Error("INVALID_RESPONSE");
      close();
      await reload?.();
      if (token !== generation || userId !== context.userId) return;
      const saved = active?.rows.get(slotKey(state.day, state.entry.order));
      const applied = active?.ready && active.routineId === context.routineId && active.revision === context.revision &&
        (state.restore ? !saved : saved?.valid && saved.replacement_exercise_id === state.target.exerciseId);
      if (applied) showNotice(state.restore ? "" : "운동 변경 내용을 저장했어요.");
      else if (!active?.warning) showNotice("저장은 완료됐지만 화면 반영을 확인하지 못했어요. 다시 불러와 주세요.", true);
    } catch (error) {
      if (!current(context, token)) return;
      if (view === state) {
        status.textContent = errorMessage(error) + (error?.code ? "" : " 저장 완료를 확인하지 못했어요. 다시 확인한 뒤 재시도해 주세요.");
        checkButton.hidden = false;
      } else showNotice("저장 완료를 확인하지 못했어요. 다시 불러와 상태를 확인해 주세요.", true);
    } finally { if (token === generation) setBusy(false); }
  }
  function activate(context) {
    if (!context || context.userId !== userId) return;
    if (active?.key !== context.key) close({ restore: false });
    active = context; showNotice(context.warning, Boolean(context.warning));
  }
  function deactivate() { active = null; close({ restore: false }); showNotice(""); }
  function reset() { generation++; deactivate(); client = null; userId = ""; reload = null; busy = false; }
  function startMember(nextClient, id, onReload) { reset(); client = nextClient; userId = String(id); reload = onReload; }
  retry.addEventListener("click", () => { if (!busy) void reload?.(); });
  checkButton.addEventListener("click", () => { close(); void reload?.(); });
  search.addEventListener("input", renderAll); bodyPart.addEventListener("change", renderAll);
  $("[data-replace-back]").addEventListener("click", () => { form.hidden = true; choices.hidden = false; status.textContent = ""; });
  closeButton.addEventListener("click", () => close());
  form.addEventListener("submit", save);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("close", () => { if (!dialog.open && previousOverflow !== null) close(); });
  window.addEventListener("popstate", () => {
    historyPending = false;
    if (dialog.open && history.state?.[historyKey] !== historyToken) { cleanup(true); historyToken = ""; }
    else if (!dialog.open && history.state?.[historyKey]) {
      try { const state = { ...history.state }; delete state[historyKey]; history.replaceState(state, "", location.href); } catch (_) {}
    }
  });
  window.addEventListener("pagehide", () => close({ restore: false, navigate: false }));
  new MutationObserver(() => { if (app.hidden && userId) reset(); else if (!visible()) close({ restore: false }); })
    .observe(app, { attributes: true, attributeFilter: ["hidden"] });
  [assigned, routinePanel].forEach(node => new MutationObserver(() => { if (!visible()) close({ restore: false }); })
    .observe(node, { attributes: true, attributeFilter: ["hidden"] }));
  window.MemberExerciseReplacements = Object.freeze({ startMember, prepare, controls, activate, deactivate, reset });
})();
