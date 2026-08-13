// build-pages.js — campings.json을 읽어 캠핑장별 상세 페이지와
// 테마/지역 목록 페이지를 생성한다. (FestivalHub build-pages.js 구조 재활용)
// 실행: node build-pages.js

const fs = require("fs");
const path = require("path");

// 배포 주소. 도메인을 사면 이 한 줄만 바꾸고 다시 빌드
const SITE_URL = "https://chayangho0323-droid.github.io/campinghub";

// 쿠팡 파트너스 — 캠핑용품이라 이 사이트와 궁합이 더 좋다 (FestivalHub과 같은 링크)
const COUPANG_ITEMS = [
  { name: "🪑 캠핑의자", url: "https://link.coupang.com/a/f7LuGkEJMq" },
  { name: "🧺 돗자리", url: "https://link.coupang.com/a/f7MlAxqn7s" },
  { name: "🌀 휴대용 선풍기", url: "https://link.coupang.com/a/f7Mn8WrdpA" },
];

const campings = JSON.parse(fs.readFileSync("campings.json", "utf-8"));

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
    <p><a href="${prefix}index.html">전체 캠핑장</a> · <a href="${prefix}theme-forest.html">🌲 휴양림·국공립</a> · <a href="${prefix}theme-glamping.html">⛺ 글램핑</a></p>
  </footer>`;
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
  const items = campings.filter(t.test).sort((a, b) => a.name.localeCompare(b.name, "ko"));
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
  const items = campings.filter((c) => getRegion(c) === region).sort((a, b) => a.name.localeCompare(b.name, "ko"));
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

// sitemap + robots
const today = new Date().toISOString().slice(0, 10);
const urls = [
  `${SITE_URL}/`,
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
