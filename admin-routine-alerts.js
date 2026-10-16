/* 관리자 루틴 신청·회원 문의·1DAY PT 신청 알림. 데이터는 읽기만 하며 배정/답변 기능과 분리합니다. */
(function () {
  "use strict";
  const screen = document.getElementById("adminScreen");
  const sections = [
    { kind: "routine", prefix: "adminRoutine", storagePrefix: "adminRoutineAlerts:v1:", label: "루틴 신청" },
    { kind: "inquiry", prefix: "adminInquiry", storagePrefix: "adminInquiryAlerts:v1:", label: "회원 문의" }
  ].map(section => ({ ...section,
    countLabel: document.getElementById(section.prefix + "AlertCount"),
    soundButton: document.getElementById(section.prefix + "SoundToggle"),
    testButton: document.getElementById(section.prefix + "SoundTest"),
    status: document.getElementById(section.prefix + "AlertStatus"),
    initialized: false, count: 0, sequence: 0, seen: new Set(), storageFailed: false, loadFailed: false
  }));
  const favicon = document.querySelector('link[rel="icon"]');
  if (!screen || sections.some(section => !section.countLabel || !section.soundButton || !section.testButton || !section.status)) return;

  // 1DAY PT는 별도 버튼 없이 기존 공통 알림음 설정을 사용합니다.
  const oneDayPtAlerts = {
    kind: "oneDayPt", storagePrefix: "adminOneDayPtAlerts:v1:", label: "1DAY PT 신청",
    initialized: false, count: 0, sequence: 0, seen: new Set(), storageFailed: false, loadFailed: false
  };
  const alertSources = [...sections, oneDayPtAlerts];

  const originalTitle = document.title;
  const originalIcon = favicon?.getAttribute("href");
  const originalSizes = favicon?.getAttribute("sizes");
  const logo = new Image();
  let userId = "", generation = 0, soundEnabled = false;
  let audioContext = null, audioBusy = false, nextToneAt = 0;
  let queue = Promise.resolve();

  function active(ticket = generation) {
    return ticket === generation && !!userId && !screen.hidden;
  }
  function storageKey(section) { return section.storagePrefix + userId; }
  function readSeen(section) {
    try {
      const raw = localStorage.getItem(storageKey(section));
      if (!raw) return new Set(section.seen);
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.seen)) throw new Error("Invalid alert state");
      return new Set([...section.seen, ...data.seen.filter(value => typeof value === "string")]);
    } catch (_) {
      section.storageFailed = true;
      return new Set(section.seen);
    }
  }
  function saveSeen(section, seen, currentKeys) {
    // 현재 목록의 식별자는 모두 보존하고, 사라진 과거 기록만 개수를 제한합니다.
    section.seen = new Set([...seen].slice(-2000).concat(currentKeys));
    try {
      localStorage.setItem(storageKey(section), JSON.stringify({ version: 1, seen: [...section.seen] }));
      section.storageFailed = false;
    } catch (_) { section.storageFailed = true; }
  }
  function renderControls(message = "") {
    sections.forEach(section => {
      section.soundButton.textContent = soundEnabled ? "알림음 끄기" : "알림음 켜기";
      section.soundButton.setAttribute("aria-pressed", String(soundEnabled));
      section.soundButton.disabled = audioBusy;
      section.testButton.disabled = audioBusy;
      section.status.textContent = message || (soundEnabled
        ? (audioContext?.state === "running" ? "알림음 켜짐" : "알림음 켜짐 · 소리 활성화 대기")
        : "알림음 꺼짐");
      if (section.storageFailed || oneDayPtAlerts.storageFailed) section.status.textContent += " 알림 이력을 저장하지 못해 여러 탭에서 소리가 겹칠 수 있어요.";
      if (section.loadFailed) section.status.textContent += " 문의 알림을 갱신하지 못했어요. 연결 후 다시 확인해 주세요.";
      if (oneDayPtAlerts.loadFailed) section.status.textContent += " 1DAY PT 알림을 갱신하지 못했어요.";
    });
  }
  function restoreIcon() {
    if (!favicon) return;
    if (originalIcon == null) favicon.removeAttribute("href");
    else favicon.setAttribute("href", originalIcon);
    if (originalSizes == null) favicon.removeAttribute("sizes");
    else favicon.setAttribute("sizes", originalSizes);
  }
  function renderBadge() {
    const counts = alertSources.map(section => active() ? section.count : 0);
    const count = counts.reduce((sum, value) => sum + value, 0);
    const labels = [];
    if (counts[0]) labels.push(`신청 ${counts[0]}건`);
    if (counts[1]) labels.push(`문의 ${counts[1]}건`);
    if (counts[2]) labels.push(`1DAY PT ${counts[2]}건`);
    document.title = count ? `(${labels.join(" · ")}) ${originalTitle}` : originalTitle;
    sections.forEach((section, index) => {
      section.countLabel.textContent = section.kind === "inquiry" ? `답변 대기 ${counts[index]}건` : `대기 ${counts[index]}건`;
      section.countLabel.classList.toggle("has-requests", counts[index] > 0);
    });
    if (!count) { restoreIcon(); return; }
    if (!favicon) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 0, 0, 64, 64);
      else { ctx.fillStyle = "#ec6a1a"; ctx.fillRect(8, 8, 48, 48); }
      ctx.beginPath(); ctx.arc(49, 15, 13, 0, 2 * Math.PI);
      ctx.fillStyle = "#e02d3c"; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();
      favicon.setAttribute("sizes", "64x64");
      favicon.setAttribute("href", canvas.toDataURL("image/png"));
    } catch (_) { /* 탭 제목의 건수는 아이콘 변환 실패와 무관하게 유지합니다. */ }
  }
  logo.addEventListener("load", () => { if (active()) renderBadge(); });
  if (originalIcon) logo.src = originalIcon;

  function getAudioContext() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("Audio is unavailable");
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new Audio();
      const context = audioContext;
      context.addEventListener("statechange", () => {
        if (context === audioContext && active() && !audioBusy) renderControls();
      });
    }
    return audioContext;
  }
  async function resumeAudio(context, ticket) {
    if (context.state !== "running") {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Audio resume timed out")), 2000);
        context.resume().then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
      });
    }
    if (!active(ticket) || context !== audioContext) return false;
    if (context.state !== "running") throw new Error("Audio is suspended");
    return true;
  }
  function activateDefaultSound(event) {
    if (!active() || !soundEnabled || audioBusy) return;
    if (event && (!event.isTrusted || event.repeat || event.key === "Escape")) return;
    // 알림음 버튼 자체는 각 핸들러가 처리해 사용자의 켜기·끄기를 존중합니다.
    if (event && sections.some(section => section.soundButton.contains(event.target) || section.testButton.contains(event.target))) return;
    const ticket = generation;
    let context;
    try { context = getAudioContext(); }
    catch (_) { renderControls("이 브라우저에서는 알림음을 사용할 수 없어요."); return; }
    // 재생 제한 중에도 켜짐 설정은 유지하고, 다음 사용자 동작에서 소리 없이 다시 준비합니다.
    void resumeAudio(context, ticket).then(ready => {
      if (ready && soundEnabled) renderControls();
    }).catch(() => {
      if (active(ticket) && context === audioContext && soundEnabled) renderControls();
    });
  }
  document.addEventListener("click", activateDefaultSound, true);
  document.addEventListener("keydown", activateDefaultSound, true);

  async function playTone(ticket) {
    const context = getAudioContext();
    if (!await resumeAudio(context, ticket)) return;
    const toneStart = Math.max(context.currentTime, nextToneAt);
    nextToneAt = toneStart + 0.38;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = toneStart + index * 0.16;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.8, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + 0.15);
    });
  }
  function closeAudio() {
    const previous = audioContext;
    audioContext = null; nextToneAt = 0;
    if (previous && previous.state !== "closed") previous.close().catch(() => {});
  }
  async function testSound(enable) {
    if (!active() || audioBusy) return;
    const ticket = generation;
    if (enable) soundEnabled = true;
    audioBusy = true; renderControls("알림음을 테스트하고 있어요.");
    try {
      await playTone(ticket);
      if (!active(ticket)) return;
      renderControls(enable ? "알림음 켜짐"
        : "소리 테스트 완료 · 알림음 " + (soundEnabled ? "켜짐" : "꺼짐"));
    } catch (_) {
      if (active(ticket)) {
        closeAudio();
        renderControls("소리를 재생하지 못했어요. 탭 음소거와 PC 볼륨을 확인한 뒤 다시 테스트해 주세요.");
      }
    } finally {
      if (active(ticket)) { audioBusy = false; sections.forEach(section => { section.soundButton.disabled = false; section.testButton.disabled = false; }); }
    }
  }
  sections.forEach(section => {
    section.soundButton.addEventListener("click", () => {
      if (!active()) return;
      if (soundEnabled) { soundEnabled = false; closeAudio(); renderControls(); }
      else void testSound(true);
    });
    section.testButton.addEventListener("click", () => { void testSound(false); });
  });

  function start(id) {
    if (userId === id && active()) return;
    reset(); userId = id; soundEnabled = true;
    alertSources.forEach(section => { section.seen = readSeen(section); });
    renderBadge(); renderControls();
    activateDefaultSound();
  }
  function reset() {
    generation += 1; userId = ""; soundEnabled = false; audioBusy = false;
    alertSources.forEach(section => {
      section.sequence += 1; section.initialized = false; section.count = 0;
      section.storageFailed = false; section.loadFailed = false; section.seen = new Set();
    });
    closeAudio(); renderBadge(); renderControls();
  }
  function syncSection(section, pendingKeys, observedKeys) {
    if (!active()) return Promise.resolve();
    const ticket = generation, sequence = ++section.sequence;
    const keys = [...new Set(pendingKeys)];
    const observed = [...new Set(observedKeys)];
    section.count = keys.length; section.loadFailed = false;
    renderBadge();
    const key = storageKey(section);
    const update = () => {
      if (!active(ticket) || sequence !== section.sequence) return;
      const seen = readSeen(section);
      const fresh = keys.filter(value => !seen.has(value));
      const shouldRing = section.initialized && fresh.length > 0 && soundEnabled;
      observed.forEach(value => { seen.delete(value); seen.add(value); });
      saveSeen(section, seen, observed);
      section.initialized = true;
      renderControls();
      if (shouldRing) {
        void playTone(ticket).catch(() => {
          if (!active(ticket)) return;
          if (soundEnabled) renderControls("알림음 켜짐 · 화면을 한 번 누른 뒤 소리 테스트를 해주세요.");
        });
        renderControls(`새 ${section.label} ${fresh.length}건이 들어왔어요.`);
      }
    };
    queue = queue.catch(() => {}).then(() => {
      if (navigator.locks?.request) return navigator.locks.request(key, update);
      return update();
    }).catch(() => { if (active(ticket)) renderControls("알림 상태를 갱신하지 못했어요. 아래 목록을 확인해 주세요."); });
    return queue;
  }
  function sync(rows) {
    if (!Array.isArray(rows)) return Promise.resolve();
    const keys = rows.filter(row => row && row.id && row.status === "pending")
      .map(row => JSON.stringify([row.id, row.requested_at || ""]));
    return syncSection(sections[0], keys, keys);
  }
  function syncInquiries(rows) {
    if (!Array.isArray(rows)) return Promise.resolve();
    const valid = rows.filter(row => row && row.id);
    const keyOf = row => JSON.stringify([row.id, row.last_message_at || row.created_at || ""]);
    const waiting = valid.filter(row => row.status === "waiting" && !row.archived_at);
    // 답변 완료·보관함의 마지막 메시지도 기억해 복원만 했을 때 울리지 않게 합니다.
    return syncSection(sections[1], waiting.map(keyOf), valid.map(keyOf));
  }
  function syncOneDayPt(rows) {
    if (!Array.isArray(rows)) return Promise.resolve();
    const valid = rows.filter(row => row && row.id);
    // 갱신 시각 대신 신청 ID와 생성 시각을 사용해 상태 변경은 새 신청으로 알리지 않습니다.
    const keyOf = row => JSON.stringify([row.id, row.created_at || ""]);
    return syncSection(oneDayPtAlerts,
      valid.filter(row => row.status === "pending").map(keyOf), valid.map(keyOf));
  }
  function oneDayPtError() {
    if (!active()) return;
    oneDayPtAlerts.loadFailed = true; renderControls();
  }
  function inquiryError() {
    if (!active()) return;
    sections[1].loadFailed = true; renderControls();
  }
  // 로그아웃/회원 화면 전환 후 늦게 도착한 비동기 알림을 차단합니다.
  new MutationObserver(() => { if (screen.hidden && userId) reset(); })
    .observe(screen, { attributes: true, attributeFilter: ["hidden"] });
  window.AdminRoutineAlerts = Object.freeze({ start, sync, syncInquiries, syncOneDayPt, inquiryError, oneDayPtError, reset });
})();
