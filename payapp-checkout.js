/* 회원 결제 전용. 상품/금액은 서버에서 다시 확정하며 기존 회원 기록을 수정하지 않습니다. */
(() => {
  'use strict';
  const host = document.getElementById('payAppProduct');
  if (!host) return;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PRODUCTS = Object.freeze([
    Object.freeze({ code: 'autumn-gym-6m', name: '가을이벤트) 헬스 6개월', label: '헬스 6개월', amount: 180000, months: 6, compact: false }),
    Object.freeze({ code: 'gym-3m', name: '헬스 3개월', label: '헬스 3개월', amount: 115000, months: 3, compact: true }),
    Object.freeze({ code: 'gym-12m', name: '헬스 12개월', label: '헬스 12개월', amount: 330000, months: 12, compact: true }),
    Object.freeze({ code: 'one-day-pt', name: '1DAY PT', label: '1DAY PT 1회', amount: 33000, months: 0, cartOnly: true })
  ]);
  const productByCode = code => PRODUCTS.find(item => item.code === code);
  let product = PRODUCTS[0], wantedProduct = null;
  let ptSelection = [], wantedPT = null;
  const paidNotices = new Set();
  function validatePT(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new Error('BAD_EXERCISES');
    const ids = new Set();
    return value.map(item => {
      if (!item || typeof item.exerciseId !== 'string' || !/^(EX\d{3}|MY:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(item.exerciseId) || ids.has(item.exerciseId) || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(item.name)) throw new Error('BAD_EXERCISES');
      ids.add(item.exerciseId); return { exerciseId: item.exerciseId, name: item.name.trim() };
    });
  }
  const samePT = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  host.innerHTML = PRODUCTS.filter(item => !item.cartOnly).map((item, index) => `<article class="payapp-product${item.compact ? ' payapp-product-compact' : ''}" data-product-code="${item.code}"><div><span class="payapp-product-badge">무이자할부 전용</span><h3>${item.name}</h3><p class="payapp-product-price">${item.amount.toLocaleString('ko-KR')}<span>원</span></p></div><button id="${index === 0 ? 'openPayAppCheckout' : 'openPayAppCheckout-' + item.code}" data-payapp-product="${item.code}" type="button" aria-label="${item.name} 결제하기" disabled>결제하기</button></article>`).join('');
  const dialog = document.createElement('dialog'); dialog.id = 'payAppCheckoutDialog'; dialog.className = 'payapp-dialog';
  dialog.setAttribute('aria-labelledby', 'payAppCheckoutTitle');
  dialog.innerHTML = `<form id="payAppCheckoutForm">
  <div class="payapp-dialog-heading"><h2 id="payAppCheckoutTitle">가을이벤트) 헬스 6개월</h2><button id="closePayAppCheckout" type="button">닫기</button></div>
  <div class="payapp-dialog-body">
    <p class="payapp-dialog-price">180,000원</p>
    <div id="payAppPTOffer" class="payapp-pt-offer" hidden><span>정가 <s>66,000원</s></span><strong>50% 할인 · 33,000원</strong></div>
    <div id="payAppPTExercises" hidden><h3 class="payapp-pt-list-title">선택한 운동</h3><ol class="payapp-pt-exercises"></ol></div>
    <fieldset id="payAppOptions" class="payapp-options"><legend>추가 옵션</legend>
      <label class="payapp-option" id="payAppClothingRow"><input id="payAppClothing" type="checkbox"><span class="payapp-option-copy"><strong>운동복 대여</strong><span>월 5,000원 × 6개월</span></span><strong class="payapp-option-price">+30,000원</strong></label>
      <label class="payapp-option" id="payAppLockerRow"><input id="payAppLocker" type="checkbox"><span class="payapp-option-copy"><strong>개인락커 이용</strong><span>월 5,000원 × 6개월</span></span><strong class="payapp-option-price">+30,000원</strong></label>
    </fieldset>
    <p class="payapp-help payapp-holding-note">헬스 홀딩 시 옵션 상품도 함께 홀딩됩니다.</p>
    <dl class="payapp-breakdown" aria-label="결제 금액 구성"><div><dt>헬스 6개월</dt><dd>180,000원</dd></div><div id="payAppClothingBreakdown" hidden><dt>운동복 대여</dt><dd>30,000원</dd></div><div id="payAppLockerBreakdown" hidden><dt>개인락커 이용</dt><dd>30,000원</dd></div></dl>
    <p id="payAppPTNotice" class="payapp-start-notice" hidden><strong>결제 후 센터에서 일정 조율을 위한 문자를 드립니다.</strong></p>
    <div id="payAppPhoneField"><p class="payapp-start-notice" id="payAppStartNotice"><strong>결제하신 회원권의 개시일은 기존 만료일 다음날로 지정됩니다.<br>시작일 변경이 필요하시면 센터로 문의해주세요.</strong></p><label for="payAppBuyerPhone">결제자 휴대전화번호</label><input id="payAppBuyerPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="번호만 입력해주세요." aria-describedby="payAppPhoneHelp payAppStartNotice" maxlength="13" required><p id="payAppPhoneHelp" class="payapp-help">결제 안내에 사용할 번호를 입력해 주세요.</p></div>
    <p id="payAppCheckoutStatus" class="payapp-status" role="status"></p>
  </div>
  <div class="payapp-dialog-footer"><p class="payapp-total"><span>총 결제 금액</span><strong id="payAppTotal" aria-live="polite">180,000원</strong></p><button id="submitPayAppCheckout" class="payapp-primary" type="submit">180,000원 결제하기</button><button id="checkPayAppCheckout" class="payapp-secondary" type="button" hidden>결제 결과 다시 확인</button></div>
</form>`;
  document.body.append(dialog);
  const byId = id => document.getElementById(id);
  const openButtons = [...host.querySelectorAll('[data-payapp-product]')], closeButton = byId('closePayAppCheckout');
  const form = byId('payAppCheckoutForm'), phone = byId('payAppBuyerPhone'), phoneField = byId('payAppPhoneField');
  const submit = byId('submitPayAppCheckout'), recheck = byId('checkPayAppCheckout'), message = byId('payAppCheckoutStatus');
  const clothing = byId('payAppClothing'), locker = byId('payAppLocker'), optionFields = byId('payAppOptions');
  const selection = () => ({ clothing: product.cartOnly ? false : clothing.checked, locker: product.cartOnly ? false : locker.checked });
  const price = (value, item = product) => item.amount + item.months * 5000 * (Number(value.clothing) + Number(value.locker));
  const money = value => value.toLocaleString('ko-KR') + '원';
  let client = null, userId = '', generation = 0, busy = false, checking = false, current = null;
  let editing = false, choiceBlocked = false;
  let pending = null, popup = null, timer = null, pollCount = 0, focusReturn = null, restorePage = null;
  let originTab = null, returning = false;
  const TAB_PANELS = Object.freeze({routine:'routineTabPanel',workoutLog:'workoutLogTabPanel',services:'memberServicesTabPanel',community:'communityTabPanel'});
  function captureOrigin(chosen) {
    return Object.keys(TAB_PANELS).find(tab => byId(TAB_PANELS[tab])?.hidden === false) || (chosen.cartOnly ? 'routine' : 'services');
  }
  function restoreOrigin(order) {
    if (!returning) return;
    // 호출자는 서버 응답의 주문/상품/금액을 검증한 뒤에만 이 함수를 실행합니다.
    returning = false;
    const actual = productByCode(order.product_code) || PRODUCTS.find(item => item.name === order.product_name);
    if (!actual || (wantedProduct && wantedProduct.code !== actual.code)) return;
    const context = pending?.returnContext;
    const saved = context && context.orderId === order.id && context.productCode === actual.code && Object.hasOwn(TAB_PANELS, context.tab);
    originTab = saved ? context.tab : actual.cartOnly ? 'routine' : 'services';
    restorePage?.(originTab);
  }
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
    const isPT = product.code === 'one-day-pt';
    dialog.classList.toggle('is-pt', isPT);
    optionFields.hidden = isPT;
    dialog.querySelector('.payapp-holding-note').hidden = isPT;
    dialog.querySelector('.payapp-breakdown').hidden = isPT;
    dialog.querySelector('.payapp-dialog-price').hidden = isPT;
    byId('payAppPTOffer').hidden = !isPT; byId('payAppPTExercises').hidden = !isPT;
    byId('payAppPTNotice').hidden = !isPT; byId('payAppStartNotice').hidden = isPT;
    phone.setAttribute('aria-describedby', 'payAppPhoneHelp ' + (isPT ? 'payAppPTNotice' : 'payAppStartNotice'));
    const exerciseList = byId('payAppPTExercises').querySelector('ol'); exerciseList.replaceChildren();
    if (isPT) for (const exercise of ptSelection) { const li = document.createElement('li'); li.textContent = exercise.name; exerciseList.append(li); }
    byId('payAppCheckoutTitle').textContent = product.name;
    dialog.querySelector('.payapp-dialog-price').textContent = money(product.amount);
    dialog.querySelectorAll('.payapp-option-copy > span').forEach(node => { node.textContent = '월 5,000원 × ' + product.months + '개월'; });
    dialog.querySelectorAll('.payapp-option-price').forEach(node => { node.textContent = '+' + money(product.months * 5000); });
    const base = dialog.querySelector('.payapp-breakdown > div');
    base.querySelector('dt').textContent = product.label; base.querySelector('dd').textContent = money(product.amount);
    byId('payAppClothingBreakdown').querySelector('dd').textContent = money(product.months * 5000);
    byId('payAppLockerBreakdown').querySelector('dd').textContent = money(product.months * 5000);
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
    submit.disabled = choiceBlocked || busy || checking || Boolean(pending && !order && !editing) || !active();
    submit.textContent = order ? '결제창 다시 열기' : money(amount) + ' 결제하기';
    recheck.hidden = !pending;
    recheck.disabled = busy || checking;
    openButtons.forEach(button => { button.disabled = !active() || busy || checking; });
    form.setAttribute('aria-busy', String(busy || checking));
    queuePaymentViewport();
  }
  function readOrder(order) {
    const orderProduct = order && (order.product_code === undefined
      ? PRODUCTS.find(item => item.name === order.product_name) : productByCode(order.product_code));
    if (!order || !UUID.test(order.id || '') || !orderProduct || order.product_name !== orderProduct.name) throw new Error('BAD_ORDER');
    const selected = order.options === undefined && order.amount === orderProduct.amount ? { clothing: false, locker: false } : order.options;
    if (!selected || typeof selected.clothing !== 'boolean' || typeof selected.locker !== 'boolean' || order.amount !== price(selected, orderProduct)) throw new Error('BAD_ORDER');
    const orderPT = orderProduct.cartOnly ? validatePT(order.pt_exercises) : [];
    if (orderProduct.cartOnly && (selected.clothing || selected.locker)) throw new Error('BAD_ORDER');
    return { orderProduct, selected, orderPT };
  }
  function matchesChoice(order, chosen, selected, exercises) {
    const info = readOrder(order);
    return info.orderProduct.code === chosen.code && info.selected.clothing === selected.clothing && info.selected.locker === selected.locker && (!chosen.cartOnly || samePT(info.orderPT, exercises));
  }
  function displayOrder(order, allowEdit = false) {
    const { orderProduct, selected, orderPT } = readOrder(order);
    if (orderProduct.cartOnly && order.payment_state === 'paid' && !paidNotices.has(order.id)) {
      paidNotices.add(order.id);
      window.dispatchEvent(new CustomEvent('centerpayappptpaid', { detail: { userId, orderId: order.id, exercises: orderPT } }));
    }
    const differentChoice = wantedProduct && (wantedProduct.code !== orderProduct.code ||
      (wantedProduct.cartOnly && wantedPT && !samePT(wantedPT, orderPT)));
    choiceBlocked = false;
    if (differentChoice && (['paid','cancelled','partial_refund'].includes(order.payment_state) || order.request_status === 'failed')) {
      // 이전 상품의 종료된 주문은 서버에 남기고 새로 선택한 상품의 화면을 유지합니다.
      product = wantedProduct; ptSelection = product.cartOnly ? (wantedPT || []) : [];
      pending = null; current = null; editing = false; choiceBlocked = false; clothing.checked = false; locker.checked = false; savePending();
      status(orderProduct.name + '의 이전 결제 상태를 확인했어요. 선택한 ' + product.name + '의 금액을 확인한 뒤 결제해 주세요.');
      render(); return;
    }
    if (differentChoice && !(order.payment_state === 'requested' && order.request_status === 'ready')) {
      // 입금 대기/생성 중/통신 불명확 주문은 취소하거나 다른 상품으로 표시하지 않습니다.
      product = wantedProduct; ptSelection = product.cartOnly ? (wantedPT || []) : [];
      current = { ...order, product_code: orderProduct.code, options: selected };
      pending.orderId = order.id; pending.productCode = orderProduct.code; pending.ptExercises = orderPT; savePending();
      editing = true; choiceBlocked = true;
      status(orderProduct.name + (order.payment_state === 'pending' ? '의 입금 또는 승인을 기다리고 있어요. 이전 결제를 확인한 뒤 다시 진행해 주세요.' : '의 이전 결제 요청을 확인 중이에요. 결제 결과 다시 확인을 눌러 주세요.'), true);
      render(); return;
    }
    const canEdit = (allowEdit || differentChoice) && order.payment_state === 'requested' && order.request_status === 'ready';
    if (canEdit) {
      const nextProduct = wantedProduct || orderProduct;
      if (!editing || product.code !== nextProduct.code) { clothing.checked = false; locker.checked = false; phone.value = ''; }
      product = nextProduct;
      ptSelection = nextProduct.cartOnly ? (wantedPT || orderPT) : [];
      editing = true;
    } else {
      product = orderProduct; wantedProduct = null;
      editing = false; clothing.checked = selected.clothing; locker.checked = selected.locker;
      ptSelection = orderPT; wantedPT = null;
    }
    current = { ...order, product_code: orderProduct.code, options: selected }; pending.orderId = order.id; pending.productCode = orderProduct.code; savePending();
    pending.ptExercises = orderPT; savePending();
    const text = { paid: '결제가 완료됐어요.', cancelled: '결제 취소가 확인됐어요.', partial_refund: '일부 금액이 취소된 결제예요.',
      pending: '입금 또는 결제 승인을 기다리고 있어요.', requested: '결제창에서 결제를 진행해 주세요. 창을 닫은 것만으로 결제가 취소되지는 않아요.' };
    if (['paid','cancelled','partial_refund'].includes(order.payment_state)) status(text[order.payment_state]);
    else if (order.request_status === 'failed') status('결제 요청이 거절됐어요. 닫은 뒤 상품을 다시 선택해 시도해 주세요.', true);
    else if (['creating','uncertain'].includes(order.request_status)) status('결제 요청 결과를 확인 중이에요. 새 결제를 반복하지 말고 결과를 다시 확인하거나 센터에 문의해 주세요.', true);
    else if (editing) status(product.cartOnly ? '선택한 운동을 확인한 뒤 결제해 주세요.' : '옵션을 다시 선택한 뒤 결제해 주세요.');
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
    if (error.code === 'BAD_EXERCISES') return '장바구니의 운동 종목을 다시 확인해 주세요.';
    return '결제 요청 상태를 확인하지 못했어요. 같은 결제를 반복하지 말고 다시 확인해 주세요.';
  }
  async function check() {
    if (!pending || !active() || checking || busy) return;
    const token = generation; checking = true; render();
    try {
      const order = await api({ action: 'status', ...(pending.orderId ? { order_id: pending.orderId } : { request_id: pending.requestId }) });
      if (!live(token)) return;
      readOrder(order); restoreOrigin(order); displayOrder(order, true);
    } catch (error) {
      if (!live(token)) return;
      if (error.code === 'ORDER_NOT_FOUND') {
        returning = false;
        pending = null; savePending(); current = null; editing = false; choiceBlocked = false;
        if (wantedProduct) product = wantedProduct;
        clothing.checked = false; locker.checked = false; phone.value = '';
        status('이 계정에서 확인할 수 있는 결제가 없어요.');
      }
      else status(failureText(error), true);
    } finally { if (live(token)) { checking = false; render(); poll(); } }
  }
  function open(code) {
    if (!active()) return;
    focusReturn = document.activeElement; pollCount = 0;
    const chosen = productByCode(code);
    if (chosen) originTab = captureOrigin(chosen);
    if (chosen) wantedProduct = chosen;
    if ((chosen && ['paid','cancelled','partial_refund'].includes(current?.payment_state)) || current?.payment_state === 'cancelled' ||
      (current?.request_status === 'failed' && !['paid','partial_refund'].includes(current.payment_state))) {
      pending = null; current = null; editing = false; choiceBlocked = false; clothing.checked = false; locker.checked = false; savePending();
    }
    if (chosen) {
      if (pending && product.code !== chosen.code) { editing = true; choiceBlocked = true; }
      if (product.code !== chosen.code) { clothing.checked = false; locker.checked = false; phone.value = ''; }
      product = chosen;
      if (!chosen.cartOnly) { ptSelection = []; wantedPT = null; }
    }
    if (!dialog.open) dialog.showModal(); syncPaymentViewport(); render();
    if (pending) void check(); else { status(''); (product.cartOnly ? closeButton : clothing).focus({ preventScroll: true }); }
  }
  function close() { stopPolling(); if (dialog.open) dialog.close(); if (focusReturn?.isConnected) focusReturn.focus({ preventScroll: true }); }
  function reserveWindow() {
    try { const win = window.open('about:blank', 'centerPayAppCheckout'); if (win) win.document.title = '결제창 준비 중'; return win; } catch (_) { return null; }
  }
  function navigate(payurl) {
    const url = safeUrl(payurl); if (!url) throw new Error('BAD_URL');
    if (pending?.orderId && current?.id === pending.orderId) {
      pending.returnContext = {tab:originTab || (product.cartOnly ? 'routine' : 'services'),orderId:pending.orderId,productCode:current.product_code};
      savePending();
    }
    if (popup && !popup.closed) { try { popup.location.replace(url); return; } catch (_) {} }
    // 팝업이 차단되면 같은 창을 사용합니다. 이때도 회원별 요청 ID를 먼저 보관합니다.
    savePending(); window.location.assign(url);
  }
  async function purchase(event) {
    event.preventDefault();
    if (!active() || busy || checking || choiceBlocked) return;
    if (current && !editing) {
      if (!matchesChoice(current, product, selection(), ptSelection)) { displayOrder(current, true); return; }
      if (safeUrl(current.pay_url)) { popup = reserveWindow(); navigate(current.pay_url); pollCount = 0; poll(); } return;
    }
    const value = phone.value.replace(/[\s-]/g, '');
    if (!/^(010\d{8}|01[16789]\d{7,8})$/.test(value)) { phone.setCustomValidity('휴대전화번호를 정확히 입력해 주세요.'); phone.reportValidity(); return; }
    phone.setCustomValidity('');
    // 사용자 클릭 안에서 먼저 창을 확보하여 모바일 팝업 차단을 줄입니다.
    const selected = selection(), selectedProduct = product, selectedPT = selectedProduct.cartOnly ? validatePT(ptSelection) : [];
    wantedProduct = selectedProduct; wantedPT = selectedProduct.cartOnly ? selectedPT : null;
    popup = reserveWindow();
    if (!editing) { pending ||= { requestId: crypto.randomUUID(), orderId: null, productCode: selectedProduct.code }; savePending(); }
    const token = generation; busy = true; render(); status('결제창을 준비하고 있어요.');
    try {
      if (editing && current) {
        status('기존 미결제 요청을 정리하고 있어요.');
        const previous = await api({ action: 'cancel_request', order_id: current.id });
        if (!live(token)) return;
        if (previous.payment_state !== 'cancelled') {
          displayOrder(previous, true);
          if (popup && !popup.closed) popup.close();
          return;
        }
        current = null; editing = false;
        pending = { requestId: crypto.randomUUID(), orderId: null, productCode: selectedProduct.code }; savePending();
        status('결제창을 준비하고 있어요.');
      }
      pending.ptExercises = selectedPT; savePending();
      for (let attempt = 0; attempt < 2; attempt++) {
        const order = await api({ action: 'create', product_code: selectedProduct.code, request_id: pending.requestId, phone: value, options: selected, ...(selectedProduct.cartOnly ? { pt_exercises: selectedPT } : {}) });
        if (!live(token)) return;
        if (matchesChoice(order, selectedProduct, selected, selectedPT)) {
          displayOrder(order); phone.value = '';
          if (safeUrl(order.pay_url)) navigate(order.pay_url);
          else if (popup && !popup.closed) popup.close();
          break;
        }
        // 다른 탭이나 이전 세션의 주문이 반환돼도 선택한 상품 화면을 유지합니다.
        displayOrder(order, true);
        if (attempt === 0 && order.payment_state === 'requested' && order.request_status === 'ready') {
          status('이전 미결제 요청을 정리하고 있어요.');
          const previous = await api({ action: 'cancel_request', order_id: order.id });
          if (!live(token)) return;
          readOrder(previous);
          if (previous.payment_state === 'cancelled') {
            current = null; editing = false; choiceBlocked = false;
            pending = { requestId: crypto.randomUUID(), orderId: null, productCode: selectedProduct.code, ptExercises: selectedPT }; savePending();
            status('선택한 상품의 결제창을 준비하고 있어요.');
            continue;
          }
          displayOrder(previous, true);
        } else if (order.payment_state === 'requested' && order.request_status === 'ready') {
          status('다른 창에서 만든 미결제 요청을 확인했어요. 선택한 상품을 확인한 뒤 다시 결제해 주세요.', true);
        }
        if (popup && !popup.closed) popup.close();
        break;
      }
    } catch (error) {
      if (!live(token)) return;
      if (popup && !popup.closed) popup.close(); status(failureText(error), true);
      if (['NOT_CONFIGURED','NOT_ENABLED','AUTH_REQUIRED','BAD_PHONE','BAD_OPTIONS','BAD_REQUEST','BAD_EXERCISES'].includes(error.code)) { pending = null; savePending(); }
    } finally { if (live(token)) { busy = false; render(); poll(); } }
  }
  function reset() {
    generation++; stopPolling();
    try { if (popup && !popup.closed) popup.close(); } catch (_) {}
    popup = null; close(); client = null; userId = ''; restorePage = null; originTab = null; returning = false;
    product = PRODUCTS[0]; wantedProduct = null;
    ptSelection = []; wantedPT = null; paidNotices.clear();
    busy = false; checking = false; pending = null; current = null; editing = false; choiceBlocked = false; clothing.checked = false; locker.checked = false; phone.value = ''; phone.setCustomValidity(''); status(''); render();
  }
  function start(nextClient, nextUserId, openOrigin) {
    if (client === nextClient && userId === String(nextUserId)) { restorePage = openOrigin; render(); return; }
    reset(); client = nextClient; userId = String(nextUserId); restorePage = openOrigin;
    pending = readPending(); product = productByCode(pending?.productCode) || PRODUCTS[0];
    if (product.cartOnly) { try { ptSelection = validatePT(pending.ptExercises); } catch (_) { ptSelection = []; } }
    const url = new URL(location.href), returned = url.searchParams.get('payapp_return');
    if (UUID.test(returned || '')) {
      if (pending?.orderId !== returned) pending = { requestId: crypto.randomUUID(), orderId: returned };
      url.searchParams.delete('payapp_return'); history.replaceState(history.state, '', url.href);
      returning = true; open();
    }
    render();
  }
  openButtons.forEach(button => button.addEventListener('click', () => open(button.dataset.payappProduct)));
  closeButton.addEventListener('click', close);
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
    returning = true; open();
  });
  // 결제 제공자가 opener 연결을 끊더라도 같은 출처의 원래 창에 복귀를 알립니다.
  let returnChannel = null;
  try { returnChannel = new BroadcastChannel('center-payapp-return:v1'); } catch (_) {}
  if (returnChannel) returnChannel.onmessage = event => {
    if (event.data?.type !== 'return' || event.data.orderId !== pending?.orderId || !active()) return;
    returning = true; open();
    returnChannel.postMessage({ type: 'received', orderId: pending.orderId });
  };
  window.addEventListener('focus', () => { if (dialog.open) { pollCount = 0; void check(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); else if (dialog.open) { pollCount = 0; void check(); } });
  const app = byId('appScreen');
  if (app) new MutationObserver(() => { if (app.hidden && userId) reset(); }).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  function openPT(exercises) {
    if (!active() || busy || checking) return false;
    try { wantedPT = validatePT(exercises); } catch (_) { return false; }
    ptSelection = wantedPT;
    const cart = byId('oneDayPtDialog'); if (cart?.open) cart.close();
    open('one-day-pt'); return true;
  }
  window.PayAppCheckout = Object.freeze({ start, reset, openPT });
})();
