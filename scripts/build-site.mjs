// index.html의 글 데이터(ARTICLES/ART_EXTRA/AUTHOR)를 추출해
// 글마다 "검색엔진이 JS 없이도 읽는" 정적 HTML + sitemap.xml + robots.txt 생성.
//
// 실행: npm run build   (배포 도메인이 있으면 SITE_URL=https://도메인 npm run build)

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
// SITE_URL 우선, 없으면 호스트가 자동 주입하는 외부 URL(Render/Railway) 사용, 최후엔 로컬
const SITE_URL = (
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

// ---- 1) index.html에서 데이터 추출 (브라우저 전역을 stub해 안전하게 평가) ----
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");
const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const noop = new Proxy(function () {}, {
  get: () => noop, apply: () => noop, set: () => true, construct: () => noop,
});
const ctx = {
  document: { getElementById: () => noop, querySelector: () => noop, querySelectorAll: () => [], createElement: () => noop, addEventListener: () => {}, title: "" },
  location: { hash: "", search: "", pathname: "/" },
  history: { replaceState: () => {} },
  navigator: {}, alert: () => {}, fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve("") }),
  console, setTimeout: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(scriptSrc + "\n;globalThis.__DATA__={ARTICLES,ART_EXTRA,AUTHOR,RICH_GUIDES:(typeof RICH_GUIDES!=='undefined'?RICH_GUIDES:{})};", ctx);
const { ARTICLES, ART_EXTRA, AUTHOR, RICH_GUIDES } = ctx.__DATA__;

// ---- 2) 콘텐츠 렌더러 (클라이언트 renderSec/callout/table와 동일 형태) ----
// 단색 SVG 라인 아이콘 (정적 페이지용 · SPA의 ICON 세트와 동일 형태)
const _svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  tip: _svg('<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.6.5.9 1 .95 1.9h5.7c.05-.9.35-1.4.95-1.9A6 6 0 0 0 12 3z"/>'),
  warn: _svg('<path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>'),
  law: _svg('<path d="M12 3v18M8.5 21h7M4 8l8-3 8 3"/><path d="M4 8 2 12.2a4 4 0 0 0 4 0L4 8zM20 8l-2 4.2a4 4 0 0 0 4 0L20 8z"/>'),
  chat: _svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.5L3 21l1.9-5.9A8.5 8.5 0 1 1 21 11.5z"/>'),
};
const callout = (c) => `<div class="callout ${c.type}"><div class="ic">${ICON[c.type] || ICON.tip}</div><div>${c.text}</div></div>`;
const table = (t) =>
  `<table class="art-table"><thead><tr>${t.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sec = (s, i) => {
  let h = `<h2 id="sec${i}">${s.h}</h2>`;
  if (s.callout) h += callout(s.callout);
  if (s.p) h += s.p.map((x) => `<p>${x}</p>`).join("");
  if (s.list) h += `<ul>${s.list.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  if (s.table) h += table(s.table);
  return h;
};
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
// HTML 속성용 이스케이프 (description/title에 따옴표·꺾쇠가 들어가도 안전)
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 제목을 글자수 기준으로 줄바꿈 (한글 OG용)
function wrapTitle(t, per = 14, max = 3) {
  const words = t.split(" ");
  const lines = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > per && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, max);
}

