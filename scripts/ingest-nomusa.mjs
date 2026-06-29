// 근로복지공단 "고용보험·산재보험 사무대행기관 현황" 공공데이터 CSV → data/nomusa.json
//
// 사용법:
//   1) https://www.data.go.kr/data/3073001/fileData.do 에서 CSV 다운로드
//   2) 이 폴더(scripts/)나 프로젝트 루트에 sample.csv 로 저장
//   3) node scripts/ingest-nomusa.mjs <csv경로>
//
// 컬럼(공공데이터): 연도 · 기관명 · 우편번호 · 주소 · 전화번호
// 주의: 사무대행기관에는 세무사 사무소 등도 섞일 수 있어 "노무" 관련만 1차 필터링합니다.
//       이름·주소·전화번호는 공개 정보이며, 노출은 "추천"이 아닌 "정보 제공"으로 표기하세요.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nomusa } from "../lib/repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inPath = process.argv[2] || path.join(__dirname, "..", "sample.csv");
const outPath = path.join(__dirname, "..", "data", "nomusa.json");

if (!fs.existsSync(inPath)) {
  console.error(`CSV를 찾을 수 없습니다: ${inPath}`);
  console.error("data.go.kr에서 받은 CSV 경로를 인자로 넘기세요. 예) node scripts/ingest-nomusa.mjs ./사무대행기관.csv");
  process.exit(1);
}

// 한국 공공데이터 CSV는 EUC-KR이 많지만 UTF-8도 있음. 두 디코딩을 점수화해 더 정확한 쪽 선택.
const raw = fs.readFileSync(inPath);
function tryDecode(enc) { try { return new TextDecoder(enc, { fatal: false }).decode(raw); } catch { return null; } }
function score(t) { return t ? (t.match(/[가-힣]/g) || []).length - (t.match(/�/g) || []).length * 5 : -Infinity; }
const utf8 = tryDecode("utf-8"), euckr = tryDecode("euc-kr");
const text = score(utf8) >= score(euckr) ? utf8 : euckr;

// 아주 단순한 CSV 파서 (따옴표 내 콤마 처리)
function parseCsv(s) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const rows = parseCsv(text);
if (!rows.length) { console.error("빈 CSV"); process.exit(1); }

const header = rows[0].map((h) => h.trim());
const idx = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
const iName = idx(["기관명", "사업장명", "상호"]);
const iAddr = idx(["주소"]);
const iTel = idx(["전화", "연락처"]);

if (iName < 0 || iAddr < 0) {
  console.error("기관명/주소 컬럼을 찾지 못했습니다. 헤더:", header);
  process.exit(1);
}

// "노무" 관련만 (사무대행기관에 섞인 비노무 기관 제외)
const NOMU_RE = /(노무|노무사|노무법인)/;

// 직접등록(큐레이션) 항목만 보존 — 공공데이터·샘플은 새 데이터로 전량 대체
let curated = [];
try { curated = JSON.parse(fs.readFileSync(outPath, "utf-8")).filter((n) => !(n.src || "").includes("공공데이터")); } catch { /* 없으면 무시 */ }
const curatedNames = new Set(curated.map((n) => (n.n || "").replace(/\s/g, "")));

const pub = [];
let seq = 0;
for (const r of rows.slice(1)) {
  const name = (r[iName] || "").trim();
  if (!name || !NOMU_RE.test(name)) continue;
  if (curatedNames.has(name.replace(/\s/g, ""))) continue; // 직접등록과 중복 제외
  pub.push({
    id: "p" + (++seq),                 // 안정적 ID (프론트·DB 키)
    n: name, o: name,
    loc: (r[iAddr] || "").trim(),
    tel: iTel >= 0 ? (r[iTel] || "").trim() : "",
    tags: [], src: "공공데이터", v: false, today: false,
  });
}

// 시·도 정규화 (서울특별시→서울, 경상남도→경남 등) — 지역 필터 일관성
function normSido(loc) {
  const t = (loc || "").trim();
  const longPairs = [["충청북도", "충북"], ["충청남도", "충남"], ["전라북도", "전북"], ["전라남도", "전남"], ["경상북도", "경북"], ["경상남도", "경남"], ["강원특별자치도", "강원"], ["전북특별자치도", "전북"], ["제주특별자치도", "제주"]];
  for (const [k, v] of longPairs) if (t.startsWith(k)) return v;
  const SIDO = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  for (const s of SIDO) if (t.startsWith(s)) return s;
  return t.split(" ")[0] || "";
}
const all = [...curated, ...pub].map((n) => ({ ...n, sido: normSido(n.loc) }));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(all, null, 1), "utf-8");   // 시드 파일 갱신
nomusa.replaceAll(all);                                              // 운영 DB(app.db) 즉시 반영

console.log(`✅ 직접등록 ${curated.length}건 + 공공데이터 ${pub.length}건 = 총 ${all.length}건`);
console.log(`   → ${outPath} 및 운영 DB(data/app.db)에 반영 완료`);
console.log("※ 노출은 '추천'이 아닌 '정보 제공'으로 표기하고, 삭제 요청(옵트아웃)에 응하세요.");
