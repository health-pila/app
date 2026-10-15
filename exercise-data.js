// 운동 구성 컴포넌트 DB — 시트에서 검수한 로컬 데이터
// 출처: 2026-10-15 Google Sheets 원본 '운동 구성 컴포넌트 DB'의 운동DB_MASTER.
// Google Sheets와 자동 동기화되지 않습니다. 다음 변경 시 다시 반영해야 합니다.
// 사용여부 Y인 39종을 새 루틴에 사용합니다.
// 운동ID, 설명, 난이도, 이미지/영상 주소는 시트 기준입니다. 관리메모는 managementNotes에 참고용으로 보관하며 회원 화면에는 표시하지 않습니다.
// 횟수, 세트, 휴식시간, 운동 순서는 회원별 루틴에서 따로 관리합니다.
// 기구 이미지 주소는 공유 링크를 보관하고 표시할 때 변환합니다. GIF는 원본 파일을 앱에 동봉합니다.
// EX023 GIF 원본: https://drive.google.com/file/d/1a3IDhCbbxaUcNFU605wCUPLYusAgAwl_/view?usp=drive_link
// EX024 GIF 원본: https://drive.google.com/file/d/1XeuWxMRUlx1yisKDtmPJTqZTZj1-MIEs/view?usp=drive_link
// EX025 GIF 원본: https://drive.google.com/file/d/1LwzRlw0d597Z4-LS0MrneBuZjemmUJKd/view?usp=drive_link
// EX026 GIF 원본: https://drive.google.com/file/d/167T2IT4Uihm8bbFL-eO1LduRNT3fFfl-/view?usp=drive_link
// EX027 GIF 원본: https://drive.google.com/file/d/12WIFl55c9VOFsjeJI9hieotHa7M_sBGn/view?usp=drive_link
// EX029 GIF 원본: https://drive.google.com/file/d/1ZxXziDCAlOHgCSbre7QZOMh_k04IIcM_/view?usp=drive_link
// EX030 GIF 원본: https://drive.google.com/file/d/1KsXjfgTym5Q7gbzYsXtFRHlWxkZBlaPk/view?usp=drive_link
// EX031 GIF 원본: https://drive.google.com/file/d/1Y6fjf1sM8MkOs-kk153XGFJDzn5WnqST/view?usp=drive_link
// EX032 GIF 원본: https://drive.google.com/file/d/1Dr2J9aS9UE46L_y7PW2nW3B7cW3Nz4Hg/view?usp=drive_link
// EX033 GIF 원본: https://drive.google.com/file/d/1lbTM0ohDlVukqtQQF48XzfFnHsv66P12/view?usp=drive_link
// EX036 GIF 원본: https://drive.google.com/file/d/1FjH9GLrSErOsBcNt5a1_3Z119s9-spd7/view?usp=drive_link
// EX038 GIF 원본: https://drive.google.com/file/d/1sHEQCdgMeZ32IHdENbk6lewDH_CU8bav/view?usp=drive_link

