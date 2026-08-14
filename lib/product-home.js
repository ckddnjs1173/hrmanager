import fs from "node:fs";
import path from "node:path";

export const PRODUCT_HOME_SCRIPT = '<script type="module" src="/wage-intake-launcher.js"></script>';

export function injectProductHomeScript(html = "") {
  const source = String(html || "");
  if (source.includes(PRODUCT_HOME_SCRIPT)) return source;
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${PRODUCT_HOME_SCRIPT}\n</body>`);
  }
  return `${source}\n${PRODUCT_HOME_SCRIPT}`;
}

export function createProductHomeHandler(rootDir) {
  const indexPath = path.join(rootDir, "index.html");

  return (req, res, next) => {
    fs.readFile(indexPath, "utf8", (err, html) => {
      if (err) return next(err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.send(injectProductHomeScript(html));
    });
  };
}
