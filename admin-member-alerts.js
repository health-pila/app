/* Shared signup notices; browser storage is used only to import the old pending list once. */
(() => {
  'use strict';
  if (window.AdminMemberAlerts) return;
  const screen = document.getElementById('adminScreen');
  const list = document.getElementById('adminMemberSignupList');
  const count = document.getElementById('adminMemberSignupCount');
  const status = document.getElementById('adminMemberSignupStatus');
  if (!screen || !list || !count || !status) return;
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  let client = null, user = '', generation = 0, sequence = 0, choose = null;
  let rows = [], total = 0, hasSnapshot = false, imported = false;
  let timer = null, controller = null, loading = false, acknowledging = '', refreshAgain = false;
  const active = ticket => ticket === generation && client && user && !screen.hidden;
  const current = (ticket, serial, owner) => active(ticket) && serial === sequence && owner === user;
  const migrationKey = () => 'adminMemberSignupServer:v2:' + user;
  function stopTimer() { clearTimeout(timer); timer = null; }
  function schedule() {
    stopTimer();
    if (active(generation) && !document.hidden) timer = setTimeout(() => { void refresh(); }, 15000);
  }
  function legacyPending() {
    try {
      if (localStorage.getItem(migrationKey()) === 'done') return null;
      const raw = localStorage.getItem('adminMemberSignup:v1:' + user);
      if (!raw || raw.length > 2000000) return null;
      const value = JSON.parse(raw);
      if (value?.version !== 1 || !Array.isArray(value.known) || !Array.isArray(value.pending) ||
          value.pending.length > 10000 || ![...value.known, ...value.pending].every(uuid)) return null;
      const known = new Set(value.known);
      if (!value.pending.every(id => known.has(id))) return null;
      return [...new Set(value.pending)];
    } catch (_) { return null; }
  }
  function validate(data) {
    if (data?.ok !== true || data.version !== 2 || !Number.isSafeInteger(data.count) || data.count < 0 ||
        !Array.isArray(data.entries) || data.entries.length > 200 || data.count < data.entries.length ||
        (data.count > 0 && !data.entries.length) || new Set(data.entries.map(row => row?.id)).size !== data.entries.length ||
        data.entries.some(row => !uuid(row?.id) || typeof row.display_name !== 'string' || row.display_name.length > 100 ||
          !(row.phone_last4 === null || /^\d{4}$/.test(row.phone_last4)) || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) ||
        !Array.isArray(data.linked_user_ids) || data.linked_user_ids.length > 100000 || !data.linked_user_ids.every(uuid)) throw Error('INVALID_SIGNUP_NOTICES');
    const linked = new Set(data.linked_user_ids);
    if (data.entries.some(row => linked.has(row.id))) throw Error('LINKED_SIGNUP_NOTICE');
    return data;
  }
  async function request(db, name, args, abort) {
    let timeout;
    try {
      let query = db.rpc(name, args);
      if (query.abortSignal) query = query.abortSignal(abort.signal);
      const { data, error } = await Promise.race([query, new Promise((_, reject) => {
        timeout = setTimeout(() => { abort.abort(); reject(Error('SIGNUP_TIMEOUT')); }, 10000);
      })]);
      if (error) throw error;
      return validate(data);
    } finally { clearTimeout(timeout); }
  }
  function message(text, error = false) {
    if (status.textContent !== text) status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function render() {
    count.textContent = hasSnapshot ? `미확인 ${total}명` : '확인 중';
    count.classList.toggle('has-requests', total > 0);
    const fragment = document.createDocumentFragment();
    const ticket = generation;
    for (const row of rows) {
      const card = document.createElement('div'); card.className = 'admin-member-signup-card'; card.dataset.memberId = row.id;
      const info = document.createElement('div'), name = document.createElement('strong'), date = document.createElement('span');
      name.textContent = row.display_name + (row.phone_last4 ? ' · ' + row.phone_last4 : ' · 전화번호 미등록');
      date.textContent = '가입 ' + new Date(row.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      info.append(name, date);
      const actions = document.createElement('div'); actions.className = 'admin-member-signup-actions';
      const select = document.createElement('button'); select.type = 'button'; select.textContent = '출석 연결';
      select.addEventListener('click', () => { if (active(ticket)) void choose?.(row.id); });
      const seen = document.createElement('button'); seen.type = 'button'; seen.textContent = acknowledging === row.id ? '저장 중…' : '알림만 정리';
      seen.disabled = Boolean(acknowledging); seen.setAttribute('aria-label', row.display_name + ' 가입 알림 확인');
      seen.addEventListener('click', () => { if (active(ticket)) void acknowledge(row.id); });
      actions.append(select, seen); card.append(info, actions); fragment.append(card);
    }
    list.replaceChildren(fragment);
  }
  function apply(data, linkTicket, silent = false) {
    rows = data.entries; total = data.count; hasSnapshot = true;
    window.AdminMemberPicker?.applySync(data.linked_user_ids, linkTicket);
    render();
    window.AdminWorkspace?.syncSignup(rows, total);
    message(total ? total > rows.length ? `미확인 ${total}명 중 최근 ${rows.length}명을 표시해요. 확인하면 다음 알림을 볼 수 있어요.` : '새로 가입한 회원이에요. 출석 연결을 확인해 주세요.' : '미확인 신규 가입 회원이 없어요.');
    void window.AdminRoutineAlerts?.syncMembers(rows.map(row => row.id), total, silent);
  }
  async function refresh(force = false, silent = false) {
    if (!active(generation) || document.hidden) return;
    if (acknowledging) { refreshAgain = true; return; }
    if (loading && !force) return;
    stopTimer(); controller?.abort(); controller = new AbortController();
    const abort = controller, ticket = generation, serial = ++sequence, owner = user, db = client;
    const linkTicket = window.AdminMemberPicker?.captureSync();
    loading = true;
    try {
      let data;
      const pending = imported ? null : legacyPending();
      if (pending !== null) {
        data = await request(db, 'admin_import_signup_pending', { p_expected_admin_id: owner, p_member_ids: pending }, abort);
        if (!current(ticket, serial, owner)) return;
        imported = true;
        try { localStorage.setItem(migrationKey(), 'done'); } catch (_) {}
      } else {
        data = await request(db, 'admin_member_signup_notices', { p_expected_admin_id: owner }, abort);
        if (!current(ticket, serial, owner)) return;
        imported = true;
      }
      apply(data, linkTicket, silent);
    } catch (_) {
      if (current(ticket, serial, owner)) { message(hasSnapshot ? '신규 가입 알림을 갱신하지 못했어요. 이전 조회 결과를 표시하고 있어요.' : '신규 가입 알림을 불러오지 못했어요. 잠시 후 다시 확인할게요.', true); window.AdminWorkspace?.queueError('signup'); }
    } finally {
      if (current(ticket, serial, owner)) { loading = false; controller = null; schedule(); }
    }
  }
  async function acknowledge(id) {
    if (!active(generation) || !uuid(id) || acknowledging || !rows.some(row => row.id === id)) return;
    stopTimer(); controller?.abort(); controller = new AbortController();
    const abort = controller, ticket = generation, serial = ++sequence, owner = user, db = client;
    const linkTicket = window.AdminMemberPicker?.captureSync();
    loading = false; acknowledging = id; render(); message('알림 확인 상태를 저장하고 있어요.');
    try {
      const data = await request(db, 'admin_ack_member_signup', { p_expected_admin_id: owner, p_member_id: id }, abort);
      if (current(ticket, serial, owner)) apply(data, linkTicket, true);
    } catch (_) {
      if (current(ticket, serial, owner)) message('확인 상태를 저장하지 못했어요. 알림의 확인 버튼을 다시 눌러주세요.', true);
    } finally {
      if (current(ticket, serial, owner)) {
        acknowledging = ''; controller = null; render(); schedule();
        if (refreshAgain) { refreshAgain = false; void refresh(true, true); }
      }
    }
  }
  function reset() {
    generation++; sequence++; stopTimer(); controller?.abort(); controller = null;
    client = null; user = ''; choose = null; rows = []; total = 0; hasSnapshot = false; imported = false;
    loading = false; acknowledging = ''; refreshAgain = false;
    list.replaceChildren(); count.textContent = '미확인 0명'; count.classList.remove('has-requests');
    message('신규 가입 회원을 확인하고 있어요.');
  }
  function start(db, id, onChoose) {
    reset(); if (!db || !uuid(id)) return;
    client = db; user = id; choose = onChoose; count.textContent = '확인 중'; void refresh();
  }
  new MutationObserver(() => { if (screen.hidden && user) reset(); }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  const resume = () => { if (!document.hidden) void refresh(true); };
  window.addEventListener('focus', resume); window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTimer(); else resume(); });
  window.AdminMemberAlerts = Object.freeze({ start, reset, refresh,
    linked: id => { if (rows.some(row => row.id === id)) void refresh(true, true); }
  });
})();
