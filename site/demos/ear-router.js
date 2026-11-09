// "Find the door": EAR Router's address rules (ported from ios/EarRouter/Services/AddressText.swift and the
// register matching in Geocoder.swift), run live against Vienna's own address register at data.wien.gv.at.
const CSS = `
.fd-form { display: grid; grid-template-columns: minmax(0, 1fr) 110px auto; gap: 8px; padding: 14px 16px 10px; }
.fd-form input, .fd-form select { min-height: 40px; border-radius: 9px; border: 1px solid var(--line-2); background: #0b0b0d; color: var(--text); font: 15px var(--sans); padding: 0 12px; min-width: 0; }
.fd-form input:focus, .fd-form select:focus { outline: 2px solid color-mix(in srgb, var(--c) 60%, transparent); outline-offset: 0; border-color: transparent; }
.fd-ex { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 16px 14px; }
.fd-ex button { border: 1px solid var(--line); background: var(--panel); color: var(--muted); border-radius: 999px; padding: 4px 10px; font: 12.5px var(--sans); cursor: pointer; text-align: left; }
.fd-ex button:hover { color: var(--text); border-color: var(--line-2); }
.fd-ex button b { color: var(--text); font-weight: 600; }
.fd-body { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); border-top: 1px solid var(--line); }
.fd-steps { padding: 6px 0; border-right: 1px solid var(--line); min-width: 0; }
.fd-step { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; padding: 9px 16px; }
.fd-step i { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font: 700 11px var(--mono); font-style: normal; background: var(--panel-2); color: var(--muted); }
.fd-step.ok i { background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); }
.fd-step.warn i { background: color-mix(in srgb, var(--warn) 22%, transparent); color: var(--warn); }
.fd-step.bad i { background: color-mix(in srgb, var(--bad) 22%, transparent); color: var(--bad); }
.fd-step b { font-size: 14px; font-weight: 600; display: block; }
.fd-step p { margin: 2px 0 0; color: var(--muted); font-size: 13.5px; line-height: 1.5; }
.fd-step code { font-size: 12.5px; }
.fd-cands { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; }
.fd-cands li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; font: 12px/1.5 var(--mono); color: var(--dim); padding: 3px 8px; border-radius: 6px; }
.fd-cands li.pick { color: var(--text); background: color-mix(in srgb, var(--c) 12%, transparent); }
.fd-cands li span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fd-map { position: relative; min-height: 340px; background: #0b0b0d; }
.fd-map canvas { filter: invert(.93) hue-rotate(180deg) saturate(.5) brightness(.92) contrast(.95); }
.fd-map .maplibregl-ctrl-attrib { background: rgba(14,14,16,.8) !important; color: #66666f; font-size: 10px; }
.fd-map .maplibregl-ctrl-attrib a { color: #a0a0ab; }
.fd-result { position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 2; background: rgba(14,14,16,.92); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 13.5px; backdrop-filter: blur(6px); }
.fd-result b { display: block; font-size: 15px; }
.fd-result span { color: var(--muted); font: 12px var(--mono); }
.fd-pin { width: 18px; height: 18px; border-radius: 50%; border: 3px solid #0e0e10; box-shadow: 0 0 0 2px var(--c), 0 6px 16px rgba(0,0,0,.6); background: var(--c); }
.fd-pin.ghost { background: #0e0e10; box-shadow: 0 0 0 2px #a0a0ab; width: 14px; height: 14px; }
.fd-empty { padding: 26px 16px; color: var(--dim); font-size: 13.5px; }
@media (max-width: 820px) { .fd-body { grid-template-columns: 1fr; } .fd-steps { border-right: 0; border-bottom: 1px solid var(--line); } .fd-map { min-height: 280px; } .fd-form { grid-template-columns: minmax(0, 1fr) 96px; } .fd-form .btn { grid-column: 1 / -1; } }
`;
const REGISTER = "https://data.wien.gv.at/daten/OGDAddressService.svc/GetAddressInfo";
const EXAMPLES = [
  ["Großfeldstraße 9/Parz.68", "1210", "a garden-colony plot"],
  ["Gentzgasse 129/1/2/23", "1180", "Stiege and Tür"],
  ["Doeblinger Hauptstrasse 1", "1190", "typed without umlauts"],
  ["Dr. Karl Lueger-Platz 1", "1010", "hyphens the way nobody types them"],
  ["Mariahilfer Str.120", "1070", "abbreviated and glued"],
  ["Gentzgasse 129/1", "1090", "wrong district"],
];

