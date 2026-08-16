import vm from "node:vm";

function createNoop() {
  let noop;
  noop = new Proxy(function () {}, {
    get: () => noop,
    apply: () => noop,
    set: () => true,
    construct: () => noop,
  });
  return noop;
}

export function extractLegacyContent(html = "", names = []) {
  const source = String(html || "");
  const match = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("legacy_inline_script_not_found");

  const requested = [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
  if (!requested.length) return {};

  const noop = createNoop();
  const context = {
    document: {
      getElementById: () => noop,
      querySelector: () => noop,
      querySelectorAll: () => [],
      createElement: () => noop,
      addEventListener: () => {},
      title: "",
    },
    location: { hash: "", search: "", pathname: "/" },
    history: { replaceState: () => {} },
    navigator: {},
    alert: () => {},
    fetch: () => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    }),
    console,
    setTimeout: () => {},
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = () => {};

  vm.createContext(context);
  const assignments = requested
    .map((name) => `${JSON.stringify(name)}:(typeof ${name}!=='undefined'?${name}:undefined)`)
    .join(",");
  vm.runInContext(`${match[1]}\n;globalThis.__INSAYA_CONTENT__={${assignments}};`, context);

  return context.__INSAYA_CONTENT__ || {};
}

export function extractBrowserGlobal(source = "", globalName = "") {
  const key = String(globalName || "").trim();
  if (!key) throw new Error("browser_global_name_required");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(String(source || ""), context);
  return context.window[key];
}
