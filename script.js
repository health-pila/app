const SUPABASE_URL = "https://cithfqbzszgiqjifhrqy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0mGHHS1HcRHh0Ttt8sZwtA_MBI22p1w";

// 복구 링크가 기본 앱 주소로 돌아와도 운동 화면 대신 재설정 페이지로 보냅니다.
const isPasswordRecoveryReturn =
  new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
if (isPasswordRecoveryReturn) {
  const resetUrl = new URL("./reset-password.html", window.location.href);
  resetUrl.hash = window.location.hash;
  window.location.replace(resetUrl.href);
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: { detectSessionInUrl: !isPasswordRecoveryReturn } }
);

  const routineCarousel =
  document.querySelector("#routineCarousel");
if (
  "serviceWorker" in navigator &&
  window.location.protocol !== "file:"
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((error) => {
        console.error("서비스워커 등록 실패:", error);
      });
  });
}
// 홈 화면 설치 기능
const installButton = document.getElementById("installButton");

let deferredInstallPrompt = null;

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

// 이미 설치된 상태가 아니라면 버튼 표시
if (!isStandalone) {
  installButton.hidden = false;

  if (isIos) {
    installButton.textContent = "📲 아이폰 설치 방법";
  }
}

// 안드로이드·PC에서 설치 준비가 완료되었을 때
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

// 설치 버튼 클릭
installButton.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();

    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;

    if (choice.outcome === "accepted") {
      installButton.hidden = true;
    }

    return;
  }

  if (isIos) {
    alert(
      "Safari의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하고, 마지막으로 ‘추가’를 눌러주세요."
    );
    return;
  }

  alert("브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택해주세요.");
});

// 설치가 완료되면 버튼 숨기기
window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  deferredInstallPrompt = null;
});
// 로그인과 화면 전환에 필요한 요소
const loginScreen = document.querySelector("#loginScreen");
const appScreen = document.querySelector("#appScreen");
const adminScreen = document.querySelector("#adminScreen");
// 회원 화면 하단 탭
const memberTabButtons =
  document.querySelectorAll("[data-member-tab]");

const memberTabPanels = {
  routine: document.querySelector("#routineTabPanel"),
  workoutLog: document.querySelector("#workoutLogTabPanel"),
  community: document.querySelector("#communityTabPanel")
};

// 회원 센터 커뮤니티 요소
const communityPostList =
  document.querySelector(
    "#communityPostList"
  );

const communityStatusMessage =
  document.querySelector(
    "#communityStatusMessage"
  );

// 회원 센터 소식: 실시간 연결과 기존 카드 보관
let communityRealtimeChannel = null;
let communityRealtimeRefreshTimer = null;
let communitySubscriptionGeneration = 0;
let communityLoadRequestId = 0;
const memberCommunityCards = new Map();

function scheduleCommunityRealtimeRefresh() {
  if (appScreen.hidden || !communityRealtimeChannel) return;
  communityLoadRequestId += 1;
  clearTimeout(communityRealtimeRefreshTimer);
  const channel = communityRealtimeChannel;
  communityRealtimeRefreshTimer = setTimeout(function () {
    communityRealtimeRefreshTimer = null;
    if (appScreen.hidden || channel !== communityRealtimeChannel) return;
    if (document.visibilityState === "hidden") return;
    loadCommunityPosts(true);
  }, 500);
}

async function stopCommunityRealtimeSubscription() {
  communitySubscriptionGeneration += 1;
  communityLoadRequestId += 1;
  clearTimeout(communityRealtimeRefreshTimer);
  communityRealtimeRefreshTimer = null;
  const channel = communityRealtimeChannel;
  communityRealtimeChannel = null;
  if (!channel) return;
  try {
    await supabaseClient.removeChannel(channel);
  } catch (error) {
    console.error("센터 소식 실시간 연결 종료 실패:", error);
  }
}

async function startCommunityRealtimeSubscription() {
  const stopping = stopCommunityRealtimeSubscription();
  const generation = communitySubscriptionGeneration;
  await stopping;
  if (appScreen.hidden || generation !== communitySubscriptionGeneration) return;
  const channel = supabaseClient.channel(`member-community-${generation}-${Date.now()}`);
  communityRealtimeChannel = channel;
  ["community_posts", "community_post_images"].forEach(function (table) {
    channel.on("postgres_changes", {
      event: "*", schema: "public", table: table
    }, function () {
      // 삭제 이벤트도 감지하고, 실제 공개 자료는 기존 SELECT 권한으로 재조회합니다.
      if (channel === communityRealtimeChannel) scheduleCommunityRealtimeRefresh();
    });
  });
  channel.subscribe(function (status) {
    if (channel !== communityRealtimeChannel) return;
    if (status === "SUBSCRIBED") scheduleCommunityRealtimeRefresh();
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error("센터 소식 실시간 연결 실패:", status);
    }
  });
}

function resetMemberCommunityPosts() {
  communityLoadRequestId += 1;
  if (activeCommunityVideoArea && communityPostList.contains(activeCommunityVideoArea)) {
    activeCommunityVideoArea.resetCommunityVideo();
  }
  memberCommunityCards.clear();
  communityPostList.replaceChildren();
}

window.addEventListener("online", scheduleCommunityRealtimeRefresh);


// 회원 1:1 문의 요소
const memberInquiryAvailabilityMessage =
  document.querySelector(
    "#memberInquiryAvailabilityMessage"
  );

const memberInquiryComposer =
  document.querySelector(
    "#memberInquiryComposer"
  );

const memberInquiryTitle =
  document.querySelector(
    "#memberInquiryTitle"
  );

const memberInquiryBody =
  document.querySelector(
    "#memberInquiryBody"
  );

const sendMemberInquiryButton =
  document.querySelector(
    "#sendMemberInquiryButton"
  );

const memberInquirySubmitMessage =
  document.querySelector(
    "#memberInquirySubmitMessage"
  );

const memberInquiryListMessage =
  document.querySelector(
    "#memberInquiryListMessage"
  );

const memberInquiryList =
  document.querySelector(
    "#memberInquiryList"
  );

const loadMoreMemberInquiriesButton =
  document.querySelector(
    "#loadMoreMemberInquiriesButton"
  );

let isMemberInquiryEnabled = false;
let openMemberInquiryId = null;

const MEMBER_INQUIRY_PAGE_SIZE = 3;

let memberInquiryVisibleCount =
  MEMBER_INQUIRY_PAGE_SIZE;

// 오래 걸린 이전 문의 조회가 새 화면을 덮어쓰지 않도록 구분합니다.
let memberInquiryLoadRequestId = 0;
let adminInquiryLoadRequestId = 0;

let inquiryRealtimeChannel = null;
let inquiryRealtimeRefreshTimer = null;

let memberRoutineRealtimeChannel = null;
let memberRoutineRealtimeRefreshTimer =
  null;

let currentMemberRoutineUserId = null;

let adminRoutineRequestRealtimeChannel = null;
let adminRoutineRequestRefreshTimer = null;
let adminRoutineRequestLoadId = 0;

function refreshMemberRoutineWhenVisible() {
  if (
    document.visibilityState !==
    "visible"
  ) {
    return;
  }

  scheduleMemberRoutineRealtimeRefresh();
  scheduleAdminRoutineRequestRefresh();
  scheduleCommunityRealtimeRefresh();
  refreshAdminMembersIfNeeded();
}

document.addEventListener(
  "visibilitychange",
  refreshMemberRoutineWhenVisible
);

window.addEventListener(
  "pageshow",
  refreshMemberRoutineWhenVisible
);

const inquiryRealtimeRefreshTargets =
  new Set();

// 문의 변경이 연속으로 발생할 때 한 번만 갱신
function scheduleInquiryRealtimeRefresh(
  screenType,
  refreshTarget = "all"
) {
  inquiryRealtimeRefreshTargets.add(
    refreshTarget
  );

  if (inquiryRealtimeRefreshTimer) {
    clearTimeout(
      inquiryRealtimeRefreshTimer
    );
  }

  inquiryRealtimeRefreshTimer =
    setTimeout(
      async function () {
        inquiryRealtimeRefreshTimer = null;

        const refreshTargets =
          new Set(
            inquiryRealtimeRefreshTargets
          );

        inquiryRealtimeRefreshTargets.clear();

        const shouldRefreshList =
          refreshTargets.has("all") ||
          refreshTargets.has("list");

        const shouldRefreshSetting =
          refreshTargets.has("all") ||
          refreshTargets.has("setting");

        try {
          if (screenType === "admin") {
            if (!adminScreen.hidden) {
              const refreshTasks = [];

              if (shouldRefreshSetting) {
                refreshTasks.push(
                  loadAdminInquirySetting()
                );
              }

              if (shouldRefreshList) {
                refreshTasks.push(
                  loadAdminInquiries(true)
                );
              }

              await Promise.all(
                refreshTasks
              );
            }

            return;
          }

          if (!appScreen.hidden) {
            const refreshTasks = [];

            if (shouldRefreshSetting) {
              refreshTasks.push(
                loadMemberInquirySetting()
              );
            }

            if (shouldRefreshList) {
              refreshTasks.push(
                loadMemberInquiries(true)
              );
            }

            await Promise.all(
              refreshTasks
            );
          }

        } catch (refreshError) {
          console.error(
            "문의 실시간 갱신 실패:",
            refreshError
          );
        }
      },
      300
    );
}

// 기존 문의 실시간 구독 종료
async function stopInquiryRealtimeSubscription() {
  memberInquiryLoadRequestId += 1;
  adminInquiryLoadRequestId += 1;
  if (inquiryRealtimeRefreshTimer) {
    clearTimeout(
      inquiryRealtimeRefreshTimer
    );

    inquiryRealtimeRefreshTimer = null;
  }

  inquiryRealtimeRefreshTargets.clear();

  const channelToRemove =
    inquiryRealtimeChannel;

  inquiryRealtimeChannel = null;

  if (!channelToRemove) {
    return;
  }

  try {
    await supabaseClient.removeChannel(
      channelToRemove
    );
  } catch (removeChannelError) {
    console.error(
      "문의 실시간 구독 종료 실패:",
      removeChannelError
    );
  }
}

// 회원 또는 관리자 문의 실시간 구독 시작
async function startInquiryRealtimeSubscription(
  screenType
) {
  await stopInquiryRealtimeSubscription();

  function refreshInquiryList() {
    scheduleInquiryRealtimeRefresh(
      screenType,
      "list"
    );
  }

  function refreshInquirySetting() {
    scheduleInquiryRealtimeRefresh(
      screenType,
      "setting"
    );
  }

  let realtimeChannel =
    supabaseClient.channel(
      `inquiry-realtime-${screenType}-${Date.now()}`
    );

  /*
    문의 자체의 변경은 관리자 화면에서만 감지합니다.
    회원 화면은 보관·복원 같은 관리자용 변경을
    다시 불러오지 않습니다.
  */
  if (screenType === "admin") {
    realtimeChannel =
      realtimeChannel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "member_inquiries"
        },
        refreshInquiryList
      );
  }

  inquiryRealtimeChannel =
    realtimeChannel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inquiry_messages"
        },
        refreshInquiryList
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter:
            "setting_key=eq.member_inquiry_enabled"
        },
        refreshInquirySetting
      )
      .subscribe(function (status) {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            "문의 실시간 연결 실패:",
            status
          );
        }
      });
}

// 루틴 변경이 연속으로 발생해도 한 번만 갱신
function scheduleMemberRoutineRealtimeRefresh() {
  if (
    !currentMemberRoutineUserId ||
    appScreen.hidden
  ) {
    return;
  }

  if (memberRoutineRealtimeRefreshTimer) {
    clearTimeout(
      memberRoutineRealtimeRefreshTimer
    );
  }

  const userIdToRefresh =
    currentMemberRoutineUserId;

  memberRoutineRealtimeRefreshTimer =
    setTimeout(
      async function () {
        memberRoutineRealtimeRefreshTimer =
          null;

        if (
          !userIdToRefresh ||
          userIdToRefresh !==
          currentMemberRoutineUserId ||
          appScreen.hidden
        ) {
          return;
        }

        try {
          await loadMemberRoutine(
            userIdToRefresh,
            true
          );
        } catch (refreshError) {
          console.error(
            "루틴 실시간 갱신 실패:",
            refreshError
          );
        }
      },
      300
    );
}

// 기존 루틴 실시간 구독 종료
async function stopMemberRoutineRealtimeSubscription() {
  routineRequestStatusLoadId += 1;
  if (memberRoutineRealtimeRefreshTimer) {
    clearTimeout(
      memberRoutineRealtimeRefreshTimer
    );

    memberRoutineRealtimeRefreshTimer =
      null;
  }

  const channelToRemove =
    memberRoutineRealtimeChannel;

  memberRoutineRealtimeChannel = null;
  currentMemberRoutineUserId = null;

  if (!channelToRemove) {
    return;
  }

  try {
    await supabaseClient.removeChannel(
      channelToRemove
    );
  } catch (removeChannelError) {
    console.error(
      "루틴 실시간 구독 종료 실패:",
      removeChannelError
    );
  }
}

// 로그인한 회원의 루틴 변경 실시간 구독 시작
async function startMemberRoutineRealtimeSubscription(
  userId
) {
  await stopMemberRoutineRealtimeSubscription();

  currentMemberRoutineUserId = userId;

  memberRoutineRealtimeChannel =
    supabaseClient
      .channel(
        `member-routine-${userId}-${Date.now()}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "member_routines",
          filter: `user_id=eq.${userId}`
        },
        scheduleMemberRoutineRealtimeRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "member_routines",
          filter: `user_id=eq.${userId}`
        },
        scheduleMemberRoutineRealtimeRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "routine_requests",
          filter: `user_id=eq.${userId}`
        },
        function () {
          if (currentMemberRoutineUserId === userId && !appScreen.hidden) {
            updateRoutineRequestStatus(userId);
          }
        }
      )
      .subscribe(function (status) {
        if (status === "SUBSCRIBED" && currentMemberRoutineUserId === userId && !appScreen.hidden) {
          updateRoutineRequestStatus(userId);
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            "루틴 실시간 연결 실패:",
            status
          );
        }
      });
}

// 관리자 루틴 신청 알림 갱신 예약
function scheduleAdminRoutineRequestRefresh() {
  if (
    adminScreen.hidden ||
    !adminRoutineRequestRealtimeChannel
  ) {
    return;
  }

  if (adminRoutineRequestRefreshTimer) {
    clearTimeout(
      adminRoutineRequestRefreshTimer
    );
  }

  const currentChannel =
    adminRoutineRequestRealtimeChannel;

  adminRoutineRequestRefreshTimer =
    setTimeout(async function () {
      adminRoutineRequestRefreshTimer = null;

      if (
        adminScreen.hidden ||
        currentChannel !==
        adminRoutineRequestRealtimeChannel
      ) {
        return;
      }

      try {
        await loadAdminRoutineRequests(true);
      } catch (refreshError) {
        console.error(
          "루틴 신청 알림 갱신 실패:",
          refreshError
        );
      }
    }, 300);
}

// 관리자 루틴 신청 실시간 연결 종료
async function stopAdminRoutineRequestSubscription() {
  adminRoutineRequestLoadId += 1;

  if (adminRoutineRequestRefreshTimer) {
    clearTimeout(
      adminRoutineRequestRefreshTimer
    );

    adminRoutineRequestRefreshTimer = null;
  }

  const channelToRemove =
    adminRoutineRequestRealtimeChannel;

  adminRoutineRequestRealtimeChannel = null;

  if (!channelToRemove) {
    return;
  }

  try {
    await supabaseClient.removeChannel(
      channelToRemove
    );
  } catch (removeError) {
    console.error(
      "루틴 신청 실시간 연결 종료 실패:",
      removeError
    );
  }
}

// 관리자 루틴 신청 실시간 연결 시작
async function startAdminRoutineRequestSubscription() {
  await stopAdminRoutineRequestSubscription();

  if (adminScreen.hidden) {
    return;
  }

  const channel =
    supabaseClient.channel(
      `admin-routine-requests-${Date.now()}`
    );

  adminRoutineRequestRealtimeChannel =
    channel;

  channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "routine_requests"
      },
      function () {
        if (
          adminRoutineRequestRealtimeChannel !==
          channel
        ) {
          return;
        }

        scheduleAdminRoutineRequestRefresh();
      }
    )
    .subscribe(function (status) {
      if (
        adminRoutineRequestRealtimeChannel !==
        channel
      ) {
        return;
      }

      if (status === "SUBSCRIBED") {
        scheduleAdminRoutineRequestRefresh();
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        console.error(
          "루틴 신청 실시간 연결 실패:",
          status
        );
      }
    });
}

// 회원 문의 메뉴의 활성·비활성 상태 반영
function updateMemberInquiryMenuState() {
  const inquiryButton = document.querySelector(
    "#communityInquiryMenuButton"
  );

  const unavailableMessage = document.querySelector(
    "#communityInquiryUnavailableMessage"
  );

  const inquirySection = document.querySelector(
    "#memberInquirySection"
  );

  inquiryButton.disabled = !isMemberInquiryEnabled;

  inquiryButton.setAttribute(
    "aria-disabled",
    String(!isMemberInquiryEnabled)
  );

  unavailableMessage.hidden = isMemberInquiryEnabled;

  if (!isMemberInquiryEnabled) {
    inquiryButton.tabIndex = -1;

    // 문의 화면을 보고 있었다면 센터 소식으로 이동
    if (!inquirySection.hidden) {
      showCommunityMenu("news");
    }
  } else {
    inquiryButton.tabIndex =
      inquiryButton.getAttribute("aria-selected") === "true"
        ? 0
        : -1;
  }
}

// 회원 문의 기능 온·오프 상태 불러오기
async function loadMemberInquirySetting() {
  updateMemberInquiryMenuState();

  try {
    const {
      data: inquirySetting,
      error: inquirySettingError
    } = await supabaseClient
      .from("app_settings")
      .select("is_enabled")
      .eq(
        "setting_key",
        "member_inquiry_enabled"
      )
      .maybeSingle();

    if (inquirySettingError) {
      throw inquirySettingError;
    }

    isMemberInquiryEnabled =
      inquirySetting?.is_enabled === true;

    memberInquiryComposer.hidden =
      !isMemberInquiryEnabled;

    memberInquiryAvailabilityMessage.textContent =
      isMemberInquiryEnabled
        ? "작성한 문의와 센터의 답변은 본인만 확인할 수 있습니다."
        : "현재 1:1 문의 접수가 중단되어 있습니다.";
  } catch (settingError) {
    console.error(
      "회원 문의 설정 불러오기 실패:",
      settingError
    );

    isMemberInquiryEnabled = false;
    memberInquiryComposer.hidden = true;

    memberInquiryAvailabilityMessage.textContent =
      "문의 기능 상태를 확인하지 못했습니다.";
  } finally {
    updateMemberInquiryMenuState();
  }
}

// 회원의 새 1:1 문의 전송
async function sendMemberInquiry() {
  const title =
    memberInquiryTitle.value.trim();

  const body =
    memberInquiryBody.value.trim();

  if (!isMemberInquiryEnabled) {
    memberInquirySubmitMessage.textContent =
      "현재 1:1 문의 접수가 중단되어 있습니다.";

    return;
  }

  if (!title) {
    memberInquirySubmitMessage.textContent =
      "문의 제목을 입력해 주세요.";

    memberInquiryTitle.focus();
    return;
  }

  if (!body) {
    memberInquirySubmitMessage.textContent =
      "문의 내용을 입력해 주세요.";

    memberInquiryBody.focus();
    return;
  }

  sendMemberInquiryButton.disabled = true;
  sendMemberInquiryButton.textContent =
    "문의 전송 중...";

  memberInquirySubmitMessage.textContent =
    "문의를 저장하고 있습니다.";

  try {
    const {
      error: createInquiryError
    } = await supabaseClient.rpc(
      "create_member_inquiry",
      {
        p_title: title,
        p_body: body
      }
    );

    if (createInquiryError) {
      throw createInquiryError;
    }

    memberInquiryTitle.value = "";
    memberInquiryBody.value = "";

    memberInquirySubmitMessage.textContent =
      "문의를 전송했습니다.";

    await loadMemberInquiries();

  } catch (sendError) {
    console.error(
      "회원 문의 전송 실패:",
      sendError
    );

    memberInquirySubmitMessage.textContent =
      `문의 전송 실패: ${sendError.message ||
      "알 수 없는 오류"
      }`;

    /*
      관리자가 문의 기능을 끈 직후라면
      작성 영역도 최신 설정으로 다시 변경
    */
    await loadMemberInquirySetting();

  } finally {
    sendMemberInquiryButton.disabled = false;
    sendMemberInquiryButton.textContent =
      "문의 보내기";
  }
}


// 문의 보내기 버튼 연결
sendMemberInquiryButton.addEventListener(
  "click",
  sendMemberInquiry
);

// 문의 작성 날짜 표시
function formatMemberInquiryDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "ko-KR",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(
    new Date(dateValue)
  );
}

// 기존 문의방에 회원의 추가 질문 저장
async function sendMemberInquiryReply(
  inquiryId,
  replyInput,
  replyButton,
  replyMessage
) {
  const body =
    replyInput.value.trim();

  if (!isMemberInquiryEnabled) {
    replyMessage.textContent =
      "현재 추가 질문 접수가 중단되어 있습니다.";

    return;
  }

  if (!body) {
    replyMessage.textContent =
      "추가 질문 내용을 입력해 주세요.";

    replyInput.focus();
    return;
  }

  replyButton.disabled = true;
  replyButton.textContent =
    "전송 중...";

  replyMessage.textContent =
    "추가 질문을 저장하고 있습니다.";

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error(
        "로그인 정보를 확인할 수 없습니다."
      );
    }

    const {
      error: replyInsertError
    } = await supabaseClient
      .from("inquiry_messages")
      .insert({
        inquiry_id: inquiryId,
        sender_id: user.id,
        sender_role: "member",
        body: body
      });

    if (replyInsertError) {
      throw replyInsertError;
    }

    replyInput.value = "";

    /*
      목록을 다시 불러온 뒤에도
      작성한 문의방이 열린 상태로 유지
    */
    openMemberInquiryId =
      inquiryId;

    await loadMemberInquiries();

  } catch (replyError) {
    console.error(
      "회원 추가 질문 전송 실패:",
      replyError
    );

    replyMessage.textContent =
      `추가 질문 전송 실패: ${replyError.message ||
      "알 수 없는 오류"
      }`;

  } finally {
    if (replyButton.isConnected) {
      replyButton.disabled = false;
      replyButton.textContent =
        "추가 질문 보내기";
    }
  }
}

// 선택한 회원 문의의 대화 내용 불러오기
async function loadMemberInquiryMessages(
  inquiryId,
  messageList
) {
  messageList.replaceChildren();

  const loadingMessage =
    document.createElement("p");

  loadingMessage.className =
    "member-inquiry-reply-disabled-message";

  loadingMessage.textContent =
    "대화 내용을 불러오는 중입니다.";

  messageList.append(loadingMessage);

  try {
    const {
      data: messages,
      error: messagesError
    } = await supabaseClient
      .from("inquiry_messages")
      .select(
        "id, sender_id, sender_role, body, created_at"
      )
      .eq("inquiry_id", inquiryId)
      .order("created_at", {
        ascending: true
      });

    if (messagesError) {
      throw messagesError;
    }

    messageList.replaceChildren();

    if (!messages || messages.length === 0) {
      const emptyMessage =
        document.createElement("p");

      emptyMessage.className =
        "member-inquiry-reply-disabled-message";

      emptyMessage.textContent =
        "표시할 대화 내용이 없습니다.";

      messageList.append(emptyMessage);
      messageList.dataset.loaded = "true";

      return;
    }

    messages.forEach(function (message) {
      const messageCard =
        document.createElement("article");

      messageCard.className =
        message.sender_role === "admin"
          ? "member-inquiry-message is-admin"
          : "member-inquiry-message is-member";

      const messageLabel =
        document.createElement("strong");

      messageLabel.className =
        "member-inquiry-message-label";

      messageLabel.textContent =
        message.sender_role === "admin"
          ? "센터 답변"
          : "내 질문";

      const messageBody =
        document.createElement("p");

      messageBody.className =
        "member-inquiry-message-body";

      messageBody.textContent =
        message.body;

      const messageDate =
        document.createElement("time");

      messageDate.className =
        "member-inquiry-message-date";

      messageDate.dateTime =
        message.created_at || "";

      messageDate.textContent =
        formatMemberInquiryDate(
          message.created_at
        );

      messageCard.append(
        messageLabel,
        messageBody,
        messageDate
      );

      messageList.append(messageCard);
    });

    messageList.dataset.loaded = "true";

  } catch (messagesError) {
    console.error(
      "회원 문의 대화 불러오기 실패:",
      messagesError
    );

    messageList.replaceChildren();

    const errorMessage =
      document.createElement("p");

    errorMessage.className =
      "member-inquiry-reply-disabled-message";

    errorMessage.textContent =
      "대화 내용을 불러오지 못했습니다.";

    messageList.append(errorMessage);
  }
}

// 회원 본인의 문의 완전 삭제
async function deleteMemberInquiry(
  inquiryId,
  deleteButton,
  deleteMessage
) {
  const shouldDelete =
    window.confirm(
      "이 문의를 삭제할까요?\n\n질문과 센터 답변이 모두 삭제되며 복구할 수 없습니다."
    );

  if (!shouldDelete) {
    return;
  }

  deleteButton.disabled = true;
  deleteButton.textContent =
    "삭제 중...";

  deleteMessage.textContent = "";

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error(
        "로그인 정보를 확인할 수 없습니다."
      );
    }

    const {
      data: deletedInquiry,
      error: deleteError
    } = await supabaseClient
      .from("member_inquiries")
      .delete()
      .eq("id", inquiryId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (
      deleteError ||
      !deletedInquiry
    ) {
      throw (
        deleteError ||
        new Error(
          "삭제할 문의를 찾지 못했습니다."
        )
      );
    }

    if (
      openMemberInquiryId ===
      inquiryId
    ) {
      openMemberInquiryId = null;
    }

    await loadMemberInquiries(true);

  } catch (deleteError) {
    console.error(
      "회원 문의 삭제 실패:",
      deleteError
    );

    deleteMessage.textContent =
      `문의 삭제 실패: ${deleteError.message ||
      "알 수 없는 오류"
      }`;

  } finally {
    if (deleteButton.isConnected) {
      deleteButton.disabled = false;
      deleteButton.textContent =
        "문의 삭제";
    }
  }
}

// 회원 문의 목록 표시
function renderMemberInquiries(inquiries) {
  memberInquiryList.replaceChildren();

  if (!inquiries || inquiries.length === 0) {
    memberInquiryListMessage.textContent =
      "아직 작성한 문의가 없습니다.";

    return;
  }

  memberInquiryListMessage.textContent = "";

  inquiries.forEach(function (inquiry) {
    const inquiryCard =
      document.createElement("article");

    inquiryCard.className =
      "member-inquiry-card";

    const summaryButton =
      document.createElement("button");

    summaryButton.type = "button";
    summaryButton.className =
      "member-inquiry-summary-button";

    const summaryTop =
      document.createElement("span");

    summaryTop.className =
      "member-inquiry-summary-top";

    const inquiryTitle =
      document.createElement("strong");

    inquiryTitle.className =
      "member-inquiry-card-title";

    inquiryTitle.textContent =
      inquiry.title;

    const statusBadge =
      document.createElement("span");

    statusBadge.className =
      inquiry.status === "answered"
        ? "member-inquiry-status is-answered"
        : "member-inquiry-status is-waiting";

    statusBadge.textContent =
      inquiry.status === "answered"
        ? "답변 완료"
        : "답변 대기";

    summaryTop.append(
      inquiryTitle,
      statusBadge
    );

    const inquiryMeta =
      document.createElement("span");

    inquiryMeta.className =
      "member-inquiry-card-meta";

    inquiryMeta.textContent =
      formatMemberInquiryDate(
        inquiry.last_message_at ||
        inquiry.created_at
      );

    summaryButton.append(
      summaryTop,
      inquiryMeta
    );

    const threadArea =
      document.createElement("div");

    threadArea.className =
      "member-inquiry-thread";

    threadArea.id =
      `memberInquiryThread-${inquiry.id}`;

    const isThreadOpen =
      openMemberInquiryId === inquiry.id;

    threadArea.hidden =
      !isThreadOpen;

    summaryButton.setAttribute(
      "aria-expanded",
      String(isThreadOpen)
    );

    summaryButton.setAttribute(
      "aria-controls",
      threadArea.id
    );

    const messageList =
      document.createElement("div");

    messageList.className =
      "member-inquiry-message-list";

    threadArea.append(messageList);

    if (isMemberInquiryEnabled) {
      const replyArea =
        document.createElement("div");

      replyArea.className =
        "member-inquiry-reply-area";

      const replyLabel =
        document.createElement("label");

      const replyInputId =
        `memberInquiryReply-${inquiry.id}`;

      replyLabel.htmlFor =
        replyInputId;

      replyLabel.textContent =
        "추가 질문";

      const replyInput =
        document.createElement("textarea");

      replyInput.id =
        replyInputId;

      replyInput.rows = 3;
      replyInput.maxLength = 5000;

      replyInput.placeholder =
        "같은 문의에 이어서 질문할 내용을 입력해 주세요.";

      const replyButton =
        document.createElement("button");

      replyButton.type = "button";
      replyButton.textContent =
        "추가 질문 보내기";

      const replyMessage =
        document.createElement("p");

      replyMessage.className =
        "member-inquiry-reply-message";

      replyMessage.setAttribute(
        "aria-live",
        "polite"
      );

      replyButton.addEventListener(
        "click",
        function () {
          sendMemberInquiryReply(
            inquiry.id,
            replyInput,
            replyButton,
            replyMessage
          );
        }
      );

      replyArea.append(
        replyLabel,
        replyInput,
        replyButton,
        replyMessage
      );

      threadArea.append(replyArea);

    } else {
      const disabledMessage =
        document.createElement("p");

      disabledMessage.className =
        "member-inquiry-reply-disabled-message";

      disabledMessage.textContent =
        "현재 추가 질문 접수가 중단되어 있습니다.";

      threadArea.append(
        disabledMessage
      );
    }

    const deleteArea =
      document.createElement("div");

    deleteArea.className =
      "member-inquiry-delete-area";

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";

    deleteButton.className =
      "member-inquiry-status member-inquiry-delete-button";

    deleteButton.textContent =
      "문의 삭제";

    const deleteMessage =
      document.createElement("p");

    deleteMessage.className =
      "member-inquiry-delete-message";

    deleteMessage.setAttribute(
      "aria-live",
      "polite"
    );

    deleteButton.addEventListener(
      "click",
      function () {
        deleteMemberInquiry(
          inquiry.id,
          deleteButton,
          deleteMessage
        );
      }
    );

    deleteArea.append(
      deleteButton,
      deleteMessage
    );


    summaryButton.addEventListener(
      "click",
      function () {
        const willOpen =
          threadArea.hidden;

        threadArea.hidden =
          !willOpen;

        openMemberInquiryId =
          willOpen
            ? inquiry.id
            : null;

        summaryButton.setAttribute(
          "aria-expanded",
          String(willOpen)
        );

        if (
          willOpen &&
          messageList.dataset.loaded !== "true"
        ) {
          loadMemberInquiryMessages(
            inquiry.id,
            messageList
          );
        }
      }
    );

    inquiryCard.append(
      summaryButton,
      threadArea,
      deleteArea
    );

    memberInquiryList.append(
      inquiryCard
    );

    if (isThreadOpen) {
      loadMemberInquiryMessages(
        inquiry.id,
        messageList
      );
    }
  });
}


// 회원 본인의 문의와 답변 불러오기
// 회원 본인의 문의 내역 불러오기
async function loadMemberInquiries(
  preserveCurrentList = false
) {
  const requestId = ++memberInquiryLoadRequestId;
  const visibleCount = memberInquiryVisibleCount;
  function isCurrentRequest() {
    return requestId === memberInquiryLoadRequestId && !appScreen.hidden &&
      visibleCount === memberInquiryVisibleCount;
  }
  if (!isCurrentRequest()) return;

  if (!preserveCurrentList) {
    memberInquiryList.replaceChildren();

    memberInquiryListMessage.textContent =
      "문의 내역을 불러오고 있습니다.";

    loadMoreMemberInquiriesButton.hidden = true;
  }

  loadMoreMemberInquiriesButton.disabled = true;

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (!isCurrentRequest()) return;

    if (userError || !user) {
      throw new Error(
        "로그인 정보를 확인할 수 없습니다."
      );
    }

    const {
      data: inquiries,
      error: inquiriesError,
      count: inquiryCount
    } = await supabaseClient
      .from("member_inquiries")
      .select(
        `
          id,
          user_id,
          title,
          status,
          created_at,
          updated_at,
          last_message_at
        `,
        {
          count: "exact"
        }
      )
      .eq("user_id", user.id)
      .order(
        "last_message_at",
        {
          ascending: false
        }
      )
      .range(
        0,
        visibleCount - 1
      );

    if (!isCurrentRequest()) return;

    if (inquiriesError) {
      throw inquiriesError;
    }

    memberInquiryListMessage.textContent = "";

    renderMemberInquiries(
      inquiries || []
    );

    const loadedInquiryCount =
      inquiries?.length || 0;

    const totalInquiryCount =
      inquiryCount || 0;

    const hasMoreInquiries =
      loadedInquiryCount <
      totalInquiryCount;

    const canCollapseInquiryList =
      memberInquiryVisibleCount >
      MEMBER_INQUIRY_PAGE_SIZE &&
      !hasMoreInquiries;

    loadMoreMemberInquiriesButton.hidden =
      totalInquiryCount <=
      MEMBER_INQUIRY_PAGE_SIZE;

    loadMoreMemberInquiriesButton.dataset.mode =
      canCollapseInquiryList
        ? "collapse"
        : "more";

    loadMoreMemberInquiriesButton.textContent =
      canCollapseInquiryList
        ? "목록 접기"
        : "이전 문의 더 보기";

  } catch (inquiriesError) {
    if (!isCurrentRequest()) return;
    console.error(
      "회원 문의 내역 불러오기 실패:",
      inquiriesError
    );

    if (preserveCurrentList) {
      // 자동 갱신 실패 시 보고 있던 문의·답변·입력 내용을 유지합니다.
      memberInquiryListMessage.textContent =
        "최신 문의를 확인하지 못했습니다. 기존 내역은 유지됩니다.";
    } else {
      memberInquiryList.replaceChildren();
      memberInquiryListMessage.textContent =
        `문의 내역을 불러오지 못했습니다: ${inquiriesError.message || "알 수 없는 오류"}`;
      loadMoreMemberInquiriesButton.hidden = true;
    }

  } finally {
    if (isCurrentRequest()) loadMoreMemberInquiriesButton.disabled = false;
  }
}

// 회원 문의 내역 더 보기 또는 목록 접기
loadMoreMemberInquiriesButton.addEventListener(
  "click",
  async function () {
    const scrollPositionBeforeUpdate =
      window.scrollY;

    const shouldCollapse =
      loadMoreMemberInquiriesButton.dataset.mode ===
      "collapse";

    loadMoreMemberInquiriesButton.disabled = true;

    if (shouldCollapse) {
      memberInquiryVisibleCount =
        MEMBER_INQUIRY_PAGE_SIZE;

      openMemberInquiryId = null;

      loadMoreMemberInquiriesButton.textContent =
        "목록 접는 중...";

      await loadMemberInquiries(true);

      requestAnimationFrame(function () {
        window.scrollTo({
          top: scrollPositionBeforeUpdate,
          left: 0,
          behavior: "auto"
        });
      });

      return;
    }

    memberInquiryVisibleCount +=
      MEMBER_INQUIRY_PAGE_SIZE;

    loadMoreMemberInquiriesButton.textContent =
      "불러오는 중...";

    await loadMemberInquiries(true);

    requestAnimationFrame(function () {
      window.scrollTo({
        top: scrollPositionBeforeUpdate,
        left: 0,
        behavior: "auto"
      });
    });
  }
);

// 센터 커뮤니티 중분류 메뉴
const communityMenuButtons = Array.from(
  document.querySelectorAll("[data-community-menu]")
);

const communityMenuPanels = {
  news: communityPostList,
  inquiry: document.querySelector("#memberInquirySection")
};

// 선택한 중분류 화면 표시
function showCommunityMenu(menuName) {
  if (
    menuName === "inquiry" &&
    !isMemberInquiryEnabled
  ) {
    return;
  }
  if (!communityMenuPanels[menuName]) {
    return;
  }

  if (menuName === "news") scheduleCommunityRealtimeRefresh();

  // 문의하기로 이동하면 소식 영상 정지
  if (
    menuName !== "news" &&
    activeCommunityVideoArea
  ) {
    activeCommunityVideoArea.resetCommunityVideo();
  }

  Object.entries(communityMenuPanels).forEach(
    ([panelName, panel]) => {
      panel.hidden = panelName !== menuName;
    }
  );

  communityMenuButtons.forEach((button) => {
    const isSelected =
      button.dataset.communityMenu === menuName;

    button.classList.toggle(
      "is-active",
      isSelected
    );

    button.setAttribute(
      "aria-selected",
      String(isSelected)
    );

    button.tabIndex =
      isSelected && !button.disabled ? 0 : -1;
  });
}

// 중분류 버튼 클릭 및 키보드 조작
communityMenuButtons.forEach((button, index) => {
  button.addEventListener("click", function () {
    showCommunityMenu(
      button.dataset.communityMenu
    );
  });

  button.addEventListener("keydown", function (event) {
    let nextIndex = index;

    if (event.key === "ArrowRight") {
      nextIndex =
        (index + 1) % communityMenuButtons.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (index - 1 + communityMenuButtons.length) %
        communityMenuButtons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = communityMenuButtons.length - 1;
    } else {
      return;
    }

    event.preventDefault();

    const nextButton =
      communityMenuButtons[nextIndex];

    if (nextButton.disabled) {
      return;
    }

    showCommunityMenu(
      nextButton.dataset.communityMenu
    );

    nextButton.focus({
      preventScroll: true
    });
  });
});

// 선택한 회원 탭 표시
function showMemberTab(tabName) {
  // 센터 커뮤니티를 벗어나면 재생 중인 영상 정지
  if (
    tabName !== "community" &&
    activeCommunityVideoArea
  ) {
    activeCommunityVideoArea
      .resetCommunityVideo();
  }
  const selectedPanel = memberTabPanels[tabName];

  if (!selectedPanel) {
    return;
  }

  // 센터 커뮤니티 진입 시 센터 소식을 기본으로 표시
  if (tabName === "community") {
    showCommunityMenu("news");
  }

  Object.entries(memberTabPanels).forEach(
    ([panelName, panel]) => {
      panel.hidden = panelName !== tabName;
    }
  );

  memberTabButtons.forEach((button) => {
    const isSelected =
      button.dataset.memberTab === tabName;

    button.classList.toggle("is-active", isSelected);
    button.setAttribute(
      "aria-selected",
      String(isSelected)
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// 하단 탭 버튼 클릭 기능
memberTabButtons.forEach((button) => {
  button.addEventListener("click", function () {
    showMemberTab(button.dataset.memberTab);
  });
});

// 유튜브 영상 주소 분석
function getYouTubeVideoData(videoUrl) {
  const trimmedUrl =
    String(videoUrl || "").trim();

  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl =
      new URL(trimmedUrl);

    const hostname =
      parsedUrl.hostname
        .toLowerCase()
        .replace(/^www\./, "")
        .replace(/^m\./, "");

    let videoId = "";
    let isShorts = false;

    if (hostname === "youtu.be") {
      videoId =
        parsedUrl.pathname
          .split("/")
          .filter(Boolean)[0] || "";
    } else if (
      hostname === "youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      const pathParts =
        parsedUrl.pathname
          .split("/")
          .filter(Boolean);

      if (pathParts[0] === "shorts") {
        videoId = pathParts[1] || "";
        isShorts = true;
      } else if (
        pathParts[0] === "embed" ||
        pathParts[0] === "live"
      ) {
        videoId = pathParts[1] || "";
      } else {
        videoId =
          parsedUrl.searchParams.get("v") || "";
      }
    } else {
      return null;
    }

    if (
      !/^[a-zA-Z0-9_-]{11}$/.test(videoId)
    ) {
      return null;
    }

    return {
      videoId,
      isShorts,
      originalUrl: trimmedUrl,
      thumbnailUrl:
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      embedUrl:
        `https://www.youtube-nocookie.com/embed/${videoId}` +
        "?playsinline=1&rel=0"
    };
  } catch (urlError) {
    return null;
  }
}