/* ── AddressText, ported ───────────────────────────────────── */
const fold = s => s.replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
const normalize = s => s.trim().replace(/\s+/g, " ").replace(/(s)tr\.(?=\s|$|\d)/gi, "$1traße").replace(/(s)trasse\b/gi, "$1traße");
const HOUSENUMBER = /^(.+?)\s+(\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?)(?:[/\s(].*)?$/;
const SUBADDR = /^(.+?)\s+(\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?)(?:\/|\s+)([^/]+)/;
const TAIL = /^.+?\s+\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?([/\s(].*)?$/;
const simplify = s => { const m = s.match(HOUSENUMBER); return m ? `${m[1]} ${m[2]}` : s; };
const streetOnly = s => { const m = s.match(HOUSENUMBER); return (m ? m[1] : s).trim(); };
const numberOf = s => { const m = s.match(HOUSENUMBER); return m ? m[2] : null; };
const matchKey = s => fold(normalize(s).toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const subKey = s => fold(s.replace(/\b(haus|stiege|stg)\b/gi, " ").toLowerCase()).replace(/[^\p{L}\p{N}]/gu, "");
const withSub = s => { const m = s.match(SUBADDR); if (!m) return null; const key = subKey(m[3].trim()); return key ? { query: `${m[1]} ${m[2]}/${m[3].trim()}`, key, sub: m[3].trim() } : null; };
const subOf = adresse => { const m = (adresse || "").match(TAIL); const t = m && m[1] && m[1].trim(); if (!t) return null; const k = subKey(t); return k || null; };
const restAfterSub = s => { const m = s.match(/^.+?\s+\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?(?:\/|\s+)(.+)$/); return m ? m[1].split("/").map(x => x.trim()).filter(Boolean) : []; };
function oneTypo(a, b) {
  if (a === b || Math.min(a.length, b.length) < 8 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; } }
  return e + (a.length - i) + (b.length - j) === 1;
}
const metres = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

async function ask(query) {
  const t0 = performance.now();
  const r = await fetch(`${REGISTER}?Address=${encodeURIComponent(query)}&crs=EPSG:4326`);
  if (!r.ok) throw new Error(`register answered ${r.status}`);
  const text = await r.text();                       // no matches = HTTP 200 with an empty body
  return { features: text ? JSON.parse(text).features || [] : [], ms: Math.round(performance.now() - t0) };
}
// Geocoder.pickFeature, simplified: right district, right street (or one typo off a placed answer), then the door.
function pick(features, plz, streetKey, requireSub, number) {
  const why = new Map();
  const inDistrict = features.filter(f => { const ok = f.properties.PostalCode === plz; if (!ok) why.set(f, `other district (${f.properties.PostalCode || "?"})`); return ok; });
  const name = f => matchKey(f.properties.StreetName || "");
  let pool = inDistrict.filter(f => name(f) === streetKey);
  if (!pool.length) pool = inDistrict.filter(f => (f.properties.Ranking ?? 9) < 1 && oneTypo(name(f), streetKey));
  inDistrict.forEach(f => { if (!pool.includes(f)) why.set(f, "other street"); });
  const own = number ? pool.filter(f => (f.properties.StreetNumber || "").split(/[\s/]/)[0].toLowerCase() === number.toLowerCase()) : pool;
  const rank = (a, b) => (a.properties.Ranking ?? 9) - (b.properties.Ranking ?? 9);
  const exactSub = list => requireSub ? list.filter(f => subOf(f.properties.Adresse) === requireSub).sort(rank)[0] : list.slice().sort(rank)[0];
  const hit = exactSub(own) || exactSub(pool);
  pool.forEach(f => { if (f !== hit && !why.has(f)) why.set(f, requireSub && subOf(f.properties.Adresse) !== requireSub ? "other door" : "ranked lower"); });
  return { hit, why };
}

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  if (!document.getElementById("ml-css")) document.head.insertAdjacentHTML("beforeend", `<link id="ml-css" rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">`);
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

export default function (el, { p, esc, onLeave }) {
  if (!document.getElementById("css-fd")) document.head.insertAdjacentHTML("beforeend", `<style id="css-fd">${CSS}</style>`);
  const plzs = Array.from({ length: 23 }, (_, i) => `1${String(i + 1).padStart(2, "0")}0`);
  el.innerHTML = `
    <form class="fd-form" id="fd-form" autocomplete="off">
      <input id="fd-addr" aria-label="Address" placeholder="Street, number, and whatever the list adds" value="${EXAMPLES[0][0]}">
      <select id="fd-plz" aria-label="Postcode">${plzs.map(z => `<option${z === EXAMPLES[0][1] ? " selected" : ""}>${z}</option>`).join("")}</select>
      <button class="btn tint" type="submit">Find the door</button>
    </form>
    <div class="fd-ex">${EXAMPLES.map(([a, z, d], i) => `<button type="button" data-i="${i}"><b>${esc(a)}</b>, ${z} · ${esc(d)}</button>`).join("")}</div>
    <div class="fd-body">
      <div class="fd-steps" id="fd-steps"><div class="fd-empty">Pick an example or type an address.</div></div>
      <div class="fd-map" id="fd-map"><div class="fd-result" id="fd-result" hidden></div></div>
    </div>`;
  const $ = s => el.querySelector(s);
  let map = null, pins = [], run = 0;
  const mapReady = loadMapLibre().then(() => {
    if (!document.body.contains(el)) return;
    map = new maplibregl.Map({ container: $("#fd-map"), style: "https://tiles.openfreemap.org/styles/positron", center: [16.37, 48.21], zoom: 11, attributionControl: { compact: true }, dragRotate: false, cooperativeGestures: matchMedia("(pointer: coarse)").matches });
    map.touchZoomRotate.disableRotation();
    map.on("styleimagemissing", e => { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    onLeave(() => map.remove());
  }).catch(() => {});

  const step = (cls, n, title, body) => `<div class="fd-step ${cls}"><i>${n}</i><div><b>${title}</b>${body ? `<p>${body}</p>` : ""}</div></div>`;
  const cands = (features, hit, why) => features.length ? `<ul class="fd-cands">${features.slice(0, 6).map(f => `<li class="${f === hit ? "pick" : ""}"><span>${esc(f.properties.Adresse)} · ${esc(f.properties.PostalCode || "")}</span><span>${f === hit ? "✓ taken" : esc(why.get(f) || "")}</span></li>`).join("")}${features.length > 6 ? `<li><span>… ${features.length - 6} more</span><span></span></li>` : ""}</ul>` : "";

  async function find(addr, plz) {
    const me = ++run, out = [];
    const paint = () => { if (me === run) $("#fd-steps").innerHTML = out.join(""); };
    $("#fd-result").hidden = true;
    const norm = normalize(addr), simp = simplify(norm), sub = withSub(norm), street = streetOnly(simp), num = numberOf(simp);
    const rest = restAfterSub(norm);
    out.push(step(norm !== addr.trim() ? "ok" : "", 1, "Normalise the spelling", norm !== addr.trim() ? `<code>${esc(addr.trim())}</code> → <code>${esc(norm)}</code>` : "Nothing to fix."));
    if (num) {
      const dropped = rest.slice(1);
      out.push(step(sub ? "ok" : "", 2, sub ? "Split off the door" : "No sub-address",
        sub ? `Street <code>${esc(street)}</code>, number <code>${esc(num)}</code>, sub-address <code>${esc(sub.sub)}</code>${dropped.length ? `. Dropped <code>${esc(dropped.join("/"))}</code>: Tür and Stock, which no register indexes.` : "."}`
            : `Street <code>${esc(street)}</code>, number <code>${esc(num)}</code>.`));
    } else out.push(step("warn", 2, "No house number found", "The register can't place a street without one."));
    paint();

    let hit = null, features = [], used = null, ms = 0, why = new Map(), bare = null;
    try {
      const queries = sub ? [[sub.query, sub.key], [simp, null]] : [[simp, null]];
      for (const [q, need] of queries) {
        const a = await ask(q); if (me !== run) return;
        ms += a.ms; features = a.features; used = q;
        const r = pick(features, plz, matchKey(street), need, num); why = r.why;
        out.push(step(r.hit ? "ok" : "warn", out.length + 1, `Ask the city: <code>${esc(q)}</code>`, `${features.length} answer${features.length === 1 ? "" : "s"} from data.wien.gv.at in ${a.ms} ms${need ? `, only the door <code>${esc(sub.sub)}</code> counts` : ""}.` + cands(features, r.hit, r.why)));
        paint();
        if (r.hit) { hit = r.hit; break; }
      }
      if (hit && sub) {   // where the bare house number would have put the pin
        const b = await ask(simp); if (me !== run) return;
        const bh = pick(b.features, plz, matchKey(street), null, num).hit;
        if (bh && bh.properties.Adresse !== hit.properties.Adresse) bare = bh;
      }
      if (!hit && num) {  // Geocoder.districtHint: does every answer agree on one other district?
        const a = await ask(simp); if (me !== run) return;
        const codes = new Set(a.features.filter(f => matchKey(f.properties.StreetName || "") === matchKey(street)).map(f => f.properties.PostalCode).filter(Boolean));
        if (codes.size === 1 && [...codes][0] !== plz) {
          const other = [...codes][0];
          out.push(step("bad", out.length + 1, `Not in ${plz}. It's in ${other}.`, `Every answer for this street agrees on ${other}, so the app offers a one-tap “move it to ${other}” instead of a district-centre pin. <a href="#" data-move="${other}">Move it</a>`));
        } else out.push(step("bad", out.length + 1, "Not in the register", "The app would fall back to Nominatim here, and mark the pin “≈” so the driver checks it."));
        paint(); return;
      }
    } catch (e) {
      out.push(step("bad", out.length + 1, "The register didn't answer", `${esc(e.message || e)}. The app answers from its offline copy then.`)); paint(); return;
    }
    if (!hit) { paint(); return; }
    const pt = hit.geometry.coordinates, exact = !sub || subOf(hit.properties.Adresse) === sub.key;
    out.push(step(exact ? "ok" : "warn", out.length + 1, exact ? "The exact door" : "Close, but not provably the door",
      exact ? (bare ? (() => { const m = Math.round(metres(pt, bare.geometry.coordinates)); return m >= 20
              ? `Asked for just <code>${esc(simp)}</code>, the register answers <code>${esc(bare.properties.Adresse)}</code>, <b>${m} m</b> away. That's where the van would have stopped without the sub-address.`
              : `Here the bare number is the same front door (${m} m apart). On a big Gemeindebau or a garden colony it isn't.`; })() : (hit.properties.StreetName && hit.properties.StreetName !== street
              ? `The city spells it <code>${esc(hit.properties.StreetName)}</code>. Compared as plain text that's another street, and the app would have thrown away the right answer. Its match key folds umlauts and punctuation, so both read <code>${esc(matchKey(street))}</code>.`
              : "The house number itself, placed by the city."))
            : "The register didn't have that sub-address. The app shows this as “≈” so the driver checks it."));
    paint();
    await mapReady; if (me !== run || !map) return;
    pins.forEach(m => m.remove()); pins = [];
    const mk = (c, cls) => { const e = document.createElement("div"); e.className = "fd-pin " + cls; e.style.setProperty("--c", p.color); pins.push(new maplibregl.Marker({ element: e }).setLngLat(c).addTo(map)); };
    if (bare) mk(bare.geometry.coordinates, "ghost");
    mk(pt, "");
    const bounds = new maplibregl.LngLatBounds(pt, pt); if (bare) bounds.extend(bare.geometry.coordinates);
    map.fitBounds(bounds, { padding: { top: 50, bottom: 110, left: 50, right: 50 }, maxZoom: 17, duration: 900 });
    const res = $("#fd-result"); res.hidden = false;
    res.innerHTML = `<b>${esc(hit.properties.Adresse)}, ${esc(hit.properties.PostalCode)} Wien</b><span>${pt[1].toFixed(5)}, ${pt[0].toFixed(5)} · ${exact ? "exact" : "≈ check it"}${bare ? ` · grey: the bare number` : ""}</span>`;
  }
  $("#fd-form").onsubmit = e => { e.preventDefault(); const a = $("#fd-addr").value.trim(); if (a) find(a, $("#fd-plz").value); };
  el.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { const [a, z] = EXAMPLES[+b.dataset.i]; $("#fd-addr").value = a; $("#fd-plz").value = z; find(a, z); });
  el.addEventListener("click", e => { const m = e.target.closest("[data-move]"); if (m) { e.preventDefault(); $("#fd-plz").value = m.dataset.move; find($("#fd-addr").value, m.dataset.move); } });
  onLeave(() => run++);
  find(EXAMPLES[0][0], EXAMPLES[0][1]);
}
