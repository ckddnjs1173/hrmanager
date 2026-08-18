import fs from "node:fs";
import path from "node:path";

export const PRODUCT_HOME_CONTENT_SCRIPT = '<script src="/content/home-navigation.js"></script>';
export const PRODUCT_GUIDE_CATALOG_SCRIPT = '<script src="/content/guide-catalog.js"></script>';
export const PRODUCT_PRIVACY_SCRIPT = '<script src="/privacy-delete-client.js"></script>';
export const PRODUCT_HOME_SCRIPT = '<script type="module" src="/wage-intake-launcher.js"></script>';
export const PRODUCT_UI_STYLE = '<link rel="stylesheet" href="/assets/brand/product-ui.css">';
export const PRODUCT_UI_SCRIPT = '<script src="/product-ui.js"></script>';

const LEGACY_HOME_NAV_BLOCK = /const SITES=\{[\s\S]*?\n\};\nlet currentSite=null;/;
const EXTERNAL_HOME_NAV_BINDING = `const SITES=window.INSAYA_HOME_NAV?.SITES||{};
const CATS={
  worker:(window.INSAYA_HOME_NAV?.CATS?.worker||[]).map(item=>({...item,...(item.action?{go:()=>nav(item.action)}:{})})),
  employer:(window.INSAYA_HOME_NAV?.CATS?.employer||[]).map(item=>({...item,...(item.action?{go:()=>nav(item.action)}:{})})),
};
let currentSite=null;`;

const LEGACY_GUIDE_CATALOG_BLOCK = /const TOPICS=\{[\s\S]*?\n\};\nfunction renderHub\(which\)/;
const EXTERNAL_GUIDE_CATALOG_BINDING = `const TOPICS=window.INSAYA_GUIDE_CATALOG?.TOPICS||{worker:[],employer:[]};
function renderHub(which)`;

export function replaceLegacyHomeNavigationSource(html = "") {
  const source = String(html || "");
  if (!LEGACY_HOME_NAV_BLOCK.test(source)) return source;
  return source.replace(LEGACY_HOME_NAV_BLOCK, EXTERNAL_HOME_NAV_BINDING);
}

export function replaceLegacyGuideCatalogSource(html = "") {
  const source = String(html || "");
  if (!LEGACY_GUIDE_CATALOG_BLOCK.test(source)) return source;
  return source.replace(LEGACY_GUIDE_CATALOG_BLOCK, EXTERNAL_GUIDE_CATALOG_BINDING);
}

function injectHeadTag(html = "", tag = "") {
  const source = String(html || "");
  if (!tag || source.includes(tag)) return source;
  if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `${tag}\n</head>`);
  return `${tag}\n${source}`;
}
function injectBodyTag(html = "", tag = "") {
  const source = String(html || "");
  if (!tag || source.includes(tag)) return source;
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${tag}\n</body>`);
  return `${source}\n${tag}`;
}

export function injectProductHomeContentScript(html = "") { return injectHeadTag(html, PRODUCT_HOME_CONTENT_SCRIPT); }
export function injectProductGuideCatalogScript(html = "") { return injectHeadTag(html, PRODUCT_GUIDE_CATALOG_SCRIPT); }
export function injectProductPrivacyScript(html = "") { return injectBodyTag(html, PRODUCT_PRIVACY_SCRIPT); }
export function injectProductHomeScript(html = "") { return injectBodyTag(html, PRODUCT_HOME_SCRIPT); }
export function injectProductUiStyle(html = "") { return injectHeadTag(html, PRODUCT_UI_STYLE); }
export function injectProductUiScript(html = "") { return injectBodyTag(html, PRODUCT_UI_SCRIPT); }

export function prepareProductHomeHtml(html = "") {
  const migrated = replaceLegacyGuideCatalogSource(replaceLegacyHomeNavigationSource(html));
  return injectProductUiScript(
    injectProductHomeScript(
      injectProductPrivacyScript(
        injectProductUiStyle(
          injectProductGuideCatalogScript(injectProductHomeContentScript(migrated)),
        ),
      ),
    ),
  );
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