let activeCommunityVideoArea = null;

// 클릭할 때만 유튜브 플레이어 만들기
function createCommunityVideoFacade(
  videoUrl,
  videoTitle
) {
  const videoData =
    getYouTubeVideoData(videoUrl);

  if (!videoData) {
    return null;
  }

  const videoArea =
    document.createElement("div");

  videoArea.className =
    "community-video-area";

  if (videoData.isShorts) {
    videoArea.classList.add(
      "is-shorts"
    );
  }

  const videoFacade =
    document.createElement("button");

  videoFacade.type = "button";
  videoFacade.className =
    "community-video-facade";

  videoFacade.setAttribute(
    "aria-label",
    `${videoTitle || "센터 소식"} 영상 재생`
  );

  const thumbnail =
    document.createElement("img");

  thumbnail.className =
    "community-video-thumbnail";

  thumbnail.src =
    videoData.thumbnailUrl;

  thumbnail.alt =
    `${videoTitle || "센터 소식"} 영상 미리보기`;

  thumbnail.loading = "lazy";
  thumbnail.decoding = "async";
  thumbnail.draggable = false;

  const playButton =
    document.createElement("span");

  playButton.className =
    "community-video-play-button";

  playButton.textContent = "▶";

  const playText =
    document.createElement("span");

  playText.className =
    "community-video-play-text";

  playText.textContent =
    "영상 재생";

  videoFacade.append(
    thumbnail,
    playButton,
    playText
  );

  videoArea.append(videoFacade);

  // 다른 영상이 재생되면 이전 영상은 다시 썸네일로 변경
  videoArea.resetCommunityVideo =
    function () {
      videoArea.replaceChildren(
        videoFacade
      );

      if (
        activeCommunityVideoArea ===
        videoArea
      ) {
        activeCommunityVideoArea = null;
      }
    };

  videoFacade.addEventListener(
    "click",
    function () {
      if (
        activeCommunityVideoArea &&
        activeCommunityVideoArea !==
        videoArea
      ) {
        activeCommunityVideoArea
          .resetCommunityVideo();
      }

      const videoFrame =
        document.createElement("iframe");

      videoFrame.className =
        "community-video-frame";

      videoFrame.src =
        `${videoData.embedUrl}&autoplay=1`;

      videoFrame.title =
        `${videoTitle || "센터 소식"} 유튜브 영상`;

      videoFrame.loading = "lazy";

      videoFrame.allow =
        "accelerometer; autoplay; " +
        "clipboard-write; encrypted-media; " +
        "gyroscope; picture-in-picture; web-share";

      videoFrame.referrerPolicy =
        "strict-origin-when-cross-origin";

      videoFrame.allowFullscreen = true;

      videoArea.replaceChildren(
        videoFrame
      );

      activeCommunityVideoArea =
        videoArea;
    }
  );

  return videoArea;
}

// 센터 소식 이미지 캐러셀 만들기
function createCommunityImageCarousel(
  postImages,
  postTitle
) {
  const carouselArea =
    document.createElement("div");

  carouselArea.className =
    "community-carousel-area";

  const imageCarousel =
    document.createElement("div");

  imageCarousel.className =
    "community-image-carousel";

  imageCarousel.setAttribute(
    "aria-label",
    `${postTitle} 이미지`
  );

  postImages.forEach(
    function (image, index) {
      const imageSlide =
        document.createElement("div");

      imageSlide.className =
        "community-image-slide";

      const postImage =
        document.createElement("img");

      postImage.src = image.signedUrl;
      postImage.alt =
        image.alt_text ||
        `${postTitle} 이미지 ${index + 1}`;

      postImage.draggable = false;

      imageSlide.append(postImage);
      imageCarousel.append(imageSlide);
    }
  );

  carouselArea.append(imageCarousel);

  // 이미지가 한 장이면 조작 버튼을 만들지 않음
  if (postImages.length <= 1) {
    return carouselArea;
  }

  imageCarousel.classList.add(
    "has-multiple-images"
  );

  const carouselControls =
    document.createElement("div");

  carouselControls.className =
    "community-carousel-controls";

  const previousButton =
    document.createElement("button");

  previousButton.type = "button";
  previousButton.className =
    "community-carousel-button";
  previousButton.textContent = "‹";
  previousButton.setAttribute(
    "aria-label",
    "이전 사진 보기"
  );

  const dotContainer =
    document.createElement("div");

  dotContainer.className =
    "community-carousel-dots";

  const nextButton =
    document.createElement("button");

  nextButton.type = "button";
  nextButton.className =
    "community-carousel-button";
  nextButton.textContent = "›";
  nextButton.setAttribute(
    "aria-label",
    "다음 사진 보기"
  );

  const indicatorDots =
    postImages.map(
      function (_, index) {
        const dot =
          document.createElement("button");

        dot.type = "button";
        dot.className =
          "community-carousel-dot";

        dot.setAttribute(
          "aria-label",
          `${index + 1}번 사진 보기`
        );

        dotContainer.append(dot);

        return dot;
      }
    );

  let currentSlideIndex = 0;

  function updateCarouselControls(index) {
    currentSlideIndex = Math.max(
      0,
      Math.min(
        index,
        postImages.length - 1
      )
    );

    previousButton.disabled =
      currentSlideIndex === 0;

    nextButton.disabled =
      currentSlideIndex ===
      postImages.length - 1;

    indicatorDots.forEach(
      function (dot, dotIndex) {
        const isCurrent =
          dotIndex === currentSlideIndex;

        dot.classList.toggle(
          "is-active",
          isCurrent
        );

        dot.setAttribute(
          "aria-current",
          isCurrent ? "true" : "false"
        );
      }
    );
  }

  function moveToSlide(index) {
    const nextIndex = Math.max(
      0,
      Math.min(
        index,
        postImages.length - 1
      )
    );

    imageCarousel.scrollTo({
      left:
        imageCarousel.clientWidth *
        nextIndex,
      behavior: "smooth"
    });

    updateCarouselControls(nextIndex);
  }

  previousButton.addEventListener(
    "click",
    function () {
      moveToSlide(
        currentSlideIndex - 1
      );
    }
  );

  nextButton.addEventListener(
    "click",
    function () {
      moveToSlide(
        currentSlideIndex + 1
      );
    }
  );

  indicatorDots.forEach(
    function (dot, index) {
      dot.addEventListener(
        "click",
        function () {
          moveToSlide(index);
        }
      );
    }
  );

  // 손가락으로 넘겼을 때 점 표시 변경
  imageCarousel.addEventListener(
    "scroll",
    function () {
      if (!imageCarousel.clientWidth) {
        return;
      }

      const visibleIndex = Math.round(
        imageCarousel.scrollLeft /
        imageCarousel.clientWidth
      );

      updateCarouselControls(
        visibleIndex
      );
    }
  );

  // PC 마우스 드래그 지원
  let isMouseDragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;

  imageCarousel.addEventListener(
    "pointerdown",
    function (event) {
      if (
        event.pointerType !== "mouse" ||
        event.button !== 0
      ) {
        return;
      }

      isMouseDragging = true;
      dragStartX = event.clientX;
      dragStartScrollLeft =
        imageCarousel.scrollLeft;

      imageCarousel.classList.add(
        "is-dragging"
      );

      imageCarousel.setPointerCapture(
        event.pointerId
      );

      event.preventDefault();
    }
  );

  imageCarousel.addEventListener(
    "pointermove",
    function (event) {
      if (!isMouseDragging) {
        return;
      }

      const movedDistance =
        event.clientX - dragStartX;

      imageCarousel.scrollLeft =
        dragStartScrollLeft -
        movedDistance;

      event.preventDefault();
    }
  );

  function finishMouseDrag(event) {
    if (!isMouseDragging) {
      return;
    }

    isMouseDragging = false;

    imageCarousel.classList.remove(
      "is-dragging"
    );

    const nearestIndex = Math.round(
      imageCarousel.scrollLeft /
      imageCarousel.clientWidth
    );

    moveToSlide(nearestIndex);

    if (
      imageCarousel.hasPointerCapture(
        event.pointerId
      )
    ) {
      imageCarousel.releasePointerCapture(
        event.pointerId
      );
    }
  }

  imageCarousel.addEventListener(
    "pointerup",
    finishMouseDrag
  );

  imageCarousel.addEventListener(
    "pointercancel",
    finishMouseDrag
  );

  carouselControls.append(
    previousButton,
    dotContainer,
    nextButton
  );

  carouselArea.append(
    carouselControls
  );

  updateCarouselControls(0);

  return carouselArea;
}

// 이미지 주소의 일시적인 서명값 대신 실제 이미지 정보로 변경 여부 비교
function getCommunityImagesKey(images) {
  return JSON.stringify(images.map(function (image) {
    return [image.id, image.storage_path, image.alt_text || "", image.sort_order];
  }));
}

function createMemberCommunityCard() {
  const card = document.createElement("article");
  card.className = "community-post-card";
  const content = document.createElement("div");
  content.className = "community-post-content";
  const title = document.createElement("h2");
  title.className = "community-post-title";
  const body = document.createElement("p");
  body.className = "community-post-body";
  const date = document.createElement("time");
  date.className = "community-post-date";
  content.append(title, body, date);
  card.append(content);
  const separator = document.createElement("div");
  separator.className = "content-list-separator";
  separator.setAttribute("aria-hidden", "true");
  return { card, content, title, body, date, separator,
    imageArea: null, videoArea: null, imagesKey: null, videoUrl: null, post: null };
}

function updateMemberCommunityCard(entry, post) {
  const previous = entry.post;
  if (!previous || previous.title !== post.title) entry.title.textContent = post.title;
  if (!previous || previous.body !== post.body) {
    entry.body.replaceChildren();
    appendTextWithLinks(entry.body, post.body || "");
  }
  if (!previous || previous.published_at !== post.published_at) {
    entry.date.dateTime = post.published_at || "";
    const date = new Date(post.published_at);
    entry.date.textContent = Number.isNaN(date.getTime()) ? "" :
      new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
  }
  const images = post.community_post_images || [];
  const imagesKey = getCommunityImagesKey(images);
  if (entry.imagesKey !== imagesKey) {
    const nextArea = images.length ? createCommunityImageCarousel(images, post.title) : null;
    if (entry.imageArea) entry.imageArea.remove();
    entry.imageArea = nextArea;
    if (nextArea) entry.card.insertBefore(nextArea, entry.card.firstChild);
    entry.imagesKey = imagesKey;
  } else if (previous && previous.title !== post.title && entry.imageArea) {
    entry.imageArea.querySelector(".community-image-carousel").setAttribute("aria-label", `${post.title} 이미지`);
    entry.imageArea.querySelectorAll("img").forEach(function (image, index) {
      image.alt = images[index].alt_text || `${post.title} 이미지 ${index + 1}`;
    });
  }
  const videoUrl = post.video_url || "";
  if (entry.videoUrl !== videoUrl) {
    if (entry.videoArea) {
      if (activeCommunityVideoArea === entry.videoArea) entry.videoArea.resetCommunityVideo();
      entry.videoArea.remove();
    }
    entry.videoArea = createCommunityVideoFacade(videoUrl, post.title);
    if (entry.videoArea) entry.card.insertBefore(entry.videoArea, entry.content);
    entry.videoUrl = videoUrl;
  } else if (entry.videoArea && previous && previous.title !== post.title) {
    const facade = entry.videoArea.querySelector("button");
    const thumbnail = entry.videoArea.querySelector("img");
    const frame = entry.videoArea.querySelector("iframe");
    if (facade) facade.setAttribute("aria-label", `${post.title} 영상 재생`);
    if (thumbnail) thumbnail.alt = `${post.title} 영상 미리보기`;
    if (frame) frame.title = `${post.title} 유튜브 영상`;
  }
  entry.post = post;
}

// 재생 중인 iframe의 부모는 떼었다 붙이지 않고, 주변 카드만 재배치합니다.
function reconcileCommunityNodes(nodes, protectedCard) {
  const wanted = new Set(nodes);
  Array.from(communityPostList.children).forEach(function (node) {
    if (!wanted.has(node)) node.remove();
  });
  const pivot = nodes.indexOf(protectedCard);
  function placeReverse(from, to, anchor) {
    for (let index = from; index >= to; index -= 1) {
      const node = nodes[index];
      if (node.parentNode !== communityPostList || node.nextSibling !== anchor) {
        communityPostList.insertBefore(node, anchor);
      }
      anchor = node;
    }
  }
  if (pivot >= 0 && protectedCard.parentNode === communityPostList) {
    placeReverse(nodes.length - 1, pivot + 1, null);
    placeReverse(pivot - 1, 0, protectedCard);
  } else {
    placeReverse(nodes.length - 1, 0, null);
  }
}

// 기존 목록을 비우지 않고 수정·이동·삭제된 부분만 반영
function renderCommunityPosts(posts) {
  const wantedIds = new Set(posts.map(function (post) { return String(post.id); }));
  const visible = !appScreen.hidden && !memberTabPanels.community.hidden && !communityPostList.hidden;
  const scrollLeft = window.scrollX;
  const scrollTop = window.scrollY;
  let anchor = null;
  let anchorTop = 0;
  if (visible && communityPostList.getBoundingClientRect().top < 0) {
    const survivor = Array.from(communityPostList.children).find(function (card) {
      return wantedIds.has(card.dataset.communityPostId) && card.getBoundingClientRect().bottom > 0;
    });
    if (survivor) { anchor = survivor; anchorTop = survivor.getBoundingClientRect().top; }
  }
  const nodes = [];
  posts.forEach(function (post, index) {
    const id = String(post.id);
    let entry = memberCommunityCards.get(id);
    if (!entry) {
      entry = createMemberCommunityCard();
      entry.card.dataset.communityPostId = id;
      memberCommunityCards.set(id, entry);
    }
    updateMemberCommunityCard(entry, post);
    if (index > 0) nodes.push(entry.separator);
    nodes.push(entry.card);
  });
  memberCommunityCards.forEach(function (entry, id) {
    if (wantedIds.has(id)) return;
    if (activeCommunityVideoArea && entry.card.contains(activeCommunityVideoArea)) {
      activeCommunityVideoArea.resetCommunityVideo();
    }
    memberCommunityCards.delete(id);
  });
  if (!posts.length) {
    communityStatusMessage.textContent = "아직 등록된 센터 소식이 없습니다.";
    nodes.push(communityStatusMessage);
  }
  const protectedCard = activeCommunityVideoArea ?
    activeCommunityVideoArea.closest(".community-post-card") : null;
  reconcileCommunityNodes(nodes, protectedCard);
  if (visible) {
    const top = anchor && anchor.isConnected ?
      window.scrollY + anchor.getBoundingClientRect().top - anchorTop : scrollTop;
    if (Math.abs(window.scrollY - top) > 0.5 || window.scrollX !== scrollLeft) {
      window.scrollTo({ left: scrollLeft, top: top, behavior: "instant" });
    }
  }
}

function preloadCommunityImage(url) {
  return new Promise(function (resolve) {
    const image = new Image();
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve();
    }
    const timer = setTimeout(finish, 8000);
    image.onload = finish;
    image.onerror = finish;
    image.src = url;
  });
}

// 자동 갱신 중에는 로딩 문구나 빈 목록으로 기존 화면을 교체하지 않습니다.
async function loadCommunityPosts(preserveCurrentList = false) {
  const requestId = ++communityLoadRequestId;
  const isCurrent = function () { return requestId === communityLoadRequestId && !appScreen.hidden; };
  if (!preserveCurrentList && memberCommunityCards.size === 0) {
    communityStatusMessage.textContent = "센터 소식을 불러오고 있습니다.";
    communityPostList.replaceChildren(communityStatusMessage);
  }
  try {
    const { data: posts, error } = await supabaseClient.from("community_posts").select(`
      id, title, body, video_url, display_order, published_at,
      community_post_images (id, storage_path, alt_text, sort_order)
    `).eq("is_published", true)
      .order("display_order", { ascending: true })
      .order("published_at", { ascending: false })
      .order("id", { ascending: true });
    if (!isCurrent()) return;
    if (error) throw error;
    const prepared = await Promise.all((posts || []).map(async function (post) {
      const images = [...(post.community_post_images || [])].sort(function (a, b) {
        return a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id));
      });
      const existing = memberCommunityCards.get(String(post.id));
      // 순서만 바뀐 경우에는 사진 주소를 다시 발급하거나 이미지를 다시 만들지 않습니다.
      if (existing && existing.imagesKey === getCommunityImagesKey(images)) {
        return { ...post, community_post_images: existing.post.community_post_images };
      }
      const oldImages = existing ? existing.post.community_post_images : [];
      const readyImages = await Promise.all(images.map(async function (image) {
        const cached = oldImages.find(function (old) {
          return old.storage_path === image.storage_path && old.signedUrlExpiresAt > Date.now();
        });
        if (cached) return { ...image, signedUrl: cached.signedUrl, signedUrlExpiresAt: cached.signedUrlExpiresAt };
        const { data, error: imageError } = await supabaseClient.storage.from("community-images")
          .createSignedUrl(image.storage_path, 3600);
        if (imageError) throw imageError;
        if (!data || !data.signedUrl) throw new Error("센터 소식 사진 주소를 불러오지 못했습니다.");
        await preloadCommunityImage(data.signedUrl);
        return { ...image, signedUrl: data.signedUrl, signedUrlExpiresAt: Date.now() + 3300000 };
      }));
      return { ...post, community_post_images: readyImages };
    }));
    if (!isCurrent()) return;
    renderCommunityPosts(prepared);
  } catch (error) {
    if (!isCurrent()) return;
    console.error("센터 소식 불러오기 실패:", error);
    if (memberCommunityCards.size === 0) {
      communityStatusMessage.textContent = "센터 소식을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      communityPostList.replaceChildren(communityStatusMessage);
    }
  }
}


// 운동 기록 캘린더 요소
const workoutCalendarMonthLabel =
  document.querySelector("#workoutCalendarMonthLabel");

const workoutCalendarDays =
  document.querySelector("#workoutCalendarDays");

const previousWorkoutMonthButton =
  document.querySelector("#previousWorkoutMonthButton");

const nextWorkoutMonthButton =
  document.querySelector("#nextWorkoutMonthButton");

const showAllWorkoutRecordsButton =
  document.querySelector(
    "#showAllWorkoutRecordsButton"
  );

// 현재 캘린더에 표시할 월
let visibleWorkoutMonth = new Date();
visibleWorkoutMonth.setDate(1);

// 나중에 Supabase에서 불러올 기록 날짜
let workoutRecordDates = new Set();

// 운동 기록을 표시할 영역
const workoutRecordList =
  document.querySelector("#workoutRecordList");

const emptyWorkoutRecordMessage =
  document.querySelector("#emptyWorkoutRecordMessage");

// 서버에서 불러온 운동 기록
let workoutRecords = [];

// 현재 기록을 조회하는 회원
let workoutRecordsUserId = "";

// 이전 조회 결과가 뒤늦게 표시되는 것을 방지
let workoutRecordsRequestId = 0;

// 사진 자체 대신 유효한 주소만 보관합니다. 새로고침에도 같은 주소를 재사용합니다.
const WORKOUT_PHOTO_URL_CACHE_KEY = "workoutPhotoUrlCache";
const WORKOUT_PHOTO_URL_TTL_SECONDS = 3600;
const WORKOUT_PHOTO_URL_CACHE_LIMIT = 100;
const workoutPhotoUrlCache = new Map();

