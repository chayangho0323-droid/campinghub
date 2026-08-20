// app.js — campings.json을 읽어서 캠핑장 카드를 그리는 코드 (FestivalHub app.js 구조 재활용)

const listEl = document.getElementById("camping-list");
const searchEl = document.getElementById("search-input");
const regionEl = document.getElementById("region-filter");
const typeEl = document.getElementById("type-filter");
const onlyPetEl = document.getElementById("only-pet");
const onlyFavEl = document.getElementById("only-fav");
const countEl = document.getElementById("result-count");
const nearBtn = document.getElementById("near-me");

let allCampings = [];
let nearPos = null; // "내 주변" 켜면 {lat, lng}가 채워짐 (브라우저에만 있고 어디에도 안 보냄)

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

  // 매일 자동 셔플: 날짜+아이디를 해시(숫자)로 바꿔 정렬 기준으로 사용.
  // 같은 날에는 누구에게나 같은 순서, 날이 바뀌면 새 순서 —
  // 가나다순일 때 숫자/앞글자 이름만 계속 첫 화면에 노출되던 문제 해결 (3천여 곳 공평 노출)
  // (build-pages.js의 campingSort와 같은 규칙 — 수정 시 양쪽 다!)
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000); // 한국 시간 기준
  const daySeed = `${kst.getUTCFullYear()}${kst.getUTCMonth() + 1}${kst.getUTCDate()}`;
  const shuffleRank = (id) => {
    let h = 5381;
    const s = daySeed + id;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  };

  if (nearPos) {
    // "내 주변" 켜짐: 현재 위치에서 가까운 순 (하버사인 공식으로 km 거리 계산)
    const rad = (deg) => (deg * Math.PI) / 180;
    shown.forEach((c) => {
      if (!c.lat || !c.lng) {
        c._dist = Infinity; // 좌표 없는 곳은 맨 뒤로
        return;
      }
      const dLat = rad(c.lat - nearPos.lat);
      const dLng = rad(c.lng - nearPos.lng);
      const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(nearPos.lat)) * Math.cos(rad(c.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      c._dist = 6371 * 2 * Math.asin(Math.sqrt(h)); // 지구 반지름 6371km
    });
    shown.sort((a, b) => a._dist - b._dist);
  } else {
    // 사진 있는 캠핑장을 먼저 보여주고 (첫 화면 인상), 그 안에서 매일 셔플
    shown.sort((a, b) => {
      const aImg = a.image ? 0 : 1;
      const bImg = b.image ? 0 : 1;
      if (aImg !== bImg) return aImg - bImg;
      return shuffleRank(a.contentId) - shuffleRank(b.contentId);
    });
  }
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
              <p class="period">📍 ${getRegion(c)} ${c.sigungu || ""}${
                nearPos && isFinite(c._dist)
                  ? ` · 🚗 ${c._dist < 10 ? c._dist.toFixed(1) : Math.round(c._dist)}km`
                  : ""
              }</p>
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

// ─── 내 주변 가까운 순 ───
// 브라우저 위치 기능(허용 팝업)을 써서 현재 위치를 받아온다.
// 위치는 이 페이지 안에서 거리 계산에만 쓰고 서버로 보내지 않음.
function enableNear(silent) {
  // silent=true는 접속 직후 자동 시도 — 실패해도 알림 없이 일반 정렬 유지
  if (!navigator.geolocation) {
    if (!silent) alert("이 브라우저는 위치 기능을 지원하지 않아요.");
    return;
  }
  nearBtn.textContent = "📍 위치 확인 중...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      nearPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      nearBtn.classList.add("on");
      nearBtn.textContent = "📍 내 주변 순 (누르면 끔)";
      render();
      if (!silent) window.scrollTo({ top: 0 }); // 정렬이 바뀌었으니 목록 맨 위로
    },
    () => {
      nearBtn.textContent = "📍 내 주변 가까운 순";
      if (!silent) alert("위치 정보를 가져오지 못했어요.\n주소창 근처의 위치 권한을 허용으로 바꾸고 다시 눌러주세요.");
    },
    { maximumAge: 600000, timeout: 8000 } // 10분 내 위치는 재사용, 8초 안에 응답 없으면 포기
  );
}

nearBtn.addEventListener("click", () => {
  // 이미 켜져 있으면 → 끄고 원래 정렬로. 끈 선택은 기억해서 다음 방문엔 자동으로 안 켬
  if (nearPos) {
    nearPos = null;
    nearBtn.classList.remove("on");
    nearBtn.textContent = "📍 내 주변 가까운 순";
    try { localStorage.setItem("near-off", "1"); } catch (e) {}
    render();
    return;
  }
  try { localStorage.removeItem("near-off"); } catch (e) {}
  enableNear(false);
});

init();

// 기본값: 접속하자마자 내 주변 정렬을 자동 시도 (위치를 거부하면 조용히 일반 정렬)
// 사용자가 버튼으로 직접 껐던 브라우저에서는 그 선택을 존중해 자동으로 켜지 않음
if (localStorage.getItem("near-off") !== "1") enableNear(true);
