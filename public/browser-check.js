// Feature detection before the app loads (ADR 0008). Runs with the request's CSP nonce.
// The check list is a copy of src/lib/browser/support.ts (a test keeps them identical).
(function () {
  var checks = /*CHECKS:*/[{"id":"oklch","kind":"decl","prop":"color","value":"oklch(0.5 0.1 200)"},{"id":"color-mix","kind":"decl","prop":"color","value":"color-mix(in srgb, #000 50%, #fff)"},{"id":"where","kind":"selector","text":":where(a)"},{"id":"register-property","kind":"api","name":"CSS.registerProperty"},{"id":"readable-stream","kind":"api","name":"ReadableStream"}]/*END*/
  var css = window.CSS;
  function ok(c) {
    try {
      if (c.kind === "decl") return !!(css && css.supports && css.supports(c.prop, c.value));
      if (c.kind === "selector")
        return !!(css && css.supports && css.supports("selector(" + c.text + ")"));
      if (c.name === "CSS.registerProperty")
        return !!(css && typeof css.registerProperty === "function");
      return typeof window[c.name] !== "undefined";
    } catch {
      return false;
    }
  }
  var supported = true;
  for (var i = 0; i < checks.length; i++) {
    if (!ok(checks[i])) {
      supported = false;
      break;
    }
  }
  if (!supported && location.pathname !== "/unsupported.html") {
    location.replace("/unsupported.html");
  }
})();
