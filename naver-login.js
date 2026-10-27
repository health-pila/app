/* Supabase의 검증된 OAuth/계정 연결 흐름만 사용합니다. 회원 데이터는 쓰지 않습니다. */
(() => {
  "use strict";
  const PROVIDER = "custom:naver";
  const INTENT_KEY = "centerNaverAuthIntent:v1";
  const MAX_AGE = 15 * 60 * 1000;

  // SDK가 콜백 주소를 정리하기 전에 오류 종류만 보관합니다. 토큰은 읽지 않습니다.
  function captureReturn(href) {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const value = key => hash.get(key) || url.searchParams.get(key) || "";
    let description = value("error_description");
    for (let index = 0; index < 2; index++) {
      try { description = decodeURIComponent(description); } catch (_) { break; }
    }
    return Object.freeze({
      failed: Boolean(value("error") || value("error_code")),
      code: value("error_code").slice(0, 80),
      needsEmailLogin: description.includes("기존 이메일 계정"),
      missingProfile: description.includes("이름과 이메일")
    });
  }

  function friendlyError(info = {}) {
    if (info.needsEmailLogin) {
      return "기존 이메일 계정으로 로그인한 뒤, 상단 더보기 메뉴에서 네이버 계정을 연결해 주세요.";
    }
    if (["identity_already_exists", "identity_already_linked", "email_exists"].includes(info.code)) {
      return "이미 다른 계정에 연결된 네이버 계정이에요. 원래 사용하던 계정으로 로그인해 주세요.";
    }
    if (info.missingProfile) {
      return "네이버의 이름·이메일 제공에 동의한 뒤 다시 시도해 주세요.";
    }
    if (["bad_oauth_state", "flow_state_expired", "flow_state_not_found"].includes(info.code)) {
      return "인증 시간이 지났어요. 네이버 버튼을 눌러 다시 시도해 주세요.";
    }
    return "네이버 인증을 완료하지 못했어요. 다시 시도하거나 기존 이메일로 로그인해 주세요.";
  }

  function create({ client, supabaseUrl, returnInfo, loginButton, linkButton, loginMessage, menuButton,
    linkMessage, conflictingButtons = [], location = window.location,
    storage, history = window.history,
    confirm = message => window.confirm(message), now = () => Date.now() }) {
    let ready = false;
    let busy = false;
    let displayedUserId = "";
    let linked = false;
    let connectionStatus = "unavailable";
    let statusVersion = 0;
    let pendingStatus = null;
    let lastStatusCheck = -Infinity;
    let handledReturn = false;
    let returnAllowed = true;
    let savedDisabled = [];
    const callback = returnInfo || {};
    const getStorage = () => storage || window.sessionStorage;
    const redirectTo = new URL("./", location.href).href.split("?")[0].split("#")[0];

    function message(text, mode = "login") {
      const target = mode === "link" ? linkMessage : loginMessage;
      if (target) {
        target.textContent = text;
        target.hidden = !text;
      }
    }

    function renderButtons() {
      if (loginButton) loginButton.disabled = !ready || busy;
      if (linkButton) {
        linkButton.hidden = !displayedUserId;
        linkButton.disabled = !ready || busy || (linked && ["connected", "checking"].includes(connectionStatus));
        const label = linkButton.querySelector("span");
        const labels = {
          connected: "네이버 연결됨",
          needs_consent: "네이버 재동의 필요",
          registered: "네이버 로그인 등록됨",
          checking: "네이버 연결 확인 중…",
          unavailable: "네이버 상태 다시 확인"
        };
        if (label) label.textContent = linked ? labels[connectionStatus] : "네이버 계정 연결";
        linkButton.dataset.connectionState = linked ? connectionStatus : "not_linked";
      }
    }

    async function readConnectionStatus() {
      let timer;
      try {
        const result = await Promise.race([
          client.rpc("get_my_naver_connection_status"),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 6000); })
        ]);
        if (result.error || !["not_linked", "registered", "connected", "needs_consent"].includes(result.data?.status)) {
          throw new Error("status");
        }
        return result.data.status;
      } finally { clearTimeout(timer); }
    }

    async function refreshConnectionStatus(force = false) {
      if (!displayedUserId || !linked) return;
      if (pendingStatus) return pendingStatus;
      if (!force && now() - lastStatusCheck < 30000) return;
      const userId = displayedUserId;
      const version = statusVersion;
      connectionStatus = "checking";
      renderButtons();
      pendingStatus = (async () => {
        try {
          const status = await readConnectionStatus();
          if (version !== statusVersion || userId !== displayedUserId) return;
          if (status === "not_linked") linked = false;
          connectionStatus = status;
        } catch (_) {
          // An identity row or a failed query never claims that consent is still active.
          if (version === statusVersion && userId === displayedUserId) connectionStatus = "unavailable";
        } finally {
          if (version === statusVersion && userId === displayedUserId) {
            pendingStatus = null;
            lastStatusCheck = now();
            renderButtons();
          }
        }
      })();
      return pendingStatus;
    }

    function setBusy(value) {
      busy = value;
      if (value) {
        savedDisabled = conflictingButtons.map(button => button.disabled);
        conflictingButtons.forEach(button => { button.disabled = true; });
      } else {
        conflictingButtons.forEach((button, index) => {
          button.disabled = savedDisabled[index] ?? button.disabled;
        });
        savedDisabled = [];
      }
      renderButtons();
    }

    function removeIntent() {
      try { getStorage().removeItem(INTENT_KEY); } catch (_) { /* 인증용 키만 정리합니다. */ }
    }

    function readIntent() {
      try {
        const item = JSON.parse(getStorage().getItem(INTENT_KEY) || "null");
        if (!item || !["login", "link"].includes(item.mode) ||
            !Number.isFinite(item.startedAt) || item.startedAt > now() + 60000 ||
            (item.mode === "link" && typeof item.userId !== "string")) return null;
        return item;
      } catch (_) { return null; }
    }

    function clearCallbackError() {
      if (!callback.failed) return;
      const url = new URL(location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      for (const key of ["error", "error_code", "error_description"]) {
        url.searchParams.delete(key);
        hash.delete(key);
      }
      url.hash = hash.toString();
      try { history.replaceState(null, "", url.href); } catch (_) { /* 안내는 계속 표시합니다. */ }
    }

    function renderUser(user, role) {
      const userId = role === "member" ? user?.id || "" : "";
      const hasIdentity = Boolean(user?.identities?.some(identity => identity.provider === PROVIDER));
      if (userId !== displayedUserId || hasIdentity !== linked) {
        statusVersion++;
        pendingStatus = null;
        lastStatusCheck = -Infinity;
        connectionStatus = "unavailable";
      }
      displayedUserId = userId;
      linked = hasIdentity;
      renderButtons();
      void refreshConnectionStatus();
    }

    function reset() {
      displayedUserId = "";
      linked = false;
      statusVersion++;
      pendingStatus = null;
      connectionStatus = "unavailable";
      lastStatusCheck = -Infinity;
      removeIntent();
      message("");
      message("", "link");
      renderButtons();
    }

    async function start(mode) {
      if (!ready || busy || conflictingButtons.some(button => button.disabled)) return;
      setBusy(true);
      message("", mode);
      let leaving = false;
      try {
        const sessionResult = await client.auth.getSession();
        if (sessionResult.error) throw new Error("session");
        let userId = "";
        if (mode === "link") {
          const result = await client.auth.getUser();
          const user = result.data?.user;
          if (result.error || !user || user.id !== displayedUserId) {
            message("현재 로그인한 계정을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.", mode);
            return;
          }
          if (user.identities?.some(identity => identity.provider === PROVIDER)) {
            linked = true;
            await refreshConnectionStatus(true);
            message(connectionStatus === "connected"
              ? "네이버 계정이 연결되어 있어요."
              : ["registered", "needs_consent"].includes(connectionStatus)
                ? "동의 상태를 다시 확인하려면 로그아웃한 뒤 같은 네이버 계정으로 로그인해 주세요. 기존 계정과 운동 기록은 유지됩니다."
                : "네이버 동의 상태를 확인하지 못했어요. 네트워크 연결을 확인하고 다시 눌러 주세요.", mode);
            return;
          }
          const profile = await client.from("profiles").select("role").eq("id", user.id).single();
          if (profile.error || profile.data?.role !== "member") {
            message("일반회원 계정에서 연결해 주세요.", mode);
            return;
          }
          if (!confirm("현재 로그인한 계정에 네이버 계정을 연결할까요? 기존 운동 기록과 이메일 로그인은 유지됩니다.")) return;
          userId = user.id;
        } else if (sessionResult.data?.session) {
          message("이미 로그인되어 있어요. 새로고침해 주세요.");
          return;
        }

        const intent = JSON.stringify({ mode, userId, startedAt: now() });
        try {
          getStorage().setItem(INTENT_KEY, intent);
          if (getStorage().getItem(INTENT_KEY) !== intent) throw new Error("storage");
        } catch (_) {
          message("브라우저에서 인증 정보를 보관하지 못했어요. 일반 크롬 창에서 다시 시도해 주세요.", mode);
          return;
        }
        message("네이버 인증 화면으로 이동합니다…", mode);
        // 같은 창에서 이동하여 팝업 차단을 피하고 Supabase의 state/nonce 검증을 유지합니다.
        const request = {
          provider: PROVIDER,
          options: { redirectTo, skipBrowserRedirect: true }
        };
        const result = mode === "link"
          ? await client.auth.linkIdentity(request)
          : await client.auth.signInWithOAuth(request);
        if (result.error) {
          message(friendlyError({ code: result.error.code }), mode);
          removeIntent();
          return;
        }
        const destination = new URL(result.data?.url || "");
        // 로그인은 Supabase /authorize, linkIdentity는 네이버의 인증 주소를 반환합니다.
        // 반환 URL은 이 두 고정 경로 외에는 열지 않습니다.
        const authBase = new URL(supabaseUrl);
        const supabaseAuthorize = destination.origin === authBase.origin &&
          destination.pathname === "/auth/v1/authorize";
        const naverAuthorize = mode === "link" && destination.origin === "https://nid.naver.com" &&
          destination.pathname === "/oauth2/authorize";
        if ((!supabaseAuthorize && !naverAuthorize) || destination.protocol !== "https:" ||
            destination.username || destination.password) {
          throw new Error("redirect");
        }
        location.assign(destination.href);
        leaving = true;
      } catch (_) {
        removeIntent();
        message("네이버 인증을 시작하지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.", mode);
      } finally {
        if (!leaving) setBusy(false);
      }
    }

    async function finishReturn(session) {
      if (handledReturn) return returnAllowed;
      handledReturn = true;
      const intent = readIntent();
      let allowSession = true;
      try {
        // 연결 시도 후에는 오류/만료 여부와 관계없이 원래 회원 ID부터 확인합니다.
        if (intent?.mode === "link" && session) {
          const result = await client.auth.getUser();
          const user = result.data?.user;
          if (result.error || !user) {
            allowSession = false;
            message("계정 연결 결과를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.");
            return false;
          }
          if (user.id !== intent.userId) {
            allowSession = false;
            const signedOut = await client.auth.signOut({ scope: "local" });
            message(signedOut.error
              ? "계정이 달라 화면을 열지 않았어요. 이 탭을 닫고 원래 계정으로 다시 로그인해 주세요."
              : "연결 전 계정과 달라 화면을 열지 않았어요. 원래 이메일 계정으로 다시 로그인해 주세요.");
            return false;
          }
          if (!callback.failed && now() - intent.startedAt <= MAX_AGE) {
            const success = user.identities?.some(identity => identity.provider === PROVIDER);
            let consent = "unavailable";
            if (success) {
              try { consent = await readConnectionStatus(); } catch (_) { /* Keep the existing authenticated account. */ }
            }
            message(success && consent === "connected"
              ? "네이버 계정이 연결됐어요."
              : success
                ? "네이버 로그인 수단은 등록됐지만 동의 상태를 확인하지 못했어요. 메뉴를 다시 열어 확인해 주세요."
                : "네이버 연결을 확인하지 못했어요. 연결 버튼을 눌러 다시 시도해 주세요.", "link");
          }
        }
        if (callback.failed) {
          message(friendlyError(callback), intent?.mode === "link" && session ? "link" : "login");
        } else if (intent && now() - intent.startedAt > MAX_AGE) {
          message("인증 시간이 지났어요. 연결 상태를 확인하고 필요하면 다시 시도해 주세요.",
            intent.mode === "link" && session ? "link" : "login");
        } else if (intent && !session) {
          message("네이버 인증이 완료되지 않았어요. 다시 시도해 주세요.");
        }
      } catch (_) {
        allowSession = false;
        message("네이버 인증 결과를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.");
      } finally {
        returnAllowed = allowSession;
        removeIntent();
        clearCallbackError();
        ready = true;
        renderButtons();
      }
      return allowSession;
    }

    loginButton?.addEventListener("click", () => start("login"));
    linkButton?.addEventListener("click", () => start("link"));
    // Read only this member's state on menu open / app return; no background polling.
    menuButton?.addEventListener("click", () => { void refreshConnectionStatus(true); });
    window.addEventListener("focus", () => { void refreshConnectionStatus(true); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refreshConnectionStatus(true);
    });
    // 인증 화면에서 뒤로 돌아오는 bfcache 복원 시 버튼을 다시 사용할 수 있게 합니다.
    window.addEventListener("pageshow", event => {
      if (event.persisted && busy) {
        setBusy(false);
        message("인증을 다시 시작하려면 네이버 버튼을 눌러 주세요.", displayedUserId ? "link" : "login");
      }
    });
    renderButtons();
    return Object.freeze({ finishReturn, renderUser, reset, isBusy: () => busy });
  }

  window.NaverLogin = Object.freeze({ captureReturn, create });
})();

