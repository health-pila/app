// 유산소 프로그램 문구·시간·속도는 아래 CARDIO_PROGRAM_GROUPS에서 수정합니다.
// minutes: 총 소요 시간, level: 1=저강도 / 2=중강도 / 3=고강도.
// steps: [구간 이름, 운동 방법, 구간 시간]. 총 시간과 구간 시간의 합을 함께 맞춰주세요.
const CARDIO_PROGRAM_GROUPS = [
  {
    id: "weight", title: "체중감량", icon: "flame",
    programs: [
      { id: "weight-low", level: 1, name: "부담 없이 걷기", minutes: 20,
        steps: [["준비운동", "편하게 걷기 · 3 ~ 4 km/h", "5분"], ["일정한 속도로 걷기", "걷기 · 4 ~ 5 km/h", "10분"], ["마무리", "속도를 서서히 낮추기", "5분"]] },
      { id: "weight-medium", level: 2, name: "꾸준히 빠르게 걷기", minutes: 30,
        steps: [["준비운동", "편하게 걷기 · 3 ~ 4 km/h", "5분"], ["빠르게 걷기", "빠른 걸음 · 5 ~ 6 km/h", "20분"], ["마무리", "속도를 서서히 낮추기", "5분"]] },
      { id: "weight-high", level: 3, name: "걷기와 달리기 번갈아", minutes: 30,
        steps: [["준비운동", "걷기에서 가벼운 달리기로", "5분"], ["인터벌 · 4회 반복", "달리기 2분 + 걷기 3분", "20분"], ["마무리", "천천히 걸으며 호흡 정리", "5분"]] }
    ]
  },
  {
    id: "fitness", title: "체력강화", icon: "heart",
    programs: [
      { id: "fitness-low", level: 1, name: "기초 체력 차근차근", minutes: 15,
        steps: [["준비운동", "편하게 걷기 · 3 ~ 4 km/h", "3분"], ["빠르게 걷기", "빠른 걸음 · 5 ~ 6 km/h", "9분"], ["마무리", "속도를 서서히 낮추기", "3분"]] },
      { id: "fitness-medium", level: 2, name: "달리기 지속력 강화", minutes: 20,
        steps: [["준비운동", "편하게 걷기에서 시작", "5분"], ["일정한 페이스 유지", "8 ~ 10 km/h", "10분"], ["마무리", "천천히 걸으며 호흡 정리", "5분"]] },
      { id: "fitness-high", level: 3, name: "심폐 체력까지 업", minutes: 30,
        steps: [["준비운동", "걷기에서 가벼운 달리기로", "5분"], ["인터벌 · 4회 반복", "달리기 3분 + 걷기 2분", "20분"], ["마무리", "천천히 걸으며 호흡 정리", "5분"]] }
    ]
  }
];

