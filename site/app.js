/* ringtwo.win — everything on the page comes from projects.json (+ commits.json).
   To add a project: add an entry to projects.json, put its images in img/, and
   run tools/activity_svg.py to refresh the commit data. */
(() => {
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const main = $("#main");
let DATA, COMMITS, GH = {}, HOSTS = null;

/* ── helpers ──────────────────────────────────────────── */
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return "just now";
  const m = s / 60, h = m / 60, d = h / 24;
  if (m < 60) return `${Math.round(m)} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  if (d < 14) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}
const store = {
  get(k) { try { const v = JSON.parse(sessionStorage.getItem(k)); return v && Date.now() - v.t < 6e5 ? v.d : null; } catch { return null; } },
  set(k, d) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), d })); } catch {} },
};
async function gh(path) {
  const hit = store.get(path); if (hit) return hit;
  const r = await fetch("https://api.github.com/" + path, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json(); store.set(path, d); return d;
}
function age() {
  const [y, m] = DATA.born.split("-").map(Number), now = new Date();
  return now.getFullYear() - y - (now.getMonth() + 1 < m ? 1 : 0);
}
const commitsOf = id => (COMMITS.totals || {})[repoOf(id)] || 0;
const repoOf = id => (DATA.projects.find(p => p.id === id) || {}).repo;
const proj = id => DATA.projects.find(p => p.id === id);

/* ── commit lanes (overview: all, project page: one) ──── */
function lanes(repos, { W = 1000, L = 118, showLabels = true, RH = 15 } = {}) {
  const days = COMMITS.days, keys = Object.keys(days).sort();
  const first = new Date(keys[0] + "T00:00:00Z"), last = new Date(keys[keys.length - 1] + "T00:00:00Z");
  const n = Math.round((last - first) / 864e5) + 1, RG = 7, T = 20;
  const left = showLabels ? L : 0, cw = (W - left) / n, H = T + repos.length * (RH + RG) - RG + 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i < n; i++) {
    const day = new Date(first); day.setUTCDate(day.getUTCDate() + i);
    if (day.getUTCDate() === 1 || i === 0) {
      s += `<text x="${left + i * cw}" y="11">${day.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</text>`;
      if (i) s += `<line x1="${left + i * cw - .5}" x2="${left + i * cw - .5}" y1="15" y2="${H}" stroke="#2a2a31"/>`;
    }
  }
  repos.forEach((p, row) => {
    const y = T + row * (RH + RG);
    if (showLabels) s += `<text class="lab" x="0" y="${y + 11}" style="fill:${p.color}" data-go="${p.id}">${esc(p.name)}</text>`;
    s += `<rect x="${left}" y="${y}" width="${W - left}" height="${RH}" fill="#1d1d21" rx="3"/>`;
    for (let i = 0; i < n; i++) {
      const day = new Date(first); day.setUTCDate(day.getUTCDate() + i);
      const k = day.toISOString().slice(0, 10), c = (days[k] || {})[p.repo];
      if (c) s += `<rect x="${(left + i * cw).toFixed(2)}" y="${y}" width="${Math.max(1, cw - 1.2).toFixed(2)}" height="${RH}" rx="1.5" fill="${p.color}" fill-opacity="${Math.min(1, .3 + Math.sqrt(c) / 5).toFixed(2)}" data-k="${k}"/>`;
    }
  });
  return s + "</svg>";
}
function bindTip(root) {
  const tip = $("#tip");
  root.addEventListener("mousemove", e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) { tip.style.opacity = 0; return; }
    const c = COMMITS.days[k] || {};
    const rows = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([r, n]) => {
      const p = DATA.projects.find(x => x.repo === r);
      return `<div><i style="background:${p ? p.color : "#888"}"></i>${esc(p ? p.name : r)} ${n}</div>`;
    }).join("");
    tip.innerHTML = `<div class="d">${new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</div>${rows}`;
    tip.style.opacity = 1;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = (e.clientY + 14) + "px";
  });
  root.addEventListener("mouseleave", () => tip.style.opacity = 0);
  root.addEventListener("click", e => { const id = e.target.dataset && e.target.dataset.go; if (id) location.hash = "#/" + id; });
}

