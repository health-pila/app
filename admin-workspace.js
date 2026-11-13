/* Admin navigation reuses the existing account, CRM, routine, chat and payment handlers. */
(() => {
  'use strict';
  if (window.AdminWorkspace) return;
  const $ = id => document.getElementById(id), screen = $('adminScreen');
  if (!screen) return;
  const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const kinds = { signup: ['신규 가입', '출석 연결', '♙'], routine: ['루틴 신청', '루틴 배정', '▤'], inquiry: ['문의 답변', '답변 대기', '♧'], payment: ['결제 적용', 'CRM 적용 확인', '▱'] };
  let owner = '', client = null, hooks = {}, generation = 0, mounted = false, page = 'requests', kind = 'signup';
  let member = null, memberTab = 'access', selecting = false, detailOpen = false, completion = null, requestMemberFilter = '', applicationMember = '';
  let signup = [], routines = [], signupTotal = null, inquiryTotal = null, routineTotal = null, paymentTotal = null;
  let payments = [], paymentOffset = 0, paymentMore = false, paymentSelected = '', paymentBusy = false, paymentApplying = '', paymentTimer = 0, paymentSequence = 0;
  let paymentAbort = null, paymentAckBusy = false, paymentSeen = new Set(), fresh = new Set(), failed = new Set();
  let currentInquiry = '', inquiryDrafts = new Map(), inquiryCache = new Map(), rosterFrame = 0;
  let inquiryScopeMember = null;
  const active = g => g === generation && !!owner && !!client && !screen.hidden;
  const $root = () => $('adminWorkspaceLayout');
  const mobile = () => window.matchMedia('(max-width: 760px)').matches;
  const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const notify = text => { $('adminWorkspaceStatus').textContent = text; };

  function mount() {
    if (mounted) return; mounted = true;
    const root = el('section', 'admin-workspace-layout'); root.id = 'adminWorkspaceLayout';
    root.innerHTML = `<nav class="aw-nav" aria-label="관리자 메뉴">
      <button type="button" data-aw-page="requests" aria-current="page">요청 처리 <span id="awAllCount" class="aw-count">—</span></button>
      <button type="button" data-aw-page="members">회원 관리</button><button type="button" data-aw-page="operations">센터 운영</button></nav>
      <div class="aw-main"><header class="aw-heading" hidden><div><h1 id="awPageTitle">처리할 요청</h1><p id="awPageHelp">요청을 선택하고 필요한 작업을 바로 처리하세요.</p></div></header>
      <p id="adminWorkspaceStatus" class="aw-status" role="status" aria-live="polite"></p>
      <div id="awKinds" class="aw-kinds" role="group" aria-label="요청 종류"></div>
      <div id="awWorkspace" class="aw-workspace"><button id="awBack" class="aw-back" type="button">‹ 목록으로 돌아가기</button>
        <section id="awQueue" class="aw-queue" aria-label="요청 목록"><div id="awQueueHeading" class="aw-queue-heading"></div><div id="awQueueBody"></div></section>
        <section id="awWork" class="aw-work" aria-label="선택한 요청의 작업"><header class="aw-work-heading"><div><p id="awContext"></p><h2 id="awMemberTitle">목록에서 요청을 선택해 주세요.</h2><div id="awMemberMeta"></div></div><div class="aw-work-actions"><button id="awOpenMember" class="aw-text-button" type="button" hidden>회원 관리에서 보기 ›</button><button id="awClearMember" class="aw-secondary aw-inquiry-close" type="button" hidden>선택 해제</button><button id="awCloseInquiry" class="aw-secondary aw-inquiry-close" type="button" aria-label="문의 상세창 닫기" hidden>닫기 ×</button></div></header>
          <div id="awInquiryTools" class="aw-inquiry-tools" hidden><button id="awFilterInquiryMember" class="aw-secondary" type="button" aria-pressed="false">이 회원과의 대화 검색</button></div>
          <div id="awEmpty" class="aw-empty">목록에서 처리할 요청을 선택해 주세요.</div><div id="awCompletion" class="aw-completion" hidden></div>
          <div id="awMemberWork" class="aw-member-work" hidden><div id="awMemberTabs" class="aw-member-tabs" role="group" aria-label="회원 관리 항목"><button type="button" data-aw-member-tab="access">출석·이용권</button><button type="button" data-aw-member-tab="routine">운동 루틴</button><button type="button" data-aw-member-tab="inquiry">문의</button></div>
            <div id="awAccessSlot"></div><div id="awRoutineSlot"></div><div id="awApplicationSlot" hidden></div><section id="awMemberInquirySlot" hidden aria-label="선택 회원의 문의 내역"><div id="awMemberInquiryList"></div><section id="awMemberInquiryDetail" hidden><header class="aw-member-inquiry-heading"><h3 id="awMemberInquiryTitle">문의 상세</h3><button id="awMemberInquiryClose" class="aw-secondary" type="button">닫기 ×</button></header><div id="awMemberInquiryThread"></div><footer class="aw-member-inquiry-footer"><button id="awMemberInquiryCloseBottom" class="aw-secondary" type="button">닫기</button></footer></section></section></div>
          <div id="awInquiryWork" class="aw-inquiry-work" hidden></div><div id="awPaymentWork" class="aw-payment-work" hidden></div>
          <footer id="awNextBar" class="aw-next-bar" hidden><button id="awClearMemberBottom" class="aw-secondary aw-inquiry-close" type="button" hidden>선택 해제</button><button id="awCloseInquiryBottom" class="aw-secondary aw-inquiry-close" type="button" aria-label="문의 상세창 닫기" hidden>닫기</button><button id="awNext" class="aw-primary" type="button">다음 요청 보기 ›</button></footer>
        </section></div><section id="awOperations" class="aw-operations" hidden><nav class="aw-operation-nav" aria-label="센터 운영 항목"></nav><div id="awOperationBody"></div></section></div>
      <div id="awParking" hidden></div>`;
    const bar = screen.querySelector('.admin-app-topbar'); bar.after(root);
    const hero = screen.querySelector('.admin-app-hero'), sound = hero?.querySelector('.admin-sound-settings');
    const soundSlot = el('div', 'aw-topbar-sound'); soundSlot.id = 'awSoundSlot';
    bar.querySelector('.member-topbar-actions').prepend(soundSlot);
    if (sound) soundSlot.append(sound);
    $('adminSoundStatus').classList.add('member-sr-only');
    if (hero) { hero.classList.add('aw-statistics'); hero.querySelector('h1').textContent = '회원 현황'; }
    for (const [key, [label, sub, glyph]] of Object.entries(kinds)) {
      const b = el('button', 'aw-kind'); b.type = 'button'; b.dataset.awKind = key;
      const icon = el('span', 'aw-kind-icon'); icon.setAttribute('aria-hidden', 'true');
      const paths = { signup: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m4-14v6m-3-3h6"/>', routine: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6m-6 4h6m-6 4h3"/>', inquiry: '<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 9h8m-8 3h5"/>', payment: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>' };
      icon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + paths[key] + '</svg>';
      const text = el('span', 'aw-kind-label', label); text.append(el('small', '', sub));
      const count = el('span', 'aw-count', '—'); count.id = `awCount-${key}`; b.append(icon, text, count); $('awKinds').append(b);
    }
    const browser = $('adminMemberManagement');
    const access = $('adminAttendancePanel'), membership = $('adminMemberAccessPanel'), routine = $('adminRoutineEditor');
    $('awMemberMeta').append($('adminMemberInfo'));
    $('awAccessSlot').append(access);
    const accessDetails = el('details', 'aw-access-details'); accessDetails.id = 'awAccessDetails';
    accessDetails.append(el('summary', '', '이용권 확인 · 앱 이용 관리'), membership); $('awAccessSlot').append(accessDetails);
    $('awRoutineSlot').append(routine);
    const identity = el('div', 'aw-app-identity'); identity.id = 'awAppIdentity';
    identity.append(el('h4', '', '앱 가입 정보'), el('p', '', ''));
    const compare = el('div', 'aw-identity-compare'); compare.append(identity, $('adminAttendanceCandidate')); access.append(compare);
    $('adminAttendanceCandidate').prepend(el('h4', '', '브로제이 조회 결과'));
    $('adminAttendanceTitle').textContent = '센터 출석 연결';
    browser.querySelector('h2').textContent = '회원 검색 · 이용권 분류';
    const roster = el('div', 'aw-member-rows'); roster.id = 'awMemberRows'; browser.append(roster);
    browser.addEventListener('input', updateMemberBrowser);
    const memberFallback = el('div', 'aw-native-picker');
    const nativeSelect = $('adminMemberSelect'), nativeLabel = browser.querySelector('label[for="adminMemberSelect"]'); nativeSelect.before(memberFallback); if (nativeLabel) memberFallback.append(nativeLabel); memberFallback.append(nativeSelect);
    const sortBar = el('div', 'aw-member-sort');
    const sortLabel = el('label', '', '정렬 기준'); sortLabel.htmlFor = 'adminMemberSort';
    const sortSelect = el('select'); sortSelect.id = 'adminMemberSort';
    for (const [value, label] of [['recent', '최근 가입순'], ['name', '이름순'], ['gym', '헬스 만료일순'], ['routines', '루틴배정 많은순']]) { const o = el('option', '', label); o.value = value; sortSelect.append(o); }
    sortSelect.value = window.AdminMemberPicker?.sortMode() || 'recent';
    const sortStatus = el('p', 'aw-help'); sortStatus.id = 'adminMemberSortStatus'; sortStatus.hidden = true; sortStatus.setAttribute('role', 'status');
    sortBar.append(sortLabel, sortSelect); memberFallback.before(sortBar, sortStatus);
    $('awParking').append(browser, $('adminMemberSignupAlerts'), $('adminRoutineRequestManagement'), $('adminInquiryManagement'));
    const routineWorkspace = $('adminRoutineWorkspace'); if (routineWorkspace) routineWorkspace.hidden = true;
    const inquirySetting = $('adminInquiryManagement').querySelector('.admin-inquiry-setting');
    const settings = el('section', 'admin-card aw-setting-card'); settings.append(el('h2', 'admin-section-title', '문의 접수 설정'), inquirySetting, $('adminInquirySettingMessage'));
    const stats = $('adminUsagePanel')?.closest('.admin-card');
    const newsEditor = $('adminCommunityEditor'), newsList = $('adminCommunityManagement');
    const communityList = newsList || $('adminCommunityPostList')?.closest('.admin-card');
    const operations = [
      ['news', '센터 소식', [newsEditor, communityList]], ['statistics', '현황·통계', [hero, stats]],
      ['payments', '결제 내역', [$('adminPayments')]], ['settings', '접수·콘텐츠 설정', [settings, $('adminStretchingManagement')]],
    ];
    const used = new Set();
    for (const [key, label, nodes] of operations) {
      const panel = el('div', 'aw-operation-panel'); panel.dataset.awOperationPanel = key;
      for (const node of nodes) if (node && !used.has(node)) { used.add(node); panel.append(node); }
      $('awOperationBody').append(panel);
      const button = el('button', '', label); button.type = 'button'; button.dataset.awOperation = key; $('awOperations').querySelector('nav').append(button);
    }
    // Retain optional/hidden admin tools in their existing state, without exposing 1DAY PT.
    const optional = $('adminOneDayPtManagement'); if (optional) $('awOperationBody').append(optional);
    screen.classList.add('admin-workspace-active');
    root.addEventListener('click', handleClick);
    $('awBack').addEventListener('click', () => { detailOpen = false; present(); $('awQueue').scrollIntoView({ block: 'nearest' }); });
    $('awOpenMember').addEventListener('click', () => { if (member?.id) void chooseMember(member.id, 'members'); });
    $('awNext').addEventListener('click', next);
    $('awClearMember').addEventListener('click', clearRequestMemberSelection);
    $('awClearMemberBottom').addEventListener('click', clearRequestMemberSelection);
    $('awCloseInquiry').addEventListener('click', closeInquiry);
    $('awCloseInquiryBottom').addEventListener('click', closeInquiry);
    $('awMemberInquiryClose').addEventListener('click', closeInquiry);
    $('awMemberInquiryCloseBottom').addEventListener('click', closeInquiry);
    $('awFilterInquiryMember').addEventListener('click', () => {
      const record = inquiryCache.get(currentInquiry)?.record;
      if (record) filterInquiriesForMember({ id: record.user_id, name: inquiryName(record) });
    });
    new MutationObserver(() => { if (owner) { updateMemberBrowser(); syncSelection(); } }).observe($('adminMemberSelect'), { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'data-member-name'] });
    $('adminMemberSelect').addEventListener('eligibility-status-change', updateMemberBrowser);
    $('adminMemberSelect').addEventListener('attendance-status-change', updateMemberBrowser);
    $('adminMemberSelect').addEventListener('member-sort-change', updateMemberBrowser);
    window.addEventListener('resize', () => { if (owner) present(); });
    window.addEventListener('scroll', () => { if (owner && kind === 'payment') acknowledgePayment(); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(paymentTimer); paymentTimer = 0; } else if (owner) { void loadPayments(true); window.AdminInquiryReadReceipts?.refresh(); } });
    window.addEventListener('online', () => { if (owner) void loadPayments(true); });
    window.addEventListener('focus', () => { if (owner) void loadPayments(true); });
    new MutationObserver(() => { if (screen.hidden && owner) reset(); }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  }

  function countValue(key) { return ({ signup: signupTotal, routine: routineTotal, inquiry: inquiryTotal, payment: paymentTotal })[key]; }
  function updateCounts() {
    if (!mounted) return;
    let total = 0, complete = true;
    for (const key of Object.keys(kinds)) {
      const n = countValue(key), node = $(`awCount-${key}`), stale = failed.has(key);
      node.textContent = n === null ? '—' : String(n); node.classList.toggle('aw-stale', stale);
      node.title = stale ? '최근 조회 실패 · 이전 확인 결과입니다.' : n === null ? '대기 건수를 확인하고 있어요.' : `${kinds[key][0]} 대기 ${n}건`;
      if (n === null || stale) complete = false; else total += n;
    }
    $('awAllCount').textContent = complete ? String(total) : '—';
    $('awAllCount').title = complete ? `전체 처리 대기 ${total}건` : '일부 알림의 최신 상태를 확인해야 해요.';
  }
  function setOperation(key = 'news') {
    $('awOperations').querySelectorAll('[data-aw-operation]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.awOperation === key)));
    $('awOperationBody').querySelectorAll('[data-aw-operation-panel]').forEach(n => { n.hidden = n.dataset.awOperationPanel !== key; });
    if (key === 'statistics') $('adminUsagePanel').open = true;
  }
  function moveTo(node, parent) { if (node && node.parentNode !== parent) parent.append(node); }
  function clearMemberSelection() {
    if (!owner || selecting || hooks.isSaving?.()) return false;
    captureInquiryDrafts();
    const entry = inquiryCache.get(currentInquiry);
    if (entry) { entry.thread.hidden = true; moveTo(entry.thread, $('awParking')); }
    currentInquiry = ''; clearInquiryMemberScope();
    member = null; memberTab = 'access'; completion = null; detailOpen = false;
    applicationMember = ''; paymentSelected = ''; $('awApplicationSlot').replaceChildren();
    $('adminMemberInfo').textContent = ''; $('awWork').style.removeProperty('min-height');
    // Run the original empty-selection handler: it retains per-member drafts,
    // invalidates pending loads, and resets the routine / CRM panels together.
    $('adminMemberSelect').value = '';
    $('adminMemberSelect').dispatchEvent(new Event('change'));
    notify(''); present(); return true;
  }
  function clearRequestMemberSelection() {
    if (!active(generation) || page !== 'requests' || !['signup', 'routine'].includes(kind)) return;
    if (selecting || hooks.isSaving?.() || window.CenterAttendance?.isAdminBusy?.()) {
      notify('처리가 끝난 뒤 선택을 해제해 주세요.'); return;
    }
    if (clearMemberSelection()) {
      $('awQueue').scrollIntoView({ block: 'nearest' });
      $('awQueueBody').querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    }
  }
  function route(nextPage, nextKind = kind) {
    if (!owner) return;
    if (selecting || hooks.isSaving?.()) { notify('처리 중이에요. 완료된 뒤 다른 작업을 선택해 주세요.'); return; }
    captureInquiryDrafts();
    if (page === 'members' && nextPage !== 'members') clearMemberSelection();
    if (nextPage !== 'requests' || nextKind !== 'inquiry') clearInquiryMemberScope();
    if (nextPage === 'requests' && nextKind !== kind) member = null;
    page = nextPage; kind = nextKind; detailOpen = false; completion = null;
    if (page !== 'members' && kind !== 'inquiry') requestMemberFilter = '';
    if (page === 'operations') setOperation('news');
    present();
    if (kind === 'inquiry' && page === 'requests') void hooks.refreshInquiries?.(true);
    if (kind === 'payment' && page === 'requests') void loadPayments(true);
    if (page === 'members') {
      updateMemberBrowser();
      const selectedId = $('adminMemberSelect').value;
      if (uuid(selectedId)) void chooseMember(selectedId, 'members');
      else { member = null; present(); }
    }
  }
  function handleClick(event) {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.awPage) route(b.dataset.awPage);
    if (b.dataset.awKind) route('requests', b.dataset.awKind);
    if (b.dataset.awOperation) setOperation(b.dataset.awOperation);
    if (b.dataset.awMemberTab) {
      if (selecting || hooks.isSaving?.()) { notify('처리가 끝난 뒤 다른 항목을 선택해 주세요.'); return; }
      if (page !== 'members' || !member || memberTab === b.dataset.awMemberTab) return;
      // Reserve the previous panel height before hiding it. A shorter tab must not
      // shrink the document and clamp the current scroll position near its bottom.
      const work = $('awWork');
      work.style.minHeight = Math.ceil(work.getBoundingClientRect().height) + 'px';
      if (b.dataset.awMemberTab === 'inquiry') {
        if (member) openMemberInquiries();
      } else if (!selecting && !hooks.isSaving?.()) { captureInquiryDrafts(); clearInquiryMemberScope(); memberTab = b.dataset.awMemberTab; present(); }
    }
    if (b.dataset.awPayment) openPayment(b.dataset.awPayment);
    if (b.dataset.awMember) {
      if (page === 'members' && member?.id === b.dataset.awMember) clearMemberSelection();
      else void chooseMember(b.dataset.awMember, 'members');
    }
  }
  function present() {
    if (!mounted) return;
    window.AdminMemberDeletion?.selectMember(member?.id || '', page === 'members' && memberTab === 'access');
    if (page !== 'members' || !member) $('awWork').style.removeProperty('min-height');
    screen.dataset.awPage = page; screen.dataset.awKind = kind;
    screen.dataset.awMemberTab = page === 'members' ? memberTab : kind === 'routine' ? 'routine' : 'access';
    $root().querySelectorAll('[data-aw-page]').forEach(b => { if (b.dataset.awPage === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $root().querySelectorAll('[data-aw-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.awKind === kind)));
    $root().querySelectorAll('[data-aw-member-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.awMemberTab === memberTab)));
    $('awPageTitle').textContent = page === 'requests' ? '처리할 요청' : page === 'members' ? '회원 관리' : '센터 운영';
    $('awPageHelp').textContent = page === 'requests' ? '요청을 선택하고 필요한 작업을 바로 처리하세요.' : page === 'members' ? '회원 검색부터 출석·이용권, 운동 루틴 확인까지.' : '센터 소식과 운영 현황을 관리하세요.';
    $('awKinds').hidden = page !== 'requests'; $('awWorkspace').hidden = page === 'operations'; $('awOperations').hidden = page !== 'operations';
    $('awWorkspace').dataset.detailOpen = String(detailOpen); $('awBack').hidden = !mobile() || !detailOpen;
    const slots = { signup: $('adminMemberSignupAlerts'), routine: $('adminRoutineRequestManagement'), inquiry: $('adminInquiryManagement') };
    const memberInquiry = page === 'members' && memberTab === 'inquiry' && !!member;
    // Keep focused controls connected to their final parent during ordinary refreshes.
    for (const [key, node] of Object.entries(slots)) {
      const target = key === 'inquiry' && memberInquiry ? $('awMemberInquiryList')
        : page === 'requests' && key === kind ? $('awQueueBody') : $('awParking');
      moveTo(node, target);
    }
    moveTo($('adminMemberManagement'), page === 'members' ? $('awQueueBody') : $('awParking'));
    let paymentList = $('awPaymentQueue');
    if (!paymentList) { paymentList = el('div', 'aw-payment-queue'); paymentList.id = 'awPaymentQueue'; $('awParking').append(paymentList); }
    moveTo(paymentList, page === 'requests' && kind === 'payment' ? $('awQueueBody') : $('awParking'));
    $('awQueueHeading').replaceChildren();
    const title = el('h2', '', page === 'members' ? '회원 선택' : kind === 'inquiry' ? requestMemberFilter ? '선택 회원의 문의' : '회원 문의 목록' : kinds[kind][0] + ' · ' + kinds[kind][1] + ' 대기');
    $('awQueueHeading').append(title);
    if (page === 'requests' && requestMemberFilter && kind === 'inquiry') {
      const scope = el('div', 'aw-inquiry-scope'); scope.append(el('span', '', (inquiryScopeMember?.name || '선택 회원') + '님의 문의만 표시 중'));
      const all = el('button', 'aw-secondary', '전체 문의로 초기화'); all.id = 'awResetInquiryMember'; all.type = 'button'; all.onclick = () => { clearInquiryMemberScope(); present(); void hooks.refreshInquiries?.(false); };
      scope.append(all); $('awQueueHeading').append(scope);
    }
    $('adminInquirySearchForm').hidden = !!requestMemberFilter;
    $('awMemberTabs').hidden = page !== 'members';
    const memberWork = page === 'members' || page === 'requests' && ['signup', 'routine'].includes(kind);
    $('awMemberWork').hidden = !memberWork || !member || !!completion;
    $('awAccessSlot').hidden = page === 'members' ? memberTab !== 'access' : kind !== 'signup';
    $('awRoutineSlot').hidden = page === 'members' ? memberTab !== 'routine' : kind !== 'routine';
    $('awApplicationSlot').hidden = !(page === 'requests' && kind === 'routine' && member?.id === applicationMember && $('awApplicationSlot').childElementCount);
    $('awAccessDetails').open = page === 'members';
    $('awMemberInquirySlot').hidden = !memberInquiry;
    const localInquiryOpen = memberInquiry && inquiryCache.get(currentInquiry)?.record.user_id === member.id;
    const inquiryOpen = page === 'requests' && kind === 'inquiry' && !!currentInquiry;
    moveTo($('awInquiryWork'), memberInquiry ? $('awMemberInquiryThread') : $('awWork'));
    // The shared request footer remains after the conversation when returning from member management.
    if (!memberInquiry && $('awInquiryWork').nextElementSibling !== $('awPaymentWork')) $('awWork').insertBefore($('awInquiryWork'), $('awPaymentWork'));
    $('awInquiryWork').hidden = !(inquiryOpen || localInquiryOpen);
    $('awMemberInquiryDetail').hidden = !localInquiryOpen;
    if (localInquiryOpen) $('awMemberInquiryTitle').textContent = '문의 · ' + (inquiryCache.get(currentInquiry).record.archived_at ? '보관함' : inquiryCache.get(currentInquiry).record.status === 'answered' ? '답변 완료' : '답변 대기');
    $('awWork').hidden = page === 'requests' && kind === 'inquiry' && !currentInquiry;
    $('awCloseInquiry').hidden = $('awCloseInquiryBottom').hidden = !inquiryOpen;
    const inquiryOwner = inquiryCache.get(currentInquiry)?.record.user_id;
    $('awInquiryTools').hidden = !inquiryOpen || !uuid(inquiryOwner);
    $('awFilterInquiryMember').setAttribute('aria-pressed', String(!!requestMemberFilter && requestMemberFilter === inquiryOwner));
    $('awPaymentWork').hidden = !(page === 'requests' && kind === 'payment' && paymentSelected);
    $('awEmpty').hidden = !!completion || memberWork && !!member || kind === 'inquiry' && !!currentInquiry || kind === 'payment' && !!paymentSelected;
    $('awCompletion').hidden = !completion;
    if (memberWork) renderMemberHeading();
    else if (kind === 'inquiry') renderInquiryHeading();
    else if (kind === 'payment') renderPaymentHeading();
    const canClearMember = page === 'requests' && ['signup', 'routine'].includes(kind) && !!(member || completion);
    $('awClearMember').hidden = $('awClearMemberBottom').hidden = !canClearMember;
    $('awClearMember').textContent = completion && !member ? '완료창 닫기' : '선택 해제';
    $('awClearMemberBottom').textContent = completion && !member ? '닫기' : '선택 해제';
    const hasNext = page === 'requests' && !!(completion || kind === 'inquiry' && currentInquiry);
    $('awNext').hidden = !hasNext;
    $('awNextBar').hidden = !(hasNext || canClearMember);
    $('awNext').textContent = kind === 'signup' ? '다음 가입 회원 연결 ›' : kind === 'routine' ? '다음 루틴 신청 보기 ›' : kind === 'inquiry' ? '다음 문의 보기 ›' : '다음 결제 보기 ›';
    syncSelection(); updateCounts();
    if (page === 'members') updateMemberBrowser();
    window.AdminInquiryReadReceipts?.refresh();
    if (page === 'requests' && kind === 'payment') requestAnimationFrame(acknowledgePayment);
  }
  function memberLabel(row) { return row ? row.name + (row.last4 ? ' · ' + row.last4 : '') : '목록에서 요청을 선택해 주세요.'; }
  function renderMemberHeading() {
    $('awContext').textContent = page === 'members' ? '회원 관리' : kinds[kind][0] + ' · ' + kinds[kind][1];
    $('awMemberTitle').textContent = !member && completion?.type === 'signup' ? '센터 회원 연결 완료' : memberLabel(member);
    $('awOpenMember').hidden = page === 'members' || !member;
    const p = $('awAppIdentity').querySelector('p'); p.replaceChildren();
    if (member) { p.append(el('strong', '', member.name), el('span', '', '전화번호 끝자리 ' + (member.last4 || '미등록'))); }
    $('awMemberMeta').hidden = !member;
    if (!member) $('adminMemberInfo').textContent = '';
  }
  function memberSelected(id, details = {}) {
    if (!owner) return;
    if (!id) { if (!completion) member = null; if (page === 'members') clearInquiryMemberScope(); present(); return; }
    if (!uuid(id)) return;
    if (page === 'members' && member?.id !== id) { captureInquiryDrafts(); clearInquiryMemberScope(); memberTab = 'access'; $('awWork').style.removeProperty('min-height'); }
    member = { id, name: details.name || '회원', last4: /^\d{4}$/.test(details.last4 || '') ? details.last4 : '' };
    completion = null; present();
  }
  async function chooseMember(id, context, request = null) {
    if (!active(generation) || selecting || hooks.isSaving?.() || !uuid(id)) return false;
    selecting = true; const ticket = generation;
    captureInquiryDrafts(); clearInquiryMemberScope();
    member = null; applicationMember = ''; $('awApplicationSlot').replaceChildren();
    if (context === 'members') { page = 'members'; memberTab = 'access'; }
    else { page = 'requests'; kind = context; }
    completion = null; detailOpen = true; notify('회원 정보를 확인하고 있어요.'); present();
    try {
      const result = await hooks.selectMember?.(id, { kind: context, request });
      if (!active(ticket)) return false;
      if (!result) { notify('회원을 선택하지 못했어요. 목록에서 다시 선택해 주세요.'); return false; }
      memberSelected(id, result); notify('');
      if (context === 'routine' && request) await loadApplication(request, ticket);
      if (active(ticket)) { present(); $('awWork').scrollIntoView({ block: 'nearest' }); }
      return true;
    } catch (_) { if (active(ticket)) notify('회원 정보를 불러오지 못했어요. 다시 선택해 주세요.'); return false; }
    finally { if (active(ticket)) selecting = false; }
  }
  async function loadApplication(request, ticket) {
    const slot = $('awApplicationSlot'); slot.replaceChildren(); slot.dataset.requestId = request.id; slot.hidden = !request.application_revision; applicationMember = request.user_id;
    if (slot.hidden) return;
    const heading = el('h3', '', '운동 구성 신청 내용'), text = el('p', 'aw-help', '신청서를 확인하고 있어요.');
    slot.append(heading, text); const expectedId = request.id;
    try {
      const { data, error } = await window.PaymentFulfillment.request(client, 'admin_get_routine_application', { p_request_id: expectedId });
      if (!active(ticket) || kind !== 'routine' || member?.id !== request.user_id || slot.dataset.requestId && slot.dataset.requestId !== expectedId) return;
      if (error || data?.request_id !== expectedId || !data.revision || !data.answers || typeof data.answers !== 'object') throw Error('APPLICATION_UNAVAILABLE');
      text.textContent = '';
      const summary = el('dl', 'aw-application-summary');
      const labels = { gender: '성별', purposes: '운동 목적', frequency: '주당 빈도', duration: '운동 시간', experience: '운동 경력', interests: '관심 부위', pain: '통증·불편', avoid: '피할 운동' };
      for (const [key, label] of Object.entries(labels)) { const value = data.answers[key]; if (typeof value === 'string' || Array.isArray(value) && value.every(v => typeof v === 'string')) { const list = Array.isArray(value) ? value.map(v => key === 'purposes' && v === '기타' ? data.answers.purpose_other || v : v).join(' · ') : value || '없음'; summary.append(el('dt', '', label), el('dd', '', list)); } }
      slot.append(summary);
      const open = el('button', 'aw-text-button', '신청서 전체 보기 · 복사'); open.type = 'button'; open.onclick = () => void hooks.openApplication?.(request, false); slot.append(open);
    } catch (_) { if (active(ticket) && member?.id === request.user_id) text.textContent = '신청서를 불러오지 못했어요. 목록의 신청서 보기 버튼으로 다시 확인해 주세요.'; }
  }
  function showCompletion(type, id, text) {
    if (!active(generation) || page !== 'requests' || kind !== type || member?.id !== id) return;
    const identity = { ...member };
    // A linked signup is finished work. Clear the actual native selection and
    // original CRM/routine controllers, while retaining a separate receipt.
    if (type === 'signup' && !clearMemberSelection()) return;
    completion = { type, id }; const box = $('awCompletion'); box.replaceChildren();
    detailOpen = true;
    box.append(el('strong', '', text), el('p', '', (type === 'signup' ? memberLabel(identity) + '님의 연결을 마쳤어요. ' : '') + '아래 버튼으로 다음 요청을 이어서 처리할 수 있어요.')); present();
  }
  function syncSelection() {
    if (!mounted) return;
    $('adminMemberSignupList').querySelectorAll('[data-member-id]').forEach(n => n.classList.toggle('aw-selected', kind === 'signup' && member?.id === n.dataset.memberId && !completion));
    $('adminRoutineRequestList').querySelectorAll('[data-request-id]').forEach(n => n.classList.toggle('aw-selected', kind === 'routine' && member?.id === n.dataset.userId && !completion));
    $('adminInquiryList').querySelectorAll('[data-inquiry-id]').forEach(n => {
      const selected = currentInquiry === n.dataset.inquiryId;
      n.classList.toggle('aw-selected', selected);
      n.querySelector('.admin-inquiry-summary-button')?.setAttribute('aria-expanded', String(selected));
    });
  }
  function next() {
    if (hooks.isSaving?.()) { notify('저장 완료 후 이동해 주세요.'); return; }
    if (kind === 'signup') { const row = signup.find(r => r.id !== (completion?.id || member?.id)); if (row) void chooseMember(row.id, 'signup'); else { detailOpen = false; notify('다른 가입 대기가 없어요. 최신 목록을 확인해 주세요.'); present(); } }
    else if (kind === 'routine') { const row = routines.find(r => r.user_id !== member?.id); if (row) void chooseMember(row.user_id, 'routine', row); else { detailOpen = false; notify('다른 루틴 신청 대기가 없어요.'); present(); } }
    else if (kind === 'inquiry') { const row = [...inquiryCache.values()].find(e => e.record.id !== currentInquiry && e.record.status === 'waiting' && !e.record.archived_at && $('adminInquiryList').querySelector(`[data-inquiry-id="${e.record.id}"]`)); if (row) openInquiry(row.record.id); else { detailOpen = false; notify('현재 목록에 다른 문의 대기가 없어요. 목록의 더 보기나 필터를 확인해 주세요.'); present(); } }
    else { const row = payments.find(r => r.id !== paymentSelected); if (row) openPayment(row.id); else { detailOpen = false; paymentSelected = ''; present(); } }
  }
  function syncSignup(rows, total) { if (!owner) return; signup = rows.map(r => ({ ...r })); signupTotal = total; fresh.add('signup'); failed.delete('signup'); updateCounts(); syncSelection(); }
  function syncRoutine(rows, total) { if (!owner) return; routines = rows.map(r => ({ ...r })); routineTotal = Number.isSafeInteger(total) && total >= rows.length ? total : null; fresh.add('routine'); failed.delete('routine'); updateCounts(); syncSelection(); }
  function queueError(key) { if (!owner) return; failed.add(key); updateCounts(); }
  function updateMemberBrowser() {
    if (rosterFrame || !owner || !mounted) return;
    rosterFrame = requestAnimationFrame(() => {
      rosterFrame = 0; if (!owner) return;
      const options = [...$('adminMemberSelect').options].filter(o => uuid(o.value) && !o.hidden), list = $('awMemberRows');
      // The native selector already holds the full filtered, sorted roster.
      // Keep every card reachable in the existing scroll area without paging.
      const cards = document.createDocumentFragment();
      for (const option of options) {
        const b = el('button'); b.type = 'button'; b.dataset.awMember = option.value;
        b.setAttribute('aria-pressed', String(option.value === $('adminMemberSelect').value)); b.disabled = option.disabled;
        const state = window.AdminMemberPicker?.eligibilityState(option.value).state;
        const eligibility = ({ valid: '유효', expired: '만료·없음', review: '확인 필요' })[state] || '확인 필요';
        const linked = window.AdminMemberPicker?.linkState(option.value);
        const attendance = linked === true ? '출석 연결' : linked === false ? '출석 미연결' : '출석 확인 필요';
        const count = /^\d+$/.test(option.dataset.assignmentCount || '') ? option.dataset.assignmentCount + '회 배정' : '배정 횟수 확인 필요';
        b.append(
          el('strong', '', (option.dataset.memberName || '회원') + (option.dataset.phoneLast4 ? ' · ' + option.dataset.phoneLast4 : '')),
          el('span', 'aw-member-row-meta', eligibility + ' · ' + count),
          el('span', 'aw-member-row-meta', (option.dataset.currentRoutineName ? '루틴 있음' : '루틴 없음') + ' · ' + attendance)
        );
        if (window.AdminMemberPicker?.sortMode() === 'gym') {
          const expiry = window.AdminMemberPicker.gymExpiry(option.value);
          b.append(el('span', 'aw-member-row-meta', expiry ? '헬스 만료: ' + expiry.replaceAll('-', '.') : '헬스 만료일 정보 없음'));
        }
        cards.append(b);
      }
      if (!options.length) cards.append(el('p', 'aw-help', '조건에 맞는 회원이 없어요. 검색어나 이용권 상태를 확인해 주세요.'));
      list.replaceChildren(cards);
      syncSelection();
    });
  }

  function captureInquiryDrafts() {
    if (!owner) return;
    for (const [id, entry] of inquiryCache) {
      const input = entry.thread.querySelector('.admin-inquiry-reply-area textarea');
      if (input) inquiryDrafts.set(id, { value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: document.activeElement === input });
    }
  }
  function registerInquiry(record, card, thread) {
    if (!owner || !uuid(record.id)) return false;
    card.dataset.inquiryId = record.id;
    const existing = inquiryCache.get(record.id), draft = inquiryDrafts.get(record.id);
    if (existing && existing.renderedStatus === record.status && existing.renderedArchived === Boolean(record.archived_at)) {
      const changed = existing.record.last_message_at !== record.last_message_at;
      Object.assign(existing.record, record); thread.remove();
      if (changed && existing.thread.querySelector('.admin-inquiry-message-list')?.dataset.loaded === 'true') void hooks.loadInquiry?.(record.id, inquiryName(record), existing.thread.querySelector('.admin-inquiry-message-list'));
    } else {
      existing?.thread.remove();
      const input = thread.querySelector('.admin-inquiry-reply-area textarea');
      if (draft && input) { input.value = draft.value; input.setSelectionRange(draft.start, draft.end); }
      inquiryCache.set(record.id, { record, thread, renderedStatus: record.status, renderedArchived: Boolean(record.archived_at) }); $('awParking').append(thread);
      if (draft?.focused && currentInquiry === record.id) requestAnimationFrame(() => input?.focus({ preventScroll: true }));
    }
    if (currentInquiry === record.id) { attachInquiry(record.id); present(); }
    syncSelection(); return true;
  }
  function inquiryName(record) { const p = record.memberProfile || {}; return (p.display_name || p.email || '회원') + (/^\d{4}$/.test(p.phone_last4 || '') ? ' · ' + p.phone_last4 : ''); }
  function attachInquiry(id) {
    const entry = inquiryCache.get(id); if (!entry) return;
    for (const [key, e] of inquiryCache) { e.thread.hidden = key !== id; if (key !== id) moveTo(e.thread, $('awParking')); }
    moveTo(entry.thread, $('awInquiryWork')); entry.thread.hidden = false;
    const list = entry.thread.querySelector('.admin-inquiry-message-list');
    if (list && list.dataset.loaded !== 'true' && list.dataset.workspaceLoading !== 'true') {
      list.dataset.workspaceLoading = 'true'; Promise.resolve(hooks.loadInquiry?.(id, inquiryName(entry.record), list)).finally(() => { delete list.dataset.workspaceLoading; });
    }
    const area = entry.thread.querySelector('.admin-inquiry-reply-area'); if (area) area.hidden = Boolean(entry.record.archived_at);
    const complete = entry.thread.querySelector('.admin-inquiry-complete-button'); if (complete) complete.hidden = entry.record.status !== 'waiting' || !!entry.record.archived_at;
    const archiveArea = entry.thread.querySelector('.member-inquiry-delete-area'); if (archiveArea) archiveArea.hidden = !entry.record.archived_at && entry.record.status !== 'answered';
    const archiveButton = archiveArea?.querySelector('button'); if (archiveButton && entry.renderedArchived !== Boolean(entry.record.archived_at)) { archiveButton.disabled = true; archiveButton.textContent = '보관 상태가 바뀌었어요. 목록에서 다시 선택해 주세요.'; }
    $('adminInquiryList').querySelectorAll('.admin-inquiry-summary-button').forEach(b => b.setAttribute('aria-expanded', String(b.closest('[data-inquiry-id]')?.dataset.inquiryId === id)));
  }
  function openInquiry(id) {
    if (!active(generation) || !inquiryCache.has(id)) return false;
    const local = page === 'members' && memberTab === 'inquiry' && !!member;
    if (local && inquiryCache.get(id).record.user_id !== member.id) return false;
    captureInquiryDrafts(); currentInquiry = id;
    if (!local) { page = 'requests'; kind = 'inquiry'; }
    completion = null; detailOpen = true;
    attachInquiry(id); present(); (local ? $('awMemberInquiryDetail') : $('awWork')).scrollIntoView({ block: 'nearest' }); return true;
  }
  function closeInquiry() {
    const local = page === 'members' && memberTab === 'inquiry';
    if (!active(generation) || !currentInquiry || !local && (page !== 'requests' || kind !== 'inquiry')) return;
    captureInquiryDrafts();
    const id = currentInquiry, entry = inquiryCache.get(id);
    if (entry) { entry.thread.hidden = true; moveTo(entry.thread, $('awParking')); }
    currentInquiry = ''; if (!local) member = null; completion = null; if (!local) detailOpen = false;
    if (!local) {
      // Closing a request conversation also releases a member left in the
      // shared native picker. Keep the conversation filter and drafts intact.
      $('adminMemberInfo').textContent = '';
      $('adminMemberSelect').value = '';
      $('adminMemberSelect').dispatchEvent(new Event('change'));
    }
    notify(''); present();
    const focus = $('adminInquiryList').querySelector(`[data-inquiry-id="${id}"] .admin-inquiry-summary-button`) || $('adminInquiryFilters').querySelector('[aria-pressed="true"]');
    focus?.focus({ preventScroll: true }); (local ? $('awMemberInquiryList') : $('awQueue')).scrollIntoView({ block: 'nearest' });
  }
  function openMemberInquiries() {
    if (!member || page !== 'members') return;
    captureInquiryDrafts();
    if (inquiryCache.get(currentInquiry)?.record.user_id !== member.id) currentInquiry = '';
    memberTab = 'inquiry'; requestMemberFilter = member.id;
    inquiryScopeMember = { id: member.id, name: memberLabel(member) };
    hooks.setInquiryMemberScope?.(true);
    $('adminInquiryList').replaceChildren();
    present(); void hooks.refreshInquiries?.(false);
  }
  function filterInquiriesForMember(value) {
    if (!active(generation) || !uuid(value?.id)) return;
    captureInquiryDrafts();
    const previous = inquiryCache.get(currentInquiry);
    if (previous && previous.record.user_id !== value.id) { previous.thread.hidden = true; moveTo(previous.thread, $('awParking')); currentInquiry = ''; member = null; }
    requestMemberFilter = value.id; inquiryScopeMember = { ...value };
    page = 'requests'; kind = 'inquiry'; detailOpen = false;
    hooks.setInquiryMemberScope?.(true);
    present(); void hooks.refreshInquiries?.(false); $('awQueue').scrollIntoView({ block: 'nearest' });
  }
  function clearInquiryMemberScope() {
    if (!requestMemberFilter && !inquiryScopeMember) return;
    requestMemberFilter = ''; inquiryScopeMember = null;
    hooks.setInquiryMemberScope?.(false);
  }
  function renderInquiryHeading() {
    const entry = inquiryCache.get(currentInquiry); $('awContext').textContent = '문의 · ' + (entry?.record.archived_at ? '보관함' : entry?.record.status === 'answered' ? '답변 완료' : '답변 대기');
    $('awMemberTitle').textContent = entry ? inquiryName(entry.record) : '목록에서 문의를 선택해 주세요.'; $('awMemberMeta').hidden = true;
    const id = entry?.record.user_id; $('awOpenMember').hidden = !uuid(id);
    if (uuid(id)) { const p = entry.record.memberProfile || {}; member = { id, name: p.display_name || '회원', last4: p.phone_last4 || '' }; }
  }
  function syncInquiryAlerts(rows) {
    if (!owner) return; inquiryTotal = rows.filter(r => r.status === 'waiting' && !r.archived_at).length; failed.delete('inquiry'); fresh.add('inquiry');
    const selected = inquiryCache.get(currentInquiry);
    const list = selected?.thread.querySelector('.admin-inquiry-message-list');
    const history = list?.adminInquiryHistory;
    const memberRows = history ? rows.filter(row => row.user_id === history.userId) : [];
    const historyChanged = history && (memberRows.length !== history.facts.size || memberRows.some(row =>
      history.facts.get(row.id) !== JSON.stringify([row.last_message_at, row.status, row.archived_at])));
    let selectedChanged = false;
    for (const row of rows) { const entry = inquiryCache.get(row.id); if (entry) { if (row.id === currentInquiry && entry.record.last_message_at !== row.last_message_at) selectedChanged = true; Object.assign(entry.record, row); } }
    if (list && (historyChanged || selectedChanged)) void hooks.loadInquiry?.(currentInquiry, inquiryName(selected.record), list);
    if (currentInquiry) attachInquiry(currentInquiry); if (page === 'requests' && kind === 'inquiry' || page === 'members' && memberTab === 'inquiry') present(); updateCounts();
  }
  function inquiryAnswered(id) { const entry = inquiryCache.get(id); if (entry) { entry.record.status = 'answered'; inquiryDrafts.delete(id); if (currentInquiry === id) { attachInquiry(id); if (page === 'members') present(); else renderInquiryHeading(); } } }
  function inquiryArchived(id) { const entry = inquiryCache.get(id); entry?.thread.remove(); inquiryCache.delete(id); inquiryDrafts.delete(id); if (currentInquiry === id) { currentInquiry = ''; if (page !== 'members') detailOpen = false; present(); notify('문의 보관 상태를 변경했어요. 목록에서 이어서 확인해 주세요.'); } }

  function schedulePayments() { clearTimeout(paymentTimer); paymentTimer = 0; if (active(generation) && !document.hidden) paymentTimer = setTimeout(() => void loadPayments(true), 30000); }
  async function loadPayments(force = false) {
    if (!active(generation) || document.hidden || paymentBusy || paymentApplying) return;
    if (!force && fresh.has('payment')) { schedulePayments(); return; }
    const ticket = generation, request = ++paymentSequence, expectedOwner = owner, db = client;
    paymentBusy = true; paymentAbort = new AbortController(); const controller = paymentAbort;
    let timeout, retryPage = false;
    updateCounts();
    try {
      let query = db.rpc('admin_workspace_payment_queue', { p_expected_admin_id: expectedOwner, p_offset: paymentOffset });
      if (typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
      const { data, error } = await Promise.race([query, new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(Error('PAYMENT_QUEUE_TIMEOUT')); }, 10000); })]);
      if (!active(ticket) || request !== paymentSequence || owner !== expectedOwner) return;
      if (error || data?.ok !== true || data.version !== 1 || !Number.isSafeInteger(data.total_count) || data.total_count < 0 || data.offset !== paymentOffset || data.page_size !== 20 || typeof data.has_more !== 'boolean' || !Array.isArray(data.entries) || data.entries.length > 20 || data.entries.some(r => !uuid(r.id) || !(r.user_id === null || uuid(r.user_id)) || typeof r.member_name !== 'string' || typeof r.product_name !== 'string' || !Number.isSafeInteger(r.amount) || r.amount < 0 || r.payment_state !== 'paid' || !['pending', 'legacy'].includes(r.application_state))) throw Error('PAYMENT_QUEUE_UNAVAILABLE');
      if (new Set(data.entries.map(r => r.id)).size !== data.entries.length || data.total_count < data.entries.length || data.has_more !== (data.total_count > data.offset + 20) || data.entries.length !== Math.min(20, Math.max(0, data.total_count - data.offset))) throw Error('INVALID_PAYMENT_PAGE');
      if (!data.entries.length && paymentOffset > 0) { paymentOffset = Math.max(0, Math.floor(Math.max(0, data.total_count - 1) / 20) * 20); fresh.delete('payment'); retryPage = true; return; }
      payments = data.entries; paymentTotal = data.total_count; paymentMore = data.has_more; failed.delete('payment'); fresh.add('payment'); renderPayments(); updateCounts();
      if (paymentSelected && payments.some(r => r.id === paymentSelected)) renderPayment();
      else if (paymentSelected && page === 'requests' && kind === 'payment') { paymentSelected = ''; $('awPaymentWork').replaceChildren(); present(); notify('선택한 결제가 처리되었거나 상태가 바뀌었어요. 최신 대기 목록을 확인해 주세요.'); }
    } catch (_) { if (active(ticket) && request === paymentSequence) { queueError('payment'); renderPayments(); } }
    finally { clearTimeout(timeout); if (active(ticket) && request === paymentSequence) { paymentBusy = false; paymentAbort = null; renderPayments(); if (retryPage) void loadPayments(true); else schedulePayments(); } }
  }
  function renderPayments() {
    const list = $('awPaymentQueue'); if (!list) return; list.replaceChildren();
    if (failed.has('payment')) list.append(el('p', 'aw-help is-error', '상품 적용 대기를 불러오지 못했어요. 연결 상태와 조회 함수 설치 여부를 확인한 뒤 새로고침해 주세요.'));
    if (!payments.length) list.append(el('p', 'aw-empty', paymentTotal === null ? '상품 적용 대기를 확인하고 있어요.' : '상품 적용 대기가 없어요.'));
    for (const row of payments) { const b = el('button', 'aw-payment-row'); b.type = 'button'; b.dataset.awPayment = row.id; b.setAttribute('aria-pressed', String(row.id === paymentSelected)); b.append(el('strong', '', row.member_name + (row.phone_last4 ? ' · ' + row.phone_last4 : '')), el('span', '', row.product_name + ' · ' + row.amount.toLocaleString('ko-KR') + '원'), el('small', '', time(row.paid_at || row.requested_at))); list.append(b); }
    const nav = el('div', 'aw-payment-pages');
    for (const [label, delta, disabled] of [['이전', -20, paymentOffset === 0], ['다음', 20, !paymentMore]]) { const b = el('button', 'aw-secondary', label); b.type = 'button'; b.disabled = disabled || !!paymentApplying || paymentBusy; b.onclick = () => { if (paymentBusy || paymentApplying) return; paymentOffset = Math.max(0, paymentOffset + delta); paymentSelected = ''; present(); void loadPayments(true); }; nav.append(b); }
    const refresh = el('button', 'aw-secondary', '새로고침'); refresh.type = 'button'; refresh.disabled = !!paymentApplying; refresh.onclick = () => void loadPayments(true); nav.append(refresh); list.append(nav);
  }
  function openPayment(id) { if (!payments.some(r => r.id === id) || paymentApplying) return; paymentSelected = id; completion = null; detailOpen = true; renderPayments(); renderPayment(); present(); $('awWork').scrollIntoView({ block: 'nearest' }); }
  function renderPaymentHeading() { const row = payments.find(r => r.id === paymentSelected); $('awContext').textContent = '결제 · CRM 적용 대기'; $('awMemberTitle').textContent = row ? row.member_name + (row.phone_last4 ? ' · ' + row.phone_last4 : '') : '목록에서 결제를 선택해 주세요.'; $('awMemberMeta').hidden = true; $('awOpenMember').hidden = !uuid(row?.user_id); if (uuid(row?.user_id)) member = { id: row.user_id, name: row.member_name, last4: row.phone_last4 || '' }; }
  function renderPayment() {
    const row = payments.find(r => r.id === paymentSelected); if (!row) return;
    const box = $('awPaymentWork'); box.replaceChildren();
    box.append(el('h3', '', '결제 상품 적용 확인'), el('p', 'aw-help', '센터 CRM에 상품을 적용한 뒤 완료로 표시해 주세요.'));
    const summary = el('section', 'aw-payment-summary'); summary.id = 'awSelectedPaymentSummary';
    summary.append(el('strong', 'aw-payment-product', row.product_name), el('p', 'aw-payment-amount', row.amount.toLocaleString('ko-KR') + '원'));
    const options = [row.options?.clothing && '운동복 대여', row.options?.locker && '개인락커 이용'].filter(Boolean);
    summary.append(el('p', '', options.length ? '추가 옵션: ' + options.join(' · ') : '추가 옵션 없음'), el('p', 'aw-help', '결제 확인: ' + time(row.paid_at)));
    if (row.product_code === 'one-day-pt' && Array.isArray(row.pt_exercises)) { const selected = el('ol'); for (const exercise of row.pt_exercises) selected.append(el('li', '', exercise.name)); summary.append(selected); }
    if (row.application_state === 'legacy') summary.append(el('p', 'aw-help', '도입 이전 결제예요. 기존 적용 여부를 CRM에서 먼저 확인해 주세요.'));
    const b = el('button', 'aw-primary', paymentApplying === row.id ? '적용 처리 중…' : 'CRM 적용 완료'); b.type = 'button'; b.disabled = !!paymentApplying; b.onclick = () => void applyPayment(row);
    box.append(summary, b); renderPaymentHeading();
  }
  async function applyPayment(row) {
    if (!active(generation) || paymentApplying || !payments.some(r => r.id === row.id)) return;
    if (!window.confirm(row.member_name + ' 회원님의 ' + row.product_name + ' 상품과 추가 옵션을 CRM에 모두 적용하셨나요?\n완료 처리하면 회원에게 상품 적용 알림이 표시됩니다.')) return;
    const ticket = generation, db = client; paymentApplying = row.id; renderPayment(); notify('상품 적용 완료 상태를 저장하고 있어요.');
    try {
      const { data, error } = await window.PaymentFulfillment.request(db, 'payapp_mark_order_applied', { p_order_id: row.id });
      if (!active(ticket)) return;
      if (error || data?.ok !== true || data.version !== 1 || data.order_id !== row.id || data.state !== 'applied' || !Number.isFinite(Date.parse(data.applied_at))) throw Error('UNCONFIRMED');
      notify('상품 적용 완료로 표시했어요. 회원에게 안내가 표시됩니다.'); paymentSelected = ''; fresh.delete('payment');
    } catch (_) { if (active(ticket)) notify('처리 결과를 확인하지 못했어요. 새로고침해 상태를 확인한 뒤 다시 처리해 주세요.'); }
    finally { if (active(ticket)) { paymentApplying = ''; await loadPayments(true); if (paymentSelected) renderPayment(); present(); } }
  }
  async function acknowledgePayment() {
    if (!active(generation) || page !== 'requests' || kind !== 'payment' || document.hidden || paymentAckBusy || !paymentSelected || paymentSeen.has(paymentSelected)) return;
    const node = $('awSelectedPaymentSummary'); if (!node || node.closest('[hidden]')) return;
    const r = node.getBoundingClientRect(); if (r.width <= 0 || Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < Math.min(32, r.height)) return;
    const ticket = generation, id = paymentSelected, user = owner; paymentAckBusy = true;
    try { const { data, error } = await window.PaymentFulfillment.request(client, 'payapp_ack_admin_payment_notices', { p_expected_admin_id: user, p_order_ids: [id] }); if (active(ticket) && owner === user && !error && data?.ok === true) { paymentSeen.add(id); window.AdminPayments?.refreshNotices?.(); } }
    catch (_) { /* A read acknowledgement never marks the product applied. */ }
    finally { if (active(ticket)) paymentAckBusy = false; }
  }
  function reset() {
    window.AdminMemberDeletion?.reset();
    clearInquiryMemberScope();
    generation++; clearTimeout(paymentTimer); paymentTimer = 0; paymentAbort?.abort(); paymentAbort = null; paymentSequence++;
    cancelAnimationFrame(rosterFrame); rosterFrame = 0; owner = ''; client = null; hooks = {};
    member = null; selecting = false; completion = null; detailOpen = false; requestMemberFilter = ''; applicationMember = ''; page = 'requests'; kind = 'signup'; memberTab = 'access';
    signup = []; routines = []; payments = []; signupTotal = routineTotal = inquiryTotal = paymentTotal = null; fresh.clear(); failed.clear();
    paymentOffset = 0; paymentMore = false; paymentSelected = ''; paymentBusy = false; paymentApplying = ''; paymentAckBusy = false; paymentSeen.clear();
    inquiryDrafts.clear(); for (const entry of inquiryCache.values()) entry.thread.remove(); inquiryCache.clear(); currentInquiry = '';
    if (mounted) { for (const id of ['adminMemberSignupList', 'adminRoutineRequestList', 'adminInquiryList', 'awPaymentWork', 'awInquiryWork', 'awCompletion', 'awApplicationSlot']) $(id).replaceChildren(); $('awApplicationSlot').hidden = true; $('adminMemberInfo').textContent = ''; $('adminWorkspaceStatus').textContent = ''; present(); }
  }
  function start(config) { mount(); reset(); if (!config?.client || !uuid(config.userId)) return; client = config.client; owner = config.userId; hooks = config;
    window.AdminMemberDeletion?.start(client,owner,{onDeleted:config.memberDeleted,isBusy:()=>selecting||!!paymentApplying||hooks.isSaving?.()});
    present(); renderPayments(); void loadPayments(true); }
  function memberDeleted(id) {
    for (const [key,entry] of inquiryCache) if (entry.record.user_id === id) { entry.thread.remove(); inquiryCache.delete(key); inquiryDrafts.delete(key); }
    signup = signup.filter(row => row.id !== id); routines = routines.filter(row => row.user_id !== id);
    clearMemberSelection();
    notify('앱 탈퇴 처리를 완료했어요.');
    void loadPayments(true);
  }
  window.AdminWorkspace = Object.freeze({ start, reset, enabled: () => !!owner, syncSignup, syncRoutine, queueError, memberSelected,
    selectSignup: id => chooseMember(id, 'signup'), selectRoutine: request => chooseMember(request.user_id, 'routine', request),
    memberLinked: id => showCompletion('signup', id, '센터 출석 연결을 완료했어요.'),
    routineSaved: id => { showCompletion('routine', id, '새 운동 루틴을 배정했어요.'); void hooks.refreshRoutineRequests?.(); },
    captureInquiryDrafts, registerInquiry, openInquiry, syncInquiryAlerts, inquiryAnswered, inquiryArchived,
    inquiryMemberId: () => page === 'requests' && kind === 'inquiry' || page === 'members' && memberTab === 'inquiry' ? requestMemberFilter : '',
    refreshPayments: () => loadPayments(true), memberDeleted, isBusy: () => selecting || !!paymentApplying || !!window.AdminMemberDeletion?.isBusy(),
  });
})();
