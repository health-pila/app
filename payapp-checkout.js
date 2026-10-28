/* 회원 결제 전용. 상품/금액은 서버에서 다시 확정하며 기존 회원 기록을 수정하지 않습니다. */
(() => {
  'use strict';
  const host = document.getElementById('payAppProduct');
  if (!host) return;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PRODUCT = 'autumn-gym-6m';
  host.innerHTML = `<article class="payapp-product"><div><span class="payapp-product-badge">무이자할부 전용</span><h3>가을이벤트) 헬스 6개월</h3><p class="payapp-product-price">180,000<span>원</span></p></div><button id="openPayAppCheckout" type="button" disabled>결제하기</button></article>`;
  const dialog = document.createElement('dialog'); dialog.id = 'payAppCheckoutDialog'; dialog.className = 'payapp-dialog';
  dialog.setAttribute('aria-labelledby', 'payAppCheckoutTitle');
  dialog.innerHTML = `<form id="payAppCheckoutForm">
  <div class="payapp-dialog-heading"><h2 id="payAppCheckoutTitle">가을이벤트) 헬스 6개월</h2><button id="closePayAppCheckout" type="button">닫기</button></div>
  <div class="payapp-dialog-body">
    <p class="payapp-dialog-price">180,000원</p>
    <fieldset id="payAppOptions" class="payapp-options"><legend>추가 옵션</legend>
      <label class="payapp-option" id="payAppClothingRow"><input id="payAppClothing" type="checkbox"><span class="payapp-option-copy"><strong>운동복 대여</strong><span>월 5,000원 × 6개월</span></span><strong class="payapp-option-price">+30,000원</strong></label>
      <label class="payapp-option" id="payAppLockerRow"><input id="payAppLocker" type="checkbox"><span class="payapp-option-copy"><strong>개인락커 이용</strong><span>월 5,000원 × 6개월</span></span><strong class="payapp-option-price">+30,000원</strong></label>
    </fieldset>
    <p class="payapp-help payapp-holding-note">헬스 홀딩 시 옵션 상품도 함께 홀딩됩니다.</p>
    <dl class="payapp-breakdown" aria-label="결제 금액 구성"><div><dt>헬스 6개월</dt><dd>180,000원</dd></div><div id="payAppClothingBreakdown" hidden><dt>운동복 대여</dt><dd>30,000원</dd></div><div id="payAppLockerBreakdown" hidden><dt>개인락커 이용</dt><dd>30,000원</dd></div></dl>
    <div id="payAppPhoneField"><p class="payapp-start-notice" id="payAppStartNotice"><strong>결제하신 회원권의 개시일은 기존 만료일 다음날로 지정됩니다.<br>시작일 변경이 필요하시면 센터로 문의해주세요.</strong></p><label for="payAppBuyerPhone">결제자 휴대전화번호</label><input id="payAppBuyerPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="번호만 입력해주세요." aria-describedby="payAppPhoneHelp payAppStartNotice" maxlength="13" required><p id="payAppPhoneHelp" class="payapp-help">결제 안내에 사용할 번호를 입력해 주세요.</p></div>
    <p id="payAppCheckoutStatus" class="payapp-status" role="status"></p>
  </div>
  <div class="payapp-dialog-footer"><p class="payapp-total"><span>총 결제 금액</span><strong id="payAppTotal" aria-live="polite">180,000원</strong></p><button id="submitPayAppCheckout" class="payapp-primary" type="submit">180,000원 결제하기</button><button id="checkPayAppCheckout" class="payapp-secondary" type="button" hidden>결제 결과 다시 확인</button></div>
</form>`;
  document.body.append(dialog);
  const byId = id => document.getElementById(id);
  const openButton = byId('openPayAppCheckout'), closeButton = byId('closePayAppCheckout');
  const form = byId('payAppCheckoutForm'), phone = byId('payAppBuyerPhone'), phoneField = byId('payAppPhoneField');
  const submit = byId('submitPayAppCheckout'), recheck = byId('checkPayAppCheckout'), message = byId('payAppCheckoutStatus');
  const clothing = byId('payAppClothing'), locker = byId('payAppLocker'), optionFields = byId('payAppOptions');
  const selection = () => ({ clothing: clothing.checked, locker: locker.checked });
  const price = value => 180000 + (value.clothing ? 30000 : 0) + (value.locker ? 30000 : 0);
  const money = value => value.toLocaleString('ko-KR') + '원';
  let client = null, userId = '', generation = 0, busy = false, checking = false, current = null;
  let editing = false;
  let pending = null, popup = null, timer = null, pollCount = 0, focusReturn = null, showServices = null;
  const key = () => `centerPayapp:v1:${userId}`;
  const live = token => token === generation && client && userId;
  const active = () => userId && !byId('appScreen')?.hidden;
  const status = (text, error = false) => { message.textContent = text; message.classList.toggle('is-error', error); };
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
    (u.hostname === 'payapp.kr' || u.hostname.endsWith('.payapp.kr')) ? u.href : ''; } catch (_) { return ''; } };
  let viewportFrame = null;
  function syncPaymentViewport() {
    viewportFrame = null;
    if (!dialog.open) return;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const width = viewport?.width || window.innerWidth;
    dialog.style.setProperty('--payapp-viewport-height', height + 'px');
    dialog.style.setProperty('--payapp-viewport-width', width + 'px');
    dialog.style.setProperty('--payapp-viewport-top', (viewport?.offsetTop || 0) + 'px');
    dialog.style.setProperty('--payapp-viewport-left', (viewport?.offsetLeft || 0) + 'px');
    dialog.classList.toggle('is-compact', height < 560);
    dialog.classList.toggle('is-typing', height < 560 && document.activeElement === phone);
    if (document.activeElement === phone && !phoneField.hidden) {
      const body = dialog.querySelector('.payapp-dialog-body');
      const bounds = body.getBoundingClientRect(), input = phone.getBoundingClientRect();
      if (input.bottom > bounds.bottom - 8) body.scrollTop += input.bottom - bounds.bottom + 8;
      else if (input.top < bounds.top + 8) body.scrollTop -= bounds.top + 8 - input.top;
    }
  }
  function queuePaymentViewport() {
    if (!dialog.open || viewportFrame !== null) return;
    viewportFrame = requestAnimationFrame(syncPaymentViewport);
  }
  function savePending() { if (!userId) return; try { sessionStorage.setItem(key(), JSON.stringify(pending)); } catch (_) {} }
  function readPending() { try { const v = JSON.parse(sessionStorage.getItem(key()) || 'null');
    return v && UUID.test(v.requestId || '') && (!v.orderId || UUID.test(v.orderId)) ? v : null; } catch (_) { return null; } }
  function stopPolling() { clearTimeout(timer); timer = null; }
  function poll() { stopPolling(); if (!dialog.open || document.hidden || pollCount >= 10 || !pending ||
    ['paid','cancelled','partial_refund'].includes(current?.payment_state)) return;
    timer = setTimeout(() => { pollCount++; void check(); }, 4000); }
  function render() {
    const order = editing ? null : current;
    const terminal = ['paid','cancelled','partial_refund'].includes(order?.payment_state);
    phoneField.hidden = Boolean(order);
    phone.disabled = Boolean(order) || busy;
    phone.required = !order;
    submit.hidden = Boolean(order) && (terminal || !safeUrl(order.pay_url));
    optionFields.disabled = Boolean(order || (pending && !editing)) || busy || checking;
    byId('payAppClothingRow').classList.toggle('is-selected', clothing.checked);
    byId('payAppLockerRow').classList.toggle('is-selected', locker.checked);
    byId('payAppClothingBreakdown').hidden = !clothing.checked;
    byId('payAppLockerBreakdown').hidden = !locker.checked;
    const amount = order ? order.amount : price(selection());
    byId('payAppTotal').textContent = money(amount);
    submit.disabled = busy || checking || Boolean(pending && !order && !editing) || !active();
    submit.textContent = order ? '결제창 다시 열기' : money(amount) + ' 결제하기';
    recheck.hidden = !pending;
    recheck.disabled = busy || checking;
    openButton.disabled = !active();
    form.setAttribute('aria-busy', String(busy || checking));
    queuePaymentViewport();
  }
  function displayOrder(order, allowEdit = false) {
    if (!order || !UUID.test(order.id || '') || order.product_name !== '가을이벤트) 헬스 6개월') throw new Error('BAD_ORDER');
    const selected = order.options === undefined && order.amount === 180000 ? { clothing: false, locker: false } : order.options;
    if (!selected || typeof selected.clothing !== 'boolean' || typeof selected.locker !== 'boolean' || order.amount !== price(selected)) throw new Error('BAD_ORDER');
    const canEdit = allowEdit && order.payment_state === 'requested' && order.request_status === 'ready';
    if (canEdit) {
      if (!editing) { clothing.checked = false; locker.checked = false; phone.value = ''; }
      editing = true;
    } else {
      editing = false; clothing.checked = selected.clothing; locker.checked = selected.locker;
    }
    current = { ...order, options: selected }; pending.orderId = order.id; savePending();
    const text = { paid: '결제가 완료됐어요.', cancelled: '결제 취소가 확인됐어요.', partial_refund: '일부 금액이 취소된 결제예요.',
      pending: '입금 또는 결제 승인을 기다리고 있어요.', requested: '결제창에서 결제를 진행해 주세요. 창을 닫은 것만으로 결제가 취소되지는 않아요.' };
    if (['paid','cancelled','partial_refund'].includes(order.payment_state)) status(text[order.payment_state]);
    else if (order.request_status === 'failed') status('결제 요청이 거절됐어요. 닫은 뒤 상품을 다시 선택해 시도해 주세요.', true);
    else if (['creating','uncertain'].includes(order.request_status)) status('결제 요청 결과를 확인 중이에요. 새 결제를 반복하지 말고 결과를 다시 확인하거나 센터에 문의해 주세요.', true);
    else if (editing) status('옵션을 다시 선택한 뒤 결제해 주세요.');
    else status(text[order.payment_state] || '결제 결과를 확인하고 있어요.');
    render();
  }
  async function api(body) {
    const activeClient = client, expectedUserId = userId;
    const { data: authData, error: authError } = await activeClient.auth.getUser();
    if (authError || authData?.user?.id !== expectedUserId || client !== activeClient || userId !== expectedUserId) {
      const error = new Error('AUTH'); error.code = 'AUTH_REQUIRED'; throw error;
    }
    const { data, error } = await activeClient.functions.invoke('payapp-checkout', { body: { ...body, expected_user_id: expectedUserId } });
    if (error || !data?.ok) {
      let detail = data;
      if (!detail && error?.context?.json) { try { detail = await error.context.json(); } catch (_) {} }
      const failure = new Error('PAYAPP'); failure.code = detail?.code || 'NETWORK'; throw failure;
    }
    return data.order;
  }
  function failureText(error) {
    if (['NOT_CONFIGURED','NOT_ENABLED'].includes(error.code)) return '결제 기능을 준비 중이에요. 센터에 문의해 주세요.';
    if (error.code === 'AUTH_REQUIRED') return '로그인 상태를 확인한 뒤 다시 시도해 주세요.';
    if (error.code === 'CANCEL_UNCERTAIN') return '기존 결제 요청의 취소를 확인 중이에요. 결제 결과 다시 확인 후 시도해 주세요.';
    if (error.code === 'BAD_OPTIONS') return '추가 옵션을 다시 확인해 주세요.';
    if (error.code === 'BAD_PHONE') return '휴대전화번호를 정확히 입력해 주세요.';
    return '결제 요청 상태를 확인하지 못했어요. 같은 결제를 반복하지 말고 다시 확인해 주세요.';
  }
  async function check() {
    if (!pending || !active() || checking || busy) return;
    const token = generation; checking = true; render();
    try {
      const order = await api({ action: 'status', ...(pending.orderId ? { order_id: pending.orderId } : { request_id: pending.requestId }) });
      if (!live(token)) return; displayOrder(order, true);
    } catch (error) {
      if (!live(token)) return;
      if (error.code === 'ORDER_NOT_FOUND') { pending = null; savePending(); current = null; editing = false; status('이 계정에서 확인할 수 있는 결제가 없어요.'); }
      else status(failureText(error), true);
    } finally { if (live(token)) { checking = false; render(); poll(); } }
  }
  function open() {
    if (!active()) return;
    focusReturn = document.activeElement; pollCount = 0;
    if (current?.payment_state === 'cancelled' ||
      (current?.request_status === 'failed' && !['paid','partial_refund'].includes(current.payment_state))) {
      pending = null; current = null; editing = false; clothing.checked = false; locker.checked = false; savePending();
    }
    if (!dialog.open) dialog.showModal(); syncPaymentViewport(); render();
    if (pending) void check(); else { status(''); byId('payAppClothing').focus(); }
  }
  function close() { stopPolling(); if (dialog.open) dialog.close(); if (focusReturn?.isConnected) focusReturn.focus({ preventScroll: true }); }
  function reserveWindow() {
    try { const win = window.open('about:blank', 'centerPayAppCheckout'); if (win) win.document.title = '결제창 준비 중'; return win; } catch (_) { return null; }
  }
  function navigate(payurl) {
    const url = safeUrl(payurl); if (!url) throw new Error('BAD_URL');
    if (popup && !popup.closed) { try { popup.location.replace(url); return; } catch (_) {} }
    // 팝업이 차단되면 같은 창을 사용합니다. 이때도 회원별 요청 ID를 먼저 보관합니다.
    savePending(); window.location.assign(url);
  }
  async function purchase(event) {
    event.preventDefault();
    if (!active() || busy || checking) return;
    if (current && !editing) { if (safeUrl(current.pay_url)) { popup = reserveWindow(); navigate(current.pay_url); pollCount = 0; poll(); } return; }
    const value = phone.value.replace(/[\s-]/g, '');
    if (!/^(010\d{8}|01[16789]\d{7,8})$/.test(value)) { phone.setCustomValidity('휴대전화번호를 정확히 입력해 주세요.'); phone.reportValidity(); return; }
    phone.setCustomValidity('');
    // 사용자 클릭 안에서 먼저 창을 확보하여 모바일 팝업 차단을 줄입니다.
    const selected = selection();
    popup = reserveWindow();
    if (!editing) { pending ||= { requestId: crypto.randomUUID(), orderId: null }; savePending(); }
    const token = generation; busy = true; render(); status('결제창을 준비하고 있어요.');
    try {
      if (editing && current) {
        status('기존 미결제 요청을 정리하고 있어요.');
        const previous = await api({ action: 'cancel_request', order_id: current.id });
        if (!live(token)) return;
        if (previous.payment_state !== 'cancelled') {
          displayOrder(previous);
          if (popup && !popup.closed) popup.close();
          return;
        }
        current = null; editing = false;
        pending = { requestId: crypto.randomUUID(), orderId: null }; savePending();
        status('결제창을 준비하고 있어요.');
      }
      const order = await api({ action: 'create', product_code: PRODUCT, request_id: pending.requestId, phone: value, options: selected });
      if (!live(token)) return;
      displayOrder(order); phone.value = '';
      const sameOptions = current.options.clothing === selected.clothing && current.options.locker === selected.locker;
      if (safeUrl(order.pay_url) && sameOptions) navigate(order.pay_url);
      else if (safeUrl(order.pay_url)) {
        if (popup && !popup.closed) popup.close();
        status('진행 중인 기존 주문이 있어요. 표시된 옵션과 금액을 확인한 뒤 결제창을 다시 열어 주세요.');
      }
      else if (popup && !popup.closed) popup.close();
    } catch (error) {
      if (!live(token)) return;
      if (popup && !popup.closed) popup.close(); status(failureText(error), true);
      if (['NOT_CONFIGURED','NOT_ENABLED','AUTH_REQUIRED','BAD_PHONE','BAD_OPTIONS','BAD_REQUEST'].includes(error.code)) { pending = null; savePending(); }
    } finally { if (live(token)) { busy = false; render(); poll(); } }
  }
  function reset() {
    generation++; stopPolling();
    try { if (popup && !popup.closed) popup.close(); } catch (_) {}
    popup = null; close(); client = null; userId = ''; showServices = null;
    busy = false; checking = false; pending = null; current = null; editing = false; clothing.checked = false; locker.checked = false; phone.value = ''; phone.setCustomValidity(''); status(''); render();
  }
  function start(nextClient, nextUserId, openServices) {
    if (client === nextClient && userId === String(nextUserId)) { showServices = openServices; render(); return; }
    reset(); client = nextClient; userId = String(nextUserId); showServices = openServices;
    pending = readPending();
    const url = new URL(location.href), returned = url.searchParams.get('payapp_return');
    if (UUID.test(returned || '')) {
      if (pending?.orderId !== returned) pending = { requestId: crypto.randomUUID(), orderId: returned };
      url.searchParams.delete('payapp_return'); history.replaceState(history.state, '', url.href);
      showServices?.(); open();
    }
    render();
  }
  openButton.addEventListener('click', open); closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { stopPolling(); cancelAnimationFrame(viewportFrame); viewportFrame = null; });
  window.visualViewport?.addEventListener('resize', queuePaymentViewport);
  window.visualViewport?.addEventListener('scroll', queuePaymentViewport);
  window.addEventListener('resize', queuePaymentViewport);
  phone.addEventListener('focus', queuePaymentViewport);
  phone.addEventListener('blur', queuePaymentViewport);
  form.addEventListener('submit', event => { void purchase(event); });
  clothing.addEventListener('change', render); locker.addEventListener('change', render);
  phone.addEventListener('input', () => phone.setCustomValidity(''));
  recheck.addEventListener('click', () => { pollCount = 0; void check(); });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'center-payapp-return' || event.data.orderId !== pending?.orderId || !active()) return;
    if (popup && event.source !== popup) return;
    showServices?.(); open();
  });
  // 결제 제공자가 opener 연결을 끊더라도 같은 출처의 원래 창에 복귀를 알립니다.
  let returnChannel = null;
  try { returnChannel = new BroadcastChannel('center-payapp-return:v1'); } catch (_) {}
  if (returnChannel) returnChannel.onmessage = event => {
    if (event.data?.type !== 'return' || event.data.orderId !== pending?.orderId || !active()) return;
    showServices?.(); open();
    returnChannel.postMessage({ type: 'received', orderId: pending.orderId });
  };
  window.addEventListener('focus', () => { if (dialog.open) { pollCount = 0; void check(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); else if (dialog.open) { pollCount = 0; void check(); } });
  const app = byId('appScreen');
  if (app) new MutationObserver(() => { if (app.hidden && userId) reset(); }).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  window.PayAppCheckout = Object.freeze({ start, reset });
})();
