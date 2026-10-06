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
  </script>
  <!-- Google AdSense (사이트 소유 확인 + 광고 게재) -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5951913667078413" crossorigin="anonymous"></script>`;

// 쿠팡 파트너스 — 캠핑용품이라 이 사이트와 궁합이 더 좋다 (FestivalHub과 같은 링크)
// 카카오 애드핏 (2026-10-06 매체 "캠핑허브" 등록, 애드센스 재심사와 병행) — 캠핑장 상세 소개글 아래 1개
// 광고단위 "캠핑-본문" 300x250. 스크립트는 광고 위치마다 한 번씩 넣어도 됨(async 로더). 축제 사이트와 같은 구조.
const ADFIT_UNIT_BODY = "DAN-s9yT8c8jCkfMQKCt";
const adfitBlock = (unit, w, h) => `
      <div class="adfit" aria-label="광고">
        <ins class="kakao_ad_area" style="display:none;" data-ad-unit="${unit}" data-ad-width="${w}" data-ad-height="${h}"></ins>
        <script type="text/javascript" src="//t1.kakaocdn.net/kas/static/ba.min.js" async></script>
      </div>`;
const ADFIT_BODY = adfitBlock(ADFIT_UNIT_BODY, 300, 250);

const COUPANG_ITEMS = [
  // 2026-10-06 애드센스 1차 거절 후 복구 (축제와 동일). 재신청 직전에만 다시 비움.
  { name: "🪑 캠핑의자", url: "https://link.coupang.com/a/f7LuGkEJMq" },
  { name: "🧺 돗자리", url: "https://link.coupang.com/a/f7MlAxqn7s" },
  { name: "🧣 캠핑 담요", url: "https://link.coupang.com/a/gP8GvQyG2S" },
  { name: "🔥 핫팩", url: "https://link.coupang.com/a/gP8J1IrVsW" },
];

const campings = JSON.parse(fs.readFileSync("campings.json", "utf-8"));