(function () {
  "use strict";

  const records = [
    {
      exerciseId: "EX001",
      imageUrl: "https://drive.google.com/file/d/1DyMQfejxIcbwkV1uDOVnTFdQzMaZLVj4/view?usp=drive_link",
      name: "레그프레스",
      bodyParts: ["허벅지 앞","엉덩이"],
      exerciseType: "하체_무릎지배",
      equipmentType: "머신",
      purposeTags: ["하체근력","기초체력"],
      benefits: "하체 전반의 근력을 높이고 기본적인 하지 운동 능력을 향상시키는 데 도움을 줍니다.",
      instructions: "허리를 등받이에 밀착하고 발 전체로 발판을 밀어냅니다. 무릎을 완전히 잠그지 않고 천천히 돌아옵니다.",
      keyPoints: "무릎을 완전히 펴지 않도록 합니다.",
      breathing: "다리를 펼 때 내쉬고, 굽힐 때 들이마십니다.",
      managementNotes: "초보 하체 근력의 기본 추천 후보. EX016은 유사한 레그프레스 대체이며 스쿼트류는 난이도와 무릎·허리 상태를 확인해 선택.",
      checklist: ["양발 모양이 짝짝이로 되어 있지는 않나요?","발뒤꿈치가 자꾸 들리지는 않나요?"],
      alternativeExerciseIds: ["EX016","EX013"],
      difficulty: 2,
      cautionTags: ["무릎","허리"],
      videoUrl: "https://youtu.be/3ns7m3VZROo",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX002",
      imageUrl: "https://drive.google.com/file/d/1KsAv_dnllK8ewNGVJ_NCXDIhTBKxnioP/view?usp=drive_link",
      name: "랫 풀 다운",
      bodyParts: ["등","팔"],
      exerciseType: "상체_수직당기기",
      equipmentType: "케이블머신",
      purposeTags: ["등근력","상체근력"],
      benefits: "등 근육을 강화하고 상체의 당기는 힘을 기르는 데 도움을 줍니다.",
      instructions: "가슴을 가볍게 열고 바를 쇄골 방향으로 당깁니다. 몸을 뒤로 크게 젖히거나 반동을 사용하지 않습니다.",
      keyPoints: "척추를 곧게 세우고 가슴을 활짝 폅니다.",
      breathing: "당길 때 내쉬고, 놓을 때 들이마십니다.",
      managementNotes: "초보 등 운동의 기본 추천 후보. EX008은 같은 수직당기기지만 난이도가 높아 초보자에게는 EX006도 대체로 고려.",
      checklist: ["양손을 짝짝이로 잡고 있지는 않나요?","어깨가 앞으로 말리지는 않나요?"],
      alternativeExerciseIds: ["EX008","EX006"],
      difficulty: 1,
      cautionTags: ["어깨","허리"],
      videoUrl: "https://youtu.be/k-v7hPlnpag",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX003",
      imageUrl: "https://drive.google.com/file/d/17uFaPJ5RQKLu6qNfJWAXfnL6q09ARWaL/view?usp=drive_link",
      name: "체스트 프레스",
      bodyParts: ["가슴","삼두"],
      exerciseType: "상체_수평밀기",
      equipmentType: "머신",
      purposeTags: ["상체근력","가슴근력"],
      benefits: "가슴과 팔의 밀어내는 힘을 기르고 상체 기초 근력 향상에 도움을 줍니다.",
      instructions: "등과 머리를 등받이에 붙이고 손잡이를 앞으로 밀어냅니다. 팔꿈치를 과하게 뒤로 보내지 않습니다.",
      keyPoints: "최대한 척추를 곧게 세웁니다.",
      breathing: "밀 때 내쉬고, 돌아올 때 들이마십니다.",
      managementNotes: "초보 가슴 운동의 기본 추천 후보. EX007은 유사한 수평밀기, EX018은 가슴 고립운동이므로 목적에 따라 구분.",
      checklist: ["손이 어깨보다 올라가 있지는 않나요?","상체가 구부정하지는 않나요?"],
      alternativeExerciseIds: ["EX007","EX018"],
      difficulty: 2,
      cautionTags: ["어깨"],
      videoUrl: "https://youtu.be/y-GnRRj_bY0",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX004",
      imageUrl: "https://drive.google.com/file/d/1WJ10GxEwPfSTFX-Fhr-AW9MdYuU4kMgq/view?usp=drive_link",
      name: "레그 컬",
      bodyParts: ["허벅지 뒤"],
      exerciseType: "하체_무릎굴곡",
      equipmentType: "머신",
      purposeTags: ["하체근력","햄스트링"],
      benefits: "허벅지 뒤쪽 근력을 강화해 하체의 균형 있는 근력 발달에 도움을 줍니다.",
      instructions: "기구의 축과 무릎 위치를 맞추고 허벅지가 들리지 않도록 고정한 상태에서 무릎을 굽힙니다.",
      keyPoints: "무릎의 위치를 기구의 회전축과 동일선상에 맞춥니다.",
      breathing: "굽힐 때 내쉬고, 펼 때 들이마십니다.",
      managementNotes: "허벅지 뒤쪽의 무릎 굽힘을 직접 훈련하는 운동. DB 내 동일 패턴 대체가 없어 EX034·EX024는 후면사슬 보완용으로만 취급.",
      checklist: ["종아리에만 과도하게 힘이 들어가지는 않나요?","기구를 쿵쾅거리며 하고 있지는 않나요?","10개도 안 될 정도로 무겁지는 않나요?"],
      alternativeExerciseIds: ["EX034","EX024"],
      difficulty: 2,
      cautionTags: ["무릎"],
      videoUrl: "https://youtu.be/oupoBtDZJPU",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX005",
      imageUrl: "https://drive.google.com/file/d/1zzFCsofKP9Yb5hpz0SpGzZNkS91sHanp/view?usp=drive_link",
      name: "레그 익스텐션",
      bodyParts: ["허벅지 앞"],
      exerciseType: "하체_무릎신전",
      equipmentType: "머신",
      purposeTags: ["하체근력","대퇴사두근"],
      benefits: "허벅지 앞쪽 근력을 강화하고 무릎을 펴는 힘을 기르는 데 도움을 줍니다.",
      instructions: "등받이에 허리를 붙이고 무릎의 축을 기구 회전축에 맞춥니다. 발목 패드를 들어 올리되 무릎을 완전히 잠그지 않고 천천히 내립니다.",
      keyPoints: "엉덩이가 들썩거리지 않도록 합니다.",
      breathing: "펼 때 내쉬고, 굽힐 때 들이마십니다.",
      managementNotes: "허벅지 앞쪽 고립운동. EX001·EX016은 복합 하체 운동으로 1:1 대체는 아니며, 무릎이 불편한 회원은 부하와 동작 범위를 먼저 확인.",
      checklist: ["발목이 덜렁거리지는 않나요?","15개를 다 해도 힘들지 않다면 너무 가벼운 거예요."],
      alternativeExerciseIds: ["EX001","EX016"],
      difficulty: 1,
      cautionTags: ["무릎"],
      videoUrl: "https://youtu.be/Vq-x28-Xlwk",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX006",
      imageUrl: "https://drive.google.com/file/d/1GVEBO4LNv6LQHh6eOY-TJ-_KYkXNkO_B/view?usp=drive_link",
      name: "시티드 로우",
      bodyParts: ["등","팔"],
      exerciseType: "상체_수평당기기",
      equipmentType: "머신",
      purposeTags: ["등근력","상체근력","자세유지"],
      benefits: "등과 팔의 당기는 힘을 기르고 상체를 안정적으로 유지하는 데 도움을 줍니다.",
      instructions: "가슴을 가볍게 열고 허리를 세운 상태에서 손잡이를 몸통 쪽으로 당깁니다. 어깨가 올라가거나 몸을 뒤로 젖히는 반동을 피합니다.",
      keyPoints: "상체를 곧게 세우고 가슴을 편 채로 동작합니다.",
      breathing: "당길 때 내쉬고, 놓을 때 들이마십니다.",
      managementNotes: "초보 등 운동에서 우선 추천. EX028(티 바 로우)은 선호도를 고려해 기본 추천 후순위로 두고, 2개월차 이후 대체·선택 운동으로 고려.",
      checklist: ["몸을 앞뒤로 흔들고 있지는 않나요?","어깨가 앞으로 말리지는 않나요?"],
      alternativeExerciseIds: ["EX002","EX028"],
      difficulty: 1,
      cautionTags: ["어깨","허리"],
      videoUrl: "https://youtu.be/pNdZCuX9k5k",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX007",
      imageUrl: "https://drive.google.com/file/d/1n3Nyb5qqXaY3qkSEA3H0-K9VV_Ch1O0L/view?usp=drive_link",
      name: "해머 벤치 프레스",
      bodyParts: ["가슴","삼두","어깨"],
      exerciseType: "상체_수평밀기",
      equipmentType: "플레이트로드머신",
      purposeTags: ["가슴근력","상체근력"],
      benefits: "가슴과 삼두의 밀어내는 힘을 강화하고 상체 근력 향상에 도움을 줍니다.",
      instructions: "벤치에 등과 머리를 밀착하고 손잡이를 잡은 뒤 가슴을 유지한 채 앞으로 밀어냅니다. 어깨를 으쓱하거나 팔꿈치를 과하게 뒤로 보내지 않습니다.",
      keyPoints: "등과 머리를 벤치에 안정적으로 대고 손목이 뒤로 꺾이지 않도록 합니다. 어깨를 으쓱하거나 허리를 과하게 젖히지 않습니다.",
      breathing: "밀어낼 때 내쉬고, 돌아올 때 들이마십니다.",
      managementNotes: "가슴 복합 머신 운동. 초보 기초 단계는 EX003을 우선하고, 운동 경험이 쌓이면 선택 운동으로 활용.",
      checklist: ["어깨가 귀 쪽으로 올라가지는 않나요?","손목이 뒤로 꺾이지 않고 팔뚝과 나란한가요?","양쪽 손잡이를 반동 없이 고르게 움직이고 있나요?"],
      alternativeExerciseIds: ["EX003"],
      difficulty: 3,
      cautionTags: ["어깨","팔꿈치"],
      videoUrl: "https://youtu.be/XIodCnWhtcQ",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX008",
      imageUrl: "https://drive.google.com/file/d/1mJKh0kAZQKBhskTINPwziS5UgWQUvaOm/view?usp=drive_link",
      name: "어시스트 친업",
      bodyParts: ["등","팔"],
      exerciseType: "상체_수직당기기",
      equipmentType: "어시스트머신",
      purposeTags: ["등근력","상체근력","당기기"],
      benefits: "등과 팔의 당기는 힘을 기르고 맨몸 친업을 위한 기초 근력 향상에 도움을 줍니다.",
      instructions: "보조 중량을 설정하고 무릎 또는 발을 패드에 안정적으로 올립니다. 어깨를 아래로 내린 뒤 가슴을 위로 끌어올리듯 당기고 반동 없이 내려옵니다.",
      keyPoints: "무게 설정: 자신의 체중 +10kg",
      breathing: "올라갈 때 내쉬고, 내려올 때 들이마십니다.",
      managementNotes: "수직당기기의 고난도 응용 운동. 초보는 EX002를 우선하고, 보조 중량 설정과 어깨·팔꿈치 부담을 확인.",
      checklist: ["손잡이를 너무 좁게 잡지는 않았나요?","어깨가 앞으로 말리면서 올라가지는 않나요?"],
      alternativeExerciseIds: ["EX002"],
      difficulty: 4,
      cautionTags: ["어깨","팔꿈치"],
      videoUrl: "https://youtu.be/hBnnJ4sU0F8",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX009",
      imageUrl: "https://drive.google.com/file/d/1QvbYSlHgOXskOFG55_oFcDsK4UpCEDig/view?usp=drive_link",
      name: "케이블 푸시다운",
      bodyParts: ["삼두"],
      exerciseType: "상체_팔꿈치신전",
      equipmentType: "케이블머신",
      purposeTags: ["팔근력","삼두"],
      benefits: "삼두근을 강화해 팔을 펴는 힘과 상체 밀기 동작의 보조 근력 향상에 도움을 줍니다.",
      instructions: "팔꿈치를 몸통 옆에 고정하고 손잡이를 아래로 밀어 팔을 폅니다. 상체 반동이나 손목 꺾임 없이 천천히 돌아옵니다.",
      keyPoints: "팔꿈치를 몸통 옆에 고정하고 팔꿈치를 펴는 동작에 집중합니다. 상체로 누르거나 손목을 꺾지 않습니다.",
      breathing: "아래로 밀어 팔을 펼 때 내쉬고, 돌아올 때 들이마십니다.",
      managementNotes: "삼두 고립운동. 대체는 EX027·EX032처럼 팔꿈치 신전 계열로 연결하며, 가슴 프레스 운동은 동일 대체로 사용하지 않음.",
      checklist: ["팔꿈치가 앞뒤로 크게 움직이지 않나요?","상체를 숙이는 반동으로 손잡이를 누르고 있지는 않나요?","손목이 꺾이지 않고 곧게 유지되나요?"],
      alternativeExerciseIds: ["EX027","EX032"],
      difficulty: 3,
      cautionTags: ["팔꿈치","손목"],
      videoUrl: "https://youtu.be/_Xrs0EBSjSU",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX010",
      imageUrl: "https://drive.google.com/file/d/1ekbeaXItVp-bbtefoWFtHU6vt7-2tTq5/view?usp=drive_link",
      name: "아웃 타이",
      bodyParts: ["엉덩이 옆","고관절"],
      exerciseType: "하체_고관절외전",
      equipmentType: "머신",
      purposeTags: ["둔근","골반안정","하체근력"],
      benefits: "엉덩이 옆쪽 근육을 강화해 고관절을 벌리는 힘과 골반 주변 안정성 향상에 도움을 줍니다.",
      instructions: "등과 골반을 등받이에 고정하고 발과 무릎을 패드 위치에 맞춥니다. 무릎을 바깥쪽으로 천천히 벌린 뒤 반동 없이 돌아옵니다.",
      keyPoints: "상체를 최대한 곧게 유지한 채 동작합니다.",
      breathing: "힘을 쓸 때 내쉬고, 돌아올 때 들이마십니다.",
      managementNotes: "엉덩이 측면의 고관절 외전 고립운동. DB에 동일 패턴 대체가 없어 대체운동ID 공란 유지; 힙 쓰러스트는 주된 동작이 다름.",
      checklist: ["등이 구부정하게 되어 있지는 않나요?","기구를 쿵쾅거리며 하고 있지는 않나요?","15개를 다 해도 힘들지 않다면 너무 가벼운 거예요."],
      alternativeExerciseIds: [],
      difficulty: 2,
      cautionTags: ["고관절","무릎"],
      videoUrl: "https://youtu.be/B3zqt-jfIXY",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX011",
      imageUrl: "https://drive.google.com/file/d/1wHgJUg9cgyuU4sDbmUrrlZ-A6WEWo6la/view?usp=drive_link",
      name: "바벨 로우",
      bodyParts: ["등","팔"],
      exerciseType: "상체_수평당기기",
      equipmentType: "바벨",
      purposeTags: ["등근력","상체근력","코어안정"],
      benefits: "등과 팔의 당기는 힘을 강화하고 상체를 안정적으로 유지하는 데 도움을 줍니다.",
      instructions: "무릎을 가볍게 굽히고 엉덩이를 뒤로 보내 상체를 숙인 뒤 허리를 중립으로 유지합니다. 바를 배꼽 아래쪽으로 당기고 반동 없이 천천히 내립니다.",
      keyPoints: "엉덩이를 뒤로 보내 상체를 숙이고 복부에 힘을 줍니다. 허리의 자연스러운 곡선과 상체 각도를 유지한 채 당깁니다.",
      breathing: "바를 당길 때 내쉬고, 내릴 때 들이마십니다. 동작 중 숨을 오래 참지 않습니다.",
      managementNotes: "허리·몸통 안정이 요구되는 고난도 로우. 초보자 기본 추천은 후순위로 두고 EX006 머신 로우를 우선 대체로 고려.",
      checklist: ["허리가 둥글게 말리거나 과하게 꺾이지 않나요?","바를 당길 때 상체를 일으키는 반동을 쓰고 있지는 않나요?","어깨를 으쓱하지 않고 팔꿈치를 뒤로 보내고 있나요?"],
      alternativeExerciseIds: ["EX006","EX028"],
      difficulty: 5,
      cautionTags: ["허리","어깨"],
      videoUrl: "https://youtu.be/QyZMiNgQXPM",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX012",
      imageUrl: "https://drive.google.com/file/d/1HV0_4xx3TgtBK7A3uLaO5j6aV70DHuMs/view?usp=drive_link",
      name: "프리웨이트 데드리프트",
      bodyParts: ["허벅지 뒤","엉덩이","등"],
      exerciseType: "하체_힙힌지",
      equipmentType: "바벨",
      purposeTags: ["전신근력","둔근","햄스트링","코어안정"],
      benefits: "엉덩이와 허벅지 뒤쪽을 중심으로 전신의 힘을 기르고 힙힌지 동작을 익히는 데 도움을 줍니다.",
      instructions: "발을 안정적으로 두고 엉덩이를 뒤로 보내며 바를 몸 가까이에서 움직입니다. 허리를 중립으로 유지하고 허리를 젖히기보다 엉덩이를 펴며 일어섭니다.",
      keyPoints: "바를 몸 가까이에 두고 엉덩이를 뒤로 보내며 내려갑니다. 복부에 힘을 유지하고, 일어선 뒤 허리를 뒤로 젖히지 않습니다.",
      breathing: "내려가기 전에 들이마시며 복부에 힘을 주고, 일어서면서 천천히 내쉽니다. 숨을 오래 참지 않습니다.",
      managementNotes: "전신·후면사슬을 사용하는 고난도 힙힌지. 초보는 EX034·EX020을 고려할 수 있으나 동작과 자극은 완전히 같지 않으므로 숙련도 확인.",
      checklist: ["바가 다리에서 멀리 떨어지지는 않나요?","허리가 둥글게 말리거나 과하게 꺾이지 않나요?","일어선 뒤 몸을 뒤로 젖히고 있지는 않나요?"],
      alternativeExerciseIds: ["EX034","EX020"],
      difficulty: 4,
      cautionTags: ["허리","무릎","고관절"],
      videoUrl: "https://youtu.be/mZxRPVVk3KE",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX013",
      imageUrl: "https://drive.google.com/file/d/1ht9Gz1BppSe2ziAvh_OJQl-QzzsnJHoT/view?usp=drive_link",
      name: "프리웨이트 스쿼트",
      bodyParts: ["허벅지 앞","엉덩이"],
      exerciseType: "하체_무릎지배",
      equipmentType: "프리웨이트",
      purposeTags: ["하체근력","전신근력","코어안정"],
      benefits: "허벅지와 엉덩이 근력을 강화하고 전신의 기본적인 앉고 일어서는 힘을 기르는 데 도움을 줍니다.",
      instructions: "발을 안정적으로 두고 복부에 힘을 준 상태에서 엉덩이와 무릎을 함께 굽힙니다. 무릎은 발끝 방향을 유지하고 허리가 과하게 말리지 않는 범위에서 내려갑니다.",
      keyPoints: "발바닥은 ‘V’를 만들고, 앞꿈치에 체중이 쏠리지 않도록 합니다.",
      breathing: "일어설 때 내쉬고, 앉을 때 들이마십니다.",
      managementNotes: "프리웨이트 스쿼트는 자세 숙련도가 필요. EX039는 유사한 스쿼트 패턴, EX001·EX016은 기초 머신 대체로 구분해 사용.",
      checklist: ["양발 모양이 짝짝이로 되어 있지는 않나요?","발뒤꿈치가 자꾸 들리지는 않나요?"],
      alternativeExerciseIds: ["EX039","EX001","EX016"],
      difficulty: 4,
      cautionTags: ["무릎","허리","고관절"],
      videoUrl: "https://youtu.be/9XWgqWdsK1A",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX014",
      imageUrl: "https://drive.google.com/file/d/1oaNsA7e80km4PwWY9HL4rrw3Y0IbSZgL/view?usp=drive_link",
      name: "싱글 레그 데드리프트",
      bodyParts: ["허벅지 뒤","엉덩이","고관절"],
      exerciseType: "하체_힙힌지_편측",
      equipmentType: "프리웨이트",
      purposeTags: ["둔근","햄스트링","균형","고관절안정"],
      benefits: "한쪽 다리의 엉덩이와 허벅지 뒤쪽 근력을 강화하고 균형 능력 향상에 도움을 줍니다.",
      instructions: "지지하는 발로 균형을 잡고 골반이 돌아가지 않도록 유지한 채 엉덩이를 뒤로 보냅니다. 상체와 들리는 다리가 함께 움직이도록 하며 허리는 중립을 유지합니다.",
      keyPoints: "지지하는 무릎을 살짝 굽히고 골반이 옆으로 열리지 않도록 합니다. 균형을 유지할 수 있는 범위에서 상체와 반대쪽 다리를 함께 움직입니다.",
      breathing: "상체를 숙일 때 들이마시고, 일어설 때 내쉽니다.",
      managementNotes: "편측 힙힌지·균형 능력이 필요한 고난도 운동. EX034·EX020은 후면사슬 보완용이며 편측 균형 훈련을 완전히 대체하지는 못함.",
      checklist: ["골반이 옆으로 돌아가거나 들리지는 않나요?","허리를 굽히는 대신 엉덩이를 뒤로 보내고 있나요?","균형이 무너질 만큼 깊게 내려가고 있지는 않나요?"],
      alternativeExerciseIds: ["EX034","EX020"],
      difficulty: 5,
      cautionTags: ["허리","고관절","무릎"],
      videoUrl: "https://youtu.be/mryinsWc6cc",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX015",
      imageUrl: "https://drive.google.com/file/d/1BiStiMGQdzllMbIPIacM8TrLaR3epjBt/view?usp=drive_link",
      name: "프리웨이트 런지",
      bodyParts: ["허벅지 앞","엉덩이"],
      exerciseType: "하체_런지",
      equipmentType: "프리웨이트",
      purposeTags: ["하체근력","균형","편측근력"],
      benefits: "양쪽 하체를 독립적으로 사용하며 허벅지와 엉덩이 근력 및 균형 능력을 높이는 데 도움을 줍니다.",
      instructions: "한 발을 앞이나 뒤로 내딛고 몸통을 세운 상태에서 양쪽 무릎을 굽힙니다. 앞쪽 무릎이 발끝 방향을 유지하도록 하고 발바닥 전체로 바닥을 밀어 올라옵니다.",
      keyPoints: "양발 사이에 좌우 간격을 두고 앞쪽 무릎이 발끝 방향으로 움직이게 합니다. 몸통을 안정적으로 유지하며 천천히 내려갔다 올라옵니다.",
      breathing: "내려갈 때 들이마시고, 올라올 때 내쉽니다.",
      managementNotes: "편측 하체 근력·균형 목적. 레그프레스 또는 스미스 스쿼트로 대체하면 편측 균형 훈련 요소가 줄어든다는 점을 고려.",
      checklist: ["앞쪽 무릎이 안쪽으로 무너지지는 않나요?","앞발의 뒤꿈치가 바닥에서 들리지는 않나요?","양발을 외줄처럼 놓아 몸이 흔들리고 있지는 않나요?"],
      alternativeExerciseIds: ["EX001","EX016","EX039"],
      difficulty: 4,
      cautionTags: ["무릎","고관절","발목"],
      videoUrl: "https://youtu.be/aTEiHMjQXQc",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX016",
      imageUrl: "https://drive.google.com/file/d/1hKWMMjOLn_cJs7vCflfvG9fFZJEXYoZ0/view?usp=drive_link",
      name: "시티드 레그프레스",
      bodyParts: ["허벅지 앞","엉덩이"],
      exerciseType: "하체_무릎지배",
      equipmentType: "머신",
      purposeTags: ["하체근력","기초체력"],
      benefits: "허벅지와 엉덩이의 기초 근력을 강화하고 안정적으로 하체 밀기 동작을 익히는 데 도움을 줍니다.",
      instructions: "엉덩이와 허리를 등받이에 밀착하고 발을 발판에 안정적으로 둡니다. 발 전체로 밀어내되 무릎을 완전히 잠그지 않고 천천히 돌아옵니다.",
      keyPoints: "엉덩이와 허리가 등받이에서 떨어지지 않는 범위로 무릎을 굽힙니다. 발바닥 전체로 밀고 무릎을 끝까지 잠그지 않습니다.",
      breathing: "다리를 펼 때 내쉬고, 굽힐 때 들이마십니다.",
      managementNotes: "초보 하체 근력의 기본 후보. EX001은 유사한 레그프레스, EX039는 스쿼트 패턴이므로 난이도 차이를 확인.",
      checklist: ["무릎을 굽힐 때 엉덩이나 허리가 들리지는 않나요?","양쪽 무릎이 발끝 방향으로 움직이고 있나요?","발뒤꿈치가 발판에서 떨어지지는 않나요?"],
      alternativeExerciseIds: ["EX001","EX039"],
      difficulty: 2,
      cautionTags: ["무릎","허리"],
      videoUrl: "https://youtu.be/PKKJe-R6Sn0",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX017",
      imageUrl: "https://drive.google.com/file/d/1Q28At6Bu-Lv612plLrJjZ0jhK6NWJ4s_/view?usp=drive_link",
      name: "숄더 프레스 머신",
      bodyParts: ["어깨","삼두"],
      exerciseType: "상체_수직밀기",
      equipmentType: "머신",
      purposeTags: ["어깨근력","상체근력"],
      benefits: "어깨와 삼두의 밀어내는 힘을 강화해 상체 근력 향상에 도움을 줍니다.",
      instructions: "좌석을 조절해 손잡이가 어깨 높이 부근에 오도록 하고 등받이에 등을 붙입니다. 어깨를 으쓱하지 않은 상태에서 위로 밀고 팔꿈치를 완전히 잠그지 않습니다.",
      keyPoints: "고개를 뒤로 당긴 채로 동작합니다.",
      breathing: "밀어 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "어깨 수직밀기의 기초 머신 운동. 가슴 수평밀기 운동 대신 EX033·EX037을 대체로 연결하고 어깨 가동 범위를 확인.",
      checklist: ["혹시 얼굴을 앞으로 내밀고 있지는 않나요?","팔꿈치가 아프다면 너무 무거운 거예요."],
      alternativeExerciseIds: ["EX033","EX037"],
      difficulty: 2,
      cautionTags: ["어깨","팔꿈치","목"],
      videoUrl: "https://youtu.be/RXlcfwp7kHs",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX018",
      imageUrl: "https://drive.google.com/file/d/16vHKMSnEuSjRdJItew2nCL_IO9bwkP16/view?usp=drive_link",
      name: "펙 덱 플라이",
      bodyParts: ["가슴","어깨 앞"],
      exerciseType: "상체_수평모으기",
      equipmentType: "머신",
      purposeTags: ["가슴근력","상체근력"],
      benefits: "가슴 근육을 수축하는 감각을 익히고 가슴 근력 향상에 도움을 줍니다.",
      instructions: "등을 등받이에 붙이고 가슴을 가볍게 편 상태에서 팔꿈치를 약간 굽혀 손잡이를 몸 앞쪽으로 모읍니다. 어깨가 앞으로 말리지 않도록 천천히 움직입니다.",
      keyPoints: "최대한 척추를 곧게 세웁니다.",
      breathing: "팔을 모을 때 내쉬고, 벌릴 때 들이마십니다.",
      managementNotes: "가슴 모으기 중심 고립운동. EX003·EX007은 가슴 복합 밀기 운동으로, 동일한 수평모으기 동작은 아니라는 점을 반영.",
      checklist: ["손이 어깨보다 올라가 있지는 않나요?","상체가 구부정하지는 않나요?"],
      alternativeExerciseIds: ["EX003","EX007"],
      difficulty: 2,
      cautionTags: ["어깨"],
      videoUrl: "https://youtu.be/VmNXpYDtT1U",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX019",
      imageUrl: "https://drive.google.com/file/d/16vHKMSnEuSjRdJItew2nCL_IO9bwkP16/view?usp=drive_link",
      name: "리어 델트 플라이",
      bodyParts: ["어깨 뒤","등 윗부분"],
      exerciseType: "상체_수평벌리기",
      equipmentType: "머신",
      purposeTags: ["후면어깨","등상부","자세유지"],
      benefits: "어깨 뒤쪽과 등 윗부분을 강화해 상체 후면 근력과 자세 유지에 도움을 줍니다.",
      instructions: "가슴을 패드에 안정적으로 대고 팔을 옆으로 벌립니다. 어깨가 올라가지 않게 유지하고 반동 없이 팔을 뒤쪽으로 보낸 뒤 천천히 돌아옵니다.",
      keyPoints: "가슴을 패드에 댄 상태로 팔꿈치를 살짝 굽혀 유지합니다. 어깨를 으쓱하거나 상체를 젖히지 않고 팔을 벌립니다.",
      breathing: "팔을 벌릴 때 내쉬고, 모으며 돌아올 때 들이마십니다.",
      managementNotes: "후면 삼각근 고립운동. EX006·EX028은 등 중심 로우 운동이므로 후면 어깨의 직접적인 1:1 대체는 아님.",
      checklist: ["가슴이 패드에서 떨어지지는 않나요?","어깨가 귀 쪽으로 올라가지는 않나요?","팔꿈치를 계속 굽혔다 펴며 당기고 있지는 않나요?"],
      alternativeExerciseIds: ["EX006","EX028"],
      difficulty: 3,
      cautionTags: ["어깨","목"],
      videoUrl: "https://youtu.be/VmNXpYDtT1U",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX020",
      imageUrl: "https://drive.google.com/file/d/1tQzxYaS-EHR5kYB7DzagIFuoQQlBG27-/view?usp=drive_link",
      name: "힙 쓰러스트",
      bodyParts: ["엉덩이","허벅지 뒤"],
      exerciseType: "하체_고관절신전",
      equipmentType: "머신",
      purposeTags: ["둔근","하체근력","고관절신전"],
      benefits: "엉덩이 근력을 강화하고 고관절을 펴는 힘을 기르는 데 도움을 줍니다.",
      instructions: "등 윗부분을 지지대에 안정적으로 두고 발을 바닥에 고정합니다. 엉덩이를 들어 올릴 때 허리를 과하게 젖히지 말고 엉덩이에 힘을 준 뒤 천천히 내려옵니다.",
      keyPoints: "엉덩이를 들었을 때 무릎 각도가 90도가 되도록 합니다.",
      breathing: "들어 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "엉덩이 고관절 신전 중심 운동. EX024 브릿지를 기초 대체로 우선하고, EX034는 힙힌지·허리 안정 요구를 검토해 선택.",
      checklist: ["발 위치가 너무 멀리 있지는 않나요?","15개를 다 해도 힘들지 않다면 너무 가벼운 거예요."],
      alternativeExerciseIds: ["EX024","EX034"],
      difficulty: 3,
      cautionTags: ["허리","고관절"],
      videoUrl: "https://youtu.be/EN53h_byKAc",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX021",
      imageUrl: "https://drive.google.com/file/d/1ekbeaXItVp-bbtefoWFtHU6vt7-2tTq5/view?usp=drive_link",
      name: "이너 타이",
      bodyParts: ["허벅지 안쪽","고관절"],
      exerciseType: "하체_고관절내전",
      equipmentType: "머신",
      purposeTags: ["내전근","골반안정","하체근력"],
      benefits: "허벅지 안쪽 근육을 강화해 고관절을 모으는 힘과 골반 주변 안정성 향상에 도움을 줍니다.",
      instructions: "등과 골반을 등받이에 고정하고 다리를 패드에 안정적으로 둡니다. 반동 없이 다리를 안쪽으로 모은 뒤 천천히 시작 자세로 돌아옵니다.",
      keyPoints: "상체를 최대한 곧게 유지한 채 동작합니다.",
      breathing: "힘을 쓸 때 내쉬고, 돌아올 때 들이마십니다.",
      managementNotes: "허벅지 안쪽의 고관절 내전 고립운동. 현재 DB에 같은 내전 계열 운동이 없어 대체운동ID 공란 유지.",
      checklist: ["등이 구부정하게 되어 있지는 않나요?","기구를 쿵쾅거리며 하고 있지는 않나요?","15개를 다 해도 힘들지 않다면 너무 가벼운 거예요."],
      alternativeExerciseIds: [],
      difficulty: 2,
      cautionTags: ["고관절","무릎"],
      videoUrl: "https://youtu.be/B3zqt-jfIXY",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX022",
      imageUrl: "https://drive.google.com/file/d/1LGz0GqHv1e7y3zI0S45aCmvgn-IRXgFp/view?usp=drive_link",
      name: "버드 독",
      bodyParts: ["코어","허리 주변"],
      exerciseType: "코어_교차안정",
      equipmentType: "맨몸",
      purposeTags: ["코어안정","균형","자세유지"],
      benefits: "몸통을 안정적으로 유지하는 힘과 좌우 균형을 기르는 데 도움을 줍니다.",
      instructions: "네발기기 자세에서 배에 힘을 주고 허리가 과하게 꺾이지 않게 유지합니다. 한쪽 팔과 반대쪽 다리를 길게 뻗은 뒤 천천히 돌아옵니다.",
      keyPoints: "복부에 힘을 주고 골반을 수평으로 유지합니다. 팔과 반대쪽 다리를 높이 들기보다 몸통 높이에서 앞뒤로 길게 뻗습니다.",
      breathing: "팔다리를 뻗을 때 천천히 내쉬고, 돌아올 때 들이마십니다. 자세를 유지하는 동안에도 편안하게 호흡합니다.",
      managementNotes: "기초 코어 안정·교차 조절 운동. EX024 브릿지는 지지 형태가 다르지만 손목 부담을 줄인 코어·골반 안정 보완용으로 고려 가능.",
      checklist: ["팔다리를 뻗을 때 허리가 아래로 처지지는 않나요?","골반이 한쪽으로 돌아가거나 들리지는 않나요?","고개를 들지 않고 시선을 바닥에 두고 있나요?"],
      alternativeExerciseIds: ["EX024"],
      difficulty: 2,
      cautionTags: ["손목"],
      videoUrl: "",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX023",
      imageUrl: "https://drive.google.com/file/d/14oTfQFcPvLOVQg2EcXrUeixPGdHY2ngf/view?usp=drive_link",
      name: "크런치",
      bodyParts: ["복부"],
      exerciseType: "코어_몸통굴곡",
      equipmentType: "맨몸",
      purposeTags: ["복부근력","코어"],
      benefits: "복부 근력을 강화하고 몸통을 안정적으로 움직이는 데 도움을 줍니다.",
      instructions: "무릎을 세우고 누운 뒤 허리가 과하게 뜨지 않도록 유지합니다. 배에 힘을 주며 어깨뼈가 바닥에서 살짝 떨어질 정도까지만 상체를 들어 올리고 천천히 내려옵니다.",
      keyPoints: "목을 손으로 당기지 않고 복부의 힘으로 어깨뼈를 살짝 들어 올립니다. 상체를 크게 일으키기보다 짧고 천천히 움직입니다.",
      breathing: "상체를 들어 올릴 때 내쉬고, 내려놓을 때 들이마십니다.",
      managementNotes: "기초 복부 몸통 굴곡 운동. EX036은 같은 굴곡 계열이지만 난이도가 높고, EX022는 굴곡이 아닌 코어 안정 목적.",
      checklist: ["손으로 머리나 목을 당기고 있지는 않나요?","반동으로 상체를 크게 일으키고 있지는 않나요?","턱을 가슴에 과하게 붙이지 않고 목을 편안하게 유지하나요?"],
      alternativeExerciseIds: ["EX036","EX022"],
      difficulty: 1,
      cautionTags: ["허리","목"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex023-crunch.gif?v=97",
      enabled: true
    },
    {
      exerciseId: "EX024",
      imageUrl: "https://drive.google.com/file/d/14msyk5wgZNJmJrkTUTn4RPwUm7qpZ2Rh/view?usp=drive_link",
      name: "브릿지",
      bodyParts: ["엉덩이","허벅지 뒤","코어"],
      exerciseType: "하체_고관절신전_맨몸",
      equipmentType: "맨몸",
      purposeTags: ["둔근","코어안정","고관절신전"],
      benefits: "엉덩이와 허벅지 뒤쪽을 강화하고 골반과 몸통을 안정적으로 유지하는 데 도움을 줍니다.",
      instructions: "무릎을 세우고 누운 상태에서 발바닥을 바닥에 고정합니다. 엉덩이에 힘을 주며 골반을 들어 올리고 허리를 과하게 젖히지 않은 채 천천히 내려옵니다.",
      keyPoints: "발바닥을 바닥에 고정하고 엉덩이에 힘을 주며 골반을 들어 올립니다. 허리를 꺾어 높이 올리지 않고 어깨부터 무릎까지 완만한 일직선을 만듭니다.",
      breathing: "엉덩이를 들어 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "기초 둔근·고관절 신전 운동. EX020은 부하 증가형 대체, EX034는 힙힌지 운동이므로 운동 경험에 따라 구분.",
      checklist: ["엉덩이 대신 허리를 과하게 꺾어 올리고 있지는 않나요?","양쪽 무릎이 안쪽이나 바깥쪽으로 흔들리지는 않나요?","발뒤꿈치가 바닥에서 들리지는 않나요?"],
      alternativeExerciseIds: ["EX020","EX034"],
      difficulty: 1,
      cautionTags: ["허리","무릎"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex024-bridge.gif?v=96",
      enabled: true
    },
    {
      exerciseId: "EX025",
      imageUrl: "https://drive.google.com/file/d/1tLITya3UCcPU5qGCnQ9K1AWQ7a550ncT/view?usp=drive_link",
      name: "캣 카우",
      bodyParts: ["등","허리","목"],
      exerciseType: "전신_척추가동성",
      equipmentType: "맨몸",
      purposeTags: ["가동성","몸풀기","자세조절"],
      benefits: "등과 허리의 움직임을 부드럽게 하고 몸통을 천천히 조절하는 감각을 익히는 데 도움을 줍니다.",
      instructions: "네발기기 자세에서 숨을 내쉬며 등을 천천히 둥글게 만들고, 반대로 가슴을 열며 허리를 편안하게 움직입니다. 통증이 없는 범위에서 부드럽게 반복합니다.",
      keyPoints: "손은 어깨 아래, 무릎은 골반 아래에 둡니다. 호흡에 맞춰 등을 천천히 둥글게 했다가 펴며, 목과 허리를 억지로 꺾지 않습니다.",
      breathing: "등을 둥글게 말 때 내쉬고, 가슴을 열며 등을 펼 때 들이마십니다.",
      managementNotes: "척추 가동성·준비운동 목적. 근력 운동의 직접 대체로 사용하지 않으며 DB 내 동일한 가동성 패턴 운동이 없어 공란 유지.",
      checklist: ["팔꿈치를 굽혔다 펴는 동작으로 대신하고 있지는 않나요?","목이나 허리를 끝까지 억지로 꺾고 있지는 않나요?","호흡에 맞춰 통증 없는 범위에서 부드럽게 움직이고 있나요?"],
      alternativeExerciseIds: [],
      difficulty: 1,
      cautionTags: ["손목"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex025-cat-cow.gif?v=97",
      enabled: true
    },
    {
      exerciseId: "EX026",
      imageUrl: "https://drive.google.com/file/d/1OB_rtPwH63c4yx_Jdm-S_2e5qCZsa7Wp/view?usp=drive_link",
      name: "덤벨 컬",
      bodyParts: ["이두","팔"],
      exerciseType: "상체_팔꿈치굴곡",
      equipmentType: "덤벨",
      purposeTags: ["팔근력","이두","상체근력"],
      benefits: "이두근을 강화해 팔을 굽히는 힘과 상체 당기기 동작의 보조 근력 향상에 도움을 줍니다.",
      instructions: "양손에 덤벨을 들고 팔꿈치를 몸통 옆에 고정합니다. 상체 반동 없이 덤벨을 어깨 쪽으로 들어 올린 뒤 천천히 내려옵니다.",
      keyPoints: "팔꿈치를 몸통 옆에 두고 손목을 곧게 유지합니다. 몸을 흔들지 않고 팔꿈치를 굽혀 덤벨을 올린 뒤 천천히 내립니다.",
      breathing: "덤벨을 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "초보 이두 보조운동. EX031은 앉아서 수행하는 유사 컬, EX029는 중립 그립으로 전완 관여가 달라짐.",
      checklist: ["몸을 앞뒤로 흔들어 덤벨을 올리고 있지는 않나요?","팔꿈치가 앞으로 크게 빠지지는 않나요?","덤벨을 내릴 때도 속도를 조절하고 있나요?"],
      alternativeExerciseIds: ["EX031","EX029"],
      difficulty: 2,
      cautionTags: ["손목","팔꿈치"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex026-dumbbell-curl.gif?v=95",
      enabled: true
    },
    {
      exerciseId: "EX027",
      imageUrl: "https://drive.google.com/file/d/1DV6R730Iw5btqJZr1IKecsgCvpJTA_Vn/view?usp=drive_link",
      name: "덤벨 킥백",
      bodyParts: ["삼두","팔"],
      exerciseType: "상체_팔꿈치신전",
      equipmentType: "덤벨",
      purposeTags: ["팔근력","삼두","상체근력"],
      benefits: "삼두근을 강화해 팔을 펴는 힘과 상체 밀기 동작의 보조 근력 향상에 도움을 줍니다.",
      instructions: "상체를 가볍게 숙이고 팔꿈치를 몸통 옆에 고정합니다. 팔꿈치 위치를 유지한 채 덤벨을 뒤로 밀어 팔을 편 뒤 천천히 돌아옵니다.",
      keyPoints: "상체를 숙인 상태에서 위팔과 팔꿈치 위치를 고정합니다. 어깨로 팔 전체를 흔들지 않고 팔꿈치를 펴며 덤벨을 뒤로 보냅니다.",
      breathing: "팔을 뒤로 펼 때 내쉬고, 굽혀 돌아올 때 들이마십니다.",
      managementNotes: "삼두 보조운동. 몸통 고정이 어렵다면 EX009 케이블 푸시다운을 우선 대체하고 EX032는 어깨 가동 범위를 확인.",
      checklist: ["팔꿈치가 아래로 떨어지거나 앞뒤로 움직이지 않나요?","팔 전체를 흔드는 반동을 쓰고 있지는 않나요?","허리와 손목이 과하게 꺾이지 않나요?"],
      alternativeExerciseIds: ["EX009","EX032"],
      difficulty: 2,
      cautionTags: ["팔꿈치"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex027-dumbbell-kickback.gif?v=96",
      enabled: true
    },
    {
      exerciseId: "EX028",
      imageUrl: "https://drive.google.com/file/d/116cw_8Qta5QRlit2WlWEGfQI5EijyHsh/view?usp=drive_link",
      name: "티 바 로우",
      bodyParts: ["등","팔","어깨 뒤"],
      exerciseType: "상체_수평당기기",
      equipmentType: "플레이트로드머신",
      purposeTags: ["등근력","상체근력","당기기"],
      benefits: "등 근육과 팔의 당기는 힘을 강화하고 상체 후면의 근력 발달에 도움을 줍니다.",
      instructions: "발판에 양발을 안정적으로 놓고 가슴을 지지 패드에 댄 뒤 손잡이를 잡습니다. 허리를 과하게 꺾거나 상체를 흔들지 않고 팔꿈치를 뒤로 보내며 손잡이를 몸통 쪽으로 당깁니다. 어깨가 올라가지 않도록 유지하면서 천천히 시작 자세로 돌아옵니다.",
      keyPoints: "상체의 반동을 최소화합니다.",
      breathing: "당길 때 내쉬고, 내려놓을 때 들이마십니다.",
      managementNotes: "회원 선호도가 낮아 기본 루틴에서는 추천 후순위. 2개월차 이후 선택·대체 운동으로 사용하고 초보 등 운동은 EX006·EX002를 우선.",
      checklist: ["발판의 위치를 확인하셨나요?","허리를 꺾으면서 당기고 있지는 않나요?"],
      alternativeExerciseIds: ["EX006","EX011"],
      difficulty: 3,
      cautionTags: ["허리","어깨","팔꿈치"],
      videoUrl: "https://youtu.be/028E5nNh9kE",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX029",
      imageUrl: "https://drive.google.com/file/d/1VdfnaqCClZbABCp8nwjwBJHa-M14ZeJo/view?usp=drive_link",
      name: "해머 컬",
      bodyParts: ["이두","팔"],
      exerciseType: "상체_팔꿈치굴곡",
      equipmentType: "덤벨",
      purposeTags: ["팔근력","이두","전완"],
      benefits: "이두근과 팔꿈치를 굽히는 주변 근육을 강화하고 팔의 당기는 힘을 기르는 데 도움을 줍니다.",
      instructions: "양손에 덤벨을 들고 손바닥이 서로 마주보도록 섭니다. 팔꿈치를 몸통 옆에 둔 채 덤벨을 어깨 쪽으로 올리고, 손목 방향을 유지하며 천천히 내립니다.",
      keyPoints: "손바닥이 마주보는 방향과 곧은 손목을 유지합니다. 상체를 흔들거나 팔꿈치를 앞으로 많이 보내지 않습니다.",
      breathing: "덤벨을 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "중립 그립의 이두·전완 보조운동. EX026·EX031로 교체할 수 있으며 그립에 따른 자극 차이를 반영.",
      checklist: ["몸을 흔들거나 어깨를 으쓱하지 않나요?","덤벨을 내릴 때도 속도를 조절하나요?"],
      alternativeExerciseIds: ["EX026","EX031"],
      difficulty: 2,
      cautionTags: ["어깨"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex029-hammer-curl.gif?v=96",
      enabled: true
    },
    {
      exerciseId: "EX030",
      imageUrl: "https://drive.google.com/file/d/1rDuuydkwi7MWPpU4TWow3BE54catwz-O/view?usp=drive_link",
      name: "바벨 컬",
      bodyParts: ["이두","팔"],
      exerciseType: "상체_팔꿈치굴곡",
      equipmentType: "바벨",
      purposeTags: ["팔근력","이두","상체근력"],
      benefits: "이두근을 강화해 팔꿈치를 굽히는 힘과 상체 당기기 동작의 보조 근력 향상에 도움을 줍니다.",
      instructions: "바벨을 손바닥이 앞을 향하도록 편안한 어깨너비 정도로 잡습니다. 복부에 힘을 주고 팔꿈치를 몸통 옆에 둔 채 바를 올린 뒤 천천히 내립니다.",
      keyPoints: "손목이 뒤로 꺾이지 않도록 하고 허리를 젖히는 반동을 피합니다. 바를 잡았을 때 손목이나 팔꿈치에 통증이 있으면 중단합니다.",
      breathing: "바벨을 올릴 때 내쉬고, 내릴 때 들이마십니다. 숨을 오래 참지 않습니다.",
      managementNotes: "바벨 컬은 높은 숙련도가 필요한 이두 보조운동. 초보 기본 추천 후순위로 두고 EX026·EX031로 난이도를 조절.",
      checklist: ["허리를 뒤로 젖혀 바를 올리고 있지는 않나요?","팔꿈치가 앞으로 많이 빠지지 않나요?","손목을 꺾으면서 들어올리지는 않나요?"],
      alternativeExerciseIds: ["EX026","EX031"],
      difficulty: 4,
      cautionTags: ["손목","허리"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex030-barbell-curl.gif?v=97",
      enabled: true
    },
    {
      exerciseId: "EX031",
      imageUrl: "https://drive.google.com/file/d/1EZRVM1RiukdLLeamb0V0j9cNl--pIyI1/view?usp=drive_link",
      name: "시티드 덤벨 컬",
      bodyParts: ["이두","팔"],
      exerciseType: "상체_팔꿈치굴곡",
      equipmentType: "덤벨",
      purposeTags: ["팔근력","이두","상체근력"],
      benefits: "앉은 자세에서 이두근을 강화하고 상체 반동을 줄여 팔꿈치를 굽히는 힘을 기르는 데 도움을 줍니다.",
      instructions: "벤치에 앉아 발바닥을 바닥에 붙이고 덤벨을 몸 옆에 둡니다. 손바닥이 앞을 향하도록 잡고 팔꿈치 위치를 유지하며 덤벨을 올린 뒤 천천히 내립니다.",
      keyPoints: "허리를 과하게 젖히거나 몸을 흔들지 않습니다. 어깨를 으쓱하지 않고 손목과 팔뚝이 나란하도록 유지합니다.",
      breathing: "덤벨을 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "앉아서 수행하는 이두 보조운동. 몸통 반동을 줄여 운동하려는 회원에게 고려하고 EX026·EX029로 교체 가능.",
      checklist: ["팔꿈치를 앞뒤로 크게 흔들지는 않나요?","덤벨을 천천히 내리고 있나요?"],
      alternativeExerciseIds: ["EX026","EX029"],
      difficulty: 2,
      cautionTags: ["손목"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex031-seated-dumbbell-curl.gif?v=97",
      enabled: true
    },
    {
      exerciseId: "EX032",
      imageUrl: "https://drive.google.com/file/d/1Y-aOlBElcOnSCb5QxCvNW8j1b_rWzNzw/view?usp=drive_link",
      name: "스탠딩 트라이셉스 덤벨 익스텐션",
      bodyParts: ["삼두","팔"],
      exerciseType: "상체_팔꿈치신전",
      equipmentType: "덤벨",
      purposeTags: ["팔근력","삼두","상체근력"],
      benefits: "삼두근을 강화해 팔꿈치를 펴는 힘과 상체 밀기 동작의 보조 근력 향상에 도움을 줍니다.",
      instructions: "양손으로 덤벨 하나를 안정적으로 잡고 머리 위로 올립니다. 복부에 힘을 주고 위팔 위치를 유지하며 팔꿈치를 굽혀 덤벨을 머리 뒤로 내린 다음 천천히 팔을 폅니다.",
      keyPoints: "머리를 덤벨에 부딪치지 않도록 간격을 확보하고 허리를 과하게 젖히지 않습니다. 어깨가 편안한 범위에서만 움직입니다.",
      breathing: "팔을 펴 덤벨을 올릴 때 내쉬고, 머리 뒤로 내릴 때 들이마십니다.",
      managementNotes: "삼두 팔꿈치 신전 운동. 어깨를 높이 드는 자세가 부담스럽다면 EX009·EX027을 우선 대체로 고려.",
      checklist: ["허리가 과하게 꺾이지는 않나요?","팔의 반동이 많지는 않나요?"],
      alternativeExerciseIds: ["EX009","EX027"],
      difficulty: 3,
      cautionTags: ["어깨"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex032-standing-dumbbell-triceps-extension.gif?v=97",
      enabled: true
    },
    {
      exerciseId: "EX033",
      imageUrl: "https://drive.google.com/file/d/1TorNmOW60spum-gOWSiOl4Dq-kwNtRhA/view?usp=drive_link",
      name: "시티드 덤벨 숄더 프레스",
      bodyParts: ["어깨","삼두"],
      exerciseType: "상체_수직밀기",
      equipmentType: "덤벨",
      purposeTags: ["어깨근력","상체근력","삼두"],
      benefits: "어깨와 삼두의 근력을 강화하고 팔을 머리 위로 밀어 올리는 힘을 기르는 데 도움을 줍니다.",
      instructions: "등받이가 있는 벤치에 앉아 양발을 바닥에 고정하고 덤벨을 어깨 높이로 듭니다. 팔꿈치를 몸통보다 약간 앞에 두고 덤벨을 위로 밀어 올린 뒤 편안한 범위까지 천천히 내립니다.",
      keyPoints: "손목과 팔꿈치가 직각이 되도록 하고 허리를 과하게 젖히지 않습니다. 덤벨을 서로 부딪치지 않게 조절하며 어깨에 통증이 생기면 중단합니다.",
      breathing: "덤벨을 밀어 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "덤벨 어깨 수직밀기는 좌우 안정성이 요구됨. 초보는 EX017 머신을 우선하고 EX037은 더 높은 난이도를 확인.",
      checklist: ["손목이 뒤로 과하게 꺾이지 않나요?","고개를 내밀지는 않고 있나요?"],
      alternativeExerciseIds: ["EX017","EX037"],
      difficulty: 3,
      cautionTags: ["목"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex033-seated-dumbbell-shoulder-press.gif?v=97",
      enabled: true
    },
    {
      exerciseId: "EX034",
      imageUrl: "https://drive.google.com/file/d/107N0zZVnUSAXgoYvStvCyxeUjsSuPnMJ/view?usp=drive_link",
      name: "백 익스텐션",
      bodyParts: ["허벅지 뒤","엉덩이"],
      exerciseType: "하체_힙힌지",
      equipmentType: "머신",
      purposeTags: ["둔근","햄스트링","코어안정"],
      benefits: "엉덩이와 허벅지 뒤쪽 근력을 기르고 몸통을 안정적으로 유지하며 고관절을 펴는 동작을 익히는 데 도움을 줍니다.",
      instructions: "백 익스텐션 벤치에서 패드를 골반이 접히는 부분 아래에 맞추고 발을 고정합니다. 허리의 자연스러운 곡선을 유지하며 고관절을 접어 상체를 숙인 뒤, 엉덩이에 힘을 주어 몸통과 다리가 일직선이 될 때까지만 올라옵니다.",
      keyPoints: "허리를 뒤로 꺾어 높이 올라가지 않습니다. 반동 없이 움직여야 합니다.",
      breathing: "상체를 숙일 때 들이마시고, 일으킬 때 내쉽니다. 복부에 힘을 유지하되 숨을 오래 참지 않습니다.",
      managementNotes: "후면사슬 힙힌지 운동. EX020은 둔근 신전 중심, EX012는 더 높은 숙련도를 요구하므로 허리 불편 여부와 운동 경력을 확인.",
      checklist: ["패드가 배를 눌러 고관절 움직임을 막지는 않나요?","올라온 뒤 허리를 뒤로 과하게 젖히지 않나요?"],
      alternativeExerciseIds: ["EX020","EX012"],
      difficulty: 3,
      cautionTags: ["허리"],
      videoUrl: "https://www.youtube.com/shorts/07D9XpWKfyc?feature=share",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX035",
      imageUrl: "https://drive.google.com/file/d/1VPJYmNnL40ymtMv-P4VjXIKDaYEu-VEa/view?usp=drive_link",
      name: "바벨 벤치 프레스",
      bodyParts: ["가슴","삼두","어깨"],
      exerciseType: "상체_수평밀기",
      equipmentType: "바벨",
      purposeTags: ["가슴근력","상체근력","삼두"],
      benefits: "가슴과 삼두, 어깨 앞쪽 근육을 강화하고 상체의 밀어내는 힘을 기르는 데 도움을 줍니다.",
      instructions: "평평한 벤치에 누워 양발을 바닥에 고정하고 어깨뼈를 안정적으로 받칩니다. 바를 엄지까지 감싸 잡고 손목 아래에 팔꿈치가 오도록 유지하면서 가슴 쪽으로 천천히 내린 뒤 밀어 올립니다.",
      keyPoints: "안전바 높이를 먼저 맞추고 수행합니다. 어깨가 편안한 범위로 내립니다.",
      breathing: "바를 내릴 때 들이마시고, 밀어 올릴 때 내쉽니다. 동작 중 숨을 오래 참지 않습니다.",
      managementNotes: "바벨 벤치 프레스는 고난도 선택 운동. 초보 기본 추천은 EX003 머신을 우선하고 중량·안전장치·지도 가능 여부를 확인.",
      checklist: ["바가 내려오는 위치가 목에 너무 가깝지는 않나요?","손목이 뒤로 꺾이지는 않나요?"],
      alternativeExerciseIds: ["EX003","EX007"],
      difficulty: 5,
      cautionTags: ["어깨"],
      videoUrl: "",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX036",
      imageUrl: "https://drive.google.com/file/d/1LtbnpMBvJUFlG8G4IelpvfOdyRXkEyID/view?usp=drive_link",
      name: "싯 업",
      bodyParts: ["복부"],
      exerciseType: "코어_몸통굴곡",
      equipmentType: "머신",
      purposeTags: ["복부근력","코어","몸통조절"],
      benefits: "복부 근력을 강화하고 상체를 일으키고 내리는 움직임을 조절하는 데 도움을 줍니다.",
      instructions: "싯 업 벤치에 누워 무릎을 굽히고 발을 지지대에 안정적으로 고정합니다. 팔을 가슴 앞에 교차하고 복부에 힘을 주어 상체를 천천히 일으킨 뒤 반동 없이 내려옵니다.",
      keyPoints: "손으로 머리나 목을 당기지 않습니다. 허리가 불편하면 중단하고, 벤치 경사와 움직임 범위를 조절합니다.",
      breathing: "상체를 일으킬 때 내쉬고, 내려갈 때 들이마십니다.",
      managementNotes: "몸통 굴곡 중심 운동으로 허리 부담에 유의. 초보에게는 EX023 크런치로 난이도를 낮추는 방안을 고려.",
      checklist: ["목을 과하게 당기지는 않나요?","반동으로 몸을 일으키지 않나요?","내려갈 때 몸을 떨어뜨리지 않고 속도를 조절하나요?"],
      alternativeExerciseIds: ["EX023"],
      difficulty: 3,
      cautionTags: ["허리"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex036-sit-up.gif?v=97",
      enabled: true
    },
    {
      exerciseId: "EX037",
      imageUrl: "https://drive.google.com/file/d/1P8uIEiORz9GSHJJanrUsmMGt4nAPoocA/view?usp=drive_link",
      name: "스미스머신 숄더 프레스",
      bodyParts: ["어깨","삼두"],
      exerciseType: "상체_수직밀기",
      equipmentType: "플레이트로드머신",
      purposeTags: ["어깨근력","상체근력","삼두"],
      benefits: "어깨와 삼두의 근력을 강화하고 고정된 바 경로에서 위로 밀어 올리는 힘을 기르는 데 도움을 줍니다.",
      instructions: "스미스머신 안에 등받이 벤치를 놓고 바가 얼굴 앞을 지나도록 위치를 맞춥니다. 양발을 바닥에 고정하고 바를 엄지까지 감싸 잡은 뒤 안전걸이를 해제하여, 편안한 범위로 천천히 내리고 위로 밀어 올립니다.",
      keyPoints: "목을 과하게 움직이거나 허리를 과하게 젖히지 않습니다.",
      breathing: "바를 밀어 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "스미스머신 어깨 수직밀기는 고정된 바 경로와 높은 난이도를 고려. 초보는 EX017, 덤벨 운동 가능자는 EX033을 대체로 검토.",
      checklist: ["손목과 팔꿈치를 직각으로 잘 맞추셨나요?","허리가 과하게 꺾이지는 않나요?"],
      alternativeExerciseIds: ["EX017","EX033"],
      difficulty: 4,
      cautionTags: ["목"],
      videoUrl: "",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX038",
      imageUrl: "https://drive.google.com/file/d/1V1ZkrSmqMksI_RrurSPmb-JoTj8HINfN/view?usp=drive_link",
      name: "덤벨 래터럴 레이즈",
      bodyParts: ["어깨"],
      exerciseType: "상체_어깨외전",
      equipmentType: "덤벨",
      purposeTags: ["어깨근력","측면어깨","상체근력"],
      benefits: "어깨 옆쪽 근육을 강화하고 팔을 옆으로 들어 올리는 힘을 기르는 데 도움을 줍니다.",
      instructions: "양손에 덤벨을 들고 몸통을 안정적으로 세웁니다. 팔꿈치를 살짝 굽힌 채 팔을 몸통보다 약간 앞쪽의 옆 방향으로 어깨 높이 정도까지 올리고 천천히 내립니다.",
      keyPoints: "가벼운 중량으로 시작해 몸을 흔들지 않습니다. 어깨를 과하게 으쓱하거나 엄지를 억지로 아래로 돌리지 않고 통증 없는 범위에서 움직입니다.",
      breathing: "팔을 들어 올릴 때 내쉬고, 내릴 때 들이마십니다.",
      managementNotes: "측면 어깨 외전 고립운동. DB에 동일 패턴 대체가 없어 대체운동ID 공란 유지; 숄더 프레스는 자극과 동작이 다름.",
      checklist: ["몸을 흔드는 반동으로 덤벨을 올리지 않나요?","어깨를 귀 쪽으로 과하게 끌어올리지 않나요?","팔꿈치 각도를 유지하며 천천히 내리나요?"],
      alternativeExerciseIds: [],
      difficulty: 3,
      cautionTags: ["목"],
      videoUrl: "",
      defaultGifUrl: "./images/exercises/ex038-dumbbell-lateral-raise.gif?v=96",
      enabled: true
    },
    {
      exerciseId: "EX039",
      imageUrl: "https://drive.google.com/file/d/1P8uIEiORz9GSHJJanrUsmMGt4nAPoocA/view?usp=drive_link",
      name: "스미스머신 스쿼트",
      bodyParts: ["허벅지 앞","엉덩이"],
      exerciseType: "하체_무릎지배",
      equipmentType: "플레이트로드머신",
      purposeTags: ["하체근력","둔근","기초체력"],
      benefits: "허벅지와 엉덩이 근력을 강화하고 고정된 바 경로에서 앉고 일어서는 힘을 기르는 데 도움을 줍니다.",
      instructions: "바를 목뼈가 아닌 등 위쪽 근육에 올리고 양손으로 잡습니다. 발 위치를 바 경로에 맞춰 조절한 뒤 복부에 힘을 주고 무릎과 고관절을 함께 굽혀 내려갔다가 발바닥 전체로 바닥을 밀며 일어섭니다.",
      keyPoints: "무릎은 발끝 방향으로 움직이며 허리가 과하게 말리지 않는 깊이까지만 내려갑니다.",
      breathing: "내려갈 때 들이마시고, 일어설 때 내쉽니다. 복부에 힘을 유지하되 숨을 오래 참지 않습니다.",
      managementNotes: "스미스 스쿼트도 자세 숙련도를 확인해야 함. 기초 단계는 EX001·EX016으로 낮추고 숙련자는 EX013 스쿼트 대체를 검토.",
      checklist: ["바가 목뼈를 직접 누르고 있지는 않나요?","발뒤꿈치가 들리거나 무릎이 안쪽으로 무너지지 않나요?"],
      alternativeExerciseIds: ["EX001","EX016","EX013"],
      difficulty: 4,
      cautionTags: ["무릎","허리","고관절"],
      videoUrl: "",
      defaultGifUrl: "",
      enabled: true
    }
  ];

  // 화면 코드가 원본 운동 정보를 실수로 바꾸지 않도록 보호합니다.
  records.forEach(function (exercise) {
    Object.freeze(exercise.bodyParts);
    Object.freeze(exercise.purposeTags);
    Object.freeze(exercise.alternativeExerciseIds);
    Object.freeze(exercise.cautionTags);
    Object.freeze(exercise.checklist);
    Object.freeze(exercise);
  });
  Object.freeze(records);

  const exercisesById = new Map(
    records.map(function (exercise) {
      return [exercise.exerciseId, exercise];
    })
  );

  // 운동명 대신 운동ID로 조회합니다. 없는 운동은 null을 반환합니다.
  function getExerciseById(exerciseId) {
    if (typeof exerciseId !== "string") {
      return null;
    }

    return exercisesById.get(exerciseId.trim()) || null;
  }

  // 새 루틴에 사용할 후보 목록: 사용여부가 Y인 운동만 반환합니다.
  function getActiveExercises() {
    return records.filter(function (exercise) {
      return exercise.enabled;
    });
  }

  // 시트에 지정된 대체 운동을 조회할 뿐, 회원의 운동을 자동 교체하지 않습니다.
  function getAlternativeExercises(exerciseId) {
    const exercise = getExerciseById(exerciseId);

    if (!exercise) {
      return [];
    }

    return exercise.alternativeExerciseIds
      .map(getExerciseById)
      .filter(function (alternative) {
        return alternative !== null && alternative.enabled;
      });
  }

  // 저장 위치에 따른 이미지 주소 처리는 화면 코드와 분리합니다.
  function getExerciseImageUrl(exerciseId) {
    const exercise = getExerciseById(exerciseId);
    if (!exercise || !exercise.imageUrl) return "";

    try {
      const source = new URL(exercise.imageUrl);
      if (!['https:', 'http:'].includes(source.protocol)) return "";
      if (source.username || source.password) return "";
      const hostname = source.hostname.toLowerCase();
      if (hostname !== "drive.google.com" && hostname !== "www.drive.google.com") {
        return source.href;
      }

      const match = source.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
      const fileId = match ? match[1] : source.searchParams.get("id");
      if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) return "";

      const imageUrl = new URL("https://drive.google.com/thumbnail");
      imageUrl.searchParams.set("id", fileId);
      imageUrl.searchParams.set("sz", "w400");
      const resourceKey = source.searchParams.get("resourcekey");
      if (resourceKey) imageUrl.searchParams.set("resourcekey", resourceKey);
      return imageUrl.href;
    } catch (error) {
      return "";
    }
  }

  // 기존 script.js 변수들과 섞이지 않게 하나의 이름으로 제공합니다.
  window.ExerciseDB = Object.freeze({
    getExerciseById,
    getActiveExercises,
    getAlternativeExercises,
    getExerciseImageUrl
  });
})();
