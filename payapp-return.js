(() => {
  'use strict';
  const id = new URL(location.href).searchParams.get('order');
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
  const url = new URL('./index.html', location.href);
  if (valid) url.searchParams.set('payapp_return', id);
  document.getElementById('payAppReturnLink').href = url.href;
  if (!valid) { document.getElementById('payAppReturnMessage').textContent = '결제 정보를 확인할 수 없어요. 센터 앱에서 다시 확인해 주세요.'; return; }
  // 이 페이지는 결제 성공을 판정하지 않습니다. 원래 앱에서 서버 상태를 조회합니다.
  let channel = null, finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    try { channel?.close(); } catch (_) {}
    window.close();
    setTimeout(() => location.replace(url.href), 400);
  };
  try {
    channel = new BroadcastChannel('center-payapp-return:v1');
    channel.onmessage = event => { if (event.data?.type === 'received' && event.data.orderId === id) finish(); };
    channel.postMessage({ type: 'return', orderId: id });
  } catch (_) {}
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ type: 'center-payapp-return', orderId: id }, location.origin); window.opener.focus(); finish(); } catch (_) {}
  }
  setTimeout(() => { if (!finished) location.replace(url.href); }, 1500);
})();