/* ── sidebar ──────────────────────────────────────────── */
function renderNav() {
  $("#nav-count").textContent = DATA.projects.length;
  $("#nav-projects").innerHTML = DATA.projects.map(p => `
    <a href="#/${p.id}" class="nav-item" data-id="${p.id}" style="--c:${p.color}">
      <span class="dot"></span><span class="nm">${esc(p.name)}<small>${esc(p.kind)}</small></span><span class="n">${commitsOf(p.id) || ""}</span>
    </a>`).join("");
}
function markNav(id) {
  document.querySelectorAll(".nav-item").forEach(a => {
    const on = a.dataset.id === id;
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    if (on && matchMedia("(max-width: 960px)").matches) a.scrollIntoView({ block: "nearest", inline: "center" });
  });
}

/* ── overview ─────────────────────────────────────────── */
function thumb(p) {
  const m = p.media;
  if (!m) return `<div class="thumb cross"></div>`;
  if (m.type === "phones") return `<div class="thumb phones">${m.items.map(i => `<img src="${i[0]}" alt="" loading="lazy">`).join("")}</div>`;
  return `<div class="thumb"><img src="${m.items[0][0]}" alt="" loading="lazy"></div>`;
}
function liveMeta(p) {
  const r = GH[p.repo];
  const parts = [`${commitsOf(p.id)} commits`];
  if (r) { parts.push(`pushed ${ago(r.pushed_at)}`); if (r.stargazers_count) parts.push(`★ ${r.stargazers_count}`); }
  return parts.map(esc).join(" · ");
}
function overview() {
  const ps = DATA.projects, [feat, ...rest] = ps;
  const keys = Object.keys(COMMITS.days).sort();
  const total = Object.values(COMMITS.totals).reduce((a, b) => a + b, 0);
  const fmt = k => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const hours = COMMITS.hours, hmax = Math.max(...hours);
  const peak = hours.indexOf(hmax);
  const order = ps.slice().sort((a, b) => commitsOf(b.id) - commitsOf(a.id));
  main.innerHTML = `
  <div class="page">
    <p class="hello"><i></i>${age()} · Vienna, Austria · <a href="https://github.com/${DATA.owner}">@${DATA.owner}</a></p>
    <h1>Nikolaus</h1>
    <p class="intro">${DATA.intro.replace("{age}", age())}</p>

    <h2 class="sec">Activity <span>${fmt(keys[0])} – ${fmt(keys[keys.length - 1])} · public history only</span></h2>
    <section class="panel" aria-label="Commits per day and project">
      <div class="act-head"><span><b>${total}</b> commits on ${keys.length} days</span><span>hover a day · click a name</span></div>
      <div class="heat" id="heat">${lanes(order)}</div>
      <div class="act-foot">
        <span>Venvy's history before June isn't on GitHub.</span>
        <span>commits by hour<span class="hours">${hours.map((h, i) => `<span title="${String(i).padStart(2, "0")}:00 · ${h}" style="height:${Math.max(2, h / hmax * 22)}px" class="${h >= hmax * .75 ? "pk" : ""}"></span>`).join("")}</span> · busiest ${String(peak).padStart(2, "0")}:00</span>
      </div>
    </section>

    <h2 class="sec">Projects <span>${ps.length} · newest work first, favourite on top</span></h2>
    <div class="grid">
      <a class="pcard feature" href="#/${feat.id}" style="--c:${feat.color}">
        ${thumb(feat)}
        <div class="in">
          <div class="t"><span class="sq"></span><b>${esc(feat.name)}</b><span class="tag">${esc(feat.status)}</span></div>
          <p>${esc(feat.one)}</p>
          ${feat.why ? `<p class="why">${esc(feat.why)}</p>` : ""}
          <div class="meta" data-meta="${feat.id}">${liveMeta(feat)}</div>
        </div>
      </a>
      ${rest.map(p => `
      <a class="pcard" href="#/${p.id}" style="--c:${p.color}">
        ${thumb(p)}
        <div class="in">
          <div class="t"><span class="sq"></span><b>${esc(p.name)}</b><span class="tag">${esc(p.status)}</span></div>
          <p>${esc(p.one)}</p>
          <div class="meta"><span>${esc(p.kind)} · ${esc(p.platform)}</span><span data-meta="${p.id}">${liveMeta(p)}</span></div>
        </div>
      </a>`).join("")}
    </div>

    <h2 class="sec" id="hosts">Running at home <span id="host-sum">checking from your browser…</span></h2>
    <section class="panel">
      ${DATA.hosts.map(([n, url, host, note]) => `<div class="hrow" data-host="${esc(n)}"><span class="dot"></span><span>${esc(n)}</span><span class="h">${url.startsWith("http") ? `<a href="${url}">${esc(host)}</a>` : esc(host)} · ${esc(note)}</span><span class="ms">—</span></div>`).join("")}
      <div class="path"><b>you</b> → cloudflare <b id="colo">edge</b> → tunnel → <b>mini PC</b> → venvy → <b>homepage</b><span id="ttfb"></span></div>
    </section>
  </div>`;
  bindTip($("#heat"));
  paintHosts(); edgeInfo();
}

