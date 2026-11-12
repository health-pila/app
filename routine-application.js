/* 신청/조회 버튼을 눌렀을 때만 불러옵니다. 답변은 브라우저 저장소에 남기지 않습니다. */
(() => {
  "use strict";
  if (window.RoutineApplication) return;
  const choices = Object.freeze({
    gender: ["여자", "남자"],
    experience: ["1개월 미만", "1~3개월", "3~6개월", "6개월~1년", "1년 이상", "2년 이상"],
    purposes: ["체중 감량", "근력 증가", "체형 개선", "건강 관리", "기초체력 강화", "기타"],
    interests: ["허벅지", "엉덩이", "등", "복부", "팔", "어깨", "특정부위 없음"],
    frequency: ["주 1회", "주 2회", "주 3회", "주 4회", "주 5회 이상"],
    duration: ["30분 미만", "30분 ~ 1시간", "1시간 ~ 1시간 30분", "1시간 30분 ~ 2시간", "2시간 이상"]
  });
  const labels = Object.freeze({gender:"성별", experience:"운동경력", purposes:"운동목적", interests:"관심부위",
    frequency:"주당 운동 가능 횟수", duration:"운동 가능 시간", pain:"현재 운동할 때 아픈 부위가 있나요?", avoid:"피하고 싶은 운동"});
  let member = null, admin = null, memberSequence = 0, adminSequence = 0;
  let memberUi, adminUi;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  function button(text, cls) { const b = el("button", cls, text); b.type = "button"; return b; }
  function makeDialog(title, cls) {
    const d = el("dialog", "routine-application-dialog " + cls);
    const shell = el("div", "routine-application-shell");
    const head = el("header", "routine-application-header");
    const h = el("h2", "", title); h.id = cls + "-title"; d.setAttribute("aria-labelledby", h.id);
    const close = button("×", "routine-application-close"); close.setAttribute("aria-label", "닫기");
    head.append(h, close);
    const body = el("div", "routine-application-body");
    const status = el("p", "routine-application-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const footer = el("footer", "routine-application-footer");
    body.append(status); shell.append(head, body, footer); d.append(shell); document.body.append(d);
    return {d, head, body, status, footer, close};
  }
  function describeError(error) {
    const message = String(error?.message || "");
    if (message.includes("APPLICATION_CHANGED")) return "다른 곳에서 신청 내용이나 배정 상태가 바뀌었어요. 최신 신청을 불러온 뒤 다시 확인해 주세요.";
    if (message.includes("APPLICATION_UNAVAILABLE")) return "이 신청은 이미 처리되었거나 최신 신청으로 바뀌었어요. 관리자 목록에서 다시 확인해 주세요.";
    if (["PGRST202", "42883"].includes(error?.code)) return "신청 기능을 준비 중이에요. 잠시 후 다시 이용해 주세요.";
    if (error?.code === "42501") return "이 계정으로 이용할 수 없어요. 로그인 상태를 확인해 주세요.";
    return "처리 결과를 확인하지 못했어요. 연결을 확인하고 다시 눌러 주세요. 같은 내용으로 재시도해도 중복 접수되지 않아요.";
  }
  async function rpc(client, name, args) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const {data, error} = await client.rpc(name, args).abortSignal(controller.signal);
      if (error) throw error;
      return data;
    } finally { clearTimeout(timer); }
  }
  function validAnswers(a) {
    if (!a || typeof a !== "object") return false;
    for (const key of ["gender", "experience", "frequency", "duration"]) if (!choices[key].includes(a[key])) return false;
    for (const [key,max] of [["purposes",2],["interests",3]]) {
      if (!Array.isArray(a[key]) || !a[key].length || a[key].length>max || new Set(a[key]).size!==a[key].length ||
        a[key].some(v=>!choices[key].includes(v))) return false;
    }
    for (const key of ["purpose_other","pain","avoid"]) if (typeof a[key]!=="string" || /[\u0000-\u001f\u007f]/.test(a[key]) || a[key].length>(key==="purpose_other"?100:500)) return false;
    return !a.purposes.includes("기타") || !!a.purpose_other.trim();
  }
  function formatAnswers(a) {
    if (!validAnswers(a)) throw new Error("INVALID_RESPONSE");
    return Object.keys(labels).map(key => {
      const value = key === "purposes" ? a.purposes.map(v=>v==="기타"?a.purpose_other:v).join(", ")
        : key === "interests" ? a.interests.join(", ") : a[key];
      return labels[key] + " : " + value;
    }).join("\n");
  }
  function makeMemberUi() {
    const ui = makeDialog("운동 루틴 신청서", "member-routine-application-dialog");
    const back=button("‹","routine-application-back");back.setAttribute("aria-label","이전 단계 또는 신청서 닫기");
    back.addEventListener("click",()=>{if(!member||member.saving)return;if(member.step>0&&!member.done)setStep(member.step-1,true);else resetMember();});
    ui.head.prepend(back);
    const progress = el("div", "routine-application-progress");
    progress.setAttribute("role", "progressbar"); progress.setAttribute("aria-valuemin","1"); progress.setAttribute("aria-valuemax","3");
    const bars = [0,1,2].map(()=>el("span")); const number = el("b"); progress.append(...bars, number);
    const title = el("h3", "routine-application-step-title"); title.tabIndex = -1;
    const intro = el("p", "routine-application-intro", "⏰ 회원님께 맞는 루틴을 위해 30초만 투자해주세요:)");
    const form = el("form", "routine-application-form"); form.noValidate = true;
    const pages = [0,1,2].map(()=>el("section", "routine-application-page"));
    const groups = {}, inputs = {};
    function choiceGroup(page, key, name, multiple = false, max = 0, help = "") {
      const group = el("fieldset", "routine-application-field"); group.dataset.field=key; const legend = el("legend", "", name + " ");
      const required = el("span", "routine-application-required", "*"); required.setAttribute("aria-label", "필수"); legend.append(required);
      if (max) legend.append(el("span", "routine-application-limit", `최대 ${max}개`));
      group.append(legend);
      if (help) { const p = el("p", "routine-application-help", help); p.id = "routine-app-help-"+key; group.setAttribute("aria-describedby",p.id); group.append(p); }
      const grid = el("div", "routine-application-choices" + (key==="duration"?" is-list":""));
      inputs[key] = choices[key].map(value => {
        const label = el("label", "routine-application-choice"), input = el("input");
        input.type = multiple ? "checkbox" : "radio"; input.name = key; input.value = value;
        label.append(input, el("span", "", value)); grid.append(label);
        input.addEventListener("change", () => {
          if (max && inputs[key].filter(i=>i.checked).length>max) {
            input.checked=false; ui.status.textContent=`최대 ${max}개까지 선택할 수 있어요.`;
          } else ui.status.textContent="";
          if (key==="purposes") ui.otherWrap.hidden=!inputs.purposes.find(i=>i.value==="기타").checked;
        });
        return input;
      });
      group.append(grid); pages[page].append(group); groups[key]=group;
    }
    choiceGroup(0,"gender","성별");
    choiceGroup(0,"experience","운동경력 (꾸준히 지속한 기간)");
    choiceGroup(0,"purposes","운동 목적",true,2);
    const otherWrap = el("label", "routine-application-other", "기타: ");
    const other = el("input"); other.name="purpose_other"; other.type="text"; other.maxLength=100; other.placeholder="기타 응답";
    otherWrap.append(other); otherWrap.hidden=true; groups.purposes.append(otherWrap);
    choiceGroup(1,"interests","관심 부위",true,3);
    choiceGroup(1,"frequency","주당 운동 가능 횟수");
    choiceGroup(1,"duration","운동 가능 시간",false,0,"유산소 운동을 제외한 총 운동 시간입니다.");
    function textGroup(key, help) {
      const box = el("div", "routine-application-field");
      const label = el("label", "routine-application-text-label", labels[key]); label.htmlFor="routine-app-"+key;
      const guide = el("p", "routine-application-help", help); guide.id="routine-app-help-"+key;
      const input=el("input", "routine-application-text"); input.id=label.htmlFor; input.name=key; input.type="text"; input.maxLength=500;
      input.placeholder="선택"; input.setAttribute("aria-describedby",guide.id); input.autocomplete="off";
      box.append(label,guide,input); pages[2].append(box); inputs[key]=input;
    }
    textGroup("pain","예: 허리, 무릎, 손목 짚으면 아픔 / 간헐적 가벼운 불편은 제외 / 없으면 비워주세요.");
    textGroup("avoid","예: 바벨 운동, 누워서 하는 운동 / 없으면 비워주세요.");
    const notice=el("aside","routine-application-notice");
    notice.append(el("strong","","* 본 구성은 처방이 아닌 추천입니다."),el("p","","해당 운동 종목 중 상해 발생 시, 센터측에는 법적인 책임이 없음을 알립니다. 때문에 명확한 근골격계 질환이 있으신 경우, 운동 구성 신청을 추천하지 않습니다."));
    pages[2].append(notice); form.append(...pages);
    const reload=button("최신 신청 불러오기","routine-application-secondary"); reload.hidden=true;
    const success=el("div","routine-application-success"); success.hidden=true;
    success.append(el("h3","","신청이 접수됐어요!"),el("p","","신청 내용을 확인한 후 배정해 드려요."));
    const prev=button("이전","routine-application-secondary"), next=button("다음 ›","routine-application-primary");
    ui.body.prepend(progress,title,intro); ui.body.append(reload,form,success); ui.footer.append(prev,next);
    Object.assign(ui,{progress,bars,number,title,intro,form,pages,groups,inputs,other,otherWrap,reload,success,prev,next});
    ui.close.addEventListener("click",()=>{if(!member?.saving) resetMember();});
    ui.d.addEventListener("cancel",e=>{e.preventDefault();if(!member?.saving)resetMember();});
    ui.d.addEventListener("close",()=>{if(!ui.d.open&&member)resetMember();});
    prev.addEventListener("click",()=>{if(member&&!member.saving)setStep(member.step-1,true);});
    next.addEventListener("click",()=>advanceMember());
    form.addEventListener("submit",e=>{e.preventDefault();advanceMember();});
    reload.addEventListener("click",()=>loadMemberState(member));
    return ui;
  }
  function activeMember(state=member) { return state && member===state && state.isCurrent(); }
  function readAnswers() {
    const ui=memberUi, a={};
    for(const key of Object.keys(choices)) { const values=ui.inputs[key].filter(i=>i.checked).map(i=>i.value); a[key]=["purposes","interests"].includes(key)?values:values[0]||""; }
    a.purpose_other=a.purposes.includes("기타")?ui.other.value.trim():"";
    a.pain=ui.inputs.pain.value.trim();a.avoid=ui.inputs.avoid.value.trim();return a;
  }
  function setAnswers(a) {
    const ui=memberUi; ui.form.reset(); ui.other.value="";ui.inputs.pain.value="";ui.inputs.avoid.value="";
    if (a) {
      for(const key of Object.keys(choices))ui.inputs[key].forEach(i=>i.checked=Array.isArray(a[key])?a[key].includes(i.value):a[key]===i.value);
      ui.other.value=a.purpose_other;ui.inputs.pain.value=a.pain;ui.inputs.avoid.value=a.avoid;
    }
    ui.otherWrap.hidden=!ui.inputs.purposes.find(i=>i.value==="기타").checked;
  }
  function setStep(step, focus=false) {
    if(!member)return;const ui=memberUi;member.step=Math.max(0,Math.min(2,step));
    ui.pages.forEach((page,i)=>page.hidden=i!==member.step);
    ui.bars.forEach((bar,i)=>bar.classList.toggle("is-active",i<=member.step));
    ui.number.textContent=`${member.step+1} / 3`;ui.progress.setAttribute("aria-valuenow",String(member.step+1));
    ui.title.textContent=["나의 운동 경험과 목적","원하는 운동 계획","마지막 확인"][member.step];
    ui.intro.hidden=member.step!==0;ui.prev.hidden=member.step===0;
    ui.next.textContent=member.step===2?"신청서 제출하기":"다음 ›";ui.body.scrollTop=0;
    if(focus)ui.title.focus({preventScroll:true});
  }
  function validatePage(step) {
    const a=readAnswers(),keys=step===0?["gender","experience","purposes"]:step===1?["interests","frequency","duration"]:[];
    for(const key of keys) {
      if(!a[key] || Array.isArray(a[key])&&!a[key].length) {
        memberUi.status.textContent=labels[key]+" 항목을 선택해 주세요.";memberUi.inputs[key][0].focus();return false;
      }
    }
    if(step===0&&a.purposes.includes("기타")&&!a.purpose_other){memberUi.status.textContent="기타 운동 목적을 입력해 주세요.";memberUi.other.focus();return false;}
    memberUi.status.textContent="";return true;
  }
  async function loadMemberState(state) {
    if(!activeMember(state))return;const sequence=++memberSequence,ui=memberUi;
    ui.status.textContent="신청 정보를 불러오고 있어요.";ui.form.hidden=true;ui.reload.hidden=true;ui.next.disabled=true;ui.prev.disabled=true;
    try {
      const result=await rpc(state.client,"member_routine_application_state");
      if(sequence!==memberSequence||!activeMember(state))return;
      if(!result?.context||result.answers&&!validAnswers(result.answers))throw Error("INVALID_RESPONSE");
      state.context=result.context;state.attempt=null;setAnswers(result.answers);setStep(0);ui.form.hidden=false;ui.status.textContent="";ui.next.disabled=false;
    } catch(error) {
      if(sequence!==memberSequence||!activeMember(state))return;
      ui.status.textContent=describeError(error);ui.reload.hidden=false;
    } finally { if(sequence===memberSequence&&activeMember(state))ui.prev.disabled=false; }
  }
  async function advanceMember() {
    const state=member,ui=memberUi;if(!activeMember(state)||state.saving||ui.next.disabled)return;
    if(state.done){resetMember();return;}
    if(!validatePage(state.step))return;
    if(state.step<2){setStep(state.step+1,true);return;}
    const answers=readAnswers();
    if(!validAnswers(answers)){ui.status.textContent="필수 항목과 선택 개수를 확인해 주세요.";return;}
    const key=JSON.stringify(answers);
    if(state.attempt?.key!==key)state.attempt={key,id:crypto.randomUUID()};
    const ticket=memberSequence;state.saving=true;ui.next.disabled=true;ui.prev.disabled=true;ui.close.disabled=true;
    ui.form.querySelectorAll("input").forEach(i=>i.disabled=true);ui.status.textContent="신청서를 제출하고 있어요.";ui.reload.hidden=true;
    try {
      const result=await rpc(state.client,"submit_member_routine_application",{p_answers:answers,p_submission_id:state.attempt.id,p_context:state.context});
      if(ticket!==memberSequence||!activeMember(state))return;
      if(!result?.ok||!["pending","completed"].includes(result.status))throw Error("INVALID_RESPONSE");
      state.done=true;ui.form.hidden=true;ui.success.hidden=false;ui.progress.hidden=true;ui.title.hidden=true;ui.intro.hidden=true;
      ui.success.querySelector("h3").textContent=result.status==="completed"?"루틴 배정이 완료됐어요!":"신청이 접수됐어요!";
      ui.status.textContent="";ui.prev.hidden=true;ui.next.textContent="닫기";
      await Promise.resolve(state.onSubmitted(result)).catch(()=>{if(activeMember(state))ui.status.textContent="접수는 완료됐어요. 닫은 뒤 상단 새로고침 버튼으로 상태를 확인해 주세요.";});
    } catch(error) {
      if(ticket!==memberSequence||!activeMember(state))return;
      ui.status.textContent=describeError(error);
      if(String(error?.message).includes("APPLICATION_CHANGED")){ui.reload.hidden=false;ui.next.disabled=true;}
    } finally {
      if(ticket===memberSequence&&activeMember(state)){
        state.saving=false;ui.close.disabled=false;ui.prev.disabled=false;
        if(ui.reload.hidden)ui.next.disabled=false;
        ui.form.querySelectorAll("input").forEach(i=>i.disabled=false);
      }
    }
  }
  function resetMember() {
    memberSequence++;const state=member;member=null;if(!memberUi)return;
    if(memberUi.d.open)memberUi.d.close();setAnswers(null);memberUi.status.textContent="";memberUi.success.hidden=true;
    memberUi.progress.hidden=false;memberUi.title.hidden=false;memberUi.close.disabled=false;
    memberUi.form.querySelectorAll("input").forEach(i=>i.disabled=false);memberUi.prev.disabled=false;memberUi.next.disabled=false;
    document.body.classList.remove("routine-application-open");
    if(state?.returnFocus?.isConnected)state.returnFocus.focus({preventScroll:true});
  }
  function openMember(config) {
    resetMember();if(!config.isCurrent())return;
    memberUi??=makeMemberUi();member={...config,step:0,saving:false,done:false,attempt:null};
    document.body.classList.add("routine-application-open");memberUi.d.showModal();void loadMemberState(member);
  }
  function makeAdminUi() {
    const ui=makeDialog("신청서 보기","admin-routine-application-dialog");
    const who=el("p","routine-application-member"),text=el("textarea","routine-application-copy-text");
    text.readOnly=true;text.setAttribute("aria-label","루틴 생성용 신청 내용");text.spellcheck=false;
    const copy=button("루틴 생성용 전체 복사","routine-application-primary");
    ui.body.append(who,text);ui.footer.append(copy);
    Object.assign(ui,{who,text,copy});
    copy.addEventListener("click",()=>loadAdmin(true));
    ui.close.addEventListener("click",resetAdmin);ui.d.addEventListener("cancel",e=>{e.preventDefault();resetAdmin();});
    ui.d.addEventListener("close",()=>{if(!ui.d.open&&admin)resetAdmin();});return ui;
  }
  async function loadAdmin(copy=false) {
    const state=admin,ui=adminUi;if(!state||!state.isCurrent())return;
    const sequence=++adminSequence;ui.copy.disabled=true;ui.text.value="";ui.status.textContent="최신 신청 내용을 확인하고 있어요.";
    try {
      const result=await rpc(state.client,"admin_get_routine_application",{p_request_id:state.request.id});
      if(sequence!==adminSequence||admin!==state||!state.isCurrent())return;
      if(result?.request_id!==state.request.id||!result.revision)throw Error("INVALID_RESPONSE");
      ui.text.value=formatAnswers(result.answers);state.revision=result.revision;ui.status.textContent="";
      if(copy){
        try { await navigator.clipboard.writeText(ui.text.value);if(sequence===adminSequence&&admin===state)ui.status.textContent="복사했어요. 루틴 생성 프로젝트 채팅에 붙여넣어 주세요."; }
        catch(_){if(sequence===adminSequence&&admin===state){ui.text.focus();ui.text.select();ui.status.textContent="자동 복사를 사용할 수 없어요. 선택된 내용을 복사해 주세요.";}}
      }
    } catch(error) {
      if(sequence!==adminSequence||admin!==state||!state.isCurrent())return;
      ui.text.value="";ui.status.textContent=describeError(error);
    } finally {if(sequence===adminSequence&&admin===state&&state.isCurrent())ui.copy.disabled=false;}
  }
  function resetAdmin() {
    adminSequence++;admin=null;if(!adminUi)return;if(adminUi.d.open)adminUi.d.close();
    adminUi.text.value="";adminUi.who.textContent="";adminUi.status.textContent="";
  }
  function openAdmin(config) {
    resetAdmin();if(!config.isCurrent())return;
    adminUi??=makeAdminUi();admin={...config};adminUi.who.textContent=config.memberName||"선택한 회원";
    adminUi.d.showModal();void loadAdmin(Boolean(config.copy));
  }
  function syncAdmin(rows) {
    if(!admin||!admin.isCurrent())return;
    const current=rows.find(r=>r.id===admin.request.id);
    if(!current){adminSequence++;adminUi.text.value="";adminUi.copy.disabled=true;adminUi.status.textContent="신청 처리가 완료되었거나 목록이 변경됐어요. 닫은 뒤 최신 목록에서 확인해 주세요.";return;}
    if(current.application_revision&&current.application_revision!==admin.request.application_revision){admin.request=current;void loadAdmin();}
  }
  for(const [id,reset] of [["appScreen",resetMember],["adminScreen",resetAdmin]]){
    const screen=document.getElementById(id);
    if(screen)new MutationObserver(()=>{if(screen.hidden)reset();}).observe(screen,{attributes:true,attributeFilter:["hidden"]});
  }
  window.RoutineApplication=Object.freeze({openMember,openAdmin,syncAdmin,resetMember,resetAdmin});
})();
