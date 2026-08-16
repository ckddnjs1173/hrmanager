import fs from "node:fs";
import path from "node:path";

export const PRODUCT_HOME_CONTENT_SCRIPT = '<script src="/content/home-navigation.js"></script>';
export const PRODUCT_HOME_SCRIPT = '<script type="module" src="/wage-intake-launcher.js"></script>';

const LEGACY_HOME_NAV_BLOCK = /const SITES=\{[\s\S]*?\n\};\nlet currentSite=null;/;
const EXTERNAL_HOME_NAV_BINDING = `const SITES=window.INSAYA_HOME_NAV?.SITES||{};
const CATS={
  worker:(window.INSAYA_HOME_NAV?.CATS?.worker||[]).map(item=>({...item,...(item.action?{go:()=>nav(item.action)}:{})})),
  employer:(window.INSAYA_HOME_NAV?.CATS?.employer||[]).map(item=>({...item,...(item.action?{go:()=>nav(item.action)}:{})})),
};
let currentSite=null;`;

export function replaceLegacyHomeNavigationSource(html = "") {
  const source = String(html || "");
  if (!LEGACY_HOME_NAV_BLOCK.test(source)) return source;
  return source.replace(LEGACY_HOME_NAV_BLOCK, EXTERNAL_HOME_NAV_BINDING);
}

export function injectProductHomeContentScript(html = "") {
  const source = String(html || "");
  if (source.includes(PRODUCT_HOME_CONTENT_SCRIPT)) return source;
  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${PRODUCT_HOME_CONTENT_SCRIPT}\n</head>`);
  }
  return `${PRODUCT_HOME_CONTENT_SCRIPT}\n${source}`;
}

export function injectProductHomeScript(html = "") {
  const source = String(html || "");
  if (source.includes(PRODUCT_HOME_SCRIPT)) return source;
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${PRODUCT_HOME_SCRIPT}\n</body>`);
  }
  return `${source}\n${PRODUCT_HOME_SCRIPT}`;
}

export function prepareProductHomeHtml(html = "") {
  return injectProductHomeScript(injectProductHomeContentScript(replaceLegacyHomeNavigationSource(html)));
}

export function createProductHomeHandler(rootDir) {
  const indexPath = path.join(rootDir, "index.html");

  return (req, res, next) => {
    fs.readFile(indexPath, "utf8", (err, html) => {
      if (err) return next(err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.send(prepareProductHomeHtml(html));
    });
  };
}