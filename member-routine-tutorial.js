/* 공통 튜토리얼은 배정 데이터로 저장하지 않고, 확인된 미신청 회원에게만 표시합니다. */
(() => {
  "use strict";
  const exercises = Object.freeze(["EX016", "EX005", "EX002", "EX006", "EX003"].map((exerciseId, index) =>
    Object.freeze({ exerciseId, order: index + 1, sets: 2, reps: 15, restSec: 60 })));
  const routine = Object.freeze({
    days: Object.freeze([Object.freeze({ day: 1, exercises })]),
    routineSummary: "공통 튜토리얼 루틴"
  });

  async function readHistory(client, userId) {
    // 대기 중인 신청뿐 아니라 완료된 신청과 비활성 과거 배정도 확인합니다.
    // 기존 RLS 아래 본인 행의 존재 여부만 조회하며 데이터를 생성·수정하지 않습니다.
    const results = await Promise.all([
      client.from("routine_requests").select("id").eq("user_id", userId).limit(1).maybeSingle(),
      client.from("member_routines").select("id").eq("user_id", userId).limit(1).maybeSingle()
    ]);
    results.forEach(result => { if (result.error) throw result.error; });
    return { hasRequested: Boolean(results[0].data), hasAssigned: Boolean(results[1].data) };
  }

  function render({ userId, captureWeightRecord }) {
    const parsed = window.RoutineComponents.parseRoutineJson(JSON.stringify(routine));
    const root = window.RoutineComponents.renderRoutine(parsed, {
      layout: "tabs", userId, captureWeightRecord
      // oneDayPT와 exerciseReplacementContext는 전달하지 않습니다.
    });
    root.classList.add("member-routine-tutorial");
    // 가입 전 미리보기와 동일하게 기존 카드 렌더러에서 단일 패턴만 사용합니다.
    root.querySelector(".routine-pattern-tabs").remove();
    root.querySelector(".routine-pattern-caption").remove();
    root.querySelector(".routine-component-summary").remove();
    const panel = root.querySelector(".routine-pattern-panel");
    panel.removeAttribute("role");
    panel.removeAttribute("aria-labelledby");
    panel.removeAttribute("tabindex");
    panel.setAttribute("aria-label", "튜토리얼 운동");
    // 표시용 띄어쓰기만 적용합니다. 공식 DB·운동 ID·기록 연결은 EX016 그대로입니다.
    root.querySelector('[data-exercise-id="EX016"] .routine-component-name').textContent = "시티드 레그 프레스";
    return root;
  }

  window.MemberRoutineTutorial = Object.freeze({ readHistory, render });
})();