function persistWorkoutPhotoUrlCache() {
  try {
    sessionStorage.setItem(WORKOUT_PHOTO_URL_CACHE_KEY, JSON.stringify({
      userId: workoutRecordsUserId,
      entries: [...workoutPhotoUrlCache]
    }));
  } catch (error) {
    // 저장 공간을 사용할 수 없어도 메모리에서 재사용합니다.
  }
}

function restoreWorkoutPhotoUrlCache(userId) {
  workoutPhotoUrlCache.clear();
  try {
    const saved = JSON.parse(sessionStorage.getItem(WORKOUT_PHOTO_URL_CACHE_KEY));
    if (saved?.userId === userId && Array.isArray(saved.entries)) {
      for (const [path, entry] of saved.entries.slice(-WORKOUT_PHOTO_URL_CACHE_LIMIT)) {
        if (typeof path === "string" && typeof entry?.url === "string" &&
            entry.expiresAt > Date.now() + 60000) {
          workoutPhotoUrlCache.set(path, entry);
        }
      }
    }
  } catch (error) {
    workoutPhotoUrlCache.clear();
  }
  persistWorkoutPhotoUrlCache();
}

function rememberWorkoutPhotoUrl(path, url, expiresAt) {
  for (const [cachedPath, entry] of workoutPhotoUrlCache) {
    if (entry.expiresAt <= Date.now() + 60000) workoutPhotoUrlCache.delete(cachedPath);
  }
  workoutPhotoUrlCache.delete(path);
  workoutPhotoUrlCache.set(path, { url, expiresAt });
  while (workoutPhotoUrlCache.size > WORKOUT_PHOTO_URL_CACHE_LIMIT) {
    workoutPhotoUrlCache.delete(workoutPhotoUrlCache.keys().next().value);
  }
  persistWorkoutPhotoUrlCache();
}

// 사용자가 선택한 날짜
let selectedWorkoutDate = "";

// 처음 들어올 때 최근 운동 기록 날짜를 자동 선택
let shouldSelectLatestWorkoutDate = true;

// 날짜를 2026-09-22 형태로 만들기
function makeWorkoutDateKey(year, monthIndex, day) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const date = String(day).padStart(2, "0");

  return `${year}-${month}-${date}`;
}
// 운동 기록의 날짜를 2026-09-22 형태로 변환
function getWorkoutRecordDateKey(takenAt) {
  const recordDate = new Date(takenAt);

  return makeWorkoutDateKey(
    recordDate.getFullYear(),
    recordDate.getMonth(),
    recordDate.getDate()
  );
}

// 사진별로 한 번만 자동 복구합니다. 메모·날짜와 사진 로딩은 분리합니다.
function createWorkoutRecordPhoto(record, isFirstPhoto = false) {
  const ownerId = workoutRecordsUserId;
  const requestId = workoutRecordsRequestId;
  let automaticRetryUsed = false;
  let requestingUrl = false;

  const area = document.createElement("div");
  area.className = "workout-record-photo-area is-loading";

  const image = document.createElement("img");
  image.className = "workout-record-photo";
  image.alt = record.caption || "운동 기록 사진";
  image.loading = isFirstPhoto ? "eager" : "lazy";
  image.fetchPriority = isFirstPhoto ? "high" : "auto";

  const status = document.createElement("div");
  status.className = "workout-record-photo-status";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.className = "workout-record-photo-retry";
  retryButton.textContent = "사진 다시 불러오기";
  status.append(message, retryButton);
  area.append(image, status);

  function isCurrent() {
    return area.isConnected && !appScreen.hidden &&
      ownerId === workoutRecordsUserId &&
      requestId === workoutRecordsRequestId;
  }

  function showState(state) {
    area.classList.toggle("is-loading", state === "loading");
    area.classList.toggle("is-error", state === "error");
    area.setAttribute("aria-busy", String(state === "loading"));
    status.hidden = state === "ready";
    retryButton.hidden = state !== "error";
    retryButton.disabled = state === "loading";
    message.textContent = state === "error"
      ? "사진을 불러오지 못했어요."
      : state === "loading" ? "사진 불러오는 중…" : "";
  }

  function handlePhotoError() {
    if (!isCurrent() || requestingUrl) return;
    if (workoutPhotoUrlCache.delete(record.photo_path)) persistWorkoutPhotoUrlCache();
    if (automaticRetryUsed) {
      showState("error");
      return;
    }
    automaticRetryUsed = true;
    loadFreshPhotoUrl(true);
  }

  async function loadFreshPhotoUrl(isRetry = false) {
    if (!isCurrent() || requestingUrl) return;
    requestingUrl = true;
    showState("loading");
    let failed = false;
    const requestedAt = Date.now();
    if (isRetry && workoutPhotoUrlCache.delete(record.photo_path)) persistWorkoutPhotoUrlCache();
    try {
      const { data, error } = await supabaseClient.storage
        .from("workout-photos")
        .createSignedUrl(record.photo_path, WORKOUT_PHOTO_URL_TTL_SECONDS);
      if (!isCurrent()) return;
      if (error || !data?.signedUrl) {
        throw error || new Error("사진 주소를 불러오지 못했습니다.");
      }
      const url = new URL(data.signedUrl, window.location.href);
      // 같은 초에 같은 주소가 발급되어도 실패한 이미지 캐시를 재사용하지 않습니다.
      if (isRetry) url.searchParams.set("cacheNonce", Date.now().toString(36));
      rememberWorkoutPhotoUrl(record.photo_path, url.href,
        requestedAt + WORKOUT_PHOTO_URL_TTL_SECONDS * 1000);
      image.src = url.href;
    } catch (error) {
      failed = true;
    } finally {
      requestingUrl = false;
    }
    if (failed) handlePhotoError();
  }

  image.addEventListener("load", function () {
    if (isCurrent()) showState("ready");
  });
  image.addEventListener("error", handlePhotoError);
  retryButton.addEventListener("click", function () {
    if (retryButton.disabled) return;
    // 수동 버튼 한 번에 한 번만 요청합니다.
    automaticRetryUsed = true;
    loadFreshPhotoUrl(true);
  });

  showState("loading");
  // 카드가 목록에 붙은 후 시작해야 계정 전환·목록 재표시를 구분할 수 있습니다.
  queueMicrotask(function () {
    if (!isCurrent()) return;
    const cached = workoutPhotoUrlCache.get(record.photo_path);
    if (cached && cached.expiresAt > Date.now() + 60000) image.src = cached.url;
    else loadFreshPhotoUrl();
  });
  return area;
}

// 저장된 운동 기록 목록 표시
function renderWorkoutRecords() {
  workoutRecordList.innerHTML = "";

  showAllWorkoutRecordsButton.hidden =
    !selectedWorkoutDate ||
    workoutRecords.length === 0;

  const recordsToShow = selectedWorkoutDate
    ? workoutRecords.filter((record) => {
      return (
        getWorkoutRecordDateKey(record.taken_at) ===
        selectedWorkoutDate
      );
    })
    : workoutRecords;

  if (recordsToShow.length === 0) {
    emptyWorkoutRecordMessage.textContent =
      selectedWorkoutDate
        ? "선택한 날짜에는 저장된 운동 기록이 없습니다."
        : "아직 저장된 운동 기록이 없습니다.";

    workoutRecordList.append(
      emptyWorkoutRecordMessage
    );

    return;
  }

  recordsToShow.forEach((record, recordIndex) => {
    const recordCard =
      document.createElement("article");

    recordCard.className =
      "workout-record-card";

    const recordPhotoArea = createWorkoutRecordPhoto(record, recordIndex === 0);

    const recordCaption =
      document.createElement("p");

    recordCaption.className =
      "workout-record-caption";

    recordCaption.textContent =
      record.caption || "";

    const recordDate =
      document.createElement("time");

    recordDate.className =
      "workout-record-date";

    recordDate.dateTime = record.taken_at;

    recordDate.textContent =
      new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(record.taken_at));

    const captionEditor =
      document.createElement("textarea");

    captionEditor.className =
      "workout-record-caption-editor";
    captionEditor.value = record.caption || "";
    captionEditor.maxLength = 120;
    captionEditor.rows = 3;
    captionEditor.hidden = true;
    captionEditor.setAttribute(
      "aria-label",
      "운동 기록 메모 수정"
    );

    const editActions =
      document.createElement("div");

    editActions.className =
      "workout-record-edit-actions";
    editActions.hidden = true;

    const cancelEditButton =
      document.createElement("button");

    cancelEditButton.type = "button";
    cancelEditButton.className =
      "cancel-workout-caption-button";
    cancelEditButton.textContent = "취소";

    const saveEditButton =
      document.createElement("button");

    saveEditButton.type = "button";
    saveEditButton.className =
      "save-workout-caption-button";
    saveEditButton.textContent = "저장";

    editActions.append(
      cancelEditButton,
      saveEditButton
    );

    const recordFooter =
      document.createElement("div");

    recordFooter.className =
      "workout-record-footer";

    const recordButtons =
      document.createElement("div");

    recordButtons.className =
      "workout-record-buttons";

    const editButton =
      document.createElement("button");

    editButton.type = "button";
    editButton.className =
      "edit-workout-record-button";
    editButton.textContent = "수정";

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className =
      "delete-workout-record-button";
    deleteButton.textContent = "삭제하기";

    deleteButton.setAttribute(
      "aria-label",
      "이 운동 기록 삭제하기"
    );

    editButton.addEventListener(
      "click",
      function () {
        captionEditor.value =
          record.caption || "";

        recordCaption.hidden = true;
        recordFooter.hidden = true;
        captionEditor.hidden = false;
        editActions.hidden = false;

        captionEditor.focus();
        captionEditor.setSelectionRange(
          captionEditor.value.length,
          captionEditor.value.length
        );
      }
    );

    cancelEditButton.addEventListener(
      "click",
      function () {
        captionEditor.value =
          record.caption || "";

        captionEditor.hidden = true;
        editActions.hidden = true;
        recordCaption.hidden = false;
        recordFooter.hidden = false;
      }
    );

    saveEditButton.addEventListener(
      "click",
      async function () {
        await updateWorkoutRecordCaption(
          record,
          captionEditor.value,
          saveEditButton
        );
      }
    );

    deleteButton.addEventListener(
      "click",
      function () {
        deleteWorkoutRecord(
          record,
          deleteButton
        );
      }
    );

    recordButtons.append(
      editButton,
      deleteButton
    );

    recordFooter.append(
      recordDate,
      recordButtons
    );

    recordCard.append(
      recordPhotoArea,
      recordCaption,
      captionEditor,
      editActions,
      recordFooter
    );

    if (recordIndex > 0) {
      const recordSeparator =
        document.createElement("div");

      recordSeparator.className =
        "content-list-separator";

      recordSeparator.setAttribute(
        "aria-hidden",
        "true"
      );

      workoutRecordList.append(
        recordSeparator
      );
    }

    workoutRecordList.append(recordCard);
  });
}

// 로그인한 회원의 운동 기록 불러오기
async function loadWorkoutRecords(userId) {
  const currentRequestId =
    ++workoutRecordsRequestId;

  if (workoutRecordsUserId !== userId) {
    workoutRecordsUserId = userId;
    restoreWorkoutPhotoUrlCache(userId);
    workoutRecords = [];
    workoutRecordDates = new Set();
    renderWorkoutCalendar();
  }
  workoutRecordsUserId = userId;

  workoutRecordList.innerHTML = "";
  emptyWorkoutRecordMessage.textContent =
    "운동 기록을 불러오는 중입니다.";

  workoutRecordList.append(
    emptyWorkoutRecordMessage
  );

  const {
    data: records,
    error: recordsError
  } = await supabaseClient
    .from("workout_records")
    .select(
      "id, photo_path, caption, taken_at"
    )
    .eq("user_id", userId)
    .order("taken_at", {
      ascending: false
    });

  if (
    currentRequestId !==
    workoutRecordsRequestId
  ) {
    return;
  }

  if (recordsError) {
    console.error(
      "운동 기록 불러오기 실패:",
      recordsError
    );

    workoutRecords = [];
    workoutRecordDates = new Set();

    emptyWorkoutRecordMessage.textContent =
      "운동 기록을 불러오지 못했습니다.";

    renderWorkoutCalendar();
    return;
  }

  // 사진 로딩과 별개로 모든 기록의 메모·날짜를 먼저 표시합니다.
  workoutRecords = records || [];
  const currentPhotoPaths = new Set(workoutRecords.map(record => record.photo_path));
  let removedCachedUrl = false;
  for (const path of workoutPhotoUrlCache.keys()) {
    if (!currentPhotoPaths.has(path)) {
      workoutPhotoUrlCache.delete(path);
      removedCachedUrl = true;
    }
  }
  if (removedCachedUrl) persistWorkoutPhotoUrlCache();

  if (
    shouldSelectLatestWorkoutDate &&
    workoutRecords.length > 0
  ) {
    const latestWorkoutDate =
      new Date(workoutRecords[0].taken_at);

    selectedWorkoutDate =
      getWorkoutRecordDateKey(
        workoutRecords[0].taken_at
      );

    visibleWorkoutMonth =
      new Date(
        latestWorkoutDate.getFullYear(),
        latestWorkoutDate.getMonth(),
        1
      );
  }

  shouldSelectLatestWorkoutDate = false;

  workoutRecordDates = new Set(
    workoutRecords.map((record) => {
      return getWorkoutRecordDateKey(
        record.taken_at
      );
    })
  );

  renderWorkoutCalendar();
  renderWorkoutRecords();
}

// 회원 본인의 운동 기록 삭제
async function deleteWorkoutRecord(
  record,
  deleteButton
) {
  const shouldDelete = window.confirm(
    "이 운동 기록을 삭제할까요?\n삭제한 사진은 복구할 수 없습니다."
  );

  if (!shouldDelete) {
    return;
  }

  deleteButton.disabled = true;
  deleteButton.textContent = "삭제 중...";

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error(
        "로그인 정보를 확인할 수 없습니다."
      );
    }

    const {
      data: deletedRecords,
      error: recordDeleteError
    } = await supabaseClient
      .from("workout_records")
      .delete()
      .eq("id", record.id)
      .eq("user_id", user.id)
      .select("id");

    if (recordDeleteError) {
      throw recordDeleteError;
    }

    if (
      !deletedRecords ||
      deletedRecords.length === 0
    ) {
      throw new Error(
        "삭제할 운동 기록을 찾을 수 없습니다."
      );
    }

    const { error: photoDeleteError } =
      await supabaseClient.storage
        .from("workout-photos")
        .remove([record.photo_path]);

    if (photoDeleteError) {
      console.error(
        "운동 기록 사진 파일 삭제 실패:",
        photoDeleteError
      );
    }

    await loadWorkoutRecords(user.id);

  } catch (deleteError) {
    console.error(
      "운동 기록 삭제 실패:",
      deleteError
    );

    alert(
      `운동 기록을 삭제하지 못했습니다.\n${deleteError.message ||
      "알 수 없는 오류"
      }`
    );

    deleteButton.disabled = false;
    deleteButton.textContent = "삭제하기";
  }
}

// 회원 본인의 운동 기록 메모 수정
async function updateWorkoutRecordCaption(
  record,
  newCaption,
  saveButton
) {
  saveButton.disabled = true;
  saveButton.textContent = "저장 중...";

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error(
        "로그인 정보를 확인할 수 없습니다."
      );
    }

    const {
      data: updatedRecords,
      error: updateError
    } = await supabaseClient
      .from("workout_records")
      .update({
        caption: newCaption.trim()
      })
      .eq("id", record.id)
      .eq("user_id", user.id)
      .select("id");

    if (updateError) {
      throw updateError;
    }

    if (
      !updatedRecords ||
      updatedRecords.length === 0
    ) {
      throw new Error(
        "수정할 운동 기록을 찾을 수 없습니다."
      );
    }

    await loadWorkoutRecords(user.id);

  } catch (updateError) {
    console.error(
      "운동 기록 메모 수정 실패:",
      updateError
    );

    alert(
      `운동 기록을 수정하지 못했습니다.\n${updateError.message ||
      "알 수 없는 오류"
      }`
    );

    saveButton.disabled = false;
    saveButton.textContent = "저장";
  }
}

// 운동 기록 캘린더 그리기
function renderWorkoutCalendar() {
  const year = visibleWorkoutMonth.getFullYear();
  const monthIndex = visibleWorkoutMonth.getMonth();

  const firstWeekday =
    new Date(year, monthIndex, 1).getDay();

  const lastDate =
    new Date(year, monthIndex + 1, 0).getDate();

  const today = new Date();

  workoutCalendarMonthLabel.textContent =
    `${year}년 ${monthIndex + 1}월`;

  workoutCalendarDays.innerHTML = "";

  // 이번 달 1일 앞의 빈칸
  for (let index = 0; index < firstWeekday; index += 1) {
    const emptyCell = document.createElement("span");
    emptyCell.className = "workout-calendar-empty";
    emptyCell.setAttribute("aria-hidden", "true");

    workoutCalendarDays.append(emptyCell);
  }

  // 이번 달 날짜
  for (let day = 1; day <= lastDate; day += 1) {
    const dateKey =
      makeWorkoutDateKey(year, monthIndex, day);

    const dateButton = document.createElement("button");

    dateButton.type = "button";
    dateButton.className = "workout-calendar-day";
    dateButton.textContent = String(day);
    dateButton.dataset.date = dateKey;

    dateButton.setAttribute(
      "aria-label",
      `${year}년 ${monthIndex + 1}월 ${day}일`
    );

    const isToday =
      year === today.getFullYear() &&
      monthIndex === today.getMonth() &&
      day === today.getDate();

    if (isToday) {
      dateButton.classList.add("is-today");
    }

    if (workoutRecordDates.has(dateKey)) {
      dateButton.classList.add("has-record");
    }

    if (selectedWorkoutDate === dateKey) {
      dateButton.classList.add("is-selected");
    }

    dateButton.addEventListener("click", function () {
      selectedWorkoutDate =
        selectedWorkoutDate === dateKey
          ? ""
          : dateKey;

      renderWorkoutCalendar();
      renderWorkoutRecords();
    });

    workoutCalendarDays.append(dateButton);
  }
}

// 이전 달 보기
previousWorkoutMonthButton.addEventListener(
  "click",
  function () {
    visibleWorkoutMonth.setMonth(
      visibleWorkoutMonth.getMonth() - 1
    );

    selectedWorkoutDate = "";
    renderWorkoutCalendar();
    renderWorkoutRecords();
  }
);

// 다음 달 보기
nextWorkoutMonthButton.addEventListener(
  "click",
  function () {
    visibleWorkoutMonth.setMonth(
      visibleWorkoutMonth.getMonth() + 1
    );

    selectedWorkoutDate = "";
    renderWorkoutCalendar();
    renderWorkoutRecords();
  }
);

// 날짜 선택을 해제하고 전체 운동 기록 보기
showAllWorkoutRecordsButton.addEventListener(
  "click",
  function () {
    selectedWorkoutDate = "";

    renderWorkoutCalendar();
    renderWorkoutRecords();
  }
);

// 로그인할 때 이번 달로 초기화
function resetWorkoutCalendar() {
  visibleWorkoutMonth = new Date();
  visibleWorkoutMonth.setDate(1);
  selectedWorkoutDate = "";
  shouldSelectLatestWorkoutDate = true;

  renderWorkoutCalendar();
}

// 페이지가 처음 열렸을 때 달력 표시
renderWorkoutCalendar();
// 운동 기록 카메라 요소
const openWorkoutCameraButton =
  document.querySelector("#openWorkoutCameraButton");

const workoutNativeCameraInput =
  document.querySelector("#workoutNativeCameraInput");

const workoutCameraModal =
  document.querySelector("#workoutCameraModal");

const closeWorkoutCameraButton =
  document.querySelector("#closeWorkoutCameraButton");

const workoutCameraView =
  document.querySelector("#workoutCameraView");

const workoutCameraVideo =
  document.querySelector("#workoutCameraVideo");

const workoutCameraMessage =
  document.querySelector("#workoutCameraMessage");

const captureWorkoutPhotoButton =
  document.querySelector("#captureWorkoutPhotoButton");

const switchWorkoutCameraButton =
  document.querySelector("#switchWorkoutCameraButton");

const workoutPhotoComposer =
  document.querySelector("#workoutPhotoComposer");

const workoutPhotoCaption =
  document.querySelector("#workoutPhotoCaption");

const workoutRecordSaveMessage =
  document.querySelector("#workoutRecordSaveMessage");
const workoutCameraCanvas =
  document.querySelector("#workoutCameraCanvas");

const workoutPhotoPreview =
  document.querySelector("#workoutPhotoPreview");

const workoutPhotoDate =
  document.querySelector("#workoutPhotoDate");

const retakeWorkoutPhotoButton =
  document.querySelector("#retakeWorkoutPhotoButton");

const saveWorkoutRecordButton =
  document.querySelector("#saveWorkoutRecordButton");

// 현재 실행 중인 카메라 정보
let workoutCameraStream = null;
let workoutCameraFacingMode = "user";
let workoutCameraRequestId = 0;
let capturedWorkoutPhotoBlob = null;
let workoutPhotoPreviewUrl = "";
let workoutPhotoTakenAt = null;

// 촬영한 임시 사진 초기화
function clearCapturedWorkoutPhoto() {
  if (workoutPhotoPreviewUrl) {
    URL.revokeObjectURL(workoutPhotoPreviewUrl);
  }

  workoutPhotoPreviewUrl = "";
  capturedWorkoutPhotoBlob = null;
  workoutPhotoTakenAt = null;

  workoutPhotoPreview.removeAttribute("src");
  workoutPhotoCaption.value = "";
  workoutPhotoDate.textContent = "";
  workoutRecordSaveMessage.textContent = "";

  saveWorkoutRecordButton.disabled = false;
  saveWorkoutRecordButton.textContent = "기록 저장";
}

// 실행 중인 카메라 끄기
function stopWorkoutCamera() {
  workoutCameraRequestId += 1;

  if (workoutCameraStream) {
    workoutCameraStream
      .getTracks()
      .forEach((track) => track.stop());
  }

  workoutCameraStream = null;
  workoutCameraVideo.srcObject = null;
}

// 카메라 시작
async function startWorkoutCamera() {
  stopWorkoutCamera();

  const currentRequestId = workoutCameraRequestId;

  workoutCameraMessage.hidden = false;
  workoutCameraMessage.textContent =
    "카메라를 준비하고 있습니다.";

  captureWorkoutPhotoButton.disabled = true;
  switchWorkoutCameraButton.disabled = true;

  workoutCameraVideo.classList.toggle(
    "is-front-facing",
    workoutCameraFacingMode === "user"
  );

  try {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error("CAMERA_NOT_SUPPORTED");
    }

    const cameraStream =
      await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: {
            ideal: workoutCameraFacingMode
          },
          width: {
            ideal: 1200
          },
          height: {
            ideal: 1600
          },
          aspectRatio: {
            ideal: 3 / 4
          },
          resizeMode: "crop-and-scale"
        }
      });

    // 기다리는 동안 화면을 닫았거나 다른 카메라로 바꾼 경우
    if (
      currentRequestId !== workoutCameraRequestId ||
      workoutCameraModal.hidden
    ) {
      cameraStream
        .getTracks()
        .forEach((track) => track.stop());

      return;
    }

    workoutCameraStream = cameraStream;
    workoutCameraVideo.srcObject = cameraStream;

    await workoutCameraVideo.play();

    workoutCameraMessage.hidden = true;
    captureWorkoutPhotoButton.disabled = false;

  } catch (cameraError) {
    console.error("카메라 실행 실패:", cameraError);

    workoutCameraMessage.hidden = false;

    if (cameraError.name === "NotAllowedError") {
      workoutCameraMessage.textContent =
        "카메라 권한이 필요합니다. " +
        "브라우저 설정에서 카메라 사용을 허용해 주세요.";

    } else if (cameraError.name === "NotFoundError") {
      workoutCameraMessage.textContent =
        "사용할 수 있는 카메라를 찾지 못했습니다.";

    } else if (window.location.protocol === "file:") {
      workoutCameraMessage.textContent =
        "로컬 파일에서는 카메라가 제한될 수 있습니다. " +
        "GitHub Pages에 올린 앱에서 다시 확인해 주세요.";

    } else {
      workoutCameraMessage.textContent =
        "카메라를 실행하지 못했습니다. " +
        "잠시 후 다시 시도해 주세요.";
    }

  } finally {
    switchWorkoutCameraButton.disabled = false;
  }
}

// 카메라 화면 열기
async function openWorkoutCamera() {
  workoutCameraModal.hidden = false;
  workoutCameraView.hidden = false;
  workoutPhotoComposer.hidden = true;

  workoutRecordSaveMessage.textContent = "";

  document.body.classList.add("camera-open");

  workoutCameraFacingMode = "user";

  await startWorkoutCamera();
}

// 카메라 화면 닫기
function closeWorkoutCamera() {
  stopWorkoutCamera();
  clearCapturedWorkoutPhoto();

  workoutCameraModal.hidden = true;
  workoutCameraView.hidden = false;
  workoutPhotoComposer.hidden = true;

  document.body.classList.remove("camera-open");
}

// 전면·후면 카메라 전환
async function switchWorkoutCamera() {
  workoutCameraFacingMode =
    workoutCameraFacingMode === "user"
      ? "environment"
      : "user";

  await startWorkoutCamera();
}

