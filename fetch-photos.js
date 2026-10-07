// fetch-photos.js — 사진 없는 캠핑장(약 760곳)에 사진을 붙인다. (축제허브 fetch-photos.js를 캠핑에 맞게 옮김)
//
// 세 단계:
//  1단계 "캠핑장 사진": 한국관광공사 포토코리아(PhotoGalleryService1)에서 캠핑장 이름으로 검색 → 사진 제목·키워드에
//        캠핑장 이름이 들어 있고 같은 시군구면 채택 → image + photoSource("한국관광공사 포토코리아 · 촬영 OOO")
//  2단계 "주변 풍경(포토코리아)": 이름 속 장소 토큰(두타산·곡교천·궁평…)으로 검색, 같은 시군구 사진 → venuePhoto
//  3단계 "주변 풍경(관광공사 주변 관광지)": API 없이, 이미 받아 둔 nearbySpots 중 1km 안 사진 → venuePhoto
//  venuePhoto는 image 칸과 따로 둬서 페이지에 "📍 주변 풍경"이라고 표시하고, 진짜 캠핑장 사진이 들어오면 자동으로 밀려난다.
//
// 실행 순서: fetch-campings.js → fetch-photos.js → fetch-weather.js → build-pages.js
// 하루 한도 1,000회를 축제허브와 나눠 쓴다 (축제 600 + 캠핑 350). 결과는 photo-cache.json에 기억해 재검색하지 않는다.

require("dotenv").config();
const fs = require("fs");

const KEY = process.env.TOUR_API_KEY;
const DRY = process.env.DRY_RUN === "1";
const DAILY_BUDGET = Number(process.env.PHOTO_BUDGET || 350);
const CACHE_FILE = "photo-cache.json";
const RETRY_DAYS = 45; // 못 찾은 캠핑장 재시도 간격
const NEARBY_MAX_M = 1000; // 3단계: 주변 관광지 사진 허용 거리

const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
const todayYmd = kst.toISOString().slice(0, 10).replace(/-/g, "");
const daysAgo = (n) => new Date(kst.getTime() - n * 86400000).toISOString().slice(0, 10).replace(/-/g, "");

