// 이메일 링크로 확인한 계정만 비밀번호를 변경합니다. 관리자 키는 사용하지 않습니다.
(function () {
  "use strict";

  const SUPABASE_URL = "https://cithfqbzszgiqjifhrqy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_0mGHHS1HcRHh0Ttt8sZwtA_MBI22p1w";
  const STORAGE_KEY = "health-pila-password-recovery";
  const REDIRECT_URL = new URL("./reset-password.html", window.location.href).href;
  const title = document.querySelector("#resetTitle");
  const description = document.querySelector("#resetDescription");
  const requestSection = document.querySelector("#resetRequestSection");
  const passwordSection = document.querySelector("#resetPasswordSection");
  const successSection = document.querySelector("#resetSuccessSection");
  const requestForm = document.querySelector("#resetRequestForm");
  const emailInput = document.querySelector("#resetEmail");
  const sendButton = document.querySelector("#sendResetEmailButton");
  const requestMessage = document.querySelector("#resetRequestMessage");
  const passwordForm = document.querySelector("#resetPasswordForm");
  const passwordInput = document.querySelector("#newPassword");
  const confirmInput = document.querySelector("#newPasswordConfirm");
  const saveButton = document.querySelector("#saveNewPasswordButton");
  const passwordMessage = document.querySelector("#resetPasswordMessage");
  const pageMessage = document.querySelector("#resetPageMessage");
  const backLink = document.querySelector("#resetBackLink");
  let client;
  let verifiedUserId = "";
  let sending = false;
  let saving = false;
  let retryAt = 0;
  let retryTimer;

  // 기존 앱 로그인과 분리된 탭 전용 저장소. 새로고침 후에도 변경을 마칠 수 있습니다.
  // 저장소가 차단된 브라우저에서는 이 페이지의 메모리만 사용합니다.
  const memory = new Map();
  const recoveryStorage = {
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try { return sessionStorage.getItem(key); } catch (_) { return null; }
    },
    setItem(key, value) {
      memory.set(key, value);
      try { sessionStorage.setItem(key, value); } catch (_) { /* 메모리 저장소로 계속 진행 */ }
    },
    removeItem(key) {
      memory.delete(key);
      try { sessionStorage.removeItem(key); } catch (_) { /* 메모리 저장소만 사용 중 */ }
    }
  };

  function setMessage(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle("is-error", isError);
  }

  function showRequest(message = "", isError = false) {
    verifiedUserId = "";
    passwordForm.reset();
    passwordSection.hidden = true;
    successSection.hidden = true;
    requestSection.hidden = false;
    title.textContent = "비밀번호 재설정";
    description.textContent = "가입할 때 입력한 이메일로 새 비밀번호를 정할 수 있는 링크를 보내드려요.";
    setMessage(requestMessage, message, isError);
    updateSendButton();
  }

  function updateSendButton() {
    const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    sendButton.disabled = !client || sending || seconds > 0;
    sendButton.textContent = sending ? "메일 보내는 중..."
      : seconds > 0 ? "다시 보내기 · " + seconds + "초 후" : "재설정 메일 보내기";
    if (!seconds && retryTimer) {
      clearInterval(retryTimer);
      retryTimer = undefined;
    }
  }

  function startCooldown() {
    retryAt = Date.now() + 60000;
    clearInterval(retryTimer);
    retryTimer = setInterval(updateSendButton, 1000);
    updateSendButton();
  }

  function showPasswordForm(user) {
    verifiedUserId = user.id;
    requestSection.hidden = true;
    passwordSection.hidden = false;
    successSection.hidden = true;
    title.textContent = "새 비밀번호 설정";
    description.textContent = "앞으로 사용할 비밀번호를 두 번 입력해 주세요.";
    document.querySelector("#resetAccountEmail").textContent = user.email || "이메일 확인 완료";
    setMessage(pageMessage, "");
    title.focus({ preventScroll: true });
  }

  function invalidateRecovery(message) {
    recoveryStorage.removeItem(STORAGE_KEY);
    showRequest(message, true);
    title.focus({ preventScroll: true });
  }

  requestForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!client || sending || retryAt > Date.now()) return;
    emailInput.value = emailInput.value.trim();
    if (!requestForm.reportValidity()) return;
    sending = true;
    emailInput.readOnly = true;
    updateSendButton();
    setMessage(requestMessage, "메일을 요청하고 있어요.");
    try {
      const { error } = await client.auth.resetPasswordForEmail(emailInput.value, {
        redirectTo: REDIRECT_URL
      });
      if (error && !["user_not_found", "email_address_not_found"].includes(error.code)) {
        if (error.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(error.code)) {
          startCooldown();
          setMessage(requestMessage, "요청이 많아 잠시 기다려야 해요. 조금 뒤 다시 시도해 주세요.", true);
        } else {
          setMessage(requestMessage, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 센터 데스크에 문의해 주세요.", true);
        }
        return;
      }
      // 가입 여부를 화면에서 구분해 알려주지 않습니다.
      setMessage(requestMessage, "등록된 이메일이라면 재설정 메일이 발송돼요. 받은 메일의 링크를 눌러 주세요.");
      startCooldown();
    } catch (_) {
      setMessage(requestMessage, "인터넷 연결을 확인하고 다시 시도해 주세요.", true);
    } finally {
      sending = false;
      emailInput.readOnly = false;
      updateSendButton();
    }
  });

  passwordForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!client || !verifiedUserId || saving) return;
    if (!passwordForm.reportValidity()) return;
    if (passwordInput.value.length < 8) {
      setMessage(passwordMessage, "새 비밀번호를 8자 이상으로 입력해 주세요.", true);
      passwordInput.focus();
      return;
    }
    if (passwordInput.value !== confirmInput.value) {
      setMessage(passwordMessage, "두 비밀번호가 서로 달라요. 다시 확인해 주세요.", true);
      confirmInput.focus();
      return;
    }
    saving = true;
    saveButton.disabled = true;
    passwordInput.readOnly = true;
    confirmInput.readOnly = true;
    setMessage(passwordMessage, "새 비밀번호를 저장하고 있어요.");
    try {
      // URL의 type이나 저장된 사용자 정보만 믿지 않고 서버에서 계정을 확인합니다.
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError && (userError.name === "AuthRetryableFetchError" || userError.status >= 500)) {
        setMessage(passwordMessage, "인터넷 연결을 확인한 뒤 다시 저장해 주세요.", true);
        return;
      }
      if (userError || userData?.user?.id !== verifiedUserId) {
        invalidateRecovery("인증이 만료되었거나 계정을 확인하지 못했어요. 재설정 메일을 다시 요청해 주세요.");
        return;
      }
      const { error } = await client.auth.updateUser({ password: passwordInput.value });
      if (error) {
        if (error.code === "same_password") {
          setMessage(passwordMessage, "기존 비밀번호와 다른 비밀번호를 입력해 주세요.", true);
        } else if (error.code === "weak_password") {
          setMessage(passwordMessage, "보안 조건에 맞지 않는 비밀번호예요. 더 길게 입력하고 영문 대소문자·숫자·특수문자를 섞어 주세요.", true);
        } else if (error.status === 401 || error.status === 403 || ["session_not_found", "refresh_token_not_found"].includes(error.code)) {
          invalidateRecovery("인증이 만료되었어요. 재설정 메일을 다시 요청해 주세요.");
        } else if (error.status === 429) {
          setMessage(passwordMessage, "요청이 많아 잠시 기다려야 해요. 조금 뒤 다시 시도해 주세요.", true);
        } else {
          setMessage(passwordMessage, "변경 완료를 확인하지 못했어요. 다시 시도하거나 새 비밀번호로 로그인을 확인해 주세요.", true);
        }
        return;
      }
      passwordForm.reset();
      verifiedUserId = "";
      passwordSection.hidden = true;
      successSection.hidden = false;
      title.textContent = "변경 완료";
      description.textContent = "이제 새 비밀번호를 사용할 수 있어요.";
      backLink.href = "./?password-reset=complete";
      backLink.textContent = "새 비밀번호로 로그인하기";
      title.focus({ preventScroll: true });
      // 서버 변경 성공과 로그아웃 실패를 혼동하지 않도록 성공 화면을 먼저 표시합니다.
      // SDK가 복구 세션을 읽어 로그아웃한 뒤 이 탭의 저장소를 정리합니다.
      const signOut = client.auth.signOut({ scope: "global" });
      signOut.catch(function () {}).finally(function () {
        recoveryStorage.removeItem(STORAGE_KEY);
      });
    } catch (_) {
      setMessage(passwordMessage, "인터넷 연결을 확인해 주세요. 변경 완료가 불확실하면 새 비밀번호로 로그인을 확인해 주세요.", true);
    } finally {
      saving = false;
      saveButton.disabled = false;
      passwordInput.readOnly = false;
      confirmInput.readOnly = false;
    }
  });

  document.querySelectorAll("[data-reset-password-toggle]").forEach(function (button) {
    const input = document.getElementById(button.dataset.resetPasswordToggle);
    const label = input === passwordInput ? "새 비밀번호" : "새 비밀번호 확인";
    button.addEventListener("click", function () {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      button.textContent = hidden ? "🙈" : "👁";
      button.setAttribute("aria-pressed", String(hidden));
      button.setAttribute("aria-label", label + (hidden ? " 숨기기" : " 보기"));
      input.focus({ preventScroll: true });
    });
  });

  window.addEventListener("pagehide", function () {
    passwordForm.reset();
    if (!successSection.hidden) recoveryStorage.removeItem(STORAGE_KEY);
  });

  async function initialize() {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const hasCallback = hash.has("type") || hash.has("access_token") || hash.has("refresh_token") ||
      hash.has("error") || hash.has("error_code") || query.has("error") || query.has("error_code") || query.has("code") || query.has("token_hash");
    if (hasCallback) {
      recoveryStorage.removeItem(STORAGE_KEY);
      // 인증 정보가 주소창과 현재 방문 기록에 남지 않게 즉시 지웁니다.
      window.history.replaceState(null, "", window.location.pathname);
    }
    try {
      if (!window.supabase?.createClient) throw new Error("SDK unavailable");
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          flowType: "implicit",
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: false,
          storageKey: STORAGE_KEY,
          storage: recoveryStorage
        }
      });
      if (hasCallback) {
        if (hash.get("type") !== "recovery" || !hash.get("access_token") || !hash.get("refresh_token") ||
          hash.has("error") || hash.has("error_code") || query.has("error") || query.has("error_code")) {
          invalidateRecovery("링크가 만료되었거나 유효하지 않아요. 재설정 메일을 다시 요청해 주세요.");
          return;
        }
        description.textContent = "이메일 인증을 확인하고 있어요.";
        const { error } = await client.auth.setSession({
          access_token: hash.get("access_token"),
          refresh_token: hash.get("refresh_token")
        });
        if (error) {
          invalidateRecovery("링크를 확인하지 못했어요. 만료되었거나 이미 사용한 링크라면 메일을 다시 요청해 주세요.");
          return;
        }
      }
      const { data, error } = await client.auth.getSession();
      if (error) {
        invalidateRecovery("인증을 확인하지 못했어요. 재설정 메일을 다시 요청해 주세요.");
        return;
      }
      if (data?.session) {
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError || !userData?.user?.id) {
          invalidateRecovery("인증이 만료되었거나 인터넷에 연결되지 않았어요. 연결을 확인하고 메일을 다시 요청해 주세요.");
          return;
        }
        showPasswordForm(userData.user);
      } else if (hasCallback) {
        invalidateRecovery("인증을 확인하지 못했어요. 재설정 메일을 다시 요청해 주세요.");
      } else {
        showRequest();
      }
    } catch (_) {
      showRequest("화면을 준비하지 못했어요. 인터넷 연결을 확인한 뒤 다시 열어 주세요.", true);
    }
  }

  initialize();
})();
