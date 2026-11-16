/* Administrator-only Web Push opt-in. Loaded after the server-verified role. */
(() => {
  'use strict';
  if (window.AdminPush) return;
  const screen = document.getElementById('adminScreen'), menu = document.getElementById('adminMenuPanel');
  if (!screen || !menu) return;
  const base = new URL('./', document.currentScript.src);
  const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const publicKey = v => typeof v === 'string' && /^B[A-Za-z0-9_-]{86}$/.test(v);
  let client = null, owner = '', generation = 0, registration = null, device = null, enabled = false;
  let busy = false, prepared = false, key = '', restoreTask = Promise.resolve(), preparing = null, lastRestoreAt = 0;
  const active = ticket => ticket === generation && !!owner && !!client && !screen.hidden;
  const supported = () => window.isSecureContext && 'Notification' in window && 'PushManager' in window &&
    'serviceWorker' in navigator && 'indexedDB' in window && typeof crypto.randomUUID === 'function';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const openButton = el('button', '', 'PC 알림 설정'); openButton.type = 'button'; openButton.id = 'adminPushSettings'; menu.prepend(openButton);
  openButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span>PC 알림 설정</span>';
  const dialog = el('dialog', 'admin-push-dialog'); dialog.id = 'adminPushDialog'; dialog.setAttribute('aria-labelledby', 'adminPushTitle');
  dialog.innerHTML = `<header><h2 id="adminPushTitle">PC 알림 설정</h2><button type="button" id="adminPushClose" aria-label="PC 알림 설정 닫기">닫기 ×</button></header>
    <p class="admin-push-intro">다른 탭을 보거나 관리자 탭을 닫아도 새 가입·문의·신청·결제를 알려드려요.</p>
    <p id="adminPushState" class="admin-push-state">이 PC 알림 꺼짐</p>
    <label class="admin-push-sound"><input id="adminPushSound" type="checkbox" checked> PC 알림 소리</label>
    <p id="adminPushStatus" class="admin-push-status" role="status" aria-live="polite"></p>
    <div class="admin-push-actions"><button type="button" id="adminPushEnable" class="admin-push-primary">이 PC에서 알림 받기</button><button type="button" id="adminPushTest">알림 테스트</button><button type="button" id="adminPushDisable">이 PC 알림 끄기</button></div>
    <p class="admin-push-note">회원 이름과 문의 내용은 알림에 표시하지 않아요. 로그아웃하면 이 PC의 알림이 꺼져요.</p>
    <p class="admin-push-note">소리는 PC 알림·볼륨·집중 모드 설정에 따라 달라질 수 있어요.</p>`;
  screen.append(dialog);
  const $ = id => document.getElementById(id);
  const status = message => { $('adminPushStatus').textContent = message; };
  function render() {
    const on = enabled && 'Notification' in window && Notification.permission === 'granted';
    $('adminPushState').textContent = on ? '이 PC 알림 켜짐' : '이 PC 알림 꺼짐';
    $('adminPushState').classList.toggle('is-on', on);
    $('adminPushEnable').hidden = on;
    $('adminPushEnable').disabled = busy || !prepared;
    $('adminPushTest').disabled = busy || !on;
    $('adminPushDisable').disabled = busy || !device;
    $('adminPushSound').disabled = busy;
    $('adminPushSound').checked = window.AdminRoutineAlerts?.soundEnabled?.() !== false;
  }
  function errorText(error) {
    const code = String(error?.message || error?.code || '');
    if (/ACCOUNT_CHANGED|ADMIN_REQUIRED/.test(code)) return '관리자 로그인 상태가 바뀌었어요. 다시 로그인해 주세요.';
    if (/DEVICE_LIMIT/.test(code)) return '등록 가능한 기기 수를 초과했어요. 사용하지 않는 기기에서 알림을 꺼 주세요.';
    if (/ENDPOINT_IN_USE/.test(code)) return '이 브라우저의 이전 계정 알림을 끈 뒤 다시 시도해 주세요.';
    if (/PERMISSION/.test(code)) return '주소창 왼쪽의 사이트 설정에서 알림을 허용한 뒤 다시 시도해 주세요.';
    if (/WORKER|STATE_UNAVAILABLE/.test(code)) return '앱 새로고침 후 다시 시도해 주세요. 다른 탭에서도 설정을 바꿨다면 현재 상태를 다시 확인해 주세요.';
    if (/TEST_NOT_READY/.test(code)) return '알림을 받을 수 있도록 설정한 뒤 15초 후 다시 테스트해 주세요.';
    return '알림 설정을 확인하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  }
  function bounded(promise, ms = 12000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PUSH_TIMEOUT')), ms); })])
      .finally(() => clearTimeout(timer));
  }
  async function getRegistration() {
    if (!supported()) throw new Error('PUSH_UNSUPPORTED');
    const reg = await bounded(navigator.serviceWorker.getRegistration(base.href).then(r => r || navigator.serviceWorker.ready));
    if (!reg?.active || reg.scope !== base.href) throw new Error('PUSH_WORKER_NOT_READY');
    registration = reg; return reg;
  }
  async function command(type, data = {}) {
    const reg = registration || await getRegistration();
    return bounded(new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('PUSH_WORKER_NOT_READY')); }, 4000);
      channel.port1.onmessage = event => {
        clearTimeout(timer); channel.port1.close();
        if (event.data?.ok === true && event.data.revision === 398) resolve(event.data);
        else reject(new Error('PUSH_STATE_UNAVAILABLE'));
      };
      try { reg.active.postMessage({ type, ...data }, [channel.port2]); }
      catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
    }), 5000);
  }
  async function rpc(name, args, ticket) {
    if (!active(ticket)) throw new Error('PUSH_ACCOUNT_CHANGED');
    const expected = owner, current = client;
    let request = current.rpc('center_admin_push_' + name + '_v398', { p_expected_admin_id: expected, ...args });
    if (request.abortSignal) request = request.abortSignal(AbortSignal.timeout(10000));
    const { data, error } = await bounded(request);
    if (!active(ticket) || owner !== expected || client !== current) throw new Error('PUSH_ACCOUNT_CHANGED');
    if (error) throw error;
    if (data?.ok !== true) throw new Error('PUSH_RESPONSE_INVALID');
    return data;
  }
  function locked(work) {
    return navigator.locks?.request ? navigator.locks.request('center-admin-push:' + base.pathname, work) : work();
  }
  async function consumeNotice(ticket) {
    if (!active(ticket)) return;
    const result = await command('CENTER_PUSH_CONSUME', { userId: owner });
    if (!active(ticket) || !result.pending) return;
    if (result.pending.kind === 'test') {
      if (!dialog.open) dialog.showModal(); status('테스트 알림을 확인했어요.');
    } else window.AdminWorkspace?.openNotice?.(result.pending.kind);
  }
  async function restore(ticket) {
    if (!supported()) return;
    lastRestoreAt = Date.now();
    await getRegistration();
    if (!active(ticket)) return;
    const result = await command('CENTER_PUSH_ACCOUNT', { role: 'admin', userId: owner });
    if (!active(ticket)) return;
    device = result.state?.userId === owner && result.state.enabled ? result.state : null;
    enabled = !!device && Notification.permission === 'granted';
    if (!device) return;
    window.AdminRoutineAlerts?.setSoundEnabled?.(device.sound, false);
    render();
    const sub = await registration.pushManager.getSubscription();
    if (!active(ticket)) return;
    if (!sub || sub.endpoint !== device.endpoint || Notification.permission !== 'granted') {
      await command('CENTER_PUSH_CLEAR', { binding: device.binding, userId: owner });
      if (active(ticket)) { device = null; enabled = false; render(); }
      return;
    }
    const state = await rpc('state', { p_endpoint: sub.endpoint }, ticket);
    if (!state.subscribed || state.binding !== device.binding || state.public_key !== device.publicKey) {
      await command('CENTER_PUSH_CLEAR', { binding: device.binding, userId: owner });
      if (active(ticket)) { device = null; enabled = false; render(); }
      return;
    }
    if (state.sound !== device.sound) {
      const updated = await command('CENTER_PUSH_SOUND', { binding: device.binding, sound: state.sound });
      if (!active(ticket)) return; device = updated.state;
      window.AdminRoutineAlerts?.setSoundEnabled?.(state.sound, false);
    }
    if (Date.now() - device.registeredAt > 86400000) await locked(async () => {
      if (!active(ticket)) return;
      await rpc('register', { p_subscription: sub.toJSON(), p_binding: device.binding, p_public_key: device.publicKey, p_sound: device.sound }, ticket);
      if (!active(ticket)) return;
      const updated = await command('CENTER_PUSH_ARM', { ...device, expectedBinding: device.binding });
      if (active(ticket)) device = updated.state;
    });
    await consumeNotice(ticket);
  }
  async function prepare() {
    if (preparing) return preparing;
    const ticket = generation;
    preparing = (async () => {
      prepared = false; render(); status('알림 설정을 확인하고 있어요.');
      if (!supported()) { status('이 브라우저에서는 PC 알림을 지원하지 않아요. 최신 Chrome 또는 Edge에서 열어 주세요.'); return; }
      await restoreTask;
      if (!active(ticket)) return;
      await getRegistration(); await command('CENTER_PUSH_STATUS');
      const { data, error } = await bounded(client.functions.invoke('admin-web-push', { body: { action: 'config', expected_admin_id: owner } }), 15000);
      if (!active(ticket)) return;
      if (error) throw error;
      if (data?.ok !== true || data.revision !== 398 || !publicKey(data.public_key)) throw new Error('PUSH_CONFIG_NOT_READY');
      key = data.public_key; prepared = true;
      status(Notification.permission === 'denied' ? errorText(new Error('PUSH_PERMISSION')) : enabled ? '이 PC에서 새 알림을 받고 있어요.' : '아래 버튼을 누른 뒤 브라우저의 알림 허용을 선택해 주세요.');
    })().catch(error => { if (active(ticket)) status(errorText(error)); })
      .finally(() => { if (active(ticket)) { preparing = null; render(); } });
    return preparing;
  }
  function keyBytes(value) { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4-value.length%4)%4)), c => c.charCodeAt(0)); }
  async function enable() {
    if (!active(generation) || busy || !prepared) return;
    const ticket = generation;
    busy = true; render(); status('브라우저의 알림 허용을 확인해 주세요.');
    // Request permission directly in the click handler, before any asynchronous work.
    try {
      const permission = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
      if (await permission !== 'granted') throw new Error('PUSH_PERMISSION');
      await locked(async () => {
        if (!active(ticket)) throw new Error('PUSH_ACCOUNT_CHANGED');
        const old = (await command('CENTER_PUSH_STATUS')).state;
        if (!active(ticket)) throw new Error('PUSH_ACCOUNT_CHANGED');
        if (old && old.userId !== owner) throw new Error('PUSH_ACCOUNT_CHANGED');
        let sub = await registration.pushManager.getSubscription(), created = false;
        const oldKey = sub?.options?.applicationServerKey;
        if (sub && oldKey && btoa(String.fromCharCode(...new Uint8Array(oldKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) {
          if (old) await command('CENTER_PUSH_CLEAR', { binding: old.binding, userId: owner }); else await sub.unsubscribe();
          sub = null;
        }
        if (!sub) { sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }); created = true; }
        if (!active(ticket)) { await sub.unsubscribe(); throw new Error('PUSH_ACCOUNT_CHANGED'); }
        const previous = (await command('CENTER_PUSH_STATUS')).state;
        if (!active(ticket)) { if (created) await sub.unsubscribe(); throw new Error('PUSH_ACCOUNT_CHANGED'); }
        if (previous && previous.userId !== owner) throw new Error('PUSH_ACCOUNT_CHANGED');
        const binding = previous?.endpoint === sub.endpoint ? previous.binding : crypto.randomUUID();
        const sound = window.AdminRoutineAlerts?.soundEnabled?.() !== false;
        let armed;
        try {
          armed = await command('CENTER_PUSH_ARM', { userId: owner, binding, endpoint: sub.endpoint, publicKey: key, sound, expectedBinding: previous?.binding || null });
          if (!active(ticket)) throw new Error('PUSH_ACCOUNT_CHANGED');
          await rpc('register', { p_subscription: sub.toJSON(), p_binding: binding, p_public_key: key, p_sound: sound }, ticket);
          if (!active(ticket)) throw new Error('PUSH_ACCOUNT_CHANGED');
          device = armed.state; enabled = true; render(); status('이 PC의 알림을 켰어요. 알림 테스트로 확인해 주세요.');
        } catch (error) {
          // Preserve an already-enabled binding when a repair request briefly fails.
          if (armed && !previous?.enabled) await command('CENTER_PUSH_CLEAR', { binding, userId: armed.state.userId }).catch(() => {});
          else if (!armed && created) await sub.unsubscribe().catch(() => {});
          throw error;
        }
      });
    } catch (error) { if (active(ticket)) status(errorText(error)); }
    finally { if (active(ticket)) { busy = false; render(); } }
  }
  async function disable(quiet = false) {
    const ticket = generation;
    if (!active(ticket) || (busy && !quiet)) return;
    busy = true; render();
    try {
      await locked(async () => {
        const state = (await command('CENTER_PUSH_STATUS')).state;
        if (!active(ticket) || state?.userId !== owner) return;
        await command('CENTER_PUSH_CLEAR', { binding: state.binding, userId: owner });
        if (!active(ticket)) return;
        device = null; enabled = false; render();
        await rpc('disable', { p_endpoint: state.endpoint }, ticket).catch(() => {});
      });
      if (active(ticket) && !quiet) status('이 PC의 알림을 껐어요.');
    } catch (error) {
      // Browser unsubscription also stops delivery if the worker cannot reply.
      try { const sub = await registration?.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (_) {}
      if (active(ticket)) { enabled = false; device = null; if (!quiet) status(errorText(error)); }
    } finally { if (active(ticket)) { busy = false; render(); } }
  }
  async function setSound(value) {
    if (!active(generation) || !device || typeof value !== 'boolean') return;
    const ticket = generation, current = device;
    try {
      await locked(async () => {
        if (!active(ticket) || device?.binding !== current.binding) return;
        const updated = await command('CENTER_PUSH_SOUND', { binding: current.binding, sound: value });
        if (!active(ticket)) return; device = updated.state; render();
        await rpc('sound', { p_endpoint: current.endpoint, p_sound: value }, ticket);
      });
    } catch (error) { if (active(ticket) && dialog.open) status(errorText(error)); }
  }
  async function test() {
    if (!active(generation) || busy || !device || !enabled) return;
    const ticket = generation; busy = true; render();
    try { await rpc('test', { p_endpoint: device.endpoint }, ticket); if (active(ticket)) status('서버에 테스트 알림을 요청했어요. PC 알림이 나타나는지 확인해 주세요.'); }
    catch (error) { if (active(ticket)) status(errorText(error)); }
    finally { if (active(ticket)) { busy = false; render(); } }
  }
  function reset() {
    generation++; owner = ''; client = null; device = null; enabled = false; busy = false; prepared = false; key = ''; preparing = null;
    restoreTask = Promise.resolve(); if (dialog.open) dialog.close(); status('');
  }
  function start(nextClient, userId) {
    if (owner === userId && client === nextClient && active(generation)) return;
    reset(); if (!nextClient || !uuid(userId)) return;
    client = nextClient; owner = userId; const ticket = generation;
    restoreTask = restore(ticket).catch(error => { if (active(ticket)) status(errorText(error)); }).finally(() => { if (active(ticket)) render(); });
  }
  openButton.addEventListener('click', () => {
    if (!active(generation)) return;
    menu.hidden = true; $('adminMenuToggle').setAttribute('aria-expanded', 'false'); $('adminMenuToggle').setAttribute('aria-label', '메뉴 열기');
    dialog.showModal(); void prepare();
  });
  $('adminPushClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (owner && !screen.hidden) $('adminMenuToggle').focus({ preventScroll: true }); });
  $('adminPushEnable').addEventListener('click', () => { void enable(); });
  $('adminPushDisable').addEventListener('click', () => { void disable(); });
  $('adminPushTest').addEventListener('click', () => { void test(); });
  $('adminPushSound').addEventListener('change', () => window.AdminRoutineAlerts?.setSoundEnabled?.($('adminPushSound').checked));
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
    if (!active(generation) || !event.source?.scriptURL) return;
    const source = new URL(event.source.scriptURL);
    if (source.origin !== base.origin || source.pathname !== new URL('service-worker.js', base).pathname) return;
    if (event.data?.type === 'CENTER_PUSH_OPEN') void consumeNotice(generation).catch(() => {});
    if (event.data?.type === 'CENTER_PUSH_CHANGED' && !busy) {
      const ticket = generation;
      void command('CENTER_PUSH_STATUS').then(result => {
        if (!active(ticket)) return;
        device = result.state?.userId === owner ? result.state : null;
        enabled = !!device?.enabled && Notification.permission === 'granted';
        if (device) window.AdminRoutineAlerts?.setSoundEnabled?.(device.sound, false);
        render();
      }).catch(() => {});
    }
  });
  function refreshBinding() {
    if (!active(generation) || busy) return;
    const ticket = generation;
    restoreTask = restore(ticket).catch(error => { if (active(ticket)) status(errorText(error)); })
      .finally(() => { if (active(ticket)) render(); });
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', refreshBinding);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastRestoreAt > 300000) refreshBinding();
  });
  new MutationObserver(() => { if (screen.hidden && owner) reset(); }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  window.AdminPush = Object.freeze({ start, reset, beforeLogout: () => disable(true), setSound,
    enabled: () => !!owner && !screen.hidden && enabled && 'Notification' in window && Notification.permission === 'granted' });
})();
