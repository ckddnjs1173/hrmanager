import fs from "node:fs";
import path from "node:path";

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

export function transformUserFacingHtml(html = "", { styles = [], scripts = [] } = {}) {
  const styleTags = styles.map((href) => `<link rel="stylesheet" href="${href}">`);
  const scriptTags = scripts.map((src) => `<script src="${src}"></script>`);
  return injectIntoBody(injectIntoHead(String(html || ""), styleTags), scriptTags);
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