let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 관광공사 API는 초당 요청 제한이 있다 (코드 23 "초당 서비스 요청제한 횟수 초과" — 2026-10-07 연속 호출로 540회가 전부 빈 결과로 캐시됨)
// → 호출 사이 0.7초 간격, 제한 에러면 3초 쉬고 최대 3번 재시도
const REQ_GAP_MS = 700;
async function searchPhotos(keyword, attempt = 1) {
  if (calls >= DAILY_BUDGET) return null; // null = 예산 소진
  if (attempt === 1) calls++;
  await sleep(attempt === 1 ? REQ_GAP_MS : 3000);
  const params = new URLSearchParams({ serviceKey: KEY, numOfRows: "30", pageNo: "1", MobileOS: "ETC", MobileApp: "CampingHub", _type: "json", arrange: "A", keyword });
  try {
    const res = await fetch(`https://apis.data.go.kr/B551011/PhotoGalleryService1/gallerySearchList1?${params}`, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    if (!text.trim().startsWith("{")) throw new Error("JSON 아님: " + text.slice(0, 80));
    const data = JSON.parse(text);
    const code = data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
    if (code === "23" && attempt < 3) return searchPhotos(keyword, attempt + 1);
    if (code === "22") throw new Error("일일 한도 초과 — 오늘은 중단");
    if (data?.response?.header?.resultCode !== "0000") throw new Error(data?.response?.header?.resultMsg || data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg || "API 에러");
    let items = data.response.body?.items?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    return items.map((i) => ({
      url: i.galWebImageUrl || "",
      title: String(i.galTitle || "").trim(),
      keyword: String(i.galSearchKeyword || ""),
      location: String(i.galPhotographyLocation || ""),
      month: String(i.galPhotographyMonth || ""),
      photographer: String(i.galPhotographer || "").trim(),
    })).filter((i) => /^https?:\/\//.test(i.url));
  } catch (err) {
    console.log(`   ⚠️ 검색 실패 "${keyword}": ${err.message}`);
    // 한도·제한 에러는 "결과 없음"이 아니라 "오늘은 못 찾음" → null로 돌려 캐시에 남기지 않고 루프를 멈춘다
    if (/한도|제한|EXCEEDS/i.test(err.message)) { calls = DAILY_BUDGET; return null; }
    return [];
  }
}

// ── 이름 정규화: "국립 산음자연휴양림 야영장" → "산음자연휴양림" (캠핑장·야영장 같은 꼬리말과 국립/민간 머리말 제거)
const SUFFIX = /오토캠핑장|자동차야영장|숲속야영장|글램핑장|카라반파크|캠핑파크|캠핑빌리지|캠핑장|야영장|캠핑|글램핑|카라반|펜션|리조트|관광농원|휴양마을|체험마을|힐링캠프|캠프|파크|농원/g;
const PREFIX = /^(국립|도립|군립|시립|국립자연휴양림관리소|국립공원)/;
const norm = (s) => String(s || "").replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s|[()\[\]<>〈〉·:,\-–~!'"&]/g, "").toLowerCase();
const normCamp = (s) => norm(String(s || "").replace(PREFIX, "")).replace(SUFFIX, "");
const GENERIC = new Set(["숲속", "힐링", "가족", "자연", "농촌체험", "체험", "휴양", "오토", "레저", "테마", "파크", "빌리지", "하우스", "그린", "에코", "포레스트", "스테이", "마을", "유원지", "관광지", "해변", "계곡"]);

const SIDO = { 서울: ["서울"], 부산: ["부산"], 대구: ["대구"], 인천: ["인천"], 광주: ["광주"], 대전: ["대전"], 울산: ["울산"], 세종: ["세종"], 경기: ["경기"], 강원: ["강원"], 충청북: ["충북", "충청북도"], 충북: ["충북", "충청북도"], 충청남: ["충남", "충청남도"], 충남: ["충남", "충청남도"], 전북: ["전북", "전라북도"], 전라북: ["전북", "전라북도"], 전남: ["전남", "전라남도"], 전라남: ["전남", "전라남도"], 경상북: ["경북", "경상북도"], 경북: ["경북", "경상북도"], 경상남: ["경남", "경상남도"], 경남: ["경남", "경상남도"], 제주: ["제주"] };
function regionOf(c) {
  const head = String(c.region || c.address || "").split(" ")[0];
  let words = [];
  for (const [k, w] of Object.entries(SIDO)) if (head.startsWith(k)) { words = w; break; }
  if (!words.length && /전남광주/.test(head)) words = ["전남", "전라남도", "광주"];
  const sigungu = String(c.sigungu || String(c.address || "").split(" ")[1] || "").replace(/[시군구]$/, "");
  return { words, sigungu: sigungu.length >= 2 ? sigungu : "" };
}
// 시군구까지 일치 (촬영지가 시도만 적힌 사진은 시도 일치로 통과)
function sameSigungu(photo, reg) {
  const hay = photo.location + " " + photo.keyword;
  if (reg.sigungu && hay.includes(reg.sigungu)) return true;
  const loc = photo.location.replace(/\s/g, "");
  const sidoOnly = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충청남|충북|충남|전북|전라북|전남|전라남|경북|경상북|경남|경상남|제주)(특별시|광역시|특별자치시|특별자치도|도|시)?$/.test(loc);
  return sidoOnly && reg.words.some((w) => loc.startsWith(w.slice(0, 2)));
}
const pickBest = (items, reg, limit) => items.filter((p) => sameSigungu(p, reg)).sort((a, b) => b.month.localeCompare(a.month)).filter((p, i, arr) => arr.findIndex((q) => q.url === p.url) === i).slice(0, limit);

async function findPhotos(c) {
  const reg = regionOf(c);
  if (!reg.sigungu) return { tier: 0, photos: [] };
  // 1단계: 캠핑장 이름 (정리한 핵심어가 3자 이상일 때만 — "다인"처럼 짧으면 엉뚱한 사진이 잡힘)
  // "국립자연휴양림관리소(중미산자연휴양림)"처럼 괄호 안이 진짜 이름인 경우가 있어 괄호 밖·안을 각각 시도
  const variants = [String(c.name).replace(/\(.*?\)/g, " "), ...(String(c.name).match(/\(([^)]+)\)/g) || []).map((s) => s.slice(1, -1))]
    .map((v) => v.replace(PREFIX, "").replace(/\s+/g, " ").trim()).filter((v) => normCamp(v).length >= 3);
  // 검색어는 "구문 포함" 방식이라 꼬리말을 뗀 핵심어로 넣어야 잡힌다 ("산음자연휴양림야영장" 0건, "산음자연휴양림" 37건)
  for (const v of [...new Set(variants)].slice(0, 2)) {
    const target = normCamp(v);
    const q = v.replace(SUFFIX, " ").replace(/\s+/g, " ").trim() || v;
    const items = await searchPhotos(q);
    if (items === null) return { tier: -1, photos: [] };
    // 제목이나 키워드 항목 하나가 이름과 같거나 이름으로 시작/끝나야 한다 ("술박물관" ⊂ "세계무술박물관" 같은 부분 일치 방지)
    const hits = items.filter((p) => [p.title, ...p.keyword.split(/[,、]/)].map(norm).some((x) => x === target || x.startsWith(target) || (x.endsWith(target) && target.length >= 5)));
    if (process.env.DEBUG) console.log(`   [1단계] ${c.name} → "${q}" target=${target} 결과 ${items.length}건 / 이름일치 ${hits.length} / 지역일치 ${pickBest(hits, reg, 9).length} | ${items.slice(0, 3).map((p) => p.title + "@" + p.location).join(" ; ")}`);
    const best = pickBest(hits, reg, 4);
    if (best.length) return { tier: 1, photos: best, query: q };
  }
  // 2단계: 이름 속 장소 토큰 (3자 이상, 일반어 제외) → 같은 시군구 사진이면 "주변 풍경"
  const tokens = [...new Set(String(c.name).replace(PREFIX, "").replace(/\(.*?\)/g, " ").split(/\s+/).map((t) => t.replace(SUFFIX, "").replace(/[^가-힣a-zA-Z0-9]/g, "")).filter((t) => t.length >= 3 && !GENERIC.has(t) && !/^\d+$/.test(t)))].slice(0, 2);
  for (const q of tokens) {
    const items = await searchPhotos(q);
    if (items === null) return { tier: -1, photos: [] };
    const nq = norm(q);
    const hits = items.filter((p) => { const t = norm(p.title); return (t.includes(nq) || (nq.includes(t) && t.length >= 3)) && sameSigungu(p, reg); });
    const best = pickBest(hits, reg, 1);
    if (best.length) return { tier: 2, photos: best, query: q };
  }
  return { tier: 0, photos: [] };
}

const credit = (p) => `한국관광공사 포토코리아${p.photographer ? ` · 촬영 ${p.photographer}` : ""}`;
function apply(c, rec) {
  if (rec && rec.tier === 1 && rec.photos.length) {
    if (!c.image) { c.image = rec.photos[0].url; c.photoSource = credit(rec.photos[0]); }
    return "fest";
  }
  if (c.image) return "";
  if (rec && rec.tier === 2 && rec.photos.length) {
    const p = rec.photos[0];
    c.venuePhoto = { image: p.url, name: p.title, dist: null, credit: credit(p) };
    return "venue";
  }
  // 3단계: 주변 관광지 사진 (API 불필요)
  const s = (c.nearbySpots || []).filter((x) => x.image && x.dist <= NEARBY_MAX_M).sort((a, b) => a.dist - b.dist)[0];
  if (s) { c.venuePhoto = { image: s.image, name: s.name, dist: s.dist }; return "nearby"; }
  return "";
}

// 사진 URL이 살아 있는지 — 관광공사 서버는 HEAD에 405를 주므로 GET으로 열고 본문은 바로 끊는다 (2026-10-07 HEAD로 25건 멀쩡한 사진을 버렸던 버그)
async function imageAlive(url) {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10000), redirect: "follow" });
    const ok = res.ok && /image/i.test(res.headers.get("content-type") || "");
    try { await res.body?.cancel(); } catch {}
    return ok;
  } catch { return false; }
}