// 운동 기록 사진 용량 최적화
async function optimizeWorkoutPhoto(
  originalFile
) {
  const maximumLength = 960;
  const webpQuality = 0.70;

  const sourceUrl =
    URL.createObjectURL(originalFile);

  try {
    const sourceImage =
      await new Promise(
        function (resolve, reject) {
          const image = new Image();

          image.onload = function () {
            resolve(image);
          };

          image.onerror = function () {
            reject(
              new Error(
                "촬영한 사진을 읽을 수 없습니다."
              )
            );
          };

          image.src = sourceUrl;
        }
      );

    const originalWidth =
      sourceImage.naturalWidth;

    const originalHeight =
      sourceImage.naturalHeight;

    if (
      !originalWidth ||
      !originalHeight
    ) {
      throw new Error(
        "사진 크기를 확인할 수 없습니다."
      );
    }

    const resizeRatio = Math.min(
      1,
      maximumLength /
      Math.max(
        originalWidth,
        originalHeight
      )
    );

    const outputWidth = Math.max(
      1,
      Math.round(
        originalWidth * resizeRatio
      )
    );

    const outputHeight = Math.max(
      1,
      Math.round(
        originalHeight * resizeRatio
      )
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const canvasContext =
      canvas.getContext("2d");

    if (!canvasContext) {
      throw new Error(
        "사진 최적화 기능을 사용할 수 없습니다."
      );
    }

    canvasContext.imageSmoothingEnabled =
      true;

    canvasContext.imageSmoothingQuality =
      "high";

    canvasContext.drawImage(
      sourceImage,
      0,
      0,
      outputWidth,
      outputHeight
    );

    const optimizedBlob =
      await new Promise(
        function (resolve) {
          canvas.toBlob(
            resolve,
            "image/webp",
            webpQuality
          );
        }
      );

    if (!optimizedBlob) {
      throw new Error(
        "사진을 WebP 형식으로 변환하지 못했습니다."
      );
    }

    console.log(
      "운동 기록 사진 최적화:",
      {
        originalKB: Math.round(
          originalFile.size / 1024
        ),
        optimizedKB: Math.round(
          optimizedBlob.size / 1024
        ),
        outputSize:
          `${outputWidth}×${outputHeight}`
      }
    );

    return optimizedBlob;

  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

// 현재 카메라 화면 촬영
async function captureWorkoutPhoto() {
  const sourceWidth = workoutCameraVideo.videoWidth;
  const sourceHeight = workoutCameraVideo.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    workoutCameraMessage.hidden = false;
    workoutCameraMessage.textContent =
      "카메라 준비가 끝난 뒤 다시 촬영해 주세요.";

    return;
  }

  captureWorkoutPhotoButton.disabled = true;

  try {
    const maximumSize = 960;

    const imageScale = Math.min(
      1,
      maximumSize / Math.max(sourceWidth, sourceHeight)
    );

    workoutCameraCanvas.width =
      Math.round(sourceWidth * imageScale);

    workoutCameraCanvas.height =
      Math.round(sourceHeight * imageScale);

    const drawingContext =
      workoutCameraCanvas.getContext("2d");

    drawingContext.save();

    // 전면 카메라는 화면에 보이는 방향대로 저장
    if (workoutCameraFacingMode === "user") {
      drawingContext.translate(
        workoutCameraCanvas.width,
        0
      );

      drawingContext.scale(-1, 1);
    }

    drawingContext.drawImage(
      workoutCameraVideo,
      0,
      0,
      workoutCameraCanvas.width,
      workoutCameraCanvas.height
    );

    drawingContext.restore();

    const photoBlob = await new Promise((resolve) => {
      workoutCameraCanvas.toBlob(
        resolve,
        "image/webp",
        0.70
      );
    });

    if (!photoBlob) {
      throw new Error("PHOTO_CREATION_FAILED");
    }

    clearCapturedWorkoutPhoto();

    capturedWorkoutPhotoBlob = photoBlob;
    workoutPhotoTakenAt = new Date();

    workoutPhotoPreviewUrl =
      URL.createObjectURL(photoBlob);

    workoutPhotoPreview.src =
      workoutPhotoPreviewUrl;

    workoutPhotoDate.textContent =
      new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(workoutPhotoTakenAt);

    stopWorkoutCamera();

    workoutCameraView.hidden = true;
    workoutPhotoComposer.hidden = false;

    workoutPhotoCaption.focus();

  } catch (photoError) {
    console.error("사진 촬영 실패:", photoError);

    workoutCameraMessage.hidden = false;
    workoutCameraMessage.textContent =
      "사진을 만들지 못했습니다. 다시 촬영해 주세요.";

  } finally {
    captureWorkoutPhotoButton.disabled = false;
  }
}

// 다시 찍기
function retakeWorkoutPhoto() {
  workoutNativeCameraInput.value = "";
  workoutNativeCameraInput.click();
}
async function saveWorkoutRecord() {
  if (
    !capturedWorkoutPhotoBlob ||
    !workoutPhotoTakenAt
  ) {
    workoutRecordSaveMessage.textContent =
      "저장할 사진이 없습니다.";
    return;
  }

  saveWorkoutRecordButton.disabled = true;
  saveWorkoutRecordButton.textContent = "저장 중...";
  workoutRecordSaveMessage.textContent =
    "운동 기록을 저장하고 있습니다.";

  let uploadedPhotoPath = "";

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error("로그인 정보를 확인할 수 없습니다.");
    }

    const photoMimeType =
      capturedWorkoutPhotoBlob.type || "image/jpeg";

    const extensionByMimeType = {
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif"
    };

    const photoExtension =
      extensionByMimeType[photoMimeType] || "jpg";

    const uniqueId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;

    uploadedPhotoPath =
      `${user.id}/${Date.now()}-${uniqueId}.${photoExtension}`;

    const { error: uploadError } =
      await supabaseClient.storage
        .from("workout-photos")
        .upload(
          uploadedPhotoPath,
          capturedWorkoutPhotoBlob,
          {
            contentType: photoMimeType,
            cacheControl: "31536000",
            upsert: false
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    const { error: recordError } =
      await supabaseClient
        .from("workout_records")
        .insert({
          user_id: user.id,
          photo_path: uploadedPhotoPath,
          caption:
            workoutPhotoCaption.value.trim(),
          taken_at:
            workoutPhotoTakenAt.toISOString()
        });

    if (recordError) {
      const { error: cleanupError } =
        await supabaseClient.storage
          .from("workout-photos")
          .remove([uploadedPhotoPath]);

      if (cleanupError) {
        console.error(
          "저장 실패 사진 정리 오류:",
          cleanupError
        );
      }

      throw recordError;
    }

    // 저장한 날짜의 달력과 기록 목록 새로고침
    visibleWorkoutMonth =
      new Date(workoutPhotoTakenAt);

    visibleWorkoutMonth.setDate(1);
    selectedWorkoutDate = "";

    await loadWorkoutRecords(user.id);
    workoutRecordSaveMessage.textContent =
      "운동 기록을 저장했습니다.";

    saveWorkoutRecordButton.textContent =
      "저장 완료";

    setTimeout(function () {
      closeWorkoutCamera();
    }, 800);

  } catch (saveError) {
    console.error(
      "운동 기록 저장 실패:",
      saveError
    );

    workoutRecordSaveMessage.textContent =
      `저장 실패: ${saveError.message || "알 수 없는 오류"}`;

    saveWorkoutRecordButton.disabled = false;
    saveWorkoutRecordButton.textContent =
      "기록 저장";
  }
}

// 카메라 버튼 기능 연결
openWorkoutCameraButton.addEventListener(
  "click",
  function () {
    workoutNativeCameraInput.value = "";
    workoutNativeCameraInput.click();
  }
);

workoutNativeCameraInput.addEventListener(
  "change",
  async function () {
    const capturedFile =
      workoutNativeCameraInput.files[0];

    // 촬영을 취소한 경우 아무 작업도 하지 않음
    if (!capturedFile) {
      return;
    }

    const capturedAt = new Date();

    try {
      const optimizedPhotoBlob =
        await optimizeWorkoutPhoto(
          capturedFile
        );

      clearCapturedWorkoutPhoto();
      stopWorkoutCamera();

      capturedWorkoutPhotoBlob =
        optimizedPhotoBlob;

      workoutPhotoTakenAt =
        capturedAt;

      workoutPhotoPreviewUrl =
        URL.createObjectURL(
          optimizedPhotoBlob
        );

      workoutPhotoPreview.src =
        workoutPhotoPreviewUrl;

      workoutPhotoDate.textContent =
        new Intl.DateTimeFormat("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }).format(workoutPhotoTakenAt);

      workoutCameraModal.hidden = false;
      workoutCameraView.hidden = true;
      workoutPhotoComposer.hidden = false;

      document.body.classList.add(
        "camera-open"
      );

      workoutPhotoCaption.focus();

    } catch (photoError) {
      console.error(
        "운동 기록 사진 최적화 실패:",
        photoError
      );

      workoutNativeCameraInput.value = "";

      window.alert(
        "촬영한 사진을 준비하지 못했습니다. 다시 촬영해 주세요."
      );
    }
  }
);

closeWorkoutCameraButton.addEventListener(
  "click",
  closeWorkoutCamera
);

switchWorkoutCameraButton.addEventListener(
  "click",
  switchWorkoutCamera
);
captureWorkoutPhotoButton.addEventListener(
  "click",
  captureWorkoutPhoto
);

retakeWorkoutPhotoButton.addEventListener(
  "click",
  retakeWorkoutPhoto
);
saveWorkoutRecordButton.addEventListener(
  "click",
  saveWorkoutRecord
);
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const loginButton = document.querySelector("#loginButton");
const loginMessage = document.querySelector("#loginMessage");
const showSignupButton = document.querySelector("#showSignupButton");
const signupForm = document.querySelector("#signupForm");
const signupName = document.querySelector("#signupName");
const signupPhoneLast4 = document.querySelector("#signupPhoneLast4");
const signupEmail = document.querySelector("#signupEmail");
const signupPassword = document.querySelector("#signupPassword");
const signupPasswordConfirm = document.querySelector(
  "#signupPasswordConfirm"
);
const signupButton = document.querySelector("#signupButton");
const signupMessage = document.querySelector("#signupMessage");
const hideSignupButton = document.querySelector("#hideSignupButton");
const assignedRoutineName = document.querySelector("#assignedRoutineName");

const routineRequestStatusMessage =
  document.querySelector(
    "#routineRequestStatusMessage"
  );

const routineDescription = document.querySelector("#routineDescription");
const toggleRoutineDescriptionButton = document.querySelector(
  "#toggleRoutineDescriptionButton"
);
const logoutButton = document.querySelector("#logoutButton");
const memberAccountEmail = document.querySelector("#memberAccountEmail");

function renderMemberAccountEmail(email = "") {
  const value = typeof email === "string" ? email.trim() : "";
  memberAccountEmail.textContent = value;
  memberAccountEmail.hidden = !value;
}

// 회원·관리자 상단 더보기: 바깥 클릭, Escape, 화면 이동과 로그아웃 시 닫습니다.
(function () {
  function connectAppMenu(prefix, screen, logout) {
    const menu = document.querySelector("#" + prefix + "Menu");
    const toggle = document.querySelector("#" + prefix + "MenuToggle");
    const panel = document.querySelector("#" + prefix + "MenuPanel");
    function closeMenu() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "메뉴 열기");
    }
    toggle.addEventListener("click", function () {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
      toggle.setAttribute("aria-label", willOpen ? "메뉴 닫기" : "메뉴 열기");
      if (willOpen) logout.focus({ preventScroll: true });
    });
    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target)) closeMenu();
    });
    document.addEventListener("focusin", function (event) {
      if (!menu.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) {
        event.preventDefault();
        closeMenu();
        toggle.focus({ preventScroll: true });
      }
    });
    logout.addEventListener("click", closeMenu);
    screen.querySelectorAll("[data-member-tab]").forEach(function (button) {
      button.addEventListener("click", closeMenu);
    });
    new MutationObserver(function () {
      if (screen.hidden) closeMenu();
    }).observe(screen, { attributes: true, attributeFilter: ["hidden"] });
  }
  connectAppMenu("member", appScreen, logoutButton);
  connectAppMenu("admin", adminScreen, document.querySelector("#adminLogoutButton"));
})();
const refreshMemberAppButton =
  document.querySelector("#refreshMemberAppButton");

refreshMemberAppButton.addEventListener(
  "click",
  function () {
    const activeMemberTabButton =
      document.querySelector(
        "[data-member-tab].is-active"
      );

    if (activeMemberTabButton) {
      sessionStorage.setItem(
        "memberTabBeforeRefresh",
        activeMemberTabButton.dataset.memberTab
      );
    }

    refreshMemberAppButton.disabled = true;
    refreshMemberAppButton.lastElementChild.textContent =
      "갱신 중...";

    setTimeout(function () {
      window.location.reload();
    }, 150);
  }
);

const refreshAdminAppButton =
  document.querySelector(
    "#refreshAdminAppButton"
  );

refreshAdminAppButton.addEventListener(
  "click",
  function () {
    refreshAdminAppButton.disabled = true;

    refreshAdminAppButton
      .lastElementChild
      .textContent =
      "갱신 중...";

    setTimeout(function () {
      window.location.reload();
    }, 150);
  }
);

const adminMemberSearch = document.querySelector("#adminMemberSearch");
const adminMemberSelect = document.querySelector("#adminMemberSelect");
const adminMemberInfo = document.querySelector("#adminMemberInfo");

let adminMemberOptionCache = [];
let adminMemberLoadRequestId = 0;
let adminMemberRefreshTimer = null;
let adminMemberRefreshGeneration = 0;
let isAdminMemberRefreshRunning = false;

const adminRoutineEditor =
  document.querySelector("#adminRoutineEditor");

const adminRoutineModeMessage =
  document.querySelector("#adminRoutineModeMessage");

const toggleAdminRoutineModeButton =
  document.querySelector("#toggleAdminRoutineModeButton");

const adminRoutineImageHelp =
  document.querySelector("#adminRoutineImageHelp");

const adminLogoutButton =
  document.querySelector("#adminLogoutButton");

let currentAdminRoutine = null;
let adminRoutineMode = "new";
let adminRoutineFormat = "json";
const adminRoutineJsonFormatButton = document.querySelector("#adminRoutineJsonFormatButton");
const adminRoutineImageFormatButton = document.querySelector("#adminRoutineImageFormatButton");
const adminRoutineJsonPanel = document.querySelector("#adminRoutineJsonPanel");
const adminRoutineImagePanel = document.querySelector("#adminRoutineImagePanel");
const adminRoutineFormatHelp = document.querySelector("#adminRoutineFormatHelp");
const adminRoutineName = document.querySelector("#adminRoutineName");
const adminRoutineImage = document.querySelector("#adminRoutineImage");
const adminRoutinePreview = document.querySelector("#adminRoutinePreview");
const adminRoutineDescription = document.querySelector("#adminRoutineDescription");
const saveAdminRoutineButton = document.querySelector("#saveAdminRoutineButton");
const adminSaveMessage = document.querySelector("#adminSaveMessage");
const adminRoutineJsonInput = document.querySelector("#adminRoutineJsonInput");
const previewAdminRoutineJsonButton = document.querySelector("#previewAdminRoutineJsonButton");
const applyAdminRoutineJsonButton = document.querySelector("#applyAdminRoutineJsonButton");
const adminRoutineJsonMessage = document.querySelector("#adminRoutineJsonMessage");

// 관리자 루틴 이미지 편집 상태
const MAX_ROUTINE_IMAGES = 5;

let adminRoutineImageItems = [];
let isAdminRoutineSaving = false;
let isAdminRoutineRequestSelecting = false;

// 저장 방식과 입력창 표시를 한곳에서 맞춥니다.
function syncAdminRoutineFormatUI() {
  const isJson = adminRoutineFormat === "json";
  const editing = adminRoutineMode === "edit" && Boolean(currentAdminRoutine);
  const blocked = isAdminRoutineSaving || isAdminRoutineRequestSelecting ||
    saveAdminRoutineButton.disabled || !adminMemberSelect.value ||
    adminScreen.hidden || adminRoutineEditor.hidden;

  adminRoutineJsonPanel.hidden = !isJson;
  adminRoutineImagePanel.hidden = isJson;
  adminRoutineJsonFormatButton.setAttribute("aria-pressed", String(isJson));
  adminRoutineImageFormatButton.setAttribute("aria-pressed", String(!isJson));
  adminRoutineJsonFormatButton.disabled = blocked || (editing && !isJson);
  adminRoutineImageFormatButton.disabled = blocked || (editing && isJson);
  toggleAdminRoutineModeButton.disabled = blocked;
  previewAdminRoutineJsonButton.disabled = blocked || !isJson || !window.ExerciseDB;

  adminRoutineFormatHelp.textContent = editing
    ? "저장된 방식으로 수정합니다. 다른 방식은 ‘새 루틴 배정하기’에서 선택해 주세요."
    : "입력 방식을 선택해 주세요. 선택한 방식의 내용만 회원에게 적용됩니다.";
  window.RoutineComponents?.syncAdminApplyButton();
}

function selectAdminRoutineFormat(format) {
  if ((format !== "json" && format !== "image") ||
      format === adminRoutineFormat || adminRoutineMode === "edit" ||
      isAdminRoutineSaving || isAdminRoutineRequestSelecting ||
      saveAdminRoutineButton.disabled || !adminMemberSelect.value ||
      adminScreen.hidden || adminRoutineEditor.hidden) return;

  // 작성 중인 내용은 유지하되, 숨겨지는 영상과 이전 검사 결과는 정리합니다.
  const jsonDraft = adminRoutineJsonInput.value;
  window.RoutineComponents?.resetAdminPreview();
  adminRoutineJsonInput.value = jsonDraft;
  adminRoutineFormat = format;
  adminSaveMessage.textContent = "";
  syncAdminRoutineFormatUI();
}

adminRoutineJsonFormatButton.addEventListener("click", function () {
  selectAdminRoutineFormat("json");
});
adminRoutineImageFormatButton.addEventListener("click", function () {
  selectAdminRoutineFormat("image");
});

// 선택한 이미지의 임시 주소와 편집 목록 정리
function clearAdminRoutineImageItems() {
  adminRoutineImageItems.forEach(function (item) {
    if (item.file && item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  });

  adminRoutineImageItems = [];
  renderAdminRoutineImageItems();
}

// 이미지별 미리보기·캡션·순서 변경 버튼 표시
function renderAdminRoutineImageItems() {
  adminRoutinePreview.replaceChildren();

  adminRoutinePreview.hidden =
    adminRoutineImageItems.length === 0;

  adminRoutineImage.disabled =
    isAdminRoutineSaving ||
    adminRoutineImageItems.length >= MAX_ROUTINE_IMAGES;

  adminRoutineImageItems.forEach(function (item, index) {
    const imageItem = document.createElement("div");
    imageItem.className = "admin-routine-image-item";

    const imageTitle = document.createElement("strong");
    imageTitle.textContent = `이미지 ${index + 1}`;

    const previewImage = document.createElement("img");
    previewImage.alt = `루틴 이미지 ${index + 1} 미리보기`;
    previewImage.draggable = false;

    if (item.previewUrl) {
      previewImage.src = item.previewUrl;
    } else {
      previewImage.hidden = true;
    }

    const captionLabel = document.createElement("label");
    captionLabel.htmlFor = `adminRoutineCaption${index}`;
    captionLabel.textContent = "이미지 캡션 (선택)";

    const captionInput = document.createElement("textarea");
    captionInput.id = `adminRoutineCaption${index}`;
    captionInput.className = "admin-routine-image-caption";
    captionInput.rows = 2;
    captionInput.placeholder =
      "이 이미지 아래에 표시할 짧은 글을 입력하세요.";
    captionInput.value = item.caption || "";
    captionInput.disabled = isAdminRoutineSaving;

    captionInput.addEventListener("input", function () {
      item.caption = captionInput.value;
    });

    const actionArea = document.createElement("div");
    actionArea.className = "admin-routine-image-actions";

    function createMoveButton(buttonText, offset) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = buttonText;

      const targetIndex = index + offset;

      button.disabled =
        isAdminRoutineSaving ||
        targetIndex < 0 ||
        targetIndex >= adminRoutineImageItems.length;

      button.addEventListener("click", function () {
        if (isAdminRoutineSaving) {
          return;
        }

        const movedItem = adminRoutineImageItems[index];

        adminRoutineImageItems[index] =
          adminRoutineImageItems[targetIndex];

        adminRoutineImageItems[targetIndex] = movedItem;

        renderAdminRoutineImageItems();
      });

      return button;
    }

    const previousButton = createMoveButton("앞으로", -1);
    const nextButton = createMoveButton("뒤로", 1);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "is-delete";
    deleteButton.textContent = "삭제";
    deleteButton.disabled = isAdminRoutineSaving;

    deleteButton.addEventListener("click", function () {
      if (isAdminRoutineSaving) {
        return;
      }

      const removedItem =
        adminRoutineImageItems.splice(index, 1)[0];

      if (removedItem.file && removedItem.previewUrl) {
        URL.revokeObjectURL(removedItem.previewUrl);
      }

      renderAdminRoutineImageItems();
    });

    actionArea.append(
      previousButton,
      nextButton,
      deleteButton
    );

    imageItem.append(
      imageTitle,
      previewImage,
      captionLabel,
      captionInput,
      actionArea
    );

    adminRoutinePreview.append(imageItem);
  });
}

// 관리자 센터 소식 작성 요소
const adminCommunityEditorTitle =
  document.querySelector(
    "#adminCommunityEditorTitle"
  );

const adminCommunityTitle =
  document.querySelector(
    "#adminCommunityTitle"
  );

const adminCommunityImages =
  document.querySelector(
    "#adminCommunityImages"
  );

const adminCommunityImagePreview =
  document.querySelector(
    "#adminCommunityImagePreview"
  );

const adminCommunityBody =
  document.querySelector(
    "#adminCommunityBody"
  );

const adminCommunityVideoUrl =
  document.querySelector(
    "#adminCommunityVideoUrl"
  );

const adminCommunityVideoPreview =
  document.querySelector(
    "#adminCommunityVideoPreview"
  );

// 관리자 영상 미리보기 표시
function renderAdminCommunityVideoPreview() {
  if (
    activeCommunityVideoArea &&
    adminCommunityVideoPreview.contains(
      activeCommunityVideoArea
    )
  ) {
    activeCommunityVideoArea = null;
  }

  adminCommunityVideoPreview.replaceChildren();

  const videoUrl =
    adminCommunityVideoUrl.value.trim();

  if (!videoUrl) {
    return;
  }

  const videoPreview =
    createCommunityVideoFacade(
      videoUrl,
      adminCommunityTitle.value.trim() ||
      "센터 소식"
    );

  if (!videoPreview) {
    const errorMessage =
      document.createElement("p");

    errorMessage.className =
      "admin-message";

    errorMessage.textContent =
      "올바른 유튜브 영상 또는 쇼츠 주소를 입력해 주세요.";

    adminCommunityVideoPreview.append(
      errorMessage
    );

    return;
  }

  adminCommunityVideoPreview.append(
    videoPreview
  );
}

// 영상 주소가 변경되면 미리보기 갱신
adminCommunityVideoUrl.addEventListener(
  "input",
  renderAdminCommunityVideoPreview
);

const saveAdminCommunityButton =
  document.querySelector(
    "#saveAdminCommunityButton"
  );

const cancelAdminCommunityEditButton =
  document.querySelector(
    "#cancelAdminCommunityEditButton"
  );

const adminCommunityMessage =
  document.querySelector(
    "#adminCommunityMessage"
  );

// 게시한 센터 소식 관리 요소
const adminCommunityPostList =
  document.querySelector(
    "#adminCommunityPostList"
  );

const adminCommunityListMessage =
  document.querySelector(
    "#adminCommunityListMessage"
  );

const loadMoreAdminCommunityPostsButton =
  document.querySelector(
    "#loadMoreAdminCommunityPostsButton"
  );

const adminRoutineRequestListMessage =
  document.querySelector(
    "#adminRoutineRequestListMessage"
  );

const adminRoutineRequestList =
  document.querySelector(
    "#adminRoutineRequestList"
  );

// 관리자 1:1 문의 관리 요소
const toggleAdminInquiryFeatureButton =
  document.querySelector(
    "#toggleAdminInquiryFeatureButton"
  );

const adminInquirySettingMessage =
  document.querySelector(
    "#adminInquirySettingMessage"
  );

const adminInquiryListMessage =
  document.querySelector(
    "#adminInquiryListMessage"
  );

const adminInquiryList =
  document.querySelector(
    "#adminInquiryList"
  );

const adminInquiryFilterButtons =
  Array.from(
    document.querySelectorAll(
      "[data-admin-inquiry-filter]"
    )
  );

const loadMoreAdminInquiriesButton =
  document.querySelector(
    "#loadMoreAdminInquiriesButton"
  );

let isAdminInquiryEnabled = false;

const ADMIN_INQUIRY_PAGE_SIZE = 10;

let adminInquiryVisibleCount =
  ADMIN_INQUIRY_PAGE_SIZE;

let selectedAdminInquiryFilter =
  "waiting";

// 관리자 문의 설정 버튼 표시
function renderAdminInquirySetting(
  isEnabled
) {
  isAdminInquiryEnabled =
    isEnabled === true;

  toggleAdminInquiryFeatureButton.disabled =
    false;

  toggleAdminInquiryFeatureButton.setAttribute(
    "aria-pressed",
    String(isAdminInquiryEnabled)
  );

  toggleAdminInquiryFeatureButton.textContent =
    isAdminInquiryEnabled
      ? "접수 중"
      : "접수 중단";
}


// 관리자 문의 설정 불러오기
async function loadAdminInquirySetting() {
  toggleAdminInquiryFeatureButton.disabled =
    true;

  toggleAdminInquiryFeatureButton.textContent =
    "설정 확인 중";

  adminInquirySettingMessage.textContent =
    "";

  try {
    const {
      data: inquirySetting,
      error: inquirySettingError
    } = await supabaseClient
      .from("app_settings")
      .select("is_enabled")
      .eq(
        "setting_key",
        "member_inquiry_enabled"
      )
      .single();

    if (inquirySettingError) {
      throw inquirySettingError;
    }

    renderAdminInquirySetting(
      inquirySetting.is_enabled
    );

  } catch (settingError) {
    console.error(
      "관리자 문의 설정 불러오기 실패:",
      settingError
    );

    toggleAdminInquiryFeatureButton.disabled =
      true;

    toggleAdminInquiryFeatureButton.textContent =
      "확인 실패";

    adminInquirySettingMessage.textContent =
      `문의 설정을 불러오지 못했습니다: ${settingError.message ||
      "알 수 없는 오류"
      }`;
  }
}


// 관리자 문의 기능 온·오프 변경
async function toggleAdminInquiryFeature() {
  const nextEnabled =
    !isAdminInquiryEnabled;

  if (
    !nextEnabled &&
    !window.confirm(
      "회원의 새 문의와 추가 질문 접수를 중단할까요?\n\n기존 문의와 답변 기록은 계속 유지됩니다."
    )
  ) {
    return;
  }

  toggleAdminInquiryFeatureButton.disabled =
    true;

  adminInquirySettingMessage.textContent =
    "문의 설정을 변경하고 있습니다.";

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error(
        "로그인 정보를 확인할 수 없습니다."
      );
    }

    const {
      data: updatedSetting,
      error: updateError
    } = await supabaseClient
      .from("app_settings")
      .update({
        is_enabled: nextEnabled,
        updated_at:
          new Date().toISOString(),
        updated_by: user.id
      })
      .eq(
        "setting_key",
        "member_inquiry_enabled"
      )
      .select("is_enabled")
      .single();

    if (updateError) {
      throw updateError;
    }

    renderAdminInquirySetting(
      updatedSetting.is_enabled
    );

    adminInquirySettingMessage.textContent =
      updatedSetting.is_enabled
        ? "회원 문의 접수를 시작했습니다."
        : "회원 문의 접수를 중단했습니다.";

  } catch (toggleError) {
    console.error(
      "관리자 문의 설정 변경 실패:",
      toggleError
    );

    adminInquirySettingMessage.textContent =
      `설정 변경 실패: ${toggleError.message ||
      "알 수 없는 오류"
      }`;

    toggleAdminInquiryFeatureButton.disabled =
      false;
  }
}


toggleAdminInquiryFeatureButton.addEventListener(
  "click",
  toggleAdminInquiryFeature
);

let openAdminInquiryId = null;

// 관리자가 회원 문의에 답변하기
async function sendAdminInquiryReply(
  inquiryId,
  replyInput,
  replyButton,
  replyMessage
) {
  const body = replyInput.value.trim();

  if (!body) {
    replyMessage.textContent =
      "답변 내용을 입력해 주세요.";

    replyInput.focus();
    return;
  }

  replyButton.disabled = true;
  replyButton.textContent = "답변 저장 중...";
  replyMessage.textContent = "";

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error(
        "관리자 로그인 정보를 확인할 수 없습니다."
      );
    }

    const { error: replyInsertError } =
      await supabaseClient
        .from("inquiry_messages")
        .insert({
          inquiry_id: inquiryId,
          sender_id: user.id,
          sender_role: "admin",
          body
        });

    if (replyInsertError) {
      throw replyInsertError;
    }

    replyInput.value = "";
    openAdminInquiryId = inquiryId;

    await loadAdminInquiries();
  } catch (replyError) {
    console.error(
      "관리자 문의 답변 저장 실패:",
      replyError
    );

    replyMessage.textContent =
      `답변 저장 실패: ${replyError.message || "알 수 없는 오류"
      }`;
  } finally {
    replyButton.disabled = false;
    replyButton.textContent = "답변 보내기";
  }
}

// 관리자 문의 보관 또는 복원
async function updateAdminInquiryArchive(
  inquiryId,
  shouldArchive,
  archiveButton,
  archiveMessage
) {
  if (
    shouldArchive &&
    !window.confirm(
      "이 문의를 보관함으로 옮길까요?"
    )
  ) {
    return;
  }

  archiveButton.disabled = true;

  archiveButton.textContent =
    shouldArchive
      ? "보관 중..."
      : "복원 중...";

  archiveMessage.textContent = "";

  try {
    const {
      data: updatedInquiry,
      error: archiveError
    } = await supabaseClient
      .from("member_inquiries")
      .update({
        archived_at: shouldArchive
          ? new Date().toISOString()
          : null
      })
      .eq("id", inquiryId)
      .select("id")
      .single();

    if (
      archiveError ||
      !updatedInquiry
    ) {
      throw (
        archiveError ||
        new Error(
          "문의 상태를 변경하지 못했습니다."
        )
      );
    }

    openAdminInquiryId = null;

    await loadAdminInquiries(true);

  } catch (archiveError) {
    console.error(
      "관리자 문의 보관 상태 변경 실패:",
      archiveError
    );

    archiveMessage.textContent =
      `처리 실패: ${archiveError.message ||
      "알 수 없는 오류"
      }`;

  } finally {
    if (archiveButton.isConnected) {
      archiveButton.disabled = false;

      archiveButton.textContent =
        shouldArchive
          ? "보관함으로 이동"
          : "보관함에서 꺼내기";
    }
  }
}

// 선택한 관리자 문의의 대화 내용 불러오기
async function loadAdminInquiryMessages(
  inquiryId,
  memberName,
  messageList
) {
  messageList.replaceChildren();

  const loadingMessage =
    document.createElement("p");

  loadingMessage.className =
    "admin-inquiry-reply-message";

  loadingMessage.textContent =
    "대화 내용을 불러오는 중입니다.";

  messageList.append(loadingMessage);

  try {
    const {
      data: messages,
      error: messagesError
    } = await supabaseClient
      .from("inquiry_messages")
      .select(
        "id, sender_id, sender_role, body, created_at"
      )
      .eq("inquiry_id", inquiryId)
      .order("created_at", {
        ascending: true
      });

    if (messagesError) {
      throw messagesError;
    }

    messageList.replaceChildren();

    if (!messages || messages.length === 0) {
      const emptyMessage =
        document.createElement("p");

      emptyMessage.className =
        "admin-inquiry-reply-message";

      emptyMessage.textContent =
        "표시할 대화 내용이 없습니다.";

      messageList.append(emptyMessage);
      messageList.dataset.loaded = "true";

      return;
    }

    messages.forEach(function (message) {
      const messageCard =
        document.createElement("div");

      messageCard.className =
        message.sender_role === "admin"
          ? "member-inquiry-message is-admin"
          : "member-inquiry-message is-member";

      const messageLabel =
        document.createElement("strong");

      messageLabel.className =
        "member-inquiry-message-label";

      messageLabel.textContent =
        message.sender_role === "admin"
          ? "센터 답변"
          : memberName;

      const messageBody =
        document.createElement("p");

      messageBody.className =
        "member-inquiry-message-body";

      messageBody.textContent =
        message.body;

      const messageDate =
        document.createElement("time");

      messageDate.className =
        "member-inquiry-message-date";

      messageDate.dateTime =
        message.created_at || "";

      messageDate.textContent =
        formatMemberInquiryDate(
          message.created_at
        );

      messageCard.append(
        messageLabel,
        messageBody,
        messageDate
      );

      messageList.append(messageCard);
    });

    messageList.dataset.loaded = "true";

  } catch (messagesError) {
    console.error(
      "관리자 문의 대화 불러오기 실패:",
      messagesError
    );

    messageList.replaceChildren();

    const errorMessage =
      document.createElement("p");

    errorMessage.className =
      "admin-inquiry-reply-message";

    errorMessage.textContent =
      "대화 내용을 불러오지 못했습니다.";

    messageList.append(errorMessage);
  }
}

