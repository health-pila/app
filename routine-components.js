// 운동 구성 JSON 검사·카드 표시 및 브라우저에 저장하는 회원별 중량 기록.
(function () {
  "use strict";

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function getPatternLabel(dayNumber) {
    return dayNumber === 4 ? "보너스 패턴" : "패턴 " + dayNumber;
  }

  function parseRoutineJson(text) {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("루틴 JSON 전체를 붙여넣어 주세요.");
    }
    if (text.length > 250000) {
      throw new Error("입력 내용이 너무 큽니다. 회원 한 명의 루틴 JSON만 넣어 주세요.");
    }

    let source;
    try {
      source = JSON.parse(text);
    } catch (error) {
      throw new Error("JSON 문법을 확인해 주세요. 중괄호, 쉼표, 큰따옴표가 빠졌거나 JSON 앞뒤에 다른 글이 포함되어 있을 수 있습니다.");
    }

    const db = window.ExerciseDB;
    if (!db || typeof db.getExerciseById !== "function") {
      throw new Error("운동DB를 불러오지 못했습니다. exercise-data.js 파일과 연결 순서를 확인해 주세요.");
    }
    if (!isObject(source)) {
      throw new Error("JSON의 맨 바깥은 중괄호 { }로 감싼 객체여야 합니다.");
    }

    const errors = [];
    function addError(message) {
      if (errors.length < 20) errors.push(message);
    }
    function checkFields(object, allowed, label) {
      const unknown = Object.keys(object).filter(function (key) {
        return !allowed.includes(key);
      });
      if (unknown.length) {
        addError(label + ": 지원하지 않는 항목이 있습니다 (" + unknown.join(", ") + ").");
      }
    }
    function checkInteger(value, minimum, label) {
      if (!Number.isSafeInteger(value) || value < minimum) {
        addError(label + ": " + minimum + " 이상의 정수를 숫자로 입력해 주세요.");
      }
    }

    checkFields(source, ["routineSummary", "days"], "루틴");
    if (typeof source.routineSummary !== "string" || !source.routineSummary.trim()) {
      addError("routineSummary: 전체 운동 구성 안내문이 필요합니다.");
    }
    if (!Array.isArray(source.days) || source.days.length === 0) {
      addError("days: 운동 패턴을 한 개 이상 넣어 주세요.");
    }

    const dayNumbers = new Set();
    const days = [];
    if (Array.isArray(source.days)) {
      source.days.forEach(function (day, dayIndex) {
        const position = "days의 " + (dayIndex + 1) + "번째 항목";
        if (!isObject(day)) {
          addError(position + ": 운동 패턴 정보는 객체여야 합니다.");
          return;
        }
        checkFields(day, ["day", "exercises"], position);
        checkInteger(day.day, 1, position + "의 day");
        if (Number.isSafeInteger(day.day) && day.day > 0) {
          if (dayNumbers.has(day.day)) addError(getPatternLabel(day.day) + ": 패턴 번호가 중복됐습니다.");
          dayNumbers.add(day.day);
        }
        const dayLabel = Number.isSafeInteger(day.day) && day.day > 0
          ? getPatternLabel(day.day) : position;
        if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
          addError(dayLabel + ": exercises에 운동을 한 개 이상 넣어 주세요.");
          return;
        }

        const orders = new Set();
        const exercises = [];
        day.exercises.forEach(function (entry, exerciseIndex) {
          let label = dayLabel + " · " + (exerciseIndex + 1) + "번째 운동";
          if (!isObject(entry)) {
            addError(label + ": 운동 정보는 객체여야 합니다.");
            return;
          }
          checkFields(entry, ["exerciseId", "order", "sets", "reps", "restSec"], label);
          const exerciseId = typeof entry.exerciseId === "string" ? entry.exerciseId.trim() : "";
          if (exerciseId) label += " (" + exerciseId + ")";
          const exercise = db.getExerciseById(exerciseId);
          if (!exerciseId) {
            addError(label + ": exerciseId가 필요합니다.");
          } else if (!exercise) {
            addError(label + ": 운동DB에 없는 운동ID입니다.");
          } else if (!exercise.enabled) {
            addError(label + ": 현재 사용여부가 Y인 운동이 아닙니다.");
          }

          checkInteger(entry.order, 1, label + "의 order");
          checkInteger(entry.sets, 1, label + "의 sets");
          checkInteger(entry.reps, 1, label + "의 reps");
          checkInteger(entry.restSec, 0, label + "의 restSec");
          if (Number.isSafeInteger(entry.order) && entry.order > 0) {
            if (orders.has(entry.order)) addError(dayLabel + ": order " + entry.order + "가 중복됐습니다.");
            orders.add(entry.order);
          }
          exercises.push({
            exerciseId: exerciseId,
            order: entry.order,
            sets: entry.sets,
            reps: entry.reps,
            restSec: entry.restSec
          });
        });
        exercises.sort(function (a, b) { return a.order - b.order; });
        days.push({ day: day.day, exercises: exercises });
      });
    }
    if (errors.length) {
      throw new Error(errors.join("\n") + (errors.length === 20 ? "\n먼저 위 항목들을 수정한 뒤 다시 검사해 주세요." : ""));
    }
    days.sort(function (a, b) { return a.day - b.day; });
    return { routineSummary: source.routineSummary.trim(), days: days };
  }

  let detailsSequence = 0;
  const contentRefreshers = new WeakMap();
  window.addEventListener('exercisecontentchange', function () {
    // 안내만 갱신합니다. 패턴/중량 입력/종목변경/재생 중인 영상 DOM은 보존합니다.
    document.querySelectorAll('.routine-component-card').forEach(card => contentRefreshers.get(card)?.());
  });
  const openMedia = new Set();
  let mediaObserver = null;

  function safeMediaUrl(value, baseUrl) {
    try {
      const source = String(value || "").trim();
      if (!source) return "";
      const url = new URL(source, baseUrl);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
      return url.href;
    } catch (error) {
      return "";
    }
  }

  function youtubeEmbedUrl(value) {
    const safeUrl = safeMediaUrl(value);
    if (!safeUrl) return "";
    const url = new URL(safeUrl);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    let id = "";
    if (host === "youtu.be") id = parts[0] || "";
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = ["embed", "shorts", "live"].includes(parts[0])
        ? parts[1] || "" : url.searchParams.get("v") || "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return "";
    return "https://www.youtube-nocookie.com/embed/" + id + "?playsinline=1&rel=0";
  }

  let equipmentImageDialog = null;
  let equipmentImageView = null;
  let equipmentImageTitle = null;
  let equipmentImageStatus = null;
  let equipmentImageCloseButton = null;
  let equipmentImageState = null;

  function closeEquipmentImage() {
    if (!equipmentImageState) return;
    const state = equipmentImageState;
    equipmentImageState = null;
    if (equipmentImageDialog.open) equipmentImageDialog.close();
    equipmentImageView.removeAttribute("src");
    equipmentImageView.hidden = true;
    document.body.style.cssText = state.bodyStyle;
    if (state.trigger.isConnected && !state.trigger.closest("[hidden]")) {
      state.trigger.focus({ preventScroll: true });
    }
    window.scrollTo({ left: state.left, top: state.top, behavior: "instant" });
  }

  function openEquipmentImage(trigger, source, name) {
    const src = safeMediaUrl(source.currentSrc || source.src);
    if (!src || source.hidden || !trigger.isConnected || trigger.closest("[hidden]")) return;
    if (!equipmentImageDialog) {
      equipmentImageDialog = element("dialog", "routine-equipment-image-dialog");
      equipmentImageDialog.setAttribute("aria-labelledby", "routineEquipmentImageTitle");
      const header = element("div", "routine-equipment-image-header");
      equipmentImageTitle = element("h2");
      equipmentImageTitle.id = "routineEquipmentImageTitle";
      equipmentImageCloseButton = element("button", "routine-equipment-image-close", "닫기 ×");
      equipmentImageCloseButton.type = "button";
      equipmentImageCloseButton.setAttribute("aria-label", "기구 이미지 확대 닫기");
      equipmentImageCloseButton.addEventListener("click", closeEquipmentImage);
      header.append(equipmentImageTitle, equipmentImageCloseButton);
      equipmentImageView = element("img", "routine-equipment-image-full");
      equipmentImageView.decoding = "async";
      equipmentImageStatus = element("p", "routine-equipment-image-status");
      equipmentImageStatus.setAttribute("role", "status");
      equipmentImageView.addEventListener("load", function () {
        if (!equipmentImageState) return;
        equipmentImageView.hidden = false;
        equipmentImageStatus.hidden = true;
      });
      equipmentImageView.addEventListener("error", function () {
        if (!equipmentImageState) return;
        equipmentImageView.hidden = true;
        equipmentImageStatus.hidden = false;
        equipmentImageStatus.textContent = "이미지를 불러오지 못했어요. 닫은 뒤 다시 눌러 주세요.";
      });
      equipmentImageDialog.append(header, equipmentImageView, equipmentImageStatus);
      equipmentImageDialog.addEventListener("cancel", function (event) {
        event.preventDefault();
        closeEquipmentImage();
      });
      equipmentImageDialog.addEventListener("click", function (event) {
        if (event.target === equipmentImageDialog) closeEquipmentImage();
      });
      equipmentImageDialog.addEventListener("close", function () {
        if (!equipmentImageDialog.open) closeEquipmentImage();
      });
      document.body.append(equipmentImageDialog);
    }
    if (equipmentImageState) return;
    const state = {
      trigger: trigger, left: window.scrollX, top: window.scrollY,
      bodyStyle: document.body.style.cssText
    };
    equipmentImageTitle.textContent = name;
    equipmentImageView.alt = name + " 기구 확대 사진";
    equipmentImageView.hidden = true;
    equipmentImageStatus.hidden = false;
    equipmentImageStatus.textContent = "사진 불러오는 중…";
    equipmentImageDialog.showModal();
    equipmentImageState = state;
    // 확대 중 배경 스크롤을 막고, 닫을 때 원래 위치와 스타일을 돌려놓습니다.
    Object.assign(document.body.style, {
      position: "fixed", top: -state.top + "px", left: -state.left + "px",
      width: "100%", overflow: "hidden"
    });
    equipmentImageView.src = src;
    equipmentImageCloseButton.focus({ preventScroll: true });
    watchMediaVisibility();
  }

  window.addEventListener("pagehide", closeEquipmentImage);

  // 특정 체험/미리보기 영역을 닫을 때 확대 사진과 영상도 즉시 정리합니다.
  function closeMediaWithin(container) {
    if (!container) return;
    if (equipmentImageState && container.contains(equipmentImageState.trigger)) closeEquipmentImage();
    Array.from(openMedia).forEach(function (media) {
      if (container.contains(media.area)) media.close();
    });
  }

  function stopAllVideos() {
    Array.from(openMedia).forEach(function (media) { media.close(); });
  }

  function watchMediaVisibility() {
    if (mediaObserver || !document.body) return;
    // 영역이 삭제되거나 hidden으로 화면이 바뀌면 재생을 종료합니다.
    mediaObserver = new MutationObserver(function () {
      if (equipmentImageState && (!equipmentImageState.trigger.isConnected ||
        equipmentImageState.trigger.closest("[hidden]"))) closeEquipmentImage();
      Array.from(openMedia).forEach(function (media) {
        if (!media.area.isConnected || media.area.closest("[hidden]")) media.close();
      });
    });
    mediaObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"]
    });
  }

  window.addEventListener("pagehide", stopAllVideos);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function preservePagePosition(change) {
    const left = window.scrollX;
    const top = window.scrollY;
    change();
    // 펼치거나 접은 뒤에도 클릭할 때의 화면 위치를 유지합니다.
    window.scrollTo({ left: left, top: top, behavior: "instant" });
  }

  // 첨부 시안의 문서·재생·연필 아이콘. 펼침 상태와 버튼 이름은 따로 유지합니다.
  function setActionButtonContent(button, label, kind, expanded) {
    const paths = {
      details: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 12h8 M8 16h8",
      video: "M7 3 21 12 7 21Z",
      weight: "M16 3a2.8 2.8 0 0 1 4 4L8 19l-6 3 2-6Z M14 5l4 4"
    };
    function icon(className, pathData, filled) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", className);
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", filled ? "currentColor" : "none");
      svg.setAttribute("stroke", filled ? "none" : "currentColor");
      svg.setAttribute("stroke-width", "1.8");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      svg.append(path);
      return svg;
    }
    button.setAttribute("aria-label", label + (expanded ? " 접기" : " 펼치기"));
    button.replaceChildren(
      icon("routine-action-icon", paths[kind], kind === "video"),
      element("span", "routine-action-label", label),
      icon("routine-action-chevron", expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6", false)
    );
  }

  // 회원별·운동별 5세트 기록. 이전 텍스트 메모는 별도 키에 그대로 보존합니다.
  function createWeightRecordControls(exerciseId, exerciseName, userId, panelId, recordStorage, captureRecord) {
    const identity = JSON.stringify([userId, exerciseId]);
    const storageKey = "exerciseWeightSets:" + identity;
    const legacyKey = "exerciseWeightNote:" + identity;
    const fields = [
      { key: "weight", label: "중량(kg)", mode: "decimal", limit: 8 },
      { key: "reps", label: "횟수", mode: "numeric", limit: 5 },
      { key: "comment", label: "코멘트", limit: 120 }
    ];
    const pendingChanges = new Map();
    const inputs = [];
    const emptySets = () => Array.from({ length: 5 }, () => ({ weight: "", reps: "", comment: "" }));

    function readSets() {
      const raw = (recordStorage || localStorage).getItem(storageKey);
      if (raw === null) return emptySets();
      const saved = JSON.parse(raw);
      if (saved?.version !== 1 || !Array.isArray(saved.sets) || saved.sets.length !== 5 ||
        saved.sets.some(set => !set || fields.some(field => typeof set[field.key] !== "string"))) {
        throw new Error("중량 기록 형식을 확인할 수 없습니다.");
      }
      return saved.sets;
    }

    const button = element("button", "routine-weight-button routine-action-with-icon");
    setActionButtonContent(button, "세트 기록", "weight", false);
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", panelId);
    const panel = element("div", "routine-weight-panel");
    panel.id = panelId;
    panel.hidden = true;

    const toolbar = element("div", "routine-weight-toolbar");
    const title = element("strong", "", "세트별 기록");
    const reset = element("button", "routine-weight-reset", "초기화");
    reset.type = "button";
    reset.setAttribute("aria-label", exerciseName + " 세트 기록 초기화");
    const toolbarActions = element("div", "routine-weight-toolbar-actions");
    toolbarActions.append(reset);
    toolbar.append(title, toolbarActions);

    const scroll = element("div", "routine-weight-table-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", exerciseName + " 5세트 기록표, 좌우로 이동 가능");
    const table = element("table", "routine-weight-table");
    table.setAttribute("aria-label", exerciseName + " 중량·횟수·코멘트");
    const head = element("thead");
    const headingRow = element("tr");
    const corner = element("th", "", "항목");
    corner.scope = "col";
    headingRow.append(corner);
    for (let index = 0; index < 5; index++) {
      const heading = element("th", "", (index + 1) + "세트");
      heading.scope = "col";
      headingRow.append(heading);
    }
    head.append(headingRow);
    const body = element("tbody");
    fields.forEach(field => {
      const row = element("tr");
      const label = element("th", "", field.label);
      label.scope = "row";
      row.append(label);
      for (let index = 0; index < 5; index++) {
        const cell = element("td");
        const input = element(field.key === "comment" ? "textarea" : "input", "routine-weight-cell");
        if (field.key === "comment") input.rows = 2;
        else {
          input.type = "text";
          input.inputMode = field.mode;
          input.autocomplete = "off";
        }
        input.maxLength = field.limit;
        input.placeholder = "—";
        input.setAttribute("aria-label", exerciseName + " " + (index + 1) + "세트 " + field.label);
        input.dataset.setIndex = String(index);
        input.dataset.field = field.key;
        input.addEventListener("input", () => {
          pendingChanges.set(index + ":" + field.key, { index, key: field.key, value: input.value });
          try {
            const sets = readSets();
            pendingChanges.forEach(change => { sets[change.index][change.key] = change.value; });
            (recordStorage || localStorage).setItem(storageKey, JSON.stringify({ version: 1, sets }));
            pendingChanges.clear();
            status.textContent = "";
          } catch (error) {
            status.textContent = "저장하지 못했어요. 페이지를 닫기 전에 입력 내용을 복사해 주세요.";
          }
        });
        inputs.push({ input, index, key: field.key });
        cell.append(input);
        row.append(cell);
      }
      body.append(row);
    });
    table.append(head, body);
    scroll.append(table);
    const captureHint = element("p", "routine-weight-save-hint", "저장 버튼을 누르면 현재 기록이 '운동 기록' 탭에 사진으로 저장돼요.");
    captureHint.id = panelId + "-save-hint";
    captureHint.hidden = true;
    const legacy = element("details", "routine-weight-legacy");
    legacy.hidden = true;
    const legacyText = element("p");
    legacy.append(element("summary", "", "기존 메모 보기"), legacyText);
    const status = element("p", "routine-weight-status");
    status.setAttribute("role", "status");

    // 실제 회원 루틴에서만 사진 저장. 미리보기의 임시 기록은 업로드하지 않습니다.
    if (!recordStorage && typeof captureRecord === "function") {
      const capture = element("button", "routine-weight-capture", "운동 기록에 저장");
      capture.type = "button";
      captureHint.hidden = false;
      capture.setAttribute("aria-describedby", captureHint.id);
      capture.setAttribute("aria-label", exerciseName + " 세트별 기록을 운동 기록에 사진으로 저장");
      toolbarActions.append(capture);
      let capturing = false;
      capture.addEventListener("click", async () => {
        if (capturing) return;
        const sets = emptySets();
        // 저장소 대신 현재 입력칸을 읽어 아직 저장하지 못한 입력도 함께 담습니다.
        inputs.forEach(({ input, index, key }) => { sets[index][key] = input.value; });
        if (!sets.some(set => fields.some(field => set[field.key].trim()))) {
          status.textContent = "중량, 횟수 또는 코멘트를 먼저 입력해주세요.";
          return;
        }
        const snapshot = { userId, exerciseId, exerciseName, sets, takenAt: new Date() };
        capturing = true;
        capture.disabled = true;
        reset.disabled = true;
        inputs.forEach(({ input }) => { input.readOnly = true; });
        capture.textContent = "저장 중…";
        panel.setAttribute("aria-busy", "true");
        status.textContent = "기록표를 사진으로 저장하고 있어요.";
        try {
          status.textContent = await captureRecord(snapshot);
        } catch (error) {
          status.textContent = error.message || "사진을 저장하지 못했어요. 잠시 후 다시 시도해주세요.";
        } finally {
          capturing = false;
          capture.disabled = false;
          reset.disabled = false;
          inputs.forEach(({ input }) => { input.readOnly = false; });
          capture.textContent = "운동 기록에 저장";
          panel.setAttribute("aria-busy", "false");
        }
      });
    }

    function restore() {
      if (pendingChanges.size) return; // 저장에 실패한 입력은 접었다 펼쳐도 유지합니다.
      try {
        const sets = readSets();
        inputs.forEach(({ input, index, key }) => { input.value = sets[index][key]; });
        status.textContent = "";
      } catch (error) {
        status.textContent = "기록을 불러오지 못했어요. 브라우저 저장 상태를 확인해 주세요.";
      }
      try {
        const note = (recordStorage || localStorage).getItem(legacyKey) || "";
        legacyText.textContent = note;
        legacy.hidden = !note.trim();
      } catch (error) {
        status.textContent = "기존 메모를 불러오지 못했어요. 브라우저 저장 상태를 확인해 주세요.";
      }
    }

    reset.addEventListener("click", () => {
      try {
        (recordStorage || localStorage).removeItem(storageKey);
        pendingChanges.clear();
        inputs.forEach(({ input }) => { input.value = ""; });
        status.textContent = "";
      } catch (error) {
        status.textContent = "초기화하지 못했어요. 기록은 그대로 유지됩니다.";
      }
    });

    button.addEventListener("click", () => {
      preservePagePosition(() => {
        const willOpen = panel.hidden;
        if (willOpen) restore();
        panel.hidden = !willOpen;
        button.setAttribute("aria-expanded", String(willOpen));
        setActionButtonContent(button, "세트 기록", "weight", willOpen);
        // 입력칸에 자동 초점을 주지 않아 모바일 자판이 바로 열리지 않습니다.
      });
    });
    panel.append(toolbar, captureHint, scroll, legacy, status);
    return { button, panel };
  }


  function createExerciseCard(entry, options) {
    let exercise = window.MemberCustomExercises?.getExerciseById(entry.exerciseId) || window.ExerciseDB.getExerciseById(entry.exerciseId);
    const personal = exercise?.personal === true;
    if (!exercise) throw new Error("운동DB에 없는 운동ID입니다: " + entry.exerciseId);

    const card = element("article", "routine-component-card");
    card.dataset.exerciseId = entry.exerciseId;
    if (options?.addedRow) card.dataset.addedCardId = options.addedRow.id;
    card.classList.toggle("is-personal-exercise", personal);
    if (options?.patternDay) card.dataset.patternDay = String(options.patternDay);
    const number = element("span", "routine-component-number", String(options?.displayOrder || entry.order).padStart(2, "0"));
    const main = element("div", "routine-component-main");
    const imageArea = element(personal ? "div" : "button", personal ? "routine-component-image-area routine-personal-image" : "routine-component-image-area routine-component-image-button");
    imageArea.type = "button";
    imageArea.disabled = true;
    imageArea.setAttribute("aria-label", exercise.name + " 기구 이미지 확대");
    imageArea.setAttribute("aria-haspopup", "dialog");
    imageArea.title = "눌러서 크게 보기";
    if (personal) { imageArea.removeAttribute("title"); imageArea.removeAttribute("aria-haspopup"); imageArea.setAttribute("aria-label", "직접 입력한 운동"); }
    const zoomMark = element("span", "routine-component-image-zoom-mark");
    // 기기별 글꼴 지원과 관계없이 확대 화살표를 표시합니다.
    const zoomIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    zoomIcon.setAttribute("viewBox", "0 0 24 24");
    zoomIcon.setAttribute("width", "18");
    zoomIcon.setAttribute("height", "18");
    zoomIcon.setAttribute("fill", "none");
    zoomIcon.setAttribute("stroke", "currentColor");
    zoomIcon.setAttribute("stroke-width", "2");
    zoomIcon.setAttribute("stroke-linecap", "round");
    zoomIcon.setAttribute("stroke-linejoin", "round");
    zoomIcon.setAttribute("focusable", "false");
    const zoomArrows = document.createElementNS("http://www.w3.org/2000/svg", "path");
    zoomArrows.setAttribute("d", "M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7");
    zoomIcon.append(zoomArrows);
    zoomMark.append(zoomIcon);
    zoomMark.setAttribute("aria-hidden", "true");
    zoomMark.hidden = true;
    const image = element("img");
    image.width = 88;
    image.height = 88;
    image.alt = personal ? "직접 입력한 운동" : exercise.name + " 기구 사진";
    if (personal) image.classList.add("routine-personal-image-icon");
    image.loading = "eager";
    image.decoding = "async";
    image.hidden = true;
    const placeholder = element("span", "routine-component-image-placeholder", "사진 불러오는 중");
    image.addEventListener("load", function () {
      image.hidden = false;
      placeholder.hidden = true;
      imageArea.disabled = personal;
      zoomMark.hidden = personal;
    });
    image.addEventListener("error", function () {
      if (personal) {
        image.hidden = true;
        imageArea.disabled = true;
        zoomMark.hidden = true;
        placeholder.hidden = false;
        placeholder.textContent = "직접 입력한 운동";
        return;
      }
      const bundled = window.ExerciseDB.getExerciseImageUrl(entry.exerciseId, true);
      if (!options?.imageUrls?.[entry.exerciseId] && bundled && image.src !== bundled) {
        image.src = bundled;
        return;
      }
      image.hidden = true;
      imageArea.disabled = true;
      zoomMark.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "사진을 불러오지 못했어요";
    });
    const imageUrl = personal ? new URL("images/personal-exercise-note.png", document.baseURI).href : options?.imageUrls?.[entry.exerciseId] || window.ExerciseDB.getExerciseImageUrl(entry.exerciseId);
    if (imageUrl) {
      image.src = imageUrl;
    } else {
      placeholder.textContent = personal ? "직접 입력한 운동" : "사진 준비 중";
    }
    imageArea.append(image, placeholder, zoomMark);
    imageArea.addEventListener("click", function () {
      if (!personal && !imageArea.disabled) openEquipmentImage(imageArea, image, exercise.name);
    });

    const info = element("div", "routine-component-info");
    const title = element("div", "routine-component-title");
    title.append(number, element("h5", "routine-component-name", exercise.name));
    let dose = element("p", "routine-component-dose", entry.reps + "회 × " + entry.sets + "세트");
    if (options?.exerciseReplacementContext && window.MemberExerciseReplacements?.doseControl) {
      const row = element("div", "routine-component-dose-row");
      row.append(dose, window.MemberExerciseReplacements.doseControl(
        options.exerciseReplacementContext, options.patternDay, entry, options.addedRow
      ));
      dose = row;
    }
    info.append(
      title,
      element("p", "routine-component-body-parts", exercise.bodyParts.join(" · ")),
      dose,
      element("p", "routine-component-rest", "휴식 " + entry.restSec + "초")
    );
    main.append(imageArea, info);

    const actions = element("div", "routine-component-actions");
    const detailsButton = element("button", "routine-details-button routine-action-with-icon");
    setActionButtonContent(detailsButton, "상세설명", "details", false);
    detailsButton.type = "button";
    detailsButton.setAttribute("aria-expanded", "false");
    const details = element("div", "routine-component-details");
    details.id = "routine-component-details-" + (++detailsSequence);
    details.hidden = true;
    detailsButton.setAttribute("aria-controls", details.id);

    const alternatives = window.ExerciseDB.getAlternativeExercises(entry.exerciseId);
    const alternativeText = alternatives.length
      ? alternatives.map(function (item) { return item.name; }).join(" · ")
      : "등록된 대체 운동이 없습니다.";
    function refreshDetails() {
    details.replaceChildren();
    [
      ["중요 포인트", exercise.keyPoints || "등록된 설명이 없습니다.", "routine-component-key-points"],
      ["기대 효과", exercise.benefits || "등록된 설명이 없습니다."],
      ["자세 설명", exercise.instructions || "등록된 설명이 없습니다."],
      ["호흡 방법", exercise.breathing || "등록된 설명이 없습니다."]
    ].forEach(function (section) {
      details.append(element("h5", section[2] || "", section[0]), element("p", "", section[1]));
    });
    details.append(element("h5", "", "잘하고 있는지 체크리스트"));
    if (Array.isArray(exercise.checklist) && exercise.checklist.length) {
      const checklist = element("ul", "routine-component-checklist");
      checklist.setAttribute("role", "list");
      exercise.checklist.forEach(function (item) {
        const row = element("li", "");
        // 시트에 이미 작성된 체크 기호는 그대로 표시하고 장식 기호를 중복하지 않습니다.
        const marker = element("span", "routine-component-checkmark", /^\s*(?:✅|✓|✔|☑)/u.test(item) ? "" : "✓");
        marker.setAttribute("aria-hidden", "true");
        row.append(marker, element("span", "", item));
        checklist.append(row);
      });
      details.append(checklist);
    } else {
      details.append(element("p", "", "등록된 체크리스트가 없습니다."));
    }
    details.append(element("h5", "", "대체 운동"), element("p", "", alternativeText));
    }
    refreshDetails();
    detailsButton.addEventListener("click", function () {
      preservePagePosition(function () {
        const willOpen = details.hidden;
        details.hidden = !willOpen;
        detailsButton.setAttribute("aria-expanded", String(willOpen));
        setActionButtonContent(detailsButton, "상세설명", "details", willOpen);
      });
    });

    const videoButton = element("button", "routine-video-button routine-action-with-icon");
    setActionButtonContent(videoButton, "영상보기", "video", false);
    videoButton.type = "button";
    videoButton.setAttribute("aria-expanded", "false");
    const mediaArea = element("div", "routine-component-media");
    mediaArea.id = "routine-component-media-" + detailsSequence;
    mediaArea.hidden = true;
    videoButton.setAttribute("aria-controls", mediaArea.id);

    const media = {
      area: mediaArea,
      close: function () {
        // iframe 자체를 제거해야 숨긴 뒤에도 소리가 재생되는 일을 막습니다.
        mediaArea.replaceChildren();
        mediaArea.hidden = true;
        setActionButtonContent(videoButton, "영상보기", "video", false);
        videoButton.setAttribute("aria-expanded", "false");
        openMedia.delete(media);
        if (openMedia.size === 0 && mediaObserver) {
          mediaObserver.disconnect();
          mediaObserver = null;
        }
      }
    };

    function appendVideoLink(url, text) {
      const link = element("a", "routine-component-video-link", text);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      mediaArea.append(link);
    }

    function openVideo() {
      const videoValue = String(exercise.videoUrl || "").trim();
      const videoUrl = safeMediaUrl(videoValue);
      const gifUrl = safeMediaUrl(exercise.defaultGifUrl, document.baseURI);
      if (videoValue) {
        const embedUrl = youtubeEmbedUrl(videoValue);
        if (embedUrl) {
          const frame = element("div", "routine-component-video-frame");
          const iframe = element("iframe");
          iframe.title = exercise.name + " 운동 영상";
          iframe.referrerPolicy = "strict-origin-when-cross-origin";
          iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
          iframe.allowFullscreen = true;
          iframe.src = embedUrl;
          frame.append(iframe);
          mediaArea.append(frame);
          appendVideoLink(videoUrl, "재생이 안 되면 YouTube에서 보기 ↗");
        } else if (videoUrl) {
          mediaArea.append(element("p", "routine-component-media-message", "등록된 영상은 아래 링크에서 볼 수 있습니다."));
          appendVideoLink(videoUrl, "운동 영상 새 창에서 보기 ↗");
        } else {
          mediaArea.append(element("p", "routine-component-media-message", "등록된 영상 주소를 확인해 주세요."));
        }
      } else if (gifUrl) {
        const gif = element("img", "routine-component-gif");
        let gifFallbackUsed = false;
        gif.alt = exercise.name + " 동작 안내";
        const gifNotice = element("p", "routine-component-media-message", "유튜브 설명영상은 준비 중입니다");
        gifNotice.hidden = true;
        gif.addEventListener("load", function () {
          if (gif.parentNode === mediaArea) gifNotice.hidden = false;
        }, { once: true });
        gif.addEventListener("error", function () {
          if (gif.parentNode !== mediaArea) return;
          const bundledGif = window.ExerciseDB.getBundledExerciseById(entry.exerciseId)?.defaultGifUrl;
          if (!gifFallbackUsed && bundledGif && new URL(bundledGif,document.baseURI).href !== gif.src) {
            gifFallbackUsed = true;
            gif.src = bundledGif;
            return;
          }
          gif.hidden = true;
          gifNotice.hidden = true;
          mediaArea.append(element("p", "routine-component-media-message", "동작 안내 이미지를 불러오지 못했어요."));
        });
        mediaArea.append(gif, gifNotice);
        gif.src = gifUrl;
      } else {
        mediaArea.append(element("p", "routine-component-media-message", "아직 준비된 영상이 없습니다."));
      }
      mediaArea.hidden = false;
      setActionButtonContent(videoButton, "영상보기", "video", true);
      videoButton.setAttribute("aria-expanded", "true");
      openMedia.add(media);
      watchMediaVisibility();
    }

    videoButton.addEventListener("click", function () {
      preservePagePosition(function () {
        if (mediaArea.hidden) openVideo();
        else media.close();
      });
    });
    if (!personal) actions.append(detailsButton, videoButton);

    if (options?.oneDayPT && window.OneDayPT) {
      actions.append(window.OneDayPT.createAddButton(entry.exerciseId));
    }

    card.append(main, actions, details, mediaArea);
    if (options?.userId) {
      const weight = createWeightRecordControls(
        entry.exerciseId, exercise.name, options.userId, details.id + "-weight", options.weightStorage,
        options.captureWeightRecord
      );
      actions.append(weight.button);
      card.append(weight.panel);
    }
    if (options?.exerciseReplacementContext && window.MemberExerciseReplacements) {
      const replacementControls = window.MemberExerciseReplacements.controls(options.exerciseReplacementContext, options.patternDay, entry, options.addedRow);
      const changeButton = replacementControls.querySelector(".exercise-replacement-change");
      if (changeButton) {
        title.classList.add("routine-component-title-with-change");
        const completion = window.MemberWorkoutCompletion?.createControl(entry, options);
        if (completion) {
          const tools = element("div", "routine-component-card-tools");
          tools.append(changeButton, completion);
          info.classList.add("routine-component-info-with-completion");
          info.append(tools);
        } else {
          title.append(changeButton);
        }
      }
      if (replacementControls.childElementCount) card.append(replacementControls);
    }
    if (!personal) contentRefreshers.set(card,function () {
      exercise = window.ExerciseDB.getExerciseById(entry.exerciseId);
      refreshDetails();
      const nextImage = options?.imageUrls?.[entry.exerciseId] || window.ExerciseDB.getExerciseImageUrl(entry.exerciseId);
      if (nextImage && image.getAttribute('src') !== nextImage) {
        image.hidden = true;
        imageArea.disabled = true;
        zoomMark.hidden = true;
        placeholder.hidden = false;
        placeholder.textContent = '사진 불러오는 중';
        image.src = nextImage;
      } else if (!nextImage) {
        image.removeAttribute('src');
        image.hidden = true;
        imageArea.disabled = true;
        zoomMark.hidden = true;
        placeholder.hidden = false;
        placeholder.textContent = '사진 준비 중';
      }
    });
    return card;
  }

  let daySequence = 0;

  // 회원 화면은 한 패턴씩 표시합니다. 카드는 기존 상세설명·영상·확대를 그대로 사용합니다.
  function renderTabbedRoutine(routine, options) {
    const root = element("div", "routine-components routine-components-tabbed");
    const tabs = element("div", "routine-pattern-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "운동 패턴 선택");
    tabs.style.setProperty("--routine-pattern-columns", String(Math.min(routine.days.length, 4)));
    const entries = [];
    let selectedIndex = 0;

    function selectPattern(index, moveFocus) {
      if (index !== selectedIndex) {
        const previousPanel = entries[selectedIndex].panel;
        Array.from(openMedia).forEach(function (media) {
          if (previousPanel.contains(media.area)) media.close();
        });
      }
      entries.forEach(function (entry, entryIndex) {
        const selected = entryIndex === index;
        entry.tab.setAttribute("aria-selected", String(selected));
        entry.tab.tabIndex = selected ? 0 : -1;
        entry.panel.hidden = !selected;
      });
      selectedIndex = index;
      if (moveFocus) entries[index].tab.focus({ preventScroll: true });
    }

    routine.days.forEach(function (day, index) {
      daySequence += 1;
      const id = "routine-pattern-" + daySequence;
      const label = getPatternLabel(day.day);
      const tab = element("button", "routine-pattern-tab", day.day === 4 ? "보너스" : label);
      tab.type = "button";
      tab.id = id + "-tab";
      tab.dataset.patternDay = String(day.day);
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-label", label);
      tab.setAttribute("aria-controls", id + "-panel");
      const panel = element("section", "routine-pattern-panel");
      panel.id = id + "-panel";
      panel.tabIndex = 0;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.append(element("p", "routine-pattern-caption", label + " · 운동 " + day.exercises.length + "개"));
      day.exercises.forEach(function (exercise) {
        panel.append(createExerciseCard(exercise, { ...options, patternDay: day.day }));
      });
      const customization = options?.exerciseReplacementContext;
      if (customization && window.MemberExerciseReplacements) {
        (customization.additions || []).filter(row => row.pattern_day === day.day).forEach(function (row, addedIndex) {
          const displayOrder = Math.max(...day.exercises.map(exercise => exercise.order)) + addedIndex + 1;
          const entry = { exerciseId: row.exercise_id, order: displayOrder, sets: row.sets, reps: row.reps, restSec: row.rest_sec };
          panel.append(createExerciseCard(entry, { ...options, patternDay: day.day, addedRow: row, displayOrder }));
        });
        panel.append(window.MemberExerciseReplacements.addControl(customization, day.day));
      }
      entries.push({ tab, panel });
      tabs.append(tab);
      tab.addEventListener("click", function () {
        preservePagePosition(function () { selectPattern(index, false); });
      });
      tab.addEventListener("keydown", function (event) {
        let nextIndex;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % entries.length;
        else if (event.key === "ArrowLeft") nextIndex = (index - 1 + entries.length) % entries.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = entries.length - 1;
        else return;
        event.preventDefault();
        preservePagePosition(function () { selectPattern(nextIndex, true); });
      });
    });
    root.append(tabs);
    entries.forEach(function (entry) { root.append(entry.panel); });
    selectPattern(0, false);

    const summary = element("details", "routine-component-summary");
    const summaryToggle = element("summary");
    const chevron = element("span", "routine-summary-chevron");
    chevron.setAttribute("aria-hidden", "true");
    summaryToggle.append(element("span", "", "이번 운동 루틴 안내"), chevron);
    summary.append(summaryToggle, element("p", "", routine.routineSummary.replace(/([.!?。！？])[ \t]+/g, "$1\n")));
    root.append(summary);
    return root;
  }

  // 필요할 때 기존 접기·펼치기 방식도 사용할 수 있습니다.
  function renderRoutine(routine, options) {
    if (options && options.layout === "tabs") return renderTabbedRoutine(routine, options);
    const root = element("div", "routine-components");
    routine.days.forEach(function (day) {
      const dayArea = element("section");
      dayArea.setAttribute("aria-label", getPatternLabel(day.day));
      dayArea.className = "routine-component-day";
      if (day.day === 4) dayArea.classList.add("routine-component-bonus");
      const heading = element("h4", "routine-component-day-heading");
      const toggle = element("button", "routine-component-day-toggle");
      toggle.type = "button";
      const label = element("span", "routine-component-day-label", getPatternLabel(day.day));
      const count = element("span", "routine-component-day-count", "운동 " + day.exercises.length + "개");
      const action = element("span", "routine-component-day-action", "▼ 운동 보기");
      toggle.append(label, count, action);
      const content = element("div", "routine-component-day-content");
      daySequence += 1;
      content.id = "routine-component-day-content-" + daySequence;
      content.hidden = true;
      toggle.setAttribute("aria-controls", content.id);
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", function () {
        preservePagePosition(function () {
          const willOpen = content.hidden;
          if (!willOpen) {
            // 다른 패턴의 영상은 유지하고, 접는 패턴의 영상만 즉시 종료합니다.
            Array.from(openMedia).forEach(function (media) {
              if (content.contains(media.area)) media.close();
            });
          }
          content.hidden = !willOpen;
          toggle.setAttribute("aria-expanded", String(willOpen));
          action.textContent = willOpen ? "▲ 접기" : "▼ 운동 보기";
        });
      });
      heading.append(toggle);
      dayArea.append(heading, content);
      day.exercises.forEach(function (entry, index) {
        if (index > 0) {
          const arrow = element("div", "routine-component-arrow", "↓");
          arrow.setAttribute("aria-hidden", "true");
          content.append(arrow);
        }
        content.append(createExerciseCard(entry, { ...options, patternDay: day.day }));
      });
      root.append(dayArea);
    });
    const summary = element("section", "routine-component-summary");
    summary.append(
      element("h4", "", "이번 운동 루틴 안내"),
      element("p", "", routine.routineSummary.replace(/([.!?。！？])[ \t]+/g, "$1\n"))
    );
    root.append(summary);
    return root;
  }

  const input = document.querySelector("#adminRoutineJsonInput");
  const button = document.querySelector("#previewAdminRoutineJsonButton");
  const message = document.querySelector("#adminRoutineJsonMessage");
  const preview = document.querySelector("#adminRoutineJsonPreview");
  const applyButton = document.querySelector("#applyAdminRoutineJsonButton");
  let adminContextProvider = null;
  let validatedText = null;
  let validatedContext = null;

  function getAdminContextKey() {
    if (!adminContextProvider) return null;
    const context = adminContextProvider();
    if (!context || !context.ready || !context.userId) return null;
    return JSON.stringify([
      context.userId,
      context.mode,
      context.routineId == null ? null : String(context.routineId),
      context.revision
    ]);
  }

  function syncAdminApplyButton() {
    if (!applyButton) return;
    const contextKey = getAdminContextKey();
    applyButton.disabled = !(
      validatedText !== null &&
      input && input.value === validatedText &&
      contextKey !== null && contextKey === validatedContext
    );
  }

  // 기존 script.js가 저장 이벤트와 회원 선택 상태를 연결한 뒤 사용합니다.
  function configureAdminContext(provider) {
    if (typeof provider !== "function") {
      throw new Error("관리자 루틴 저장 연결을 확인해 주세요.");
    }
    adminContextProvider = provider;
    clearPreview();
  }

  function getValidatedAdminRoutine() {
    syncAdminApplyButton();
    if (
      validatedText === null || !input || input.value !== validatedText ||
      validatedContext === null || getAdminContextKey() !== validatedContext
    ) {
      throw new Error("현재 회원과 루틴 내용을 확인한 뒤 JSON 검사 및 미리보기를 다시 눌러 주세요.");
    }
    // 저장할 때 다시 검사하고 새 객체를 반환해 미리보기 내용의 변형을 막습니다.
    return parseRoutineJson(validatedText);
  }

  function clearPreview() {
    validatedText = null;
    validatedContext = null;
    if (applyButton) applyButton.disabled = true;
    if (preview) {
      Array.from(openMedia).forEach(function (media) {
        if (preview.contains(media.area)) media.close();
      });
      preview.replaceChildren();
      preview.hidden = true;
    }
    if (message) message.textContent = "";
    if (input) input.removeAttribute("aria-invalid");
  }

  function resetAdminPreview() {
    if (input) input.value = "";
    clearPreview();
  }

  // 저장 단계에서도 같은 검사 함수를 재사용합니다.
  window.RoutineComponents = Object.freeze({
    parseRoutineJson, resetAdminPreview, renderRoutine, stopAllVideos, closeMediaWithin,
    configureAdminContext, syncAdminApplyButton, getValidatedAdminRoutine
  });

  if (!input || !button || !message || !preview) return;
  message.style.whiteSpace = "pre-line";
  if (!window.ExerciseDB) {
    message.textContent = "운동DB를 불러오지 못했습니다. 파일 연결을 확인해 주세요.";
    return;
  }
  button.disabled = false;

  input.addEventListener("input", clearPreview);
  const memberSelect = document.querySelector("#adminMemberSelect");
  if (memberSelect) memberSelect.addEventListener("change", resetAdminPreview);

  // 로그아웃 또는 화면 전환 시 입력한 회원별 안내문을 비웁니다.
  const adminScreen = document.querySelector("#adminScreen");
  if (adminScreen) {
    const observer = new MutationObserver(function () {
      if (adminScreen.hidden) resetAdminPreview();
    });
    observer.observe(adminScreen, { attributes: true, attributeFilter: ["hidden"] });
  }

  button.addEventListener("click", function () {
    clearPreview();
    try {
      const routine = parseRoutineJson(input.value);
      preview.replaceChildren(renderRoutine(routine, { layout: "tabs" }));
      preview.hidden = false;
      validatedText = input.value;
      validatedContext = getAdminContextKey();
      syncAdminApplyButton();
      const total = routine.days.reduce(function (sum, day) { return sum + day.exercises.length; }, 0);
      message.textContent = "검사 완료 · " + routine.days.length + "개 패턴, 총 " + total + "개 운동입니다. 아직 회원에게 저장되지 않았습니다.";
    } catch (error) {
      input.setAttribute("aria-invalid", "true");
      message.textContent = error.message || "루틴 JSON을 확인해 주세요.";
    }
  });
})();

