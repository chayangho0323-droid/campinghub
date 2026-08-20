// app.js — campings.json을 읽어서 캠핑장 카드를 그리는 코드 (FestivalHub app.js 구조 재활용)

const listEl = document.getElementById("camping-list");
const searchEl = document.getElementById("search-input");
const regionEl = document.getElementById("region-filter");
const typeEl = document.getElementById("type-filter");
const onlyPetEl = document.getElementById("only-pet");
const onlyFavEl = document.getElementById("only-fav");
const countEl = document.getElementById("result-count");

let allCampings = [];

// ─── 지역 정규화 (build-pages.js와 같은 표. 수정 시 양쪽 다!) ───
// 고캠핑 데이터는 "강원도"와 "강원특별자치도"가 섞여 있어서 통일이 필요
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

// 휴양림·국공립 여부 (테마 분류용)
function isForest(c) {
  return (
    c.name.includes("휴양림") ||
    ["국립", "공립", "지자체", "자연휴양림", "국립공원", "국민여가"].includes(c.operator)
  );
}

// ─── 찜하기 (localStorage) ───
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("camp-favorites")) || [];
  } catch {
    return [];
  }
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  localStorage.setItem("camp-favorites", JSON.stringify(favs));
}

// ─── 카드 그리기 ───
function render() {
  const keyword = searchEl.value.trim().toLowerCase();
  const region = regionEl.value;
  const type = typeEl.value;
  const favorites = getFavorites();

  let shown = allCampings.filter((c) => {
    const matchKeyword = !keyword || c.name.toLowerCase().includes(keyword);
    const matchRegion = !region || getRegion(c) === region;
    const matchType = !type || (c.type || "").includes(type);
    const matchPet = !onlyPetEl.checked || (c.pet || "").startsWith("가능");
    const matchFav = !onlyFavEl.checked || favorites.includes(c.contentId);
    return matchKeyword && matchRegion && matchType && matchPet && matchFav;
  });

  // 정렬용 이름: "(주)", "(에드203)", "농업회사법인" 같은 접두어를 떼고 실제 이름 기준으로
  const sortName = (s) =>
    s
      .replace(/^[\(（][^\)）]*[\)）]\s*/, "")
      .replace(/^㈜\s*/, "")
      .replace(/^(주식회사|유한회사|농업회사법인|영농조합법인)\s*/, "")
      .trim();

  // 사진 있는 캠핑장을 먼저 보여주고 (첫 화면 인상), 그 안에서 가나다순
  shown.sort((a, b) => {
    const aImg = a.image ? 0 : 1;
    const bImg = b.image ? 0 : 1;
    if (aImg !== bImg) return aImg - bImg;
    return sortName(a.name).localeCompare(sortName(b.name), "ko");
  });
  countEl.textContent = `${shown.length}개의 캠핑장`;

  // 결과가 하나도 없을 때: 제보 동기가 가장 높은 순간이라 제보 버튼을 크게 안내
  if (shown.length === 0) {
    listEl.innerHTML = `
      <div class="empty-result">
        <p class="empty-title">🔍 조건에 맞는 캠핑장이 없습니다</p>
        <p class="empty-desc">검색어나 필터를 바꿔보세요.<br />
        혹시 <strong>알고 계신 캠핑장인데 여기 없나요?</strong></p>
        <a class="report-btn big" href="https://forms.gle/xpe2ywAmuXH7tzG78" target="_blank" rel="noopener">📮 캠핑장 제보하기</a>
      </div>`;
    return;
  }

  listEl.innerHTML = shown
    .map((c) => {
      const faved = favorites.includes(c.contentId);
      const img = c.image
        ? `<img src="${c.image}" alt="${c.name}" loading="lazy" />`
        : `<div class="no-image">🏕️</div>`;

      // 배지: 휴양림/유형/반려동물
      const badges = [
        isForest(c) ? `<span class="badge ongoing">🌲 국공립·휴양림</span>` : "",
        c.type ? `<span class="badge upcoming">${c.type.split(",")[0]}</span>` : "",
        (c.pet || "").startsWith("가능") ? `<span class="badge long">🐕</span>` : "",
      ].join(" ");

      // 부대시설 앞 3개만 한 줄로
      const fac = (c.facilities || "").split(",").filter(Boolean).slice(0, 3).join(" · ");

      return `
        <a class="card-link" href="camping/${c.contentId}.html">
          <article class="card">
            <button class="fav-heart${faved ? " faved" : ""}" data-id="${c.contentId}" aria-label="찜하기">${faved ? "❤️" : "🤍"}</button>
            ${img}
            <div class="card-body">
              ${badges}
              <h2>${c.name}</h2>
              <p class="period">📍 ${getRegion(c)} ${c.sigungu || ""}</p>
              ${fac ? `<p class="address">🔧 ${fac}</p>` : ""}
              <button class="review-link" data-query="${c.sigungu || getRegion(c)} ${c.name}"
                onclick="event.preventDefault();window.open('https://map.naver.com/p/search/'+encodeURIComponent(this.dataset.query)+'?placePath=%2Freview','_blank','noopener');">📝 네이버 후기 보기</button>
            </div>
          </article>
        </a>`;
    })
    .join("");
}