// 관리자 화면에 회원 문의 표시
function renderAdminInquiries(inquiries) {
  adminInquiryList.replaceChildren();

  if (!inquiries || inquiries.length === 0) {
    adminInquiryListMessage.textContent =
      "아직 접수된 회원 문의가 없습니다.";

    return;
  }

  adminInquiryListMessage.textContent = "";

  inquiries.forEach(function (inquiry) {
    const memberProfile =
      inquiry.memberProfile || {};

    const memberName =
      memberProfile.display_name ||
      memberProfile.email ||
      "회원";

    const memberDetails = [];

    if (memberProfile.phone_last4) {
      memberDetails.push(
        `전화번호 끝자리 ${memberProfile.phone_last4}`
      );
    }

    if (memberProfile.email) {
      memberDetails.push(
        memberProfile.email
      );
    }

    const inquiryCard =
      document.createElement("article");

    inquiryCard.className =
      "admin-inquiry-card";

    const summaryButton =
      document.createElement("button");

    summaryButton.type = "button";
    summaryButton.className =
      "admin-inquiry-summary-button";

    const threadId =
      `adminInquiryThread-${inquiry.id}`;

    summaryButton.setAttribute(
      "aria-controls",
      threadId
    );

    const isOpen =
      openAdminInquiryId === inquiry.id;

    summaryButton.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

    const summaryTop =
      document.createElement("span");

    summaryTop.className =
      "admin-inquiry-summary-top";

    const memberLabel =
      document.createElement("strong");

    memberLabel.className =
      "admin-inquiry-member-name";

    memberLabel.textContent =
      memberName;

    const statusBadge =
      document.createElement("span");

    statusBadge.className =
      `admin-inquiry-status is-${inquiry.status}`;

    statusBadge.textContent =
      inquiry.status === "answered"
        ? "답변 완료"
        : "답변 대기";

    summaryTop.append(
      memberLabel,
      statusBadge
    );

    const inquiryTitle =
      document.createElement("span");

    inquiryTitle.className =
      "admin-inquiry-title";

    inquiryTitle.textContent =
      inquiry.title;

    const inquiryMeta =
      document.createElement("span");

    inquiryMeta.className =
      "admin-inquiry-meta";

    const latestMessageDate =
      inquiry.last_message_at ||
      inquiry.created_at;

    const inquiryDateLine =
      document.createElement("span");

    inquiryDateLine.className =
      "admin-inquiry-meta-date";

    inquiryDateLine.textContent =
      formatMemberInquiryDate(
        latestMessageDate
      );

    inquiryMeta.append(
      inquiryDateLine
    );

    if (memberDetails.length > 0) {
      const memberContactLine =
        document.createElement("span");

      memberContactLine.className =
        "admin-inquiry-meta-contact";

      memberContactLine.textContent =
        memberDetails.join(" · ");

      inquiryMeta.append(
        memberContactLine
      );
    }

    summaryButton.append(
      summaryTop,
      inquiryTitle,
      inquiryMeta
    );

    const threadArea =
      document.createElement("div");

    threadArea.id = threadId;
    threadArea.className =
      "admin-inquiry-thread";

    threadArea.hidden = !isOpen;

    const messageList =
      document.createElement("div");

    messageList.className =
      "member-inquiry-message-list admin-inquiry-message-list";

    threadArea.append(messageList);

    const replyArea =
      document.createElement("div");

    replyArea.className =
      "admin-inquiry-reply-area";

    const replyLabel =
      document.createElement("label");

    const replyInputId =
      `adminInquiryReply-${inquiry.id}`;

    replyLabel.htmlFor =
      replyInputId;

    replyLabel.textContent =
      "관리자 답변";

    const replyInput =
      document.createElement("textarea");

    replyInput.id = replyInputId;
    replyInput.rows = 4;
    replyInput.maxLength = 5000;

    replyInput.placeholder =
      "회원에게 전달할 답변을 입력하세요.";

    const replyButton =
      document.createElement("button");

    replyButton.type = "button";
    replyButton.textContent =
      "답변 보내기";

    const replyMessage =
      document.createElement("p");

    replyMessage.className =
      "admin-inquiry-reply-message";

    replyMessage.setAttribute(
      "aria-live",
      "polite"
    );

    replyButton.addEventListener(
      "click",
      function () {
        sendAdminInquiryReply(
          inquiry.id,
          replyInput,
          replyButton,
          replyMessage
        );
      }
    );

    replyArea.append(
      replyLabel,
      replyInput,
      replyButton,
      replyMessage
    );

    threadArea.append(
      replyArea
    );

    const isArchived =
      Boolean(inquiry.archived_at);

    if (isArchived) {
      replyArea.hidden = true;
    }

    const archiveActionArea =
      document.createElement("div");

    archiveActionArea.className =
      "member-inquiry-delete-area";

    const archiveButton =
      document.createElement("button");

    archiveButton.type = "button";

    archiveButton.className =
      "member-inquiry-status member-inquiry-delete-button";

    archiveButton.textContent =
      isArchived
        ? "보관함에서 꺼내기"
        : "보관함으로 이동";

    const archiveMessage =
      document.createElement("p");

    archiveMessage.className =
      "member-inquiry-delete-message";

    archiveMessage.setAttribute(
      "aria-live",
      "polite"
    );

    archiveButton.addEventListener(
      "click",
      function () {
        updateAdminInquiryArchive(
          inquiry.id,
          !isArchived,
          archiveButton,
          archiveMessage
        );
      }
    );

    archiveActionArea.append(
      archiveButton,
      archiveMessage
    );

    archiveActionArea.hidden =
      !isArchived &&
      inquiry.status !== "answered";

    summaryButton.addEventListener(
      "click",
      function () {
        const willOpen =
          threadArea.hidden;

        threadArea.hidden =
          !willOpen;

        openAdminInquiryId =
          willOpen
            ? inquiry.id
            : null;

        summaryButton.setAttribute(
          "aria-expanded",
          String(willOpen)
        );

        if (
          willOpen &&
          messageList.dataset.loaded !== "true"
        ) {
          loadAdminInquiryMessages(
            inquiry.id,
            memberName,
            messageList
          );
        }
      }
    );

    inquiryCard.append(
      summaryButton,
      threadArea,
      archiveActionArea
    );

    adminInquiryList.append(
      inquiryCard
    );

    if (isOpen) {
      loadAdminInquiryMessages(
        inquiry.id,
        memberName,
        messageList
      );
    }
  });
}

// 관리자용 회원 문의 목록 불러오기
async function loadAdminInquiries(
  preserveCurrentList = false
) {
  const requestId = ++adminInquiryLoadRequestId;
  const visibleCount = adminInquiryVisibleCount;
  const filter = selectedAdminInquiryFilter;
  function isCurrentRequest() {
    return requestId === adminInquiryLoadRequestId && !adminScreen.hidden &&
      visibleCount === adminInquiryVisibleCount && filter === selectedAdminInquiryFilter;
  }
  if (!isCurrentRequest()) return;

  if (!preserveCurrentList) {
    adminInquiryList.replaceChildren();

    adminInquiryListMessage.textContent =
      "회원 문의를 불러오고 있습니다.";

    loadMoreAdminInquiriesButton.hidden = true;
  }

  loadMoreAdminInquiriesButton.disabled = true;

  try {
    let inquiryQuery =
      supabaseClient
        .from("member_inquiries")
        .select(
          `
            id,
            user_id,
            title,
            status,
            archived_at,
            created_at,
            updated_at,
            last_message_at
          `,
          {
            count: "exact"
          }
        );

    if (
      filter ===
      "archived"
    ) {
      inquiryQuery =
        inquiryQuery.not(
          "archived_at",
          "is",
          null
        );

    } else {
      inquiryQuery =
        inquiryQuery
          .is("archived_at", null)
          .eq(
            "status",
            filter
          );
    }

    const {
      data: inquiries,
      error: inquiriesError,
      count: inquiryCount
    } = await inquiryQuery
      .order(
        "last_message_at",
        {
          ascending: false
        }
      )
      .range(
        0,
        visibleCount - 1
      );

    if (!isCurrentRequest()) return;

    if (inquiriesError) {
      throw inquiriesError;
    }

    const memberIds = [
      ...new Set(
        (inquiries || []).map(
          function (inquiry) {
            return inquiry.user_id;
          }
        )
      )
    ];

    let memberProfiles = [];

    if (memberIds.length > 0) {
      const {
        data: profiles,
        error: profilesError
      } = await supabaseClient
        .from("profiles")
        .select(`
          id,
          display_name,
          email,
          phone_last4
        `)
        .in("id", memberIds);

      if (!isCurrentRequest()) return;

      if (profilesError) {
        throw profilesError;
      }

      memberProfiles =
        profiles || [];
    }

    const profileById =
      new Map(
        memberProfiles.map(
          function (profile) {
            return [
              profile.id,
              profile
            ];
          }
        )
      );

    const inquiriesWithProfiles =
      (inquiries || []).map(
        function (inquiry) {
          return {
            ...inquiry,
            memberProfile:
              profileById.get(
                inquiry.user_id
              ) || null
          };
        }
      );

    renderAdminInquiries(
      inquiriesWithProfiles
    );

    const loadedInquiryCount =
      inquiries?.length || 0;

    const totalInquiryCount =
      inquiryCount || 0;

    const hasMoreInquiries =
      loadedInquiryCount <
      totalInquiryCount;

    const canCollapseInquiryList =
      adminInquiryVisibleCount >
      ADMIN_INQUIRY_PAGE_SIZE &&
      !hasMoreInquiries;

    loadMoreAdminInquiriesButton.hidden =
      totalInquiryCount <=
      ADMIN_INQUIRY_PAGE_SIZE;

    loadMoreAdminInquiriesButton.dataset.mode =
      canCollapseInquiryList
        ? "collapse"
        : "more";

    loadMoreAdminInquiriesButton.textContent =
      canCollapseInquiryList
        ? "목록 접기"
        : "이전 문의 더 보기";

  } catch (loadError) {
    if (!isCurrentRequest()) return;
    console.error(
      "관리자 회원 문의 불러오기 실패:",
      loadError
    );

    adminInquiryListMessage.textContent =
      `회원 문의를 불러오지 못했습니다: ${loadError.message ||
      "알 수 없는 오류"
      }`;

    loadMoreAdminInquiriesButton.hidden = true;

  } finally {
    if (isCurrentRequest()) loadMoreAdminInquiriesButton.disabled = false;
  }
}

// 관리자 문의 상태 필터 변경
adminInquiryFilterButtons.forEach(
  function (filterButton) {
    filterButton.addEventListener(
      "click",
      async function () {
        const nextFilter =
          filterButton.dataset
            .adminInquiryFilter;

        if (
          ![
            "waiting",
            "answered",
            "archived"
          ].includes(nextFilter)
        ) {
          return;
        }

        if (
          nextFilter ===
          selectedAdminInquiryFilter
        ) {
          return;
        }

        selectedAdminInquiryFilter =
          nextFilter;

        adminInquiryVisibleCount =
          ADMIN_INQUIRY_PAGE_SIZE;

        openAdminInquiryId = null;

        adminInquiryFilterButtons.forEach(
          function (button) {
            const isSelected =
              button === filterButton;

            button.classList.toggle(
              "is-active",
              isSelected
            );

            button.setAttribute(
              "aria-pressed",
              String(isSelected)
            );
          }
        );

        await loadAdminInquiries();
      }
    );
  }
);

// 관리자 문의 내역 더 보기 또는 목록 접기
loadMoreAdminInquiriesButton.addEventListener(
  "click",
  async function () {
    const scrollPositionBeforeUpdate =
      window.scrollY;

    const shouldCollapse =
      loadMoreAdminInquiriesButton.dataset.mode ===
      "collapse";

    loadMoreAdminInquiriesButton.disabled = true;

    if (shouldCollapse) {
      adminInquiryVisibleCount =
        ADMIN_INQUIRY_PAGE_SIZE;

      openAdminInquiryId = null;

      loadMoreAdminInquiriesButton.textContent =
        "목록 접는 중...";

      await loadAdminInquiries(true);

      requestAnimationFrame(function () {
        window.scrollTo({
          top: scrollPositionBeforeUpdate,
          left: 0,
          behavior: "auto"
        });
      });

      return;
    }

    adminInquiryVisibleCount +=
      ADMIN_INQUIRY_PAGE_SIZE;

    loadMoreAdminInquiriesButton.textContent =
      "불러오는 중...";

    await loadAdminInquiries(true);

    requestAnimationFrame(function () {
      window.scrollTo({
        top: scrollPositionBeforeUpdate,
        left: 0,
        behavior: "auto"
      });
    });
  }
);

// 선택된 센터 소식 이미지 파일
let selectedAdminCommunityFiles = [];

// 미리보기에 사용한 임시 주소
let adminCommunityPreviewUrls = [];

// 관리 화면에 불러온 센터 소식
const ADMIN_COMMUNITY_PAGE_SIZE = 5;

let adminCommunityVisibleCount =
  ADMIN_COMMUNITY_PAGE_SIZE;

let loadedAdminCommunityPosts = [];
let editingAdminCommunityPostId = null;
let existingAdminCommunityImages = [];
let removedAdminCommunityImages = [];

let isMovingAdminCommunityPost = false;

// 관리자 센터 소식 순서 변경
async function moveAdminCommunityPost(
  postIndex,
  direction,
  moveButton
) {
  if (isMovingAdminCommunityPost) {
    return;
  }

  const targetIndex =
    postIndex + direction;

  if (
    targetIndex < 0 ||
    targetIndex >=
    loadedAdminCommunityPosts.length
  ) {
    return;
  }

  const currentPost =
    loadedAdminCommunityPosts[postIndex];

  const targetPost =
    loadedAdminCommunityPosts[targetIndex];

  const currentOrder =
    currentPost.display_order;

  const targetOrder =
    targetPost.display_order;

  isMovingAdminCommunityPost = true;
  moveButton.disabled = true;

  adminCommunityListMessage.textContent =
    "소식 순서를 변경하고 있습니다.";

  let firstUpdateFinished = false;

  try {
    const {
      error: currentUpdateError
    } = await supabaseClient
      .from("community_posts")
      .update({
        display_order: targetOrder
      })
      .eq("id", currentPost.id);

    if (currentUpdateError) {
      throw currentUpdateError;
    }

    firstUpdateFinished = true;

    const {
      error: targetUpdateError
    } = await supabaseClient
      .from("community_posts")
      .update({
        display_order: currentOrder
      })
      .eq("id", targetPost.id);

    if (targetUpdateError) {
      throw targetUpdateError;
    }

    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    const listHeight =
      adminCommunityPostList.getBoundingClientRect().height;

    loadedAdminCommunityPosts[postIndex] = {
      ...targetPost,
      display_order: currentOrder
    };

    loadedAdminCommunityPosts[targetIndex] = {
      ...currentPost,
      display_order: targetOrder
    };

    renderAdminCommunityPostList(
      loadedAdminCommunityPosts
    );

    // 순서 변경으로 목록 높이가 줄어드는 것 방지
    adminCommunityPostList.style.minHeight =
      `${Math.ceil(listHeight)}px`;

    adminCommunityListMessage.textContent =
      "소식 순서를 변경했습니다.";

    window.scrollTo({
      left: scrollLeft,
      top: scrollTop,
      behavior: "instant"
    });

  } catch (moveError) {
    console.error(
      "센터 소식 순서 변경 실패:",
      moveError
    );

    /*
      두 번째 소식 변경에 실패했다면
      먼저 변경한 소식의 순서를 원래대로 복구
    */
    if (firstUpdateFinished) {
      const {
        error: rollbackError
      } = await supabaseClient
        .from("community_posts")
        .update({
          display_order: currentOrder
        })
        .eq("id", currentPost.id);

      if (rollbackError) {
        console.error(
          "센터 소식 순서 복구 실패:",
          rollbackError
        );
      }
    }

    adminCommunityListMessage.textContent =
      `순서 변경 실패: ${moveError.message ||
      "알 수 없는 오류"
      }`;

  } finally {
    isMovingAdminCommunityPost = false;

    if (moveButton.isConnected) {
      moveButton.disabled = false;
    }
  }
}

// 관리자 센터 소식 목록 표시
function renderAdminCommunityPostList(
  posts
) {
  adminCommunityPostList.style.minHeight = "";
  adminCommunityPostList.innerHTML = "";
  loadMoreAdminCommunityPostsButton.hidden =
    true;

  if (!posts || posts.length === 0) {
    adminCommunityListMessage.textContent =
      "아직 게시한 센터 소식이 없습니다.";

    return;
  }

  adminCommunityListMessage.textContent =
    "";

  const visiblePosts =
    posts.slice(
      0,
      adminCommunityVisibleCount
    );

  visiblePosts.forEach(function (post, postIndex) {
    const manageCard =
      document.createElement("article");

    manageCard.className =
      "admin-community-manage-card";

    const manageMain =
      document.createElement("div");

    manageMain.className =
      "admin-community-manage-main";

    const postImages =
      post.community_post_images || [];

    const firstImage =
      postImages[0];

    if (firstImage) {
      const thumbnail =
        document.createElement("img");

      thumbnail.className =
        "admin-community-manage-thumbnail";

      thumbnail.src =
        firstImage.signedUrl;

      thumbnail.alt =
        firstImage.alt_text ||
        `${post.title} 대표 이미지`;

      thumbnail.loading = "lazy";

      manageMain.append(thumbnail);

    } else if (post.video_url) {
      const videoData =
        getYouTubeVideoData(
          post.video_url
        );

      if (videoData) {
        const thumbnail =
          document.createElement("img");

        thumbnail.className =
          "admin-community-manage-thumbnail";

        thumbnail.src =
          videoData.thumbnailUrl;

        thumbnail.alt =
          `${post.title} 영상 미리보기`;

        thumbnail.loading = "lazy";

        manageMain.append(thumbnail);
      }
    }

    const manageInfo =
      document.createElement("div");

    manageInfo.className =
      "admin-community-manage-info";

    const manageTitle =
      document.createElement("h3");

    manageTitle.className =
      "admin-community-manage-title";

    manageTitle.textContent =
      post.title;

    const manageMeta =
      document.createElement("p");

    manageMeta.className =
      "admin-community-manage-meta";

    const dateText =
      new Intl.DateTimeFormat(
        "ko-KR",
        {
          year: "numeric",
          month: "long",
          day: "numeric"
        }
      ).format(
        new Date(
          post.published_at ||
          post.created_at
        )
      );

    const mediaLabels = [];

    if (postImages.length > 0) {
      mediaLabels.push(
        `사진 ${postImages.length}장`
      );
    }

    if (post.video_url) {
      mediaLabels.push("영상 1개");
    }

    manageMeta.textContent =
      mediaLabels.length > 0
        ? `${dateText} · ${mediaLabels.join(" · ")}`
        : dateText;

    manageInfo.append(
      manageTitle,
      manageMeta
    );

    manageMain.append(manageInfo);

    const actionArea =
      document.createElement("div");

    actionArea.className =
      "admin-community-manage-actions";

    const moveUpButton =
      document.createElement("button");

    moveUpButton.type = "button";
    moveUpButton.className =
      "admin-community-order-button";

    moveUpButton.textContent =
      "▲ 위로";

    moveUpButton.setAttribute(
      "aria-label",
      `${post.title} 소식을 위로 이동`
    );

    moveUpButton.disabled =
      postIndex === 0;

    moveUpButton.addEventListener(
      "click",
      function () {
        moveAdminCommunityPost(
          postIndex,
          -1,
          moveUpButton
        );
      }
    );

    const moveDownButton =
      document.createElement("button");

    moveDownButton.type = "button";
    moveDownButton.className =
      "admin-community-order-button";

    moveDownButton.textContent =
      "▼ 아래로";

    moveDownButton.setAttribute(
      "aria-label",
      `${post.title} 소식을 아래로 이동`
    );

    moveDownButton.disabled =
      postIndex === posts.length - 1;

    moveDownButton.addEventListener(
      "click",
      function () {
        moveAdminCommunityPost(
          postIndex,
          1,
          moveDownButton
        );
      }
    );

    const editButton =
      document.createElement("button");

    editButton.type = "button";
    editButton.className =
      "admin-community-edit-button";

    editButton.textContent = "수정";

    editButton.addEventListener(
      "click",
      function () {
        startAdminCommunityPostEdit(
          post
        );
      }
    );

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className =
      "admin-community-delete-button";

    deleteButton.textContent = "삭제";

    deleteButton.addEventListener(
      "click",
      function () {
        deleteAdminCommunityPost(
          post,
          deleteButton
        );
      }
    );

    actionArea.append(
      moveUpButton,
      moveDownButton,
      editButton,
      deleteButton
    );

    manageCard.append(
      manageMain,
      actionArea
    );

    adminCommunityPostList.append(
      manageCard
    );
  });

  loadMoreAdminCommunityPostsButton.hidden =
    adminCommunityVisibleCount >=
    posts.length;
}

loadMoreAdminCommunityPostsButton.addEventListener(
  "click",
  function () {
    adminCommunityVisibleCount +=
      ADMIN_COMMUNITY_PAGE_SIZE;

    renderAdminCommunityPostList(
      loadedAdminCommunityPosts
    );
  }
);

// 관리자용 센터 소식 불러오기
async function loadAdminCommunityPosts() {
  adminCommunityPostList.innerHTML = "";

  adminCommunityListMessage.textContent =
    "센터 소식을 불러오고 있습니다.";

  try {
    const {
      data: posts,
      error: postsError
    } = await supabaseClient
      .from("community_posts")
      .select(`
        id,
        title,
        body,
        video_url,
        display_order,
        published_at,
        created_at,
        community_post_images (
          id,
          storage_path,
          alt_text,
          sort_order
        )
      `)
      .eq("is_published", true)
      .order(
        "display_order",
        { ascending: true }
      )
      .order(
        "published_at",
        { ascending: false }
      );

    if (postsError) {
      throw postsError;
    }

    loadedAdminCommunityPosts =
      await Promise.all(
        (posts || []).map(
          async function (post) {
            const sortedImages = [
              ...(post.community_post_images || [])
            ].sort(
              function (first, second) {
                return (
                  first.sort_order -
                  second.sort_order
                );
              }
            );

            const imagesWithUrls =
              await Promise.all(
                sortedImages.map(
                  async function (image) {
                    const {
                      data: signedImageData,
                      error: signedImageError
                    } =
                      await supabaseClient.storage
                        .from("community-images")
                        .createSignedUrl(
                          image.storage_path,
                          3600
                        );

                    if (signedImageError) {
                      throw signedImageError;
                    }

                    return {
                      ...image,
                      signedUrl:
                        signedImageData.signedUrl
                    };
                  }
                )
              );

            return {
              ...post,
              community_post_images:
                imagesWithUrls
            };
          }
        )
      );

    renderAdminCommunityPostList(
      loadedAdminCommunityPosts
    );

  } catch (loadError) {
    console.error(
      "관리자 센터 소식 불러오기 실패:",
      loadError
    );

    loadedAdminCommunityPosts = [];

    adminCommunityListMessage.textContent =
      `센터 소식을 불러오지 못했습니다: ${loadError.message ||
      "알 수 없는 오류"
      }`;
  }
}

// 관리자 센터 소식 삭제
async function deleteAdminCommunityPost(
  post,
  deleteButton
) {
  const deleteConfirmed =
    window.confirm(
      `"${post.title}" 소식을 삭제할까요?\n\n삭제한 글과 사진은 복구할 수 없습니다.`
    );

  if (!deleteConfirmed) {
    return;
  }

  const imagePaths =
    (
      post.community_post_images || []
    )
      .map(function (image) {
        return image.storage_path;
      })
      .filter(Boolean);

  deleteButton.disabled = true;
  deleteButton.textContent = "삭제 중...";

  adminCommunityListMessage.textContent =
    "센터 소식을 삭제하고 있습니다.";

  try {
    /*
      회원 화면에서 게시물이 먼저 사라지도록
      DB 게시물과 연결 정보를 삭제
    */
    const {
      data: deletedPosts,
      error: postDeleteError
    } = await supabaseClient
      .from("community_posts")
      .delete()
      .eq("id", post.id)
      .select("id");

    if (postDeleteError) {
      throw postDeleteError;
    }

    if (
      !deletedPosts ||
      deletedPosts.length === 0
    ) {
      throw new Error(
        "삭제할 센터 소식을 찾을 수 없습니다."
      );
    }

    /*
      DB 삭제 후 Storage의 실제 사진 파일 정리
    */
    let imageCleanupError = null;

    if (imagePaths.length > 0) {
      const {
        error: storageDeleteError
      } = await supabaseClient.storage
        .from("community-images")
        .remove(imagePaths);

      imageCleanupError =
        storageDeleteError;
    }

    if (
      editingAdminCommunityPostId === post.id
    ) {
      resetAdminCommunityEditor();
    }

    await loadAdminCommunityPosts();

    if (imageCleanupError) {
      console.error(
        "삭제된 소식의 이미지 정리 실패:",
        imageCleanupError
      );

      adminCommunityListMessage.textContent =
        "소식은 삭제했지만 사진 파일 정리에 실패했습니다.";

      return;
    }

    adminCommunityListMessage.textContent =
      "센터 소식을 삭제했습니다.";

    setTimeout(function () {
      if (
        adminCommunityListMessage.textContent ===
        "센터 소식을 삭제했습니다."
      ) {
        adminCommunityListMessage.textContent =
          "";
      }
    }, 2500);

  } catch (deleteError) {
    console.error(
      "센터 소식 삭제 실패:",
      deleteError
    );

    adminCommunityListMessage.textContent =
      `삭제 실패: ${deleteError.message ||
      "알 수 없는 오류"
      }`;

    deleteButton.disabled = false;
    deleteButton.textContent = "삭제";
  }
}

