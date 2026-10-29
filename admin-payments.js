(() => {
  'use strict';
  const section = document.getElementById('adminPayments');
  const screen = document.getElementById('adminScreen');
  if (!section || !screen) return;
  const byId = id => document.getElementById(id);
  const filter = byId('adminPaymentsFilter'), refresh = byId('refreshAdminPayments');
  const list = byId('adminPaymentsList'), message = byId('adminPaymentsMessage');
  const previous = byId('previousAdminPayments'), next = byId('nextAdminPayments');
  const pageLabel = byId('adminPaymentsPage');
  const labels = { paid: '결제 완료', cancelled: '취소', partial_refund: '일부 취소' };
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  let client = null, userId = '', generation = 0, requestId = 0, timer = null;
  let busy = false, blocked = false, offset = 0, hasMore = false, entries = [];
  const active = () => Boolean(client && userId && !screen.hidden);
  const live = (token, serial) => token === generation && serial === requestId && active();
  function stop() { clearTimeout(timer); timer = null; }
  function status(text, error = false) { message.textContent = text; message.classList.toggle('is-error', error); }
  function controls() {
    const enabled = active() && !blocked;
    filter.disabled = !enabled;
    refresh.disabled = !enabled || busy;
    previous.disabled = !enabled || busy || offset === 0;
    next.disabled = !enabled || busy || !hasMore;
    pageLabel.textContent = `${Math.floor(offset / 20) + 1}페이지`;
    list.setAttribute('aria-busy', String(busy));
  }
  function textNode(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className; element.textContent = text; return element;
  }
  function time(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? formatter.format(date) : '확인 중';
  }
  function render() {
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const card = document.createElement('article'); card.className = 'admin-payment-card';
      const heading = document.createElement('div'); heading.className = 'admin-payment-heading';
      const member = document.createElement('div'); member.className = 'admin-payment-member';
      member.append(textNode('strong', 'admin-payment-name', entry.member_name));
      member.append(textNode('span', 'admin-payment-phone', /^\d{4}$/.test(entry.phone_last4 || '') ? `연락처 끝 ${entry.phone_last4}` : '연락처 끝자리 미등록'));
      heading.append(member, textNode('span', `admin-payment-state is-${entry.payment_state}`, labels[entry.payment_state] || '상태 확인 필요'));
      card.append(heading, textNode('h3', 'admin-payment-product', entry.product_name));
      const options = [entry.options?.clothing && '운동복 대여', entry.options?.locker && '개인락커 이용'].filter(Boolean);
      if (entry.product_code === 'one-day-pt') {
        const selected = document.createElement('ol'); selected.className = 'one-day-pt-exercises';
        for (const exercise of (Array.isArray(entry.pt_exercises) ? entry.pt_exercises.slice(0, 5) : [])) selected.append(textNode('li', '', String(exercise.name || '')));
        card.append(textNode('p', 'admin-payment-options', '1DAY PT 선택 운동'), selected);
      } else card.append(textNode('p', 'admin-payment-options', options.length ? '추가 옵션: ' + options.join(' · ') : '추가 옵션 없음'));
      const amount = Number(entry.amount);
      const amountLabel = entry.payment_state === 'paid' ? '결제 금액' : '원 주문 금액';
      card.append(textNode('p', 'admin-payment-amount', `${amountLabel} ${Number.isSafeInteger(amount) && amount >= 0 ? amount.toLocaleString('ko-KR') + '원' : '확인 필요'}`));
      const details = document.createElement('dl'); details.className = 'admin-payment-dates';
      for (const [label, value] of [['주문 접수', entry.requested_at], ['상태 확인', entry.status_changed_at]]) {
        const row = document.createElement('div'); row.append(textNode('dt', '', label), textNode('dd', '', time(value))); details.append(row);
      }
      card.append(details);
      if (entry.payment_state === 'partial_refund') card.append(textNode('p', 'admin-payment-note', '일부 취소 금액과 잔액은 페이앱 판매자 내역에서 확인해 주세요.'));
      fragment.append(card);
    }
    list.replaceChildren(fragment); controls();
  }
  function schedule() {
    stop();
    if (active() && !blocked && !document.hidden) timer = setTimeout(() => { void load(offset, true); }, 15000);
  }
  async function load(target = offset, quiet = false) {
    if (!active() || document.hidden || blocked) return;
    stop();
    const token = generation, serial = ++requestId, expectedUserId = userId, activeClient = client;
    const selectedFilter = filter.value;
    busy = true; controls();
    if (!quiet) status('결제 내역을 불러오고 있어요.');
    try {
      const { data: authData, error: authError } = await activeClient.auth.getUser();
      if (!live(token, serial)) return;
      if (authError || authData?.user?.id !== expectedUserId) { const error = new Error(); error.code = 'AUTH_REQUIRED'; throw error; }
      const { data, error } = await activeClient.functions.invoke('payapp-admin-orders', {
        body: { action: 'list', expected_user_id: expectedUserId, filter: selectedFilter, offset: target }
      });
      if (!live(token, serial)) return;
      if (error || !data?.ok) {
        let detail = data;
        if (!detail && error?.context?.json) { try { detail = await error.context.json(); } catch (_) {} }
        if (!live(token, serial)) return;
        const failure = new Error(); failure.code = detail?.code || 'NETWORK'; throw failure;
      }
      if (!Array.isArray(data.entries) || data.offset !== target || data.page_size !== 20 || typeof data.has_more !== 'boolean') throw new Error('BAD_RESPONSE');
      if (!data.entries.length && target > 0) { void load(Math.max(0, target - 20)); return; }
      offset = target; entries = data.entries; hasMore = data.has_more; render();
      status(entries.length ? '' : '표시할 결제 완료·취소 내역이 없어요.');
    } catch (error) {
      if (!live(token, serial)) return;
      if (['AUTH_REQUIRED', 'ADMIN_REQUIRED'].includes(error.code)) {
        entries = []; hasMore = false; blocked = true; render();
        status(error.code === 'ADMIN_REQUIRED' ? '관리자 권한이 필요한 내역이에요.' : '로그인 상태를 확인해 주세요.', true);
      } else {
        status(entries.length ? '새로 불러오지 못했어요. 현재 표시된 내역은 이전 조회 결과예요.' : '결제 내역을 불러오지 못했어요. 잠시 후 새로고침해 주세요.', true);
      }
    } finally {
      if (live(token, serial)) { busy = false; controls(); schedule(); }
    }
  }
  function reset() {
    generation++; requestId++; stop(); client = null; userId = '';
    busy = false; blocked = false; offset = 0; hasMore = false; entries = [];
    filter.value = 'all'; status(''); render();
  }
  function start(nextClient, nextUserId) {
    if (client === nextClient && userId === String(nextUserId) && !blocked) {
      if (!busy) void load(offset, true); return;
    }
    reset(); client = nextClient; userId = String(nextUserId); controls(); void load(0);
  }
  refresh.addEventListener('click', () => { void load(offset); });
  filter.addEventListener('change', () => { entries = []; offset = 0; hasMore = false; render(); void load(0); });
  previous.addEventListener('click', () => { void load(Math.max(0, offset - 20)); });
  next.addEventListener('click', () => { if (hasMore) void load(offset + 20); });
  window.addEventListener('focus', () => { if (active() && !busy) void load(offset, true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else if (active() && !busy) void load(offset, true);
  });
  new MutationObserver(() => { if (screen.hidden && userId) reset(); }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  window.AdminPayments = Object.freeze({ start, reset });
  controls();
})();
