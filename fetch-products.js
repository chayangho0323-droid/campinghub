// fetch-products.js — 네이버 쇼핑 검색 API로 장비 카테고리별 인기 상품을 받아온다.
// 실행: node fetch-products.js  (build-pages.js 실행 전에)
//
// 결과: products.json — 비교 가이드 페이지의 "오늘의 인기 상품" 섹션 재료
// 키가 없거나 API가 실패해도 빌드를 막지 않는다 (기존 products.json 유지)
//
// 키 발급: developers.naver.com > 애플리케이션 등록 > 검색 API
// 로컬: .env에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
// 깃허브: 저장소 Settings > Secrets 에 같은 이름으로 등록

require("dotenv").config();
const fs = require("fs");

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

// 가이드 페이지 slug ↔ 네이버쇼핑 검색어
const CATEGORIES = [
  { slug: "guide-tent", query: "캠핑 텐트" },
  { slug: "guide-chair", query: "캠핑의자" },
  { slug: "guide-mat", query: "캠핑 자충매트" },
  { slug: "guide-sleeping", query: "캠핑 침낭" },
  { slug: "guide-lantern", query: "캠핑 랜턴" },
  { slug: "guide-burner", query: "캠핑 화로대" },
  { slug: "guide-cooler", query: "캠핑 아이스박스" },
  { slug: "guide-tarp", query: "캠핑 타프" },
];

// API 응답의 상품명에는 <b>검색어</b> 강조 태그와 HTML 엔티티가 섞여 있어 정리한다
function cleanTitle(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

async function fetchCategory(query) {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=5&sort=sim`;
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => ({
    title: cleanTitle(it.title),
    lprice: Number(it.lprice) || 0,
    image: it.image || "",
    link: it.link || "",
    mall: it.mallName || "",
  }));
}

async function main() {
  // 기존 데이터를 먼저 읽어둔다 — 일부 카테고리가 실패해도 이전 값을 유지하기 위함
  let prev = { categories: {} };
  try {
    prev = JSON.parse(fs.readFileSync("products.json", "utf-8"));
  } catch {}

  if (!ID || !SECRET) {
    console.log("ℹ️ NAVER_CLIENT_ID/SECRET이 없어 상품 정보 수집을 건너뜁니다 (기존 products.json 유지)");
    return; // 키를 아직 등록 안 한 상태에서도 전체 빌드는 정상 진행
  }

  const categories = { ...prev.categories };
  let ok = 0;
  for (const c of CATEGORIES) {
    try {
      const items = await fetchCategory(c.query);
      if (items.length) {
        categories[c.slug] = items;
        ok++;
      }
      await new Promise((r) => setTimeout(r, 150)); // 호출 간격 (예의상)
    } catch (err) {
      console.log(`⚠️ ${c.query} 수집 실패 (기존 값 유지): ${err.message}`);
    }
  }

  // 한국 시간 기준 날짜 라벨 (페이지에 "8월 25일 기준"으로 표시됨)
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const updated = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;

  fs.writeFileSync("products.json", JSON.stringify({ updated, categories }, null, 2), "utf-8");
  console.log(`✅ products.json 저장 — ${ok}/${CATEGORIES.length}개 카테고리 갱신 (${updated} 기준)`);
}

main().catch((err) => {
  console.log(`⚠️ 상품 수집 실패 (빌드는 계속): ${err.message}`);
});
