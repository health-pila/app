// 회원 전용 계정 화면. 결제 금액·전체 전화번호는 조회하거나 저장하지 않습니다.
(function () {
  'use strict';
  const $ = id => document.getElementById(id), dialog = $('memberAccountDialog');
  const pages = [...dialog.querySelectorAll('[data-account-page]')];
  let client, owner = '', generation = 0, sequence = 0, page = 'home', hooks = {}, offset = 0;
  let loading = false, withdrawing = false, withdrawn = false, returnFocus, routePushed = false, backPending = false, queuedOpen = ''; 
  const seen = new Set();
  const PASSWORD_RETURN_URL = 'https://health-pila.github.io/app/reset-password.html';
  let passwordSending = false, passwordLoading = false, passwordEmail = '', passwordRetryAt = 0, passwordTimer, passwordSequence = 0;
  const valid = ticket => ticket === generation && owner && client;
  function element(tag, value, className) {
    const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el;
  }
  async function auth(ticket) {
    const {data, error} = await client.auth.getUser();
    if (!valid(ticket)) return false;
    if (error || data?.user?.id !== owner) { reset(); return false; }
    return data.user;
  }
  function renderPage(next) {
    page = next;
    dialog.dataset.accountView = page;
    pages.forEach(el => { el.hidden = el.dataset.accountPage !== page; });
    $('accountHeading').textContent = ({home:'내 정보', payments:'내 결제 내역', password:'비밀번호 변경', withdraw:'앱 탈퇴 요청', privacy:'개인정보처리방침'})[page];
    $('accountBack').hidden = page === 'home';
    dialog.querySelector('.account-body').scrollTop = 0;
    if (page === 'payments') void loadPayments(false);
    clearTimeout(passwordTimer);
    if (page === 'password') void loadPasswordEmail();
    if (page === 'withdraw') {
      $('accountWithdrawAck').checked = false;
      $('accountWithdrawSubmit').disabled = true;
      $('accountWithdrawMessage').textContent = withdrawn ? '탈퇴 요청이 접수되어 있습니다. 센터에서 확인 후 처리합니다.' : '';
    }
  }
  function open(next = 'home') {
    if (!owner || !client) return;
    if (backPending) { queuedOpen = next; return; }
    if (!dialog.open) {
      returnFocus = document.activeElement;
      dialog.showModal();
      history.pushState({...history.state, centerAccount: true}, '', location.href); routePushed = true;
    }
    renderPage(next); $('accountHeading').tabIndex = -1; $('accountHeading').focus({preventScroll:true});
  }
  function close(fromPop = false) {
    clearTimeout(passwordTimer);
    sequence++; loading = false;
    if (dialog.open) dialog.close();
    if (routePushed && !fromPop) { routePushed = false; backPending = true; history.back(); }
    else routePushed = false;
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({preventScroll:true});
  }
  function updatePasswordButton() {
    clearTimeout(passwordTimer);
    const seconds = Math.max(0, Math.ceil((passwordRetryAt - Date.now()) / 1000));
    const button = $('accountPasswordSend');
    button.disabled = !owner || !passwordEmail || passwordSending || passwordLoading || seconds > 0;
    button.textContent = passwordSending ? '메일 요청 중…' : seconds > 0 ? seconds + '초 후 다시 요청' : '변경 안내 메일 받기';
    if (dialog.open && page === 'password' && seconds > 0) passwordTimer = setTimeout(updatePasswordButton, 1000);
  }
  async function loadPasswordEmail() {
    const ticket = generation, seq = ++passwordSequence;
    passwordLoading = true; passwordEmail = ''; $('accountPasswordEmail').textContent = '이메일 확인 중…';
    $('accountPasswordMessage').textContent = ''; updatePasswordButton();
    try {
      const user = await auth(ticket);
      if (!user || !valid(ticket) || seq !== passwordSequence) return;
      passwordEmail = typeof user.email === 'string' ? user.email.trim() : '';
      $('accountPasswordEmail').textContent = passwordEmail || '이메일 정보가 없습니다.';
      if (!passwordEmail) $('accountPasswordMessage').textContent = '이 계정의 이메일을 확인하지 못했습니다. 센터 데스크로 문의해 주세요.';
    } catch (_) {
      if (valid(ticket) && seq === passwordSequence) $('accountPasswordMessage').textContent = '이메일을 확인하지 못했습니다. 뒤로 갔다가 다시 열어 주세요.';
    } finally { if (valid(ticket) && seq === passwordSequence) { passwordLoading = false; updatePasswordButton(); } }
  }
  async function sendPasswordEmail() {
    if (!owner || !client || passwordSending || passwordLoading || !passwordEmail || passwordRetryAt > Date.now()) return;
    const ticket = generation, db = client;
    passwordSending = true; updatePasswordButton(); $('accountPasswordMessage').textContent = '변경 안내 메일을 요청하고 있어요…';
    try {
      // 화면의 이메일 문자열을 신뢰하지 않고 현재 인증된 계정을 다시 확인합니다.
      const user = await auth(ticket);
      if (!user || !valid(ticket)) return;
      const email = typeof user.email === 'string' ? user.email.trim() : '';
      if (!email) throw new Error();
      passwordEmail = email; $('accountPasswordEmail').textContent = email;
      const {error} = await db.auth.resetPasswordForEmail(email, {redirectTo:PASSWORD_RETURN_URL});
      if (!valid(ticket)) return;
      if (error) {
        if (error.status === 429 || ['over_email_send_rate_limit','over_request_rate_limit'].includes(error.code)) {
          passwordRetryAt = Date.now() + 60000;
          $('accountPasswordMessage').textContent = '요청이 많아 잠시 기다려야 해요. 잠시 후 다시 눌러 주세요.';
        } else $('accountPasswordMessage').textContent = '메일을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요. 계속 안 되면 센터 데스크로 문의해 주세요.';
        return;
      }
      passwordRetryAt = Date.now() + 60000;
      $('accountPasswordMessage').textContent = '변경 안내 메일 발송을 요청했습니다. 받은 메일의 링크를 눌러 새 비밀번호를 설정해 주세요.';
    } catch (_) {
      if (valid(ticket)) $('accountPasswordMessage').textContent = '요청 결과를 확인하지 못했습니다. 받은 메일과 인터넷 연결을 확인해 주세요.';
    } finally { if (valid(ticket)) { passwordSending = false; updatePasswordButton(); } }
  }
  async function loadPayments(more) {
    if (!owner || !client || (more && loading)) return;
    const ticket = generation, seq = ++sequence, db = client, uid = owner;
    loading = true; $('accountPaymentsRefresh').disabled = true; $('accountPaymentsMore').disabled = true;
    if (!more) { offset = 0; seen.clear(); $('accountPaymentList').replaceChildren(); $('accountPaymentsMore').hidden = true; }
    $('accountPaymentMessage').textContent = '결제 내역을 확인하고 있어요…';
    try {
      if (!await auth(ticket) || seq !== sequence) return;
      const {data, error} = await db.functions.invoke('payapp-checkout', {body:{action:'member_history', expected_user_id:uid, offset}});
      if (!valid(ticket) || seq !== sequence || !dialog.open || page !== 'payments') return;
      if (error || !data?.ok || !Array.isArray(data.entries) || typeof data.has_more !== 'boolean') throw new Error();
      for (const row of data.entries) {
        if (typeof row.id !== 'string' || seen.has(row.id) || !['paid','cancelled','partial_refund'].includes(row.payment_state)) continue;
        const card = element('article', '', 'account-payment-card');
        card.append(element('h3', String(row.product_name || '상품명 확인 필요')));
        if (row.payment_state !== 'paid') card.append(element('p', row.payment_state === 'cancelled' ? '결제 취소·환불' : '일부 취소', 'account-payment-state'));
        const when = row.paid_at ? new Date(row.paid_at) : null;
        card.append(element('p', '결제 일시: ' + (when && Number.isFinite(when.getTime()) ? when.toLocaleString('ko-KR', {timeZone:'Asia/Seoul'}) : '확인 필요')));
        const months = row.installment_months;
        if (Number.isInteger(months) && months >= 0 && months <= 60) card.append(element('p', '할부: ' + (months <= 1 ? '일시불' : months + '개월')));
        $('accountPaymentList').append(card); seen.add(row.id);
      }
      offset += data.entries.length;
      $('accountPaymentsMore').hidden = !data.has_more;
      $('accountPaymentMessage').textContent = seen.size ? '' : '아직 결제한 내역이 없어요.';
    } catch (_) {
      if (valid(ticket) && seq === sequence) $('accountPaymentMessage').textContent = '결제 내역을 불러오지 못했어요. 새로고침을 눌러 다시 확인해 주세요.';
    } finally {
      if (valid(ticket) && seq === sequence) { loading = false; $('accountPaymentsRefresh').disabled = false; $('accountPaymentsMore').disabled = false; }
    }
  }
  async function withdraw() {
    if (!owner || withdrawing || withdrawn || !$('accountWithdrawAck').checked) return;
    const ticket = generation, db = client;
    withdrawing = true; $('accountWithdrawSubmit').disabled = true; $('accountWithdrawMessage').textContent = '탈퇴 요청을 보내고 있어요…';
    try {
      if (!await auth(ticket)) return;
      const {data, error} = await db.rpc('request_member_app_withdrawal');
      if (!valid(ticket)) return;
      if (error || !data?.ok) throw new Error();
      withdrawn = true;
      $('accountWithdrawMessage').textContent = '탈퇴 요청이 접수되었습니다. 센터에서 확인 후 처리합니다. 진행 상황은 센터 커뮤니티의 문의하기에서 확인하실 수 있습니다.';
      void hooks.refreshInquiries?.();
    } catch (_) {
      if (valid(ticket)) $('accountWithdrawMessage').textContent = '요청 결과를 확인하지 못했습니다. 다시 눌러 확인해 주세요. 문의 접수가 중단된 경우 센터(02-2602-9184)로 연락해 주세요.';
    } finally { if (valid(ticket)) { withdrawing = false; $('accountWithdrawSubmit').disabled = withdrawn || !$('accountWithdrawAck').checked; } }
  }
  function reset() {
    passwordSequence++; clearTimeout(passwordTimer); passwordEmail = ''; passwordRetryAt = 0; passwordSending = false; passwordLoading = false;
    $('accountPasswordEmail').textContent = ''; $('accountPasswordMessage').textContent = '';
    generation++; sequence++; queuedOpen = ''; close(); client = null; owner = ''; hooks = {}; loading = false; withdrawing = false; withdrawn = false;
    seen.clear(); offset = 0; $('accountName').textContent = ''; $('accountEmail').textContent = '';
    $('accountPaymentList').replaceChildren(); $('accountPaymentMessage').textContent = ''; $('accountWithdrawMessage').textContent = '';
    $('accountWithdrawAck').checked = false; $('accountWithdrawSubmit').disabled = true;
  }
  function start(db, uid, callbacks = {}) {
    reset(); client = db; owner = uid; hooks = callbacks;
    const ticket = generation;
    void auth(ticket).then(async user => {
      if (!user || !valid(ticket)) return;
      $('accountEmail').textContent = user.email || '';
      const {data, error} = await db.from('profiles').select('display_name').eq('id', uid).maybeSingle();
      if (valid(ticket) && !error) $('accountName').textContent = data?.display_name || '회원';
    }).catch(() => {});
  }
  $('memberInfoButton').addEventListener('click', () => open());
  dialog.querySelectorAll('[data-account-open]').forEach(b => b.addEventListener('click', () => renderPage(b.dataset.accountOpen)));
  $('accountClose').addEventListener('click', () => close());
  $('accountBack').addEventListener('click', () => renderPage('home'));
  $('logoutButton').addEventListener('click', () => close());
  $('accountWithdrawAck').addEventListener('change', () => { $('accountWithdrawSubmit').disabled = withdrawn || withdrawing || !$('accountWithdrawAck').checked; });
  $('accountWithdrawSubmit').addEventListener('click', withdraw);
  $('accountPasswordSend').addEventListener('click', sendPasswordEmail);
  $('accountPaymentsRefresh').addEventListener('click', () => loadPayments(false));
  $('accountPaymentsMore').addEventListener('click', () => loadPayments(true));
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  window.addEventListener('popstate', () => { if (backPending) { backPending = false; const next = queuedOpen; queuedOpen = ''; if (next && owner) open(next); } else if (routePushed) close(true); });
  window.addEventListener('centerpayappptpaid', () => { if (dialog.open && page === 'payments') void loadPayments(false); });
  window.MemberAccount = {start, reset};
})();
