/* Only start image work for a connected, visible card near the viewport. */
(() => {
  'use strict';
  const pending = new Map();
  let frame = 0;
  const visible = node => node.isConnected && !document.hidden && !node.closest('[hidden]');
  function start(node) {
    const entry = pending.get(node);
    if (!entry || !visible(node)) return;
    pending.delete(node); observer?.unobserve(node);
    Promise.resolve().then(() => {
      if (!visible(node)) { if (node.isConnected) observe(node,entry.work); return; }
      return entry.work();
    }).catch(error => console.warn('이미지 준비 실패:', error));
  }
  function near(node) {
    if (!visible(node)) return false;
    const rect = node.getBoundingClientRect();
    let left = 0, right = innerWidth, top = -200, bottom = innerHeight + 200;
    if (!rect.width || !rect.height) return false;
    // Fallback also respects horizontal carousels and clipped/scrolling ancestors.
    for (let parent=node.parentElement; parent; parent=parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left=Math.max(left,box.left); right=Math.min(right,box.right); }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top=Math.max(top,box.top); bottom=Math.min(bottom,box.bottom); }
    }
    return rect.right>left && rect.left<right && rect.bottom>top && rect.top<bottom;
  }
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) start(entry.target);
  }, {rootMargin:'200px 0px',threshold:0}) : null;
  function scan() {
    frame=0;
    for (const [node,entry] of pending) {
      if (!node.isConnected) {
        if (entry.connected || Date.now()-entry.created>30000) { pending.delete(node); observer?.unobserve(node); }
        continue;
      }
      entry.connected=true;
      if (!observer && near(node)) start(node);
    }
  }
  function refresh() { if (!frame) frame=requestAnimationFrame(scan); }
  function observe(node, work) {
    pending.set(node,{work,connected:node.isConnected,created:Date.now()}); observer?.observe(node); refresh();
  }
  new MutationObserver(refresh).observe(document.documentElement,{
    childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style','open']
  });
  document.addEventListener('scroll',refresh,{passive:true,capture:true});
  window.addEventListener('resize',refresh);
  document.addEventListener('visibilitychange',() => {
    // A tab returning to the foreground may not get another intersection event.
    if (!document.hidden && observer) for (const node of pending.keys()) { observer.unobserve(node); observer.observe(node); }
    refresh();
  });
  window.DeferredImages=Object.freeze({observe,refresh});
})();