/* ── project page ─────────────────────────────────────── */
function media(p) {
  const m = p.media; if (!m) return "";
  const fig = i => `<figure><img src="${i[0]}" width="${i[1]}" height="${i[2]}" alt="${esc(i[3] || "")}" loading="lazy" data-zoom>${m.type !== "phones" ? `<figcaption>${esc(i[3] || "")}</figcaption>` : ""}</figure>`;
  if (m.type === "phones") return `<div class="media phones">${m.items.map(fig).join("")}</div>${m.note ? `<p class="note">${esc(m.note)} Click a screenshot to enlarge.</p>` : ""}`;
  return `<div class="media ${m.type}">${m.items.map(fig).join("")}</div>`;
}
function page(p) {
  const ps = DATA.projects, i = ps.indexOf(p);
  const prev = ps[(i - 1 + ps.length) % ps.length], next = ps[(i + 1) % ps.length];
  const repo = `https://github.com/${DATA.owner}/${p.repo}`;
  main.innerHTML = `
  <div class="page" style="--c:${p.color}">
    <div class="crumbs"><span><a href="#/">overview</a> / ${esc(p.id)}</span>
      <span class="pn"><a href="#/${prev.id}" title="previous (k)">← k</a><a href="#/${next.id}" title="next (j)">j →</a></span></div>

    <header class="ph">
      <div class="ph-top"><span class="tag">${esc(p.status)}</span><span>${esc(p.kind)} · ${esc(p.platform)}</span></div>
      <h1><span class="sq"></span>${esc(p.name)}</h1>
      <p class="one">${esc(p.one)}</p>
      ${p.why ? `<p class="why"><small>why I built it</small>${esc(p.why)}</p>` : ""}
      <p class="what">${esc(p.what)}</p>
      <div class="live" id="live"><span><b>${commitsOf(p.id)}</b> commits</span><span class="skel"></span></div>
      <div class="actions">${p.links.map(([t, u], j) => `<a class="btn ${j === 0 ? "primary" : ""}" href="${u}">${esc(t)}</a>`).join("")}</div>
    </header>

    <div class="facts">${p.facts.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>

    ${p.demo && DEMOS[p.demo] ? `<section class="demo" id="demo"></section>` : ""}
    ${media(p)}

    <div class="cols">
      <section class="story"><h2 class="sec">How it works</h2>${p.story.map(t => `<p>${t}</p>`).join("")}</section>
      <aside class="aside">
        <div><h2 class="sec">Details</h2>${p.details ? `<ul>${p.details.map(d => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}</div>
        <div><h3>Latest commit</h3><a class="commit" id="lastcommit" href="${repo}/commits"><b>loading…</b>&nbsp;</a></div>
        <div class="lane"><h3>Activity</h3><div id="lane">${lanes([p], { W: 400, showLabels: false, RH: 18 })}</div><p>${commitsOf(p.id)} public commits</p></div>
        <div><h3>Stack</h3><div class="chips">${p.stack.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div></div>
      </aside>
    </div>

    <nav class="next" aria-label="More projects">
      <a href="#/${prev.id}" style="--c:${prev.color}"><small>← previous</small><b><i></i>${esc(prev.name)}</b><span>${esc(prev.one)}</span></a>
      <a class="r" href="#/${next.id}" style="--c:${next.color}"><small>next →</small><b>${esc(next.name)}<i></i></b><span>${esc(next.one)}</span></a>
    </nav>
  </div>`;
  bindTip($("#lane"));
  if (p.demo && DEMOS[p.demo]) DEMOS[p.demo]($("#demo"), p);

  // live: repo + last commit
  const live = $("#live");
  const r = GH[p.repo];
  const fill = r => {
    const bits = [`<span><b>${commitsOf(p.id)}</b> commits</span>`, `<span>last push <b>${ago(r.pushed_at)}</b></span>`];
    if (r.stargazers_count) bits.push(`<span>★ <b>${r.stargazers_count}</b></span>`);
    if (r.license && r.license.spdx_id && r.license.spdx_id !== "NOASSERTION") bits.push(`<span><b>${esc(r.license.spdx_id)}</b> licence</span>`);
    bits.push(`<span><b>${esc(r.language || "")}</b></span>`);
    live.innerHTML = bits.join("");
  };
  r ? fill(r) : gh(`repos/${DATA.owner}/${p.repo}`).then(d => { GH[p.repo] = d; fill(d); }).catch(() => live.querySelector(".skel")?.remove());
  gh(`repos/${DATA.owner}/${p.repo}/commits?per_page=1`).then(([c]) => {
    const el = $("#lastcommit"); if (!el || !c) return;
    el.href = c.html_url;
    el.innerHTML = `<b>${esc(c.commit.message.split("\n")[0])}</b>${esc(c.sha.slice(0, 7))} · ${ago(c.commit.author.date)}`;
  }).catch(() => { const el = $("#lastcommit"); if (el) el.innerHTML = `<b>see the commit history</b>on GitHub ↗`; });
}

/* ── demos ────────────────────────────────────────────── */
const DEMOS = {
  venvy(el) {
    el.className = "demo panel term";
    const cmd = "curl -fsSL https://github.com/nikolaus018/venvy/releases/latest/download/install.sh | sudo bash";
    el.innerHTML = `<div class="term-bar"><i></i><i></i><i></i><span>install on Debian 12+ / Ubuntu 22.04+</span><button type="button">copy</button></div>
<pre><span class="p">$</span> <span class="c">${cmd}</span>
<span class="cm" id="rel"># latest release: …</span>

<span class="cm"># and this page, shipped to Venvy from my laptop:</span>
<span class="p">$</span> <span class="c">python3 ship.py</span>
• Uploading ${DATA.shipFiles || 20} files to homepage (#8) …
<span class="ok">✓ Running: https://ringtwo.win</span></pre>`;
    el.querySelector("button").onclick = async e => {
      try { await navigator.clipboard.writeText(cmd); e.target.textContent = "copied"; } catch { e.target.textContent = "select it"; }
      setTimeout(() => e.target.textContent = "copy", 1500);
    };
    Promise.all([gh("repos/nikolaus018/venvy/releases?per_page=100"), gh("repos/nikolaus018/venvy/releases/latest")]).then(([all, l]) => {
      const r = $("#rel"); if (r) r.textContent = `# latest release: ${l.tag_name}, ${ago(l.published_at)} · ${all.length}${all.length === 100 ? "+" : ""} releases so far`;
    }).catch(() => { const r = $("#rel"); if (r) r.textContent = "# releases: github.com/nikolaus018/venvy/releases"; });
  },

  passable(el) {
    el.className = "demo";
    el.innerHTML = `<div class="tracks"></div>`;
    const clips = [
      { a: "Flo Rida", at: "Good Feeling", b: "Far East Movement", bt: "Like A G6", file: "good-feeling-to-like-a-g6", dur: 60, bars: 16,
        note: "Thirteen bars with both songs playing. The kick and bass change hands on one downbeat." },
      { a: "DJ Antoine", at: "Ma Chérie", b: "LMFAO", bt: "Party Rock Anthem", file: "ma-cherie-to-party-rock-anthem", dur: 60, bars: 16,
        note: "Ma Chérie's voice finishes its line, and Party Rock's comes in a beat later on its own line." },
    ];
    const icon = {
      play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4.2" height="16" rx="1"/><rect x="13.8" y="4" width="4.2" height="16" rx="1"/></svg>',
    };
    const mmss = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";
    clips.forEach(c => {
      const total = 16 + c.bars, from = 8 / total * 100, to = (8 + c.bars) / total * 100;
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `<div class="row"><button class="play" aria-label="Play ${esc(c.at)} into ${esc(c.bt)}">${icon.play}</button>
        <div class="titles"><div class="sidex a"><span class="k">A</span><span class="t">${esc(c.at)}</span><span class="who">${esc(c.a)}</span></div>
        <div class="sidex b"><span class="k">B</span><span class="t">${esc(c.bt)}</span><span class="who">${esc(c.b)}</span></div></div>
        <span class="time">0:00 / ${mmss(c.dur)}</span></div>
        <div class="bar" role="slider" aria-label="Seek" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="seg sa" style="width:${from}%"></div><div class="seg blend" style="left:${from}%;width:${to - from}%"></div><div class="seg sb" style="width:${100 - to}%"></div>
          <span class="lbl" style="left:0">${esc(c.at)}</span><span class="lbl" style="left:${from}%">blend · ${c.bars} bars</span><span class="lbl" style="left:${to}%">${esc(c.bt)}</span><div class="prog"></div></div>
        <p class="note">${esc(c.note)}</p>`;
      const audio = new Audio(); let loading = null;
      // fetched whole: Safari won't stream from a server without byte ranges
      const load = () => loading ??= fetch(`audio/${c.file}.m4a`).then(r => { if (!r.ok) throw 0; return r.blob(); })
        .then(b => new Promise((res, rej) => { audio.addEventListener("loadedmetadata", res, { once: true }); audio.addEventListener("error", rej, { once: true }); audio.src = URL.createObjectURL(b); }))
        .catch(e => { loading = null; card.querySelector(".note").textContent = "This clip couldn't be loaded. Try again."; throw e; });
      const btn = card.querySelector(".play"), bar = card.querySelector(".bar"), prog = card.querySelector(".prog"), time = card.querySelector(".time");
      const len = () => audio.duration || c.dur;
      const paint = () => { const p = audio.currentTime / len() * 100; prog.style.width = p + "%"; bar.setAttribute("aria-valuenow", Math.round(p)); time.textContent = `${mmss(audio.currentTime)} / ${mmss(len())}`; };
      const on = v => { btn.innerHTML = v ? icon.pause : icon.play; card.classList.toggle("playing", v); };
      btn.onclick = async () => {
        if (audio.paused) {
          if (window.__clip && window.__clip !== audio) window.__clip.pause();
          window.__clip = audio; btn.style.opacity = .6;
          try { await load(); } finally { btn.style.opacity = ""; }
          if (window.__clip === audio) audio.play();
        } else audio.pause();
      };
      audio.onplay = () => on(true); audio.onpause = () => on(false);
      audio.onended = () => { on(false); audio.currentTime = 0; paint(); };
      audio.ontimeupdate = paint;
      bar.onclick = async e => { const r = bar.getBoundingClientRect(); await load(); audio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * audio.duration; paint(); };
      bar.onkeydown = e => { if (!audio.duration) return; if (e.key === "ArrowRight") audio.currentTime += 5; if (e.key === "ArrowLeft") audio.currentTime -= 5; paint(); e.stopPropagation(); };
      el.firstChild.appendChild(card);
    });
  },

  garage(el, p) {
    // A model of the firmware's trip rules (README: How it works), 4× faster.
    el.className = "demo panel";
    el.innerHTML = `
      <div class="demo-h"><span><b>Try it:</b> drive the car. Same rules as the firmware, four times faster.</span><span>arrive 150 m · leave 300 m</span></div>
      <div class="sim-track"><svg viewBox="0 0 800 96" id="gsvg"></svg></div>
      <div class="sim-ctrl">
        <input type="range" min="0" max="600" step="1" value="0" id="gd" aria-label="Distance from home in metres">
        <div class="sim-btns">
          <button class="btn sm" id="gaway" type="button">Drive away</button>
          <button class="btn sm" id="ghome" type="button">Drive home</button>
          <button class="btn sm" id="gign" type="button">Ignition off</button>
        </div>
      </div>
      <div class="sim-state">
        <div>flash<b id="gflash">home</b></div>
        <div>gps<b id="gfix">—</b></div>
        <div>trip<b id="gmode">—</b></div>
        <div>remote<b><span class="led" id="gled"></span><span id="gpress">0</span> presses</b></div>
      </div>
      <pre class="serial" id="glog" aria-live="off"></pre>`;
    const ARRIVE = 150, LEAVE = 300, S = { flash: "home", on: true, d: 0, mode: "", t: 0, left: 0, until: 0, presses: 0, lastFix: null, drive: null };
    const svg = $("#gsvg", el), log = $("#glog", el), led = $("#gled", el);
    const X = d => 52 + d / 600 * 728;
    function draw() {
      svg.innerHTML = `
        <rect x="${X(0)}" y="58" width="${X(600) - X(0)}" height="10" rx="5" fill="#1d1d21"/>
        <rect x="${X(0)}" y="58" width="${X(ARRIVE) - X(0)}" height="10" rx="5" fill="${p.color}" fill-opacity=".25"/>
        <line x1="${X(ARRIVE)}" x2="${X(ARRIVE)}" y1="30" y2="80" stroke="${p.color}" stroke-dasharray="3 4"/>
        <line x1="${X(LEAVE)}" x2="${X(LEAVE)}" y1="30" y2="80" stroke="#62626d" stroke-dasharray="3 4"/>
        <text x="${X(ARRIVE) + 5}" y="38">arrive</text><text x="${X(LEAVE) + 5}" y="38">leave</text>
        <text x="${X(0)}" y="92" text-anchor="middle">0 m</text><text x="${X(ARRIVE)}" y="92" text-anchor="middle">150</text><text x="${X(LEAVE)}" y="92" text-anchor="middle">300</text><text x="${X(600)}" y="92" text-anchor="end">600 m</text>
        <g transform="translate(6 34)"><path d="M0 14 L18 2 L36 14 V34 H0Z" fill="#212126" stroke="#62626d"/><rect x="7" y="18" width="22" height="16" fill="#0f0f11" stroke="#62626d"/><text x="18" y="-6" text-anchor="middle">home</text></g>
        <g id="waves" opacity="0"><path d="M50 40 a10 10 0 0 1 0 14" fill="none" stroke="${p.color}" stroke-width="2"/><path d="M56 35 a17 17 0 0 1 0 24" fill="none" stroke="${p.color}" stroke-width="2" opacity=".6"/></g>
        <g id="car" transform="translate(${X(S.d) - 16} 46)"><rect x="0" y="0" width="32" height="16" rx="5" fill="${S.on ? p.color : "#62626d"}"/><rect x="7" y="-6" width="16" height="8" rx="3" fill="${S.on ? p.color : "#62626d"}" opacity=".7"/><circle cx="8" cy="17" r="3.5" fill="#0f0f11" stroke="#9a9aa6"/><circle cx="24" cy="17" r="3.5" fill="#0f0f11" stroke="#9a9aa6"/></g>`;
    }
    const pad = n => String(n).padStart(6, " ");
    function say(lvl, tag, msg) {
      log.innerHTML += `<span class="${lvl}">${lvl} </span><span class="ts">(${pad(S.t * 1000)})</span> ${tag}: ${esc(msg)}\n`;
      log.scrollTop = log.scrollHeight;
    }
    function ui() {
      $("#gflash", el).textContent = S.flash;
      $("#gmode", el).textContent = S.on ? S.mode : "off";
      $("#gpress", el).textContent = S.presses;
      $("#gign", el).textContent = S.on ? "Ignition off" : "Ignition on";
      const car = $("#car", svg); if (car) car.setAttribute("transform", `translate(${X(S.d) - 16} 46)`);
    }
    function press() {
      S.presses++; led.classList.add("on"); const w = $("#waves", svg); if (w) w.setAttribute("opacity", 1);
      setTimeout(() => { led.classList.remove("on"); const w = $("#waves", svg); if (w) w.setAttribute("opacity", 0); }, 220);
    }
    function boot() {
      S.on = true; S.t = 0; S.lastFix = null; draw();
      say("I", "boot", `ESP32-C3 up, flash says parked=${S.flash}`);
      if (S.flash === "home") { S.mode = "leaving"; S.left = 10; say("I", "trip", "parked at home: pressing the remote 10× while driving out"); }
      else { S.mode = "away"; say("I", "trip", "parked away: waiting for a GPS fix"); }
      ui();
    }
    function tick() {
      if (!S.on) return;
      S.t++;
      if (S.drive) { S.d = Math.max(0, Math.min(600, S.d + S.drive * 30)); $("#gd", el).value = S.d; if (S.d === 0 || S.d === 600) S.drive = null; }
      // underground garage: no sky, no fix
      const sats = S.d < 25 ? 0 : 7 + (S.t % 3), acc = S.d < 25 ? 999 : 8 + (S.t % 5);
      const fix = sats >= 4 && acc <= 50;
      if (fix !== S.lastFix) { fix ? say("I", "gnss", `fix ok: ${sats} sats, ${acc} m`) : say("W", "gnss", S.d < 25 ? "no fix (underground)" : "fix rejected"); S.lastFix = fix; }
      $("#gfix", el).textContent = fix ? `${sats} sats` : "no fix";
      if (fix) {
        if ((S.mode === "leaving" || S.mode === "idle") && S.d > LEAVE) { S.mode = "away"; S.left = 0; S.flash = "away"; say("I", "trip", `past ${LEAVE} m: away, saved to flash`); }
        else if (S.mode === "away" && S.d < ARRIVE) { S.mode = "arriving"; S.until = S.t + 180; S.flash = "home"; say("I", "trip", `inside ${ARRIVE} m: pressing every 2 s for up to 180 s, saved home`); }
        else if (S.mode === "arriving" && S.d > LEAVE) { S.mode = "away"; S.flash = "away"; say("I", "trip", "drove past home, left the radius again: stop pressing"); }
      }
      if (S.mode === "leaving" && S.left > 0 && S.t % 2 === 0) { press(); if (--S.left === 0) say("I", "remote", "10 presses done"); }
      if (S.mode === "arriving" && S.t % 2 === 0) { if (S.t <= S.until) press(); else { S.mode = "idle"; say("I", "trip", "180 s up, stop pressing"); } }
      ui();
    }
    $("#gd", el).oninput = e => { S.drive = null; S.d = +e.target.value; ui(); };
    $("#gaway", el).onclick = () => { if (!S.on) boot(); S.drive = 1; };
    $("#ghome", el).onclick = () => { if (!S.on) boot(); S.drive = -1; };
    $("#gign", el).onclick = () => {
      if (S.on) { S.on = false; S.drive = null; say("W", "power", "ignition off, USB power gone (flash keeps parked=" + S.flash + ")"); draw(); ui(); }
      else boot();
    };
    draw(); boot();
    const timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(timer); tick(); }, 250);
  },
};

