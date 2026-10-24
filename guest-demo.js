/* 가입 전 체험: 공개 샘플만 사용하며 인증/DB/회원 저장 공간에 접근하지 않습니다. */
(function () {
  "use strict";
  const login = document.getElementById("loginScreen");
  const dialog = document.getElementById("guestDemoDialog");
  const content = document.getElementById("guestDemoContent");
  const cards = document.getElementById("guestDemoRoutineCards");
  const openButton = document.getElementById("openGuestDemo");
  const closeButton = document.getElementById("closeGuestDemo");
  const signupButton = document.getElementById("guestDemoSignup");
  if (!login || !dialog || !content || !cards || !openButton || !closeButton || !signupButton) return;

  const records = new Map();
  const demoStorage = {
    getItem: key => records.has(key) ? records.get(key) : null,
    setItem: (key, value) => { records.set(key, String(value)); },
    removeItem: key => { records.delete(key); }
  };
  const imageUrls = {
    EX001: "images/demo/leg-press.jpg",
    EX002: "images/demo/lat-pulldown.jpg"
  };
  const sample = {
    routineSummary: "운동 루틴을 둘러보는 체험용 예시입니다. 회원가입 후 운동 구성 신청서를 작성하면, 센터가 회원님께 맞는 루틴을 배정해드려요.",
    days: [{ day: 1, exercises: [
      { exerciseId: "EX001", order: 1, sets: 3, reps: 12, restSec: 60 },
      { exerciseId: "EX002", order: 2, sets: 3, reps: 12, restSec: 60 }
    ] }]
  };
  let bodyStyle = null, returnFocus = null, nextAction = "", closing = false;
  let scrollPosition = { left: 0, top: 0 };
  let hasHistoryEntry = false;
  const historyKey = "guest-demo-v1";

  function build() {
    records.clear();
    cards.replaceChildren();
    if (!window.RoutineComponents || !window.ExerciseDB) throw new Error("Components unavailable");
    const routine = window.RoutineComponents.parseRoutineJson(JSON.stringify(sample));
    const preview = window.RoutineComponents.renderRoutine(routine, {
      layout: "tabs", userId: "guest-demo", weightStorage: demoStorage, imageUrls
    });
    preview.querySelector(".routine-pattern-tabs").remove();
    preview.querySelector(".routine-pattern-caption").remove();
    preview.querySelector(".routine-component-summary")?.remove();
    const panel = preview.querySelector(".routine-pattern-panel");
    panel.removeAttribute("role");
    panel.removeAttribute("aria-labelledby");
    panel.removeAttribute("tabindex");
    cards.append(preview);
  }

  function open(pushHistory = true) {
    if (login.hidden || dialog.open || closing) return;
    returnFocus = document.activeElement;
    scrollPosition = { left: window.scrollX, top: window.scrollY };
    bodyStyle = document.body.style.cssText;
    try {
      build();
    } catch (_) {
      const message = document.createElement("p");
      message.className = "guest-demo-description";
      message.textContent = "체험 화면을 불러오지 못했어요. 창을 닫고 새로고침한 뒤 다시 시도해 주세요.";
      cards.replaceChildren(message);
    }
    dialog.showModal();
    document.body.style.overflow = "hidden";
    content.scrollTop = 0;
    document.getElementById("guestDemoTitle").focus({ preventScroll: true });
    nextAction = "";
    if (pushHistory) {
      try {
        history.pushState({ ...history.state, guestDemo: historyKey }, "", location.href);
        hasHistoryEntry = true;
      } catch (_) { hasHistoryEntry = false; }
    } else hasHistoryEntry = true;
  }

  function finishClose() {
    // 확대 사진은 공용 컴포넌트에서 별도 dialog로 열립니다. 닫기 이벤트로 원래 스크롤을 복원합니다.
    window.RoutineComponents?.closeMediaWithin(dialog);
    if (dialog.open) dialog.close();
    cleanup();
  }

  function requestClose(action = "") {
    if (!dialog.open || closing) return;
    closing = true;
    nextAction = action;
    if (hasHistoryEntry && history.state?.guestDemo === historyKey) history.back();
    else finishClose();
  }

  function cleanup() {
    if (bodyStyle === null) return;
    window.RoutineComponents?.closeMediaWithin(dialog);
    cards.replaceChildren();
    records.clear();
    if (bodyStyle !== null) document.body.style.cssText = bodyStyle;
    bodyStyle = null;
    window.scrollTo({ ...scrollPosition, behavior: "instant" });
    const action = nextAction;
    nextAction = ""; closing = false; hasHistoryEntry = false;
    if (action === "signup" && !login.hidden) {
      if (document.getElementById("signupForm").hidden) document.getElementById("showSignupButton").click();
      else document.getElementById("signupName").focus();
    } else if (!login.hidden && returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
  }
  dialog.addEventListener("close", () => { if (!dialog.open) cleanup(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); requestClose(); });
  openButton.addEventListener("click", () => open());
  closeButton.addEventListener("click", () => requestClose());
  signupButton.addEventListener("click", () => requestClose("signup"));
  dialog.querySelectorAll("[data-demo-jump]").forEach(button => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.demoJump).scrollIntoView({ behavior: "instant", block: "start" });
    });
  });
  window.addEventListener("popstate", event => {
    if (event.state?.guestDemo === historyKey && !login.hidden) open(false);
    else if (dialog.open) finishClose();
  });
  new MutationObserver(() => {
    if (login.hidden && dialog.open) requestClose();
  }).observe(login, { attributes: true, attributeFilter: ["hidden"] });
})();

