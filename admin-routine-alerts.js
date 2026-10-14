/* 관리자 루틴 신청 알림. 신청 데이터는 읽기만 하며 발송/배정 기능과 분리합니다. */
(function () {
  "use strict";
  const screen = document.getElementById("adminScreen");
  const countLabel = document.getElementById("adminRoutineAlertCount");
  const soundButton = document.getElementById("adminRoutineSoundToggle");
  const testButton = document.getElementById("adminRoutineSoundTest");
  const status = document.getElementById("adminRoutineAlertStatus");
  const favicon = document.querySelector('link[rel="icon"]');
  if (!screen || !countLabel || !soundButton || !testButton || !status) return;

  const originalTitle = document.title;
  const originalIcon = favicon?.getAttribute("href");
  const originalSizes = favicon?.getAttribute("sizes");
  const logo = new Image();
  let userId = "", generation = 0, updateSequence = 0;
  let initialized = false, pendingCount = 0, soundEnabled = false;
  let audioContext = null, audioBusy = false;
  let seenInMemory = new Set(), storageFailed = false;
  let queue = Promise.resolve();

  function active(ticket = generation) {
    return ticket === generation && !!userId && !screen.hidden;
  }
  function storageKey() { return "adminRoutineAlerts:v1:" + userId; }
  function readSeen() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return new Set(seenInMemory);
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.seen)) throw new Error("Invalid alert state");
      return new Set([...seenInMemory, ...data.seen.filter(value => typeof value === "string")]);
    } catch (_) {
      storageFailed = true;
      return new Set(seenInMemory);
    }
  }
  function saveSeen(seen) {
    // 재접속 시 중복 알림을 막기 위해 최근 신청 식별자만 저장합니다.
    seenInMemory = new Set([...seen].slice(-2000));
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ version: 1, seen: [...seenInMemory] }));
      storageFailed = false;
    } catch (_) { storageFailed = true; }
  }
  function renderControls(message = "") {
    soundButton.textContent = soundEnabled ? "알림음 끄기" : "알림음 켜기";
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    soundButton.disabled = audioBusy;
    testButton.disabled = audioBusy;
    status.textContent = message || (soundEnabled
      ? "알림음 켜짐 · 새 신청이 들어오면 짧게 울려요."
      : "알림음 꺼짐 · 새 신청은 탭에 표시돼요.");
    if (storageFailed) status.textContent += " 알림 이력을 저장하지 못해 여러 탭에서 소리가 겹칠 수 있어요.";
  }
  function restoreIcon() {
    if (!favicon) return;
    if (originalIcon == null) favicon.removeAttribute("href");
    else favicon.setAttribute("href", originalIcon);
    if (originalSizes == null) favicon.removeAttribute("sizes");
    else favicon.setAttribute("sizes", originalSizes);
  }
  function renderBadge() {
    const count = active() ? pendingCount : 0;
    document.title = count ? `(신청 ${count}건) ${originalTitle}` : originalTitle;
    countLabel.textContent = `대기 ${count}건`;
    countLabel.classList.toggle("has-requests", count > 0);
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

  async function playTone(ticket) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("Audio is unavailable");
    if (!audioContext || audioContext.state === "closed") audioContext = new Audio();
    const context = audioContext;
    if (context.state !== "running") {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Audio resume timed out")), 2000);
        context.resume().then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
      });
    }
    if (!active(ticket) || context !== audioContext) return;
    if (context.state !== "running") throw new Error("Audio is suspended");
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.16;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + 0.15);
    });
  }
  function closeAudio() {
    const previous = audioContext;
    audioContext = null;
    if (previous && previous.state !== "closed") previous.close().catch(() => {});
  }
  async function testSound(enable) {
    if (!active() || audioBusy) return;
    const ticket = generation;
    audioBusy = true; renderControls("알림음을 테스트하고 있어요.");
    try {
      await playTone(ticket);
      if (!active(ticket)) return;
      if (enable) soundEnabled = true;
      renderControls(enable ? "알림음을 켰어요. 새 신청이 들어오면 알려드릴게요."
        : "테스트 소리를 재생했어요. " + (soundEnabled ? "새 신청 알림음이 켜져 있어요." : "자동 알림은 ‘알림음 켜기’를 눌러주세요."));
    } catch (_) {
      if (active(ticket)) {
        soundEnabled = false; closeAudio();
        renderControls("소리를 재생하지 못했어요. 탭 음소거와 PC 볼륨을 확인하고 다시 켜주세요.");
      }
    } finally {
      if (active(ticket)) { audioBusy = false; soundButton.disabled = false; testButton.disabled = false; }
    }
  }
  soundButton.addEventListener("click", () => {
    if (!active()) return;
    if (soundEnabled) { soundEnabled = false; closeAudio(); renderControls(); }
    else void testSound(true);
  });
  testButton.addEventListener("click", () => { void testSound(false); });

  function start(id) {
    if (userId === id && active()) return;
    reset();
    userId = id;
    seenInMemory = readSeen();
    renderBadge(); renderControls();
  }
  function reset() {
    generation += 1; updateSequence += 1;
    userId = ""; initialized = false; pendingCount = 0;
    soundEnabled = false; audioBusy = false; storageFailed = false;
    seenInMemory = new Set();
    closeAudio(); renderBadge(); renderControls();
  }
  function sync(rows) {
    if (!active() || !Array.isArray(rows)) return Promise.resolve();
    const ticket = generation, sequence = ++updateSequence;
    const keys = [...new Set(rows.filter(row => row && row.id && row.status === "pending")
      .map(row => JSON.stringify([row.id, row.requested_at || ""])) )];
    pendingCount = keys.length;
    renderBadge();
    const key = storageKey();
    const update = () => {
      if (!active(ticket) || sequence !== updateSequence) return;
      const seen = readSeen();
      const fresh = keys.filter(value => !seen.has(value));
      const shouldRing = initialized && fresh.length > 0 && soundEnabled;
      keys.forEach(value => { seen.delete(value); seen.add(value); });
      saveSeen(seen);
      initialized = true;
      renderControls();
      if (shouldRing) {
        // 재생 전에 이력을 저장해 다른 탭에서 같은 신청의 소리가 겹치지 않게 합니다.
        void playTone(ticket).catch(() => {
          if (!active(ticket)) return;
          soundEnabled = false; closeAudio();
          renderControls("새 신청 알림음을 재생하지 못했어요. ‘알림음 켜기’를 다시 눌러주세요.");
        });
        renderControls(`새 루틴 신청 ${fresh.length}건이 들어왔어요.`);
      }
    };
    // Chrome의 탭 간 잠금으로 같은 관리자 계정의 중복 알림음을 방지합니다.
    queue = queue.catch(() => {}).then(() => {
      if (navigator.locks?.request) return navigator.locks.request(key, update);
      return update();
    }).catch(() => { if (active(ticket)) renderControls("알림 상태를 갱신하지 못했어요. 신청 목록은 아래에서 확인해 주세요."); });
    return queue;
  }
  // 로그아웃/회원 화면 전환 후 늦게 도착한 비동기 알림을 차단합니다.
  new MutationObserver(() => { if (screen.hidden && userId) reset(); })
    .observe(screen, { attributes: true, attributeFilter: ["hidden"] });
  window.AdminRoutineAlerts = Object.freeze({ start, sync, reset });
})();