// 글마다 자동 생성하는 브랜드 OG 카드(SVG). 사이트별 악센트 반영.
function ogSvg(a, accent, accentSoft) {
  const lines = wrapTitle(a.title);
  const startY = 300 - (lines.length - 1) * 38;
  const titleTspans = lines.map((ln, i) =>
    `<text x="80" y="${startY + i * 84}" font-family="Pretendard,'Apple SD Gothic Neo',sans-serif" font-size="64" font-weight="800" fill="#0B0D12" letter-spacing="-2">${xml(ln)}</text>`).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <rect width="1200" height="630" fill="#FFFFFF"/>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="630" gradientUnits="userSpaceOnUse"><stop stop-color="${accentSoft}"/><stop offset="0.72" stop-color="#FFFFFF"/></linearGradient></defs>
  <rect width="14" height="630" fill="${accent}"/>
  <g transform="translate(80,70)"><rect width="40" height="40" rx="12" fill="${accent}"/>
    <path d="M10 17h20a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H20l-6 5v-5h-4a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3Z" fill="#fff"/>
    <text x="52" y="29" font-family="Pretendard,'Apple SD Gothic Neo',sans-serif" font-size="27" font-weight="800"><tspan fill="#16181D">인사</tspan><tspan fill="${accent}">야</tspan></text></g>
  <text x="80" y="170" font-family="Pretendard,'Apple SD Gothic Neo',sans-serif" font-size="26" font-weight="700" fill="${accent}">${xml(a.cat)}</text>
  ${titleTspans}
  <text x="80" y="560" font-family="Pretendard,'Apple SD Gothic Neo',sans-serif" font-size="24" font-weight="700" fill="${accent}">⚖ 2026 법령 기준 · 정보 제공</text>
</svg>`;
}

// ---- 2b) RICH_GUIDES 블록 → 정적 HTML (in-app 리치가이드와 동일 톤) ----
function richBlock(b) {
  switch (b.type) {
    case "lead": return `<p class="lead">${b.text}</p>`;
    case "h2": return `<h3 class="rb-h2">${b.em ? `<span class="rb-em">${b.em}</span> ` : ""}${b.text}</h3>`;
    case "numbers": return `<div class="bignums">${b.items.map((n) => `<div class="bignum"><div class="n">${n.big}</div><div class="l">${n.label}</div></div>`).join("")}</div>`;
    case "steps": return `<ol class="steps2">${b.items.map((s, i) => `<li><span class="sn">${i + 1}</span><span class="st"><b>${s.t}</b>${s.d ? `<i>${s.d}</i>` : ""}</span></li>`).join("")}</ol>`;
    case "diagram": return `<div class="flow">${b.nodes.map((n, i) => `<div class="node"><div class="nic">${n.ic || ""}</div><div class="nt">${n.t}</div>${n.d ? `<div class="nd">${n.d}</div>` : ""}</div>${i < b.nodes.length - 1 ? '<div class="arr">→</div>' : ""}`).join("")}</div>`;
    case "timeline": return `<div class="tline">${b.items.map((it) => `<div class="tl-item"><div class="tl-when">${it.when}</div><div class="tl-what">${it.what}</div></div>`).join("")}</div>`;
    case "compare":
    case "table": return `<table class="art-table"><thead><tr>${b.cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    case "callout": return callout(b.callout);
    case "checklist": return `<ul class="checklist">${b.items.map((c) => `<li>${c}</li>`).join("")}</ul>`;
    case "selfcheck": return `<div class="selfcheck"><div class="sc-q">${b.q}</div><div class="sc-opt"><b>예</b> ${b.yes}</div><div class="sc-opt no"><b>아니오</b> ${b.no}</div></div>`;
    case "embed": return `<a class="embedbox" href="${SITE_URL}/"><span class="eb-ic">🧮</span><span class="eb-tx"><b>${b.title}</b>${b.desc ? `<i>${b.desc}</i>` : ""}</span><span class="eb-cta">${b.cta || "열기"} ›</span></a>`;
    default: return "";
  }
}
// rich guide → {body, toc, faqItems}
function renderRich(rich) {
  const faqItems = [];
  const tldr = `<div class="tldr"><div class="tldr-t">한 장 요약</div><div class="tldr-grid">${rich.summary.map((s) => `<div class="tldr-card"><div class="tc-ic">${s.icon}</div><div class="tc-t">${s.title}</div><div class="tc-d">${s.desc}</div></div>`).join("")}</div></div>`;
  const secHtml = rich.sections.map((sec, i) => {
    sec.blocks.forEach((b) => { if (b.type === "faq") faqItems.push(...b.items); });
    const nonFaq = sec.blocks.filter((b) => b.type !== "faq");
    if (!nonFaq.length) return ""; // FAQ 전용 섹션은 하단 FAQ로 통합(중복 방지)
    const inner = nonFaq.map(richBlock).join("");
    return `<section class="rg-sec" id="sec${i}"><h2>${sec.icon ? `<span class="s-ic">${sec.icon}</span> ` : ""}${sec.label}</h2>${inner}</section>`;
  }).join("");
  const toc = rich.sections.map((s, i) => s.blocks.every((b) => b.type === "faq") ? "" : `<li><a href="#sec${i}">${s.label}</a></li>`).join("") + (faqItems.length ? `<li><a href="#faq">자주 묻는 질문</a></li>` : "");
  return { body: tldr + secHtml, toc, faqItems };
}

