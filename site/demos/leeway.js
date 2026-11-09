// "Sail around the rocks": a tiny version of Leeway's two routers on a generated archipelago.
// Shortest: A* through water deeper than draft + clearance, clear of rocks.
// Fastest: same safety rules, cost = time from a polar, so it tacks upwind.
const CSS = `
.lw-wrap { position: relative; }
.lw-wrap canvas { display: block; width: 100%; touch-action: none; cursor: crosshair; }
.lw-ctrl { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px 18px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); }
.lw-ctrl label { display: grid; gap: 0; font: 12px var(--mono); color: var(--dim); }
.lw-ctrl label b { color: var(--text); font-weight: 600; }
.lw-out { display: flex; gap: 6px 18px; flex-wrap: wrap; padding: 10px 16px 12px; border-top: 1px solid var(--line); font: 12.5px var(--mono); color: var(--muted); }
.lw-out b { color: var(--text); font-weight: 600; }
.lw-out .bad { color: var(--bad); }
.lw-legend { position: absolute; right: 10px; bottom: 10px; display: flex; gap: 10px; background: rgba(9,9,11,.82); border: 1px solid var(--line); border-radius: 8px; padding: 5px 9px; font: 11px var(--mono); color: var(--muted); pointer-events: none; }
.lw-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
@media (max-width: 720px) { .lw-ctrl { grid-template-columns: 1fr 1fr; } .lw-ctrl .seg-ctl { grid-column: 1 / -1; justify-self: start; } .lw-legend { display: none; } }
`;
const POLAR = [[0, 0], [38, 0], [42, 4.2], [60, 6.0], [90, 6.9], [120, 7.1], [150, 6.3], [180, 5.4]]; // true wind angle → knots
const speed = twa => { for (let i = 1; i < POLAR.length; i++) if (twa <= POLAR[i][0]) { const [a, va] = POLAR[i - 1], [b, vb] = POLAR[i]; return va + (vb - va) * (twa - a) / (b - a); } return 5.4; };
const CELL_NM = .08, CLEAR = .5;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function noise(W, H, seed) {
  const r = rng(seed), g = (w, h) => Float32Array.from({ length: w * h }, r);
  const layers = [[5, 1], [10, .45], [20, .18]].map(([s, a]) => ({ s, a, w: s + 2, h: Math.ceil(s * H / W) + 2, v: null }));
  layers.forEach(l => l.v = g(l.w, l.h));
  const out = new Float32Array(W * H), sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const l of layers) {
      const fx = x / W * l.s, fy = y / W * l.s, x0 = fx | 0, y0 = fy | 0, tx = sm(fx - x0), ty = sm(fy - y0), q = (i, j) => l.v[(y0 + j) * l.w + x0 + i];
      v += l.a * ((q(0, 0) * (1 - tx) + q(1, 0) * tx) * (1 - ty) + (q(0, 1) * (1 - tx) + q(1, 1) * tx) * ty);
    }
    out[y * W + x] = v;
  }
  return out;
}