// 미리보기 화면과 임시 주소 정리
function clearAdminCommunityImagePreview() {
  adminCommunityPreviewUrls.forEach(
    function (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  );

  adminCommunityPreviewUrls = [];
  adminCommunityImagePreview.innerHTML = "";
}


// 선택 이미지 전체 초기화
function resetAdminCommunityImages() {
  selectedAdminCommunityFiles = [];
  adminCommunityImages.value = "";

  clearAdminCommunityImagePreview();
}


// 현재 선택된 이미지 미리보기 표시
function renderAdminCommunityImagePreview() {
  clearAdminCommunityImagePreview();

  // 수정 중인 소식에 이미 저장되어 있던 사진
  existingAdminCommunityImages.forEach(function (image, index) {
    const previewItem = document.createElement("div");
    previewItem.className = "admin-community-preview-item";

    const previewImage = document.createElement("img");
    previewImage.src = image.signedUrl;
    previewImage.alt = `기존 소식 이미지 ${index + 1}`;

    const previewNumber = document.createElement("span");
    previewNumber.className = "admin-community-preview-number";
    previewNumber.textContent = String(index + 1);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "admin-community-preview-remove";
    removeButton.textContent = "×";
    removeButton.setAttribute(
      "aria-label",
      `${index + 1}번 기존 이미지 삭제`
    );

    removeButton.addEventListener("click", function () {
      const [removedImage] =
        existingAdminCommunityImages.splice(index, 1);

      if (removedImage) {
        removedAdminCommunityImages.push(removedImage);
      }

      adminCommunityMessage.textContent = "";
      renderAdminCommunityImagePreview();
    });

    previewItem.append(
      previewImage,
      previewNumber,
      removeButton
    );

    adminCommunityImagePreview.append(previewItem);
  });

  // 이번에 새로 선택한 사진
  selectedAdminCommunityFiles.forEach(function (file, index) {
    const combinedIndex =
      existingAdminCommunityImages.length + index;

    const previewUrl = URL.createObjectURL(file);
    adminCommunityPreviewUrls.push(previewUrl);

    const previewItem = document.createElement("div");
    previewItem.className = "admin-community-preview-item";

    const previewImage = document.createElement("img");
    previewImage.src = previewUrl;
    previewImage.alt = `새 소식 이미지 ${combinedIndex + 1}`;

    const previewNumber = document.createElement("span");
    previewNumber.className = "admin-community-preview-number";
    previewNumber.textContent = String(combinedIndex + 1);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "admin-community-preview-remove";
    removeButton.textContent = "×";
    removeButton.setAttribute(
      "aria-label",
      `${combinedIndex + 1}번 새 이미지 선택 취소`
    );

    removeButton.addEventListener("click", function () {
      selectedAdminCommunityFiles.splice(index, 1);
      adminCommunityMessage.textContent = "";
      renderAdminCommunityImagePreview();
    });

    previewItem.append(
      previewImage,
      previewNumber,
      removeButton
    );

    adminCommunityImagePreview.append(previewItem);
  });
}

// 센터 소식 작성 화면 초기화
function resetAdminCommunityEditor() {
  editingAdminCommunityPostId = null;
  existingAdminCommunityImages = [];
  removedAdminCommunityImages = [];

  adminCommunityTitle.value = "";
  adminCommunityBody.value = "";

  adminCommunityVideoUrl.value = "";
  renderAdminCommunityVideoPreview();

  resetAdminCommunityImages();

  adminCommunityEditorTitle.textContent =
    "센터 소식 작성";

  saveAdminCommunityButton.textContent =
    "센터 소식 게시";

  cancelAdminCommunityEditButton.hidden = true;
  adminCommunityMessage.textContent = "";
}


// 기존 센터 소식 수정 시작
function startAdminCommunityPostEdit(post) {
  editingAdminCommunityPostId = post.id;

  existingAdminCommunityImages = [
    ...(post.community_post_images || [])
  ];

  removedAdminCommunityImages = [];
  selectedAdminCommunityFiles = [];

  adminCommunityImages.value = "";

  adminCommunityTitle.value =
    post.title || "";

  adminCommunityBody.value =
    post.body || "";

  adminCommunityVideoUrl.value =
    post.video_url || "";

  renderAdminCommunityVideoPreview();

  adminCommunityEditorTitle.textContent =
    "센터 소식 수정";

  saveAdminCommunityButton.textContent =
    "수정 내용 저장";

  cancelAdminCommunityEditButton.hidden = false;

  adminCommunityMessage.textContent =
    "기존 내용을 수정한 뒤 저장해 주세요.";

  renderAdminCommunityImagePreview();

  document
    .querySelector("#adminCommunityEditor")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  adminCommunityTitle.focus();
}


// 수정 취소 버튼 연결
cancelAdminCommunityEditButton.addEventListener(
  "click",
  resetAdminCommunityEditor
);

// 센터 소식 이미지 추가 선택
adminCommunityImages.addEventListener(
  "change",
  function () {
    const newlySelectedFiles = Array.from(
      adminCommunityImages.files || []
    );

    /*
      같은 파일을 다시 선택해도 change가
      작동할 수 있도록 입력창만 초기화
    */
    adminCommunityImages.value = "";

    if (newlySelectedFiles.length === 0) {
      return;
    }

    const allowedImageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    const hasInvalidFile =
      newlySelectedFiles.some(
        function (file) {
          return !allowedImageTypes.includes(
            file.type
          );
        }
      );

    if (hasInvalidFile) {
      adminCommunityMessage.textContent =
        "JPG, PNG, WEBP 이미지만 선택할 수 있습니다.";

      return;
    }

    // 이미 선택된 동일 파일은 제외
    const filesToAdd =
      newlySelectedFiles.filter(
        function (newFile) {
          return !selectedAdminCommunityFiles.some(
            function (selectedFile) {
              return (
                selectedFile.name ===
                newFile.name &&
                selectedFile.size ===
                newFile.size &&
                selectedFile.lastModified ===
                newFile.lastModified
              );
            }
          );
        }
      );

    if (
      existingAdminCommunityImages.length +
      selectedAdminCommunityFiles.length +
      filesToAdd.length >
      5
    ) {
      adminCommunityMessage.textContent =
        "이미지는 최대 5장까지 선택할 수 있습니다.";

      return;
    }

    selectedAdminCommunityFiles = [
      ...selectedAdminCommunityFiles,
      ...filesToAdd
    ];

    renderAdminCommunityImagePreview();

    if (
      filesToAdd.length <
      newlySelectedFiles.length
    ) {
      adminCommunityMessage.textContent =
        "이미 선택한 파일은 중복에서 제외했습니다.";
    } else {
      adminCommunityMessage.textContent = "";
    }
  }
);

// 센터 소식 이미지 용량 최적화
async function optimizeCommunityImage(
  originalFile
) {
  const maximumLength = 1600;
  const webpQuality = 0.85;

  const sourceUrl =
    URL.createObjectURL(originalFile);

  try {
    const sourceImage =
      await new Promise(
        function (resolve, reject) {
          const image =
            new Image();

          image.onload = function () {
            resolve(image);
          };

          image.onerror = function () {
            reject(
              new Error(
                "이미지 파일을 읽을 수 없습니다."
              )
            );
          };

          image.src = sourceUrl;
        }
      );

    const originalWidth =
      sourceImage.naturalWidth;

    const originalHeight =
      sourceImage.naturalHeight;

    if (
      !originalWidth ||
      !originalHeight
    ) {
      throw new Error(
        "이미지 크기를 확인할 수 없습니다."
      );
    }

    /*
      가로와 세로 중 긴 쪽이
      최대 1600px이 되도록 비율 유지
    */
    const resizeRatio = Math.min(
      1,
      maximumLength /
      Math.max(
        originalWidth,
        originalHeight
      )
    );

    const outputWidth = Math.max(
      1,
      Math.round(
        originalWidth * resizeRatio
      )
    );

    const outputHeight = Math.max(
      1,
      Math.round(
        originalHeight * resizeRatio
      )
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const canvasContext =
      canvas.getContext("2d");

    if (!canvasContext) {
      throw new Error(
        "이미지 최적화 기능을 사용할 수 없습니다."
      );
    }

    canvasContext.imageSmoothingEnabled =
      true;

    canvasContext.imageSmoothingQuality =
      "high";

    canvasContext.drawImage(
      sourceImage,
      0,
      0,
      outputWidth,
      outputHeight
    );

    const optimizedBlob =
      await new Promise(
        function (resolve) {
          canvas.toBlob(
            resolve,
            "image/webp",
            webpQuality
          );
        }
      );

    /*
      WebP 변환을 지원하지 않는 환경에서는
      원본 파일을 그대로 사용
    */
    if (!optimizedBlob) {
      return originalFile;
    }

    /*
      원본보다 결과 파일이 커졌다면
      더 작은 원본을 그대로 사용
    */
    if (
      optimizedBlob.size >=
      originalFile.size
    ) {
      return originalFile;
    }

    const originalName =
      originalFile.name.replace(
        /\.[^/.]+$/,
        ""
      ) || "community-image";

    const optimizedFile =
      new File(
        [optimizedBlob],
        `${originalName}.webp`,
        {
          type: "image/webp",
          lastModified: Date.now()
        }
      );

    console.log(
      "센터 소식 이미지 최적화:",
      {
        originalKB: Math.round(
          originalFile.size / 1024
        ),
        optimizedKB: Math.round(
          optimizedFile.size / 1024
        ),
        outputSize:
          `${outputWidth}×${outputHeight}`
      }
    );

    return optimizedFile;

  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

// 기존 센터 소식 수정 저장
async function updateAdminCommunityPost(
  title,
  body,
  videoUrl
) {
  const postId =
    editingAdminCommunityPostId;

  const uploadedImagePaths = [];

  const removedImageIds =
    removedAdminCommunityImages
      .map(function (image) {
        return image.id;
      })
      .filter(Boolean);

  const removedImagePaths =
    removedAdminCommunityImages
      .map(function (image) {
        return image.storage_path;
      })
      .filter(Boolean);

  saveAdminCommunityButton.disabled = true;
  saveAdminCommunityButton.textContent =
    "수정 저장 중...";

  adminCommunityMessage.textContent =
    "센터 소식을 수정하고 있습니다.";

  try {
    if (!postId) {
      throw new Error(
        "수정할 센터 소식을 확인할 수 없습니다."
      );
    }

    const newImageRows = [];

    // 새로 선택한 사진 업로드
    for (
      let index = 0;
      index <
      selectedAdminCommunityFiles.length;
      index += 1
    ) {
      const originalFile =
        selectedAdminCommunityFiles[index];

      adminCommunityMessage.textContent =
        `새 이미지 ${index + 1}/${selectedAdminCommunityFiles.length
        } 최적화 중...`;

      const file =
        await optimizeCommunityImage(
          originalFile
        );

      adminCommunityMessage.textContent =
        `새 이미지 ${index + 1}/${selectedAdminCommunityFiles.length
        } 업로드 중...`;

      const extensionByType = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      };

      const fileExtension =
        extensionByType[file.type] || "jpg";

      const uniqueName =
        `${Date.now()}-${index}-` +
        `${Math.random()
          .toString(36)
          .slice(2)}.${fileExtension}`;

      const storagePath =
        `${postId}/${uniqueName}`;

      const {
        error: uploadError
      } = await supabaseClient.storage
        .from("community-images")
        .upload(
          storagePath,
          file,
          {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      uploadedImagePaths.push(
        storagePath
      );

      newImageRows.push({
        post_id: postId,
        storage_path: storagePath,
        alt_text:
          `${title} 이미지 ${existingAdminCommunityImages.length +
          index +
          1
          }`,
        sort_order:
          existingAdminCommunityImages.length +
          index
      });
    }

    /*
      사진 순번이 겹치지 않도록
      삭제할 기존 사진 정보를 먼저 제거
    */
    if (removedImageIds.length > 0) {
      const {
        error: imageDeleteError
      } = await supabaseClient
        .from("community_post_images")
        .delete()
        .eq("post_id", postId)
        .in("id", removedImageIds);

      if (imageDeleteError) {
        throw imageDeleteError;
      }
    }

    // 남아 있는 기존 사진 순서 정리
    for (
      let index = 0;
      index <
      existingAdminCommunityImages.length;
      index += 1
    ) {
      const image =
        existingAdminCommunityImages[index];

      const {
        error: imageUpdateError
      } = await supabaseClient
        .from("community_post_images")
        .update({
          sort_order: index,
          alt_text:
            `${title} 이미지 ${index + 1}`
        })
        .eq("id", image.id)
        .eq("post_id", postId);

      if (imageUpdateError) {
        throw imageUpdateError;
      }
    }

    /*
      기존 사진 순서를 정리한 다음
      새 사진 정보를 데이터베이스에 저장
    */
    if (newImageRows.length > 0) {
      const {
        error: imageInsertError
      } = await supabaseClient
        .from("community_post_images")
        .insert(newImageRows);

      if (imageInsertError) {
        throw imageInsertError;
      }
    }

    // 제목과 내용 수정
    const {
      data: updatedPosts,
      error: postUpdateError
    } = await supabaseClient
      .from("community_posts")
      .update({
        title: title,
        body: body,
        video_url: videoUrl || null,
        updated_at:
          new Date().toISOString()
      })
      .eq("id", postId)
      .select("id");

    if (postUpdateError) {
      throw postUpdateError;
    }

    if (
      !updatedPosts ||
      updatedPosts.length === 0
    ) {
      throw new Error(
        "수정할 센터 소식을 찾을 수 없습니다."
      );
    }

    let storageCleanupError = null;

    // 삭제한 기존 사진 파일 제거
    if (removedImagePaths.length > 0) {
      const {
        error: removeStorageError
      } = await supabaseClient.storage
        .from("community-images")
        .remove(removedImagePaths);

      storageCleanupError =
        removeStorageError;
    }

    resetAdminCommunityEditor();
    await loadAdminCommunityPosts();

    if (storageCleanupError) {
      console.error(
        "삭제한 소식 이미지 파일 정리 실패:",
        storageCleanupError
      );

      adminCommunityMessage.textContent =
        "소식은 수정했지만 일부 사진 파일 정리에 실패했습니다.";

      return;
    }

    adminCommunityMessage.textContent =
      "센터 소식을 수정했습니다.";

  } catch (updateError) {
    console.error(
      "센터 소식 수정 실패:",
      updateError
    );

    /*
      수정 도중 실패하면 이번에 새로 올린
      사진 정보와 파일만 정리
    */
    if (uploadedImagePaths.length > 0) {
      const {
        error: cleanupRowsError
      } = await supabaseClient
        .from("community_post_images")
        .delete()
        .eq("post_id", postId)
        .in(
          "storage_path",
          uploadedImagePaths
        );

      if (cleanupRowsError) {
        console.error(
          "새 이미지 정보 정리 실패:",
          cleanupRowsError
        );
      }

      const {
        error: cleanupFilesError
      } = await supabaseClient.storage
        .from("community-images")
        .remove(uploadedImagePaths);

      if (cleanupFilesError) {
        console.error(
          "새 이미지 파일 정리 실패:",
          cleanupFilesError
        );
      }
    }

    adminCommunityMessage.textContent =
      `수정 실패: ${updateError.message ||
      "알 수 없는 오류"
      }`;

  } finally {
    saveAdminCommunityButton.disabled =
      false;

    saveAdminCommunityButton.textContent =
      editingAdminCommunityPostId
        ? "수정 내용 저장"
        : "센터 소식 게시";
  }
}

// 센터 소식 게시
async function saveAdminCommunityPost() {
  const title =
    adminCommunityTitle.value.trim();

  const body =
    adminCommunityBody.value.trim();

  const videoUrl =
    adminCommunityVideoUrl.value.trim();

  const videoData =
    videoUrl
      ? getYouTubeVideoData(videoUrl)
      : null;

  if (!title) {
    adminCommunityMessage.textContent =
      "소식 제목을 입력해 주세요.";

    adminCommunityTitle.focus();
    return;
  }

  if (!body) {
    adminCommunityMessage.textContent =
      "소식 내용을 입력해 주세요.";

    adminCommunityBody.focus();
    return;
  }

  if (videoUrl && !videoData) {
    adminCommunityMessage.textContent =
      "올바른 유튜브 영상 또는 쇼츠 주소를 입력해 주세요.";

    adminCommunityVideoUrl.focus();
    return;
  }

  const totalImageCount =
    existingAdminCommunityImages.length +
    selectedAdminCommunityFiles.length;

  if (
    totalImageCount === 0 &&
    !videoData
  ) {
    adminCommunityMessage.textContent =
      "소식 이미지나 영상을 1개 이상 등록해 주세요.";

    return;
  }

  if (totalImageCount > 5) {
    adminCommunityMessage.textContent =
      "이미지는 최대 5장까지 선택할 수 있습니다.";

    return;
  }

  /*
    수정 중이라면 새 게시물을 만들지 않고
    기존 게시물 수정 함수 실행
  */
  if (editingAdminCommunityPostId) {
    await updateAdminCommunityPost(
      title,
      body,
      videoUrl
    );

    return;
  }

  saveAdminCommunityButton.disabled = true;
  saveAdminCommunityButton.textContent =
    "게시 중...";

  adminCommunityMessage.textContent =
    "센터 소식을 저장하고 있습니다.";

  let createdPostId = null;
  const uploadedImagePaths = [];

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error(
        "로그인 정보를 확인할 수 없습니다."
      );
    }

    /*
      이미지 저장이 모두 완료되기 전에는
      회원 화면에 게시물이 나타나지 않도록
      비공개 상태로 먼저 생성
    */
    const {
      data: createdPost,
      error: postInsertError
    } = await supabaseClient
      .from("community_posts")
      .insert({
        title: title,
        body: body,
        video_url: videoUrl || null,
        is_published: false,
        created_by: user.id
      })
      .select("id")
      .single();

    if (postInsertError) {
      throw postInsertError;
    }

    createdPostId = createdPost.id;

    const imageRows = [];

    /*
      선택한 순서대로 이미지를 Storage에
      하나씩 업로드
    */
    for (
      let index = 0;
      index <
      selectedAdminCommunityFiles.length;
      index += 1
    ) {
      const originalFile =
        selectedAdminCommunityFiles[index];

      adminCommunityMessage.textContent =
        `이미지 ${index + 1}/${selectedAdminCommunityFiles.length
        } 최적화 중...`;

      const file =
        await optimizeCommunityImage(
          originalFile
        );

      adminCommunityMessage.textContent =
        `이미지 ${index + 1}/${selectedAdminCommunityFiles.length
        } 업로드 중...`;

      const extensionByType = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      };

      const fileExtension =
        extensionByType[file.type];

      const uniqueName =
        `${Date.now()}-${index}-` +
        `${Math.random()
          .toString(36)
          .slice(2)}.${fileExtension}`;

      const storagePath =
        `${createdPostId}/${uniqueName}`;

      const {
        error: uploadError
      } = await supabaseClient.storage
        .from("community-images")
        .upload(
          storagePath,
          file,
          {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      uploadedImagePaths.push(
        storagePath
      );

      imageRows.push({
        post_id: createdPostId,
        storage_path: storagePath,
        alt_text:
          `${title} 이미지 ${index + 1}`,
        sort_order: index
      });
    }

    // 선택한 이미지가 있을 때만 이미지 정보를 저장
    if (imageRows.length > 0) {
      const {
        error: imageInsertError
      } = await supabaseClient
        .from("community_post_images")
        .insert(imageRows);

      if (imageInsertError) {
        throw imageInsertError;
      }
    }

    /*
      본문과 이미지가 모두 저장된 후
      회원에게 공개
    */
    const {
      error: publishError
    } = await supabaseClient
      .from("community_posts")
      .update({
        is_published: true,
        published_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString()
      })
      .eq("id", createdPostId);

    if (publishError) {
      throw publishError;
    }

    adminCommunityTitle.value = "";
    adminCommunityBody.value = "";
    adminCommunityVideoUrl.value = "";

    renderAdminCommunityVideoPreview();
    resetAdminCommunityImages();

    await loadAdminCommunityPosts();

    adminCommunityMessage.textContent =
      "센터 소식을 게시했습니다.";

  } catch (saveError) {
    console.error(
      "센터 소식 게시 실패:",
      saveError
    );

    /*
      저장 도중 실패했다면 이미 업로드된
      이미지와 미완성 게시물을 정리
    */
    if (uploadedImagePaths.length > 0) {
      const {
        error: cleanupImageError
      } = await supabaseClient.storage
        .from("community-images")
        .remove(uploadedImagePaths);

      if (cleanupImageError) {
        console.error(
          "소식 이미지 정리 실패:",
          cleanupImageError
        );
      }
    }

    if (createdPostId !== null) {
      const {
        error: cleanupPostError
      } = await supabaseClient
        .from("community_posts")
        .delete()
        .eq("id", createdPostId);

      if (cleanupPostError) {
        console.error(
          "미완성 소식 정리 실패:",
          cleanupPostError
        );
      }
    }

    adminCommunityMessage.textContent =
      `게시 실패: ${saveError.message ||
      "알 수 없는 오류"
      }`;

  } finally {
    saveAdminCommunityButton.disabled =
      false;

    saveAdminCommunityButton.textContent =
      "센터 소식 게시";
  }
}


// 센터 소식 게시 버튼 연결
saveAdminCommunityButton.addEventListener(
  "click",
  saveAdminCommunityPost
);

function appendTextWithLinks(container, text) {
  const urlPattern = /https?:\/\/[^\s]+/g;
  let lastIndex = 0;

  for (const match of text.matchAll(urlPattern)) {
    const url = match[0];

    container.append(
      document.createTextNode(text.slice(lastIndex, match.index))
    );

    const link = document.createElement("a");
    link.href = url;
    link.textContent = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.append(link);

    lastIndex = match.index + url.length;
  }

  container.append(document.createTextNode(text.slice(lastIndex)));
}

function renderRoutineDescription(description) {
  routineDescription.replaceChildren();
  routineDescription.classList.remove("is-expanded");

  if (!description || !description.trim()) {
    routineDescription.hidden = true;
    toggleRoutineDescriptionButton.hidden = true;
    return;
  }

  description.trim().split(/\n+/).forEach((line) => {
    const paragraph = document.createElement("p");

    appendTextWithLinks(paragraph, line);

    routineDescription.append(paragraph);
  });

  routineDescription.hidden = false;
  toggleRoutineDescriptionButton.hidden = false;
  toggleRoutineDescriptionButton.textContent = "설명 더 보기";
  toggleRoutineDescriptionButton.setAttribute("aria-expanded", "false");
}

// 폼 접수는 Google Apps Script에서 처리합니다. 복귀 링크는 화면 이동만 합니다.
function clearRoutineRequestReturnFlag() {
  const cleanUrl = new URL(window.location.href);
  if (cleanUrl.searchParams.get("routine-requested") !== "1") return;
  cleanUrl.searchParams.delete("routine-requested");
  window.history.replaceState(
    window.history.state,
    "",
    cleanUrl.pathname + cleanUrl.search + cleanUrl.hash
  );
}

let routineRequestStatusLoadId = 0;

// 다른 기기에서 제출해도 서버에 저장된 대기 신청을 기준으로 안내합니다.
async function updateRoutineRequestStatus(userId) {
  const requestId = ++routineRequestStatusLoadId;
  if (appScreen.hidden) return;
  try {
    const { data, error } = await supabaseClient
      .from("routine_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (requestId !== routineRequestStatusLoadId || appScreen.hidden) return;
    if (error) throw error;
    routineRequestStatusMessage.hidden = !data;
  } catch (error) {
    // 조회 실패를 '접수되지 않음'으로 단정하거나 기존 운동 카드를 지우지 않습니다.
    if (requestId === routineRequestStatusLoadId && !appScreen.hidden) {
      console.error("운동 구성 신청 상태 확인 실패:", error);
    }
  }
}

// 회원 루틴 캐러셀 상태
let memberRoutineCarouselState = null;
let memberRoutineLoadRequestId = 0;
let memberRoutineDisplayedUserId = null;
let memberRoutineDisplayedId = null;

// 기존 이미지 영역 아래에 운동 카드 영역을 한 번만 만듭니다.
const memberRoutineComponents = document.createElement("section");
memberRoutineComponents.id = "memberRoutineComponents";
memberRoutineComponents.className = "member-routine-components";
memberRoutineComponents.setAttribute("aria-label", "배정된 운동 구성");
memberRoutineComponents.hidden = true;
routineCarousel.insertAdjacentElement("afterend", memberRoutineComponents);
let memberRoutineComponentsKey = null;
const memberRoutineSummary = document.querySelector("#memberRoutineSummary");
const memberWorkoutTitle = document.querySelector("#memberWorkoutTitle");
const memberRoutinePlaceholder = document.querySelector("#memberRoutinePlaceholder");

function resetMemberRoutineComponents() {
  memberRoutineComponents.replaceChildren();
  memberRoutineComponents.hidden = true;
  memberRoutineComponentsKey = null;
  memberRoutineSummary.replaceChildren();
  memberRoutineSummary.hidden = true;
  memberWorkoutTitle.textContent = "나의 운동 구성";
  memberRoutinePlaceholder.textContent = "운동 구성을 불러오고 있어요.";
  memberRoutinePlaceholder.hidden = false;
}

function prepareMemberRoutineComponents(data, userId) {
  if (data.routine_json == null) return { key: null, node: null };
  if (!window.RoutineComponents) {
    throw new Error("운동 카드 파일을 불러오지 못했습니다. 앱을 새로고침해 주세요.");
  }
  const routine = window.RoutineComponents.parseRoutineJson(
    JSON.stringify(data.routine_json)
  );
  const key = JSON.stringify([userId, String(data.id), routine]);
  return {
    key,
    node: key === memberRoutineComponentsKey
      ? null : window.RoutineComponents.renderRoutine(routine, { layout: "tabs" })
  };
}

function showMemberRoutineComponents(prepared) {
  if (prepared.key === null) {
    if (memberRoutineComponentsKey !== null) resetMemberRoutineComponents();
    return;
  }
  // 내용이 같으면 선택한 패턴, 상세설명, 영상과 안내 펼침 상태를 유지합니다.
  if (prepared.key !== memberRoutineComponentsKey) {
    const summary = prepared.node.querySelector(".routine-component-summary");
    memberRoutineSummary.replaceChildren(summary);
    memberRoutineComponents.replaceChildren(prepared.node);
    memberRoutineComponentsKey = prepared.key;
  }
  memberRoutineComponents.hidden = false;
  memberRoutineSummary.hidden = false;
  memberWorkoutTitle.textContent = "하루에 한 패턴씩 운동하면 됩니다";
  memberRoutinePlaceholder.hidden = true;
}

function getRoutineImageKey(item) {
  return item.image_path
    ? `path:${item.image_path}`
    : `url:${item.image_url}`;
}

// 기존 캐러셀 정리
function resetMemberRoutineCarousel() {
  memberRoutineCarouselState?.dispose();

  memberRoutineCarouselState = null;
  memberRoutineDisplayedUserId = null;
  memberRoutineDisplayedId = null;

  routineCarousel.replaceChildren();
  routineCarousel.hidden = true;
}

// 회원 루틴 이미지·캡션 캐러셀 표시
function renderMemberRoutineCarousel(
  imageItems,
  routineName,
  preservePosition = false
) {
  if (imageItems.length === 0) {
    resetMemberRoutineCarousel();
    return;
  }

  const keys = imageItems.map(getRoutineImageKey);
  const previous = memberRoutineCarouselState;

  const sameImages =
    previous &&
    previous.keys.length === keys.length &&
    previous.keys.every(
      (key, index) => key === keys[index]
    );

  // 이미지가 같으면 기존 요소를 유지하고 캡션만 갱신
  if (sameImages) {
    previous.items = imageItems;

    previous.slides.forEach(function (slide, index) {
      const caption = slide.querySelector("figcaption");
      const text = imageItems[index].caption || "";

      if (caption.textContent !== text) {
        caption.textContent = text;
      }

      caption.hidden = !text;

      slide.querySelector("img").alt =
        `${routineName} 이미지 ${index + 1}`;
    });

    routineCarousel.hidden = false;

    if (!preservePosition) {
      previous.moveTo(0, false);
    }

    previous.scheduleLayout();
    return;
  }

  const previousKey =
    preservePosition && previous
      ? previous.keys[previous.index]
      : null;

  const initialIndex = Math.max(
    0,
    keys.indexOf(previousKey)
  );

  previous?.dispose();

  const track = document.createElement("div");
  track.className = "routine-carousel-track";

  track.classList.toggle(
    "has-multiple-images",
    imageItems.length > 1
  );

  track.tabIndex = imageItems.length > 1 ? 0 : -1;

  track.setAttribute(
    "aria-label",
    "루틴 이미지, 좌우 방향키로 이동"
  );

  const controls = document.createElement("div");
  controls.className = "routine-carousel-controls";
  controls.hidden = imageItems.length <= 1;

  function makeArrow(text, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "routine-carousel-button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    return button;
  }

  const previousButton =
    makeArrow("‹", "이전 루틴 이미지");

  const nextButton =
    makeArrow("›", "다음 루틴 이미지");

  const dotArea = document.createElement("div");
  dotArea.className = "routine-carousel-dots";

  const dots = [];
  const slides = [];

  let frame = 0;
  let resizeObserver;

  const state = {
    keys,
    items: imageItems,
    slides,
    index: initialIndex,
    width: 0,
    moveTo,
    scheduleLayout,
    dispose() {
      resizeObserver?.disconnect();
      cancelAnimationFrame(frame);
    }
  };

  // 현재 이미지와 캡션의 높이에 맞추기
  function scheduleLayout() {
    cancelAnimationFrame(frame);

    frame = requestAnimationFrame(function () {
      if (memberRoutineCarouselState !== state) {
        return;
      }

      const width = track.clientWidth;

      if (!width) {
        return;
      }

      if (state.width !== width) {
        state.width = width;

        track.scrollTo({
          left: width * state.index,
          behavior: "instant"
        });
      }

      // 전체 슬라이드 중 가장 높은 내용에 맞춰 높이 유지
      track.style.removeProperty("height");
    });
  }

  function updateControls(index) {
    state.index = Math.max(
      0,
      Math.min(index, imageItems.length - 1)
    );

    previousButton.disabled = state.index === 0;

    nextButton.disabled =
      state.index === imageItems.length - 1;

    dots.forEach(function (dot, dotIndex) {
      const active = dotIndex === state.index;

      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", String(active));
    });

    scheduleLayout();
  }

  function moveTo(index, smooth = true) {
    updateControls(index);

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    track.scrollTo({
      left: track.clientWidth * state.index,
      behavior: smooth && !reduced ? "smooth" : "instant"
    });
  }

  imageItems.forEach(function (item, index) {
    const slide = document.createElement("figure");
    slide.className = "routine-carousel-slide";

    const img =
      item.imageElement || document.createElement("img");

    img.alt = `${routineName} 이미지 ${index + 1}`;
    img.draggable = false;
    img.addEventListener("load", scheduleLayout);

    if (!item.imageElement) {
      img.src = item.previewUrl;
    }

    const caption = document.createElement("figcaption");
    caption.className = "routine-carousel-caption";
    caption.textContent = item.caption || "";
    caption.hidden = !item.caption;

    slide.append(img, caption);
    slides.push(slide);
    track.append(slide);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "routine-carousel-dot";

    dot.setAttribute(
      "aria-label",
      `${index + 1}번 루틴 이미지 보기`
    );

    dot.addEventListener("click", function () {
      moveTo(index);
    });

    dots.push(dot);
    dotArea.append(dot);
  });

  previousButton.addEventListener("click", function () {
    moveTo(state.index - 1);
  });

  nextButton.addEventListener("click", function () {
    moveTo(state.index + 1);
  });

  // 모바일 스와이프에 맞춰 위치 표시 갱신
  track.addEventListener(
    "scroll",
    function () {
      if (!track.clientWidth) {
        return;
      }

      if (track.clientWidth !== state.width) {
        scheduleLayout();
        return;
      }

      updateControls(
        Math.round(track.scrollLeft / track.clientWidth)
      );
    },
    { passive: true }
  );

  // 키보드로 이미지 이동
  track.addEventListener("keydown", function (event) {
    const targets = {
      ArrowLeft: state.index - 1,
      ArrowRight: state.index + 1,
      Home: 0,
      End: imageItems.length - 1
    };

    if (!(event.key in targets)) {
      return;
    }

    event.preventDefault();
    moveTo(targets[event.key]);
  });

  // PC 마우스 드래그
  let drag = null;

  track.addEventListener("pointerdown", function (event) {
    if (
      imageItems.length <= 1 ||
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      event.target.closest("figcaption")
    ) {
      return;
    }

    event.preventDefault();

    drag = {
      id: event.pointerId,
      x: event.clientX,
      left: track.scrollLeft
    };

    track.classList.add("is-dragging");
    track.setPointerCapture(event.pointerId);
  });

  track.addEventListener("pointermove", function (event) {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }

    track.scrollLeft =
      drag.left - (event.clientX - drag.x);
  });

  function finishDrag() {
    if (!drag) {
      return;
    }

    const pointerId = drag.id;
    drag = null;

    if (track.hasPointerCapture(pointerId)) {
      track.releasePointerCapture(pointerId);
    }

    track.classList.remove("is-dragging");

    if (track.clientWidth) {
      moveTo(
        Math.round(track.scrollLeft / track.clientWidth)
      );
    }
  }

  track.addEventListener("pointerup", finishDrag);
  track.addEventListener("pointercancel", finishDrag);
  track.addEventListener("lostpointercapture", finishDrag);

  controls.append(previousButton, dotArea, nextButton);

  memberRoutineCarouselState = state;

  routineCarousel.replaceChildren(track, controls);
  routineCarousel.hidden = false;

  resizeObserver = new ResizeObserver(scheduleLayout);

  slides.forEach(function (slide) {
    resizeObserver.observe(slide);
  });

  updateControls(initialIndex);
}

// 루틴 이미지를 화면에 표시하기 전에 준비
function preloadMemberRoutineImage(item) {
  return new Promise(function (resolve, reject) {
    const imageElement = new Image();

    const timer = setTimeout(function () {
      finish(
        new Error("루틴 이미지 로딩 시간이 초과되었습니다.")
      );
    }, 30000);

    function finish(error) {
      clearTimeout(timer);

      imageElement.onload = null;
      imageElement.onerror = null;

      if (error) {
        reject(error);
      } else {
        resolve({
          ...item,
          imageElement
        });
      }
    }

    imageElement.onload = function () {
      finish();
    };

    imageElement.onerror = function () {
      finish(
        new Error("루틴 이미지를 불러오지 못했습니다.")
      );
    };

    imageElement.src = item.previewUrl;
  });
}

// 회원에게 배정된 최신 루틴 불러오기
async function loadMemberRoutine(
  userId,
  preserveCurrentRoutine = false
) {
  const requestId = ++memberRoutineLoadRequestId;

  const keepCurrent =
    preserveCurrentRoutine &&
    memberRoutineDisplayedUserId === userId;

  function isCurrentRequest() {
    return (
      requestId === memberRoutineLoadRequestId &&
      !appScreen.hidden
    );
  }

  if (!keepCurrent) {
    resetMemberRoutineCarousel();
    resetMemberRoutineComponents();

    routineDescription.replaceChildren();
    routineDescription.hidden = true;

    delete routineDescription.dataset.sourceText;

    toggleRoutineDescriptionButton.hidden = true;

    assignedRoutineName.textContent =
      "불러오는 중...";
  }

  try {
    const { data, error } = await supabaseClient
      .from("member_routines")
      .select(
        `
          id,
          routine_name,
          routine_image_url,
          routine_image_path,
          routine_images,
          routine_description,
          routine_json,
          assigned_at
        `
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("assigned_at", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (!isCurrentRequest()) {
      return;
    }

    if (error) {
      throw error;
    }

    if (!data) {
      resetMemberRoutineCarousel();
      resetMemberRoutineComponents();

      renderRoutineDescription("");

      routineDescription.dataset.sourceText = "";

      assignedRoutineName.textContent =
        "배정된 루틴이 없습니다.";
      memberRoutinePlaceholder.textContent = "아직 배정된 운동 구성이 없어요. 아래에서 새 운동 구성을 신청해 주세요.";

      updateRoutineRequestStatus(userId, null);

      return;
    }

    const preparedComponents = prepareMemberRoutineComponents(data, userId);
    const hasRoutineComponents = preparedComponents.key !== null;
    let imageItems = [];

    // JSON 루틴은 운동 카드만 표시하므로 기존 루틴 이미지는 조회하지 않습니다.
    if (!hasRoutineComponents) {
      const entries = getRoutineImageEntries(data);
      const previous = memberRoutineCarouselState;

      const sameImages =
        keepCurrent &&
        previous &&
        previous.keys.length === entries.length &&
        previous.keys.every(function (key, index) {
          return (
            key === getRoutineImageKey(entries[index])
          );
        });

      if (sameImages) {
        // 이미지가 같으면 기존 이미지를 유지하고 캡션만 반영
        imageItems = entries.map(function (entry, index) {
          return {
            ...previous.items[index],
            ...entry
          };
        });
      } else {
        const resolvedItems =
          await resolveRoutineImageItems(data);

        if (!isCurrentRequest()) {
          return;
        }

        // 새 이미지가 준비될 때까지 기존 화면 유지
        imageItems = await Promise.all(
          resolvedItems.map(preloadMemberRoutineImage)
        );

        if (!isCurrentRequest()) {
          return;
        }
      }
    }

    const sameRoutine =
      keepCurrent &&
      memberRoutineDisplayedId === data.id;

      const description = hasRoutineComponents
      ? ""
      : data.routine_description || "";

    if (hasRoutineComponents) {
      // 처음 전환할 때만 캐러셀을 정리하고, 같은 JSON의 자동 갱신은 유지합니다.
      if (memberRoutineCarouselState || !routineCarousel.hidden) {
        resetMemberRoutineCarousel();
      }
    } else {
      renderMemberRoutineCarousel(
        imageItems,
        data.routine_name,
        sameRoutine
      );
    }
    showMemberRoutineComponents(preparedComponents);
    if (!hasRoutineComponents) {
      memberWorkoutTitle.textContent = "나의 운동 구성";
      memberRoutinePlaceholder.hidden = imageItems.length > 0;
      memberRoutinePlaceholder.textContent = "등록된 운동 이미지가 없습니다.";
    }

    assignedRoutineName.textContent =
      data.routine_name;

    // 이미지 캡션과 별개인 기존 설명·링크 영역
    if (
      !sameRoutine ||
      routineDescription.dataset.sourceText !==
        description
    ) {
      renderRoutineDescription(description);

      routineDescription.dataset.sourceText =
        description;
    }

    memberRoutineDisplayedUserId = userId;
    memberRoutineDisplayedId = data.id;

    updateRoutineRequestStatus(
      userId,
      data.assigned_at
    );
  } catch (error) {
    if (!isCurrentRequest()) {
      return;
    }

    console.error("루틴 불러오기 실패:", error);

    // 자동 갱신 실패 시에는 기존 화면 유지
    if (!keepCurrent) {
      assignedRoutineName.textContent =
        "루틴을 불러오지 못했습니다.";
      memberRoutinePlaceholder.textContent = "운동 구성을 불러오지 못했어요. 상단 새로고침 버튼으로 다시 확인해 주세요.";
      memberRoutinePlaceholder.hidden = false;

      updateRoutineRequestStatus(userId, null);
    }
  }
}

// 일반 회원 화면 표시
async function showWorkoutApp(userId) {
  routineRequestStatusLoadId += 1;
  routineRequestStatusMessage.hidden = true;
  stopAdminMemberAutoRefresh();
  await stopCommunityRealtimeSubscription();
  loginScreen.hidden = true;
  adminScreen.hidden = true;
  appScreen.hidden = false;

  const memberTabBeforeRefresh =
    sessionStorage.getItem("memberTabBeforeRefresh");

  showMemberTab(
    memberTabPanels[memberTabBeforeRefresh]
      ? memberTabBeforeRefresh
      : "routine"
  );

  sessionStorage.removeItem(
    "memberTabBeforeRefresh"
  );
  resetWorkoutCalendar();

  memberInquiryVisibleCount =
    MEMBER_INQUIRY_PAGE_SIZE;

  clearRoutineRequestReturnFlag();

  await Promise.all([
    loadMemberRoutine(userId),
    loadWorkoutRecords(userId),
    loadCommunityPosts(),
    loadMemberInquirySetting(),
    loadMemberInquiries()
  ]);

  await Promise.all([
    startInquiryRealtimeSubscription(
      "member"
    ),
    startMemberRoutineRealtimeSubscription(
      userId
    ),
    startCommunityRealtimeSubscription()
  ]);

}

// 관리자용 새 루틴 신청 목록 표시
function renderAdminRoutineRequests(
  requests
) {
  adminRoutineRequestList
    .replaceChildren();

  if (
    !requests ||
    requests.length === 0
  ) {
    adminRoutineRequestListMessage
      .textContent =
      "현재 대기 중인 루틴 신청이 없습니다.";

    return;
  }

  adminRoutineRequestListMessage
    .textContent = "";

  requests.forEach(function (request) {
    const requestCard =
      document.createElement("article");

    requestCard.className =
      "admin-routine-request-card";

    const requestContent =
      document.createElement("div");

    requestContent.className =
      "admin-routine-request-content";

    const requestHeader =
      document.createElement("div");

    requestHeader.className =
      "admin-routine-request-header";

    const memberName =
      document.createElement("strong");

    memberName.textContent =
      request.memberProfile
        ?.display_name ||
      "회원 정보 없음";

    const statusBadge =
      document.createElement("span");

    statusBadge.className =
      "admin-routine-request-badge";

    statusBadge.textContent =
      "루틴 신청 대기";

    requestHeader.append(
      memberName,
      statusBadge
    );

    const requestDate =
      document.createElement("p");

    requestDate.className =
      "admin-routine-request-date";

    requestDate.textContent =
      `신청 ${formatMemberInquiryDate(
        request.requested_at
      )}`;

    const contactParts = [];

    if (
      request.memberProfile?.email
    ) {
      contactParts.push(
        request.memberProfile.email
      );
    }

    if (
      request.memberProfile?.phone_last4
    ) {
      contactParts.push(
        `전화번호 끝 ${request.memberProfile.phone_last4
        }`
      );
    }

    requestContent.append(
      requestHeader,
      requestDate
    );

    if (contactParts.length > 0) {
      const memberContact =
        document.createElement("p");

      memberContact.className =
        "admin-routine-request-contact";

      memberContact.textContent =
        contactParts.join(" · ");

      requestContent.append(
        memberContact
      );
    }

    const selectMemberButton =
      document.createElement("button");

    selectMemberButton.type =
      "button";

    selectMemberButton.className =
      "admin-routine-request-select-button";

    selectMemberButton.textContent =
      "루틴 배정하기";

      selectMemberButton.addEventListener(
        "click",
        async function () {
          if (isAdminRoutineSaving) {
            adminRoutineRequestListMessage.textContent =
              "루틴 저장 중입니다. 저장 완료 후 선택해 주세요.";
            return;
          }
  
          if (isAdminRoutineRequestSelecting) {
            return;
          }
  
          isAdminRoutineRequestSelecting = true;
          syncAdminRoutineFormatUI();
          selectMemberButton.disabled = true;

        try {
          // 새로 가입한 회원도 선택할 수 있도록 갱신
          await loadAdminMembers();

          if (adminScreen.hidden) {
            return;
          }

          adminMemberSearch.value = "";
          adminMemberSelect.value =
            request.user_id;

          if (
            adminMemberSelect.value !==
            request.user_id
          ) {
            adminRoutineRequestListMessage.textContent =
              "회원을 선택하지 못했습니다. 회원 목록을 확인해 주세요.";

            return;
          }

          await loadSelectedAdminMemberRoutine();

          if (
            adminScreen.hidden ||
            adminMemberSelect.value !==
            request.user_id ||
            saveAdminRoutineButton.disabled
          ) {
            return;
          }

          // 기존 루틴 수정이 아닌 새 배정 모드
          adminRoutineMode = "new";
          renderAdminRoutineEditor();

          const memberSearchCard =
            adminMemberSearch.closest(
              ".admin-card"
            );

          memberSearchCard?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

        } catch (selectError) {
          console.error(
            "신청 회원 선택 실패:",
            selectError
          );

          adminRoutineRequestListMessage.textContent =
            "회원 정보를 불러오지 못했습니다. 다시 시도해 주세요.";

          } finally {
            isAdminRoutineRequestSelecting = false;
            syncAdminRoutineFormatUI();
            selectMemberButton.disabled = false;
          }
      }
    );

    requestCard.append(
      requestContent,
      selectMemberButton
    );

    adminRoutineRequestList.append(
      requestCard
    );
  });
}

// 관리자용 새 루틴 신청 목록 불러오기
async function loadAdminRoutineRequests(
  preserveCurrentList = false
) {
  if (adminScreen.hidden) {
    return;
  }

  const currentRequestId =
    ++adminRoutineRequestLoadId;

  const canUpdateList = () =>
    currentRequestId === adminRoutineRequestLoadId &&
    !adminScreen.hidden;

  if (!preserveCurrentList) {
    adminRoutineRequestList.replaceChildren();
    adminRoutineRequestListMessage.textContent =
      "루틴 신청 내역을 불러오고 있습니다.";
  }

  try {
    const { data: requests, error: requestsError } =
      await supabaseClient
        .from("routine_requests")
        .select("id, user_id, status, requested_at")
        .eq("status", "pending")
        .order("requested_at", { ascending: false });

    if (!canUpdateList()) {
      return;
    }

    if (requestsError) {
      throw requestsError;
    }

    const memberIds = [
      ...new Set(
        (requests || []).map((request) => request.user_id)
      )
    ];

    let memberProfiles = [];

    if (memberIds.length > 0) {
      const { data: profiles, error: profilesError } =
        await supabaseClient
          .from("profiles")
          .select("id, display_name, email, phone_last4")
          .in("id", memberIds);

      if (!canUpdateList()) {
        return;
      }

      if (profilesError) {
        throw profilesError;
      }

      memberProfiles = profiles || [];
    }

    const profileById = new Map(
      memberProfiles.map((profile) => [
        profile.id,
        profile
      ])
    );

    const requestsWithProfiles = (requests || []).map(
      (request) => ({
        ...request,
        memberProfile:
          profileById.get(request.user_id) || null
      })
    );

    if (!canUpdateList()) {
      return;
    }

    renderAdminRoutineRequests(requestsWithProfiles);
  } catch (loadError) {
    if (!canUpdateList()) {
      return;
    }

    console.error(
      "루틴 신청 내역 불러오기 실패:",
      loadError
    );

    if (!preserveCurrentList) {
      adminRoutineRequestList.replaceChildren();
    }

    adminRoutineRequestListMessage.textContent =
      "루틴 신청 내역을 불러오지 못했습니다.";
  }
}

// 관리자 화면에서만 최신 가입 여부를 확인합니다. 전체 루틴은 새 회원이 있을 때만 조회합니다.
function stopAdminMemberAutoRefresh() {
  clearInterval(adminMemberRefreshTimer);
  adminMemberRefreshTimer = null;
  adminMemberRefreshGeneration += 1;
  adminMemberLoadRequestId += 1;
  isAdminMemberRefreshRunning = false;
}

function startAdminMemberAutoRefresh() {
  stopAdminMemberAutoRefresh();
  if (adminScreen.hidden) return;
  adminMemberRefreshTimer = setInterval(refreshAdminMembersIfNeeded, 10000);
  refreshAdminMembersIfNeeded();
}

function canAutoRefreshAdminMembers() {
  return adminMemberRefreshTimer !== null &&
    !adminScreen.hidden && document.visibilityState === "visible" &&
    !isAdminRoutineSaving && !isAdminRoutineRequestSelecting &&
    !adminMemberSelect.disabled;
}

async function refreshAdminMembersIfNeeded() {
  if (!canAutoRefreshAdminMembers() || isAdminMemberRefreshRunning) return;
  const generation = adminMemberRefreshGeneration;
  isAdminMemberRefreshRunning = true;

  try {
    const { data: newestMembers, error } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("role", "member")
      .order("created_at", { ascending: false })
      .limit(1);

    if (generation !== adminMemberRefreshGeneration || !canAutoRefreshAdminMembers()) return;
    if (error) throw error;

    const newestMemberId = newestMembers?.[0]?.id;
    if (newestMemberId && !adminMemberOptionCache.some(option => option.value === newestMemberId)) {
      await loadAdminMembers(true);
    }
  } catch (error) {
    if (generation === adminMemberRefreshGeneration && !adminScreen.hidden) {
      console.error("신규 회원 자동 갱신 실패:", error);
    }
  } finally {
    if (generation === adminMemberRefreshGeneration) isAdminMemberRefreshRunning = false;
  }
}

window.addEventListener("online", refreshAdminMembersIfNeeded);

// 자동 갱신은 선택·검색·편집 내용을 유지하고, 기존 수동 갱신은 전체 목록을 표시합니다.
async function loadAdminMembers(preserveCurrentState = false) {
  if (adminScreen.hidden) return false;
  if (preserveCurrentState && !canAutoRefreshAdminMembers()) return false;
  const requestId = ++adminMemberLoadRequestId;
  const canApply = () => requestId === adminMemberLoadRequestId &&
    !adminScreen.hidden && (!preserveCurrentState || canAutoRefreshAdminMembers());

  try {
    const [
      { data: members, error: membersError },
      { data: routines, error: routinesError }
    ] = await Promise.all([
      supabaseClient
        .from("profiles")
        .select("id, display_name, email, phone_last4, created_at")
        .eq("role", "member")
        .order("created_at", { ascending: false }),

      supabaseClient
        .from("member_routines")
        .select(
          "user_id, routine_name, routine_image_path, is_active, assigned_at"
        )
        .order("assigned_at", { ascending: false })
    ]);

    if (!canApply()) return false;

    if (membersError || routinesError) {
      throw membersError || routinesError;
    }

    const routineSummaryByUser = new Map();

    (routines || []).forEach((routine) => {
      const summary = routineSummaryByUser.get(routine.user_id) || {
        assignmentCount: 0,
        currentRoutineName: "",
        currentRoutineImagePath: ""
      };

      summary.assignmentCount += 1;

      if (routine.is_active && !summary.currentRoutineName) {
        summary.currentRoutineName = routine.routine_name;
        summary.currentRoutineImagePath =
          routine.routine_image_path || "";
      }

      routineSummaryByUser.set(routine.user_id, summary);
    });

    const memberOptions = (members || []).map((member) => {
      const option = document.createElement("option");
      const memberName = member.display_name || "이름 없음";
      const phoneText = member.phone_last4
        ? ` · ${member.phone_last4}`
        : "";

      const summary = routineSummaryByUser.get(member.id) || {
        assignmentCount: 0,
        currentRoutineName: "",
        currentRoutineImagePath: ""
      };

      const routineStatus = summary.currentRoutineName
        ? "루틴 있음"
        : "루틴 없음";

      option.value = member.id;
      option.dataset.memberName = memberName;
      option.dataset.email = member.email || "";
      option.dataset.assignmentCount = String(summary.assignmentCount);
      option.dataset.currentRoutineName = summary.currentRoutineName;
      option.dataset.currentRoutineImagePath =
        summary.currentRoutineImagePath;
      option.textContent =
        `${memberName}${phoneText} · ` +
        `${summary.assignmentCount}회 배정 · ${routineStatus}`;

      return option;
    });

    // 조회 중에 회원이나 검색어가 바뀌었을 수 있으므로, 반영 직전의 값을 유지합니다.
    const selectedValue = preserveCurrentState ? adminMemberSelect.value : "";
    const searchText = preserveCurrentState ? adminMemberSearch.value.trim().toLowerCase() : "";
    adminMemberOptionCache = memberOptions;
    renderAdminMemberOptions(selectedValue, searchText);
    return true;
  } catch (error) {
    if (!canApply()) return false;
    console.error("관리자 회원 정보 불러오기 실패:", error);
    if (!preserveCurrentState) {
      adminMemberOptionCache = [];
      adminMemberSelect.innerHTML =
        '<option value="">회원 목록을 불러오지 못했습니다.</option>';
    }
    return false;
  }
}

function renderAdminMemberOptions(selectedValue = "", searchText = "") {
  const previousSelection = Array.from(adminMemberSelect.options)
    .find(option => option.value === selectedValue && selectedValue);

  const matchingOptions = adminMemberOptionCache.filter(
    (option) => {
      const optionText =
        option.textContent.toLowerCase();

      const email =
        (option.dataset.email || "").toLowerCase();

      return option.value === selectedValue || `${optionText} ${email}`.includes(searchText);
    }
  );

  // 조회 결과에서 빠진 회원도 작성 중인 선택은 보존합니다. 편집창을 자동으로 초기화하지 않습니다.
  if (previousSelection && !matchingOptions.some(option => option.value === selectedValue)) {
    matchingOptions.push(previousSelection);
  }

  if (adminMemberOptionCache.length === 0 && !searchText && !previousSelection) {
    adminMemberSelect.innerHTML =
      '<option value="">등록된 회원이 없습니다.</option>';
    return;
  }

  adminMemberSelect.innerHTML =
    '<option value="">루틴을 관리할 회원을 선택하세요.</option>';

  if (matchingOptions.length === 0) {
    const noResultOption =
      document.createElement("option");

    noResultOption.value = "";
    noResultOption.textContent =
      "일치하는 회원이 없습니다.";
    noResultOption.disabled = true;

    adminMemberSelect.append(noResultOption);
  } else {
    matchingOptions.forEach((option) => {
      adminMemberSelect.append(
        option.cloneNode(true)
      );
    });
  }

  adminMemberSelect.value = selectedValue;
}

// 관리자 회원 검색: 사용자가 직접 검색할 때만 기존처럼 회원 선택을 초기화합니다.
adminMemberSearch.addEventListener("input", function () {
  renderAdminMemberOptions("", adminMemberSearch.value.trim().toLowerCase());

  adminMemberSelect.dispatchEvent(
    new Event("change")
  );
});

// 관리자 화면 표시
async function showAdminApp() {
  stopAdminMemberAutoRefresh();
  await stopCommunityRealtimeSubscription();
  resetMemberCommunityPosts();
  loginScreen.hidden = true;
  appScreen.hidden = true;
  adminScreen.hidden = false;

  adminRoutineEditor.hidden = true;
  adminMemberInfo.textContent = "루틴을 관리할 회원을 선택해 주세요.";
  adminMemberSearch.value = "";

  await Promise.all([
    loadAdminRoutineRequests(),
    loadAdminMembers(),
    loadAdminCommunityPosts(),
    loadAdminInquirySetting(),
    loadAdminInquiries()
  ]);

  startAdminMemberAutoRefresh();

  await Promise.all([
    startInquiryRealtimeSubscription(
      "admin"
    ),
    startAdminRoutineRequestSubscription()
  ]);
}

// 현재 로그인한 계정의 역할에 따라 화면 선택
async function showScreenForCurrentUser() {
  renderMemberAccountEmail();
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    loginMessage.textContent = "로그인 정보를 확인하지 못했습니다.";
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error("회원 역할 확인 실패:", profileError);

    loginMessage.textContent = profileError
      ? `회원 정보 오류: ${profileError.message}`
      : "회원 정보 오류: 프로필이 없습니다.";

    return;
  }

  if (profile.role === "admin") {
    await showAdminApp();
    return;
  }

  renderMemberAccountEmail(user.email);
  await showWorkoutApp(user.id);
}

// 기존 단일 이미지와 새 이미지 목록을 같은 형태로 정리
function getRoutineImageEntries(routine) {
  if (!routine) {
    return [];
  }

  let sourceImages = [];

  if (
    Array.isArray(routine.routine_images) &&
    routine.routine_images.length > 0
  ) {
    sourceImages = routine.routine_images;
  } else if (
    routine.routine_image_path ||
    routine.routine_image_url
  ) {
    sourceImages = [
      {
        image_path: routine.routine_image_path || "",
        image_url: routine.routine_image_url || "",
        caption: ""
      }
    ];
  }

  if (sourceImages.length > MAX_ROUTINE_IMAGES) {
    throw new Error("루틴 이미지는 최대 5장까지 사용할 수 있습니다.");
  }

  return sourceImages.map(function (image) {
    const imagePath =
      typeof image?.image_path === "string"
        ? image.image_path
        : "";

    const imageUrl =
      typeof image?.image_url === "string"
        ? image.image_url
        : "";

    if (!imagePath && !imageUrl) {
      throw new Error("루틴 이미지의 저장 주소를 확인할 수 없습니다.");
    }

    return {
      image_path: imagePath,
      image_url: imageUrl,
      caption:
        typeof image.caption === "string"
          ? image.caption
          : ""
    };
  });
}

// 저장된 루틴 이미지의 표시 주소 준비
async function resolveRoutineImageItems(routine) {
  const entries = getRoutineImageEntries(routine);

  return Promise.all(
    entries.map(async function (entry) {
      let previewUrl = entry.image_url;

      if (entry.image_path) {
        const {
          data: signedImageData,
          error: signedImageError
        } = await supabaseClient.storage
          .from("routine-images")
          .createSignedUrl(
            entry.image_path,
            60 * 60
          );

        if (signedImageError) {
          throw signedImageError;
        }

        if (!signedImageData?.signedUrl) {
          throw new Error("루틴 이미지 주소를 만들지 못했습니다.");
        }

        previewUrl = signedImageData.signedUrl;
      }

      return {
        ...entry,
        previewUrl,
        file: null
      };
    })
  );
}

// 관리자 루틴 입력창 모드 표시
function renderAdminRoutineEditor() {
  adminRoutineFormat = adminRoutineMode === "edit" && currentAdminRoutine &&
    currentAdminRoutine.routine_json == null ? "image" : "json";
  window.RoutineComponents?.resetAdminPreview();
  clearAdminRoutineImageItems();

  adminRoutineImage.value = "";
  adminSaveMessage.textContent = "";

  if (
    adminRoutineMode === "edit" &&
    currentAdminRoutine
  ) {
    adminRoutineName.value =
      currentAdminRoutine.routine_name || "";

    adminRoutineDescription.value =
      currentAdminRoutine.routine_description || "";

    if (adminRoutineJsonInput && currentAdminRoutine.routine_json != null) {
      adminRoutineJsonInput.value = JSON.stringify(currentAdminRoutine.routine_json, null, 2);
      adminRoutineJsonMessage.textContent =
        "저장된 운동 구성입니다. 수정 후 JSON 검사 및 미리보기를 눌러 주세요.";
    }

    adminRoutineImageItems =
      (currentAdminRoutine.imageItems || []).map(
        function (item) {
          return {
            ...item,
            file: null
          };
        }
      );

    adminRoutineModeMessage.textContent =
      "현재 배정된 최신 루틴을 수정하고 있습니다.";

    toggleAdminRoutineModeButton.hidden = false;
    toggleAdminRoutineModeButton.textContent =
      "새 루틴 배정하기";

    adminRoutineImageHelp.textContent =
      "기존 이미지를 포함해 최대 5장까지 사용할 수 있습니다. " +
      "캡션과 이미지 순서도 수정할 수 있습니다.";

    saveAdminRoutineButton.textContent =
      "수정 내용 저장";

    renderAdminRoutineImageItems();
    syncAdminRoutineFormatUI();
    return;
  }

  adminRoutineName.value = "";
  adminRoutineDescription.value = "";

  saveAdminRoutineButton.textContent =
    "새 루틴 배정";

  adminRoutineImageHelp.textContent =
    "루틴 이미지를 최대 5장까지 추가해 주세요. " +
    "각 이미지에 캡션을 입력할 수 있습니다.";

  if (currentAdminRoutine) {
    adminRoutineModeMessage.textContent =
      "기존 루틴은 보존하고 새로운 루틴을 배정합니다.";

    toggleAdminRoutineModeButton.hidden = false;
    toggleAdminRoutineModeButton.textContent =
      "최신 루틴 수정으로 돌아가기";
  } else {
    adminRoutineModeMessage.textContent =
      "아직 배정된 루틴이 없습니다. 첫 루틴을 배정해 주세요.";

    toggleAdminRoutineModeButton.hidden = true;
  }
  syncAdminRoutineFormatUI();
}

// 최신 루틴 수정과 새 루틴 배정 모드 전환
toggleAdminRoutineModeButton.addEventListener(
  "click",
  function () {
    if (!currentAdminRoutine || isAdminRoutineSaving ||
        isAdminRoutineRequestSelecting || saveAdminRoutineButton.disabled ||
        adminScreen.hidden || adminRoutineEditor.hidden) {
      return;
    }

    adminRoutineMode =
      adminRoutineMode === "edit"
        ? "new"
        : "edit";

    renderAdminRoutineEditor();
  }
);

// 회원 선택 변경 시 이전 불러오기 결과 구분
let adminRoutineLoadRequestId = 0;

// 관리자 화면에서 회원을 선택했을 때
async function loadSelectedAdminMemberRoutine() {
  const requestId = ++adminRoutineLoadRequestId;
  window.RoutineComponents?.resetAdminPreview();
  const userId = adminMemberSelect.value;

  const selectedOption =
    adminMemberSelect.options[
      adminMemberSelect.selectedIndex
    ];

  function isCurrentSelection() {
    return (
      requestId === adminRoutineLoadRequestId &&
      adminMemberSelect.value === userId &&
      !adminScreen.hidden
    );
  }

  currentAdminRoutine = null;
  adminRoutineMode = "new";
  adminRoutineFormat = "json";

  clearAdminRoutineImageItems();

  adminRoutineName.value = "";
  adminRoutineImage.value = "";
  adminRoutineDescription.value = "";

  adminSaveMessage.textContent = "";
  toggleAdminRoutineModeButton.hidden = true;
  saveAdminRoutineButton.disabled = true;
  syncAdminRoutineFormatUI();

  if (!userId) {
    adminRoutineEditor.hidden = true;

    adminMemberInfo.textContent =
      "루틴을 관리할 회원을 선택해 주세요.";

    return;
  }

  adminRoutineEditor.hidden = false;

  adminRoutineModeMessage.textContent =
    "회원의 최신 루틴을 불러오고 있습니다.";

  const memberName =
    selectedOption?.dataset.memberName || "이름 없음";

  const email =
    selectedOption?.dataset.email || "";

  const emailText =
    email ? ` (${email})` : "";

  const assignmentCount =
    selectedOption?.dataset.assignmentCount || "0";

  const memberSummary =
    `${memberName}${emailText} · ` +
    `총 ${assignmentCount}회 배정`;

  adminMemberInfo.textContent = memberSummary;

  try {
    const {
      data: latestRoutine,
      error: latestRoutineError
    } = await supabaseClient
      .from("member_routines")
      .select(
        "id, routine_name, routine_image_path, " +
        "routine_image_url, routine_images, " +
        "routine_description, routine_json, assigned_at"
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("assigned_at", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (!isCurrentSelection()) {
      return;
    }

    if (latestRoutineError) {
      throw latestRoutineError;
    }

    if (!latestRoutine) {
      adminMemberInfo.textContent =
        `${memberSummary} · 현재 루틴 없음`;

      renderAdminRoutineEditor();

      saveAdminRoutineButton.disabled =
        isAdminRoutineSaving;
      syncAdminRoutineFormatUI();

      return;
    }

    // JSON 편집에는 기존 이미지 주소가 필요하지 않습니다.
    const imageItems = latestRoutine.routine_json != null
      ? []
      : await resolveRoutineImageItems(latestRoutine);

    if (!isCurrentSelection()) {
      return;
    }

    currentAdminRoutine = {
      ...latestRoutine,
      imageItems
    };

    adminRoutineMode = "edit";

    adminMemberInfo.textContent =
      `${memberSummary} · ` +
      `현재 루틴: ${latestRoutine.routine_name}`;

    renderAdminRoutineEditor();

    saveAdminRoutineButton.disabled =
      isAdminRoutineSaving;
    syncAdminRoutineFormatUI();
  } catch (loadError) {
    if (!isCurrentSelection()) {
      return;
    }

    console.error(
      "회원 최신 루틴 불러오기 실패:",
      loadError
    );

    adminRoutineModeMessage.textContent =
      "최신 루틴을 불러오지 못했습니다.";

    adminSaveMessage.textContent =
      "회원을 다시 선택해 주세요. " +
      (loadError.message || "");

    saveAdminRoutineButton.disabled = true;
    syncAdminRoutineFormatUI();
  }
}

adminMemberSelect.addEventListener(
  "change",
  loadSelectedAdminMemberRoutine
);

// 선택한 루틴 이미지를 편집 목록에 추가
adminRoutineImage.addEventListener(
  "change",
  function () {
    const selectedFiles = Array.from(
      adminRoutineImage.files || []
    );

    // 같은 파일도 다시 선택할 수 있도록 초기화
    adminRoutineImage.value = "";

    if (
      isAdminRoutineSaving ||
      saveAdminRoutineButton.disabled ||
      selectedFiles.length === 0
    ) {
      return;
    }

    adminSaveMessage.textContent = "";

    const totalCount =
      adminRoutineImageItems.length +
      selectedFiles.length;

    if (totalCount > MAX_ROUTINE_IMAGES) {
      const remainingCount =
        MAX_ROUTINE_IMAGES -
        adminRoutineImageItems.length;

      adminSaveMessage.textContent =
        `이미지는 최대 5장까지 사용할 수 있습니다. ` +
        `현재 ${remainingCount}장을 더 추가할 수 있습니다.`;

      return;
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp"
    ];

    for (const file of selectedFiles) {
      if (!allowedTypes.includes(file.type)) {
        adminSaveMessage.textContent =
          "PNG, JPG, WebP 이미지 파일만 추가할 수 있습니다.";

        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        adminSaveMessage.textContent =
          "이미지는 한 장당 10MB 이하로 선택해 주세요.";

        return;
      }
    }

    selectedFiles.forEach(function (file) {
      adminRoutineImageItems.push({
        image_path: "",
        image_url: "",
        caption: "",
        previewUrl: URL.createObjectURL(file),
        file
      });
    });

    renderAdminRoutineImageItems();

    adminSaveMessage.textContent =
      `이미지 ${selectedFiles.length}장을 추가했습니다. ` +
      `현재 총 ${adminRoutineImageItems.length}장입니다.`;
  }
);

// 루틴 이미지·캡션·설명을 함께 저장
saveAdminRoutineButton.addEventListener(
  "click",
  async function () {
    if (isAdminRoutineRequestSelecting) {
      adminSaveMessage.textContent =
        "회원 정보를 불러오는 중입니다. 잠시 후 저장해 주세요.";
      return;
    }

    if (
      isAdminRoutineSaving ||
      saveAdminRoutineButton.disabled || adminRoutineFormat !== "image" ||
      adminScreen.hidden || adminRoutineEditor.hidden
    ) {
      return;
    }

    const userId = adminMemberSelect.value;
    const routineName = adminRoutineName.value.trim();
    const description = adminRoutineDescription.value.trim();

    const isEditMode =
      adminRoutineMode === "edit" &&
      Boolean(currentAdminRoutine);

    const routineId =
      isEditMode ? currentAdminRoutine.id : null;

    // 저장을 시작한 시점의 이미지와 캡션 사용
    const items = adminRoutineImageItems.map(function (item) {
      return { ...item };
    });

    if (!userId) {
      adminSaveMessage.textContent =
        "먼저 회원을 선택해 주세요.";
      return;
    }

    if (!routineName) {
      adminSaveMessage.textContent =
        "루틴 이름을 입력해 주세요.";
      adminRoutineName.focus();
      return;
    }

    if (
      items.length === 0 ||
      items.length > MAX_ROUTINE_IMAGES
    ) {
      adminSaveMessage.textContent =
        "루틴 이미지는 1장부터 최대 5장까지 등록해 주세요.";
      return;
    }

    const extensions = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp"
    };

    for (const item of items) {
      if (item.file) {
        if (
          !extensions[item.file.type] ||
          item.file.size > 10 * 1024 * 1024
        ) {
          adminSaveMessage.textContent =
            "이미지는 한 장당 10MB 이하의 PNG, JPG, WebP 파일이어야 합니다.";
          return;
        }
      } else if (!item.image_path && !item.image_url) {
        adminSaveMessage.textContent =
          "이미지 정보를 확인할 수 없습니다. 회원을 다시 선택해 주세요.";
        return;
      }
    }

    const previousPaths = isEditMode
      ? (currentAdminRoutine.imageItems || [])
          .map(function (item) {
            return item.image_path;
          })
          .filter(Boolean)
      : [];

    const lockedControls = [
      adminMemberSelect,
      adminMemberSearch,
      adminRoutineName,
      adminRoutineDescription,
      toggleAdminRoutineModeButton,
      adminLogoutButton,
      refreshAdminAppButton,
      adminRoutineJsonInput,
      previewAdminRoutineJsonButton,
      applyAdminRoutineJsonButton,
      adminRoutineJsonFormatButton, adminRoutineImageFormatButton
    ].filter(Boolean);

    const previousDisabledStates =
      lockedControls.map(function (control) {
        return control.disabled;
      });

    isAdminRoutineSaving = true;
    saveAdminRoutineButton.disabled = true;

    lockedControls.forEach(function (control) {
      control.disabled = true;
    });

    renderAdminRoutineImageItems();

    const uploadedPaths = [];
    let databaseWriteStarted = false;
    let databaseSaved = false;
    let needsReload = false;
    let cleanupFailed = false;

    try {
      const savedImages = [];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];

        let imagePath = item.image_path || "";
        let imageUrl = item.image_url || "";

        if (item.file) {
          adminSaveMessage.textContent =
            `루틴 이미지 저장 중… ${index + 1}/${items.length}`;

          const extension = extensions[item.file.type];

          imagePath =
            `${userId}/${crypto.randomUUID()}.${extension}`;

          // 업로드 도중 실패한 경우에도 정리할 수 있도록 기록
          uploadedPaths.push(imagePath);

          const { error: uploadError } =
            await supabaseClient.storage
              .from("routine-images")
              .upload(imagePath, item.file, {
                cacheControl: "3600",
                contentType: item.file.type,
                upsert: false
              });

          if (uploadError) {
            throw uploadError;
          }

          imageUrl = "";
        }

        savedImages.push({
          image_path: imagePath,
          image_url: imagePath ? "" : imageUrl,
          caption: (item.caption || "").trim()
        });
      }

      const firstImage = savedImages[0];

      const routineValues = {
        routine_name: routineName,
        routine_images: savedImages,

        // 기존 화면과의 호환을 위해 첫 이미지도 기록
        routine_image_path: firstImage.image_path,
        routine_image_url: firstImage.image_url,

        // 공통 설명과 링크는 별도 저장
        routine_description: description
      };

      adminSaveMessage.textContent =
        "루틴 내용을 저장하고 있습니다…";

      databaseWriteStarted = true;

      const saveQuery = isEditMode
        ? supabaseClient
            .from("member_routines")
            .update(routineValues)
            .eq("id", routineId)
            .eq("user_id", userId)
        : supabaseClient
            .from("member_routines")
            .insert({
              ...routineValues,
              user_id: userId,
              is_active: true
            });

      const {
        data: savedRoutine,
        error: saveError
      } = await saveQuery
        .select("id")
        .single();

      if (saveError) {
        throw saveError;
      }

      if (!savedRoutine) {
        throw new Error("루틴 저장 결과를 확인하지 못했습니다.");
      }

      databaseSaved = true;

      // 수정 저장에 성공한 뒤, 목록에서 빠진 기존 이미지 정리
      if (isEditMode) {
        const retainedPaths = new Set(
          savedImages.map(function (image) {
            return image.image_path;
          })
        );

        const removedPaths = [
          ...new Set(previousPaths)
        ].filter(function (path) {
          return !retainedPaths.has(path);
        });

        if (removedPaths.length > 0) {
          try {
            const { error: cleanupError } =
              await supabaseClient.storage
                .from("routine-images")
                .remove(removedPaths);

            if (cleanupError) {
              throw cleanupError;
            }
          } catch (cleanupError) {
            cleanupFailed = true;

            console.error(
              "기존 루틴 이미지 정리 실패:",
              cleanupError
            );
          }
        }
      }

      adminMemberSearch.value = "";

      await loadAdminMembers();

      adminMemberSelect.value = userId;

      if (adminMemberSelect.value !== userId) {
        throw new Error("저장 후 회원 목록을 다시 불러오지 못했습니다.");
      }

      await loadSelectedAdminMemberRoutine();

      if (!currentAdminRoutine) {
        throw new Error("저장된 루틴을 다시 불러오지 못했습니다.");
      }

      adminSaveMessage.textContent = isEditMode
        ? "루틴 이미지와 캡션, 설명을 수정했습니다."
        : "새 루틴을 배정했습니다.";

      if (cleanupFailed) {
        adminSaveMessage.textContent +=
          " 일부 이전 이미지 파일은 정리하지 못했습니다.";
      }

      if (!isEditMode) {
        adminMemberSelect.value = "";
        await loadSelectedAdminMemberRoutine();
        adminMemberInfo.textContent =
          "새 루틴을 배정했습니다. 루틴을 관리할 회원을 선택해 주세요.";
      }
    } catch (saveError) {
      console.error("루틴 저장 처리 오류:", saveError);

      // DB 저장을 시도하기 전 실패했다면 새 업로드만 정리
      if (
        !databaseWriteStarted &&
        uploadedPaths.length > 0
      ) {
        try {
          const { error: cleanupError } =
            await supabaseClient.storage
              .from("routine-images")
              .remove(uploadedPaths);

          if (cleanupError) {
            throw cleanupError;
          }
        } catch (cleanupError) {
          console.error(
            "실패한 루틴 업로드 정리 오류:",
            cleanupError
          );
        }
      }

      if (databaseSaved) {
        needsReload = true;

        adminSaveMessage.textContent =
          "루틴은 저장됐지만 화면을 다시 불러오지 못했습니다. " +
          "회원을 다시 선택해 저장된 내용을 확인해 주세요.";
      } else if (databaseWriteStarted) {
        needsReload = true;

        adminSaveMessage.textContent =
          "루틴 저장 완료를 확인하지 못했습니다. " +
          "중복 배정을 피하려면 회원을 다시 선택해 결과를 확인해 주세요. " +
          (saveError.message || "");
      } else {
        adminSaveMessage.textContent =
          "이미지 업로드를 완료하지 못했습니다. " +
          "선택한 내용은 유지되어 있으니 다시 저장해 주세요. " +
          (saveError.message || "");
      }
    } finally {
      isAdminRoutineSaving = false;

      lockedControls.forEach(function (control, index) {
        control.disabled = previousDisabledStates[index];
      });

      renderAdminRoutineImageItems();

      saveAdminRoutineButton.disabled =
        needsReload || !adminMemberSelect.value;
      syncAdminRoutineFormatUI();
    }
  }
);

// 검사한 운동 구성을 현재 선택한 회원에게 저장
async function applyValidatedAdminRoutine() {
  if (
    !applyAdminRoutineJsonButton || applyAdminRoutineJsonButton.disabled ||
    isAdminRoutineSaving || isAdminRoutineRequestSelecting ||
    saveAdminRoutineButton.disabled || adminScreen.hidden ||
    adminRoutineEditor.hidden || adminRoutineFormat !== "json"
  ) return;

  let routine;
  try {
    routine = window.RoutineComponents.getValidatedAdminRoutine();
  } catch (error) {
    adminRoutineJsonMessage.textContent = error.message;
    return;
  }

  const userId = adminMemberSelect.value;
  const routineName = adminRoutineName.value.trim();
  const isEditMode = adminRoutineMode === "edit" && Boolean(currentAdminRoutine);
  const routineId = isEditMode ? currentAdminRoutine.id : null;
  if (!userId) return;
  if (!routineName) {
    adminRoutineJsonMessage.textContent = "위쪽의 루틴 이름을 입력해 주세요.";
    adminRoutineName.focus({ preventScroll: true });
    return;
  }
  const selectedOption = adminMemberSelect.options[adminMemberSelect.selectedIndex];
  const memberName = selectedOption?.dataset.memberName || "선택한 회원";
  const action = isEditMode ? "현재 루틴에 운동 카드를 적용" : "새 운동 카드 루틴을 배정";
  if (!window.confirm(`${memberName}님에게 '${routineName}' 이름으로 ${action}할까요?`)) return;

  const lockedControls = [
    adminMemberSelect, adminMemberSearch, adminRoutineName,
    adminRoutineDescription, toggleAdminRoutineModeButton,
    adminLogoutButton, refreshAdminAppButton,
    adminRoutineJsonInput, previewAdminRoutineJsonButton,
    applyAdminRoutineJsonButton,
    adminRoutineJsonFormatButton, adminRoutineImageFormatButton
  ].filter(Boolean);
  const previousDisabledStates = lockedControls.map(control => control.disabled);
  let databaseWriteStarted = false;
  let databaseSaved = false;
  let needsReload = false;
  isAdminRoutineSaving = true;
  saveAdminRoutineButton.disabled = true;
  lockedControls.forEach(control => { control.disabled = true; });
  renderAdminRoutineImageItems();
  adminSaveMessage.textContent = "";
  adminRoutineJsonMessage.textContent = "운동 구성을 저장하고 있습니다…";

  try {
    // 기존 루틴에 적용할 때 이미지와 별도 설명은 수정하지 않습니다.
    const values = { routine_name: routineName, routine_json: routine };
    databaseWriteStarted = true;
    const query = isEditMode
      ? supabaseClient.from("member_routines").update(values)
          .eq("id", routineId).eq("user_id", userId)
      : supabaseClient.from("member_routines").insert({
          ...values, user_id: userId, is_active: true,
          routine_images: [], routine_image_url: "",
          routine_image_path: null, routine_description: ""
        });
    const { data: savedRoutine, error } = await query.select("id").single();
    if (error) throw error;
    if (!savedRoutine) throw new Error("저장 결과를 확인하지 못했습니다.");
    databaseSaved = true;

    if (adminScreen.hidden) return;
    adminMemberSearch.value = "";
    await loadAdminMembers();
    if (adminScreen.hidden) return;
    adminMemberSelect.value = userId;
    if (adminMemberSelect.value !== userId) throw new Error("회원 목록을 다시 불러오지 못했습니다.");
    await loadSelectedAdminMemberRoutine();
    if (adminScreen.hidden) return;
    if (!currentAdminRoutine || String(currentAdminRoutine.id) !== String(savedRoutine.id)) {
      throw new Error("저장된 루틴을 다시 확인하지 못했습니다.");
    }
    adminRoutineJsonMessage.textContent = isEditMode
      ? "운동 카드를 적용했습니다. 기존 이미지와 설명은 유지됩니다."
      : "새 운동 카드 루틴을 배정했습니다.";

    if (!isEditMode) {
      adminMemberSelect.value = "";
      await loadSelectedAdminMemberRoutine();
      adminMemberInfo.textContent =
        "새 운동 카드 루틴을 배정했습니다. 루틴을 관리할 회원을 선택해 주세요.";
    }
  } catch (error) {
    console.error("운동 카드 루틴 저장 실패:", error);
    needsReload = databaseWriteStarted;
    if (!adminScreen.hidden) {
      adminRoutineJsonMessage.textContent = databaseSaved
        ? "저장은 완료됐지만 화면을 갱신하지 못했습니다. 회원을 다시 선택해 확인해 주세요."
        : databaseWriteStarted
          ? "저장 완료를 확인하지 못했습니다. 중복 배정을 피하려면 회원을 다시 선택해 확인해 주세요. " + (error.message || "")
          : "저장하지 못했습니다. " + (error.message || "");
    }
  } finally {
    isAdminRoutineSaving = false;
    lockedControls.forEach((control, index) => {
      control.disabled = previousDisabledStates[index];
    });
    renderAdminRoutineImageItems();
    saveAdminRoutineButton.disabled = needsReload || !adminMemberSelect.value;
    syncAdminRoutineFormatUI();
  }
}

applyAdminRoutineJsonButton?.addEventListener("click", applyValidatedAdminRoutine);

// 로그인 버튼 기능
loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  loginMessage.textContent = "로그인 중...";
  loginButton.disabled = true;

  try {
    const { error } =
      await supabaseClient.auth.signInWithPassword({
        email: loginEmail.value.trim(),
        password: loginPassword.value
      });

    if (error) {
      loginMessage.textContent =
        "이메일 또는 비밀번호를 확인해 주세요.";
      return;
    }

    loginMessage.textContent = "";
    loginForm.reset();

    await showScreenForCurrentUser();

  } catch (unexpectedError) {
    console.error(
      "로그인 중 예상하지 못한 오류:",
      unexpectedError
    );

    loginMessage.textContent =
      "네트워크 연결을 확인하고 다시 시도해 주세요.";

  } finally {
    loginButton.disabled = false;
  }
});

// 이미 로그인한 상태인지 확인
async function initializeLogin() {
  if (isPasswordRecoveryReturn) return;
  try {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("password-reset") === "complete") {
      currentUrl.searchParams.delete("password-reset");
      window.history.replaceState(null, "", currentUrl.href);
      // 이 브라우저에 남아 있던 로그인도 정리하고 새 비밀번호로 로그인하게 합니다.
      await supabaseClient.auth.signOut({ scope: "local" });
      loginMessage.textContent = "새 비밀번호로 로그인해 주세요.";
      return;
    }
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error(
        "로그인 상태 확인 실패:",
        sessionError
      );

      loginMessage.textContent =
        "로그인 상태를 확인하지 못했습니다. " +
        "잠시 후 다시 시도해 주세요.";

      return;
    }

    if (session) {
      await showScreenForCurrentUser();
    }

  } catch (unexpectedError) {
    console.error(
      "로그인 상태 확인 중 예상하지 못한 오류:",
      unexpectedError
    );

    loginMessage.textContent =
      "네트워크 연결을 확인해 주세요.";
  }
}

