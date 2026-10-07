// astro.js — 일출·일몰 시각과 달 위상(월령·밝기)을 API 없이 계산한다. (캠핑허브 "별 보기 좋은 밤"용)
//  - 일출·일몰: NOAA 태양 위치 공식 (오차 ±2분 — 캠핑 안내엔 충분)
//  - 달 위상: 기준 삭(2000-01-06 18:14 UTC)에서 삭망월 29.530588853일 주기로 계산 (오차 반나절 안팎)
// 모든 시각은 한국시간(KST, UTC+9) 기준. 날짜는 "20261010" 형식.

const SYNODIC = 29.530588853;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC 삭

function ymdToDate(ymd, hourKst = 12) {
  // 그 날짜 KST 정오(기본)를 UTC Date로
  return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), hourKst - 9));
}

// 달 위상: 월령(0~29.5일), 밝기(0~1), 이름
function moonPhase(ymd) {
  const t = ymdToDate(ymd, 21); // 밤 9시 기준
  const age = (((t - NEW_MOON_REF) / 86400000) % SYNODIC + SYNODIC) % SYNODIC;
  const illum = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const pct = Math.round(illum * 100);
  // 이름은 월령으로 나누되, 밝기 97% 이상은 보름달·3% 이하는 삭으로 통일 (경계 날짜의 어색함 방지)
  let name = age < 1.8 ? "삭(그믐달)" : age < 7.4 ? "초승달" : age < 9.2 ? "상현달" : age < 14.8 ? "차오르는 달" : age < 16.6 ? "보름달" : age < 22.1 ? "기우는 달" : age < 23.9 ? "하현달" : age < 27.7 ? "그믐달" : "삭(그믐달)";
  let icon = age < 1.8 ? "🌑" : age < 7.4 ? "🌒" : age < 9.2 ? "🌓" : age < 14.8 ? "🌔" : age < 16.6 ? "🌕" : age < 22.1 ? "🌖" : age < 23.9 ? "🌗" : age < 27.7 ? "🌘" : "🌑";
  if (pct >= 97) { name = "보름달"; icon = "🌕"; } else if (pct <= 3) { name = "삭(그믐달)"; icon = "🌑"; }
  return { age: Math.round(age * 10) / 10, illum: pct, name, icon };
}

// 일출·일몰 (NOAA). 반환 "HH:MM" KST. 극지방 예외는 한국에선 없음
function sunTimes(ymd, lat, lng) {
  const rad = Math.PI / 180;
  const y = +ymd.slice(0, 4), m = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const tz = 9;
  // NOAA 간이식: 연중 각도(γ), 시간 방정식(eqtime, 분), 적위(decl)
  const calc = (hour) => {
    const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    return { eqtime, decl };
  };
  const zenith = 90.833 * rad; // 대기 굴절 보정 포함
  const result = {};
  for (const [key, isRise] of [["sunrise", true], ["sunset", false]]) {
    // 대략적 시각으로 한 번 계산한 뒤 그 시각으로 재계산 (정밀도 향상)
    let hour = isRise ? 6 : 18;
    for (let i = 0; i < 2; i++) {
      const { eqtime, decl } = calc(hour);
      const cosHa = Math.cos(zenith) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
      if (cosHa < -1 || cosHa > 1) { result[key] = null; break; }
      const ha = (Math.acos(cosHa) / rad) * (isRise ? 1 : -1);
      const minutesUtc = 720 - 4 * (lng + ha) - eqtime;
      hour = (minutesUtc + tz * 60) / 60;
    }
    if (result[key] === undefined) {
      const mins = Math.round(((hour * 60) % 1440 + 1440) % 1440);
      result[key] = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    }
  }
  return result;
}

// 별 보기 점수: 하늘(맑음/구름)·비 확률·달 밝기(·미세먼지 있으면)를 합쳐 3단계
//  day: {sky, pop, pty} (weather.json 하루치), moon: moonPhase(), pm: "좋음|보통|나쁨|매우나쁨"|null
function starScore(day, moon, pm) {
  if (!day) return null;
  const reasons = [];
  let score = 3;
  if (day.pty || day.pop >= 60 || day.sky === "흐림") { score = 0; reasons.push(day.pty ? "비·눈" : day.sky === "흐림" ? "흐림" : `비 ${day.pop}%`); }
  else if (day.sky === "구름많음" || day.pop >= 30) { score -= 1; reasons.push(day.sky === "구름많음" ? "구름많음" : `비 ${day.pop}%`); }
  else reasons.push("맑음");
  if (score > 0) {
    if (moon.illum >= 70) { score -= 1; reasons.push(`${moon.name} ${moon.illum}%`); }
    else if (moon.illum >= 35) { reasons.push(`${moon.name} ${moon.illum}%`); }
    else reasons.push(`${moon.name} ${moon.illum}% — 달빛 적음`);
    if (pm) {
      if (/나쁨/.test(pm)) { score -= 1; reasons.push(`미세먼지 ${pm}`); }
      else reasons.push(`미세먼지 ${pm}`);
    }
  }
  score = Math.max(0, score);
  const label = ["❌ 어려움", "☆ 아쉬움", "☆☆ 괜찮음", "☆☆☆ 최적"][score];
  return { score, label, reasons };
}

module.exports = { moonPhase, sunTimes, starScore };
