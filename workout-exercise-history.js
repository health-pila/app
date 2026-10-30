/* 같은 운동의 자동 저장·직접 입력 기록을 펼칩니다. 기존 사진·메모·회원 저장 데이터는 수정하지 않습니다. */
(() => {
  "use strict";
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const token = "(?:" + uuid + "|[0-9]+-[0-9a-f]+)";
  const typedFile = new RegExp("^weight-sets-v1_(EX[0-9]+|MY_" + uuid + ")_" + token + "\\.png$");
  const legacyFile = new RegExp("^weight-" + token + "\\.png$");
  const exercisePattern = new RegExp("^(?:EX[0-9]+|MY:" + uuid + ")$");
  const tokenPattern = new RegExp("^" + token + "$");
  const ownerPattern = /^[A-Za-z0-9_-]{1,128}$/;
  let sequence = 0;
  function captionName(value) {
    const match = typeof value === "string" && value.match(/^(.+) · 세트별 기록$/u);
    return match ? match[1].normalize("NFC").trim() : "";
  }
  function identify(record, userId) {
    if (!record || !ownerPattern.test(userId) || typeof record.photo_path !== "string") return null;
    const parts = record.photo_path.split("/");
    if (parts.length !== 2 || parts[0] !== userId) return null;
    const typed = parts[1].match(typedFile);
    if (typed) return { id: typed[1].replace(/^MY_/, "MY:"), name: captionName(record.caption) };
    const name = captionName(record.caption);
    return name && legacyFile.test(parts[1]) ? { id: "", name } : null;
  }
  function createPhotoPath(userId, exerciseId, fileToken) {
    if (!ownerPattern.test(userId) || !exercisePattern.test(exerciseId) || !tokenPattern.test(fileToken)) {
      throw new Error("저장할 운동 정보를 확인할 수 없어요.");
    }
    return userId + "/weight-sets-v1_" + exerciseId.replace(":", "_") + "_" + fileToken + ".png";
  }
  function isCapturePhoto(record, userId) {
    if (!record || !ownerPattern.test(userId) || typeof record.photo_path !== "string") return false;
    const parts = record.photo_path.split("/");
    return parts.length === 2 && parts[0] === userId &&
      (typedFile.test(parts[1]) || legacyFile.test(parts[1]));
  }
  // 한글 음절을 분해해 중성 ㅐ/ㅔ만 통일합니다. 표시 이름과 다른 모음은 변경하지 않습니다.
  const normalizedName = value => String(value || '').normalize('NFD')
    .replace(/\u1162/gu, '\u1166').replace(/\u3150/gu, '\u3154')
    .replace(/\s+/gu, '').normalize('NFC');
  function identities(record, userId) {
    if (!record || (record.user_id && record.user_id !== userId)) return [];
    const photo = identify(record, userId);
    if (photo) return [{ exercise: photo, index: null }];
    if (record.photo_path !== null) return [];
    return (window.WorkoutSetRecords?.clean(record.set_records) || []).map((e,index) => ({exercise:{id:'',name:e.name}, index}));
  }
  function matchingRecords(record, records, userId, exerciseIndex) {
    const source = identities(record, userId).find(item => item.index === (exerciseIndex ?? null))?.exercise;
    if (!source) return {rows:[],ambiguous:false};
    const candidates = records.flatMap(row => identities(row,userId).map(item => ({row,...item})));
    const names = new Map();
    function remember(id, name) {
      const key = normalizedName(name);
      if (!id || !key) return;
      if (!names.has(key)) names.set(key,new Set());
      names.get(key).add(id);
    }
    (window.ExerciseDB?.getActiveExercises() || []).forEach(e => remember(e.exerciseId,e.name));
    if (window.MemberCustomExercises?.getUserId?.() === userId) {
      (window.MemberCustomExercises.getExercises?.() || []).forEach(e => remember(e.exerciseId,e.name));
    }
    candidates.forEach(item => remember(item.exercise.id,item.exercise.name));
    remember(source.id,source.name);
    function key(exercise) {
      if (exercise.id) return 'id:'+exercise.id;
      const name=normalizedName(exercise.name),ids=names.get(name)||new Set();
      if(ids.size>1)return null;
      return ids.size===1?'id:'+([...ids][0]):'name:'+name;
    }
    const ownKey=key(source), found=new Map();
    if(ownKey) candidates.forEach(item => {
      if(String(item.row.id)===String(record.id)||key(item.exercise)!==ownKey)return;
      if(item.index===null) {if(!found.has(item.row.id))found.set(item.row.id,item.row);return;}
      if(!found.has(item.row.id))found.set(item.row.id,{...item.row,set_records:[]});
      found.get(item.row.id).set_records.push(item.row.set_records[item.index]);
    });
    const rows=[...found.values()];
    const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
    rows.sort((a,b)=>timestamp(b.taken_at)-timestamp(a.taken_at)||timestamp(b.created_at)-timestamp(a.created_at)||String(b.id).localeCompare(String(a.id)));
    return {rows,ambiguous:ownKey===null};
  }
  function node(tag, className, text) {
    const result = document.createElement(tag); result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function createControl(record, context, actions, exerciseIndex) {
    const identity = identities(record, context.userId).find(item => item.index === (exerciseIndex ?? null));
    if (!identity) return null;
    const root = node("section", "workout-exercise-history");
    const toggle = node("button", "workout-exercise-history-toggle", "이 운동의 기록 모아보기");
    toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
    const panel = node("div", "workout-exercise-history-panel");
    panel.id = "workout-exercise-history-" + (++sequence); panel.hidden = true;
    toggle.setAttribute("aria-controls", panel.id);
    const status = node("p", "workout-exercise-history-status"); status.setAttribute("role", "status");
    const list = node("div", "workout-exercise-history-list");
    const retry = node("button", "workout-exercise-history-more", "다시 불러오기");
    retry.type = "button"; retry.hidden = true;
    const more = node("button", "workout-exercise-history-more", "이전 기록 더 보기");
    more.type = "button"; more.hidden = true;
    panel.append(status, list, retry, more);
    if (actions) {
      actions.append(toggle);
      root.hidden = true;
    } else root.append(toggle);
    root.append(panel);
    let rows = null, count = 0, loading = false;
    const current = () => root.isConnected && context.isCurrent();
    function appendPage() {
      if (!current() || !rows || panel.hidden) return;
      const end = Math.min(count + 5, rows.length);
      for (; count < end; count++) {
        const row = rows[count], item = node("article", "workout-exercise-history-item");
        const date = node("time", "workout-exercise-history-date", "운동 날짜: " + context.formatDay(row.taken_at));
        date.dateTime = row.taken_at;
        item.append(date);
        const tables = row.photo_path === null ? window.WorkoutSetRecords?.render(row.set_records) : null;
        if (tables) item.append(tables); else item.append(context.createPhoto(row));
        if (!tables && row.caption) item.append(node("p", "workout-exercise-history-caption", row.caption));
        list.append(item);
      }
      more.hidden = count >= rows.length;
    }
    async function load() {
      if (!current() || loading) return;
      loading = true; retry.hidden = true; more.hidden = true;
      status.textContent = "기록을 불러오고 있어요."; panel.setAttribute("aria-busy", "true");
      try {
        const records = await context.loadRecords();
        if (!current()) return;
        const result = matchingRecords(record, records, context.userId, exerciseIndex);
        rows = result.rows;
        status.textContent = result.ambiguous ? "운동명이 같은 기록이 있어 이전 기록의 운동을 정확히 구분할 수 없어요."
          : rows.length ? "같은 운동의 다른 기록 " + rows.length + "개"
            : "같은 운동의 다른 세트 기록이 아직 없어요.";
        appendPage();
      } catch (error) {
        if (!current()) return;
        status.textContent = "기록을 불러오지 못했어요. 다시 시도해주세요."; retry.hidden = false;
      } finally { loading = false; panel.setAttribute("aria-busy", "false"); }
    }
    toggle.addEventListener("click", () => {
      if (!current()) return;
      const opening = panel.hidden;
      panel.hidden = !opening; toggle.setAttribute("aria-expanded", String(opening));
      if (actions) root.hidden = !opening;
      toggle.textContent = opening ? "모아본 기록 접기" : "이 운동의 기록 모아보기";
      if (opening) {
        if (rows === null) void load();
        else if (count === 0) appendPage();
      }
    });
    retry.addEventListener("click", () => { if (current()) void load(); });
    more.addEventListener("click", appendPage);
    return root;
  }
  window.WorkoutExerciseHistory = Object.freeze({ createPhotoPath, createControl, isCapturePhoto });
})();