export default function (el, { p, onLeave }) {
  if (!document.getElementById("css-lw")) document.head.insertAdjacentHTML("beforeend", `<style id="css-lw">${CSS}</style>`);
  el.innerHTML = `
    <div class="lw-wrap"><canvas id="lw-c" aria-label="Sea chart. Drag A and B to move start and destination."></canvas>
      <div class="lw-legend"><span><i style="background:#2b6177"></i>too shallow for you</span><span>┄ safety contour</span><span><i style="background:#3a3527"></i>land</span><span>✕ rock</span></div></div>
    <div class="lw-ctrl">
      <div class="seg-ctl" role="group" aria-label="Router"><button type="button" data-m="short" aria-pressed="true">Shortest</button><button type="button" data-m="fast" aria-pressed="false">Fastest, with wind</button></div>
      <label>draft <b id="lw-dv">1.8 m</b><input type="range" id="lw-draft" min="0.5" max="4" step="0.1" value="1.8" aria-label="Draft in metres"></label>
      <label>wind from <b id="lw-wv">NE</b><input type="range" id="lw-wind" min="0" max="359" step="1" value="40" aria-label="Wind direction in degrees"></label>
      <button class="btn sm" id="lw-new" type="button">New islands</button>
    </div>
    <div class="lw-out" id="lw-out"></div>`;
  const $ = s => el.querySelector(s);
  const cv = $("#lw-c"), ctx = cv.getContext("2d");
  let lines = null, W, H, depth, rocks, block, seed = 7, mode = "short", draft = 1.8, wind = 40, A, B, path = null, info = null, raf = 0, dash = 0, anim = 0;

  function world() {
    const mobile = el.clientWidth < 620;
    W = 160; H = mobile ? 128 : 88;
    lines = null;
    const e = noise(W, H, seed), sorted = Float32Array.from(e).sort();
    const land = sorted[Math.floor(sorted.length * .8)], lo = sorted[0];
    depth = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) depth[i] = e[i] >= land ? -1 : Math.pow((land - e[i]) / (land - lo), 1.25) * 42;
    const r = rng(seed * 31 + 3);
    rocks = [];
    for (let k = 0; k < 400 && rocks.length < 16; k++) {
      const x = 3 + Math.floor(r() * (W - 6)), y = 3 + Math.floor(r() * (H - 6)), d = depth[y * W + x];
      if (d > 2 && d < 14) rocks.push([x, y]);
    }
    // A and B go in the biggest stretch of water that's deep enough for a 2.5 m keel, so a route exists by default
    const comp = new Int32Array(W * H).fill(-1), sizes = [];
    for (let i = 0; i < W * H; i++) {
      if (comp[i] >= 0 || depth[i] < 3) continue;
      const id = sizes.length, st = [i]; comp[i] = id; let n = 0;
      while (st.length) { const u = st.pop(); n++; const ux = u % W, uy = u / W | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = ux + dx, y = uy + dy, v = y * W + x; if (x >= 0 && y >= 0 && x < W && y < H && comp[v] < 0 && depth[v] >= 3) { comp[v] = id; st.push(v); } } }
      sizes.push(n);
    }
    const big = sizes.indexOf(Math.max(...sizes));
    main = i => comp[i] === big && depth[i] > 6;
    A = water(Math.round(W * .05), Math.round(H * .85)); B = water(Math.round(W * .95), Math.round(H * .12));
  }
  let main = () => true;
  function water(x, y) {   // nearest cell in the main body of water
    let best = null, bd = 1e9;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (main(j * W + i)) { const q = (i - x) ** 2 + (j - y) ** 2; if (q < bd) { bd = q; best = [i, j]; } } }
    return best || [x, y];
  }
  function blocked() {
    const min = draft + CLEAR; block = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) block[i] = depth[i] < min ? 1 : 0;
    for (const [x, y] of rocks) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H) block[yy * W + xx] = 2; }
  }
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !block[y * W + x];
  function clearLine(x0, y0, x1, y1) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); for (let k = 1; k <= n; k++) { const t = k / n; if (!free(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t))) return false; } return true; }
  function solve() {
    // State = (cell, tack). Changing tack costs time, like it does on a real boat, so the route makes a few long tacks instead of a staircase.
    const N = W * H, S2 = N * 2, g = new Float32Array(S2).fill(Infinity), from = new Int32Array(S2).fill(-1), closed = new Uint8Array(S2);
    const s = A[1] * W + A[0], t = B[1] * W + B[0];
    if (block[s] || block[t]) return null;
    const vmax = 7.1, TACK_H = 0.035;                   // ~2 minutes lost per tack or gybe
    const step = (dx, dy, side) => {
      const dist = Math.hypot(dx, dy) * CELL_NM;
      if (mode === "short") return [dist, 0];
      const brg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, rel = ((brg - wind + 540) % 360) - 180;
      const v = speed(Math.abs(rel)); if (v <= 0) return [Infinity, side];
      const ns = rel > 0 ? 1 : rel < 0 ? 0 : side;
      return [dist / v + (ns !== side ? TACK_H : 0), ns];
    };
    const h = i => { const d = Math.hypot(i % W - B[0], (i / W | 0) - B[1]) * CELL_NM; return mode === "short" ? d : d / vmax; };
    const heap = [];
    const push = it => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (const sd of mode === "short" ? [0] : [0, 1]) { g[s * 2 + sd] = 0; push([h(s), s * 2 + sd]); }
    let goal = -1;
    while (heap.length) {
      const [, node] = pop(); if (closed[node]) continue; closed[node] = 1;
      const u = node >> 1, side = node & 1; if (u === t) { goal = node; break; }
      const ux = u % W, uy = u / W | 0;
      for (const [dx, dy] of DIRS) {
        const x = ux + dx, y = uy + dy; if (!free(x, y)) continue;
        if ((Math.abs(dx) === 2 || Math.abs(dy) === 2) && !clearLine(ux, uy, x, y)) continue;
        if (Math.abs(dx) === 1 && Math.abs(dy) === 1 && (!free(ux + dx, uy) || !free(ux, uy + dy))) continue;
        const [c, ns] = step(dx, dy, side); if (c === Infinity) continue;
        const v = (y * W + x) * 2 + ns, gc = g[node] + c;
        if (gc < g[v]) { g[v] = gc; from[v] = node; push([gc + h(y * W + x), v]); }
      }
    }
    if (goal < 0) return null;
    let pts = []; for (let v = goal; v >= 0; v = from[v]) pts.push([(v >> 1) % W, (v >> 1) / W | 0]); pts.reverse();
    if (mode === "short") {   // pull the string: keep only the turns that are needed
      const out = [pts[0]]; let i = 0;
      while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clearLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--; out.push(pts[j]); i = j; }
      pts = out;
    }
    let nm = 0, hours = 0, tacks = 0, lastSide = 0, nogo = false;
    for (let k = 1; k < pts.length; k++) {
      const dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1], d = Math.hypot(dx, dy) * CELL_NM;
      const brg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, rel = ((brg - wind + 540) % 360) - 180, v = speed(Math.abs(rel));
      nm += d; if (v > 0) hours += d / v; else nogo = true;
      const side = Math.sign(rel); if (lastSide && side && side !== lastSide) tacks++; if (side) lastSide = side;
    }
    return { pts, nm, hours, tacks, nogo };
  }

  const PAL = [[2, "#2a6c84"], [5, "#1c4b5e"], [10, "#163c4c"], [20, "#12303d"], [99, "#0d2230"]];
  let base = null;
  function paintBase() {
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    const o = off.getContext("2d"), img = o.createImageData(W, H), min = draft + CLEAR;
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const pal = PAL.map(([d, c]) => [d, hex(c)]), landC = hex("#3a3527"), shallow = hex("#2b6177");
    for (let i = 0; i < W * H; i++) {
      const d = depth[i]; let c;
      if (d < 0) c = landC; else if (d < min) c = shallow; else c = pal.find(([lim]) => d < lim)[1];
      img.data.set([...c, 255], i * 4);
    }
    o.putImageData(img, 0, 0); base = off;
  }
  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1), cw = el.clientWidth, ch = Math.round(cw * H / W);
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    cv.style.height = ch + "px";
    const k = cv.width / W; ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(base, 0, 0, cv.width, cv.height);
    // coastline and safety contour, traced with marching squares
    const contour = (th) => {
      const P = new Path2D(), v = (x, y) => depth[y * W + x];
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
        const idx = (a >= th) | (b >= th) << 1 | (c >= th) << 2 | (d >= th) << 3;
        if (idx === 0 || idx === 15) continue;
        const L = (p, q) => (th - p) / (q - p);
        const e = [[x + L(a, b), y], [x + 1, y + L(b, c)], [x + L(d, c), y + 1], [x, y + L(a, d)]];
        const segs = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[idx];
        for (const [i, j] of segs) { P.moveTo((e[i][0] + .5) * k, (e[i][1] + .5) * k); P.lineTo((e[j][0] + .5) * k, (e[j][1] + .5) * k); }
      }
      return P;
    };
    if (!lines || lines.k !== k || lines.min !== draft) lines = { k, min: draft, coast: contour(0), safe: contour(draft + CLEAR) };
    ctx.lineWidth = 1.4 * dpr; ctx.strokeStyle = "rgba(205,190,150,.55)"; ctx.stroke(lines.coast);
    ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.strokeStyle = "rgba(236,236,241,.5)"; ctx.lineWidth = 1.2 * dpr; ctx.stroke(lines.safe); ctx.setLineDash([]);
    // soundings
    ctx.font = `${10 * dpr}px ui-monospace, Menlo, monospace`; ctx.fillStyle = "rgba(160,190,205,.55)"; ctx.textAlign = "center";
    const r = rng(seed + 99);
    for (let n = 0; n < 34; n++) { const x = Math.floor(r() * W), y = Math.floor(r() * H), d = depth[y * W + x]; if (d > 1) ctx.fillText(d < 10 ? d.toFixed(1).replace(".0", "") : Math.round(d), (x + .5) * k, (y + .8) * k); }
    // rocks
    ctx.strokeStyle = "#ececf1"; ctx.lineWidth = 1.6 * dpr;
    for (const [x, y] of rocks) { const cx = (x + .5) * k, cy = (y + .5) * k, s = 4 * dpr; ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke(); }
    // wind arrows
    if (mode === "fast") {
      const to = (wind + 180) * Math.PI / 180; ctx.strokeStyle = "rgba(236,236,241,.22)"; ctx.lineWidth = 1.2 * dpr;
      for (let y = 6; y < H; y += 12) for (let x = 6; x < W; x += 12) {
        const cx = x * k, cy = y * k, L = 9 * dpr, dx = Math.sin(to) * L, dy = -Math.cos(to) * L;
        ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy);
        const a1 = to + Math.PI * .82, a2 = to - Math.PI * .82; ctx.lineTo(cx + dx + Math.sin(a1) * 4 * dpr, cy + dy - Math.cos(a1) * 4 * dpr); ctx.moveTo(cx + dx, cy + dy); ctx.lineTo(cx + dx + Math.sin(a2) * 4 * dpr, cy + dy - Math.cos(a2) * 4 * dpr); ctx.stroke();
      }
    }
    // route
    if (path) {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = p.color + "44"; ctx.lineWidth = 8 * dpr; ctx.beginPath(); path.pts.forEach(([x, y], i) => i ? ctx.lineTo((x + .5) * k, (y + .5) * k) : ctx.moveTo((x + .5) * k, (y + .5) * k)); ctx.stroke();
      ctx.strokeStyle = p.color; ctx.lineWidth = 2.6 * dpr; ctx.setLineDash([7 * dpr, 5 * dpr]); ctx.lineDashOffset = -dash * dpr; ctx.stroke(); ctx.setLineDash([]);
      if (mode === "short") { ctx.fillStyle = p.color; path.pts.slice(1, -1).forEach(([x, y]) => { ctx.beginPath(); ctx.arc((x + .5) * k, (y + .5) * k, 3 * dpr, 0, 7); ctx.fill(); }); }
    }
    // A and B
    [[A, "A"], [B, "B"]].forEach(([q, t]) => {
      const cx = (q[0] + .5) * k, cy = (q[1] + .5) * k;
      ctx.fillStyle = t === "A" ? "#ececf1" : p.color; ctx.beginPath(); ctx.arc(cx, cy, 11 * dpr, 0, 7); ctx.fill();
      ctx.fillStyle = "#0e0e10"; ctx.font = `700 ${11 * dpr}px ui-monospace, Menlo, monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, cx, cy + .5 * dpr); ctx.textBaseline = "alphabetic";
    });
  }
  function out() {
    const o = $("#lw-out");
    if (!path) { o.innerHTML = `<span class="bad">No safe route at ${draft.toFixed(1)} m draft. Too shallow somewhere between A and B, or one of them is.</span>`; return; }
    const hm = h => `${Math.floor(h)} h ${String(Math.round(h % 1 * 60)).padStart(2, "0")} min`;
    o.innerHTML = mode === "short"
      ? `<span><b>${path.nm.toFixed(1)} NM</b> shortest safe route</span><span><b>${path.pts.length - 2}</b> turns</span><span>about <b>${hm(path.nm / 6)}</b> under engine at 6 kn</span><span>only water deeper than <b>${(draft + CLEAR).toFixed(1)} m</b></span>`
      : `<span><b>${path.nm.toFixed(1)} NM</b> sailed</span><span><b>${hm(path.hours)}</b> with this wind</span><span><b>${path.tacks}</b> tack${path.tacks === 1 ? "" : "s"} or gybe${path.tacks === 1 ? "" : "s"}</span><span>no closer than <b>42°</b> to the wind</span>`;
  }
  const compass = d => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(d / 22.5) % 16];
  function update(full) {
    if (full) { world(); }
    blocked(); paintBase(); path = solve(); out(); draw();
  }
  const schedule = full => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => update(full)); };

  // dragging A / B
  let drag = null;
  const cell = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) / r.width * W))), Math.max(0, Math.min(H - 1, Math.floor((e.clientY - r.top) / r.height * H)))]; };
  cv.addEventListener("pointerdown", e => {
    const c = cell(e), dA = Math.hypot(c[0] - A[0], c[1] - A[1]), dB = Math.hypot(c[0] - B[0], c[1] - B[1]);
    drag = dA < 7 || dA < dB ? "A" : "B"; if (Math.min(dA, dB) >= 7) drag = "B";
    cv.setPointerCapture(e.pointerId); move(e);
  });
  const move = e => { if (!drag) return; const c = cell(e); if (depth[c[1] * W + c[0]] > 0) { if (drag === "A") A = c; else B = c; path = solve(); out(); draw(); } };
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", () => drag = null);
  cv.addEventListener("pointercancel", () => drag = null);

  el.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { mode = b.dataset.m; el.querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-pressed", x === b)); path = solve(); out(); draw(); });
  $("#lw-draft").oninput = e => { draft = +e.target.value; $("#lw-dv").textContent = draft.toFixed(1) + " m"; schedule(false); };
  $("#lw-wind").oninput = e => { wind = +e.target.value; $("#lw-wv").textContent = `${compass(wind)} · ${wind}°`; if (mode === "fast") { path = solve(); out(); } draw(); };
  $("#lw-new").onclick = () => { seed = Math.floor(Math.random() * 1e6); update(true); };
  $("#lw-wv").textContent = `${compass(wind)} · ${wind}°`;

  update(true);
  const ro = new ResizeObserver(() => draw()); ro.observe(el);
  const tick = () => { dash = (dash + .35) % 1000; if (path && !document.hidden) draw(); anim = requestAnimationFrame(tick); };
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) anim = requestAnimationFrame(tick);
  onLeave(() => { cancelAnimationFrame(anim); cancelAnimationFrame(raf); ro.disconnect(); });
}
