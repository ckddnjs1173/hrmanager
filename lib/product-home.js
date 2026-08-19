import fs from "node:fs";
import path from "node:path";
import { stripLegacyExternalFontLinks } from "./user-facing-page.js";

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
  const match = /<\/head>/i.exec(source);
  if (!match) return `${tag}\n${source}`;
  return `${source.slice(0, match.index)}${tag}\n${source.slice(match.index)}`;
}
function injectBodyTag(html = "", tag = "") {
  const source = String(html || "");
  if (!tag || source.includes(tag)) return source;
  const matches = [...source.matchAll(/<\/body>/gi)];
  const closingBody = matches.at(-1);
  if (!closingBody) return `${source}\n${tag}`;
  return `${source.slice(0, closingBody.index)}${tag}\n${source.slice(closingBody.index)}`;
}

export function injectProductHomeContentScript(html = "") { return injectHeadTag(html, PRODUCT_HOME_CONTENT_SCRIPT); }
export function injectProductGuideCatalogScript(html = "") { return injectHeadTag(html, PRODUCT_GUIDE_CATALOG_SCRIPT); }
export function injectProductPrivacyScript(html = "") { return injectBodyTag(html, PRODUCT_PRIVACY_SCRIPT); }
export function injectProductHomeScript(html = "") { return injectBodyTag(html, PRODUCT_HOME_SCRIPT); }
export function injectProductUiStyle(html = "") { return injectHeadTag(html, PRODUCT_UI_STYLE); }
export function injectProductUiScript(html = "") { return injectBodyTag(html, PRODUCT_UI_SCRIPT); }

export function prepareProductHomeHtml(html = "") {
  // Keep the monolithic inline runtime byte-for-byte intact for now. The legacy block
  // extraction helpers remain available, but regex-based extraction can cross nested
  // template literals in the real home document and corrupt interpolation at runtime.
  // External catalog scripts are still loaded as canonical migration data; switching the
  // inline runtime to them must use a parser/AST-safe migration rather than regex slicing.
  const localFontOnly = stripLegacyExternalFontLinks(html);
  return injectProductUiScript(
    injectProductHomeScript(
      injectProductPrivacyScript(
        injectProductUiStyle(
          injectProductGuideCatalogScript(injectProductHomeContentScript(localFontOnly)),
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