// 정적 파일 캐시 무력화 (GitHub Pages 캐시 10분) — report.css/js에 빌드 날짜가 붙음
const BUILD_VER = (() => { const d = new Date(Date.now() + 9 * 3600 * 1000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`; })();
// 제보 안내 제목용 둥근 글씨체 (구글 폰트 Jua) + 제보 UI 스타일 — 모든 생성 페이지 head에
const reportHead = (prefix = "") => `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&display=swap" />
  <link rel="stylesheet" href="${prefix}report.css?v=${BUILD_VER}" />`;

// ─── 방문자 사진 제보 (공통 모듈 visitor-photos.js — 축제·펫트립과 동일) ───
// 받은 사진: photos/ 폴더 + photos.json({ "<contentId>": [{image|video, credit, caption, review, date}] })
// → 상세 "📸 방문자 사진" 갤러리. 공식 사진이 없는 캠핑장은 첫 제보 사진이 대표 사진.
// 신규 캠핑장은 고캠핑에 사진·소개가 없어서(검색 유입 1위가 이런 곳) 방문자 사진이 유일한 콘텐츠가 된다.
const VP = require("./visitor-photos");
const REPORT_EMAIL = "chayangho0323@gmail.com";
const visitorPhotos = VP.loadVisitorPhotos(SITE_URL);
for (const c of campings) {
  const list = visitorPhotos[String(c.contentId)];
  if (list && !c.image && VP.firstImage(list)) { c.image = VP.firstImage(list); c.photoCredit = (list.find((x) => x.image && !x.video) || list[0]).credit; }
}
function reportMailto(c) {
  return VP.reportMailto(c
    ? { email: REPORT_EMAIL, siteName: "CampingHub", name: c.name, where: `${getRegion(c)} ${c.sigungu || ""}`.trim(), pageUrl: `${SITE_URL}/camping/${c.contentId}.html` }
    : { email: REPORT_EMAIL, siteName: "CampingHub" });
}
// 제보 안내 띠 — 사진 제보(이메일 안내창)와 캠핑장 제보(구글폼)를 한곳에
function photoCallHtml(c) {
  const text = c
    ? (c.image
      ? "이 캠핑장에 다녀오셨나요? 우리 가족 캠핑 사진·사이트 뷰·풍경 사진을 보내주세요 — <strong>닉네임과 후기</strong>와 함께 이 페이지에 올려드려요."
      : "아직 이 캠핑장 사진이 없어요. 다녀오셨다면 사이트 뷰·풍경·가족 사진을 보내주세요 — <strong>닉네임과 후기</strong>와 함께 이 페이지에 올려드려요.")
    : `우리 가족 캠핑 사진, 사이트 뷰, 풍경 사진을 보내주세요! <strong>닉네임과 후기</strong>와 함께 캠핑장 페이지에 올려드려요. 여기 없는 캠핑장은 <a class="report-link" href="${REPORT_FORM_URL}" target="_blank" rel="noopener">📮 캠핑장 제보</a>로 알려주세요.`;
  return VP.photoCallHtml({ title: "캠핑 사진 자랑해 주세요!", text, href: reportMailto(c) });
}

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
  // 차박 = 자동차야영장(차 옆에 바로 텐트·차박). "차박" 검색량이 커서 테마로 따로 (2026-10-06)
  { slug: "carcamping", name: "차박·오토캠핑장", icon: "🚗",
    desc: "차 옆에 바로 자리 잡는 자동차야영장 — 차박·오토캠핑", test: (c) => (c.siteCounts && c.siteCounts.auto > 0) || (c.type || "").includes("자동차야영장") },
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
    <p><a href="${prefix}about.html">사이트 소개</a> · <a href="${prefix}privacy.html">개인정보처리방침</a> · <a href="${prefix}index.html">전체 캠핑장</a> · <a href="${prefix}theme-forest.html">🌲 휴양림·국공립</a> · <a href="${prefix}theme-glamping.html">⛺ 글램핑</a> · <a href="${prefix}theme-carcamping.html">🚗 차박</a> · <a href="${prefix}theme-pet.html">🐕 반려동물</a></p>
    <p><a href="${prefix}guide-beginner.html">🔰 첫 캠핑 준비물</a> · <a href="${prefix}guide-gear.html">💰 예산별 장비</a> · <a href="${prefix}guide-compare.html">📚 장비 비교</a> · <a href="${prefix}guide-safety.html">⚠️ 안전·매너</a></p>
    <p><a href="${prefix}guide-reserve.html">📅 예약·취소 가이드</a> · <a href="${prefix}guide-carcamping.html">🚗 차박 되는 곳</a> · <a href="${prefix}guide-fire.html">🔥 화로대·불멍 규정</a> · <a href="${prefix}guide-holiday.html">🗓️ 연휴 예약 타이밍</a></p>
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

// ⛺ "가기 전 확인하세요" — 고캠핑에 있지만 화면에 안 보여주던 항목(바닥·입지·보험·화로대·사이트 간격·안전장비·예약 방식)
function checkBeforeHtml(c) {
  const rows = [];
  if (c.siteBottom) rows.push(["🟫", "바닥 형태", c.siteBottom.split(",").join(" · ")]);
  if (c.location) rows.push(["🏞️", "입지", c.location.split(",").join(" · ")]);
  if (c.brazier) rows.push(["🔥", "화로대", c.brazier]);
  if (c.siteDistance) rows.push(["↔️", "사이트 간 거리", `약 ${c.siteDistance}m`]);
  if (c.siteSize) rows.push(["📐", "사이트 크기", c.siteSize]);
  if (c.reserveType) rows.push(["📅", "예약 방식", c.reserveType]);
  if (c.operDays) rows.push(["🗓️", "운영일", c.operDays]);
  if (c.offSeason) rows.push(["⛔", "휴장 기간", c.offSeason]);
  const sf = c.safety || {};
  const safety = [sf.extinguisher ? `소화기 ${sf.extinguisher}` : "", sf.water ? `방화수 ${sf.water}` : "", sf.sand ? `방화사 ${sf.sand}` : "", sf.sensor ? `화재감지기 ${sf.sensor}` : ""].filter(Boolean).join(" · ");
  if (safety) rows.push(["🧯", "안전 장비", safety]);
  if (c.insurance) rows.push(["🛡️", "영업배상책임보험", "가입"]);
  if (c.trailerOk || c.caravanOk) rows.push(["🚐", "개인 장비 입장", [c.trailerOk ? "트레일러 가능" : "", c.caravanOk ? "카라반 가능" : ""].filter(Boolean).join(" · ")]);
  if (c.rental) rows.push(["🎒", "장비 대여", c.rental.split(",").join(" · ")]);
  if (c.nearbyFac) rows.push(["🏖️", "주변 이용 시설", c.nearbyFac.split(",").join(" · ")]);
  if (c.program) rows.push(["🎨", "체험 프로그램", c.program]);
  if (c.event) rows.push(["🎉", "행사", c.event]);
  if (!rows.length) return "";
  return `<section class="overview check-before"><h2>⛺ 가기 전 확인하세요</h2><div class="info-grid">${rows.map(([i, l, v]) => infoRow(i, l, esc(v))).join("")}</div>
    <p class="coupang-notice">※ 이용료·구획별 조건은 고캠핑 공공데이터에 없어요. 예약처에서 확인하세요.</p></section>`;
}

// 소개글이 없는 캠핑장(절반 가까이)에 데이터로 만든 "한눈에 보기" 문단 — 빈 페이지를 없애고 검색 설명문으로도 쓴다
function autoIntroText(c) {
  const region = getRegion(c);
  const where = [region, c.sigungu].filter(Boolean).join(" ");
  const types = (c.type || "").split(",").map((t) => t.trim()).filter(Boolean);
  const kind = types.length ? types.join("·") : "캠핑장";
  const s = [];
  s.push(`${c.name}${/[가-힣]$/.test(c.name) && (c.name.charCodeAt(c.name.length - 1) - 0xac00) % 28 ? "은" : "는"} ${where}에 있는 ${kind}${c.operator ? `으로, ${c.operator}${/[가-힣]$/.test(c.operator) ? "이" : "가"} 운영합니다` : "입니다"}.`);
  if (c.location) s.push(`${c.location.split(",").join("·")} 입지의 캠핑장이에요.`);
  const sc = c.siteCounts || {};
  const sites = [sc.general ? `일반 ${sc.general}면` : "", sc.auto ? `오토캠핑 ${sc.auto}면` : "", sc.glamp ? `글램핑 ${sc.glamp}동` : "", sc.caravan ? `카라반 ${sc.caravan}대` : ""].filter(Boolean);
  if (sites.length) s.push(`사이트는 ${sites.join(", ")}으로 구성돼 있습니다.`);
  const fac = (c.facilities || "").split(",").filter(Boolean).slice(0, 4);
  if (fac.length) s.push(`${fac.join(", ")} 등 부대시설을 갖추고 있어요.`);
  if ((c.pet || "").startsWith("가능")) s.push(`반려동물 동반이 ${c.pet === "가능" ? "가능합니다" : c.pet + "합니다"}.`);
  else if (c.pet === "불가능") s.push("반려동물은 동반할 수 없습니다.");
  if (c.brazier) s.push(`화로대는 ${c.brazier}입니다.`);
  if (c.operPeriod) s.push(`운영 계절은 ${c.operPeriod.split(",").join("·")}${c.operDays ? `, 운영일은 ${c.operDays}` : ""}입니다.`);
  if (c.reserveType) s.push(`예약은 ${c.reserveType}${c.reserveType.includes("예약") ? "" : " 예약"}으로 받아요.`);
  const spots = (c.nearbySpots || []).map((x) => x.name).filter(Boolean).slice(0, 2);
  if (spots.length) s.push(`주변에는 ${spots.join(", ")} 같은 관광지가 있어 함께 둘러보기 좋습니다.`);
  return s.join(" ");
}

// 📅 예약·홈페이지 큰 버튼 — 방문자 17%가 누르는 1등 기능 (2026-09-21 GA). 둘 다 없으면 네이버에서 예약처 찾기
function reserveBlock(c) {
  const q = encodeURIComponent(`${c.name} 예약`);
  const btns = [];
  if (c.reserveUrl) btns.push(`<a class="dir-btn reserve big-btn" target="_blank" rel="noopener" href="${esc(c.reserveUrl)}">📅 예약 바로가기</a>`);
  if (c.homepage && c.homepage !== c.reserveUrl) btns.push(`<a class="dir-btn homepage big-btn" target="_blank" rel="noopener" href="${esc(c.homepage)}">🌐 공식 홈페이지</a>`);
  if (!btns.length) btns.push(`<a class="dir-btn reserve-search big-btn" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?query=${q}">🔎 네이버에서 예약처 찾기</a>`);
  if (c.tel) btns.push(`<a class="dir-btn tel" href="tel:${esc(c.tel.replace(/[^0-9+]/g, ""))}">📞 ${esc(c.tel)}</a>`);
  const note = c.reserveUrl || c.homepage ? "" : `<p class="coupang-notice">고캠핑 공공데이터에 이 캠핑장의 예약 페이지가 등록돼 있지 않아요. 네이버 검색이나 전화로 확인해 주세요.</p>`;
  return `<div class="reserve-block"><div class="dir-buttons">${btns.join("")}</div>${note}</div>`;
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
let REGION_LIST = [];

// 목록형 페이지 한 장
function buildListPage({ filename, title, heading, subtitle, description, items, region = "", theme = "", noindex = false }) {
  const cards = items.map(listCard).join("");
  // 지역 페이지 안에서 테마 칩을 누르면 "그 지역의 테마"로, 테마 페이지 안에서 지역 칩을 누르면 "그 테마의 지역"으로
  const rs = REGION_SLUGS[region];
  let nav = SITE_NAV;
  if (region || theme) {
    const themeChips = [`<a class="chip${!theme ? " chip-active" : ""}" href="${rs ? `region-${rs}.html` : "index.html"}">전체 유형</a>`,
      ...CAMP_THEMES.map((t) => `<a class="chip${theme === t.slug ? " chip-active" : ""}" href="${rs ? `region-${rs}-${t.slug}.html` : `theme-${t.slug}.html`}">${t.icon} ${esc(t.name.replace(/ 캠핑장$/, ""))}</a>`)].join("");
    const regionChips = [`<a class="chip${!region ? " chip-active" : ""}" href="${theme ? `theme-${theme}.html` : "index.html"}">전체 지역</a>`,
      ...REGION_LIST.map((r) => `<a class="chip${region === r ? " chip-active" : ""}" href="${theme ? `region-${REGION_SLUGS[r]}-${theme}.html` : `region-${REGION_SLUGS[r]}.html`}">${esc(r)}</a>`)].join("");
    nav = `<nav class="quick-links">${themeChips}</nav><nav class="quick-links quick-links-regions">${regionChips}</nav>`;
  }
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE_URL}/${filename}" />${noindex ? `\n  <meta name="robots" content="noindex, follow" />` : ""}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${SITE_URL}/${filename}" />
  <link rel="stylesheet" href="style.css" />${reportHead("")}
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>${esc(heading)}</h1>
    <p class="subtitle">${esc(subtitle)}</p>
    <p class="home-link"><a href="index.html">← 전체 캠핑장 보기</a></p>
  </header>
  ${nav}
  ${photoCallHtml(null)}
  <p class="result-count">${items.length}개의 캠핑장</p>
  <main class="festival-grid">${cards || `<p style="grid-column:1/-1;text-align:center;color:#888;">해당하는 캠핑장이 없습니다.</p>`}</main>
  <a class="to-top" href="#" aria-label="맨 위로">↑</a>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
  <script src="report.js?v=${BUILD_VER}"></script>
</body>
</html>`;
}

// ─── 캠핑장 한 곳 → 상세 페이지 ───
function buildPage(c, all) {
  const region = getRegion(c);
  const auto = autoIntroText(c);
  const description = (stripHtml(c.lineIntro || c.intro) || auto).slice(0, 150);

  const vph = visitorPhotos[String(c.contentId)];
  const img = c.image
    ? `<img class="hero" src="${esc(c.image)}" alt="${esc(c.name)}" />${c.photoCredit ? `<p class="photo-credit">📷 사진 제보: ${esc(c.photoCredit)} 님</p>` : ""}`
    : `<div class="ph-hero"><span class="ph-icon">🏕️</span><span class="ph-label">아직 사진이 없는 캠핑장</span><a class="ph-report report-link" href="${esc(reportMailto(c))}">📷 이곳 사진 제보하기</a></div>`;

  const badges = [
    isForest(c) ? `<span class="badge ongoing">🌲 국공립·휴양림</span>` : "",
    ...(c.type ? c.type.split(",").map((t) => `<span class="badge upcoming">${esc(t.trim())}</span>`) : []),
    (c.pet || "").startsWith("가능") ? `<span class="badge long">🐕 반려동물 ${esc(c.pet)}</span>` : "",
    c.status && c.status !== "운영" ? `<span class="badge long">⛔ ${esc(c.status)}</span>` : "",
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

  // 예약·홈페이지 버튼은 정보표 아래 reserveBlock()으로 올렸다 (길찾기 줄에서는 뺌)
  const directions = `
    <div class="dir-buttons">
      <a class="dir-btn kakao" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/${encodeURIComponent(c.name)},${c.lat},${c.lng}">🚗 카카오맵 길찾기</a>
      <a class="dir-btn naver" target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(c.address || c.name)}">🧭 네이버지도에서 보기</a>
    </div>`;

  const intro = c.intro
    ? `<section class="overview"><h2>소개</h2><p>${c.intro}</p></section>`
    : c.lineIntro
      ? `<section class="overview"><h2>소개</h2><p>${esc(c.lineIntro)}</p></section>`
      : `<section class="overview auto-intro"><h2>한눈에 보기</h2><p>${esc(auto)}</p>${c.direction ? `<p>🚗 오시는 길: ${esc(c.direction)}</p>` : ""}</section>`;

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
  <title>${esc(c.name)} — ${region} ${esc(c.sigungu || "")} 캠핑장 예약·시설·반려동물 정보 | CampingHub</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE_URL}/camping/${c.contentId}.html" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(c.name)} — ${region} 캠핑장" />
  <meta property="og:description" content="${esc(description)}" />
  ${c.image ? `<meta property="og:image" content="${esc(c.image)}" />` : ""}
  <meta property="og:url" content="${SITE_URL}/camping/${c.contentId}.html" />
  <link rel="stylesheet" href="../style.css" />${reportHead("../")}
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
      ${reserveBlock(c)}
      ${checkBeforeHtml(c)}
      ${facChips ? `<section class="overview"><h2>부대시설</h2><p>${facChips}</p></section>` : ""}
      ${c.glampFacilities ? `<section class="overview"><h2>글램핑 내부시설</h2><p>${esc(c.glampFacilities)}</p></section>` : ""}
      ${c.caravanFacilities ? `<section class="overview"><h2>카라반 내부시설</h2><p>${esc(c.caravanFacilities)}</p></section>` : ""}
      ${intro}
      ${VP.galleryHtml(vph, { name: c.name, href: reportMailto(c) })}
      ${photoCallHtml(c)}
      ${ADFIT_BODY}
      <section class="map-section"><h2>오시는 길</h2><div id="map"></div>${directions}</section>
      ${relatedSection}
      ${nearbySection("주변 관광지", "🏞️", c.nearbySpots)}
      ${nearbySection("주변 맛집", "🍜", c.nearbyFood)}
      ${festSection}
      ${COUPANG_ITEMS.length ? `<section class="nearby-section coupang-section">
        <h2>🎒 캠핑 준비물</h2>
        <div class="dir-buttons">
          ${COUPANG_ITEMS.map((i) => `<a class="dir-btn coupang" target="_blank" rel="noopener sponsored" href="${esc(i.url)}">${esc(i.name)}</a>`).join("")}
        </div>
        <p class="coupang-notice">이 섹션은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
      </section>` : ""}
    </div>
  </main>
  ${footerHtml("../")}

  <script>
    window.CAMP = ${JSON.stringify({ contentId: c.contentId, name: c.name, lat: c.lat, lng: c.lng })};
  </script>
  <script src="../camping-page.js"></script>
  <script src="../track-clicks.js"></script>
  <script src="../report.js?v=${BUILD_VER}"></script>
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
  if (/^(theme-[a-z]+|region-[a-z-]+(-[a-z]+)?)\.html$/.test(old)) fs.unlinkSync(path.join(__dirname, old));
}

// 공통 칩 내비게이션
const regionsAll = [...new Set(campings.map(getRegion))]
  .filter((r) => r !== "기타")
  .sort((a, b) => a.localeCompare(b, "ko"));
REGION_LIST = regionsAll;
SITE_NAV = `
  <nav class="quick-links sticky-desktop">
    <a class="chip chip-hot" href="theme-forest.html">🌲 휴양림·국공립</a>
    <a class="chip chip-events" href="theme-glamping.html">⛺ 글램핑</a>
    <a class="chip" href="theme-caravan.html">🚐 카라반</a>
    <a class="chip" href="theme-pet.html">🐕 반려동물</a>
    <a class="chip" href="theme-carcamping.html">🚗 차박</a>
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
      theme: t.slug,
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
      region,
    }),
    "utf-8"
  );
  regionFiles.push(filename);

  // 지역 × 테마 (예: region-jeju-pet.html = 제주 반려동물 캠핑장). "국공립 애견동반 캠핑장" 같은 조합 검색이 CTR 50%였음
  for (const t of CAMP_THEMES) {
    const sub = items.filter(t.test);
    const subFile = `region-${slug}-${t.slug}.html`;
    const thin = sub.length < 3; // 너무 적으면 검색 색인 제외(링크는 살려 둠)
    fs.writeFileSync(subFile, buildListPage({
      filename: subFile,
      title: `${region} ${t.name} ${sub.length}곳 — 예약·시설 정보 | CampingHub`,
      heading: `${t.icon} ${region} ${t.name}`,
      subtitle: `${region}의 ${t.desc} ${sub.length}곳`,
      description: `${region} ${t.name} ${sub.length}곳. ${sub.slice(0, 5).map((c) => c.name).join(", ")} 등 시설·위치·예약 정보.`,
      items: sub, region, theme: t.slug, noindex: thin,
    }), "utf-8");
    if (!thin) regionFiles.push(subFile);
  }
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

