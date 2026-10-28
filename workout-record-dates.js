/* 운동 날짜는 기존 taken_at에, 실제 저장 일시는 DB의 created_at에 남깁니다. */
(() => {
  "use strict";
  const dateFormat = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const timeFormat = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  function dayKey(value = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function parseDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1) return null;
    const date = new Date(0);
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return dayKey(date) === value ? date : null;
  }
  function initialDay(preferred, today = new Date()) {
    return parseDay(preferred) && preferred <= dayKey(today) ? preferred : dayKey(today);
  }
  function prepare(input, preferred) {
    input.max = dayKey();
    input.value = initialDay(preferred);
    input.setCustomValidity("");
  }
  function read(input, reference = new Date()) {
    input.max = dayKey();
    const day = parseDay(input.value);
    const error = !day ? "운동한 날짜를 선택해 주세요." : input.value > input.max ? "오늘 또는 이전 날짜를 선택해 주세요." : "";
    input.setCustomValidity(error);
    if (error) { input.reportValidity(); return null; }
    const date = new Date(reference);
    if (!Number.isFinite(date.getTime())) return null;
    // 날짜 문자열을 UTC로 해석하지 않습니다. 기존 달력과 동일한 기기 현지 날짜를 사용합니다.
    date.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    return date;
  }
  function formatDay(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? dateFormat.format(date) : "";
  }
  function formatTime(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? timeFormat.format(date) : "";
  }
  window.WorkoutRecordDates = Object.freeze({ dayKey, initialDay, prepare, read, formatDay, formatTime });
})();