// ---- 3) 정적 페이지 템플릿 ----
function page(key, a) {
  const x = ART_EXTRA[key] || {};
  const secs = (a.secs || []).concat(x.add || []);
  const url = `${SITE_URL}/articles/${key}.html`;
  const desc = strip(a.lead).slice(0, 155);
  const descA = attr(desc), titleA = attr(`${a.title} | 인사야`);
  const updated = x.updated || "2026-06-01";
  // 에디토리얼·신뢰형 팔레트: 제네릭 파랑 대신 딥 네이비/포레스트
  const accent = a.from === "employer" ? "#1E4A3E" : "#1B3A5B";
  const accentSoft = a.from === "employer" ? "#eaf2ef" : "#eef2f7";
  const accentInk = a.from === "employer" ? "#184036" : "#16345c";
  // OG 이미지: 글별 PNG가 있으면 그것, 없으면 브랜드 기본 PNG(og-default.png).
  // ⚠️ 소셜(카톡·트위터·페북)은 SVG를 렌더하지 않으므로 반드시 PNG 사용.
  const ogDir = path.join(ROOT, "assets", "og");
  fs.mkdirSync(ogDir, { recursive: true });
  const ogImage = fs.existsSync(path.join(ogDir, `${key}.png`))
    ? `${SITE_URL}/assets/og/${key}.png`
    : `${SITE_URL}/assets/brand/og-default.png`;

  const rich = RICH_GUIDES[key];
  let toc, body, check = "", faqSrc;
  if (rich) {
    const r = renderRich(rich);
    body = r.body; toc = r.toc; faqSrc = r.faqItems; // 리치가이드: 체크리스트는 섹션 블록에 포함
  } else {
    toc = secs.map((s, i) => `<li><a href="#sec${i}">${s.h}</a></li>`).join("") + (x.faq ? `<li><a href="#faq">자주 묻는 질문</a></li>` : "");
    body = secs.map(sec).join("");
    check = `<h2 id="check">준비 / 체크리스트</h2><ul class="checklist">${(a.checklist || []).map((c) => `<li>${c}</li>`).join("")}</ul>`;
    faqSrc = x.faq || [];
  }
  const faq = (faqSrc || []).map((f) => `<details><summary>${f.q}</summary><div class="ans">${f.a}</div></details>`).join("");
  const rel = (x.related || []).filter((rk) => ARTICLES[rk]).map((rk) =>
    `<a class="relcard" href="/articles/${rk}.html"><div class="rc">${ARTICLES[rk].cat}</div><div class="rt">${ARTICLES[rk].title}</div></a>`).join("");

  // JSON-LD: Article + (FAQPage)
  const ld = {
    "@context": "https://schema.org", "@type": "Article",
    headline: a.title, description: desc,
    datePublished: updated, dateModified: updated,
    author: { "@type": "Organization", name: "인사야" },
    publisher: { "@type": "Organization", name: "인사야" },
    mainEntityOfPage: url,
  };
  const faqLd = faqSrc && faqSrc.length ? {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqSrc.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: strip(f.a) } })),
  } : null;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${titleA}</title>
