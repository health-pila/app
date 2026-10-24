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
        <details class="exercise-replacement-personal"><summary>내가 추가한 운동</summary>
          <p data-personal-status class="exercise-replacement-help" role="status"></p>
          <button type="button" data-personal-refresh hidden>목록 다시 불러오기</button>
          <div data-personal-list class="exercise-replacement-list"></div>
        </details>
        <details class="exercise-replacement-personal" data-personal-entry><summary>직접 운동 입력하기</summary>
          <label for="personalExerciseName">운동명</label>
          <input id="personalExerciseName" type="text" maxlength="60" placeholder="예: 와이드 스쿼트" autocomplete="off">
          <p class="exercise-replacement-help">개인 운동 목록에 저장돼요. 세트·횟수·휴식시간은 다음 화면에서 직접 입력해 주세요.</p>
          <button type="button" data-personal-choose>이 운동으로 변경하기</button>
        </details>
      </div>
      <form data-replace-confirm hidden>
        <button type="button" data-replace-back>← 다른 운동 선택</button>
        <h3 data-replace-target></h3><p data-replace-meta class="exercise-replacement-help"></p>
        <p data-replace-dose-help class="exercise-replacement-help"></p>
        <button type="submit" data-replace-save class="exercise-replacement-save">확인하고 저장</button>
        <div class="exercise-replacement-dose-fields">
          <label>세트<input name="sets" type="number" min="1" max="20" step="1" required inputmode="numeric"></label>
          <label>세트당 횟수<input name="reps" type="number" min="1" max="1000" step="1" required inputmode="numeric"></label>
          <label>휴식(초)<input name="rest" type="number" min="0" max="3600" step="1" required inputmode="numeric"></label>
        </div>
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
  // 자판을 제외한 실제 표시 영역에 맞춥니다. 저장 버튼은 입력칸 위에 유지합니다.
  function syncDialogViewport() {
    if (!dialog.open) return;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const top = viewport?.offsetTop || 0;
    dialog.style.setProperty("--replacement-max-height", `${Math.max(0, height - 24)}px`);
    dialog.style.setProperty("--replacement-center", `${top + height / 2}px`);
  }
  let client = null, userId = "", generation = 0, active = null, view = null, busy = false, reload = null;
  let returnFocus = null, previousOverflow = null, returnScroll = null, historyToken = "", historyPending = false;
  const personalList = $("[data-personal-list]"), personalName = $("#personalExerciseName");
  const resolveExercise = id => window.MemberCustomExercises?.getExerciseById(id) || window.ExerciseDB.getExerciseById(id);
  const historyKey = "memberExerciseReplacement";
  const extrasCache = new Map();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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
    if (message.includes("TUTORIAL_UNAVAILABLE")) return "신청·배정 상태가 변경됐어요. 상단 새로고침 버튼으로 확인해 주세요.";
    if (message.includes("ADDITION_UNAVAILABLE")) return "이 추가 운동을 확인하지 못했어요. 다시 불러와 주세요.";
    if (message.includes("ADDITION_CONFLICT")) return "다른 기기에서 이 추가 운동을 변경했어요. 저장 상태를 다시 확인해 주세요.";
    if (message.includes("REPLACEMENT_CONFLICT")) return "다른 기기에서 이 운동을 변경했어요. 저장 상태를 다시 확인한 뒤 선택해 주세요.";
    if (message.includes("SAME_EXERCISE_REQUIRED")) return "현재 운동이 변경됐어요. 저장 상태를 다시 확인한 뒤 수정해 주세요.";
    if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error?.code)) return "운동 교체 저장소 설정이 필요해요. 현재는 원본 루틴을 표시합니다.";
    if (error?.code === "42501" || message.includes("LOGIN_REQUIRED")) return "로그인 상태와 본인의 루틴인지 확인한 뒤 다시 시도해 주세요.";
    if (message.includes("INVALID_CUSTOM_EXERCISE_NAME")) return "운동명을 1 ~ 60자로 입력해 주세요. 줄바꿈과 보이지 않는 문자는 사용할 수 없어요.";
    if (error?.code === "22023") return "운동과 세트·횟수·휴식시간을 확인해 주세요.";
    return "개인 변경 내용을 확인하지 못했어요. 연결을 확인하고 다시 불러와 주세요.";
  }
  async function prepare(data, id) {
    const token = generation;
    await window.MemberCustomExercises?.ready();
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
        const exercise = resolveExercise(row.replacement_exercise_id);
        const valid = exercise?.enabled && row.change_token &&
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
    context.sourceKind = "assigned";
    if (context.ready) await prepareExtras(context, token);
    if (token !== generation || String(id) !== userId) return null;
    context.key = contextKey(context);
    return context;
  }
  function contextKey(context) {
    return JSON.stringify([context.userId, context.sourceKind, context.routineId, context.revision,
      context.source, [...context.rows.values()], context.additions || [], context.ready,
      Boolean(context.extrasReady), context.warning]);
  }
  function sourceArgs(context) {
    return { p_source_kind: context.sourceKind, p_source_id: context.routineId, p_source_revision: context.revision };
  }
  function validDose(row) {
    return Number.isInteger(row.sets) && row.sets >= 1 && row.sets <= 20 &&
      Number.isInteger(row.reps) && row.reps >= 1 && row.reps <= 1000 &&
      Number.isInteger(row.rest_sec) && row.rest_sec >= 0 && row.rest_sec <= 3600;
  }
  async function prepareExtras(context, token) {
    const cacheKey = JSON.stringify([context.userId, context.sourceKind, context.routineId, context.revision]);
    context.additions = []; context.extrasReady = false;
    let timer;
    try {
      const { data: result, error } = await Promise.race([
        client.rpc("get_member_pattern_extras", sourceArgs(context)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("PATTERN_EXTRAS_TIMEOUT")), 10000); })
      ]);
      if (error) throw error;
      if (token !== generation || context.userId !== userId) return;
      if (result?.source_kind !== context.sourceKind || result.source_id !== context.routineId ||
        result.source_revision !== context.revision || !Array.isArray(result.additions) ||
        !Array.isArray(result.tutorial_replacements)) throw new Error("INVALID_EXTRAS_RESPONSE");
      const source = window.RoutineComponents.parseRoutineJson(JSON.stringify(result.source_json));
      if (JSON.stringify(source) !== JSON.stringify(context.source)) throw new Error("ROUTINE_CHANGED");
      const ids = new Set();
      result.additions.forEach(row => {
        const exercise = resolveExercise(row.exercise_id);
        if (row.user_id !== userId || row.source_kind !== context.sourceKind || row.source_id !== context.routineId ||
          row.source_revision !== context.revision || !uuidPattern.test(row.id) || ids.has(row.id) ||
          !uuidPattern.test(row.change_token) || row.deleted_at != null || !validDose(row) || !exercise?.enabled ||
          !Number.isSafeInteger(Number(row.created_seq)) || Number(row.created_seq) <= 0 ||
          !context.source.days.some(day => day.day === row.pattern_day)) throw new Error("INVALID_ADDED_CARD");
        ids.add(row.id);
      });
      if (context.sourceKind === "tutorial") {
        const slots = new Set();
        result.tutorial_replacements.forEach(row => {
          const original = context.source.days.find(day => day.day === row.pattern_day)?.exercises.find(e => e.order === row.exercise_order);
          const slot = slotKey(row.pattern_day, row.exercise_order);
          if (row.user_id !== userId || row.tutorial_version !== context.revision || !original ||
            original.exerciseId !== row.original_exercise_id || slots.has(slot) || !uuidPattern.test(row.change_token) ||
            !validDose(row) || !resolveExercise(row.replacement_exercise_id)?.enabled) throw new Error("INVALID_TUTORIAL_REPLACEMENT");
          slots.add(slot);
        });
      } else if (result.tutorial_replacements.length) throw new Error("INVALID_EXTRAS_RESPONSE");
      extrasCache.set(cacheKey, clone(result)); context.extrasReady = true;
    } catch (error) {
      if (token !== generation || context.userId !== userId) return;
      if (String(error?.message).includes("TUTORIAL_UNAVAILABLE")) {
        context.unavailable = true; extrasCache.delete(cacheKey);
      }
      context.warning = [context.warning, errorMessage(error)].filter(Boolean).join(" ");
    } finally { clearTimeout(timer); }
    const saved = extrasCache.get(cacheKey);
    if (!saved || context.unavailable) return;
    context.additions = clone(saved.additions).sort((a, b) => Number(a.created_seq) - Number(b.created_seq));
    if (context.sourceKind === "tutorial") {
      saved.tutorial_replacements.forEach(row => {
        const entry = context.effective.days.find(day => day.day === row.pattern_day).exercises.find(e => e.order === row.exercise_order);
        context.rows.set(slotKey(row.pattern_day, row.exercise_order), { ...row, valid: true });
        Object.assign(entry, { exerciseId: row.replacement_exercise_id, sets: row.sets, reps: row.reps, restSec: row.rest_sec });
      });
    }
  }
  async function prepareTutorial(data, id) {
    const token = generation;
    await window.MemberCustomExercises?.ready();
    if (token !== generation || String(id) !== userId || !client) return null;
    const source = window.RoutineComponents.parseRoutineJson(JSON.stringify(data));
    const context = { userId: String(id), sourceKind: "tutorial", routineId: "common", revision: "1",
      source, effective: clone(source), rows: new Map(), ready: true, warning: "" };
    await prepareExtras(context, token);
    if (token !== generation || String(id) !== userId) return null;
    context.ready = context.extrasReady;
    context.key = contextKey(context);
    return context;
  }
  function addControl(context, day) {
    const button = element("button", "member-pattern-add");
    const plus = element("span", "member-pattern-add-icon");
    plus.setAttribute("aria-hidden", "true");
    const plusSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    plusSvg.setAttribute("viewBox", "0 0 24 24");
    plusSvg.setAttribute("focusable", "false");
    const plusPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    plusPath.setAttribute("d", "M12 5v14M5 12h14");
    plusSvg.append(plusPath); plus.append(plusSvg);
    const arrow = element("span", "member-pattern-add-arrow");
    arrow.setAttribute("aria-hidden", "true");
    const arrowSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrowSvg.setAttribute("viewBox", "0 0 24 24");
    arrowSvg.setAttribute("focusable", "false");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "m9 5 7 7-7 7");
    arrowSvg.append(arrowPath); arrow.append(arrowSvg);
    button.append(plus, element("span", "member-pattern-add-label", "운동 종목 추가하기"), arrow);
    button.type = "button"; button.disabled = !context.extrasReady;
    button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-controls", dialog.id);
    button.addEventListener("click", () => open(context, day, null, button, "add"));
    return button;
  }
  async function removeAdded(context, row, trigger) {
    if (!current(context) || !visible() || busy || !context.extrasReady ||
      !window.confirm(`'${resolveExercise(row.exercise_id)?.name || "추가 운동"}'을 이 패턴에서 삭제할까요?\n개인 운동 목록과 중량 기록은 유지됩니다.`)) return;
    const token = generation; busy = true; trigger.disabled = true;
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!current(context, token)) return;
      if (authError || auth?.user?.id !== userId) throw { code: "42501" };
      const { data: result, error } = await client.rpc("remove_member_pattern_exercise", {
        p_id: row.id, ...sourceArgs(context), p_expected_token: row.change_token
      });
      if (!current(context, token)) return;
      if (error) throw error;
      if (result?.removed !== true || result.id !== row.id) throw new Error("INVALID_RESPONSE");
      await reload?.();
      if (token !== generation || userId !== context.userId) return;
      if (!active?.extrasReady || active?.additions.some(x => x.id === row.id))
        showNotice("삭제 결과를 화면에서 확인하지 못했어요. 다시 불러와 주세요.", true);
    } catch (error) {
      if (current(context, token)) showNotice(errorMessage(error) + " 삭제 완료를 확인하지 못했어요. 다시 불러와 확인해 주세요.", true);
    } finally { if (token === generation) { busy = false; trigger.disabled = false; } }
  }
  function controls(context, day, entry, addedRow = null) {
    const root = element("div", "exercise-replacement-controls");
    const row = addedRow ? null : context.rows.get(slotKey(day, entry.order));
    const change = element("button", "exercise-replacement-change", "종목변경");
    change.type = "button"; change.disabled = addedRow ? !context.extrasReady : !context.ready;
    change.setAttribute("aria-haspopup", "dialog"); change.setAttribute("aria-controls", dialog.id);
    change.addEventListener("click", () => open(context, day, entry, change, addedRow ? "editAdded" : "replace", addedRow));
    root.append(change);
    if (addedRow) {
      root.prepend(element("span", "exercise-replacement-badge", "직접 추가한 운동"));
      const remove = element("button", "member-pattern-remove", "운동 삭제"); remove.type = "button";
      remove.disabled = !context.extrasReady;
      remove.addEventListener("click", () => void removeAdded(context, addedRow, remove));
      root.append(remove);
    }
    if (row) {
      const original = resolveExercise(row.original_exercise_id);
      const doseOnly = row.original_exercise_id === row.replacement_exercise_id;
      root.prepend(element("span", "exercise-replacement-badge", row.valid ? (doseOnly ? "직접 수정한 설정" : "직접 변경한 운동") : "변경 설정 확인 필요"));
      const restore = element("button", "exercise-replacement-restore", doseOnly ? "원래 추천으로 복원" : "원래 운동으로 복원"); restore.type = "button";
      restore.disabled = !context.ready;
      restore.addEventListener("click", () => {
        if (open(context, day, entry, restore)) choose(original, true);
      });
      root.append(restore);
      if (!doseOnly) root.append(element("small", "exercise-replacement-original", `원래 배정: ${original?.name || row.original_exercise_id}`));
    }
    return root;
  }
  function doseControl(context, day, entry, addedRow = null) {
    const button = element("button", "exercise-dose-edit", "수정");
    button.type = "button"; button.disabled = !context.ready || !context.extrasReady;
    button.setAttribute("aria-label", `${resolveExercise(entry.exerciseId)?.name || entry.exerciseId} 횟수·세트·휴식시간 수정`);
    button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-controls", dialog.id);
    button.addEventListener("click", () => open(context, day, entry, button, "dose", addedRow));
    return button;
  }
  function cleanup(restore) {
    if (dialog.open) dialog.close();
    if (previousOverflow === null) return;
    document.body.style.overflow = previousOverflow; previousOverflow = null;
    if (restore && returnScroll) window.scrollTo({ ...returnScroll, behavior: "instant" });
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null; returnScroll = null; view = null;
    recommended.replaceChildren(); allList.replaceChildren(); personalList.replaceChildren(); personalName.value = ""; form.reset();
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
    button.append(element("strong", "", exercise.name), element("span", "", exercise.personal ? "직접 입력한 운동" : `${exercise.bodyParts.join(" · ")} · 난이도 ${exercise.difficulty}/5`));
    button.addEventListener("click", () => choose(exercise)); return button;
  }
  function renderPersonal() {
    if (!view) return;
    const rows = (window.MemberCustomExercises?.getExercises() || []).filter(exercise => exercise.exerciseId !== view.entry?.exerciseId);
    personalList.replaceChildren(...rows.map(item));
    const failed = !window.MemberCustomExercises || window.MemberCustomExercises.getError();
    $("[data-personal-status]").textContent = failed ? "개인 운동 목록을 불러오지 못했어요. 다시 불러와 주세요."
      : rows.length ? `${rows.length}개 개인 운동` : "아직 추가한 운동이 없어요. 아래에서 직접 입력할 수 있어요.";
    $("[data-personal-refresh]").hidden = !failed;
  }
  async function refreshPersonal(state) {
    if (!state || !window.MemberCustomExercises) return;
    const token = generation;
    await window.MemberCustomExercises.refresh();
    if (view === state && current(state.context, token)) renderPersonal();
  }
  function choosePersonal() {
    if (!view || busy) return;
    try {
      const name = window.MemberCustomExercises.normalizeName(personalName.value);
      const key = window.MemberCustomExercises.nameKey(name);
      const existing = window.MemberCustomExercises.getExercises().find(exercise => window.MemberCustomExercises.nameKey(exercise.name) === key);
      choose(existing || { exerciseId: null, name, personal: true, enabled: true, bodyParts: [], difficulty: null, exerciseType: null });
    } catch (error) { status.textContent = error.message || "운동명을 확인해 주세요."; personalName.focus(); }
  }
  function renderAll() {
    if (!view) return;
    const query = search.value.trim().replace(/\s/g, "").toLocaleLowerCase();
    const rows = window.ExerciseDB.getActiveExercises().filter(exercise => exercise.exerciseId !== view.entry?.exerciseId &&
      (!bodyPart.value || exercise.bodyParts.includes(bodyPart.value)) && exercise.name.replace(/\s/g, "").toLocaleLowerCase().includes(query));
    allList.replaceChildren(...rows.map(item));
    $("[data-replace-count]").textContent = rows.length ? `${rows.length}개 운동` : "조건에 맞는 운동이 없어요.";
  }
  function open(context, day, entry, trigger, mode = "replace", addedRow = null) {
    if (!current(context) || !(mode === "replace" ? context.ready : context.extrasReady) || !visible() || busy || historyPending || dialog.open) return false;
    if (mode === "dose" && (!context.ready || !resolveExercise(entry?.exerciseId)?.enabled)) return false;
    const needsSource = mode === "replace" || (mode === "dose" && !addedRow);
    const source = needsSource ? context.source.days.find(item => item.day === day)?.exercises.find(item => item.order === entry.order) : null;
    if (needsSource && !source) return false;
    view = { context, day, entry, source, mode, addedRow, additionId: mode === "add" ? crypto.randomUUID() : addedRow?.id, target: null, restore: false };
    returnFocus = trigger; returnScroll = { left: window.scrollX, top: window.scrollY }; previousOverflow = document.body.style.overflow;
    status.textContent = ""; checkButton.hidden = true; form.hidden = true; choices.hidden = false;
    $("#exerciseReplacementTitle").textContent = mode === "dose" ? "운동 설정 수정" : mode === "add" ? "운동 추가하기" : "종목변경";
    $("[data-replace-back]").hidden = mode === "dose";
    $("[data-replace-meta]").hidden = mode === "dose";
    $(".exercise-replacement-safety").hidden = mode === "dose";
    $(".exercise-replacement-current").hidden = mode === "dose";
    $("[data-personal-choose]").textContent = mode === "add" ? "이 운동 추가하기" : "이 운동으로 변경하기";
    $(".exercise-replacement-current").textContent = mode === "add" ? `패턴 ${day} 마지막에 운동을 추가해요.` : `패턴 ${day} · ${entry.order}번 ${resolveExercise(entry.exerciseId)?.name || entry.exerciseId}`;
    const alternativeId = mode === "add" ? "" : resolveExercise(entry.exerciseId)?.personal ? source?.exerciseId || "" : entry.exerciseId;
    const alternatives = [...new Map(window.ExerciseDB.getAlternativeExercises(alternativeId)
      .filter(exercise => exercise.exerciseId !== entry?.exerciseId).map(exercise => [exercise.exerciseId, exercise])).values()];
    recommended.replaceChildren(...(alternatives.length ? alternatives.map(item) : [element("p", "exercise-replacement-help", "등록된 추천 대체 운동이 없어요. 전체 운동에서 선택할 수 있어요.")]));
    search.value = ""; bodyPart.replaceChildren(new Option("전체 부위", ""));
    [...new Set(window.ExerciseDB.getActiveExercises().flatMap(exercise => exercise.bodyParts))].sort().forEach(part => bodyPart.append(new Option(part, part)));
    recommended.hidden = mode === "add";
    recommended.previousElementSibling.hidden = mode === "add";
    $(".exercise-replacement-all").open = false;
    dialog.querySelectorAll(".exercise-replacement-personal").forEach(node => { node.open = false; });
    personalName.value = ""; renderPersonal(); renderAll();
    if (mode !== "dose") void refreshPersonal(view);
    try { dialog.showModal(); } catch (_) { cleanup(true); return false; }
    syncDialogViewport();
    document.body.style.overflow = "hidden"; $(".exercise-replacement-content").scrollTop = 0; closeButton.focus({ preventScroll: true });
    try { historyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`; history.pushState({ ...history.state, [historyKey]: historyToken }, "", location.href); } catch (_) { historyToken = ""; }
    if (mode === "dose") choose(resolveExercise(entry.exerciseId));
    return true;
  }
  function choose(exercise, restore = false) {
    if (!view || !exercise || !exercise.enabled || busy) return;
    view.target = exercise; view.restore = view.mode === "replace" && (restore || exercise.exerciseId === view.source.exerciseId);
    choices.hidden = true; form.hidden = false; form.reset(); status.textContent = ""; checkButton.hidden = true;
    $("[data-replace-target]").textContent = view.mode === "add" || view.mode === "dose" ? exercise.name : `${resolveExercise(view.entry.exerciseId)?.name || view.entry.exerciseId} → ${exercise.name}`;
    $("[data-replace-meta]").textContent = exercise.personal ? "직접 입력한 운동" : `${exercise.bodyParts.join(" · ")} · 난이도 ${exercise.difficulty}/5`;
    const currentExercise = resolveExercise(view.entry?.exerciseId);
    const sameType = Boolean(currentExercise && !currentExercise.personal && !exercise.personal && currentExercise.exerciseType === exercise.exerciseType);
    fields.hidden = view.restore;
    fields.querySelectorAll("input").forEach(input => { input.required = !view.restore; input.disabled = view.restore; });
    if (!view.restore && (sameType || view.mode === "dose")) {
      form.elements.sets.value = view.entry.sets; form.elements.reps.value = view.entry.reps; form.elements.rest.value = view.entry.restSec;
    }
    $("[data-replace-dose-help]").textContent = view.restore
      ? `원래 추천한 ${view.source.reps}회 × ${view.source.sets}세트 · 휴식 ${view.source.restSec}초로 복원합니다. 운동 기록과 중량 기록은 유지됩니다.`
      : sameType || view.mode === "dose" ? ""
        : "원하는 세트·횟수·휴식시간을 직접 입력해 주세요.";
    $("[data-replace-save]").textContent = view.restore ? "확인하고 원래 운동으로 복원" : "확인하고 저장";
    (view.mode === "dose" ? form.elements.sets : $("[data-replace-back]")).focus({ preventScroll: true });
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
    if (state.mode === "dose") { await saveDose(state, token); return; }
    if (state.mode === "add" || state.mode === "editAdded") { await saveAdded(state, token); return; }
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
      const args = { ...(context.sourceKind === "tutorial" ? { p_version: context.revision } : { p_routine_id: context.routineId, p_revision: context.revision }), p_day: state.day, p_order: state.entry.order,
        p_original_id: state.source.exerciseId, p_sets: sets, p_reps: reps, p_rest_sec: rest, p_expected_token: row?.change_token || null };
      const isNewPersonal = !state.restore && state.target.personal && !state.target.exerciseId;
      if (isNewPersonal) args.p_name = state.target.name;
      else { args.p_replacement_id = state.restore ? null : state.target.exerciseId; args.p_restore = state.restore; }
      const rpcName = context.sourceKind === "tutorial"
        ? (isNewPersonal ? "set_member_custom_tutorial_exercise_replacement" : "set_member_tutorial_exercise_replacement")
        : (isNewPersonal ? "set_member_custom_exercise_replacement" : "set_member_exercise_replacement");
      const { data: result, error } = await client.rpc(rpcName, args);
      if (!current(context, token)) return;
      if (error) throw error;
      if (isNewPersonal) {
        const personalId = "MY:" + result?.custom_exercise?.id;
        if (result?.replacement?.replacement_exercise_id !== personalId) throw new Error("INVALID_RESPONSE");
        state.target = window.MemberCustomExercises.accept(result.custom_exercise);
      }
      if (state.restore ? result?.restored !== true : result?.replacement?.replacement_exercise_id !== state.target.exerciseId) throw new Error("INVALID_RESPONSE");
      close();
      await reload?.();
      if (token !== generation || userId !== context.userId) return;
      const saved = active?.rows.get(slotKey(state.day, state.entry.order));
      const applied = active?.ready && active.routineId === context.routineId && active.revision === context.revision &&
        (state.restore ? !saved : saved?.valid && saved.replacement_exercise_id === state.target.exerciseId);
      if (applied) showNotice("");
      else if (!active?.warning) showNotice("저장은 완료됐지만 화면 반영을 확인하지 못했어요. 다시 불러와 주세요.", true);
    } catch (error) {
      if (!current(context, token)) return;
      if (view === state) {
        status.textContent = errorMessage(error) + (error?.code ? "" : " 저장 완료를 확인하지 못했어요. 다시 확인한 뒤 재시도해 주세요.");
        checkButton.hidden = false;
      } else showNotice("저장 완료를 확인하지 못했어요. 다시 불러와 상태를 확인해 주세요.", true);
    } finally { if (token === generation) setBusy(false); }
  }
  async function saveDose(state, token) {
    const context = state.context;
    const sets = Number(form.elements.sets.value), reps = Number(form.elements.reps.value), rest = Number(form.elements.rest.value);
    if (!validDose({ sets, reps, rest_sec: rest }) || [...fields.querySelectorAll("input")].some(input => !input.value.trim())) {
      status.textContent = "세트(1 ~ 20), 횟수(1 ~ 1000), 휴식(0 ~ 3600초)을 정수로 입력해 주세요."; return;
    }
    const prior = state.addedRow || context.rows.get(slotKey(state.day, state.entry.order));
    setBusy(true); status.textContent = "저장 중이에요.";
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!current(context, token)) return;
      if (authError || auth?.user?.id !== userId) throw { code: "42501" };
      const { data: result, error } = await client.rpc("set_member_exercise_parameters", {
        ...sourceArgs(context), p_day: state.day, p_order: state.addedRow ? null : state.entry.order,
        p_exercise_id: state.entry.exerciseId, p_sets: sets, p_reps: reps, p_rest_sec: rest,
        p_expected_token: prior?.change_token || null, p_added_id: state.addedRow?.id || null
      });
      if (!current(context, token)) return;
      if (error) throw error;
      const saved = state.addedRow ? result?.addition : result?.replacement;
      if (result?.restored === true && !state.addedRow) {
        if (state.entry.exerciseId !== state.source.exerciseId || sets !== state.source.sets ||
          reps !== state.source.reps || rest !== state.source.restSec) throw new Error("INVALID_RESPONSE");
      } else if (!saved || saved.user_id !== userId || saved.pattern_day !== state.day ||
        (state.addedRow ? saved.id !== state.addedRow.id || saved.exercise_id !== state.entry.exerciseId
          : saved.exercise_order !== state.entry.order || saved.original_exercise_id !== state.source.exerciseId ||
            saved.replacement_exercise_id !== state.entry.exerciseId) ||
        saved.sets !== sets || saved.reps !== reps || saved.rest_sec !== rest ||
        !uuidPattern.test(saved.change_token)) throw new Error("INVALID_RESPONSE");
      close();
      await reload?.();
      if (token !== generation || userId !== context.userId) return;
      const applied = state.addedRow ? active?.additions?.find(row => row.id === state.addedRow.id)
        : active?.effective.days.find(day => day.day === state.day)?.exercises.find(entry => entry.order === state.entry.order);
      if (active?.ready && active.extrasReady && active.sourceKind === context.sourceKind &&
        active.routineId === context.routineId && active.revision === context.revision &&
        (state.addedRow ? applied?.exercise_id : applied?.exerciseId) === state.entry.exerciseId &&
        applied?.sets === sets && applied?.reps === reps && (state.addedRow ? applied?.rest_sec : applied?.restSec) === rest) showNotice("");
      else showNotice("저장 결과를 화면에서 확인하지 못했어요. 다시 불러와 주세요.", true);
    } catch (error) {
      if (!current(context, token)) return;
      if (view === state) {
        status.textContent = errorMessage(error) + " 저장 완료를 확인하지 못했어요. 저장 상태를 다시 확인해 주세요.";
        checkButton.hidden = false;
      } else showNotice("저장 결과를 확인하지 못했어요. 다시 불러와 주세요.", true);
    } finally { if (token === generation) setBusy(false); }
  }
  async function saveAdded(state, token) {
    const context = state.context;
    const sets = Number(form.elements.sets.value), reps = Number(form.elements.reps.value), rest = Number(form.elements.rest.value);
    if (!state.target?.enabled || !validDose({ sets, reps, rest_sec: rest })) {
      status.textContent = "세트(1 ~ 20), 횟수(1 ~ 1000), 휴식(0 ~ 3600초)을 정수로 입력해 주세요."; return;
    }
    setBusy(true); status.textContent = "저장 중이에요.";
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!current(context, token)) return;
      if (authError || auth?.user?.id !== userId) throw { code: "42501" };
      const isNewPersonal = state.target.personal && !state.target.exerciseId;
      const args = { p_id: state.additionId, ...sourceArgs(context), p_sets: sets, p_reps: reps, p_rest_sec: rest };
      if (state.mode === "add") args.p_day = state.day;
      else args.p_expected_token = state.addedRow.change_token;
      if (isNewPersonal) args.p_name = state.target.name;
      else args.p_exercise_id = state.target.exerciseId;
      const name = (state.mode === "add" ? "add_member_" : "update_member_") + (isNewPersonal ? "custom_pattern_exercise" : "pattern_exercise");
      const { data: result, error } = await client.rpc(name, args);
      if (!current(context, token)) return;
      if (error) throw error;
      if (isNewPersonal) state.target = window.MemberCustomExercises.accept(result?.custom_exercise);
      const saved = result?.addition;
      if (saved?.id !== state.additionId || saved.user_id !== userId || saved.pattern_day !== state.day ||
        saved.exercise_id !== state.target.exerciseId || saved.sets !== sets || saved.reps !== reps ||
        saved.rest_sec !== rest || !uuidPattern.test(saved.change_token)) throw new Error("INVALID_RESPONSE");
      close();
      await reload?.();
      if (token !== generation || userId !== context.userId) return;
      const applied = active?.additions?.find(row => row.id === state.additionId);
      if (!active?.extrasReady || active.sourceKind !== context.sourceKind || active.routineId !== context.routineId ||
        active.revision !== context.revision || applied?.change_token !== saved.change_token)
        showNotice("저장 결과를 화면에서 확인하지 못했어요. 다시 불러와 주세요.", true);
    } catch (error) {
      if (!current(context, token)) return;
      if (view === state) {
        status.textContent = errorMessage(error) + " 저장 완료를 확인하지 못했어요. 저장 상태를 다시 확인해 주세요.";
        checkButton.hidden = false;
      } else showNotice("저장 결과를 확인하지 못했어요. 다시 불러와 주세요.", true);
    } finally { if (token === generation) setBusy(false); }
  }
  function activate(context) {
    if (!context || context.userId !== userId) return;
    if (active?.key !== context.key) close({ restore: false });
    active = context; showNotice(context.warning, Boolean(context.warning));
  }
  function deactivate() { active = null; close({ restore: false }); showNotice(""); }
  function reset() { generation++; deactivate(); client = null; userId = ""; reload = null; busy = false; extrasCache.clear(); }
  function startMember(nextClient, id, onReload) { reset(); client = nextClient; userId = String(id); reload = onReload; }
  retry.addEventListener("click", () => { if (!busy) void reload?.(); });
  checkButton.addEventListener("click", () => { close(); void reload?.(); });
  search.addEventListener("input", renderAll); bodyPart.addEventListener("change", renderAll);
  $("[data-replace-back]").addEventListener("click", () => { form.hidden = true; choices.hidden = false; status.textContent = ""; });
  closeButton.addEventListener("click", () => close());
  $("[data-personal-choose]").addEventListener("click", choosePersonal);
  $("[data-personal-refresh]").addEventListener("click", () => void refreshPersonal(view));
  personalName.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); choosePersonal(); } });
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
  window.addEventListener("resize", syncDialogViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", syncDialogViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", syncDialogViewport, { passive: true });
  new MutationObserver(() => { if (app.hidden && userId) reset(); else if (!visible()) close({ restore: false }); })
    .observe(app, { attributes: true, attributeFilter: ["hidden"] });
  [assigned, routinePanel].forEach(node => new MutationObserver(() => { if (!visible()) close({ restore: false }); })
    .observe(node, { attributes: true, attributeFilter: ["hidden"] }));
  window.MemberExerciseReplacements = Object.freeze({ startMember, prepare, prepareTutorial, controls, doseControl, addControl, activate, deactivate, reset });
})();
