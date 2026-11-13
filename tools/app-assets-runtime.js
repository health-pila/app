/* Generated asset map below; load optional UI only after the verified role is known. */
(() => {
  'use strict';
  const files = __ASSET_MAP__;
  const base = new URL('./', document.currentScript.src);
  const pending = new Map();
  function url(name) {
    if (!Object.hasOwn(files, name)) throw new Error('UNKNOWN_APP_ASSET');
    return new URL(files[name], base).href;
  }
  function load(name) {
    if (pending.has(name)) return pending.get(name);
    const target = url(name);
    const css = name.endsWith('.css');
    const existing = [...document.querySelectorAll(css ? 'link[rel="stylesheet"]' : 'script[src]')]
      .find(node => (css ? node.href : node.src) === target);
    // Eager assets have executed before the main app requests optional modules.
    if (existing && !existing.dataset.appLoading) return Promise.resolve();
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(css ? 'link' : 'script');
      node.dataset.appLoading = '1';
      if (css) { node.rel = 'stylesheet'; node.href = target; }
      else { node.src = target; node.async = true; }
      const timer = setTimeout(() => fail('APP_ASSET_TIMEOUT'), 15000);
      function fail(code) { clearTimeout(timer); node.remove(); pending.delete(name); reject(new Error(code)); }
      node.onload = () => { clearTimeout(timer); delete node.dataset.appLoading; resolve(); };
      node.onerror = () => fail('APP_ASSET_LOAD_FAILED');
      document.head.append(node);
    });
    pending.set(name, promise);
    return promise;
  }
  async function admin() {
    // Alert controller is ready before payment/member modules can publish notices.
    await load('admin-routine-alerts.js');
    await Promise.all(['admin-member-alerts.js', 'admin-member-picker.js', 'admin-payments.js', 'admin-inquiry-read-receipts.js',
      'admin-usage.js', 'admin-workspace.js', 'admin-workspace.css',
      'admin-payments.css', 'admin-usage.css', 'admin-member-alerts.css', 'admin-member-picker.css', 'admin-typography.css'].map(load));
  }
  async function optionalPT() {
    if (document.documentElement.dataset.oneDayPtEnabled !== 'false') await load('one-day-pt.js');
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
    const info = event.data;
    if (info?.type !== 'APP_CACHE_READY' || !event.source?.scriptURL) return;
    const source = new URL(event.source.scriptURL);
    if (source.origin !== base.origin || source.pathname !== new URL('service-worker.js', base).pathname) return;
    window.LoginTiming?.cacheReady?.(info);
  });
  window.AppAssets = Object.freeze({ url, load, admin, optionalPT });
})();
