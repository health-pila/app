// 유산소 프로그램 문구·시간·속도는 아래 CARDIO_PROGRAM_GROUPS에서 수정합니다.
// minutes: 총 소요 시간, level: 1=저강도 / 2=중강도 / 3=고강도.
// steps: [구간 이름, 운동 방법, 구간 시간]. 총 시간과 각 단계의 합을 맞춰주세요.
// guidance: 각 프로그램의 하단 안내문. 속도는 참고값이며 강도는 RPE와 호흡 상태를 우선합니다.
const CARDIO_PROGRAM_GROUPS = [
  {
    "id": "weight",
    "title": "체중감량",
    "icon": "flame",
    "programs": [
      {
        "id": "weight-low",
        "level": 1,
        "name": "부담 없이 걷기",
        "minutes": 20,
        "steps": [
          [
            "준비운동",
            "편하게 걷기 · 3 ~ 4 km/h",
            "5분"
          ],
          [
            "일정한 속도로 걷기",
            "가볍게 걷기 · 4 ~ 5 km/h · 강도 3 ~ 4/10",
            "10분"
          ],
          [
            "마무리",
            "3 ~ 3.5 km/h로 서서히 속도 낮추기",
            "5분"
          ]
        ],
        "guidance": "대화가 편안하게 가능한 강도로 걷고, 체력에 맞춰 조절해주세요."
      },
      {
        "id": "weight-medium",
        "level": 2,
        "name": "꾸준히 빠르게 걷기",
        "minutes": 30,
        "steps": [
          [
            "준비운동",
            "편하게 걷기 · 3 ~ 4 km/h",
            "5분"
          ],
          [
            "빠르게 걷기",
            "빠른 걸음 · 4.8 ~ 6 km/h · 강도 5 ~ 6/10",
            "20분"
          ],
          [
            "마무리",
            "3 ~ 4 km/h로 서서히 속도 낮추기",
            "5분"
          ]
        ],
        "guidance": "대화는 가능하지만 노래하기는 어려운 정도로 유지해주세요."
      },
      {
        "id": "weight-high",
        "level": 3,
        "name": "걷기와 달리기 번갈아",
        "minutes": 30,
        "steps": [
          [
            "준비운동",
            "편하게 걷기 · 3.5 ~ 4.5 km/h",
            "5분"
          ],
          [
            "인터벌 · 4회 반복",
            "달리기 2분(6.5 ~ 8.5 km/h) + 걷기 3분(4 ~ 5 km/h)",
            "20분"
          ],
          [
            "마무리",
            "3 ~ 4 km/h로 천천히 걸으며 호흡 정리",
            "5분"
          ]
        ],
        "guidance": "달릴 때 강도 7 ~ 8/10을 목표로 하되, 부담스럽다면 속도를 낮춰주세요."
      }
    ]
  },
  {
    "id": "fitness",
    "title": "체력강화",
    "icon": "heart",
    "programs": [
      {
        "id": "fitness-low",
        "level": 1,
        "name": "기초 체력 차근차근",
        "minutes": 20,
        "steps": [
          [
            "준비운동",
            "편하게 걷기 · 3 ~ 4 km/h",
            "5분"
          ],
          [
            "리듬 있게 걷기",
            "일정하게 걷기 · 4 ~ 5.2 km/h · 강도 3 ~ 4/10",
            "10분"
          ],
          [
            "마무리",
            "3 ~ 3.5 km/h로 서서히 속도 낮추기",
            "5분"
          ]
        ],
        "guidance": "대화가 편안한 강도로 시작해 규칙적인 걷기에 익숙해져 보세요."
      },
      {
        "id": "fitness-medium",
        "level": 2,
        "name": "걷기·조깅 지속력 강화",
        "minutes": 25,
        "steps": [
          [
            "준비운동",
            "편하게 걷기 · 3.5 ~ 4.5 km/h",
            "5분"
          ],
          [
            "일정한 페이스 유지",
            "빠른 걷기 4.8 ~ 6 km/h 또는 느린 조깅 · 강도 5 ~ 6/10",
            "15분"
          ],
          [
            "마무리",
            "3 ~ 4 km/h로 천천히 걸으며 호흡 정리",
            "5분"
          ]
        ],
        "guidance": "대화가 가능한 강도를 유지하고, 조깅이 버거우면 빠른 걷기로 조절해주세요."
      },
      {
        "id": "fitness-high",
        "level": 3,
        "name": "심폐 체력까지 업",
        "minutes": 30,
        "steps": [
          [
            "준비운동",
            "편하게 걷기 · 3.5 ~ 4.5 km/h",
            "5분"
          ],
          [
            "인터벌 · 4회 반복",
            "달리기 3분(7 ~ 9 km/h) + 걷기 2분(4 ~ 5 km/h)",
            "20분"
          ],
          [
            "마무리",
            "3 ~ 4 km/h로 천천히 걸으며 호흡 정리",
            "5분"
          ]
        ],
        "guidance": "달릴 때 강도 7 ~ 8/10을 목표로 하며, 무리된다면 걷기로 전환해주세요."
      }
    ]
  }
];

