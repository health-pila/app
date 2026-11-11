/* 공개 가이드: 회원 정보·인증 토큰을 노션에 전달하지 않습니다. */
(function () {
  "use strict";
  const dialog = document.getElementById("pilatesGuideDialog");
  const viewport = document.getElementById("pilatesGuideViewport");
  const status = document.getElementById("pilatesGuideStatus");
  const closeButton = document.getElementById("closePilatesGuide");
  const reloadButton = document.getElementById("reloadPilatesGuide");
  const openButtons = Array.from(document.querySelectorAll("[data-open-pilates-guide]"));
  if (!dialog || !viewport || !status || !closeButton || !reloadButton || !openButtons.length) return;

  const historyKey = "pilates-guide-v1";
  const pageId = "2ac953e9039280fa8543ecbe20fd95e6";
  let opener = null, owner = null, originalOverflow = null, frame = null;
  let scrollPosition = { left: 0, top: 0 };
  let historyEntry = false, closing = false, closeTimer = null, slowTimer = null;

  function embedUrl() {
    try {
      const url = new URL(dialog.dataset.notionEmbedUrl);
      const hostAllowed = url.hostname === "healthnpila.notion.site";
      // 노션이 제공하는 /ebd//<page-id> 형식의 빈 경로 구간도 그대로 허용합니다.
      const embeddedId = url.pathname.match(/^\/ebd\/{1,2}([a-f0-9-]+)\/?$/i)?.[1]?.replaceAll("-", "");
      if (url.protocol !== "https:" || url.port || url.username || url.password || !hostAllowed || embeddedId !== pageId) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function clearFrame() {
    clearTimeout(slowTimer);
    slowTimer = null;
    if (frame) {
      frame.onload = null;
      frame.onerror = null;
      frame.remove();
      frame = null;
    }
    viewport.replaceChildren();
  }

  function loadGuide() {
    clearFrame();
    const url = embedUrl();
    if (!url) {
      status.hidden = false;
      status.textContent = "가이드 연결을 준비하고 있어요. 잠시 후 다시 확인해주세요.";
      reloadButton.disabled = true;
      return;
    }
    reloadButton.disabled = false;
    status.hidden = false;
    status.textContent = navigator.onLine === false
      ? "인터넷 연결을 확인한 뒤 다시 불러오기를 눌러주세요."
      : "그룹 필라테스 이용 가이드를 불러오고 있어요.";
    const currentFrame = document.createElement("iframe");
    currentFrame.title = "그룹 필라테스 이용 가이드 본문";
    currentFrame.className = "pilates-guide-frame";
    // 노션 본문과 영상은 허용하고 앱 밖 이동·새 창 열기는 허용하지 않습니다.
    currentFrame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
    currentFrame.setAttribute("allow", "fullscreen; picture-in-picture");
    currentFrame.setAttribute("allowfullscreen", "");
    currentFrame.referrerPolicy = "no-referrer";
    currentFrame.onload = () => {
      if (frame !== currentFrame || !dialog.open) return;
      clearTimeout(slowTimer);
      // 교차 출처 본문의 성공 여부는 읽을 수 없습니다. 로드 이벤트만 처리합니다.
      status.hidden = true;
    };
    currentFrame.onerror = () => {
      if (frame !== currentFrame || !dialog.open) return;
      clearTimeout(slowTimer);
      status.hidden = false;
      status.textContent = "가이드를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 불러오기를 눌러주세요.";
    };
    frame = currentFrame;
    currentFrame.src = url;
    viewport.append(currentFrame);
    slowTimer = setTimeout(() => {
      if (frame !== currentFrame || !dialog.open) return;
      status.hidden = false;
      status.textContent = "불러오는 데 시간이 걸리고 있어요. 본문이 보이지 않으면 다시 불러오기를 눌러주세요.";
    }, 12000);
  }

  function openGuide(button, pushHistory = true) {
    if (dialog.open || closing || document.querySelector("dialog[open]")) return;
    owner = button?.closest("#loginScreen, #appScreen") || null;
    if (owner?.hidden || (owner?.id === "appScreen" && window.CenterMemberAccess?.isRestricted())) return;
    opener = button || document.activeElement;
    scrollPosition = { left: window.scrollX, top: window.scrollY };
    originalOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    closeButton.focus({ preventScroll: true });
    document.getElementById("openMemberPilatesGuide")?.classList.add("is-guide-open");
    historyEntry = !pushHistory;
    if (pushHistory) {
      try {
        history.pushState({ ...history.state, pilatesGuide: historyKey }, "", location.href);
        historyEntry = true;
      } catch (_) { historyEntry = false; }
    }
    loadGuide();
  }

  function cleanup() {
    clearTimeout(closeTimer);
    closeTimer = null;
    clearFrame();
    document.getElementById("openMemberPilatesGuide")?.classList.remove("is-guide-open");
    if (originalOverflow !== null) {
      document.body.style.overflow = originalOverflow;
      originalOverflow = null;
      window.scrollTo({ ...scrollPosition, behavior: "instant" });
      if (opener?.isConnected && !owner?.hidden) opener.focus({ preventScroll: true });
    }
    closing = false;
    historyEntry = false;
  }

  function finishClose() {
    if (dialog.open) dialog.close();
    cleanup();
  }

  function requestClose() {
    if (!dialog.open || closing) return;
    closing = true;
    clearFrame();
    if (historyEntry && history.state?.pilatesGuide === historyKey) {
      const closeLocally = () => {
        if (!dialog.open || !closing) return;
        if (history.state?.pilatesGuide === historyKey) {
          try {
            const state = { ...history.state };
            delete state.pilatesGuide;
            history.replaceState(state, "", location.href);
          } catch (_) { /* 안내창 닫기는 히스토리 지원 여부에 의존하지 않습니다. */ }
        }
        finishClose();
      };
      closeTimer = setTimeout(closeLocally, 200);
      try { history.back(); } catch (_) { closeLocally(); }
    } else finishClose();
  }

  openButtons.forEach(button => button.addEventListener("click", () => openGuide(button)));
  closeButton.addEventListener("click", requestClose);
  reloadButton.addEventListener("click", () => { if (dialog.open && !closing) loadGuide(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); requestClose(); });
  dialog.addEventListener("close", () => { if (!dialog.open) cleanup(); });
  window.addEventListener("popstate", event => {
    if (event.state?.pilatesGuide === historyKey) {
      if (!dialog.open && opener?.isConnected && !owner?.hidden) openGuide(opener, false);
    } else if (dialog.open) finishClose();
  });
  const observer = new MutationObserver(() => { if (dialog.open && owner?.hidden) requestClose(); });
  ["loginScreen", "appScreen"].forEach(id => {
    const screen = document.getElementById(id);
    if (screen) observer.observe(screen, { attributes: true, attributeFilter: ["hidden"] });
  });
})();
