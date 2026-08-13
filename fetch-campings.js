// fetch-campings.js — 고캠핑 API(한국관광공사)에서 전국 캠핑장 정보를 수집해
// campings.json으로 저장하는 스크립트. (FestivalHub의 fetch-festivals.js와 같은 구조)
// 실행: node fetch-campings.js

require("dotenv").config();
const fs = require("fs");

const BASE_URL = "https://apis.data.go.kr/B551011/GoCamping/basedList";
// 주변 관광지/맛집은 관광정보 서비스의 위치기반 조회 사용 (FestivalHub와 동일)
const NEARBY_URL = "https://apis.data.go.kr/B551011/KorService2/locationBasedList2";
const SERVICE_KEY = process.env.TOUR_API_KEY;

// 좌표 반경 10km의 장소를 가까운 순으로 5개 (contentTypeId: 12=관광지, 39=음식점)
async function fetchNearby(lat, lng, contentTypeId) {
  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      MobileOS: "ETC",
      MobileApp: "CampingHub",
      _type: "json",
      mapX: lng, // 주의: mapX가 경도!
      mapY: lat,
      radius: "10000",
      contentTypeId,
      arrange: "E", // 거리순
      numOfRows: "5",
    });
    const res = await fetch(`${NEARBY_URL}?${params.toString()}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");
    const data = JSON.parse(text);
    if (data?.response?.header?.resultCode !== "0000") {
      throw new Error(`API 에러 code=${data?.response?.header?.resultCode}`);
    }
    let items = data?.response?.body?.items?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    return items.map((i) => ({
      name: i.title,
      dist: Math.round(Number(i.dist)),
      image: i.firstimage || "",
      addr: i.addr1 || "",
    }));
  } catch (err) {
    return null; // 실패 표시 — 다음 실행 때 다시 시도됨 (자가 복구)
  }
}

// 배열을 size개씩 잘라서 순서대로 처리
async function mapInBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    if ((i / size) % 50 === 0 && i > 0) {
      console.log(`   주변 정보 ${Math.min(i + size, items.length)}/${items.length}건`);
    }
  }
  return results;
}

// 한 페이지를 가져온다
async function fetchPage(pageNo) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    MobileOS: "ETC",
    MobileApp: "CampingHub",
    _type: "json",
    numOfRows: "1000",
    pageNo: String(pageNo),
  });
  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  const text = await res.text();
  if (text.trim().startsWith("<")) {
    const reason = text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/)?.[1] || text.slice(0, 200);
    throw new Error(`API가 XML 에러를 반환: ${reason}`);
  }
  const data = JSON.parse(text);
  const header = data?.response?.header;
  if (header?.resultCode !== "0000") {
    throw new Error(`API 에러 (code=${header?.resultCode}): ${header?.resultMsg}`);
  }
  let items = data?.response?.body?.items?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  return { items, totalCount: Number(data?.response?.body?.totalCount ?? 0) };
}

async function main() {
  if (!SERVICE_KEY) {
    console.error("❌ .env에 TOUR_API_KEY가 없습니다.");
    process.exit(1);
  }

  // 전체 페이지 수집
  const first = await fetchPage(1);
  const totalPages = Math.ceil(first.totalCount / 1000);
  console.log(`🏕️ 전국 캠핑장 ${first.totalCount}건, ${totalPages}페이지 수집 시작`);
  let all = [...first.items];
  for (let p = 2; p <= totalPages; p++) {
    const { items } = await fetchPage(p);
    all.push(...items);
    console.log(`   ${p}/${totalPages} 페이지 완료 (누적 ${all.length}건)`);
  }

  // 필요한 필드만 추려서 이름을 알기 쉽게 정리
  // (원본 필드 설명: induty=유형, facltDivNm=운영주체, sbrsCl=부대시설,
  //  animalCmgCl=반려동물, resveUrl=예약 페이지, themaEnvrnCl=테마환경)
  const campings = all
    .filter((c) => c.facltNm && c.mapX && c.mapY) // 이름·좌표 없는 건 제외
    .map((c) => ({
      contentId: c.contentId,
      name: c.facltNm,
      type: c.induty || "", // 예: "일반야영장,글램핑"
      operator: c.facltDivNm || "", // 민간/국립/공립/지자체 등
      lineIntro: c.lineIntro || "",
      intro: c.intro || "",
      address: c.addr1 || "",
      region: c.doNm || "", // 시도
      sigungu: c.sigunguNm || "",
      lat: c.mapY,
      lng: c.mapX,
      tel: c.tel || "",
      homepage: (c.homepage || "").match(/https?:\/\/[^"'\s<>]+/)?.[0] || "",
      reserveUrl: (c.resveUrl || "").match(/https?:\/\/[^"'\s<>]+/)?.[0] || "", // ⭐ 예약 바로가기
      image: c.firstImageUrl || "",
      facilities: c.sbrsCl || "", // 전기,무선인터넷,장작판매,온수...
      pet: c.animalCmgCl || "", // 가능/불가능/가능(소형견)
      brazier: c.brazierCl || "", // 화로대
      theme: c.themaEnvrnCl || "", // 여름물놀이,걷기길,낚시...
      operPeriod: c.operPdCl || "", // 봄,여름,가을,겨울
      siteCounts: {
        general: Number(c.gnrlSiteCo || 0), // 일반 사이트 수
        auto: Number(c.autoSiteCo || 0), // 오토캠핑
        glamp: Number(c.glampSiteCo || 0), // 글램핑
        caravan: Number(c.caravSiteCo || 0), // 카라반
      },
      toilets: Number(c.toiletCo || 0),
      showers: Number(c.swrmCo || 0),
      glampFacilities: c.glampInnerFclty || "", // 글램핑 내부시설
      caravanFacilities: c.caravInnerFclty || "",
      updated: c.modifiedtime || "",
    }));

  // ── 수동 등록 캠핑장 합치기 ──
  // 고캠핑 API에 등록되지 않은 캠핑장(자연휴양림 야영장 등)을 manual-campings.json에
  // 직접 적어두면 여기서 합쳐진다. 이미 API에 같은 이름이 있으면 건너뜀
  try {
    const manual = JSON.parse(fs.readFileSync("manual-campings.json", "utf-8"));
    const existingNames = new Set(campings.map((c) => c.name.replace(/\s/g, "")));
    let added = 0;
    for (const m of manual) {
      if (existingNames.has((m.name || "").replace(/\s/g, ""))) continue;
      campings.push({
        contentId: m.contentId,
        name: m.name,
        type: m.type || "",
        operator: m.operator || "",
        lineIntro: m.lineIntro || "",
        intro: m.intro || "",
        address: m.address || "",
        region: m.region || "",
        sigungu: m.sigungu || "",
        lat: m.lat || "",
        lng: m.lng || "",
        tel: m.tel || "",
        homepage: m.homepage || "",
        reserveUrl: m.reserveUrl || "",
        image: m.image || "",
        facilities: m.facilities || "",
        pet: m.pet || "",
        brazier: m.brazier || "",
        theme: m.theme || "",
        operPeriod: m.operPeriod || "",
        siteCounts: m.siteCounts || { general: 0, auto: 0, glamp: 0, caravan: 0 },
        toilets: m.toilets || 0,
        showers: m.showers || 0,
        glampFacilities: "",
        caravanFacilities: "",
        updated: "manual",
      });
      added++;
    }
    if (added) console.log(`📌 수동 등록 캠핑장 ${added}건 추가 (manual-campings.json)`);
  } catch {}

  // ── 주변 관광지/맛집 붙이기 (캐시: 이미 받은 곳은 재요청 안 함) ──
  let cache = {};
  try {
    const prev = JSON.parse(fs.readFileSync("campings.json", "utf-8"));
    for (const p of prev) cache[p.contentId] = p;
    console.log(`♻️  기존 campings.json에서 ${prev.length}건 캐시 로드`);
  } catch {}

  console.log("📍 주변 관광지/맛집 수집 시작 (처음엔 10분 이상 걸릴 수 있음)");
  const enriched = await mapInBatches(campings, 5, async (c) => {
    const cc = cache[c.contentId] || {};
    const nearbySpots = Array.isArray(cc.nearbySpots)
      ? cc.nearbySpots
      : await fetchNearby(c.lat, c.lng, "12");
    const nearbyFood = Array.isArray(cc.nearbyFood)
      ? cc.nearbyFood
      : await fetchNearby(c.lat, c.lng, "39");
    return { ...c, nearbySpots, nearbyFood };
  });

  fs.writeFileSync("campings.json", JSON.stringify(enriched, null, 2), "utf-8");
  console.log(`✅ campings.json 저장 완료 — 캠핑장 ${enriched.length}건`);
  console.log(`   주변 정보 확보: ${enriched.filter((c) => Array.isArray(c.nearbyFood) && c.nearbyFood.length).length}건`);

  // 수집 결과 요약
  const forest = campings.filter(
    (c) => c.name.includes("휴양림") || ["국립", "공립", "지자체", "자연휴양림", "국립공원"].includes(c.operator)
  );
  console.log(`   그중 휴양림·국공립 캠핑장: ${forest.length}건`);
  console.log(`   글램핑 보유: ${campings.filter((c) => c.siteCounts.glamp > 0).length}건`);
  console.log(`   반려동물 가능: ${campings.filter((c) => c.pet.startsWith("가능")).length}건`);
  console.log(`   예약 링크 보유: ${campings.filter((c) => c.reserveUrl).length}건`);
}

main().catch((err) => {
  console.error("❌ 실패:", err.message);
  process.exit(1);
});
