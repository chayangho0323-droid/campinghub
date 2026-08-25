// build-pages.js — campings.json을 읽어 캠핑장별 상세 페이지와
// 테마/지역 목록 페이지를 생성한다. (FestivalHub build-pages.js 구조 재활용)
// 실행: node build-pages.js

const fs = require("fs");
const path = require("path");

// 배포 주소 (campinghub.kr 도메인 — 2026-08 구입)
const SITE_URL = "https://campinghub.kr";

// 캠핑장 제보 구글 폼 (사이트에 없는 캠핑장을 방문자가 알려주는 창구)
// 폼을 바꾸면 이 주소만 교체하면 됨
const REPORT_FORM_URL = "https://forms.gle/xpe2ywAmuXH7tzG78";

// 구글 애널리틱스(GA4) 방문자 통계 코드 — 모든 생성 페이지의 <head>에 들어간다
const GA_SNIPPET = `
  <!-- Google Analytics (방문자 통계) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-8273JMD6NN"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-8273JMD6NN');
  </script>`;

// 쿠팡 파트너스 — 캠핑용품이라 이 사이트와 궁합이 더 좋다 (FestivalHub과 같은 링크)
const COUPANG_ITEMS = [
  { name: "🪑 캠핑의자", url: "https://link.coupang.com/a/f7LuGkEJMq" },
  { name: "🧺 돗자리", url: "https://link.coupang.com/a/f7MlAxqn7s" },
  { name: "🌀 휴대용 선풍기", url: "https://link.coupang.com/a/f7Mn8WrdpA" },
];

const campings = JSON.parse(fs.readFileSync("campings.json", "utf-8"));

// ── 형제 사이트(페스티벌허브) 데이터: 상세 페이지 "근처 축제" 섹션용 ──
// 라이브 사이트의 공개 JSON을 가져온다. 실패해도 빌드는 계속 (섹션만 생략)
const { execSync } = require("child_process");
let crossFestivals = [];
try {
  const kstToday = (() => {
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  })();
  crossFestivals = JSON.parse(
    execSync("curl -s -m 30 https://festivalhub.kr/festivals.json", { maxBuffer: 20 * 1024 * 1024 }).toString("utf8")
  ).filter((f) => f.lat && f.lng && f.endDate >= kstToday); // 끝난 축제는 제외
  console.log(`🎪 페스티벌허브 데이터 ${crossFestivals.length}건 로드 (근처 축제 섹션용)`);
} catch (e) {
  console.log("⚠️ 페스티벌허브 데이터를 가져오지 못해 이번 빌드는 근처 축제 섹션을 생략합니다");
}

// 두 지점 사이 거리(km) — 하버사인 공식
function distKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// ─── 지역 정규화 (app.js와 같은 표. 수정 시 양쪽 다!) ───
const REGION_PREFIXES = [
  ["전남광주", "전남·광주"],
  ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"],
  ["광주", "전남·광주"], ["대전", "대전"], ["울산", "울산"], ["세종", "세종"],
  ["경기", "경기"], ["강원", "강원"],
  ["충청북", "충북"], ["충북", "충북"], ["충청남", "충남"], ["충남", "충남"],
  ["전라북", "전북"], ["전북", "전북"], ["전라남", "전남·광주"], ["전남", "전남·광주"],
  ["경상북", "경북"], ["경북", "경북"], ["경상남", "경남"], ["경남", "경남"],
  ["제주", "제주"],
];

const REGION_SLUGS = {
  서울: "seoul", 부산: "busan", 대구: "daegu", 인천: "incheon",
  대전: "daejeon", 울산: "ulsan", 세종: "sejong",
  경기: "gyeonggi", 강원: "gangwon", 충북: "chungbuk", 충남: "chungnam",
  전북: "jeonbuk", "전남·광주": "jeonnam-gwangju",
  경북: "gyeongbuk", 경남: "gyeongnam", 제주: "jeju",
};

function getRegion(c) {
  const src = c.region || c.address || "";
  for (const [prefix, name] of REGION_PREFIXES) {
    if (src.startsWith(prefix)) return name;
  }
  return "기타";
}

function isForest(c) {
  return (
    c.name.includes("휴양림") ||
    ["국립", "공립", "지자체", "자연휴양림", "국립공원", "국민여가"].includes(c.operator)
  );
}

