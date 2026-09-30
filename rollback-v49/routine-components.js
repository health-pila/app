// 운동 구성 JSON 검사와 카드 미리보기. 회원 데이터는 저장하지 않습니다.
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
  const openMedia = new Set();
  let mediaObserver = null;

  function safeMediaUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
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

  function createExerciseCard(entry) {
    const exercise = window.ExerciseDB.getExerciseById(entry.exerciseId);
    if (!exercise) throw new Error("운동DB에 없는 운동ID입니다: " + entry.exerciseId);

    const card = element("article", "routine-component-card");
    const number = element("span", "routine-component-number", String(entry.order).padStart(2, "0"));
    const main = element("div", "routine-component-main");
    const imageArea = element("button", "routine-component-image-area routine-component-image-button");
    imageArea.type = "button";
    imageArea.disabled = true;
    imageArea.setAttribute("aria-label", exercise.name + " 기구 이미지 확대");
    imageArea.setAttribute("aria-haspopup", "dialog");
    imageArea.title = "눌러서 크게 보기";
    const zoomMark = element("span", "routine-component-image-zoom-mark", "⤢");
    zoomMark.setAttribute("aria-hidden", "true");
    zoomMark.hidden = true;
    const image = element("img");
    image.width = 88;
    image.height = 88;
    image.alt = exercise.name + " 기구 사진";
    image.loading = "eager";
    image.decoding = "async";
    image.hidden = true;
    const placeholder = element("span", "routine-component-image-placeholder", "사진 불러오는 중");
    image.addEventListener("load", function () {
      image.hidden = false;
      placeholder.hidden = true;
      imageArea.disabled = false;
      zoomMark.hidden = false;
    });
    image.addEventListener("error", function () {
      image.hidden = true;
      imageArea.disabled = true;
      zoomMark.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "사진을 불러오지 못했어요";
    });
    const imageUrl = window.ExerciseDB.getExerciseImageUrl(entry.exerciseId);
    if (imageUrl) {
      image.src = imageUrl;
    } else {
      placeholder.textContent = "사진 준비 중";
    }
    imageArea.append(image, placeholder, zoomMark);
    imageArea.addEventListener("click", function () {
      if (!imageArea.disabled) openEquipmentImage(imageArea, image, exercise.name);
    });

    const info = element("div", "routine-component-info");
    const title = element("div", "routine-component-title");
    title.append(number, element("h5", "routine-component-name", exercise.name));
    info.append(
      title,
      element("p", "routine-component-body-parts", exercise.bodyParts.join(" · ")),
      element("p", "routine-component-dose", entry.reps + "회 × " + entry.sets + "세트"),
      element("p", "routine-component-rest", "휴식 " + entry.restSec + "초")
    );
    main.append(imageArea, info);

    const actions = element("div", "routine-component-actions");
    const detailsButton = element("button", "", "▼ 상세설명");
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
    [
      ["기대 효과", exercise.benefits || "등록된 설명이 없습니다."],
      ["자세 설명", exercise.instructions || "등록된 설명이 없습니다."],
      ["대체 운동", alternativeText]
    ].forEach(function (section) {
      details.append(element("h5", "", section[0]), element("p", "", section[1]));
    });
    detailsButton.addEventListener("click", function () {
      preservePagePosition(function () {
        const willOpen = details.hidden;
        details.hidden = !willOpen;
        detailsButton.setAttribute("aria-expanded", String(willOpen));
        detailsButton.textContent = willOpen ? "▲ 상세설명 접기" : "▼ 상세설명";
      });
    });

    const videoButton = element("button", "", "▼ 영상보기");
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
        videoButton.textContent = "▼ 영상보기";
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
      const gifUrl = safeMediaUrl(exercise.defaultGifUrl);
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
        gif.alt = exercise.name + " 동작 안내";
        gif.addEventListener("error", function () {
          if (gif.parentNode !== mediaArea) return;
          gif.hidden = true;
          mediaArea.append(element("p", "routine-component-media-message", "동작 안내 이미지를 불러오지 못했어요."));
        }, { once: true });
        gif.src = gifUrl;
        mediaArea.append(gif);
      } else {
        mediaArea.append(element("p", "routine-component-media-message", "아직 준비된 영상이 없습니다."));
      }
      mediaArea.hidden = false;
      videoButton.textContent = "▲ 영상 닫기";
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
    actions.append(detailsButton, videoButton);
    card.append(main, actions, details, mediaArea);
    return card;
  }

  let daySequence = 0;

  // 관리자 미리보기와 회원 화면에서 같은 렌더러를 사용합니다.
  function renderRoutine(routine) {
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
        content.append(createExerciseCard(entry));
      });
      root.append(dayArea);
    });
    const summary = element("section", "routine-component-summary");
    summary.append(
      element("h4", "", "이번 운동 구성 안내"),
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
    parseRoutineJson, resetAdminPreview, renderRoutine, stopAllVideos,
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
      preview.replaceChildren(renderRoutine(routine));
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
