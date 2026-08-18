import fs from "node:fs";
import path from "node:path";

const LEGACY_FONT_LINKS = [
  /\s*<link[^>]+href=["'][^"']*cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard[^"']*["'][^>]*>\s*/gi,
  /\s*<link[^>]+href=["'][^"']*fonts\.googleapis\.com\/css2\?family=Noto\+Serif\+KR[^"']*["'][^>]*>\s*/gi,
  /\s*<link[^>]+href=["']https:\/\/fonts\.googleapis\.com["'][^>]*>\s*/gi,
  /\s*<link[^>]+href=["']https:\/\/fonts\.gstatic\.com["'][^>]*>\s*/gi,
];

export function stripLegacyExternalFontLinks(html = "") {
  let source = String(html || "");
  for (const pattern of LEGACY_FONT_LINKS) source = source.replace(pattern, "\n");
  return source;
}

function injectIntoHead(html, tags = []) {
  const additions = tags.filter(Boolean).filter((tag) => !html.includes(tag));
  if (!additions.length) return html;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${additions.join("\n")}\n</head>`) : `${additions.join("\n")}\n${html}`;
}
function injectIntoBody(html, tags = []) {
  const additions = tags.filter(Boolean).filter((tag) => !html.includes(tag));
  if (!additions.length) return html;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${additions.join("\n")}\n</body>`) : `${html}\n${additions.join("\n")}`;
}

export function transformUserFacingHtml(html = "", { styles = [], scripts = [], stripExternalFonts = true } = {}) {
  const styleTags = styles.map((href) => `<link rel="stylesheet" href="${href}">`);
  const scriptTags = scripts.map((src) => `<script src="${src}"></script>`);
  const source = stripExternalFonts ? stripLegacyExternalFontLinks(html) : String(html || "");
  return injectIntoBody(injectIntoHead(source, styleTags), scriptTags);
}

export function createUserFacingPageHandler(rootDir, fileName, options = {}) {
  const filePath = path.join(rootDir, fileName);
  return (_req, res, next) => {
    fs.readFile(filePath, "utf8", (error, html) => {
      if (error) return next(error);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.send(transformUserFacingHtml(html, options));
    });
  };
}