// 테마 정의 — 조건 함수로 분류
const CAMP_THEMES = [
  { slug: "forest", name: "휴양림·국공립 캠핑장", icon: "🌲",
    desc: "자연휴양림과 국립·공립·지자체 운영 캠핑장", test: isForest },
  { slug: "glamping", name: "글램핑", icon: "⛺",
    desc: "장비 없이 몸만 가는 글램핑", test: (c) => c.siteCounts.glamp > 0 || (c.type || "").includes("글램핑") },
  { slug: "caravan", name: "카라반", icon: "🚐",
    desc: "카라반 시설 보유", test: (c) => c.siteCounts.caravan > 0 || (c.type || "").includes("카라반") },
  { slug: "pet", name: "반려동물 동반 캠핑장", icon: "🐕",
    desc: "반려동물 동반 가능", test: (c) => (c.pet || "").startsWith("가능") },
];

// ─── 도우미 ───
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function infoRow(icon, label, value) {
  if (!value) return "";
  return `<div class="info-item"><span class="info-label">${icon} ${label}</span><div class="info-value">${value}</div></div>`;
}

function footerHtml(prefix = "") {
  return `
  <footer class="site-footer">
    <p>캠핑장 정보 출처: 한국관광공사 고캠핑 (공공데이터) · 정기 자동 갱신</p>
    <p><a href="${prefix}about.html">사이트 소개</a> · <a href="${prefix}index.html">전체 캠핑장</a> · <a href="${prefix}theme-forest.html">🌲 휴양림·국공립</a> · <a href="${prefix}theme-glamping.html">⛺ 글램핑</a></p>
    <p><a href="${prefix}guide-beginner.html">🔰 첫 캠핑 준비물</a> · <a href="${prefix}guide-gear.html">💰 예산별 장비</a> · <a href="${prefix}guide-safety.html">⚠️ 안전·매너</a></p>
    <p><a class="report-link" href="${REPORT_FORM_URL}" target="_blank" rel="noopener">📮 여기 없는 캠핑장 제보하기</a></p>
    <p><a class="cross-link" href="https://festivalhub.kr" target="_blank" rel="noopener">🎪 전국 축제 일정이 궁금하다면 — 페스티벌허브</a></p>
  </footer>`;
}