(() => {
  "use strict";
  const app = document.getElementById("appScreen");
  const assigned = document.getElementById("memberAssignedRoutinePanel");
  const cardio = document.getElementById("memberCardioPanel");
  const heading = document.getElementById("memberRoutinePageHeading");
  const intro = document.getElementById("memberCardioIntro");
  const buttons = Array.from(document.querySelectorAll("[data-routine-menu]"));
  if (!app || !assigned || !cardio || !heading || buttons.length !== 2) return;
  const restoreKey = "memberRoutineMenuBeforeRefresh";
  let currentUserId = "";
  let selected = "assigned";

  const icons = {
    flame: '<path d="M12 3c2 4 7 6 7 11a7 7 0 0 1-14 0c0-3 2-5 4-7 0 3 1 4 2 4 1-2 2-5 1-8Z"/>',
    heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-3 3-1 7 1 9l7 7 7-7c2-2 4-6 1-9Z"/><path d="M3 12h5l2-4 4 8 2-4h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>'
  };
  function icon(name) {
    const holder = document.createElement("span");
    holder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + icons[name] + '</svg>';
    return holder.firstElementChild;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  CARDIO_PROGRAM_GROUPS.forEach(group => {
    const section = element("section", "cardio-program-group");
    const groupTitle = element("div", "cardio-group-heading");
    const title = element("h3", "", group.title);
    title.id = `cardioGroup-${group.id}`;
    section.setAttribute("aria-labelledby", title.id);
    groupTitle.append(icon(group.icon), title, element("small", "", `${group.programs.length}가지 프로그램`));
    section.append(groupTitle);
    group.programs.forEach(program => {
      const details = element("details", "cardio-program-card");
      details.id = `cardioProgram-${program.id}`;
      const summary = element("summary", "cardio-program-summary");
      const meta = element("span", "cardio-program-meta");
      const level = element("span", "cardio-program-level");
      const bars = element("span", "cardio-level-bars");
      bars.setAttribute("aria-hidden", "true");
      for (let index = 1; index <= 3; index++) bars.append(element("i", index <= program.level ? "is-lit" : ""));
      level.append(bars, document.createTextNode(["저강도", "중강도", "고강도"][program.level - 1]));
      const time = element("span", "cardio-program-time");
      time.append(icon("clock"), document.createTextNode(`총 ${program.minutes}분`));
      meta.append(level, time);
      const action = element("span", "cardio-program-action");
      action.append(element("span", "cardio-open-label", "운동 방법 보기"), element("span", "cardio-close-label", "운동 방법 접기"), icon("chevron"));
      summary.append(meta, element("strong", "cardio-program-name", program.name), action);
      const content = element("div", "cardio-program-content");
      content.append(element("p", "cardio-program-equipment", "러닝머신 기준"));
      const steps = element("ol", "cardio-program-steps");
      program.steps.forEach((step, index) => {
        const row = element("li", "cardio-program-step");
        const number = element("span", "cardio-step-number", String(index + 1));
        number.setAttribute("aria-hidden", "true");
        const description = element("div", "cardio-step-description");
        description.append(element("strong", "", step[0]), element("p", "", step[1]));
        row.append(number, description, element("span", "cardio-step-time", step[2]));
        steps.append(row);
      });
      content.append(steps, element("p", "cardio-program-guidance", "속도는 참고값이에요. 무리하지 않는 범위에서 자신의 체력에 맞춰 조절해주세요."));
      details.append(summary, content);
      section.append(details);
    });
    cardio.append(section);
  });

  function select(menu) {
    if (menu !== "assigned" && menu !== "cardio") return;
    if (menu === "cardio") window.RoutineComponents?.closeMediaWithin(assigned);
    selected = menu;
    assigned.hidden = menu !== "assigned";
    cardio.hidden = menu !== "cardio";
    heading.textContent = menu === "cardio" ? "나에게 맞는 유산소" : "나에게 맞춘 운동 루틴";
    if (intro) intro.hidden = menu !== "cardio";
    buttons.forEach(button => {
      const active = button.dataset.routineMenu === menu;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => select(button.dataset.routineMenu));
    button.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = 1 - index;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else return;
      event.preventDefault();
      select(buttons[next].dataset.routineMenu);
      buttons[next].focus({ preventScroll: true });
    });
  });

  function reset() {
    currentUserId = "";
    select("assigned");
    cardio.querySelectorAll("details[open]").forEach(details => { details.open = false; });
    try { sessionStorage.removeItem(restoreKey); } catch (_) {}
  }
  function start(userId) {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(restoreKey)); } catch (_) {}
    reset();
    currentUserId = String(userId);
    if (saved?.userId === currentUserId) select(saved.menu);
  }
  document.getElementById("refreshMemberAppButton")?.addEventListener("click", () => {
    if (!currentUserId || app.hidden) return;
    try { sessionStorage.setItem(restoreKey, JSON.stringify({ userId: currentUserId, menu: selected })); } catch (_) {}
  });
  window.MemberCardioPrograms = Object.freeze({ start, reset });
})();