async function main() {
  const camps = JSON.parse(fs.readFileSync("campings.json", "utf-8"));
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")); } catch {}
  for (const c of camps) delete c.venuePhoto; // 매일 다시 계산 (진짜 사진이 들어오면 자연히 빠짐)

  // 대상: 사진 없는 캠핑장. 휴양림·국공립처럼 포토코리아에 있을 법한 곳부터
  const pri = (c) => (/휴양림|국립공원/.test(c.name + (c.operator || "")) ? 0 : /국립|공립|지자체|국민여가/.test(c.operator || "") ? 1 : 2);
  const targets = camps.filter((c) => !c.image).sort((a, b) => pri(a) - pri(b));
  console.log(`📷 캠핑장 사진 채우기: 사진 없음 ${targets.length}곳 (캐시 ${Object.keys(cache).length}건, 예산 ${KEY ? DAILY_BUDGET : 0}회)`);

  const stats = { fest: 0, venue: 0, nearby: 0, none: 0, budget: 0 };
  for (const c of targets) {
    const id = String(c.contentId);
    let rec = cache[id];
    const stale = !rec || (rec.tier === 0 && rec.checked < daysAgo(RETRY_DAYS));
    if (KEY && stale) {
      const r = await findPhotos(c);
      if (r.tier === -1) { stats.budget++; }
      else {
        if (r.photos[0] && !(await imageAlive(r.photos[0].url))) r.photos = [];
        rec = { tier: r.photos.length ? r.tier : 0, query: r.query || "", photos: r.photos, checked: todayYmd };
        cache[id] = rec;
        if (rec.tier) console.log(`${rec.tier === 1 ? "🏕️" : "📍"} ${c.name} (${c.region} ${c.sigungu}) ← "${rec.query}" → ${rec.photos[0].title} [${rec.photos[0].location}/${rec.photos[0].month}]`);
      }
    }
    const how = apply(c, rec);
    if (how) stats[how]++; else stats.none++;
  }
  const ids = new Set(camps.map((c) => String(c.contentId)));
  for (const id of Object.keys(cache)) if (!ids.has(id) && (cache[id].checked || "0") < daysAgo(90)) delete cache[id];

  if (!DRY) {
    fs.writeFileSync("campings.json", JSON.stringify(camps, null, 2), "utf-8");
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  }
  console.log(`✅ 사진: 캠핑장 사진 ${stats.fest} · 주변 풍경(포토코리아) ${stats.venue} · 주변 관광지 ${stats.nearby} · 없음 ${stats.none} (API ${calls}회${stats.budget ? `, 예산 소진 미처리 ${stats.budget}` : ""})`);
}

main().catch((err) => {
  console.error("❌ 사진 채우기 실패 (기존 데이터는 그대로):", err.message);
  process.exit(0);
});
