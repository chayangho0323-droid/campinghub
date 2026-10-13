// apply-overrides.js — 방문자·운영 주체가 알려준 정정 사항(camping-overrides.json)을 캠핑장 데이터 위에 덮어쓴다.
// 고캠핑 데이터는 매일 다시 받아오므로 campings.json을 직접 고치면 하루 만에 되돌아간다 →
// fetch-campings.js(campings.json 저장 직전)와 build-pages.js(데이터 로드 직후)에서 매번 호출한다. (축제허브 apply-overrides.js와 같은 구조)
//
// camping-overrides.json 형식:
//   [{ "contentId": "2460", "note": "2026-10-13 방문자 제보 — 예약 사이트 주소 변경", "set": { "reserveUrl": "https://...", "homepage": "https://..." } }]
//   contentId 대신 "key"(캠핑장 이름에 포함되는 문자열, 공백 무시)로도 맞출 수 있다.
//
// 단독 실행(node apply-overrides.js)하면 campings.json을 제자리에서 고친다 (제보 온 날 바로 반영용).

const fs = require("fs");

const normName = (n) => String(n || "").replace(/\s|[()\[\]<>〈〉·:,\-]/g, "").toLowerCase();

function loadOverrides(file = "camping-overrides.json") {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return []; }
}

// list의 항목을 제자리에서 수정하고 적용 건수를 돌려준다
function applyOverrides(list, overrides = loadOverrides()) {
  let n = 0;
  for (const c of list) {
    const name = normName(c.name);
    for (const o of overrides) {
      const hit = (o.contentId && String(o.contentId) === String(c.contentId)) || (o.key && name.includes(normName(o.key)));
      if (!hit) continue;
      Object.assign(c, o.set || {});
      c.corrected = o.note || "제보로 정정 반영";
      n++;
    }
  }
  return n;
}

module.exports = { applyOverrides, loadOverrides };

if (require.main === module) {
  const list = JSON.parse(fs.readFileSync("campings.json", "utf-8"));
  const n = applyOverrides(list);
  fs.writeFileSync("campings.json", JSON.stringify(list, null, 2), "utf-8");
  console.log(`✏️ campings.json 정정 덧쓰기 ${n}건 적용`);
}