(() => {
  "use strict";
  const app = document.getElementById("appScreen");
  const assigned = document.getElementById("memberAssignedRoutinePanel");
  const cardio = document.getElementById("memberCardioPanel");
  const stretching = document.getElementById("memberStretchingPanel");
  const heading = document.getElementById("memberRoutinePageHeading");
  const intro = document.getElementById("memberCardioIntro");
  const buttons = Array.from(document.querySelectorAll("[data-routine-menu]"));
  if (!app || !assigned || !cardio || !stretching || !heading || buttons.length !== 3) return;
  const restoreKey = "memberRoutineMenuBeforeRefresh";
  let currentUserId = "";
  let selected = "assigned";
  const intensityGuidance = {
    1: "저강도 (3 ~ 4/10): 호흡이 편안하고 자연스럽게 대화할 수 있는 정도.",
    2: "중강도 (5 ~ 6/10): 호흡이 빨라지고 대화는 가능하지만 노래하기는 어려운 정도.",
    3: "고강도 (7 ~ 8/10): 호흡이 많이 빨라지고 짧은 말만 가능한 정도."
  };
  const intensityPriority = "속도는 참고값이에요. 개인 체력에 따라 같은 속도에서도 강도가 달라지므로, 속도보다 자각운동강도(RPE, 0 ~ 10점)와 호흡 상태를 우선 기준으로 조절해주세요.";
  const safetyGuidance = "운동 중 가슴 통증, 어지럼증, 비정상적인 호흡곤란 등이 발생하면 즉시 운동을 중단해주세요.";


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

  // 공통 안내는 기본으로 접어두고 아래 운동 카드와 같은 방식으로 펼칩니다.
  const commonGuidance = element("details", "cardio-common-guidance");
  const commonSummary = element("summary", "cardio-common-guidance-summary");
  const commonTitle = element("h3", "", "운동 전 확인해주세요");
  commonTitle.id = "cardioCommonGuidanceTitle";
  commonGuidance.setAttribute("aria-labelledby", commonTitle.id);
  const commonAction = element("span", "cardio-common-guidance-action");
  commonAction.setAttribute("aria-hidden", "true");
  commonAction.append(icon("chevron"));
  commonSummary.append(commonTitle, commonAction);
  const commonContent = element("div", "cardio-common-guidance-content");
  commonContent.append(
    element("p", "", intensityPriority),
    element("p", "", safetyGuidance)
  );
  commonGuidance.append(commonSummary, commonContent);
  cardio.append(commonGuidance);

  CARDIO_PROGRAM_GROUPS.forEach(group => {
    const section = element("section", "cardio-program-group");
    const groupTitle = element("div", "cardio-group-heading");
    const title = element("h3", "", group.title);
    title.id = `cardioGroup-${group.id}`;
    section.setAttribute("aria-labelledby", title.id);
    groupTitle.append(icon(group.icon), title);
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
      const guidance = element("p", "cardio-program-guidance", program.guidance);
      guidance.append(
        document.createElement("br"), document.createElement("br"),
        document.createTextNode(intensityGuidance[program.level])
      );
      content.append(steps, guidance);
      details.append(summary, content);
      section.append(details);
    });
    cardio.append(section);
  });

  function select(menu) {
    if (!["assigned", "cardio", "stretching"].includes(menu)) return;
    if (menu !== "assigned") window.RoutineComponents?.closeMediaWithin(assigned);
    selected = menu;
    assigned.hidden = menu !== "assigned";
    cardio.hidden = menu !== "cardio";
    stretching.hidden = menu !== "stretching";
    window.StretchingVideos?.setMemberVisible(menu === "stretching");
    heading.textContent = menu === "stretching" ? "스트레칭" : menu === "cardio" ? "나에게 맞는 유산소" : "나에게 맞춘 운동 루틴";
    heading.classList.toggle("is-cardio-heading", menu === "cardio");
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
      if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
      else if (event.key === "ArrowLeft") next = (index + buttons.length - 1) % buttons.length;
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
