import fs from "node:fs";
import path from "node:path";

const LEGACY_FONT_LINKS = [
  /\s*<link[^>]+href=["'][^"']*cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard[^"']*["'][^>]*>\s*/gi,
  /\s*<link[^>]+href=["'][^"']*fonts\.googleapis\.com\/css2\?family=Noto\+Serif\+KR[^"']*["'][^>]*>\s*/gi,
  /\s*<link[^>]+href=["']https:\/\/fonts\.googleapis\.com["'][^>]*>\s*/gi,
  /\s*<link[^>]+href=["']https:\/\/fonts\.gstatic\.com["'][^>]*>\s*/gi,
];
const CANONICAL_FAVICON = '<link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">';

export function stripLegacyExternalFontLinks(html = "") {
  let source = String(html || "");
  for (const pattern of LEGACY_FONT_LINKS) source = source.replace(pattern, "\n");
  return source;
}

function injectIntoHead(html, tags = []) {
  const additions = tags.filter(Boolean).filter((tag) => !html.includes(tag));
  if (!additions.length) return html;
  const match = /<\/head>/i.exec(html);
  if (!match) return `${additions.join("\n")}\n${html}`;
  return `${html.slice(0, match.index)}${additions.join("\n")}\n${html.slice(match.index)}`;
}
function injectIntoBody(html, tags = []) {
  const additions = tags.filter(Boolean).filter((tag) => !html.includes(tag));
  if (!additions.length) return html;
  const matches = [...html.matchAll(/<\/body>/gi)];
  const closingBody = matches.at(-1);
  if (!closingBody) return `${html}\n${additions.join("\n")}`;
  return `${html.slice(0, closingBody.index)}${additions.join("\n")}\n${html.slice(closingBody.index)}`;
}

export function transformUserFacingHtml(html = "", { styles = [], scripts = [], stripExternalFonts = true } = {}) {
  const styleTags = styles.map((href) => `<link rel="stylesheet" href="${href}">`);
  const scriptTags = scripts.map((src) => `<script src="${src}"></script>`);
  const source = stripExternalFonts ? stripLegacyExternalFontLinks(html) : String(html || "");
  const headTags = /<link[^>]+rel=["']icon["']/i.test(source) ? styleTags : [CANONICAL_FAVICON, ...styleTags];
  return injectIntoBody(injectIntoHead(source, headTags), scriptTags);
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