/* ── hosts + edge ─────────────────────────────────────── */
function probeHosts() {
  HOSTS = DATA.hosts.map(([n, url]) => ({ n, url, state: "", ms: null }));
  let done = 0;
  HOSTS.forEach(h => {
    const t0 = performance.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6000);
    fetch(h.url, { mode: "no-cors", cache: "no-store", signal: ctl.signal })
      .then(() => { h.state = "up"; h.ms = Math.round(performance.now() - t0); })
      .catch(() => { h.state = "down"; })
      .finally(() => { clearTimeout(timer); done++; paintHosts(done === HOSTS.length); });
  });
  paintHosts(false);
}
function paintHosts(final) {
  if (!HOSTS) return;
  const up = HOSTS.filter(h => h.state === "up").length;
  $("#hosts-mini .hm-dots").innerHTML = HOSTS.map(h => `<i class="${h.state}" title="${esc(h.n)}"></i>`).join("");
  $("#hosts-mini .hm-t").textContent = final === false && HOSTS.some(h => !h.state) ? "checking hosts…" : `${up}/${HOSTS.length} apps up at home`;
  HOSTS.forEach(h => {
    const row = document.querySelector(`.hrow[data-host="${CSS.escape(h.n)}"]`); if (!row) return;
    row.querySelector(".dot").className = "dot " + h.state;
    row.querySelector(".ms").textContent = h.state === "up" ? h.ms + " ms" : h.state === "down" ? "down" : "—";
  });
  const sum = $("#host-sum"); if (sum && HOSTS.every(h => h.state)) sum.textContent = `${up} of ${HOSTS.length} up · checked from your browser`;
}
let EDGE = null;
function edgeInfo() {
  const put = () => {
    if (EDGE && $("#colo")) $("#colo").textContent = EDGE;
    const n = performance.getEntriesByType("navigation")[0];
    if (n && n.responseStart > n.requestStart && $("#ttfb")) $("#ttfb").innerHTML = ` · first byte <b>${Math.round(n.responseStart - n.requestStart)} ms</b>`;
  };
  if (EDGE !== null) return put();
  EDGE = "";
  fetch("/cdn-cgi/trace", { cache: "no-store" }).then(r => r.ok ? r.text() : Promise.reject())
    .then(t => { const m = t.match(/^colo=(\w+)/m); EDGE = m ? m[1] : ""; put(); }).catch(put);
}

