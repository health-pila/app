/* 세트 완료는 이 기기의 회원·루틴·패턴·카드별 일일 체크입니다. 기존 기록 키는 보존합니다. */
(() => {
  "use strict";
  const PREFIX = "memberWorkoutSetCompletion:v1:";
  const DAY_MS = 86400000, KOREA_OFFSET = 9 * 60 * 60 * 1000;
  const stores = new WeakMap(), controls = new WeakMap();
  let resetTimer = 0;
  const dateKey = () => new Date(Date.now() + KOREA_OFFSET).toISOString().slice(0, 10);
  function cache(storage) {
    if (!stores.has(storage)) stores.set(storage, { memory: new Map(), volatile: new Set() });
    return stores.get(storage);
  }
  function read(storage, userId) {
    const date = dateKey(), store = cache(storage);
    let state = store.memory.get(userId);
    if (!store.volatile.has(userId)) {
      try {
        const raw = storage.getItem(PREFIX + userId), value = raw ? JSON.parse(raw) : null;
        state = { date, completed: new Set() };
        if (value?.version === 1 && value.date === date && Array.isArray(value.completed)) {
          value.completed.forEach(token => { if (typeof token === "string") state.completed.add(token); });
        }
      } catch (_) { store.volatile.add(userId); }
    }
    if (!state || state.date !== date) state = { date, completed: new Set() };
    store.memory.set(userId, state);
    return state;
  }
  function save(control, state) {
    const store = cache(control.storage);
    store.memory.set(control.userId, state);
    if (store.volatile.has(control.userId)) return;
    try {
      control.storage.setItem(PREFIX + control.userId, JSON.stringify({ version: 1, date: state.date, completed: [...state.completed] }));
    } catch (_) { store.volatile.add(control.userId); }
  }
  function refresh() {
    const inputs = document.querySelectorAll(".routine-set-completion-input");
    inputs.forEach(input => {
      const control = controls.get(input);
      if (!control) return;
      const state = read(control.storage, control.userId);
      input.checked = state.completed.has(control.token);
      input.closest("th")?.classList.toggle("is-set-complete", input.checked);
      control.date = state.date;
    });
    clearTimeout(resetTimer);
    if (inputs.length) resetTimer = setTimeout(refresh, DAY_MS - ((Date.now() + KOREA_OFFSET) % DAY_MS) + 50);
  }
  function createSetControl(entry, options, setIndex, text) {
    const context = options?.exerciseReplacementContext, userId = String(options?.userId || "");
    if (!userId || !Number.isInteger(setIndex) || setIndex < 0 || setIndex > 4) return null;
    const validContext = context?.userId === userId && context.routineId && context.revision && ["assigned", "tutorial"].includes(context.sourceKind);
    if (!validContext && !options.weightStorage) return null;
    let storage;
    try { storage = options.weightStorage || localStorage; } catch (_) {
      // localStorage가 완전히 차단되어도 현재 페이지에서는 체크할 수 있습니다.
      storage = blockedStorage;
    }
    const token = JSON.stringify([
      validContext ? context.sourceKind : "preview", validContext ? context.routineId : "preview",
      validContext ? context.revision : "preview", options.patternDay,
      options.addedRow ? ["added", options.addedRow.id] : ["original", entry.order], entry.exerciseId, setIndex
    ]);
    const state = read(storage, userId), label = document.createElement("label"), input = document.createElement("input");
    label.className = "routine-set-completion";
    const caption = document.createElement("span"); caption.textContent = text;
    input.type = "checkbox"; input.className = "routine-set-completion-input";
    input.setAttribute("aria-label", (window.MemberCustomExercises?.getExerciseById(entry.exerciseId) || window.ExerciseDB?.getExerciseById(entry.exerciseId))?.name + " " + text + " 완료");
    input.checked = state.completed.has(token);
    label.append(caption, input);
    const control = { userId, token, storage, date: state.date }; controls.set(input, control);
    input.addEventListener("change", () => {
      if (!label.isConnected || label.closest("#appScreen")?.hidden || input.disabled) return;
      const next = read(storage, userId);
      const checked = control.date !== next.date ? true : input.checked;
      if (checked) next.completed.add(token); else next.completed.delete(token);
      save(control, next); refresh();
    });
    // 연결 전에도 자정 갱신을 예약합니다. 다음 refresh부터 연결된 체크만 갱신합니다.
    clearTimeout(resetTimer);
    resetTimer = setTimeout(refresh, DAY_MS - ((Date.now() + KOREA_OFFSET) % DAY_MS) + 50);
    return label;
  }
  const blockedStorage = { getItem() { throw new Error("Storage blocked"); }, setItem() { throw new Error("Storage blocked"); } };
  function clearControls(inputs) {
    inputs.forEach(input => {
      const control = controls.get(input); if (!control) return;
      const state = read(control.storage, control.userId); state.completed.delete(control.token); save(control, state);
    });
    refresh();
  }
  window.addEventListener("storage", event => { if (event.key === null || event.key.startsWith(PREFIX)) refresh(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
  window.MemberWorkoutCompletion = Object.freeze({ createSetControl, refresh, clearControls });
})();