// 목록 정렬: 사진 있는 곳 먼저, 그 안에서 매일 셔플.
// 날짜+아이디 해시를 정렬 기준으로 써서 매일 새벽 재빌드 때마다 순서가 바뀜 —
// 가나다순일 때 숫자/앞글자 이름만 계속 첫 화면에 노출되던 문제 해결 (3천여 곳 공평 노출)
// (app.js의 정렬과 같은 규칙 — 수정 시 양쪽 다!)
const kstForSort = new Date(Date.now() + 9 * 60 * 60 * 1000);
const daySeed = `${kstForSort.getUTCFullYear()}${kstForSort.getUTCMonth() + 1}${kstForSort.getUTCDate()}`;
function shuffleRank(id) {
  let h = 5381;
  const s = daySeed + id;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function campingSort(a, b) {
  const aImg = a.image ? 0 : 1;
  const bImg = b.image ? 0 : 1;
  if (aImg !== bImg) return aImg - bImg;
  return shuffleRank(a.contentId) - shuffleRank(b.contentId);
}

// 목록 카드 (app.js의 카드와 같은 모양)
function listCard(c) {
  const img = c.image
    ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" />`
    : `<div class="no-image">🏕️</div>`;
  const badges = [
    isForest(c) ? `<span class="badge ongoing">🌲 국공립·휴양림</span>` : "",
    c.type ? `<span class="badge upcoming">${esc(c.type.split(",")[0])}</span>` : "",
    (c.pet || "").startsWith("가능") ? `<span class="badge long">🐕</span>` : "",
  ].join(" ");
  const fac = (c.facilities || "").split(",").filter(Boolean).slice(0, 3).join(" · ");
  return `
    <a class="card-link" href="camping/${c.contentId}.html">
      <article class="card">
        ${img}
        <div class="card-body">
          ${badges}
          <h2>${esc(c.name)}</h2>
          <p class="period">📍 ${getRegion(c)} ${esc(c.sigungu || "")}</p>
          ${fac ? `<p class="address">🔧 ${esc(fac)}</p>` : ""}
          <button class="review-link" data-query="${esc(`${c.sigungu || getRegion(c)} ${c.name}`)}"
            onclick="event.preventDefault();window.open('https://map.naver.com/p/search/'+encodeURIComponent(this.dataset.query)+'?placePath=%2Freview','_blank','noopener');">📝 네이버 후기 보기</button>
        </div>
      </article>
    </a>`;
}

// 목록 페이지들 공통 칩 내비게이션 (실행부에서 채움)
let SITE_NAV = "";

// 목록형 페이지 한 장
function buildListPage({ filename, title, heading, subtitle, description, items }) {
  const cards = items.map(listCard).join("");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE_URL}/${filename}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${SITE_URL}/${filename}" />
  <link rel="stylesheet" href="style.css" />
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>${esc(heading)}</h1>
    <p class="subtitle">${esc(subtitle)}</p>
    <p class="home-link"><a href="index.html">← 전체 캠핑장 보기</a></p>
  </header>
  ${SITE_NAV}
  <p class="result-count">${items.length}개의 캠핑장</p>
  <main class="festival-grid">${cards || `<p style="grid-column:1/-1;text-align:center;color:#888;">해당하는 캠핑장이 없습니다.</p>`}</main>
  <a class="to-top" href="#" aria-label="맨 위로">↑</a>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
</body>
</html>`;
}

// ─── 캠핑장 한 곳 → 상세 페이지 ───
function buildPage(c, all) {
  const region = getRegion(c);
  const description = (stripHtml(c.lineIntro || c.intro) ||
    `${c.name} — ${region} ${c.sigungu} 캠핑장 정보, 시설, 위치, 예약 안내`).slice(0, 150);

  const img = c.image ? `<img class="hero" src="${esc(c.image)}" alt="${esc(c.name)}" />` : "";

  const badges = [
    isForest(c) ? `<span class="badge ongoing">🌲 국공립·휴양림</span>` : "",
    ...(c.type ? c.type.split(",").map((t) => `<span class="badge upcoming">${esc(t.trim())}</span>`) : []),
    (c.pet || "").startsWith("가능") ? `<span class="badge long">🐕 반려동물 ${esc(c.pet)}</span>` : "",
  ].join(" ");

  // 사이트 구성 요약 (0이 아닌 것만)
  const sc = c.siteCounts;
  const siteParts = [
    sc.general ? `일반 ${sc.general}면` : "",
    sc.auto ? `오토 ${sc.auto}면` : "",
    sc.glamp ? `글램핑 ${sc.glamp}동` : "",
    sc.caravan ? `카라반 ${sc.caravan}대` : "",
  ].filter(Boolean).join(" · ");
  const amenity = [
    c.toilets ? `화장실 ${c.toilets}` : "",
    c.showers ? `샤워실 ${c.showers}` : "",
  ].filter(Boolean).join(" · ");

  // 부대시설 칩
  const facChips = (c.facilities || "")
    .split(",").filter(Boolean)
    .map((f) => `<span class="chip">${esc(f.trim())}</span>`).join(" ");

  const homepage = c.homepage
    ? `<a href="${esc(c.homepage)}" target="_blank" rel="noopener">${esc(c.homepage)}</a>`
    : "";

  // ⭐ 예약 버튼 (있을 때만 크게)
  const reserveBtn = c.reserveUrl
    ? `<a class="dir-btn reserve" target="_blank" rel="noopener" href="${esc(c.reserveUrl)}">🏕️ 예약 바로가기</a>`
    : "";

  const directions = `
    <div class="dir-buttons">
      ${reserveBtn}
      <a class="dir-btn kakao" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/${encodeURIComponent(c.name)},${c.lat},${c.lng}">🚗 카카오맵 길찾기</a>
      <a class="dir-btn naver" target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(c.address || c.name)}">🧭 네이버지도에서 보기</a>
    </div>`;

  const intro = c.intro
    ? `<section class="overview"><h2>소개</h2><p>${c.intro}</p></section>`
    : c.lineIntro
      ? `<section class="overview"><h2>소개</h2><p>${esc(c.lineIntro)}</p></section>`
      : "";

  // 같은 지역 다른 캠핑장 추천 4곳 (사진 있는 곳 우선)
  const sameRegion = all
    .filter((o) => o.contentId !== c.contentId && getRegion(o) === region)
    .sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0))
    .slice(0, 4);
  const relatedCards = sameRegion
    .map((o) => `
      <a class="nearby-card nearby-link" href="${o.contentId}.html">
        ${o.image ? `<img src="${esc(o.image)}" alt="${esc(o.name)}" loading="lazy" />` : `<div class="nearby-noimg">🏕️</div>`}
        <div class="nearby-name">${esc(o.name)}</div>
        <div class="nearby-dist">${esc(o.sigungu || region)}</div>
      </a>`)
    .join("");
  const relatedSection = sameRegion.length
    ? `<section class="nearby-section"><h2>🗺️ ${region} 지역의 다른 캠핑장</h2><div class="nearby-row">${relatedCards}</div></section>`
    : "";

  // ── 주변 관광지/맛집 카드 — 클릭하면 네이버지도 검색이 새 탭으로 (FestivalHub와 동일) ──
  const nearbyCards = (list) =>
    (list || [])
      .map((p) => {
        const query = `${(p.addr || "").split(" ").slice(0, 2).join(" ")} ${p.name}`.trim();
        return `
        <a class="nearby-card nearby-link" target="_blank" rel="noopener"
           href="https://map.naver.com/p/search/${encodeURIComponent(query)}" title="네이버지도에서 보기">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="nearby-noimg">📷</div>`}
          <div class="nearby-name">${esc(p.name)}</div>
          <div class="nearby-dist">📍 ${p.dist >= 1000 ? (p.dist / 1000).toFixed(1) + "km" : p.dist + "m"} · 지도 보기</div>
        </a>`;
      })
      .join("");
  const nearbySection = (title, icon, list) =>
    Array.isArray(list) && list.length
      ? `<section class="nearby-section"><h2>${icon} ${title}</h2><div class="nearby-row">${nearbyCards(list)}</div></section>`
      : "";

  // ── 형제 사이트 연결: 근처 축제 (페스티벌허브) ──
  // "캠핑 가는 김에 근처 축제도" — 두 사이트가 방문자를 주고받는 다리
  const nearFests = c.lat && c.lng
    ? crossFestivals
        .map((f) => ({ ...f, dist: distKm(Number(c.lat), Number(c.lng), Number(f.lat), Number(f.lng)) }))
        .filter((f) => f.dist <= 40)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4)
    : [];
  const festSection = nearFests.length
    ? `<section class="nearby-section"><h2>🎪 근처 축제</h2><div class="nearby-row">${nearFests
        .map(
          (f) => `
        <a class="nearby-card nearby-link cross-link" target="_blank" rel="noopener"
           href="https://festivalhub.kr/festival/${f.contentid}.html" title="페스티벌허브에서 보기">
          ${f.image ? `<img src="${esc(f.image)}" alt="${esc(f.name)}" loading="lazy" />` : `<div class="nearby-noimg">🎪</div>`}
          <div class="nearby-name">${esc(f.name)}</div>
          <div class="nearby-dist">📅 ${f.startDate.slice(4, 6)}.${f.startDate.slice(6, 8)}~${f.endDate.slice(4, 6)}.${f.endDate.slice(6, 8)} · ${f.dist < 10 ? f.dist.toFixed(1) : Math.round(f.dist)}km ↗</div>
        </a>`
        )
        .join("")}</div></section>`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Campground",
    name: c.name,
    description,
    url: `${SITE_URL}/camping/${c.contentId}.html`,
    address: c.address,
    telephone: c.tel || undefined,
    image: c.image || undefined,
    geo: { "@type": "GeoCoordinates", latitude: Number(c.lat), longitude: Number(c.lng) },
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.name)} — ${region} 캠핑장 정보·예약 | CampingHub</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE_URL}/camping/${c.contentId}.html" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(c.name)} — ${region} 캠핑장" />
  <meta property="og:description" content="${esc(description)}" />
  ${c.image ? `<meta property="og:image" content="${esc(c.image)}" />` : ""}
  <meta property="og:url" content="${SITE_URL}/camping/${c.contentId}.html" />
  <link rel="stylesheet" href="../style.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${GA_SNIPPET}
