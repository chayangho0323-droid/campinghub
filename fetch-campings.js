// fetch-campings.js — 고캠핑 API(한국관광공사)에서 전국 캠핑장 정보를 수집해
// campings.json으로 저장하는 스크립트. (FestivalHub의 fetch-festivals.js와 같은 구조)
// 실행: node fetch-campings.js

require("dotenv").config();
const fs = require("fs");

const BASE_URL = "https://apis.data.go.kr/B551011/GoCamping/basedList";
const SERVICE_KEY = process.env.TOUR_API_KEY;

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

  fs.writeFileSync("campings.json", JSON.stringify(campings, null, 2), "utf-8");
  console.log(`✅ campings.json 저장 완료 — 캠핑장 ${campings.length}건`);

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
