/* iOS의 뷰포트 당겨서 새로고침 보완. Android/PC는 CSS만 사용합니다. */
(() => {
  "use strict";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;

  let gesture = null;
  const atPageTop = () => (document.scrollingElement?.scrollTop || window.scrollY || 0) <= 0;
  const selecting = () => Boolean(window.getSelection()?.toString());
  function scrollableAncestors(event) {
    const nodes = [];
    for (const node of event.composedPath()) {
      if (!(node instanceof Element) || node === document.documentElement || node === document.body) continue;
      const style = getComputedStyle(node);
      // 휴식 타이머 등 자체 드래그를 처리하는 영역은 관여하지 않습니다.
      if (style.touchAction === "none") return null;
      if (/^(auto|scroll|overlay)$/.test(style.overflowY) && node.scrollHeight > node.clientHeight) nodes.push(node);
    }
    return nodes;
  }
  document.addEventListener("touchstart", event => {
    gesture = null;
    if (event.touches.length !== 1 || !atPageTop() || selecting()) return;
    const nodes = scrollableAncestors(event);
    if (!nodes || nodes.some(node => node.scrollTop > 0)) return;
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, nodes };
  }, { passive: true });

  document.addEventListener("touchmove", event => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !atPageTop() || selecting()) { gesture = null; return; }
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) { gesture = null; return; }
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    // 위로 밀기·가로 이동·팝업 내부 스크롤은 브라우저가 처리합니다.
    if (dy <= 0 || Math.abs(dx) >= dy || gesture.nodes.some(node => node.scrollTop > 0)) return;
    if (event.cancelable && !event.defaultPrevented) event.preventDefault();
  }, { passive: false });

  const clear = () => { gesture = null; };
  document.addEventListener("touchend", clear, { passive: true });
  document.addEventListener("touchcancel", clear, { passive: true });
  window.addEventListener("pagehide", clear);
})();
