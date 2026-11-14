/* Let fitting editors pass native touch scrolling through; hand off wheel movement at text edges. */
(() => {
  "use strict";
  const fields = new Set(), pending = new Set();
  let frame = 0;
  const editor = node => node instanceof HTMLTextAreaElement &&
    node.getAttribute("aria-hidden") !== "true" && !node.closest("[inert]");

  function update(field) {
    if (!editor(field) || !field.isConnected || !field.clientHeight) return;
    field.toggleAttribute("data-page-scroll-ready", field.scrollHeight <= field.clientHeight + 2);
  }
  function queue(field) {
    if (!editor(field)) return;
    pending.add(field);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const field of pending) update(field);
      pending.clear();
      for (const field of fields) if (!field.isConnected) { observer?.unobserve(field); fields.delete(field); }
    });
  }
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(entries => {
    for (const entry of entries) queue(entry.target);
  }) : null;
  function track(node) {
    if (!(node instanceof Element)) return;
    const candidates = node.matches("textarea") ? [node] : node.querySelectorAll("textarea");
    for (const field of candidates) if (editor(field) && !fields.has(field)) {
      fields.add(field); observer?.observe(field); queue(field);
    }
  }
  track(document.documentElement);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) track(node);
    if (records.some(record => record.removedNodes.length)) for (const field of fields) if (!field.isConnected) {
      observer?.unobserve(field); fields.delete(field); pending.delete(field);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  for (const type of ["input", "focusin", "pointerover"]) document.addEventListener(type, event => queue(event.target), { passive: true });
  document.addEventListener("touchstart", event => update(event.target), { passive: true });
  window.addEventListener("resize", () => { for (const field of fields) queue(field); }, { passive: true });

  const room = (node, delta) => delta > 0
    ? Math.max(0, node.scrollHeight - node.clientHeight - node.scrollTop) : Math.max(0, node.scrollTop);
  function outside(field, delta) {
    for (let node = field.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node), overflow = style.overflowY || style.overflow;
      if (/^(auto|scroll|overlay)$/.test(overflow) && room(node, delta) > 1) return node;
      if (node.matches("dialog[open]") || /^(contain|none)$/.test(style.overscrollBehaviorY || style.overscrollBehavior)) return null;
    }
    // A desktop inbox keeps its history beside the editor, inside a fixed-height panel.
    if (field.closest('#adminScreen[data-aw-page="requests"][data-aw-kind="inquiry"]') && window.matchMedia("(min-width: 900px)").matches) {
      const history = field.closest(".admin-inquiry-thread")?.querySelector(".admin-inquiry-message-list");
      if (history && !history.closest("[hidden]") && room(history, delta) > 1) return history;
    }
    const page = document.scrollingElement;
    return page && room(page, delta) > 1 ? page : null;
  }
  document.addEventListener("wheel", event => {
    const field = event.target;
    if (!editor(field) || !event.cancelable || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey ||
        !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    update(field);
    const style = getComputedStyle(field);
    const unit = event.deltaMode === 1 ? (parseFloat(style.lineHeight) || 16) : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * unit;
    const inner = field.hasAttribute("data-page-scroll-ready") ? 0 : room(field, delta);
    if (inner >= Math.abs(delta)) return; // Long drafts keep their native text scrolling.
    const remainder = Math.sign(delta) * (Math.abs(delta) - inner);
    const target = outside(field, remainder);
    if (!target) return;
    event.preventDefault();
    if (inner) field.scrollTop += Math.sign(delta) * inner;
    target.scrollTop += remainder;
  }, { passive: false });
})();