<meta name="description" content="${descA}"/>
<link rel="canonical" href="${url}"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${titleA}"/>
<meta property="og:description" content="${descA}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:site_name" content="인사야"/>
<meta property="og:image" content="${ogImage}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${titleA}"/>
<meta name="twitter:description" content="${descA}"/>
<meta name="twitter:image" content="${ogImage}"/>
<link rel="icon" type="image/svg+xml" href="${SITE_URL}/assets/brand/favicon.svg"/>
<link rel="icon" href="${SITE_URL}/assets/brand/favicon.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&display=swap" rel="stylesheet"/>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ""}
<script type="application/ld+json">${JSON.stringify({ "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
  {"@type":"ListItem","position":1,"name":"홈","item":SITE_URL+"/"},
  {"@type":"ListItem","position":2,"name":a.cat},
  {"@type":"ListItem","position":3,"name":a.title,"item":url}]})}</script>
<style>
  @font-face{font-family:"Pretendard Variable";src:url("/assets/brand/fonts/PretendardVariable.woff2") format("woff2-variations");font-weight:100 900;font-display:swap}
  :root{--ink:#16181d;--ink-900:#0B0D12;--sub:#6b7280;--line:#e7e9ee;--brand:${accent};--brand-dark:${accent};--brand-soft:${accentSoft};--accent-ink:${accentInk};--panel:#f7f8fa;--ok:#22a06b;
    --font-sans:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;
    --font-serif:"Noto Serif KR",Georgia,"Nanum Myeongjo",serif}
  *{box-sizing:border-box}
  body{margin:0;font-family:var(--font-sans);color:var(--ink);line-height:1.7;background:#fff;word-break:keep-all;overflow-wrap:anywhere}
  a{color:inherit}
  :where(a,button,summary):focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  ::selection{background:var(--brand-soft);color:var(--ink-900)}
  @media (prefers-reduced-motion: reduce){*{transition-duration:.01ms!important;animation-duration:.01ms!important}}
  .top{border-bottom:1px solid var(--line);padding:14px 20px}
  .top a{font-weight:800;font-size:17px;text-decoration:none}.top b{color:var(--brand)}
  .wrap{max-width:760px;margin:0 auto;padding:30px 20px 90px}
  .crumb{font-size:12.5px;color:var(--sub);margin-bottom:8px}.crumb a{color:var(--accent-ink);text-decoration:none}
  h1{font-family:var(--font-serif);font-size:37px;font-weight:700;line-height:1.3;letter-spacing:-.015em;margin:12px 0 14px;color:#0b0d12}
  h2{font-family:var(--font-serif);font-size:21px;font-weight:700;margin:26px 0 10px;letter-spacing:-.01em;scroll-margin-top:16px}
  p{font-size:15px;margin:9px 0}
  ul{padding-left:20px}li{font-size:15px;margin:5px 0}
  .meta{display:flex;flex-wrap:wrap;gap:9px;align-items:center;font-size:12.5px;color:var(--sub);margin:8px 0}
  .meta .au{font-weight:600;color:var(--ink)}.meta .v{color:var(--ok);font-weight:700}
  .lead{font-size:17px;line-height:1.75;color:#2b2f38;background:none;border-left:3px solid var(--brand);border-radius:0;padding:1px 0 1px 17px;margin:16px 0 20px}
  .toc{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:16px 0}
  .toc .t{font-size:12px;font-weight:700;color:var(--sub);margin-bottom:6px}.toc ol{margin:0;padding-left:18px}.toc a{color:var(--brand-dark);text-decoration:none}
  .callout{display:flex;gap:11px;border-radius:12px;padding:13px 15px;margin:16px 0;font-size:14.5px}
  .callout .ic{flex-shrink:0;font-size:18px;line-height:1.4}.callout .ic>svg{width:1em;height:1em}
  .tic{display:inline-flex;align-items:center;vertical-align:-.14em}.tic>svg{width:1em;height:1em}
  .callout.tip{background:#eef7f1;border:1px solid #cfe9d9}.callout.warn{background:#fdf4e7;border:1px solid #f3e0bf}.callout.law{background:var(--brand-soft);border:1px solid #d4e2ff}
  .art-table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px}
  .art-table th,.art-table td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}.art-table th{background:var(--panel)}
  .checklist{list-style:none;padding:0}.checklist li{padding:9px 12px;background:var(--panel);border-radius:9px;margin-bottom:7px;font-size:14.5px}.checklist li::before{content:"✓ ";color:var(--ok);font-weight:800}
  details{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden}
  summary{cursor:pointer;padding:13px 15px;font-weight:600;font-size:15px}
  .ans{padding:0 15px 14px;color:#374151}
  .related{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  .relcard{display:block;text-decoration:none;border:1px solid var(--line);border-radius:12px;padding:13px}
  .relcard .rc{font-size:11px;color:var(--sub)}.relcard .rt{font-weight:700;font-size:14px;margin-top:3px}
  .cta{background:#fff;border:1.5px solid var(--brand);border-radius:14px;padding:20px;margin:24px 0;text-align:center}
  .cta .t{font-weight:700}.cta .d{font-size:13px;color:var(--sub);margin:4px 0 12px}
  .cta a{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;border-radius:10px;padding:12px 22px;font-weight:700}
  .notice{font-size:12px;color:var(--sub);background:#fafbfc;border:1px dashed var(--line);border-radius:10px;padding:11px 13px;margin-top:24px}
  /* 리치 블록 (in-app 리치가이드 톤) */
  .rg-sec{border-top:1px solid var(--line);margin-top:30px;padding-top:8px}.rg-sec:first-of-type{border-top:none;margin-top:18px}
  .rg-sec h2{font-family:var(--font-serif);display:flex;align-items:center;gap:8px;font-size:22px;font-weight:700;letter-spacing:-.01em;margin:12px 0 12px}.rg-sec h2 .s-ic{font-size:19px}
  .rb-h2{font-size:15.5px;font-weight:800;margin:20px 0 8px;color:var(--ink-900)}
  .tldr{border:1px solid var(--line);border-radius:12px;padding:18px;margin:18px 0;background:#fcfcfd}
  .tldr-t{font-family:var(--font-serif);font-size:15px;font-weight:700;color:var(--accent-ink);margin:0 2px 12px}
  .tldr-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .tldr-card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 12px;text-align:center}
  .tc-ic{font-size:22px}.tc-t{font-weight:800;font-size:15px;margin:6px 0 3px}.tc-d{font-size:12.5px;color:var(--sub)}
  .bignums{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:16px 0}
  .bignum{background:var(--panel);border-radius:10px;padding:16px 10px;text-align:center}
  .bignum .n{font-family:var(--font-serif);font-size:26px;font-weight:700;color:var(--brand);letter-spacing:-.01em}.bignum .l{font-size:12px;color:var(--sub);margin-top:4px}
  .steps2{list-style:none;padding:0}.steps2 li{display:flex;gap:11px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed var(--line)}
  .steps2 .sn{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--brand);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}
  .steps2 .st b{font-size:14.5px}.steps2 .st i{display:block;font-style:normal;font-size:12.5px;color:var(--sub)}
  .flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:6px;margin:14px 0}
  .flow .node{flex:1;min-width:104px;background:var(--panel);border-radius:12px;padding:12px 8px;text-align:center}
  .flow .nic{font-size:20px}.flow .nt{font-weight:700;font-size:13.5px;margin-top:3px}.flow .nd{font-size:11.5px;color:var(--sub)}
  .flow .arr{align-self:center;color:var(--sub);font-weight:700}
  .tline{margin:14px 0;border-left:2px solid var(--brand-soft);padding-left:14px}
  .tl-item{position:relative;padding:6px 0}.tl-item::before{content:"";position:absolute;left:-19px;top:11px;width:8px;height:8px;border-radius:50%;background:var(--brand)}
  .tl-when{font-weight:800;font-size:13px;color:var(--accent-ink)}.tl-what{font-size:13.5px;color:#374151}
  .selfcheck{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px;margin:16px 0}
  .sc-q{font-weight:800;font-size:15px;margin-bottom:10px}
  .sc-opt{font-size:13.5px;padding:9px 12px;border-radius:10px;margin-top:6px;background:#eef7f1;border:1px solid #cfe9d9}.sc-opt b{color:var(--ok)}
  .sc-opt.no{background:#f7f8fa;border-color:var(--line)}.sc-opt.no b{color:var(--sub)}
  .embedbox{display:flex;align-items:center;gap:12px;text-decoration:none;background:var(--brand-soft);border:1px solid #d4e2ff;border-radius:14px;padding:14px;margin:16px 0}
  .embedbox .eb-ic{font-size:22px}.embedbox .eb-tx{flex:1}.embedbox .eb-tx b{display:block;font-size:14.5px;color:var(--ink-900)}.embedbox .eb-tx i{font-style:normal;font-size:12.5px;color:var(--sub)}
  .embedbox .eb-cta{font-weight:800;font-size:13px;color:var(--accent-ink);white-space:nowrap}
  @media(max-width:560px){.related{grid-template-columns:1fr}.tldr-grid,.bignums{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
  <div class="top"><a href="/">인사<b>야</b> <span style="font-size:12px;font-weight:700;color:var(--sub)">노무 AI</span></a></div>
  <div class="wrap">
    <div class="crumb"><a href="/">홈</a> › ${a.cat} › ${a.title}</div>
    <h1>${a.title}</h1>
    <div class="meta"><span class="au">${AUTHOR.name} · 법령 기준 정리</span> · <span>최종 수정 ${updated}</span> · <span>약 ${x.read || 4}분</span></div>
    <div class="lead">${a.lead}</div>
    ${x.topCallout ? callout(x.topCallout) : ""}
    <nav class="toc"><div class="t">목차</div><ol>${toc}</ol></nav>
    ${body}
    ${check}
    <div class="cta">
      <div class="t">내 상황은 어떨까요?</div>
      <div class="d">AI가 쟁점·예상 금액·다음 행동을 정리해드립니다. (무료)</div>
      <a href="/#start=${a.from === "employer" ? "employer" : key}"><span class="tic">${ICON.chat}</span> 내 상황 AI로 진단하기</a>
    </div>
    ${faq ? `<h2 id="faq">자주 묻는 질문</h2>${faq}` : ""}
    ${rel ? `<h2>이런 글도 도움이 돼요</h2><div class="related">${rel}</div>` : ""}
    <div class="notice"><b>안내</b> · 본 글은 공개된 법령·정부 자료를 바탕으로 정리한 일반 정보 제공이며(공인노무사 감수를 받지 않았습니다), 법률·노무 자문이 아닙니다. 구체적 사안은 공인노무사 상담을 권장합니다.${a.note ? "<br/>" + a.note : ""}</div>
  </div>
</body>
</html>`;
}

// ---- 4) 출력 ----
const outDir = path.join(ROOT, "articles");
fs.mkdirSync(outDir, { recursive: true });
const keys = Object.keys(ARTICLES);
for (const k of keys) {
  fs.writeFileSync(path.join(outDir, `${k}.html`), page(k, ARTICLES[k]), "utf-8");
}

// sitemap.xml
const urls = [`${SITE_URL}/`, ...keys.map((k) => `${SITE_URL}/articles/${k}.html`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${keys.map((k) => `  <url><loc>${SITE_URL}/articles/${k}.html</loc><lastmod>${(ART_EXTRA[k] || {}).updated || "2026-06-01"}</lastmod><changefreq>monthly</changefreq></url>`).join("\n")}
  <url><loc>${SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>`;
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap, "utf-8");

// robots.txt
fs.writeFileSync(path.join(ROOT, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf-8");

console.log(`✅ 정적 페이지 ${keys.length}개 → /articles/*.html`);
console.log(`✅ sitemap.xml (${urls.length} URL) · robots.txt 생성`);
console.log(`   SITE_URL=${SITE_URL}  (배포 시 SITE_URL 환경변수로 도메인 지정)`);