/* ── router, keys, lightbox ───────────────────────────── */
function route() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const p = id && proj(id);
  const go = () => {
    if (p) { page(p); document.title = `${p.name} · Nikolaus`; }
    else { overview(); document.title = "Nikolaus · ringtwo.win"; }
    markNav(p ? p.id : "");
    if (window.__clip) window.__clip.pause();
  };
  if (route.ran && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const vt = document.startViewTransition(go);
    [vt.ready, vt.finished, vt.updateCallbackDone].forEach(p => p.catch(() => {}));
  } else go();
  route.ran = true;
  scrollTo({ top: 0 });
}
addEventListener("hashchange", route);
addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
  const lb = $("#lightbox");
  if (e.key === "Escape") { if (!lb.hidden) return closeLb(); location.hash = "#/"; return; }
  const ps = DATA.projects, id = location.hash.replace(/^#\/?/, ""), i = ps.findIndex(p => p.id === id);
  if (e.key === "j") location.hash = "#/" + ps[(i + 1) % ps.length].id;
  if (e.key === "k") location.hash = "#/" + ps[i <= 0 ? ps.length - 1 : i - 1].id;
});
function closeLb() { $("#lightbox").hidden = true; }
document.addEventListener("click", e => {
  const img = e.target.closest && e.target.closest("img[data-zoom]");
  if (img) { const lb = $("#lightbox"); $("img", lb).src = img.src; $("figcaption", lb).textContent = img.alt; lb.hidden = false; return; }
  if (e.target.closest && e.target.closest("#lightbox")) closeLb();
  const hm = e.target.closest && e.target.closest("[data-goto=hosts]");
  if (hm) { e.preventDefault(); if (location.hash.length > 2) { location.hash = "#/"; setTimeout(() => $("#hosts")?.scrollIntoView(), 60); } else $("#hosts")?.scrollIntoView({ behavior: "smooth" }); }
});

/* ── boot ─────────────────────────────────────────────── */
Promise.all([fetch("projects.json").then(r => r.json()), fetch("commits.json").then(r => r.json())]).then(([d, c]) => {
  DATA = d; COMMITS = c;
  renderNav(); route(); probeHosts();
  gh(`users/${DATA.owner}/repos?per_page=100&sort=pushed`).then(list => {
    list.forEach(r => GH[r.name] = r);
    document.querySelectorAll("[data-meta]").forEach(el => { const p = proj(el.dataset.meta); if (p) el.textContent = liveMeta(p); });
  }).catch(() => {});
});
})();
