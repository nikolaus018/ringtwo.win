/* ringtwo.win
   Content: projects.json. Toys: demos/<id>.js (export default function (el, ctx)).
   Live data: /api/host (the mini PC), /api/github, /api/commits (server.py). */

const $ = (s, el = document) => el.querySelector(s);
const V = new URL(import.meta.url).searchParams.get("v") || "";   // build version, so Cloudflare's 4 h cache never serves an old demo
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const main = $("#main");
let DATA, COMMITS, GH = {}, HOST = null;
const cleanup = [];

/* ── helpers ──────────────────────────────────────────────── */
export function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return "just now";
  const m = s / 60, h = m / 60, d = h / 24;
  if (m < 60) return `${Math.round(m)} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  if (d < 14) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}
const dur = s => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const bytes = n => n == null ? "—" : n > 1e9 ? (n / 1e9).toFixed(1) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : n > 1e3 ? Math.round(n / 1e3) + " kB" : n + " B";
const age = () => { const [y, m] = DATA.born.split("-").map(Number), n = new Date(); return n.getFullYear() - y - (n.getMonth() + 1 < m ? 1 : 0); };
const proj = id => DATA.projects.find(p => p.id === id);
const commitsOf = p => (COMMITS.totals || {})[p.repo] || 0;
const totalCommits = () => DATA.projects.reduce((a, p) => a + commitsOf(p), 0);
const json = u => fetch(u, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject(r.status));
const onLeave = fn => cleanup.push(fn);

/* ── card previews: small looping SVG scenes, no JS ───────── */
const MONO = `font-family="ui-monospace,SFMono-Regular,Menlo,monospace"`;
const PREVIEW = {
  venvy: c => `<svg viewBox="0 0 320 200" aria-hidden="true">
    ${["pull", "install", "build", "restart", "health"].map((t, i) => `<g transform="translate(${44 + i * 58} 86)">
      ${i < 4 ? `<line x1="13" x2="45" stroke="#34343c" stroke-width="2"/>` : ""}
      <circle r="13" fill="#1f1f24" stroke="#34343c"/>
      <circle r="13" fill="${i === 4 ? "#e5533d" : c}" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${(.06 + i * .1).toFixed(2)};${(.09 + i * .1).toFixed(2)};.86;1" dur="5.5s" repeatCount="indefinite"/></circle>
      <text y="34" text-anchor="middle" ${MONO} font-size="10" fill="#66666f">${t}</text></g>`).join("")}
    <path d="M276 66 C 250 24, 70 24, 44 66" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="4 5" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.56;.6;.86;1" dur="5.5s" repeatCount="indefinite"/></path>
    <g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.62;.66;.86;1" dur="5.5s" repeatCount="indefinite"/>
      <rect x="88" y="144" width="144" height="26" rx="7" fill="#17171a" stroke="${c}"/><text x="160" y="161" text-anchor="middle" ${MONO} font-size="11" fill="#ececf1">✓ rolled back to v12</text></g></svg>`,

  passable: () => {
    const bars = seed => Array.from({ length: 44 }, (_, i) => 6 + Math.abs(Math.sin(i * 1.7 + seed) * 18 + Math.sin(i * .37 + seed * 2) * 12));
    const A = bars(1), B = bars(4);
    return `<svg viewBox="0 0 320 200" aria-hidden="true"><defs>
      <linearGradient id="pa" x1="0" x2="1"><stop offset=".38" stop-color="#5b8def"/><stop offset=".72" stop-color="#5b8def" stop-opacity=".1"/></linearGradient>
      <linearGradient id="pb" x1="0" x2="1"><stop offset=".32" stop-color="#f0894a" stop-opacity=".1"/><stop offset=".66" stop-color="#f0894a"/></linearGradient></defs>
      <rect x="128" y="14" width="78" height="172" rx="6" fill="#fff" opacity=".035"/>
      <text x="167" y="28" text-anchor="middle" ${MONO} font-size="9.5" fill="#66666f">blend</text>
      ${A.map((h, i) => `<rect x="${24 + i * 6.3}" y="${72 - h}" width="3.8" height="${h * 2}" rx="1.6" fill="url(#pa)"/>`).join("")}
      ${B.map((h, i) => `<rect x="${24 + i * 6.3}" y="${140 - h}" width="3.8" height="${h * 2}" rx="1.6" fill="url(#pb)"/>`).join("")}
      <line y1="12" y2="188" stroke="#fff" stroke-width="2"><animate attributeName="x1" from="24" to="300" dur="7s" repeatCount="indefinite"/><animate attributeName="x2" from="24" to="300" dur="7s" repeatCount="indefinite"/></line></svg>`;
  },

  "ear-router": c => `<svg viewBox="0 0 320 200" aria-hidden="true">
    <rect x="20" y="22" width="280" height="34" rx="8" fill="#0b0b0d" stroke="#34343c"/>
    <text x="34" y="44" ${MONO} font-size="13" fill="#ececf1">Großfeldstraße 9<tspan fill="${c}">/Parz.68</tspan><tspan fill="#66666f">/2/4</tspan></text>
    <g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.15;.22;.92;1" dur="6s" repeatCount="indefinite"/>
      <text x="34" y="78" ${MONO} font-size="10" fill="#66666f">street · number · <tspan fill="${c}">plot</tspan> · <tspan text-decoration="line-through">door</tspan></text></g>
    <g transform="translate(0 92)">
      ${[[40, 20, 70, 44], [126, 14, 60, 36], [200, 26, 84, 40], [52, 76, 64, 26], [140, 64, 56, 38]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#1d1d22" stroke="#2a2a31"/>`).join("")}
      <path d="M0 58 H320 M110 0 V108 M190 0 V108" stroke="#26262c" stroke-width="5"/>
      <circle cx="232" cy="46" r="6" fill="none" stroke="#a0a0ab" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0;0;.9;.9;0" keyTimes="0;.35;.42;.92;1" dur="6s" repeatCount="indefinite"/></circle>
      <g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.55;.62;.92;1" dur="6s" repeatCount="indefinite"/>
        <line x1="232" y1="46" x2="164" y2="82" stroke="${c}" stroke-dasharray="3 3"/><circle cx="164" cy="82" r="8" fill="${c}" stroke="#0e0e10" stroke-width="3"/>
        <text x="172" y="104" ${MONO} font-size="10" fill="${c}">the plot, 144 m from “No. 9”</text></g></g></svg>`,

  leeway: c => {
    const isl = "M128 40 C160 30 190 60 182 92 C176 120 146 132 126 112 C106 94 104 52 128 40Z", isl2 = "M220 140 C236 130 262 140 258 158 C254 176 228 178 218 164 C212 156 212 146 220 140Z";
    return `<svg viewBox="0 0 320 200" aria-hidden="true"><rect width="320" height="200" fill="#0c1820"/>
    <path d="${isl}" fill="#13303f" transform="translate(150 85) scale(1.25) translate(-150 -85)"/><path d="${isl}" fill="#373225" stroke="#57503e"/>
    <path d="${isl2}" fill="#13303f" transform="translate(238 156) scale(1.35) translate(-238 -156)"/><path d="${isl2}" fill="#373225" stroke="#57503e"/>
    <g stroke="#a0a0ab" stroke-width="1.4"><path d="M84 138 l6 6 m0 -6 l-6 6"/><path d="M196 110 l6 6 m0 -6 l-6 6"/></g>
    <path id="lw" d="M36 170 C 86 162, 94 128, 112 134 S 186 152, 196 130 S 246 100, 292 34" fill="none" stroke="${c}" stroke-width="2.4" stroke-dasharray="6 5"/>
    <circle r="5" fill="#fff"><animateMotion dur="7s" repeatCount="indefinite"><mpath href="#lw"/></animateMotion></circle>
    <g ${MONO} font-size="9" fill="#3f6273"><text x="58" y="70">23</text><text x="252" y="92">31</text><text x="78" y="190">12</text><text x="186" y="190">9</text></g>
    <g transform="translate(286 172)"><circle r="12" fill="none" stroke="#34343c"/><path d="M0 -9 L4 6 L0 3 L-4 6Z" fill="#a0a0ab" transform="rotate(200)"/></g></svg>`;
  },

  "garagedoor-pro": c => `<svg viewBox="0 0 320 200" aria-hidden="true">
    <rect x="0" y="146" width="320" height="10" fill="#1f1f24"/>
    <line x1="124" x2="124" y1="100" y2="162" stroke="${c}" stroke-dasharray="3 4"/><line x1="214" x2="214" y1="100" y2="162" stroke="#66666f" stroke-dasharray="3 4"/>
    <g transform="translate(20 84)"><path d="M0 26 L38 4 L76 26 V64 H0Z" fill="#1f1f24" stroke="#4a4a52"/><rect x="14" y="32" width="48" height="32" fill="#0e0e10" stroke="#4a4a52"/>
      <rect x="14" y="32" width="48" height="32" fill="#34343a"><animate attributeName="height" values="32;32;2;2;32" keyTimes="0;.55;.66;.9;1" dur="6s" repeatCount="indefinite"/></rect></g>
    <g><animateTransform attributeName="transform" type="translate" values="292 130;292 130;58 130;58 130" keyTimes="0;.12;.82;1" dur="6s" repeatCount="indefinite"/>
      <rect x="-18" y="0" width="36" height="15" rx="5" fill="${c}"/><rect x="-9" y="-7" width="18" height="9" rx="3" fill="${c}" opacity=".7"/><circle cx="-9" cy="16" r="4" fill="#0e0e10" stroke="#a0a0ab"/><circle cx="9" cy="16" r="4" fill="#0e0e10" stroke="#a0a0ab"/></g>
    <g fill="none" stroke="${c}" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0;0;1;0;1;0;1;0;0" keyTimes="0;.5;.53;.56;.59;.62;.65;.68;1" dur="6s" repeatCount="indefinite"/><path d="M104 74 a12 12 0 0 1 0 18"/><path d="M111 68 a20 20 0 0 1 0 30"/></g>
    <text x="128" y="182" ${MONO} font-size="10" fill="#66666f">150 m</text><text x="218" y="182" ${MONO} font-size="10" fill="#66666f">300 m</text></svg>`,

  "dji-fcc-esp32": c => `<svg viewBox="0 0 320 200" aria-hidden="true">
    <rect x="34" y="60" width="150" height="84" rx="32" fill="#1f1f24" stroke="#4a4a52"/>
    <circle cx="74" cy="102" r="17" fill="#17171a" stroke="#4a4a52"/><circle cx="144" cy="102" r="17" fill="#17171a" stroke="#4a4a52"/><circle cx="74" cy="102" r="5" fill="#2a2a30"/><circle cx="144" cy="102" r="5" fill="#2a2a30"/>
    <rect x="180" y="96" width="12" height="12" rx="2" fill="#0e0e10" stroke="#4a4a52"/>
    <g><animateTransform attributeName="transform" type="translate" values="56 0;56 0;0 0;0 0;56 0" keyTimes="0;.1;.24;.9;1" dur="6s" repeatCount="indefinite"/>
      <rect x="190" y="98" width="24" height="8" rx="2" fill="#4a4a52"/><rect x="212" y="80" width="70" height="44" rx="9" fill="#1b3628" stroke="#2c5a41"/>
      <rect x="222" y="93" width="22" height="18" rx="2" fill="#0e0e10"/>
      <circle cx="266" cy="102" r="6"><animate attributeName="fill" values="#2a2a30;#2a2a30;#3d82f6;#3d82f6;#e3b341;#e3b341;#3ccf7e;#3ccf7e;#2a2a30" keyTimes="0;.24;.28;.42;.46;.58;.62;.9;1" dur="6s" repeatCount="indefinite"/></circle></g>
    <text x="34" y="176" ${MONO} font-size="10" fill="#66666f">USB host · 512-byte bulk packets</text></svg>`,
};

/* ── commit lanes ─────────────────────────────────────────── */
function lanes(ps, { W = 1000, L = 120, labels = true, RH = 15 } = {}) {
  const days = COMMITS.days, keys = Object.keys(days).sort();
  if (!keys.length) return "";
  const first = new Date(keys[0] + "T00:00:00Z"), last = new Date(keys.at(-1) + "T00:00:00Z");
  const n = Math.round((last - first) / 864e5) + 1, RG = 7, T = 20, left = labels ? L : 0, cw = (W - left) / n;
  const H = T + ps.length * (RH + RG) - RG + 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i < n; i++) {
    const d = new Date(first); d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDate() === 1 || i === 0) {
      s += `<text x="${left + i * cw}" y="11">${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</text>`;
      if (i) s += `<line x1="${left + i * cw - .5}" x2="${left + i * cw - .5}" y1="15" y2="${H}" stroke="#28282f"/>`;
    }
  }
  ps.forEach((p, row) => {
    const y = T + row * (RH + RG);
    if (labels) s += `<text class="lab" x="0" y="${y + 11}" style="fill:${p.color}" data-go="${p.id}">${esc(p.name)}</text>`;
    s += `<rect x="${left}" y="${y}" width="${W - left}" height="${RH}" fill="#1b1b1f" rx="3"/>`;
    for (let i = 0; i < n; i++) {
      const d = new Date(first); d.setUTCDate(d.getUTCDate() + i);
      const k = d.toISOString().slice(0, 10), c = (days[k] || {})[p.repo];
      if (c) s += `<rect x="${(left + i * cw).toFixed(2)}" y="${y}" width="${Math.max(1.2, cw - 1.2).toFixed(2)}" height="${RH}" rx="1.5" fill="${p.color}" fill-opacity="${Math.min(1, .3 + Math.sqrt(c) / 5).toFixed(2)}" data-k="${k}"/>`;
    }
  });
  return s + "</svg>";
}
function bindTip(root) {
  if (!root) return;
  const tip = $("#tip");
  const show = e => {
    const k = e.target.dataset?.k;
    if (!k) return (tip.style.opacity = 0);
    const rows = Object.entries(COMMITS.days[k] || {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => {
      const p = DATA.projects.find(x => x.repo === r);
      return p ? `<div><i style="background:${p.color}"></i>${esc(p.name)} · ${n} commit${n === 1 ? "" : "s"}</div>` : "";
    }).join("");
    tip.innerHTML = `<div class="d">${new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</div>${rows}`;
    tip.style.opacity = 1;
    tip.style.left = Math.max(8, Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)) + "px";
    tip.style.top = (e.clientY + 16) + "px";
  };
  root.addEventListener("pointermove", show);
  root.addEventListener("pointerdown", show);
  root.addEventListener("pointerleave", () => tip.style.opacity = 0);
  root.addEventListener("click", e => { const id = e.target.dataset?.go; if (id) location.hash = "#/" + id; });
}

/* ── sidebar ──────────────────────────────────────────────── */
function renderNav() {
  $("#me-sub").textContent = `${age()} · Vienna`;
  $("#nav-projects").innerHTML = DATA.projects.map(p => `
    <a href="#/${p.id}" class="nav-item" data-id="${p.id}" style="--c:${p.color}">
      <span class="dot"></span><span class="nm">${esc(p.name)}<small>${esc(p.toy.title)}</small></span></a>`).join("");
}
function markNav(id) {
  document.querySelectorAll(".nav-item").forEach(a => {
    const on = a.dataset.id === id;
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    if (on && matchMedia("(max-width: 900px)").matches) {
      const nav = a.closest(".nav"); nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2, behavior: "smooth" });
    }
  });
}

/* ── live server ──────────────────────────────────────────── */
function pollHost() {
  const tick = () => json("/api/host").then(h => { HOST = h; paintHost(); }).catch(() => { HOST = null; paintHost(); });
  tick();
  setInterval(() => { if (!document.hidden) tick(); }, 2000);
}
function spark(vals, color, max) {
  if (vals.length < 2) return "";
  const pts = vals.map((v, i) => [i / (vals.length - 1) * 300, 58 - v / max * 54]);
  const d = "M" + pts.map(p => p.map(n => n.toFixed(1)).join(" ")).join(" L");
  return `<svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L300 60 L0 60Z" fill="${color}" fill-opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
function paintHost() {
  const h = HOST, hist = h?.history?.filter(x => x.cpu != null) || [], last = hist.at(-1);
  $("#srv-pulse").className = "pulse" + (h ? " on" : "");
  $("#srv-mini").textContent = h ? (last ? `mini PC · CPU ${last.cpu}%${h.temp_c != null ? ` · ${Math.round(h.temp_c)}°C` : ""}` : "mini PC · online") : "mini PC unreachable";
  const card = $("#srv"); if (!card) return;
  card.querySelector(".srv-top .pulse").className = "pulse" + (h ? " on" : "");
  if (!h) { card.querySelector(".spark").innerHTML = ""; $("#srv-state").textContent = "can't reach it right now"; return; }
  card.querySelector(".spark").innerHTML = spark(hist.map(x => x.cpu), "#3ccf7e", Math.max(20, ...hist.map(x => x.cpu)) * 1.2);
  $("#srv-state").textContent = hist.length ? `CPU, last ${hist.length * 2} s` : "live";
  const cells = [
    [last ? `${last.cpu}%` : `${h.load?.[0] ?? "—"}`, last ? `CPU · ${h.cpus} cores` : "load"],
    [last?.mem != null ? `${last.mem}%` : "—", h.mem_total ? `of ${bytes(h.mem_total)} RAM` : "RAM"],
    [h.temp_c != null ? `${Math.round(h.temp_c)}°C` : "—", "CPU temp"],
    [h.uptime_s ? dur(h.uptime_s) : "—", "up since reboot"],
  ];
  $("#srv-cells").innerHTML = cells.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("");
  $("#srv-foot").innerHTML = `${esc(h.os)}${last?.net != null ? ` · <b>${bytes(last.net)}/s</b> on the network` : ""} · <b>${h.pages_today}</b> page view${h.pages_today === 1 ? "" : "s"} today`;
}

/* ── overview ─────────────────────────────────────────────── */
function overview() {
  const ps = DATA.projects, keys = Object.keys(COMMITS.days).sort();
  const hours = COMMITS.hours || [], hmax = Math.max(1, ...hours), peak = hours.indexOf(hmax);
  const fmt = k => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const days = keys.filter(k => ps.some(p => (COMMITS.days[k] || {})[p.repo])).length;
  main.innerHTML = `<div class="page">
    <section class="hero">
      <div>
        <p class="hello">Nikolaus · ${age()} · Vienna</p>
        <h1>Things I built because I needed them.</h1>
        <p class="intro">${esc(DATA.intro.replace("{age}", age()))} <b>You can play with every one of them.</b></p>
        <div class="ctas"><a class="btn primary" href="#/${ps[0].id}">Start with ${esc(ps[0].name)}</a><a class="btn" href="https://github.com/${DATA.owner}">GitHub</a></div>
      </div>
      <section class="panel srv" id="srv" aria-label="Live status of the computer serving this page">
        <div class="srv-top"><b><span class="pulse"></span>This page is coming from my home</b><span id="srv-state">connecting…</span></div>
        <div class="spark"></div>
        <div class="srv-grid" id="srv-cells"></div>
        <div class="srv-foot" id="srv-foot">A mini PC in Vienna, behind a Cloudflare Tunnel, running Venvy.</div>
      </section>
    </section>

    <div class="sec"><h2>Play with them</h2><span>${ps.length} projects, one toy each</span></div>
    <div class="toys">${ps.map(p => `
      <a class="toy" href="#/${p.id}" style="--c:${p.color}">
        <div class="pv">${(PREVIEW[p.id] || (() => ""))(p.color)}</div>
        <div class="in">
          <div class="nm"><i></i>${esc(p.name)}<small>${esc(p.kind)}</small></div>
          <p>${esc(p.one)}</p>
          <span class="play">${esc(p.toy.title)}</span>
        </div>
      </a>`).join("")}
    </div>

    <div class="sec"><h2>When I worked on what</h2><span>${totalCommits()} public commits · ${fmt(keys[0])} – ${fmt(keys.at(-1))}</span></div>
    <section class="panel" aria-label="Commits per day and project">
      <div class="heat" id="heat">${lanes(ps.slice().sort((a, b) => commitsOf(b) - commitsOf(a)))}</div>
      <div class="act-foot"><span>${days} active days · Venvy's first year isn't public</span>
        <span>by hour<span class="hours" aria-hidden="true">${hours.map(h => `<span style="height:${Math.max(2, h / hmax * 20)}px" class="${h >= hmax * .7 ? "pk" : ""}"></span>`).join("")}</span>mostly around ${String(peak).padStart(2, "0")}:00</span></div>
    </section>

    <footer class="foot"><span>Nikolaus · Vienna · <a href="https://github.com/${DATA.owner}">github.com/${DATA.owner}</a></span><span>Served by <a href="#/venvy">Venvy</a> · <a href="https://github.com/${DATA.owner}/ringtwo.win">source of this page</a></span></footer>
  </div>`;
  bindTip($("#heat"));
  paintHost();
}

/* ── project page ─────────────────────────────────────────── */
function media(p) {
  const m = p.media; if (!m) return "";
  const fig = (i, cap) => `<figure><img src="${i[0]}" width="${i[1]}" height="${i[2]}" alt="${esc(i[3])}" loading="lazy" decoding="async" data-zoom>${cap ? `<figcaption>${esc(i[3])}</figcaption>` : ""}</figure>`;
  if (m.type === "phones") return `<div class="media"><div class="media phones">${m.items.map(i => fig(i, false)).join("")}</div><p class="note">${m.note ? esc(m.note) + " " : ""}Tap a screenshot to enlarge.</p></div>`;
  return `<div class="media ${m.type}">${m.items.map(i => fig(i, true)).join("")}</div>`;
}
function liveLine(p) {
  const r = GH[p.repo], bits = [`<span><b>${commitsOf(p)}</b> public commits</span>`];
  if (r) {
    bits.push(`<span>last push <b>${ago(r.pushed_at)}</b></span>`);
    if (r.stars) bits.push(`<span>★ <b>${r.stars}</b></span>`);
    if (r.license && r.license !== "NOASSERTION") bits.push(`<span><b>${esc(r.license)}</b> licence</span>`);
    if (r.releases) bits.push(`<span>latest <b>${esc(r.releases.latest)}</b>, ${r.releases.count} releases</span>`);
  }
  return bits.join("");
}
function lastCommit(p) {
  const lc = GH[p.repo]?.last_commit;
  return lc ? `<b>${esc(lc.msg)}</b>${esc(lc.sha)} · ${ago(lc.date)}` : `<b>See the commit history</b>on GitHub`;
}
function page(p) {
  const ps = DATA.projects, i = ps.indexOf(p), prev = ps[(i - 1 + ps.length) % ps.length], next = ps[(i + 1) % ps.length];
  const lc = GH[p.repo]?.last_commit;
  main.innerHTML = `<div class="page" style="--c:${p.color}">
    <div class="crumbs"><span><a href="#/">overview</a> / ${esc(p.id)}</span>
      <span class="pn"><a href="#/${prev.id}" aria-label="Previous: ${esc(prev.name)}">← <span>${esc(prev.name)}</span></a><a href="#/${next.id}" aria-label="Next: ${esc(next.name)}"><span>${esc(next.name)}</span> →</a></span></div>

    <header class="ph">
      <div>
        <div class="ph-top"><span class="tag">${esc(p.status)}</span><span>${esc(p.kind)} · ${esc(p.platform)}</span></div>
        <h1><i></i>${esc(p.name)}</h1>
        <p class="one">${esc(p.one)}</p>
      </div>
      <div class="actions">${p.links.map(([t, u], j) => `<a class="btn ${j === 0 ? "tint" : ""}" href="${u}">${esc(t)}</a>`).join("")}</div>
    </header>

    <section class="panel stage" aria-label="${esc(p.toy.title)}">
      <div class="stage-h"><span class="t">${esc(p.toy.title)}</span><span>${esc(p.toy.hint)}</span></div>
      <div id="toy"><div class="stage-load">loading…</div></div>
    </section>

    ${p.why ? `<p class="why"><small>Why I built it</small>${esc(p.why)}</p>` : ""}
    <div class="live" id="live">${liveLine(p)}</div>
    <div class="facts">${p.facts.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>

    ${media(p)}

    <div class="cols">
      <section class="story"><h2>How it works</h2>${p.story.map(t => `<p>${t}</p>`).join("")}</section>
      <aside class="aside"><h2>Details</h2>
        ${p.details ? `<ul>${p.details.map(d => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
        <h3 class="label">Latest commit</h3>
        <a class="commit" id="lastcommit" href="${lc ? lc.url : `https://github.com/${DATA.owner}/${p.repo}/commits`}">${lastCommit(p)}</a>
        <h3 class="label">Activity</h3>
        <div class="lane" id="lane">${lanes([p], { W: 400, labels: false, RH: 18 })}<p>${commitsOf(p)} public commits</p></div>
        <h3 class="label">Stack</h3>
        <div class="chips">${p.stack.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>
      </aside>
    </div>

    <nav class="next" aria-label="More projects">
      <a href="#/${prev.id}" style="--c:${prev.color}"><small>← previous · k</small><b><i></i>${esc(prev.name)}</b><span>${esc(prev.toy.title)}</span></a>
      <a class="r" href="#/${next.id}" style="--c:${next.color}"><small>next · j →</small><b>${esc(next.name)}<i></i></b><span>${esc(next.toy.title)}</span></a>
    </nav>
  </div>`;
  bindTip($("#lane"));
  const el = $("#toy");
  import(`./demos/${p.id}.js?v=${V}`).then(m => {
    if (!document.body.contains(el)) return;
    el.innerHTML = "";
    m.default(el, { p, esc, ago, onLeave, host: () => HOST });
  }).catch(err => { console.error(err); el.innerHTML = `<div class="stage-load">This one didn't load. Try reloading the page.</div>`; });
}

/* ── router, keys, lightbox ───────────────────────────────── */
function route(first) {
  cleanup.splice(0).forEach(fn => { try { fn(); } catch {} });
  const p = proj(decodeURIComponent(location.hash.replace(/^#\/?/, "")));
  const go = () => {
    p ? page(p) : overview();
    document.title = p ? `${p.name} · Nikolaus` : "Nikolaus · ringtwo.win";
    markNav(p ? p.id : "");
    window.scrollTo(0, 0);
  };
  if (!first && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const vt = document.startViewTransition(go);
    [vt.ready, vt.finished, vt.updateCallbackDone].forEach(x => x.catch(() => {}));
  } else go();
}
addEventListener("hashchange", () => route(false));
addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /^(input|textarea|select|button)$/i.test(e.target.tagName) || e.target.isContentEditable) return;
  const lb = $("#lightbox");
  if (e.key === "Escape") { if (!lb.hidden) return closeLb(); if (location.hash.length > 2) location.hash = "#/"; return; }
  const ps = DATA.projects, i = ps.findIndex(p => p.id === location.hash.replace(/^#\/?/, ""));
  if (e.key === "j") location.hash = "#/" + ps[(i + 1) % ps.length].id;
  if (e.key === "k") location.hash = "#/" + ps[i <= 0 ? ps.length - 1 : i - 1].id;
});
addEventListener("keydown", e => { if (e.key === "Escape" && !$("#lightbox").hidden) closeLb(); }, true);
let lbFrom = null;
function closeLb() { $("#lightbox").hidden = true; lbFrom?.focus?.(); }
document.addEventListener("click", e => {
  const img = e.target.closest?.("img[data-zoom]");
  if (img) { const lb = $("#lightbox"); lbFrom = img; $("img", lb).src = img.currentSrc || img.src; $("img", lb).alt = img.alt; $("figcaption", lb).textContent = img.alt; lb.hidden = false; $(".lb-close", lb).focus(); return; }
  if (e.target.closest?.("#lightbox")) return closeLb();
  if (e.target.closest?.("[data-goto=server]")) { e.preventDefault(); if (location.hash.length > 2) location.hash = "#/"; setTimeout(() => $("#srv")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120); }
});

/* ── boot ─────────────────────────────────────────────────── */
const [d, c] = await Promise.all([json("projects.json"), json("/api/commits").catch(() => json("commits.json"))]);
DATA = d; COMMITS = c;
renderNav();
route(true);
pollHost();
json("/api/github").then(g => {
  GH = g.repos || {};
  const p = proj(location.hash.replace(/^#\/?/, ""));
  if (p && $("#live")) {
    $("#live").innerHTML = liveLine(p);
    const a = $("#lastcommit"), lc = GH[p.repo]?.last_commit;
    if (a) { a.innerHTML = lastCommit(p); if (lc) a.href = lc.url; }
  }
}).catch(() => {});