// ─── 실용 가이드 4편 (2026-10-06, 애드센스 "가치 낮은 콘텐츠" 보완 — 예약·차박·화로대·연휴) ───
// 원칙: 해마다 바뀌는 요금·날짜·정확하지 않은 수치는 쓰지 않고, 방법·판단 기준·체크리스트 위주로.
GUIDE_PAGES.push(
  {
    slug: "guide-reserve",
    icon: "📅",
    title: "캠핑장 예약 방법 총정리 — 국립공원·휴양림·지자체·민간, 취소까지",
    desc: "캠핑장은 운영 주체마다 예약하는 곳이 다릅니다. 국립공원·자연휴양림·지자체·민간 캠핑장별 예약 경로와 취소·환불에서 꼭 확인할 것을 정리했습니다.",
    body: `
      <section class="overview">
        <h2>예약은 "누가 운영하느냐"에 따라 창구가 달라요</h2>
        <p>
          같은 캠핑장이라도 국립공원이 운영하는 곳, 산림청·지자체 자연휴양림, 시·군이 직접 운영하는 공영 캠핑장,
          개인이 운영하는 민간 캠핑장은 <strong>예약하는 사이트가 전부 다릅니다.</strong>
          캠핑허브 상세 페이지의 <strong>운영주체</strong>와 <strong>예약 방식</strong> 항목을 먼저 보면 어디서 예약해야 하는지 감이 잡혀요.
        </p>
      </section>
      <section class="overview">
        <h2>🏞️ 국립공원 야영장</h2>
        <ul>
          <li><strong>국립공원공단 예약 시스템</strong>에서 예약합니다. 캠핑장 홈페이지가 따로 없고 전화 예약도 받지 않는 곳이 대부분이에요.</li>
          <li>인기 야영장은 성수기에 <strong>추첨제</strong>로 운영되기도 합니다. 추첨 신청 기간을 놓치면 선착순 잔여 자리만 노려야 하니, 가려는 야영장의 공지를 미리 확인하세요.</li>
          <li>국립공원은 <strong>지정된 야영장 밖에서의 야영·취사가 금지</strong>돼 있어요. 반드시 야영장 안에서만.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>🌲 자연휴양림 야영장</h2>
        <ul>
          <li>국립 자연휴양림은 산림청의 <strong>숲나들e</strong>에서 예약합니다. 숙박동(숲속의집)과 야영장이 같은 시스템에 있어요.</li>
          <li>도·군이 운영하는 지방 휴양림은 각 지자체 예약 시스템을 쓰는 곳이 많습니다. 상세 페이지의 예약 버튼이 안내하는 곳으로 가세요.</li>
          <li>휴양림은 보통 <strong>매달 정해진 날에 다음 달 예약이 열리고</strong>, 성수기 주말은 열리자마자 마감됩니다. 오픈 날짜·시간을 휴양림 공지에서 확인해 두세요.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>🏛️ 지자체 공영 캠핑장</h2>
        <ul>
          <li>시·군 공공 예약 포털이나 캠핑장 전용 홈페이지에서 예약합니다. 요금이 저렴하고 시설이 깔끔한 편이라 경쟁이 치열해요.</li>
          <li>일부는 <strong>지역 주민 우선 예약</strong>이나 할인 제도가 있습니다. 거주지에 따라 유리할 수 있어요.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>⛺ 민간 캠핑장</h2>
        <ul>
          <li>캠핑장 자체 홈페이지, 네이버 예약, 캠핑 예약 플랫폼 중 하나를 씁니다. 상세 페이지에 예약 링크가 없으면 <strong>"네이버에서 예약처 찾기"</strong> 버튼으로 찾아보세요.</li>
          <li>전화 예약만 받는 곳도 아직 많습니다. 상세 페이지의 전화번호로 문의하면 가장 정확해요.</li>
          <li>예약 전 <strong>후기</strong>를 꼭 보세요. 캠핑허브 카드의 "네이버 후기 보기"가 바로 연결됩니다.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>❌ 취소·환불, 이것만은 확인하세요</h2>
        <ul>
          <li><strong>취소 수수료는 캠핑장마다, 시기마다 다릅니다.</strong> 보통 성수기·주말일수록, 이용일에 가까울수록 환불이 줄어들어요. 예약 확정 전에 취소 규정을 캡쳐해 두세요.</li>
          <li>공공 캠핑장은 대체로 소비자분쟁해결기준에 맞춘 환불 규정을 공지하고 있습니다. 민간은 자체 규정이 우선이에요.</li>
          <li><strong>우천 취소</strong>는 캠핑장마다 정책이 갈립니다. 기상특보(호우·태풍 등)가 나왔을 때 환불해 주는지 미리 물어보세요.</li>
          <li>국립공원·휴양림은 <strong>취소하면 그 자리가 바로 다시 열리기</strong> 때문에, 연휴 직전 취소표를 노리는 것도 방법입니다.</li>
        </ul>
        <p class="guide-tip">👉 연휴 예약 공략은 <a href="guide-holiday.html">🗓️ 연휴 캠핑 예약 타이밍</a>, 준비물은 <a href="guide-beginner.html">🔰 첫 캠핑 체크리스트</a>를 참고하세요.</p>
      </section>`,
  },
  {
    slug: "guide-carcamping",
    icon: "🚗",
    title: "차박 되는 곳·안 되는 곳 — 자동차야영장과 차박 금지 구역 구분법",
    desc: "차박은 어디서나 해도 되는 게 아닙니다. 합법적으로 차박할 수 있는 자동차야영장과 금지된 장소를 구분하는 기준, 차박 매너를 정리했습니다.",
    body: `
      <section class="overview">
        <h2>차박은 "주차"가 아니라 "야영"입니다</h2>
        <p>
          차 안에서 자는 것 자체는 주차지만, 차 옆에 의자·테이블을 펴고 취사를 하는 순간 <strong>야영</strong>이 됩니다.
          그래서 "주차는 되는데 차박은 안 되는" 장소가 많아요. 차박이 되는지 판단하는 기준은 하나입니다 —
          <strong>그 장소가 야영을 허용하는 곳인가.</strong>
        </p>
      </section>
      <section class="overview">
        <h2>✅ 마음 편히 차박할 수 있는 곳</h2>
        <ul>
          <li><strong>자동차야영장</strong> — 차를 사이트 옆에 바로 대고 텐트를 치거나 차 안에서 잘 수 있도록 만든 곳. 캠핑허브 <a href="theme-carcamping.html">🚗 차박·오토캠핑장</a>에 전국 자동차야영장을 모았습니다. 전기·화장실·개수대가 있어 초보에게 가장 안전해요.</li>
          <li><strong>카라반·트레일러 입장 가능 캠핑장</strong> — 상세 페이지 "가기 전 확인하세요"의 <em>개인 장비 입장</em> 항목을 보세요. 개인 카라반이 들어가는 곳은 차박도 자연스럽게 받아주는 편입니다.</li>
          <li><strong>차박 허용을 명시한 지자체 차박지</strong> — 일부 시·군이 공영주차장이나 해안 일부 구간을 차박지로 지정해 운영합니다. "OO군 차박지"로 검색하면 공식 안내가 나옵니다.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>🚫 하면 안 되는 곳 (과태료 대상이 될 수 있어요)</h2>
        <ul>
          <li><strong>국립공원 안</strong> — 지정 야영장 밖 야영·취사는 금지입니다. 주차장에서 차박하다 적발되면 과태료 대상이에요.</li>
          <li><strong>해수욕장·하천변·공원</strong> — 많은 지자체가 조례로 야영·취사를 금지합니다. 특히 여름 해수욕장은 단속이 잦아요.</li>
          <li><strong>고속도로 휴게소·졸음쉼터</strong> — 잠깐 쉬는 곳이지 숙박 장소가 아닙니다. 취사는 당연히 안 되고, 장시간 점유도 제지받을 수 있어요.</li>
          <li><strong>사유지·농로·마을 앞</strong> — 주민에게 피해를 주는 차박이 늘면서 민원이 많아졌습니다. 양해 없이 세우지 마세요.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>🤝 차박 매너 5가지</h2>
        <ul>
          <li>엔진 공회전으로 냉난방하지 않기 — 소음·매연 민원의 1순위이고, 밀폐된 차 안 공회전은 위험합니다.</li>
          <li>쓰레기는 전부 되가져가기. 분리수거함이 없는 곳이 대부분이에요.</li>
          <li>취사는 허용된 곳에서만, 화기는 차에서 떨어진 바닥에서.</li>
          <li>아침 일찍 출발하는 사람을 위해 밤 10시 이후엔 조용히.</li>
          <li>경치 좋은 자리라고 하루 종일 점유하지 않기 — 다음 사람도 보고 싶은 풍경입니다.</li>
        </ul>
        <p class="guide-tip">👉 차박 장비가 고민이면 <a href="guide-mat.html">🛏️ 매트 비교</a>와 <a href="guide-sleeping.html">🛌 침낭 가이드</a>, 안전은 <a href="guide-safety.html">⚠️ 캠핑 안전·매너</a>를 참고하세요.</p>
      </section>`,
  },
  {
    slug: "guide-fire",
    icon: "🔥",
    title: "캠핑 화로대·불멍 규정 — 되는 캠핑장 고르는 법과 안전 수칙",
    desc: "불멍은 캠핑의 낭만이지만 아무 데서나 할 수 없습니다. 화로대 사용 가능 캠핑장을 찾는 법, 산불조심기간 규정, 꼭 지켜야 할 안전 수칙을 정리했습니다.",
    body: `
      <section class="overview">
        <h2>먼저, 그 캠핑장이 화로대를 허용하는지 확인</h2>
        <p>
          캠핑장마다 <strong>개별 화로대 사용 가능 / 공용 화로대만 / 전면 금지</strong>로 규정이 다릅니다.
          캠핑허브 상세 페이지의 <strong>화로대</strong> 항목이 바로 고캠핑 공공데이터의 공식 등록 정보예요.
          "개별 화로대 가능"이어도 바람이 강한 날이나 산불조심기간에는 현장에서 금지될 수 있으니 당일 안내를 따르세요.
        </p>
      </section>
      <section class="overview">
        <h2>🍂 산불조심기간에는 규정이 바뀝니다</h2>
        <ul>
          <li>산림청은 해마다 <strong>봄(2월~5월 중순)과 가을(11월~12월 중순)</strong>을 산불조심기간으로 정합니다. 이 기간엔 산림 인접 캠핑장이 화로대를 금지하거나 제한하는 경우가 많아요.</li>
          <li>산림 안이나 근처에서 허가 없이 불을 피우면 <strong>산림보호법 위반</strong>으로 과태료 대상이고, 산불로 번지면 형사 처벌까지 갈 수 있습니다.</li>
          <li>건조주의보·강풍주의보가 내리면 허용 캠핑장도 그날은 금지하는 게 보통입니다.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>✅ 불멍 안전 수칙</h2>
        <ul>
          <li><strong>화로대는 반드시 다리가 있는 제품</strong>으로, 바닥에 직접 불을 피우지 마세요. 잔디·데크 사이트는 바닥 보호용 내열 매트가 필수입니다.</li>
          <li>텐트·타프에서 충분히 떨어뜨리고, 바람 방향을 확인하세요. 불티가 타프에 구멍을 내는 건 흔한 일입니다.</li>
          <li><strong>물 한 통과 소화기(또는 모래)</strong>를 옆에 두고 시작하세요. 상세 페이지의 "안전 장비" 항목에서 캠핑장 소화기 비치 여부를 볼 수 있어요.</li>
          <li>장작은 캠핑장에서 파는 것을 쓰세요. 주변 나뭇가지를 꺾거나 주워 태우는 건 금지인 곳이 많습니다.</li>
          <li>잠들기 전엔 <strong>완전히 꺼서 재까지 식히기.</strong> 다음 날 아침 재는 지정된 재 버리는 곳에.</li>
          <li><strong>텐트 안에서는 절대 화기 금지.</strong> 난로·숯·가스는 일산화탄소 중독의 직접 원인입니다. 일산화탄소 경보기를 챙기세요.</li>
        </ul>
        <p class="guide-tip">👉 동계 난방 안전은 <a href="guide-safety.html">⚠️ 캠핑 안전·매너</a>, 버너 선택은 <a href="guide-burner.html">🔥 버너 비교</a>를 참고하세요.</p>
      </section>`,
  },
  {
    slug: "guide-holiday",
    icon: "🗓️",
    title: "연휴 캠핑 예약 타이밍 — 빨간날 캠핑장 잡는 현실적인 방법",
    desc: "연휴 캠핑장은 예약이 열리는 순간 마감됩니다. 예약 오픈 시점을 잡는 법, 취소표 노리는 타이밍, 그래도 안 되면 쓰는 대안까지 정리했습니다.",
    body: `
      <section class="overview">
        <h2>연휴 자리는 "오픈 당일"에 결정됩니다</h2>
        <p>
          휴양림·국립공원·인기 공영 캠핑장은 연휴 주말 사이트가 <strong>예약이 열리는 날 몇 분 안에</strong> 마감됩니다.
          그래서 연휴 캠핑의 핵심은 장비도 장소도 아니라 <strong>예약 오픈 날짜를 아는 것</strong>이에요.
          캠핑허브 메인 상단의 "다음 빨간날 D-day"를 보고, 그 연휴가 포함된 달의 예약 오픈일을 역산해 두세요.
        </p>
      </section>
      <section class="overview">
        <h2>1️⃣ 오픈 날짜를 미리 적어 두기</h2>
        <ul>
          <li>휴양림·공영 캠핑장은 대개 <strong>매달 같은 날, 같은 시각</strong>에 다음 달(또는 다다음 달) 예약을 엽니다. 가려는 캠핑장 공지에서 오픈 규칙을 확인하고 달력에 알림을 걸어 두세요.</li>
          <li>국립공원 야영장은 성수기에 추첨제를 쓰는 곳이 있습니다. 추첨 신청 기간을 놓치면 끝이에요.</li>
          <li>회원가입·결제수단 등록은 <strong>오픈 전날까지</strong> 끝내 두세요. 오픈 시각에 가입하다 놓치는 경우가 정말 많습니다.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>2️⃣ 놓쳤다면 취소표를 노리기</h2>
        <ul>
          <li>취소표는 <strong>연휴 1~2주 전</strong>(계획 변경)과 <strong>2~3일 전</strong>(취소 수수료가 커지기 직전)에 많이 나옵니다.</li>
          <li>예약 시스템을 하루 두세 번 새로고침하는 것만으로도 잡히는 경우가 있어요. 아침 출근 전, 점심, 밤 10시 전후가 취소가 몰리는 시간대입니다.</li>
          <li>일부 플랫폼은 빈자리 알림 기능이 있습니다. 있다면 꼭 켜 두세요.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>3️⃣ 그래도 안 되면 — 현실적인 대안</h2>
        <ul>
          <li><strong>연휴 첫날 대신 마지막 날 1박</strong> — 돌아가는 날 밤은 비는 곳이 많습니다.</li>
          <li><strong>덜 알려진 지역</strong> — 수도권 1시간 거리는 전쟁터지만, 2시간 넘어가면 여유가 생깁니다. 캠핑허브 지역 페이지에서 사진 있는 곳 위주로 골라 보세요.</li>
          <li><strong>민간 캠핑장·글램핑</strong> — 공영보다 비싸지만 자리는 남아 있는 편입니다. <a href="theme-glamping.html">⛺ 글램핑</a>은 장비 없이도 가능해 연휴 급조 캠핑에 좋아요.</li>
          <li><strong>자동차야영장·차박</strong> — 텐트 사이트보다 경쟁이 덜한 곳이 있습니다. <a href="theme-carcamping.html">🚗 차박·오토캠핑장</a>을 확인해 보세요.</li>
        </ul>
        <p class="guide-tip">👉 예약 창구별 방법과 취소 규정은 <a href="guide-reserve.html">📅 캠핑장 예약 방법 총정리</a>에 정리했습니다.</p>
      </section>`,
  }
);


