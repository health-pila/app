// 공통 운동 안내 콘텐츠 전용. 회원 루틴/기록/종목변경을 읽거나 쓰지 않습니다.
(function () {
  'use strict';
  const CACHE_KEY = 'exercise-content:EX001-EX039:schema1';
  const CHECK_MS = 120000;
  let current = null;
  function readCache() {
    if (window.ExerciseDB.getContentVersion() !== null) return;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw && raw.length < 2000000) window.ExerciseDB.applyContentSnapshot(JSON.parse(raw));
    } catch (e) { /* 손상된 캐시는 무시하고 번들/현재 정상 데이터로 계속합니다. */ }
  }
  async function call(session,name) {
    const controller = new AbortController();
    session.controllers.add(controller);
    let timer;
    try {
      let query = session.client.rpc(name);
      if (typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
      return await Promise.race([query,new Promise((_,reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('콘텐츠 요청 시간 초과')); },10000);
      })]);
    } finally { clearTimeout(timer); session.controllers.delete(controller); }
  }
  async function check(session,force) {
    if (current !== session || session.busy || document.visibilityState === 'hidden') return;
    if (!force && Date.now() - session.lastCheck < CHECK_MS) return;
    session.busy = true;
    session.lastCheck = Date.now();
    try {
      const version = await call(session,'get_exercise_content_version');
      if (current !== session || version.error || !Number.isSafeInteger(version.data) || version.data < 1) return;
      if (version.data === window.ExerciseDB.getContentVersion()) return;
      const snapshot = await call(session,'get_exercise_content_snapshot');
      if (current !== session || snapshot.error || !snapshot.data) return;
      window.ExerciseDB.applyContentSnapshot(snapshot.data);
      try { localStorage.setItem(CACHE_KEY,JSON.stringify(snapshot.data)); } catch (e) { /* 저장 공간 부족이어도 화면 적용은 유지 */ }
    } catch (e) { /* 연결/검증 오류 시 마지막 정상 콘텐츠를 유지합니다. */ }
    finally { session.busy = false; }
  }
  function stop() {
    if (!current) return;
    clearInterval(current.timer);
    current.controllers.forEach(controller => controller.abort());
    current = null;
  }
  function start(client) {
    stop();
    readCache();
    const session = {client,busy:false,lastCheck:0,controllers:new Set(),timer:null};
    current = session;
    session.timer = setInterval(() => {
      // 화면이 열려 있을 때만 버전 번호 1개를 조회합니다.
      const memberRoutine = document.querySelector('#memberAssignedRoutinePanel');
      const admin = document.querySelector('#adminScreen');
      if ((!memberRoutine || memberRoutine.closest('[hidden]')) && (!admin || admin.hidden)) return;
      void check(session,false);
    },CHECK_MS);
    void check(session,true);
  }
  function onReturn() { if (current) void check(current,false); }
  window.addEventListener('online',onReturn);
  window.addEventListener('focus',onReturn);
  document.addEventListener('visibilitychange',onReturn);
  window.ExerciseContentSync = Object.freeze({start,stop});
})();