// 로그아웃 공통 기능
async function handleLogout() {
  logoutButton.disabled = true;
  adminLogoutButton.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      alert("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      return;
    }

    // 진행 중이던 루틴 조회 결과가 나중에 반영되지 않도록 취소
    memberRoutineLoadRequestId += 1;
    adminRoutineLoadRequestId += 1;
    workoutRecordsRequestId += 1;
    workoutRecordsUserId = "";
    workoutPhotoUrlCache.clear();
    try { sessionStorage.removeItem(WORKOUT_PHOTO_URL_CACHE_KEY); } catch (error) {}
    workoutRecords = [];
    workoutRecordDates = new Set();
    workoutRecordList.replaceChildren();
    renderWorkoutCalendar();

    // 회원·관리자 화면을 숨기고 로그인 화면 표시
    renderMemberAccountEmail();
    appScreen.hidden = true;
    adminScreen.hidden = true;
    loginScreen.hidden = false;

    // 회원 루틴 이미지와 설명 초기화
    resetMemberRoutineCarousel();
    resetMemberRoutineComponents();

    assignedRoutineName.textContent = "불러오는 중...";

    renderRoutineDescription("");
    delete routineDescription.dataset.sourceText;

    stopAdminMemberAutoRefresh();

    await Promise.all([
      stopInquiryRealtimeSubscription(),
      stopMemberRoutineRealtimeSubscription(),
      stopAdminRoutineRequestSubscription(),
      stopCommunityRealtimeSubscription()
    ]);
    resetMemberCommunityPosts();

    // 회원가입 화면이 열려 있었다면 기본 로그인 화면으로 복구
    signupForm.hidden = true;
    loginForm.hidden = false;
    showSignupButton.hidden = false;

    // 입력값과 안내 메시지 초기화
    loginForm.reset();
    signupForm.reset();
    loginMessage.textContent = "";
    signupMessage.textContent = "";

    // 버튼 상태 초기화
    loginButton.disabled = false;
    signupButton.disabled = false;

    // 관리자 화면 상태 초기화
    adminMemberSearch.value = "";
    adminMemberSelect.innerHTML =
      '<option value="">루틴을 관리할 회원을 선택하세요.</option>';

    adminMemberOptionCache = [];
    adminRoutineEditor.hidden = true;

    adminMemberInfo.textContent =
      "루틴을 관리할 회원을 선택해 주세요.";

    adminRoutineName.value = "";
    adminRoutineImage.value = "";
    adminRoutineDescription.value = "";

    // 관리자 이미지 목록과 임시 미리보기 주소 정리
    clearAdminRoutineImageItems();

    currentAdminRoutine = null;
    adminRoutineMode = "new";
    adminRoutineFormat = "json";

    adminRoutineModeMessage.textContent = "";
    toggleAdminRoutineModeButton.hidden = true;

    adminSaveMessage.textContent = "";
    saveAdminRoutineButton.disabled = false;
    syncAdminRoutineFormatUI();

    // 비밀번호 입력창과 눈 버튼 초기화
    document
      .querySelectorAll("[data-password-toggle]")
      .forEach((button) => {
        const passwordInput = document.querySelector(
          `#${button.dataset.passwordToggle}`
        );

        if (passwordInput) {
          passwordInput.type = "password";
        }

        button.textContent = "👁";
        button.setAttribute("aria-label", "비밀번호 보기");
        button.setAttribute("aria-pressed", "false");
      });

  } catch (unexpectedError) {
    console.error(
      "로그아웃 중 예상하지 못한 오류:",
      unexpectedError
    );

    alert("네트워크 연결을 확인하고 다시 시도해 주세요.");

  } finally {
    logoutButton.disabled = false;
    adminLogoutButton.disabled = false;
  }
}