// ─── 장비 비교 가이드 시리즈 (유형별 비교 — 특정 제품/가격 비교는 데이터 출처가 없어 안 함) ───
GUIDE_PAGES.push(
  {
    slug: "guide-compare",
    icon: "📚",
    title: "캠핑 장비 비교 가이드 모음",
    desc: "텐트부터 타프까지 — 캠핑 장비 8종을 유형별로 비교하고 나에게 맞는 것을 고르는 가이드 모음.",
    body: `
      <section class="overview">
        <h2>장비 고민, 여기서 한 번에</h2>
        <p>
          캠핑 장비는 종류마다 "유형"이 나뉘고, 유형만 잘 골라도 절반은 성공입니다.
          아래에서 고민 중인 장비를 골라보세요. 각 가이드에 <strong>한눈 비교표</strong>와
          <strong>상황별 추천</strong>이 들어 있습니다.
        </p>
      </section>
      <section class="overview">
        <h2>🛖 잠자리 — 만족도의 80%</h2>
        <ul>
          <li><a href="guide-tent.html">⛺ 텐트 비교</a> — 원터치 vs 돔 vs 터널(거실형) vs 쉘터</li>
          <li><a href="guide-mat.html">🛏️ 매트 비교</a> — 발포 vs 자충 vs 에어 vs 야전침대 (초보가 가장 많이 놓치는 장비!)</li>
          <li><a href="guide-sleeping.html">🌙 침낭 비교</a> — 사각 vs 머미, 솜 vs 다운, 계절별 온도</li>
        </ul>
      </section>
      <section class="overview">
        <h2>🍳 생활 — 먹고 쉬는 시간</h2>
        <ul>
          <li><a href="guide-chair.html">🪑 캠핑의자 비교</a> — 경량 vs 로우 vs 릴렉스(하이백)</li>
          <li><a href="guide-burner.html">🔥 버너·화로대 비교</a> — 이소가스 vs 부탄 vs 화로대</li>
          <li><a href="guide-cooler.html">🧊 아이스박스 비교</a> — 하드 vs 소프트, 보냉력의 진실</li>
        </ul>
      </section>
      <section class="overview">
        <h2>☀️ 환경 — 날씨와의 싸움</h2>
        <ul>
          <li><a href="guide-tarp.html">⛱️ 타프 비교</a> — 헥사 vs 렉타 vs 타프쉘</li>
          <li><a href="guide-lantern.html">💡 랜턴·조명 비교</a> — 충전식 LED vs 가스 vs 감성 조명</li>
        </ul>
        <p class="guide-tip">👉 장비를 처음 사신다면 <a href="guide-beginner.html">🔰 첫 캠핑 체크리스트</a>와
          <a href="guide-gear.html">💰 예산별 장비 가이드</a>부터 읽어보세요. 순서가 잡힙니다.</p>
      </section>`,
  },
  {
    slug: "guide-tent",
    icon: "⛺",
    title: "텐트 비교 — 원터치 vs 돔 vs 터널 vs 쉘터",
    desc: "텐트 4가지 유형을 설치 난이도·공간·무게·가격대로 비교하고, 첫 텐트로 뭘 사야 하는지 알려드립니다.",
    body: `
      <section class="overview">
        <h2>한눈 비교표</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>유형</th><th>설치</th><th>공간</th><th>무게·부피</th><th>이런 분께</th></tr>
          <tr><td>원터치·팝업</td><td>★☆☆ 매우 쉬움</td><td>좁음</td><td>가벼움</td><td>첫 캠핑, 아이 동반 나들이</td></tr>
          <tr><td>돔텐트</td><td>★★☆ 쉬움</td><td>보통</td><td>보통</td><td>입문 정석, 2~4인 가족</td></tr>
          <tr><td>터널형(거실형)</td><td>★★★ 어려움</td><td>넓음(거실+침실)</td><td>무겁고 큼</td><td>월 2회 이상, 장박파</td></tr>
          <tr><td>쉘터+이너</td><td>★★★ 어려움</td><td>매우 넓음</td><td>무거움</td><td>동계 캠핑, 확장파</td></tr>
        </table></div>
        <div class="guide-figure">
          <svg viewBox="0 0 660 140" role="img" aria-label="텐트 4가지 유형 실루엣 비교">
            <g>
              <path d="M15 95 Q80 45 145 95 Z" fill="#e8edf9" stroke="#4756c9" stroke-width="2" stroke-linejoin="round"/>
              <path d="M62 95 Q80 68 98 95 Z" fill="#fff" stroke="#4756c9" stroke-width="1.5"/>
              <text x="80" y="120" text-anchor="middle" font-size="13" fill="#555">원터치·팝업</text>
              <text x="80" y="135" text-anchor="middle" font-size="11" fill="#999">낮고 간단</text>
            </g>
            <g transform="translate(165,0)">
              <path d="M15 95 Q80 18 145 95 Z" fill="#e8edf9" stroke="#4756c9" stroke-width="2" stroke-linejoin="round"/>
              <path d="M15 95 Q80 18 145 95" fill="none" stroke="#4756c9" stroke-width="1.5" stroke-dasharray="5 4" transform="translate(0,-6) scale(1,0.92) translate(0,8)"/>
              <path d="M60 95 Q80 62 100 95 Z" fill="#fff" stroke="#4756c9" stroke-width="1.5"/>
              <text x="80" y="120" text-anchor="middle" font-size="13" fill="#555">돔텐트</text>
              <text x="80" y="135" text-anchor="middle" font-size="11" fill="#999">교차 폴 2~3개</text>
            </g>
            <g transform="translate(330,0)">
              <path d="M15 95 L15 60 Q15 28 50 28 L110 28 Q145 28 145 60 L145 95 Z" fill="#e8edf9" stroke="#4756c9" stroke-width="2" stroke-linejoin="round"/>
              <line x1="58" y1="28" x2="58" y2="95" stroke="#4756c9" stroke-width="1.2" stroke-dasharray="4 4"/>
              <line x1="102" y1="28" x2="102" y2="95" stroke="#4756c9" stroke-width="1.2" stroke-dasharray="4 4"/>
              <text x="80" y="120" text-anchor="middle" font-size="13" fill="#555">터널형(거실형)</text>
              <text x="80" y="135" text-anchor="middle" font-size="11" fill="#999">거실+침실 구조</text>
            </g>
            <g transform="translate(495,0)">
              <path d="M15 95 L80 12 L145 95 Z" fill="#e8edf9" stroke="#4756c9" stroke-width="2" stroke-linejoin="round"/>
              <path d="M63 95 L80 60 L97 95 Z" fill="#fff" stroke="#4756c9" stroke-width="1.5"/>
              <text x="80" y="120" text-anchor="middle" font-size="13" fill="#555">쉘터</text>
              <text x="80" y="135" text-anchor="middle" font-size="11" fill="#999">높고 큼 (이너 별도)</text>
            </g>
          </svg>
        </div>
      </section>
      <section class="overview">
        <h2>유형별 핵심 정리</h2>
        <ul>
          <li><strong>원터치·팝업</strong> — 던지면 펴집니다. 대신 접는 법을 꼭 미리 연습하세요(현장에서 당황 1순위). 비바람에 약한 편이라 한여름 폭우·동계에는 부적합.</li>
          <li><strong>돔텐트</strong> — 폴대 2~3개를 교차하는 기본형. 설치 10~15분, 바람에 강하고 가격 대비 성능이 좋아 <strong>첫 텐트의 정석</strong>입니다.</li>
          <li><strong>터널형(거실형)</strong> — 거실 공간이 생겨 의자·테이블을 안에 둘 수 있습니다. 대신 설치 30분+, 혼자 치기 힘들고 차 트렁크를 많이 차지합니다.</li>
          <li><strong>쉘터+이너텐트</strong> — 큰 껍데기 안에 침실을 넣는 방식. 동계 난방에 유리하지만 초보 단계에선 아직 필요 없습니다.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>고르는 기준 3가지</h2>
        <ul>
          <li><strong>인원+1</strong> — 2인이면 3인용. 짐이 생각보다 많습니다.</li>
          <li><strong>설치 시간</strong> — 도착이 늦으면 어두워서 칩니다. 초보일수록 쉬운 텐트가 정답.</li>
          <li><strong>차 트렁크</strong> — 사기 전에 수납 크기(가로 길이)를 트렁크와 비교해 보세요.</li>
        </ul>
        <p class="guide-tip">💡 <strong>결론</strong>: 첫 텐트는 <strong>돔텐트</strong>(가성비·범용성) 또는
          <strong>원터치</strong>(편함 최우선)를 추천합니다. 거실형은 캠핑이 취미로 굳은 뒤에 사도 늦지 않아요.
          예산 배분은 <a href="guide-gear.html">💰 예산별 장비 가이드</a> 참고.</p>
      </section>`,
  },
  {
    slug: "guide-chair",
    icon: "🪑",
    title: "캠핑의자 비교 — 경량 vs 로우 vs 릴렉스",
    desc: "캠핑의자 3가지 유형을 편안함·휴대성·용도로 비교합니다. 불멍용 로우체어부터 낮잠용 릴렉스체어까지.",
    body: `
      <section class="overview">
        <h2>한눈 비교표</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>유형</th><th>편안함</th><th>휴대성</th><th>특징</th><th>이런 분께</th></tr>
          <tr><td>경량(백패킹) 체어</td><td>★★☆</td><td>★★★ 1kg 안팎</td><td>조립식, 컴팩트</td><td>짐 최소화, 뚜벅이</td></tr>
          <tr><td>로우체어</td><td>★★☆</td><td>★★☆</td><td>낮은 시야, 불멍 최적</td><td>화로대·감성 캠핑</td></tr>
          <tr><td>릴렉스·하이백 체어</td><td>★★★ 목까지 지지</td><td>★☆☆ 크고 무거움</td><td>젖혀서 낮잠 가능</td><td>오토캠핑, 휴식 최우선</td></tr>
        </table></div>
      </section>
      <section class="overview">
        <h2>유형별 핵심 정리</h2>
        <ul>
          <li><strong>경량 체어</strong> — 조립식 프레임에 천을 씌우는 방식. 백팩에 들어갈 정도로 작지만, 조립이 귀찮고 장시간 앉으면 허리가 아쉽습니다.</li>
          <li><strong>로우체어</strong> — 앉은키가 낮아 화로대·모닥불과 눈높이가 맞습니다. 테이블도 로우 테이블로 맞춰야 편해요.</li>
          <li><strong>릴렉스(하이백) 체어</strong> — 머리까지 기대고 각도 조절이 되는 것도 있습니다. 한 번 앉으면 못 일어난다는 게 단점이자 장점.</li>
        </ul>
        <p class="guide-tip">💡 <strong>실전 팁</strong>: 의자는 매장에서든 친구 것이든 <strong>10분 이상 앉아보고</strong> 사는 게
          제일 확실합니다. 캠핑에서 의자에 앉아 있는 시간이 하루 5시간이 넘어요 — 싼 의자로 대충 사면 가장 후회하는 장비 1순위입니다.</p>
      </section>
      ${COUPANG_ITEMS.length ? `
      <section class="overview coupang-section">
        <h2>🛒 쿠팡에서 둘러보기</h2>
        <div class="dir-buttons">
          ${COUPANG_ITEMS.filter((i) => i.name.includes("의자")).map((i) => `<a class="dir-btn coupang" target="_blank" rel="noopener sponsored" href="${esc(i.url)}">${esc(i.name)}</a>`).join("")}
        </div>
        <p class="coupang-notice">이 섹션은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
      </section>` : ""}
      <section class="overview">
        <h2>같이 보면 좋은 가이드</h2>
        <p class="guide-tip">👉 <a href="guide-compare.html">📚 장비 비교 모음</a> ·
          <a href="guide-tent.html">⛺ 텐트 비교</a> · <a href="guide-gear.html">💰 예산별 장비</a></p>
      </section>`,
  },
  {
    slug: "guide-mat",
    icon: "🛏️",
    title: "캠핑 매트 비교 — 발포 vs 자충 vs 에어 vs 야전침대",
    desc: "캠핑의 숙면을 결정하는 매트 4종 비교. 초보가 가장 많이 놓치는 장비, 매트 고르는 법.",
    body: `
      <section class="overview">
        <h2>매트가 침낭보다 중요합니다</h2>
        <p>
          바닥의 냉기는 <strong>아래에서</strong> 올라옵니다. 아무리 좋은 침낭도 매트가 부실하면
          등이 시려서 잠을 못 자요. 캠핑 후기에서 "추워서 혼났다"의 절반은 사실 매트 문제입니다.
        </p>
      </section>
      <section class="overview">
        <h2>한눈 비교표</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>유형</th><th>푹신함</th><th>단열</th><th>부피</th><th>특징</th></tr>
          <tr><td>발포 매트</td><td>★☆☆</td><td>★★☆</td><td>크지만 가벼움</td><td>싸고 튼튼, 펑크 걱정 없음</td></tr>
          <tr><td>자충 매트</td><td>★★☆</td><td>★★★</td><td>보통</td><td>밸브 열면 스스로 부풀음, 가성비 최고</td></tr>
          <tr><td>에어 매트</td><td>★★★</td><td>★★☆</td><td>작음</td><td>침대급 푹신함, 펌프 필요·펑크 주의</td></tr>
          <tr><td>야전침대(코트)</td><td>★★★</td><td>★★★ 바닥과 분리</td><td>큼</td><td>지면 요철 무시, 여름 시원·겨울은 밑에 매트 추가</td></tr>
        </table></div>
      </section>
      <section class="overview">
        <h2>고르는 팁</h2>
        <ul>
          <li>첫 캠핑: <strong>발포 매트</strong>로 시작해도 됩니다 (깔개 겸용).</li>
          <li>계속 다닐 것 같다: <strong>자충 매트(두께 5cm 이상)</strong>가 가성비 정답.</li>
          <li>허리가 예민하다: 에어 매트나 야전침대로 — 대신 에어는 <strong>수리 패치</strong>를 꼭 챙기세요.</li>
          <li>겨울엔 유형과 무관하게 <strong>바닥 단열(발포 매트 겹치기)</strong>을 추가하는 게 안전합니다.</li>
        </ul>
        <p class="guide-tip">👉 잠자리 3종 세트: <a href="guide-tent.html">⛺ 텐트</a> ·
          <a href="guide-sleeping.html">🌙 침낭</a> · <a href="guide-compare.html">📚 전체 비교 모음</a></p>
      </section>`,
  },
  {
    slug: "guide-sleeping",
    icon: "🌙",
    title: "침낭 비교 — 사각 vs 머미, 솜 vs 다운",
    desc: "침낭 모양과 충전재별 비교, 계절별로 어떤 침낭이 필요한지 알려드립니다.",
    body: `
      <section class="overview">
        <h2>모양: 사각 vs 머미</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>모양</th><th>보온</th><th>활동성</th><th>특징</th></tr>
          <tr><td>사각(봉투형)</td><td>★★☆</td><td>★★★ 이불처럼 넓음</td><td>지퍼 다 열면 이불로, 커플은 2개 연결 가능</td></tr>
          <tr><td>머미(미라형)</td><td>★★★ 몸에 밀착</td><td>★☆☆ 답답할 수 있음</td><td>머리까지 감싸 동계에 유리, 부피 작음</td></tr>
        </table></div>
      </section>
      <section class="overview">
        <h2>충전재: 솜 vs 다운</h2>
        <ul>
          <li><strong>솜(화학솜)</strong> — 저렴하고 물에 젖어도 어느 정도 보온 유지, 세탁도 편합니다. 대신 부피가 큽니다. <strong>초보는 솜으로 충분</strong>합니다.</li>
          <li><strong>다운(오리·거위털)</strong> — 같은 보온력에 훨씬 가볍고 작게 압축되지만 비싸고, 젖으면 보온력이 급락합니다. 동계·백패킹 단계에서 고려하세요.</li>
        </ul>
      </section>
      <section class="overview">
        <h2>계절 기준 (내한온도 읽는 법)</h2>
        <ul>
          <li>침낭의 <strong>"쾌적 온도"</strong>를 보세요 — "극한 온도"는 생존 기준이라 그 온도에선 춥습니다.</li>
          <li>여름: 얇은 사각 침낭이나 이불로 충분.</li>
          <li>봄·가을: 쾌적 온도 <strong>5℃ 안팎</strong>의 3계절 침낭 — 가장 활용도가 높습니다.</li>
          <li>겨울: 쾌적 온도 영하 침낭 + 전용 장비 필요. 초보는 겨울 캠핑 전에 <a href="guide-safety.html">⚠️ 안전 가이드</a>부터 꼭 읽으세요(일산화탄소).</li>
        </ul>
        <p class="guide-tip">💡 밤 기온은 일기예보 최저기온보다 <strong>강가·산속에서 2~3℃ 더 낮다</strong>고
          생각하고 준비하면 실패가 없습니다. 매트가 부실하면 침낭이 소용없으니 <a href="guide-mat.html">🛏️ 매트 비교</a>도 함께 보세요.</p>
      </section>`,
  },
  {
    slug: "guide-lantern",
    icon: "💡",
    title: "랜턴·조명 비교 — 충전식 LED vs 가스 vs 감성 조명",
    desc: "캠핑 조명 3종 비교와 조명 배치 요령. 메인 랜턴 하나로는 부족한 이유.",
    body: `
      <section class="overview">
        <h2>한눈 비교표</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>유형</th><th>밝기</th><th>안전</th><th>유지비</th><th>특징</th></tr>
          <tr><td>충전식 LED</td><td>★★★</td><td>★★★ 텐트 안 OK</td><td>충전만</td><td>초보 정석. 보조배터리 겸용 제품도 있음</td></tr>
          <tr><td>가스 랜턴</td><td>★★☆</td><td>★☆☆ 화기 — 텐트 안 금지</td><td>가스 소모</td><td>따뜻한 불빛의 감성, 관리 필요</td></tr>
          <tr><td>스트링 라이트·무드등</td><td>★☆☆</td><td>★★★</td><td>충전/건전지</td><td>사이트 분위기용 보조 조명</td></tr>
        </table></div>
      </section>
      <section class="overview">
        <h2>조명 배치의 기본 공식</h2>
        <ul>
          <li><strong>메인 1</strong> — 테이블 위나 타프 폴에 거는 밝은 LED 랜턴.</li>
          <li><strong>텐트 안 1</strong> — 작은 LED (화기 절대 금지 구역입니다).</li>
          <li><strong>이동용 1</strong> — 헤드랜턴 또는 손전등. 밤에 화장실 갈 때 두 손이 자유로운 헤드랜턴이 진리입니다.</li>
        </ul>
        <div class="guide-figure">
          <svg viewBox="0 0 440 190" role="img" aria-label="캠핑 사이트 조명 3점 배치도">
            <rect x="8" y="8" width="424" height="150" rx="12" fill="#eef4ec" stroke="#c9d6c5"/>
            <path d="M40 110 L85 55 L130 110 Z" fill="#e8edf9" stroke="#4756c9" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="85" cy="92" r="7" fill="#ffe9a8" stroke="#e0a800"/>
            <text x="85" y="130" text-anchor="middle" font-size="12" fill="#555">텐트 안 미니 LED</text>
            <rect x="205" y="75" width="70" height="38" rx="6" fill="#fff" stroke="#a58a64" stroke-width="2"/>
            <line x1="240" y1="30" x2="240" y2="58" stroke="#888" stroke-width="3"/>
            <circle cx="240" cy="58" r="10" fill="#ffe9a8" stroke="#e0a800" stroke-width="2"/>
            <circle cx="240" cy="58" r="18" fill="#ffe9a8" opacity="0.35"/>
            <text x="240" y="130" text-anchor="middle" font-size="12" fill="#555">메인 랜턴 — 높이 걸기</text>
            <circle cx="360" cy="70" r="6" fill="#ffe9a8" stroke="#e0a800"/>
            <path d="M356 78 L364 78 L366 100 L354 100 Z" fill="#cfd6e4" stroke="#8a93a8"/>
            <path d="M366 60 Q380 50 392 58" fill="none" stroke="#e0a800" stroke-width="1.5" stroke-dasharray="3 3"/>
            <text x="362" y="130" text-anchor="middle" font-size="12" fill="#555">이동은 헤드랜턴</text>
            <text x="220" y="178" text-anchor="middle" font-size="12" fill="#888">💡 랜턴은 높이 걸수록 벌레가 위로 모입니다</text>
          </svg>
        </div>
        <p class="guide-tip">💡 랜턴을 <strong>바닥에 두면 벌레가 모입니다</strong> — 높이 걸수록 벌레가 위로 가요.
          여름엔 메인 랜턴을 테이블에서 조금 떨어진 곳에 걸어두는 것도 요령입니다.</p>
      </section>
      <section class="overview">
        <h2>같이 보면 좋은 가이드</h2>
        <p class="guide-tip">👉 <a href="guide-compare.html">📚 장비 비교 모음</a> ·
          <a href="guide-safety.html">⚠️ 안전·매너 (화기 사용)</a></p>
      </section>`,
  },
  {
    slug: "guide-burner",
    icon: "🔥",
    title: "버너·화로대 비교 — 캠핑 요리와 불멍 장비",
    desc: "이소가스 vs 부탄 버너, 그리고 화로대 고르는 법. 캠핑 요리와 불멍을 위한 화기 가이드.",
    body: `
      <section class="overview">
        <h2>버너 비교</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>유형</th><th>화력</th><th>휴대성</th><th>연료</th><th>특징</th></tr>
          <tr><td>부탄 버너(가정용 스타일)</td><td>★★★</td><td>★☆☆</td><td>부탄캔 — 싸고 어디서나 구함</td><td>익숙하고 큰 팬 사용 가능. 추우면 화력 급락</td></tr>
          <tr><td>이소가스 버너(캠핑용)</td><td>★★☆</td><td>★★★ 손바닥 크기</td><td>이소가스 — 비싸지만 저온에 강함</td><td>미니멀·백패킹용. 바람막이 필요</td></tr>
        </table></div>
        <p>
          오토캠핑 요리는 <strong>부탄 버너</strong>가 편하고, 간단한 라면·커피 위주라면
          <strong>이소가스 버너</strong>가 짐을 확 줄여줍니다. 봄가을 아침처럼 쌀쌀할 땐
          부탄캔 화력이 약해지니 캔을 품에 데워 쓰는 요령도 알아두세요.
        </p>
      </section>
      <section class="overview">
        <h2>화로대(불멍) 고르는 법</h2>
        <ul>
          <li><strong>접이식 스테인리스</strong> — 가볍고 저렴한 입문형. 바닥 재받침이 있는지 확인하세요.</li>
          <li><strong>거치형(그릴 겸용)</strong> — 바베큐까지 하려면 석쇠 높이 조절이 되는 것으로.</li>
          <li>화로대는 <strong>소모품</strong>입니다 — 열 변형이 생기니 첫 화로대는 비싼 걸 살 필요 없어요.</li>
          <li>장작은 캠핑장 매점에서 사는 게 보통이고, 젖은 장작은 연기만 납니다.</li>
        </ul>
        <p class="guide-tip">⚠️ <strong>안전 필수</strong>: 텐트 안 화기 사용 금지, 잔불 정리, 바람 강한 날 불멍 포기 —
          자세한 내용은 <a href="guide-safety.html">⚠️ 안전·매너 가이드</a>에 있습니다. 꼭 읽어주세요.</p>
      </section>`,
  },
  {
    slug: "guide-cooler",
    icon: "🧊",
    title: "아이스박스 비교 — 하드 vs 소프트, 보냉의 기술",
    desc: "하드 쿨러와 소프트 쿨러 비교, 그리고 보냉력을 두 배로 늘리는 얼음 사용법.",
    body: `
      <section class="overview">
        <h2>한눈 비교표</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>유형</th><th>보냉력</th><th>무게</th><th>수납</th><th>이런 분께</th></tr>
          <tr><td>소프트 쿨러(가방형)</td><td>★☆☆ 반나절~1일</td><td>가벼움</td><td>접어서 보관</td><td>당일·1박, 짐 최소화</td></tr>
          <tr><td>하드 쿨러(일반)</td><td>★★☆ 1~2일</td><td>보통</td><td>부피 큼</td><td>1박 2일 오토캠핑 표준</td></tr>
          <tr><td>하드 쿨러(고급 로토몰드)</td><td>★★★ 2~4일</td><td>매우 무거움</td><td>부피 큼</td><td>장박·여름 연박</td></tr>
        </table></div>
      </section>
      <section class="overview">
        <h2>보냉력을 두 배로 만드는 요령 (장비보다 중요!)</h2>
        <ul>
          <li><strong>얼린 생수병</strong>을 얼음 대신 — 녹아도 마실 수 있고 물바다가 안 됩니다.</li>
          <li>출발 전날 <strong>쿨러 자체를 미리 차게</strong> (얼음 넣어 예냉) 해두면 지속시간이 크게 늘어요.</li>
          <li>음식은 <strong>얼릴 수 있는 건 다 얼려서</strong> 넣기 — 고기는 자연 해동되며 보냉제 역할.</li>
          <li>뚜껑을 여는 횟수가 보냉의 최대 적 — 음료용과 식재료용을 <strong>분리</strong>하면 좋습니다.</li>
          <li>쿨러는 <strong>그늘 + 바닥에서 띄워서</strong> (의자나 받침 위) 보관.</li>
        </ul>
        <p class="guide-tip">💡 1박 2일이라면 비싼 쿨러보다 <strong>위 요령 + 보통 하드 쿨러</strong>면 충분합니다.
          👉 <a href="guide-compare.html">📚 장비 비교 모음</a> · <a href="guide-beginner.html">🔰 첫 캠핑 체크리스트</a></p>
      </section>`,
  },
  {
    slug: "guide-tarp",
    icon: "⛱️",
    title: "타프 비교 — 헥사 vs 렉타 vs 타프쉘",
    desc: "그늘과 비를 책임지는 타프 3종 비교. 처음엔 타프 없이 시작해도 되는 이유까지.",
    body: `
      <section class="overview">
        <h2>타프, 꼭 필요할까?</h2>
        <p>
          결론부터: <strong>첫 캠핑엔 없어도 됩니다.</strong> 나무 그늘 사이트를 고르거나
          거실형 텐트라면 타프 역할을 대신합니다. 다만 한여름 뙤약볕과 갑작스러운 비를
          겪어보면 왜 다들 타프를 치는지 알게 되죠.
        </p>
      </section>
      <section class="overview">
        <h2>한눈 비교표</h2>
        <div class="table-wrap"><table class="guide-table">
          <tr><th>유형</th><th>그늘 면적</th><th>설치</th><th>바람 저항</th><th>특징</th></tr>
          <tr><td>헥사(육각)</td><td>★★☆</td><td>★★☆ 폴 2개</td><td>★★★ 유선형</td><td>모양 예쁘고 바람에 강한 표준형</td></tr>
          <tr><td>렉타(사각)</td><td>★★★ 최대</td><td>★★☆ 폴 4~6개</td><td>★★☆</td><td>그늘 면적 최고, 여러 명일 때</td></tr>
          <tr><td>타프쉘·스크린</td><td>★★★ 벽 있음</td><td>★☆☆ 어려움</td><td>★★★</td><td>모기장·바람막이 겸용, 봄가을 유리</td></tr>
        </table></div>
      </section>
      <section class="overview">
        <h2>설치 팁</h2>
        <ul>
          <li>타프는 <strong>해의 방향</strong>을 보고 칩니다 — 오후 해가 넘어오는 쪽을 낮게.</li>
          <li>비 올 땐 <strong>한쪽을 낮게 기울여</strong> 물길을 만들어 주세요. 평평하면 물이 고여 무너집니다.</li>
          <li>바람 강한 날은 낮게 치거나 접는 게 안전 — 타프가 돛이 되면 폴이 날아갑니다.</li>
        </ul>
        <div class="guide-figure">
          <svg viewBox="0 0 440 170" role="img" aria-label="비 올 때 타프를 기울여 치는 방법">
            <line x1="10" y1="140" x2="430" y2="140" stroke="#a58a64" stroke-width="3"/>
            <line x1="70" y1="140" x2="70" y2="35" stroke="#888" stroke-width="4"/>
            <line x1="340" y1="140" x2="340" y2="85" stroke="#888" stroke-width="4"/>
            <path d="M70 35 Q210 55 340 85" fill="none" stroke="#4756c9" stroke-width="4" stroke-linecap="round"/>
            <g stroke="#7fa7d9" stroke-width="2" stroke-linecap="round">
              <line x1="150" y1="12" x2="144" y2="32"/>
              <line x1="210" y1="8" x2="204" y2="28"/>
              <line x1="270" y1="14" x2="264" y2="34"/>
            </g>
            <path d="M348 92 Q360 110 356 132" fill="none" stroke="#7fa7d9" stroke-width="2.5" stroke-dasharray="4 3" marker-end="none"/>
            <circle cx="356" cy="136" r="3" fill="#7fa7d9"/>
            <text x="70" y="160" text-anchor="middle" font-size="12" fill="#555">높은 폴</text>
            <text x="340" y="160" text-anchor="middle" font-size="12" fill="#555">낮은 폴</text>
            <text x="392" y="120" text-anchor="middle" font-size="12" fill="#4756c9">물길 ↓</text>
            <text x="210" y="80" text-anchor="middle" font-size="12" fill="#888">한쪽을 낮게 → 비가 고이지 않음</text>
          </svg>
        </div>
        <p class="guide-tip">👉 <a href="guide-compare.html">📚 장비 비교 모음</a> ·
          <a href="guide-tent.html">⛺ 텐트 비교</a> · <a href="guide-safety.html">⚠️ 안전·매너</a></p>
      </section>`,
  }
);

