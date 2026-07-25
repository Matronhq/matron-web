/*
 * probe.js — dump computed values for every tagged specimen.
 *
 * Design side:  load any redesign-v5/static/*.html and run this (headless or devtools).
 * Live side:    load the running app and run this with MODE='live' — it walks
 *               component-map.json's selectors instead of [data-spec].
 *
 * Ships as a script rather than a pre-dumped values file on purpose: a hand-written
 * values file drifts from the artifact the moment either changes, which is the exact
 * failure mode this whole package exists to avoid. One render produces the numbers,
 * and they are true by construction. Output is JSON on stdout / the return value.
 */
(() => {
  const PROPS = [
    "font", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textTransform",
    "color", "backgroundColor",
    "borderTopWidth", "borderTopStyle", "borderTopColor", "borderRadius",
    "padding", "margin", "gap", "display", "flexDirection", "alignItems", "justifyContent",
    "gridTemplateColumns", "width", "height", "minHeight", "maxWidth", "minWidth",
    "opacity", "outline", "outlineOffset", "boxShadow", "overflow", "textOverflow", "whiteSpace",
  ];

  const pick = (el) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of PROPS) {
      const v = cs[p];
      if (v && v !== "none" && v !== "normal" && v !== "auto" && v !== "0px") out[p] = v;
    }
    const r = el.getBoundingClientRect();
    out._box = { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    if (el.scrollWidth > el.clientWidth + 1) out._overflowsX = el.scrollWidth - el.clientWidth;
    return out;
  };

  const stateMeta = document.querySelector('meta[name="matron-state"]');

  // design side: everything tagged
  const design = [...document.querySelectorAll("[data-spec]")].map((el) => ({
    spec: el.dataset.spec,
    target: el.dataset.target || null,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || "").trim().slice(0, 80),
    computed: pick(el),
    designedStates: {
      hover: el.dataset.styleHover || null,
      active: el.dataset.styleActive || null,
      focus: el.dataset.styleFocus || null,
    },
  }));

  const result = {
    mode: stateMeta ? "design" : "live",
    state: stateMeta ? stateMeta.content : location.pathname,
    note: document.querySelector('meta[name="matron-state-note"]')?.content || null,
    theme: document.documentElement.dataset.theme || null,
    viewport: { w: innerWidth, h: innerHeight },
    tokens: (() => {
      const cs = getComputedStyle(document.documentElement);
      const t = {};
      for (const name of ["--m-app","--m-panel","--m-paper","--m-raised","--m-overlay","--m-ink","--m-ink2","--m-ink3","--m-line","--m-line2","--m-accent","--m-accent-deep","--m-on-accent","--m-self","--m-subtle","--m-subtle2","--m-hover","--m-active","--m-selected","--m-track","--m-green","--m-amber","--m-red","--m-crit"]) {
        const v = cs.getPropertyValue(name).trim();
        if (v) t[name] = v;
      }
      return t;
    })(),
    specimens: design,
  };

  // live side: resolve component-map selectors instead (paste the map in as MAP)
  if (typeof MAP !== "undefined" && MAP && MAP.components) {
    result.mode = "live";
    result.specimens = MAP.components
      .filter((c) => c.status === "implemented" && c.selector && c.selector !== "—")
      .map((c) => {
        const sel = c.selector.split(/\s*(?:→|\/|\(|,)/)[0].trim();
        let el = null;
        try { el = document.querySelector(sel); } catch { /* selector is prose, skip */ }
        return {
          spec: c.spec, selector: sel, found: Boolean(el),
          visualClaim: c.visual || null,
          computed: el ? pick(el) : null,
        };
      });
  }

  console.log(JSON.stringify(result, null, 2));
  return result;
})();