logoutButton.addEventListener("click", handleLogout);
adminLogoutButton.addEventListener("click", handleLogout);
toggleRoutineDescriptionButton.addEventListener("click", function () {
  const isExpanded = routineDescription.classList.toggle("is-expanded");

  toggleRoutineDescriptionButton.textContent = isExpanded
    ? "설명 접기"
    : "설명 더 보기";

  toggleRoutineDescriptionButton.setAttribute(
    "aria-expanded",
    String(isExpanded)
  );
});
function showSignupForm() {
  loginForm.hidden = true;
  showSignupButton.hidden = true;
  signupForm.hidden = false;

  loginMessage.textContent = "";
  signupMessage.textContent = "";
  signupForm.reset();
  signupName.focus();
}

function showLoginForm() {
  signupForm.hidden = true;
  loginForm.hidden = false;
  showSignupButton.hidden = false;

  signupMessage.textContent = "";
  signupForm.reset();
}

showSignupButton.addEventListener("click", showSignupForm);

hideSignupButton.addEventListener("click", showLoginForm);

signupForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const name = signupName.value.trim();
  const phoneLast4 = signupPhoneLast4.value.trim();

  if (!name) {
    signupMessage.textContent = "이름을 입력해 주세요.";
    signupName.focus();
    return;
  }

  if (!/^\d{4}$/.test(phoneLast4)) {
    signupMessage.textContent =
      "전화번호 뒷 4자리를 숫자로 입력해 주세요.";
    signupPhoneLast4.focus();
    return;
  }

  if (signupPassword.value !== signupPasswordConfirm.value) {
    signupMessage.textContent = "비밀번호가 서로 다릅니다.";
    return;
  }

  signupMessage.textContent = "회원가입 중...";
  signupButton.disabled = true;

  try {
    const { data, error } =
      await supabaseClient.auth.signUp({
        email: signupEmail.value.trim(),
        password: signupPassword.value,
        options: {
          data: {
            display_name: name,
            phone_last4: phoneLast4
          }
        }
      });

    if (error) {
      signupMessage.textContent =
        error.message === "User already registered"
          ? "이미 가입된 이메일입니다."
          : "회원가입하지 못했습니다. 다시 시도해 주세요.";

      return;
    }

    if (!data.session) {
      signupMessage.textContent =
        "회원가입은 완료됐습니다. " +
        "이메일 인증 설정을 다시 확인해 주세요.";

      return;
    }

    signupForm.reset();

    await initializeLogin();

  } catch (unexpectedError) {
    console.error(
      "회원가입 중 예상하지 못한 오류:",
      unexpectedError
    );

    signupMessage.textContent =
      "네트워크 연결을 확인하고 다시 시도해 주세요.";

  } finally {
    signupButton.disabled = false;
  }
});
document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  const passwordInput = document.querySelector(
    `#${button.dataset.passwordToggle}`
  );

  if (!passwordInput) {
    return;
  }

  // 입력 중 아이콘을 눌러도 입력창의 포커스 유지
  button.addEventListener("pointerdown", function (event) {
    if (document.activeElement === passwordInput) {
      event.preventDefault();
    }
  });

  button.addEventListener("click", function () {
    // 현재 커서 위치와 선택 범위 저장
    const selectionStart =
      passwordInput.selectionStart ?? passwordInput.value.length;

    const selectionEnd =
      passwordInput.selectionEnd ?? passwordInput.value.length;

    const selectionDirection =
      passwordInput.selectionDirection || "none";

    const isHidden =
      passwordInput.type === "password";

    passwordInput.type =
      isHidden ? "text" : "password";

    button.textContent =
      isHidden ? "🙈" : "👁";

    button.setAttribute(
      "aria-label",
      isHidden ? "비밀번호 숨기기" : "비밀번호 보기"
    );

    button.setAttribute(
      "aria-pressed",
      String(isHidden)
    );

    // 입력창으로 포커스를 유지하고 커서 위치 복원
    passwordInput.focus({
      preventScroll: true
    });

    passwordInput.setSelectionRange(
      selectionStart,
      selectionEnd,
      selectionDirection
    );
  });
});
// 검사 결과를 회원·수정 모드·최신 조회 상태에 연결합니다.
window.RoutineComponents?.configureAdminContext?.(function () {
  return {
    userId: adminMemberSelect.value,
    mode: adminRoutineMode,
    routineId: adminRoutineMode === "edit" ? currentAdminRoutine?.id : null,
    revision: adminRoutineLoadRequestId,
    ready: adminRoutineFormat === "json" &&
      !adminScreen.hidden && !adminRoutineEditor.hidden &&
      !isAdminRoutineSaving && !isAdminRoutineRequestSelecting &&
      !saveAdminRoutineButton.disabled
  };
});

initializeLogin();


// 회원 운동 구성 탭의 휴식 타이머. 서버 저장 없이 현재 앱에서만 동작합니다.
(function () {
  "use strict";
  const app = document.querySelector("#appScreen");
  const routinePanel = document.querySelector("#routineTabPanel");
  const widget = document.querySelector("#memberRestTimer");
  const toggle = document.querySelector("#restTimerToggle");
  const toggleLabel = document.querySelector("#restTimerToggleLabel");
  const quickToggle = document.querySelector("#restTimerQuickToggle");
  const quickLabel = document.querySelector("#restTimerQuickLabel");
  const panel = document.querySelector("#restTimerPanel");
  const close = document.querySelector("#restTimerClose");
  const display = document.querySelector("#restTimerDisplay");
  const status = document.querySelector("#restTimerStatus");
  const start = document.querySelector("#restTimerStart");
  const reset = document.querySelector("#restTimerReset");
  const presets = Array.from(document.querySelectorAll("[data-rest-seconds]"));
  const nav = document.querySelector(".member-bottom-nav");
  if (!app || !routinePanel || !widget || !toggle || !panel || !quickToggle) return;
  let lastTrigger = toggle;

  let duration = 60;
  let remaining = duration * 1000;
  let deadline = null;
  let phase = "idle";
  let ticker = null;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function isVisible() {
    return !app.hidden && !routinePanel.hidden && document.visibilityState === "visible";
  }

  function stopTicker() {
    if (ticker !== null) window.clearTimeout(ticker);
    ticker = null;
  }

  function updateRemaining() {
    if (phase !== "running") return;
    remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      phase = "finished";
      deadline = null;
      stopTicker();
    }
  }

  function render() {
    const seconds = Math.ceil(remaining / 1000);
    const time = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");
    setText(display, time);
    setText(toggleLabel, phase === "idle" ? "휴식 타이머" :
      phase === "finished" ? "휴식 끝!" :
      phase === "paused" ? time + " · 일시정지" : time + " · 휴식 중");
    setText(quickLabel, toggleLabel.textContent);
    quickToggle.hidden = phase === "idle" || !panel.hidden;
    toggle.dataset.phase = phase;
    setText(start, phase === "running" ? "일시정지" :
      phase === "paused" ? "계속" : phase === "finished" ? "다시 시작" : "시작");
    setText(status, phase === "finished" ? "휴식 끝! 다음 세트를 시작해 주세요." :
      phase === "running" ? "휴식 중이에요." :
      phase === "paused" ? "잠시 멈췄어요." : "휴식 시간을 선택하고 시작해 주세요.");
    widget.dataset.phase = phase;
    presets.forEach(function (button) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.restSeconds) === duration));
    });
  }

  function scheduleTick() {
    stopTicker();
    if (phase !== "running" || !isVisible()) return;
    ticker = window.setTimeout(function () {
      ticker = null;
      updateRemaining();
      render();
      scheduleTick();
    }, 250);
  }

  function collapse() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    quickToggle.setAttribute("aria-expanded", "false");
    render();
  }

  function focusTrigger() {
    const target = lastTrigger.hidden ? toggle : lastTrigger;
    target.focus({ preventScroll: true });
  }

  function resetTimer() {
    stopTicker();
    phase = "idle";
    remaining = duration * 1000;
    deadline = null;
    render();
  }

  function positionWidget() {
    if (!nav || app.hidden) return;
    const height = nav.getBoundingClientRect().height;
    if (height > 0) widget.style.setProperty("--rest-timer-bottom", Math.ceil(height + 12) + "px");
  }

  function syncVisibility() {
    widget.hidden = app.hidden || routinePanel.hidden;
    if (app.hidden) {
      duration = 60;
      resetTimer();
      collapse();
    } else {
      if (routinePanel.hidden) collapse();
      updateRemaining();
      render();
      positionWidget();
    }
    scheduleTick();
  }

  function togglePanel(event) {
    if (widget.hidden) return;
    lastTrigger = event.currentTarget;
    updateRemaining();
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    quickToggle.setAttribute("aria-expanded", String(!panel.hidden));
    render();
    if (!panel.hidden) close.focus({ preventScroll: true });
    scheduleTick();
  }
  toggle.addEventListener("click", togglePanel);
  quickToggle.addEventListener("click", togglePanel);

  close.addEventListener("click", function () {
    collapse();
    focusTrigger();
  });

  start.addEventListener("click", function () {
    if (widget.hidden) return;
    const wasRunning = phase === "running";
    updateRemaining();
    // 종료 직전에 누른 일시정지 버튼이 새 타이머를 시작하지 않도록 합니다.
    if (wasRunning && phase === "finished") {
      render();
      scheduleTick();
      return;
    }
    if (phase === "running") {
      phase = "paused";
      deadline = null;
    } else {
      if (phase === "finished") remaining = duration * 1000;
      deadline = Date.now() + remaining;
      phase = "running";
    }
    render();
    scheduleTick();
  });

  reset.addEventListener("click", function () {
    if (!widget.hidden) resetTimer();
  });

  presets.forEach(function (button) {
    button.addEventListener("click", function () {
      if (widget.hidden) return;
      const seconds = Number(button.dataset.restSeconds);
      if (![30, 60, 90].includes(seconds) || seconds === duration) return;
      duration = seconds;
      resetTimer();
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      collapse();
      focusTrigger();
    }
  });

  document.addEventListener("click", function (event) {
    if (!panel.hidden && !widget.contains(event.target) && !toggle.contains(event.target)) collapse();
  });

  const observer = new MutationObserver(syncVisibility);
  observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  observer.observe(routinePanel, { attributes: true, attributeFilter: ["hidden"] });
  if (nav && window.ResizeObserver) new window.ResizeObserver(positionWidget).observe(nav);
  window.addEventListener("resize", positionWidget);
  window.addEventListener("pagehide", stopTicker);
  window.addEventListener("pageshow", syncVisibility);
  document.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();
})();
