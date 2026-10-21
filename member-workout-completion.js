/* 수행완료는 이 브라우저의 회원별 일일 체크입니다. 루틴·중량 기록은 수정하지 않습니다. */
(() => {
  "use strict";
  const PREFIX = "memberWorkoutCompletion:v1:";
  const DAY_MS = 86400000;
  const KOREA_OFFSET = 9 * 60 * 60 * 1000;
  const memory = new Map();
  const volatileUsers = new Set();
  const controls = new WeakMap();
  let resetTimer = 0;

  // 센터 기준인 한국 시간 자정에 날짜를 바꿉니다. 체크한 시점부터 24시간이 아닙니다.
  const dateKey = () => new Date(Date.now() + KOREA_OFFSET).toISOString().slice(0, 10);
  const storageKey = userId => PREFIX + userId;

  function save(userId, state) {
    memory.set(userId, state);
    if (volatileUsers.has(userId)) return;
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify({
        version: 1, date: state.date, completed: [...state.completed]
      }));
    } catch (_) {
      // 저장소가 차단되거나 가득 차도 현재 앱에서 체크/해제는 사용할 수 있습니다.
      volatileUsers.add(userId);
    }
  }

  function read(userId) {
    const date = dateKey();
    let state = memory.get(userId);
    if (volatileUsers.has(userId)) {
      if (!state || state.date !== date) state = { date, completed: new Set() };
    } else {
      try {
        const raw = localStorage.getItem(storageKey(userId));
        const value = raw ? JSON.parse(raw) : null;
        state = { date, completed: new Set() };
        if (value?.version === 1 && value.date === date && Array.isArray(value.completed)) {
          value.completed.forEach(key => { if (typeof key === "string") state.completed.add(key); });
        } else if (raw) {
          // 지난 날짜의 체크만 비웁니다. 다른 저장 키에는 접근하지 않습니다.
          save(userId, state);
        }
      } catch (_) {
        volatileUsers.add(userId);
        if (!state || state.date !== date) state = { date, completed: new Set() };
      }
    }
    memory.set(userId, state);
    return state;
  }

  function scheduleReset() {
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetTimer = 0;
      refresh();
    }, DAY_MS - ((Date.now() + KOREA_OFFSET) % DAY_MS) + 50);
  }

  function refresh() {
    const states = new Map();
    const inputs = document.querySelectorAll("#appScreen .routine-completion-input");
    inputs.forEach(input => {
      const control = controls.get(input);
      if (!control) return;
      if (!states.has(control.userId)) states.set(control.userId, read(control.userId));
      const state = states.get(control.userId);
      input.checked = state.completed.has(control.token);
      control.date = state.date;
    });
    if (inputs.length) scheduleReset();
  }

  function createControl(entry, options) {
    const context = options?.exerciseReplacementContext;
    const userId = String(options?.userId || "");
    if (!userId || context?.userId !== userId || !context.routineId || !context.revision ||
        !["assigned", "tutorial"].includes(context.sourceKind)) return null;

    // 원본 위치는 entry.order로, 추가 카드는 독립된 UUID로 구분합니다.
    // 같은 종목이어도 패턴과 카드가 다르면 체크를 공유하지 않습니다.
    const token = JSON.stringify([
      context.sourceKind, context.routineId, context.revision, options.patternDay,
      options.addedRow ? ["added", options.addedRow.id] : ["original", entry.order],
      entry.exerciseId
    ]);
    const state = read(userId);
    const label = document.createElement("label");
    label.className = "routine-completion";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "routine-completion-input";
    input.checked = state.completed.has(token);
    const text = document.createElement("span");
    text.textContent = "수행완료";
    label.append(input, text);
    const control = { userId, token, date: state.date };
    controls.set(input, control);
    input.addEventListener("change", () => {
      const app = label.closest("#appScreen");
      if (!label.isConnected || !app || app.hidden) return;
      const next = read(userId);
      // 잠든 탭이 자정 뒤 처음 눌린 경우에도 새 날짜의 첫 체크로 처리합니다.
      const checked = control.date !== next.date ? true : input.checked;
      if (checked) next.completed.add(token);
      else next.completed.delete(token);
      save(userId, next);
      refresh();
    });
    scheduleReset();
    return label;
  }

  window.addEventListener("storage", event => {
    if (event.key === null || event.key.startsWith(PREFIX)) refresh();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  window.MemberWorkoutCompletion = Object.freeze({ createControl });
})();
