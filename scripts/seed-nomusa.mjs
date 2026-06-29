// 전국 노무사 시드 데이터 생성(데모용). 실제 운영 시 scripts/ingest-nomusa.mjs로
// 근로복지공단 공공데이터(7,113건)를 덮어쓰면 됨. 결정적(deterministic) 생성.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "data", "nomusa.json");

// 상세 프로필 4명(직접등록) — 유지
const featured = [
  { id:"kim", n:"김노무 노무사", o:"한울 노무법인", loc:"서울 강남구 테헤란로", tel:"02-555-0001",
    tags:["임금체불","부당해고"], src:"직접등록", v:true, today:true, online:true,
    intro:"임금체불·부당해고 사건을 주로 다룹니다. 근로자가 무엇을 준비해야 하는지부터 차근히 안내합니다.",
    methods:["전화","화상","방문"], fee:"30분 무료 상담 · 이후 30분 5만원", career:"노무사 9년차 · 상담 1,200건+", reviewScore:4.9, reviewCount:87 },
  { id:"lee", n:"이상담 노무사", o:"노무법인 바른", loc:"서울 강남구 역삼동", tel:"02-555-0002",
    tags:["직장내괴롭힘","기업자문"], src:"직접등록", v:true, today:false, online:true,
    intro:"직장 내 괴롭힘 대응과 기업 자문에 강점이 있습니다.", methods:["화상","채팅"], fee:"30분 4만원",
    career:"노무사 12년차 · 기업 자문 다수", reviewScore:4.8, reviewCount:64 },
  { id:"park", n:"박공정 노무사", o:"공정노무사사무소", loc:"서울 서초구 서초동", tel:"02-555-0003",
    tags:["퇴직금","임금체불"], src:"직접등록", v:true, today:false, online:false,
    intro:"퇴직금·임금 관련 상담을 제공합니다.", methods:["전화","방문"], fee:"30분 4만원", career:"노무사 7년차", reviewScore:4.7, reviewCount:41 },
  { id:"jung", n:"정해결 노무사", o:"정해결 노무사사무소", loc:"서울 송파구 문정동", tel:"02-555-0004",
    tags:["부당해고","산재"], src:"직접등록", v:true, today:true, online:true,
    intro:"부당해고 구제신청·산재 상담을 제공합니다.", methods:["전화","화상"], fee:"30분 무료 상담", career:"노무사 10년차", reviewScore:4.9, reviewCount:73 },
];

const regions = [
  ["서울","강남구"],["서울","서초구"],["서울","송파구"],["서울","마포구"],["서울","영등포구"],["서울","종로구"],
  ["경기","수원시"],["경기","성남시"],["경기","고양시"],["경기","용인시"],["경기","부천시"],
  ["인천","남동구"],["부산","부산진구"],["부산","해운대구"],["대구","중구"],["대전","서구"],
  ["광주","서구"],["울산","남구"],["세종","세종시"],["강원","춘천시"],["충북","청주시"],["충남","천안시"],
  ["전북","전주시"],["전남","여수시"],["경북","포항시"],["경남","창원시"],["제주","제주시"],
];
const surnames = ["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","류","홍"];
const given = ["노무","상담","정의","해법","바른","공정","민준","서윤","지후","하准".replace("准",""),"도윤","수아","현우","지민","예준","서연"];
const fieldsPool = ["임금체불","부당해고","퇴직금","직장내괴롭힘","기업자문","산재","주휴수당","근로계약"];
const offices = ["노무법인","노무사사무소","노무컨설팅"];

const out2 = [...featured];
let idx = 0;
for (const [sido, gu] of regions) {
  const per = 2; // 지역당 2명
  for (let k = 0; k < per; k++) {
    const s = surnames[idx % surnames.length];
    const g = given[(idx * 3 + k) % given.length];
    const name = `${s}${g} 노무사`;
    const office = `${s}${["","현대","대한","정도","바른"][(idx + k) % 5]} ${offices[(idx + k) % offices.length]}`;
    const f1 = fieldsPool[(idx + k) % fieldsPool.length];
    const f2 = fieldsPool[(idx + k + 3) % fieldsPool.length];
    out2.push({
      id: `g${idx}_${k}`, n: name, o: office, loc: `${sido} ${gu}`,
      tel: `0${(idx % 6) + 2}-${String(300 + idx).padStart(3, "0")}-${String((idx * 17 + k * 7) % 9000 + 1000)}`,
      tags: [f1, f2], src: "공공데이터(샘플)", v: false,
      today: (idx + k) % 4 === 0, online: (idx + k) % 3 === 0,
      intro: `${sido} ${gu} 지역에서 ${f1}·${f2} 관련 상담을 제공합니다.`,
      methods: (idx + k) % 2 ? ["전화", "방문"] : ["전화", "화상"],
      fee: (idx + k) % 3 === 0 ? "30분 무료 상담" : "상담료 문의",
      career: "", reviewScore: 0, reviewCount: 0,
    });
    idx++;
  }
}

fs.writeFileSync(out, JSON.stringify(out2, null, 1), "utf-8");
console.log(`✅ 노무사 시드 ${out2.length}명 생성 → ${out}`);
console.log("※ 실제 운영: data.go.kr 근로복지공단 CSV → scripts/ingest-nomusa.mjs 로 교체");