</head>
<body>
  <main class="detail-container">
    <a class="back-link" href="../index.html">← 전국 캠핑장 목록으로</a>
    ${img}
    <div class="detail-body">
      ${badges}
      <h1>${esc(c.name)}</h1>
      <div class="actions">
        <button id="fav-btn" class="action-btn">🤍 찜하기</button>
        <button id="share-btn" class="action-btn">🔗 링크 복사</button>
      </div>
      <div class="info-grid">
        ${infoRow("📍", "주소", esc(c.address))}
        ${infoRow("🏛️", "운영주체", esc(c.operator))}
        ${infoRow("🗓️", "운영계절", esc(c.operPeriod))}
        ${infoRow("⛺", "사이트 구성", siteParts)}
        ${infoRow("🚻", "편의시설", amenity)}
        ${infoRow("🔥", "화로대", esc(c.brazier))}
        ${infoRow("🐕", "반려동물", esc(c.pet))}
        ${infoRow("🏞️", "테마", esc(c.theme))}
        ${infoRow("📞", "문의", esc(c.tel))}
        ${infoRow("🔗", "홈페이지", homepage)}
      </div>
      ${facChips ? `<section class="overview"><h2>부대시설</h2><p>${facChips}</p></section>` : ""}
      ${c.glampFacilities ? `<section class="overview"><h2>글램핑 내부시설</h2><p>${esc(c.glampFacilities)}</p></section>` : ""}
      ${c.caravanFacilities ? `<section class="overview"><h2>카라반 내부시설</h2><p>${esc(c.caravanFacilities)}</p></section>` : ""}
      ${intro}
      <section class="map-section"><h2>오시는 길</h2><div id="map"></div>${directions}</section>
      ${relatedSection}
      ${nearbySection("주변 관광지", "🏞️", c.nearbySpots)}
      ${nearbySection("주변 맛집", "🍜", c.nearbyFood)}
      ${festSection}
      <section class="nearby-section coupang-section">
        <h2>🎒 캠핑 준비물</h2>
        <div class="dir-buttons">
          ${COUPANG_ITEMS.map((i) => `<a class="dir-btn coupang" target="_blank" rel="noopener sponsored" href="${esc(i.url)}">${esc(i.name)}</a>`).join("")}
        </div>
        <p class="coupang-notice">이 섹션은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
      </section>
    </div>
  </main>
  ${footerHtml("../")}

  <script>
    window.CAMP = ${JSON.stringify({ contentId: c.contentId, name: c.name, lat: c.lat, lng: c.lng })};
  </script>
  <script src="../camping-page.js"></script>
  <script src="../track-clicks.js"></script>