// 인기 상품 데이터 (products.json — 현재는 비활성. 네이버 쇼핑 API가 2026-07-31 폐지되어
// 쿠팡 파트너스 API 승인(누적 판매 150만원) 후 수집 스크립트를 만들면 이 섹션이 다시 켜짐)
let PRODUCTS = null;
try {
  PRODUCTS = JSON.parse(fs.readFileSync("products.json", "utf-8"));
} catch {}

// 가이드 페이지 하단 "오늘의 인기 상품" 섹션 (products.json 있을 때만 렌더링)
function productSection(slug) {
  const list = PRODUCTS?.categories?.[slug];
  if (!list || !list.length) return "";
  return `
      <section class="overview">
        <h2>🛍️ 오늘의 인기 상품 <span class="product-updated">${esc(PRODUCTS.updated || "")} 기준</span></h2>
        <div class="nearby-row">${list
          .map(
            (p) => `
          <a class="nearby-card shop-link" target="_blank" rel="noopener nofollow" href="${esc(p.link)}">
            ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" />` : `<div class="nearby-noimg">🛍️</div>`}
            <div class="nearby-name">${esc(p.title)}</div>
            <div class="product-price">${p.lprice ? p.lprice.toLocaleString() + "원~" : ""}</div>
            <div class="product-mall">${esc(p.mall || "네이버쇼핑")}</div>
          </a>`
          )
          .join("")}</div>
        <p class="product-notice">네이버쇼핑 인기순 검색 결과이며 가격은 최저가 기준으로 매일 갱신됩니다. 실제 판매가는 판매처 사정에 따라 다를 수 있어요.</p>
      </section>`;
}

const guideFiles = [];
for (const g of GUIDE_PAGES) {
  const filename = `${g.slug}.html`;
  // ★★☆ 텍스트 별점을 컬러 게이지 바로 변환 (표가 한눈에 읽히게)
  const gauge = (n) => `<span class="gauge"><i style="width:${Math.round((n / 3) * 100)}%"></i></span>`;
  const bodyHtml = g.body.replace(/★★★/g, gauge(3)).replace(/★★☆/g, gauge(2)).replace(/★☆☆/g, gauge(1));
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
  <link rel="stylesheet" href="style.css" />${reportHead("")}
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>${g.icon} ${esc(g.title)}</h1>
    <p class="home-link"><a href="index.html">← 전체 캠핑장 보기</a></p>
  </header>
  <main class="detail-container">
    <div class="detail-body guide-body">
      ${bodyHtml}
      ${productSection(g.slug)}
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
  `${SITE_URL}/privacy.html`,
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
