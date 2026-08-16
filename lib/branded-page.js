export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderStateMarkup(icon, title, description) {
  return `<div class="rv-state"><div class="ic">${icon}</div><div class="t">${title}</div><p>${description}</p></div>`;
}

export function renderBrandedPage(title, inner) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex"/><title>${title} · 인사야</title>
  <link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg"/>
  <link rel="stylesheet" href="/assets/brand/app.css"/>
  <style>
    body{padding:0}
    .rv-top{background:#fff;border-bottom:1px solid var(--line);padding:1rem 1.2rem;display:flex;align-items:center;gap:.5rem;font-weight:800;color:var(--ink-900)}
    .rv-top .b{color:var(--accent)}
    .rv-wrap{max-width:640px;margin:0 auto;padding:1.4rem 1.1rem}
    .rv-card{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:1.5rem 1.4rem;box-shadow:var(--e1)}
    .rv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.6rem;border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:1rem}
    .rv-eb{font-size:.74rem;font-weight:800;color:var(--accent-ink)}
    .rv-title{font-size:1.25rem;font-weight:800;color:var(--ink-900);margin-top:.2rem}
    .rv-row{display:flex;gap:.8rem;padding:.6rem 0;border-bottom:1px dashed var(--line);font-size:.95rem}
    .rv-row .k{width:88px;color:var(--ink-400);font-weight:700;flex-shrink:0}
    .rv-row .v{color:var(--ink-800)}
    .rv-sum{margin-top:1rem}
    .rv-sum .k{color:var(--accent-ink);font-weight:800;font-size:.9rem;margin-bottom:.4rem}
    .rv-sum pre{white-space:pre-wrap;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:1rem;font-family:inherit;font-size:.92rem;color:var(--ink-700);margin:0}
    .rv-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem}
    .rv-note{margin-top:1.2rem;background:var(--accent-soft);border-radius:var(--r-md);padding:.9rem 1rem;font-size:.82rem;color:var(--ink-600);line-height:1.6}
    .rv-state{text-align:center;padding:2.5rem 1rem}
    .rv-state .ic{font-size:3rem}
    .rv-state .t{font-size:1.2rem;font-weight:800;color:var(--ink-900);margin:.6rem 0 .3rem}
    .rv-state p{color:var(--ink-400);font-size:.92rem;margin:0}
    @media print{.no-print{display:none!important}.rv-top{border:none}.rv-card{box-shadow:none;border:none}body{background:#fff}}
  </style></head>
  <body>
    <div class="rv-top no-print"><span class="b">●</span> 인사야</div>
    <div class="rv-wrap"><div class="rv-card">${inner}</div></div>
  </body></html>`;
}
