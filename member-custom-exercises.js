/* 개인 운동은 공식 ExerciseDB와 분리하며 로그인 회원의 목록만 메모리에 유지합니다. */
(() => {
  "use strict";
  const idPattern = /^MY:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  let client = null, userId = "", generation = 0, loadId = 0, exercises = new Map(), pending = null, lastError = null;
  const isPersonalId = id => typeof id === "string" && idPattern.test(id);
  function normalizeName(value) {
    if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(value)) {
      throw new Error("운동명에는 보이지 않는 특수문자나 줄바꿈을 넣을 수 없어요.");
    }
    const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!name || Array.from(name).length > 60) throw new Error("운동명을 1 ~ 60자로 입력해 주세요.");
    return name;
  }
  const nameKey = value => normalizeName(value).replace(/\s/gu, "").toLocaleLowerCase();
  function toExercise(row) {
    const exerciseId = "MY:" + row?.id;
    if (!isPersonalId(exerciseId) || row.user_id !== userId) throw new Error("INVALID_PERSONAL_EXERCISE");
    const name = normalizeName(row.name);
    return Object.freeze({ exerciseId, name, personal: true, enabled: true,
      bodyParts: Object.freeze([]), exerciseType: null, difficulty: null,
      imageUrl: "", videoUrl: "", defaultGifUrl: "", checklist: Object.freeze([]) });
  }
  function changed() { window.dispatchEvent(new Event("memberpersonalexerciseschange")); }
  function reset() {
    generation++; loadId++; client = null; userId = ""; exercises = new Map(); pending = null; lastError = null;
    changed();
  }
  async function load(force = false) {
    if (pending && !force) return pending;
    if (!client || !userId) return false;
    const ticket = generation, request = ++loadId, owner = userId, requestClient = client;
    const task = (async () => {
      let timer;
      try {
        const response = await Promise.race([
          requestClient.rpc("get_member_custom_exercises"),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("PERSONAL_EXERCISES_TIMEOUT")), 10000); })
        ]);
        if (ticket !== generation || request !== loadId || owner !== userId) return false;
        if (response.error) throw response.error;
        if (!Array.isArray(response.data)) throw new Error("INVALID_PERSONAL_EXERCISES");
        const next = new Map();
        response.data.forEach(row => { const exercise = toExercise(row); if (next.has(exercise.exerciseId)) throw new Error("DUPLICATE_PERSONAL_ID"); next.set(exercise.exerciseId, exercise); });
        exercises = next; lastError = null; changed(); return true;
      } catch (error) {
        if (ticket === generation && request === loadId && owner === userId) lastError = error;
        return false;
      } finally { clearTimeout(timer); }
    })();
    pending = task;
    return task;
  }
  function start(nextClient, id) {
    reset(); client = nextClient; userId = String(id); void load();
  }
  function accept(row) {
    const exercise = toExercise(row); loadId++; lastError = null; exercises.set(exercise.exerciseId, exercise); changed(); return exercise;
  }
  // 공식 ID는 ExerciseDB에서, 개인 ID는 로그인 회원의 목록에서만 조회합니다.
  function getExerciseById(id) {
    return isPersonalId(id) ? exercises.get(id) || null : window.ExerciseDB?.getExerciseById(id) || null;
  }
  new MutationObserver(() => { if (document.getElementById("appScreen")?.hidden && userId) reset(); })
    .observe(document.getElementById("appScreen"), { attributes: true, attributeFilter: ["hidden"] });
  window.MemberCustomExercises = Object.freeze({ start, reset, ready: () => pending || Promise.resolve(false),
    refresh: () => load(true), accept, getExerciseById, isPersonalId, normalizeName, nameKey,
    getExercises: () => [...exercises.values()], getUserId: () => userId, getError: () => lastError });
})();
