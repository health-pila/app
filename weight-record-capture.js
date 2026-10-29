// 중량 입력값을 외부 이미지 없이 PNG로 만들고 기존 운동 기록에 추가합니다.
(() => {
  "use strict";
  const fields = [
    { key: "weight", label: "중량(kg)", limit: 8 },
    { key: "reps", label: "횟수", limit: 5 },
    { key: "comment", label: "코멘트", limit: 120 }
  ];
  const fontFamily = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  function normalize(snapshot) {
    if (!snapshot || typeof snapshot.userId !== "string" || !snapshot.userId ||
        !(typeof snapshot.exerciseId === "string" && (/^EX\d+$/.test(snapshot.exerciseId) || /^MY:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(snapshot.exerciseId))) || typeof snapshot.exerciseName !== "string" ||
        !snapshot.exerciseName.trim() || !Array.isArray(snapshot.sets) || snapshot.sets.length !== 5) {
      throw new Error("캡처할 운동 기록을 확인할 수 없어요.");
    }
    const sets = snapshot.sets.map(set => {
      const clean = {};
      fields.forEach(field => {
        if (typeof set?.[field.key] !== "string" || set[field.key].length > field.limit) {
          throw new Error("입력한 기록을 확인한 뒤 다시 눌러주세요.");
        }
        clean[field.key] = set[field.key].trim();
      });
      clean.completed = set.completed === true;
      return clean;
    });
    if (!sets.some(set => set.completed || fields.some(field => set[field.key]))) {
      throw new Error("세트 완료를 체크하거나 중량, 횟수 또는 코멘트를 먼저 입력해주세요.");
    }
    const takenAt = new Date(snapshot.takenAt);
    if (!Number.isFinite(takenAt.getTime())) throw new Error("저장 날짜를 확인할 수 없어요.");
    return { userId: snapshot.userId, exerciseId: snapshot.exerciseId,
      exerciseName: snapshot.exerciseName.trim(), sets, takenAt };
  }

  function wrapText(context, value, width) {
    const lines = [];
    String(value || "—").split(/\r?\n/).forEach(paragraph => {
      let line = "";
      for (const character of Array.from(paragraph)) {
        if (line && context.measureText(line + character).width > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
      lines.push(line);
    });
    return lines;
  }

  async function createImage(snapshot) {
    const record = normalize(snapshot);
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("기록 이미지를 만들 수 없어요. 브라우저를 확인해주세요.");
    const width = 600, padding = 24, labelWidth = 82;
    const tableWidth = width - padding * 2;
    const cellWidth = (tableWidth - labelWidth) / 5;
    context.font = `700 26px ${fontFamily}`;
    const nameLines = wrapText(context, record.exerciseName, tableWidth);
    const tableTop = 68 + nameLines.length * 36;
    const rows = fields.map(field => {
      const size = field.key === "comment" ? 16 : 18;
      context.font = `400 ${size}px ${fontFamily}`;
      const cells = record.sets.map(set => wrapText(context, set[field.key], cellWidth - 16));
      return { ...field, size, cells, height: Math.max(60, 24 + Math.max(...cells.map(lines => lines.length)) * 24) };
    });
    const height = tableTop + 46 + rows.reduce((sum, row) => sum + row.height, 0) + padding;
    // 2배 해상도로 저장해 사진 크기가 바뀌어도 글자가 선명하게 보이도록 합니다.
    canvas.width = width * 2;
    canvas.height = height * 2;
    context.scale(2, 2);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#ee6600";
    context.fillRect(0, 0, width, 6);
    context.textBaseline = "top";
    context.fillStyle = "#a94200";
    context.font = `700 16px ${fontFamily}`;
    context.fillText("세트별 운동 기록", padding, 24);
    context.fillStyle = "#18243b";
    context.font = `700 26px ${fontFamily}`;
    nameLines.forEach((line, index) => context.fillText(line, padding, 54 + index * 36));

    function cell(x, y, cellW, cellH, background) {
      context.fillStyle = background;
      context.fillRect(x, y, cellW, cellH);
      context.strokeStyle = "#dce2eb";
      context.lineWidth = 1;
      context.strokeRect(x, y, cellW, cellH);
    }
    function centered(text, x, y, cellW, cellH, size, bold) {
      context.fillStyle = "#18243b";
      context.font = `${bold ? 700 : 400} ${size}px ${fontFamily}`;
      context.textAlign = "center";
      context.fillText(text, x + cellW / 2, y + (cellH - size) / 2);
    }
    for (let index = 0; index < 6; index++) {
      const x = padding + (index ? labelWidth + (index - 1) * cellWidth : 0);
      const cellW = index ? cellWidth : labelWidth;
      cell(x, tableTop, cellW, 46, "#fff3e8");
      const done = index > 0 && record.sets[index - 1].completed;
      if (index) {
        centered(index + "세트", x - 11, tableTop, cellW, 46, 17, true);
        // 글꼴의 체크 문자 지원과 관계없이 완료 여부를 벡터로 그립니다.
        const checkX = x + cellW - 24, checkY = tableTop + 15;
        context.fillStyle = done ? "#2baa57" : "#fff";
        context.fillRect(checkX, checkY, 16, 16);
        context.strokeStyle = "#2baa57"; context.lineWidth = 1.5;
        context.strokeRect(checkX, checkY, 16, 16);
        if (done) {
          context.beginPath(); context.moveTo(checkX + 3, checkY + 8);
          context.lineTo(checkX + 7, checkY + 12); context.lineTo(checkX + 13, checkY + 4);
          context.strokeStyle = "#fff"; context.lineWidth = 2; context.stroke();
        }
      } else centered("항목", x, tableTop, cellW, 46, 17, true);
    }
    let y = tableTop + 46;
    rows.forEach(row => {
      cell(padding, y, labelWidth, row.height, "#fff3e8");
      centered(row.label, padding, y, labelWidth, row.height, 16, true);
      row.cells.forEach((lines, index) => {
        const x = padding + labelWidth + index * cellWidth;
        cell(x, y, cellWidth, row.height, "#ffffff");
        context.fillStyle = "#18243b";
        context.font = `400 ${row.size}px ${fontFamily}`;
        context.textAlign = row.key === "comment" ? "left" : "center";
        const textX = row.key === "comment" ? x + 8 : x + cellWidth / 2;
        const textY = y + (row.key === "comment" ? 12 : (row.height - lines.length * 24) / 2);
        lines.forEach((line, lineIndex) => context.fillText(line, textX, textY + lineIndex * 24));
      });
      y += row.height;
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("기록 이미지를 만들지 못했어요.")), "image/png");
    });
  }

  // 같은 입력의 동시 요청은 하나로 합치고, 응답이 끊긴 저장은 먼저 결과를 확인합니다.
  function createSaver({ client, isCurrent, onSaved }) {
    const attempts = new Map();
    const unknownMessage = "저장 여부를 확인하지 못했어요. 운동 기록 탭을 확인해주세요. 같은 내용으로 다시 누르면 저장 결과부터 확인해요.";
    async function verifyUser(record) {
      const { data, error } = await client.auth.getUser();
      if (error || data?.user?.id !== record.userId || !isCurrent(record.userId)) {
        throw new Error("로그인 상태가 변경됐어요. 현재 계정의 루틴에서 다시 시도해주세요.");
      }
    }
    async function findRecord(attempt) {
      const { data, error } = await client.from("workout_records").select("id")
        .eq("user_id", attempt.record.userId).eq("photo_path", attempt.path).maybeSingle();
      if (error) throw new Error(unknownMessage);
      return data;
    }
    async function finish(attempt) {
      // 저장 완료 후 목록 갱신 실패를 저장 실패로 안내하지 않습니다.
      try {
        if (isCurrent(attempt.record.userId)) await onSaved(attempt.record);
      } catch (error) { console.error("캡처 기록 목록 갱신 실패:", error); }
      return "운동 기록 탭에 오늘 날짜의 사진으로 저장했어요.";
    }
    async function run(attempt, key) {
      const record = attempt.record;
      await verifyUser(record);
      if (attempt.uncertain) {
        if (await findRecord(attempt)) {
          attempts.delete(key);
          return finish(attempt);
        }
        // 앞선 요청의 커밋 여부가 불분명할 때 새 행이나 사진을 만들지 않습니다.
        throw new Error(unknownMessage);
      }
      const blob = await createImage(record);
      await verifyUser(record);
      const { error: uploadError } = await client.storage.from("workout-photos")
        .upload(attempt.path, blob, { contentType: "image/png", cacheControl: "31536000", upsert: false });
      if (uploadError) {
        attempts.delete(key);
        throw new Error("사진을 저장하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.");
      }
      let insertStarted = false;
      try {
        await verifyUser(record);
        insertStarted = true;
        const { error } = await client.from("workout_records").insert({
          user_id: record.userId, photo_path: attempt.path,
          caption: record.exerciseName + " · 세트별 기록", taken_at: record.takenAt.toISOString()
        });
        if (error) throw error;
      } catch (error) {
        if (insertStarted) {
          attempt.uncertain = true;
          if (isCurrent(record.userId) && await findRecord(attempt)) {
            attempts.delete(key);
            return finish(attempt);
          }
          // DB가 명확히 거절한 경우만 사진 정리. 통신 오류면 사진을 보존합니다.
          if (!error.code || !/^(\d{5}|PGRST\d+)$/.test(error.code)) throw new Error(unknownMessage);
        }
        try {
          const { error: cleanupError } = await client.storage.from("workout-photos").remove([attempt.path]);
          if (cleanupError) console.error("캡처 저장 실패 사진 정리:", cleanupError);
        } catch (cleanupError) { console.error("캡처 저장 실패 사진 정리:", cleanupError); }
        attempts.delete(key);
        throw new Error(insertStarted ? "운동 기록에 저장하지 못했어요. 잠시 후 다시 시도해주세요." : error.message);
      }
      attempts.delete(key);
      return finish(attempt);
    }
    return function save(snapshot) {
      let record;
      try { record = normalize(snapshot); } catch (error) { return Promise.reject(error); }
      const date = record.takenAt;
      const key = JSON.stringify([record.userId, record.exerciseId, date.getFullYear(), date.getMonth(), date.getDate(), record.sets]);
      let attempt = attempts.get(key);
      if (!attempt) {
        const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
        // 운동 식별자는 수정 가능한 메모와 분리해 사진 경로에 보존합니다. 기존 경로는 바꾸지 않습니다.
        const path = window.WorkoutExerciseHistory.createPhotoPath(record.userId, record.exerciseId, id);
        attempt = { record, path, uncertain: false, promise: null };
        attempts.set(key, attempt);
      }
      if (!attempt.promise) {
        attempt.promise = run(attempt, key).finally(() => { attempt.promise = null; });
      }
      return attempt.promise;
    };
  }
  window.WeightRecordCapture = Object.freeze({ createImage, createSaver });
})();
