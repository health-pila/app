// 운동 구성 컴포넌트 DB — 시제품용 로컬 데이터
// 출처: 2026-09-27 Google Sheets 원본 '운동 구성 컴포넌트 DB'의 운동DB_MASTER.
// Google Sheets와 자동 동기화되지 않습니다.
// 운동ID, 설명, 난이도, 이미지/영상 주소는 첨부 데이터 기준입니다.
// 횟수, 세트, 휴식시간, 운동 순서는 회원별 루틴에서 따로 관리합니다.
// 이미지 주소는 원본 공유 링크를 보관하고, 표시할 때만 변환합니다.

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
      alternativeExerciseIds: ["EX016","EX013"],
      difficulty: 2,
      cautionTags: ["무릎","허리"],
      videoUrl: "https://youtu.be/3ns7m3VZROo",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX002",
      imageUrl: "https://drive.google.com/file/d/1OakGbp-gl50dDblZA1eknWUHdjKMxytx/view?usp=drive_link",
      name: "랫 풀 다운",
      bodyParts: ["등","팔"],
      exerciseType: "상체_수직당기기",
      equipmentType: "케이블머신",
      purposeTags: ["등근력","상체근력"],
      benefits: "등 근육을 강화하고 상체의 당기는 힘을 기르는 데 도움을 줍니다.",
      instructions: "가슴을 가볍게 열고 바를 쇄골 방향으로 당깁니다. 몸을 뒤로 크게 젖히거나 반동을 사용하지 않습니다.",
      alternativeExerciseIds: ["EX008","EX011"],
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
      alternativeExerciseIds: ["EX012","EX014"],
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
      alternativeExerciseIds: ["EX001"],
      difficulty: 1,
      cautionTags: ["무릎"],
      videoUrl: "https://youtu.be/Vq-x28-Xlwk",
      defaultGifUrl: "",
      enabled: true
    },
    {
      exerciseId: "EX006",
      imageUrl: "https://drive.google.com/file/d/1ytOcbjaDf3Lv508fYwxu-MSdlgMRVXyL/view?usp=drive_link",
      name: "시티드 로우",
      bodyParts: ["등","팔"],
      exerciseType: "상체_수평당기기",
      equipmentType: "머신",
      purposeTags: ["등근력","상체근력","자세유지"],
      benefits: "등과 팔의 당기는 힘을 기르고 상체를 안정적으로 유지하는 데 도움을 줍니다.",
      instructions: "가슴을 가볍게 열고 허리를 세운 상태에서 손잡이를 몸통 쪽으로 당깁니다. 어깨가 올라가거나 몸을 뒤로 젖히는 반동을 피합니다.",
      alternativeExerciseIds: ["EX002"],
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
      alternativeExerciseIds: ["EX003","EX007"],
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
      alternativeExerciseIds: ["EX006"],
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
      alternativeExerciseIds: ["EX020","EX004"],
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
      alternativeExerciseIds: ["EX001","EX016"],
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
      alternativeExerciseIds: ["EX012","EX020"],
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
      alternativeExerciseIds: ["EX001","EX016"],
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
      alternativeExerciseIds: ["EX001","EX005"],
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
      alternativeExerciseIds: ["EX003","EX007"],
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
      alternativeExerciseIds: ["EX006","EX011"],
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
      equipmentType: "프리웨이트",
      purposeTags: ["둔근","하체근력","고관절신전"],
      benefits: "엉덩이 근력을 강화하고 고관절을 펴는 힘을 기르는 데 도움을 줍니다.",
      instructions: "등 윗부분을 지지대에 안정적으로 두고 발을 바닥에 고정합니다. 엉덩이를 들어 올릴 때 허리를 과하게 젖히지 말고 엉덩이에 힘을 준 뒤 천천히 내려옵니다.",
      alternativeExerciseIds: ["EX012","EX014"],
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
      alternativeExerciseIds: ["EX022"],
      difficulty: 1,
      cautionTags: ["허리","목"],
      videoUrl: "",
      defaultGifUrl: "",
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
      alternativeExerciseIds: ["EX020"],
      difficulty: 1,
      cautionTags: ["허리","무릎"],
      videoUrl: "",
      defaultGifUrl: "",
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
      alternativeExerciseIds: [],
      difficulty: 1,
      cautionTags: ["손목"],
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