</body>
</html>`;
}

// ─── 실행 ───
const outDir = path.join(__dirname, "camping");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
for (const old of fs.readdirSync(outDir)) {
  if (old.endsWith(".html")) fs.unlinkSync(path.join(outDir, old));
}

for (const c of campings) {
  fs.writeFileSync(path.join(outDir, `${c.contentId}.html`), buildPage(c, campings), "utf-8");
}
console.log(`✅ camping/*.html ${campings.length}개 생성`);

// 예전 빌드의 테마/지역 파일 정리
for (const old of fs.readdirSync(__dirname)) {
  if (/^(theme-[a-z]+|region-[a-z-]+)\.html$/.test(old)) fs.unlinkSync(path.join(__dirname, old));
}

// 공통 칩 내비게이션
const regionsAll = [...new Set(campings.map(getRegion))]
  .filter((r) => r !== "기타")
  .sort((a, b) => a.localeCompare(b, "ko"));
SITE_NAV = `
  <nav class="quick-links sticky-desktop">
    <a class="chip chip-hot" href="theme-forest.html">🌲 휴양림·국공립</a>
    <a class="chip chip-events" href="theme-glamping.html">⛺ 글램핑</a>
    <a class="chip" href="theme-caravan.html">🚐 카라반</a>
    <a class="chip" href="theme-pet.html">🐕 반려동물</a>
    ${regionsAll.map((r) => `<a class="chip" href="region-${REGION_SLUGS[r] || "etc"}.html">${esc(r)}</a>`).join("")}
  </nav>`;

// 테마 페이지
const themeFiles = [];
for (const t of CAMP_THEMES) {
  const items = campings.filter(t.test).sort(campingSort);
  const filename = `theme-${t.slug}.html`;
  fs.writeFileSync(
    filename,
    buildListPage({
      filename,
      title: `전국 ${t.name} 총정리 (${items.length}곳) — CampingHub`,
      heading: `${t.icon} ${t.name}`,
      subtitle: `${t.desc} ${items.length}곳 모음`,
      description: `전국 ${t.name} ${items.length}곳. ${items.slice(0, 5).map((c) => c.name).join(", ")} 등 시설·위치·예약 정보를 한눈에.`,
      items,
    }),
    "utf-8"
  );
  themeFiles.push(filename);
  console.log(`✅ ${filename} 생성 (${t.name} ${items.length}건)`);
}

// 지역 페이지
const regionFiles = [];
for (const region of regionsAll) {
  const slug = REGION_SLUGS[region] || "etc";
  const filename = `region-${slug}.html`;
  const items = campings.filter((c) => getRegion(c) === region).sort(campingSort);
  fs.writeFileSync(
    filename,
    buildListPage({
      filename,
      title: `${region} 캠핑장 총정리 (${items.length}곳) — CampingHub`,
      heading: `📍 ${region} 캠핑장`,
      subtitle: `${region}의 캠핑장·휴양림 ${items.length}곳`,
      description: `${region} 캠핑장 모음. ${items.slice(0, 5).map((c) => c.name).join(", ")} 등 ${items.length}곳의 시설·위치·예약 정보.`,
      items,
    }),
    "utf-8"
  );
  regionFiles.push(filename);
}
console.log(`✅ 지역별 페이지 ${regionFiles.length}개 생성 (${regionsAll.join(", ")})`);

// ─── 캠핑 입문 가이드 페이지 (자체 제작 콘텐츠) ───────────────
// 목적: ① 초보 방문자에게 실제 도움 ② "캠핑 준비물" 같은 큰 검색 키워드 공략
//       ③ 애드센스 심사용 자체 콘텐츠 ④ 장비 가이드에 쿠팡 링크(자연스러운 위치)
const GUIDE_PAGES = [
  {
    slug: "guide-beginner",
    icon: "🔰",
    title: "첫 캠핑 준비물 체크리스트",
    desc: "캠핑 초보를 위한 준비물 총정리 — 꼭 필요한 것과 나중에 사도 되는 것, 장비 없이 시작하는 방법까지.",
    body: `
      <section class="overview">
        <h2>처음이라면, 다 사지 마세요</h2>
        <p>
          첫 캠핑에서 가장 흔한 실수는 <strong>장비를 한 번에 다 사는 것</strong>입니다.
          한두 번 다녀보면 나에게 맞는 캠핑 스타일(오토캠핑/미니멀/글램핑)이 보이고,
          그때 사야 후회가 없습니다. 아래 체크리스트에서 "꼭 필요한 것"만 챙기고,
          나머지는 빌리거나 다음으로 미루세요.
        </p>
      </section>
      <section class="overview">
        <h2>✅ 꼭 필요한 것 (이것 없으면 캠핑이 안 돼요)</h2>
        <ul>
          <li><strong>텐트</strong> — 인원+1인용을 고르세요 (2인이면 3인용). 짐 놓을 공간이 필요합니다.</li>
          <li><strong>매트</strong> — 바닥 냉기와 돌멩이를 막아주는 필수품. 침낭보다 매트가 먼저입니다.</li>
          <li><strong>침낭 또는 이불</strong> — 한여름 빼고는 밤에 생각보다 춥습니다. 계절에 맞는 것으로.</li>
          <li><strong>랜턴</strong> — 캠핑장은 밤에 정말 어둡습니다. 메인 1개 + 손전등 1개.</li>
          <li><strong>의자·테이블</strong> — 바닥 생활은 2시간이면 허리가 아픕니다.</li>
          <li><strong>버너와 코펠(취사도구)</strong> — 요리를 한다면. 첫 캠핑은 배달·포장 음식도 훌륭한 선택입니다.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>⏳ 나중에 사도 되는 것</h2>
        <ul>
          <li><strong>타프</strong>(그늘막) — 여름 해가 뜨거울 때 필요. 나무 그늘 사이트를 고르면 없어도 됩니다.</li>
          <li><strong>화로대</strong> — 불멍의 낭만이지만, 첫 캠핑엔 캠핑장 매점 장작+대여로 충분합니다.</li>
          <li><strong>아이스박스</strong> — 1박이면 마트 스티로폼 박스로도 버팁니다.</li>
          <li><strong>전기용품</strong>(전기장판 등) — 전기 사이트인지 먼저 확인하고 결정하세요.</li>
        </ul>
        <p class="guide-tip">💡 <strong>장비 없이 시작하는 방법</strong> — 장비가 하나도 없다면
          <a href="theme-glamping.html">글램핑</a>이나 <a href="theme-caravan.html">카라반</a>부터 시작해 보세요.
          침구·바베큐 시설이 다 갖춰져 있어 몸만 가면 됩니다. 캠핑이 나와 맞는지 확인한 뒤 장비를 사도 늦지 않습니다.</p>
      </section>
      <section class="overview">
        <h2>🧾 출발 전 최종 체크리스트</h2>
        <ul>
          <li>잠자리: 텐트 · 매트 · 침낭 · 베개(수건으로 대체 가능)</li>
          <li>불빛: 랜턴 · 손전등 · 보조배터리</li>
          <li>식사: 버너 · 코펠 · 라이터 · 식재료 · 물 넉넉히 · 쓰레기봉투</li>
          <li>생활: 의자 · 테이블 · 슬리퍼 · 세면도구 · 수건</li>
          <li>날씨 대비: 여벌 옷(한 겹 더) · 우비 · 모기기피제(여름)</li>
          <li>확인: 캠핑장 예약 내역 · 매너타임 · 전기 사용 가능 여부</li>
        </ul>
        <p class="guide-tip">👉 다음 단계: <a href="guide-gear.html">💰 예산별 장비 가이드</a>에서
          얼마짜리부터 시작할지 정해보세요. 안전 수칙은 <a href="guide-safety.html">⚠️ 안전·매너 가이드</a>에.</p>
      </section>`,
  },
  {
    slug: "guide-gear",
    icon: "💰",
    title: "예산별 캠핑 장비 가이드",
    desc: "10만원대 입문부터 제대로 갖추기까지 — 예산별로 뭘 먼저 사야 하는지 우선순위를 알려드립니다.",
    body: `
      <section class="overview">
        <h2>장비 투자의 제1원칙: 잠자리부터</h2>
        <p>
          캠핑의 만족도는 <strong>잘 잤는지</strong>가 80%를 결정합니다.
          예산이 얼마든 <strong>매트와 침낭(잠자리) → 텐트 → 나머지</strong> 순서로 투자하세요.
          비싼 텐트에 얇은 매트보다, 보통 텐트에 좋은 매트가 훨씬 만족스럽습니다.
        </p>
      </section>
      <section class="overview">
        <h2>🌱 10만원대 — 일단 경험해 보기</h2>
        <ul>
          <li>보급형 원터치 텐트 또는 중고 텐트 (3~5만원대부터)</li>
          <li>발포 매트 + 여름용 침낭 (합쳐서 2~3만원대)</li>
          <li>충전식 랜턴 (1만원 안팎)</li>
          <li>접이식 의자 2개 (개당 1~2만원)</li>
        </ul>
        <p>
          "캠핑이 나랑 맞나?"를 확인하는 단계입니다. 이 구성으로 봄~가을 1박은 충분히 가능합니다.
          단, 한겨울은 이 장비로는 위험하니 시도하지 마세요.
        </p>
      </section>
      <section class="overview">
        <h2>🌿 30만원대 — 본격 시작</h2>
        <ul>
          <li>거실형 아닌 <strong>돔텐트</strong> (10만원 안팎) — 설치가 쉬워 초보에게 딱</li>
          <li><strong>자충 매트</strong>(자동충전 에어매트) — 수면의 질이 완전히 달라집니다</li>
          <li>3계절 침낭 — 봄·가을 밤 추위 해결</li>
          <li>경량 테이블 + 수납형 랜턴 + 코펠 세트</li>
        </ul>
        <p>월 1회 이상 다닐 생각이 들었다면 이 단계로 올라오세요. 대부분의 캠퍼가 이 구간에서 오래 머뭅니다.</p>
      </section>
      <section class="overview">
        <h2>🌳 그 이상 — 취향의 영역</h2>
        <p>
          브랜드 텐트, 화로대, 파워뱅크, 감성 조명... 여기서부터는 필요가 아니라 <strong>취향</strong>입니다.
          한 가지 조언: 장비를 늘리기 전에 <strong>수납과 차량 적재</strong>를 먼저 생각하세요.
          짐 싸기가 힘들어지면 캠핑 가는 횟수가 줄어듭니다.
        </p>
      </section>
      ${COUPANG_ITEMS.length ? `
      <section class="overview coupang-section">
        <h2>🎒 시작 장비 쿠팡에서 둘러보기</h2>
        <div class="dir-buttons">
          ${COUPANG_ITEMS.map((i) => `<a class="dir-btn coupang" target="_blank" rel="noopener sponsored" href="${esc(i.url)}">${esc(i.name)}</a>`).join("")}
        </div>
        <p class="coupang-notice">이 섹션은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
      </section>` : ""}
      <section class="overview">
        <h2>어디로 갈지 정하셨나요?</h2>
        <p class="guide-tip">👉 <a href="index.html">전국 캠핑장 3,000곳</a>에서 지역·유형별로 골라보세요.
          위치를 허용하면 <strong>내 주변 가까운 순</strong>으로 정렬됩니다.
          준비물이 처음이라면 <a href="guide-beginner.html">🔰 첫 캠핑 체크리스트</a>부터.</p>
      </section>`,
  },
  {
    slug: "guide-safety",
    icon: "⚠️",
    title: "캠핑 안전 수칙과 매너",
    desc: "불·가스·일산화탄소 안전 수칙부터 매너타임까지 — 모두가 즐거운 캠핑을 위한 기본기.",
    body: `
      <section class="overview">
        <h2>🔥 불 안전 — 캠핑 사고의 대부분</h2>
        <ul>
          <li>불은 반드시 <strong>화로대 위에서만</strong>. 바닥 직화는 대부분의 캠핑장에서 금지입니다.</li>
          <li>불 옆에 <strong>물 한 통</strong>을 항상 준비해 두세요.</li>
          <li>잠들기 전 <strong>잔불 정리</strong> — 재가 완전히 식었는지 물을 부어 확인합니다.</li>
          <li>바람이 강한 날은 불멍을 포기하는 것도 실력입니다.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>💨 가스와 일산화탄소 — 생명과 직결</h2>
        <ul>
          <li><strong>텐트 안에서 버너·숯·난로 사용은 절대 금지</strong>입니다. 일산화탄소는 냄새가 없습니다.</li>
          <li>겨울에 난방기구를 쓴다면 <strong>일산화탄소 경보기</strong>를 꼭 챙기고, 환기구를 확보하세요.</li>
          <li>부탄가스는 화기·직사광선 근처에 두지 말고, 다 쓴 통은 구멍을 뚫지 말고 분리 배출하세요.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>🌧️ 날씨 대비</h2>
        <ul>
          <li>비 예보가 있으면 <strong>계곡·하천 옆 사이트를 피하세요</strong>. 상류에 비가 오면 갑자기 불어납니다.</li>
          <li>바람이 강하면 텐트 팩을 깊게 박고, 타프는 낮게 치거나 접으세요.</li>
          <li>여름 한낮 텐트 안은 찜통이 됩니다 — 그늘 사이트를 고르고 수분을 충분히.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>🤝 캠핑 매너 — 모두의 하룻밤을 위해</h2>
        <ul>
          <li><strong>매너타임(보통 밤 10시~아침 7시)</strong>에는 대화 소리도 낮춰주세요. 텐트는 방음이 안 됩니다.</li>
          <li>쓰레기는 <strong>분리해서 되가져가기</strong>가 기본입니다 (캠핑장 규정 확인).</li>
          <li>다른 사이트를 가로질러 다니지 않기 — 그곳은 하룻밤 남의 집입니다.</li>
          <li>반려동물은 리드줄 필수, 배변은 바로 처리 — <a href="theme-pet.html">반려동물 동반 캠핑장</a>인지 미리 확인하세요.</li>
          <li>설거지는 지정된 개수대에서, 기름은 휴지로 닦아낸 뒤에.</li>
        </ul>
        <p class="guide-tip">👉 준비물이 궁금하다면 <a href="guide-beginner.html">🔰 첫 캠핑 체크리스트</a>,
          장비 구입은 <a href="guide-gear.html">💰 예산별 장비 가이드</a>를 참고하세요.</p>
      </section>`,
  },
];

const guideFiles = [];
for (const g of GUIDE_PAGES) {
  const filename = `${g.slug}.html`;
  fs.writeFileSync(
    filename,
    `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(g.title)} — CampingHub</title>
  <meta name="description" content="${esc(g.desc)}" />
  <link rel="canonical" href="${SITE_URL}/${filename}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(g.title)} — CampingHub" />
  <meta property="og:description" content="${esc(g.desc)}" />
  <meta property="og:url" content="${SITE_URL}/${filename}" />
  <link rel="stylesheet" href="style.css" />
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>${g.icon} ${esc(g.title)}</h1>
    <p class="home-link"><a href="index.html">← 전체 캠핑장 보기</a></p>
  </header>
  <main class="detail-container">
    <div class="detail-body guide-body">
      ${g.body}
    </div>
  </main>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
</body>
</html>`,
    "utf-8"
  );
  guideFiles.push(filename);
}
console.log(`✅ 입문 가이드 ${guideFiles.length}개 생성 (${guideFiles.join(", ")})`);

// sitemap + robots
const today = new Date().toISOString().slice(0, 10);
const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/about.html`,
  ...guideFiles.map((f) => `${SITE_URL}/${f}`),
  ...themeFiles.map((f) => `${SITE_URL}/${f}`),
  ...regionFiles.map((f) => `${SITE_URL}/${f}`),
  ...campings.map((c) => `${SITE_URL}/camping/${c.contentId}.html`),
];
fs.writeFileSync(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`,
  "utf-8"
);
fs.writeFileSync("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf-8");
console.log(`✅ sitemap.xml (${urls.length}개 주소) + robots.txt 생성`);

// 홈 목록용 경량 데이터 — campings.json(5MB+)은 소개글·주변정보까지 담고 있어 무거우므로
// 목록 화면에 필요한 필드만 추린 작은 파일을 따로 만든다 (app.js가 이걸 읽음)
const slim = campings.map((c) => ({
  contentId: c.contentId,
  name: c.name,
  type: c.type,
  operator: c.operator,
  region: c.region,
  sigungu: c.sigungu,
  address: (c.address || "").split(" ").slice(0, 2).join(" "),
  image: c.image,
  pet: c.pet,
  facilities: (c.facilities || "").split(",").filter(Boolean).slice(0, 3).join(","),
  // "내 주변" 거리 계산용 좌표 (소수 4자리 ≈ 10m 정밀도, 파일 크기 절약)
  lat: c.lat ? Number(Number(c.lat).toFixed(4)) : undefined,
  lng: c.lng ? Number(Number(c.lng).toFixed(4)) : undefined,
}));
fs.writeFileSync("campings-list.json", JSON.stringify(slim), "utf-8");
console.log(`✅ campings-list.json 생성 (목록용 경량본, ${Math.round(JSON.stringify(slim).length / 1024)}KB)`);