// ─── 지역 드롭다운/바로가기 칩 채우기 ───
function fillRegionOptions() {
  const regions = [...new Set(allCampings.map(getRegion))]
    .filter((r) => r !== "기타")
    .sort((a, b) => a.localeCompare(b, "ko"));
  for (const r of regions) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    regionEl.appendChild(opt);
  }
}

function fillQuickLinks() {
  const nav = document.getElementById("quick-links");
  const addChip = (href, label, cls = "chip", tip = "") => {
    const a = document.createElement("a");
    a.className = cls;
    a.href = href;
    a.textContent = label;
    if (tip) a.dataset.tip = tip;
    nav.appendChild(a);
  };

  addChip("theme-forest.html", "🌲 휴양림·국공립", "chip chip-hot",
    "자연휴양림과 국립·공립·지자체가 운영하는 믿을 수 있는 캠핑장만 모았습니다.");
  addChip("theme-glamping.html", "⛺ 글램핑", "chip chip-events",
    "장비 없이 몸만 가는 글램핑 시설이 있는 캠핑장 모음입니다.");
  addChip("theme-caravan.html", "🚐 카라반", "chip",
    "카라반 시설이 있는 캠핑장 모음입니다.");
  addChip("theme-pet.html", "🐕 반려동물", "chip",
    "반려동물 동반이 가능한 캠핑장만 모았습니다.");

  const regions = [...new Set(allCampings.map(getRegion))]
    .filter((r) => REGION_SLUGS[r])
    .sort((a, b) => a.localeCompare(b, "ko"));
  for (const r of regions) {
    addChip(`region-${REGION_SLUGS[r]}.html`, r);
  }
}

// ─── 시작 ───
async function init() {
  try {
    // 목록용 경량 데이터 (전체 campings.json은 5MB가 넘어서 목록엔 이 작은 파일을 씀)
    const res = await fetch("campings-list.json");
    if (!res.ok) throw new Error(`campings-list.json 로드 실패 (${res.status})`);
    allCampings = await res.json();
    fillRegionOptions();
    fillQuickLinks();
    render();
  } catch (err) {
    listEl.innerHTML = `<p style="text-align:center; grid-column: 1 / -1;">
      ⚠️ 데이터를 불러오지 못했습니다: ${err.message}<br>
      node fetch-campings.js 를 먼저 실행했는지, serve.js로 접속했는지 확인하세요.
    </p>`;
  }
}

searchEl.addEventListener("input", render);
regionEl.addEventListener("change", render);
typeEl.addEventListener("change", render);
onlyPetEl.addEventListener("change", render);
onlyFavEl.addEventListener("change", render);

// 하트 클릭 (이벤트 위임)
listEl.addEventListener("click", (e) => {
  const heart = e.target.closest(".fav-heart");
  if (!heart) return;
  e.preventDefault();
  toggleFavorite(heart.dataset.id);
  render();
});

init();
