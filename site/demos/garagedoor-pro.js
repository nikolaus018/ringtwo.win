// A model of garageDoor-pro's trip rules (see the repo's README), running 4× faster.
const CSS = `
.gd-track { padding: 18px 16px 4px; }
.gd-track svg { width: 100%; height: auto; display: block; overflow: visible; touch-action: none; cursor: grab; }
.gd-track svg:active { cursor: grabbing; }
.gd-track text { font: 11px ui-monospace, Menlo, monospace; fill: #66666f; }
.gd-ctrl { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 16px 14px; align-items: center; }
.gd-ctrl .sp { flex: 1; }
.gd-state { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; background: var(--line); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.gd-state div { background: var(--panel); padding: 10px 14px; font: 11.5px var(--mono); color: var(--dim); min-width: 0; }
.gd-state b { display: block; font: 600 15px var(--mono); color: var(--text); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gd-led { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #3a1a16; margin-right: 7px; vertical-align: -1px; transition: background .08s, box-shadow .08s; }
.gd-led.on { background: var(--bad); box-shadow: 0 0 12px var(--bad); }
.gd-log { margin: 0; background: #09090b; padding: 12px 16px; height: 176px; overflow-y: auto; font: 12px/1.7 var(--mono); color: var(--muted); }
.gd-log .I { color: #7fd6a0; } .gd-log .W { color: var(--warn); } .gd-log .ts { color: var(--dim); }
@media (max-width: 620px) { .gd-state { grid-template-columns: repeat(2, minmax(0, 1fr)); } .gd-log { height: 150px; } }
`;
const ARRIVE = 150, LEAVE = 300, MAX = 600;

export default function (el, { p, esc, onLeave }) {
  if (!document.getElementById("css-gd")) document.head.insertAdjacentHTML("beforeend", `<style id="css-gd">${CSS}</style>`);
  const c = p.color;
  el.innerHTML = `
    <div class="gd-track"><svg viewBox="0 0 800 120" id="gd-svg" role="img" aria-label="The car on the road between home and 600 metres. Drag it."></svg></div>
    <div class="gd-ctrl">
      <button class="btn sm tint" id="gd-away" type="button">Drive away</button>
      <button class="btn sm tint" id="gd-home" type="button">Drive home</button>
      <span class="sp"></span>
      <button class="btn sm" id="gd-ign" type="button">Ignition off</button>
    </div>
    <div class="gd-state">
      <div>saved in flash<b id="gd-flash">home</b></div>
      <div>GPS<b id="gd-fix">no fix</b></div>
      <div>trip<b id="gd-mode">—</b></div>
      <div>remote<b><span class="gd-led" id="gd-led"></span><span id="gd-press">0</span> presses</b></div>
    </div>
    <pre class="gd-log" id="gd-log" aria-live="off"></pre>`;
  const $ = s => el.querySelector(s);
  const svg = $("#gd-svg"), log = $("#gd-log"), led = $("#gd-led");
  const S = { flash: "home", on: true, d: 0, mode: "", t: 0, left: 0, until: 0, presses: 0, fix: null, drive: 0, door: 0, doorUntil: 0 };
  const X = d => 120 + d / MAX * 660;

  svg.innerHTML = `
    <rect x="${X(0)}" y="78" width="${X(MAX) - X(0)}" height="12" rx="6" fill="#1f1f24"/>
    <rect x="${X(0)}" y="78" width="${X(ARRIVE) - X(0)}" height="12" rx="6" fill="${c}" fill-opacity=".22"/>
    <line x1="${X(ARRIVE)}" x2="${X(ARRIVE)}" y1="44" y2="100" stroke="${c}" stroke-dasharray="3 4"/>
    <line x1="${X(LEAVE)}" x2="${X(LEAVE)}" y1="44" y2="100" stroke="#66666f" stroke-dasharray="3 4"/>
    <text x="${X(ARRIVE) + 6}" y="52">arrive</text><text x="${X(LEAVE) + 6}" y="52">leave</text>
    <text x="${X(ARRIVE)}" y="114" text-anchor="middle">150 m</text><text x="${X(LEAVE)}" y="114" text-anchor="middle">300 m</text><text x="${X(MAX)}" y="114" text-anchor="end">600 m</text>
    <g transform="translate(10 18)">
      <path d="M0 30 L48 4 L96 30 V72 H0Z" fill="#1f1f24" stroke="#4a4a52"/>
      <rect x="16" y="38" width="64" height="34" fill="#4a3d1e" stroke="#4a4a52"/><rect x="40" y="40" width="16" height="3" rx="1.5" fill="#f5d27a"/><rect x="16" y="62" width="64" height="10" fill="#2b2412"/>
      <g id="gd-door"><rect x="16" y="38" width="64" height="34" fill="#38383f"/>${[0, 1, 2, 3].map(i => `<line x1="16" x2="80" y1="${46.5 + i * 8.5}" y2="${46.5 + i * 8.5}" stroke="#2a2a30"/>`).join("")}</g>
      <text x="48" y="-4" text-anchor="middle">home · no GPS inside</text>
    </g>
    <g id="gd-waves" opacity="0" fill="none" stroke="${c}" stroke-width="2.2"><path d="M110 38 a12 12 0 0 1 0 20"/><path d="M118 31 a22 22 0 0 1 0 34"/></g>
    <g id="gd-car"><rect x="-20" y="-16" width="40" height="17" rx="6" fill="${c}"/><rect x="-10" y="-24" width="20" height="10" rx="3" fill="${c}" opacity=".7"/>
      <circle cx="-10" cy="2" r="4.5" fill="#0e0e10" stroke="#a0a0ab"/><circle cx="10" cy="2" r="4.5" fill="#0e0e10" stroke="#a0a0ab"/>
      <rect x="-28" y="-30" width="56" height="44" fill="transparent"/></g>`;
  const car = $("#gd-car"), door = $("#gd-door"), waves = $("#gd-waves");

  const pad = n => String(n).padStart(6, " ");
  const say = (lvl, tag, msg) => { log.insertAdjacentHTML("beforeend", `<span class="${lvl}">${lvl}</span> <span class="ts">(${pad(S.t * 1000)})</span> ${tag}: ${esc(msg)}\n`); log.scrollTop = log.scrollHeight; };
  function ui() {
    $("#gd-flash").textContent = `parked=${S.flash}`;
    $("#gd-mode").textContent = S.on ? S.mode : "no power";
    $("#gd-press").textContent = S.presses;
    $("#gd-ign").textContent = S.on ? "Ignition off" : "Ignition on";
    car.setAttribute("transform", `translate(${X(S.d)} 82)`);
    car.querySelectorAll("rect")[0].setAttribute("fill", S.on ? c : "#4a4a52");
  }
  // the door rolls up from the bottom
  function drawDoor() { const r = door.querySelector("rect"); r.setAttribute("height", 34 * (1 - S.door) + .5); door.querySelectorAll("line").forEach((l, i) => l.setAttribute("opacity", 46.5 + i * 8.5 < 38 + 34 * (1 - S.door) ? 1 : 0)); }
  function press() {
    S.presses++;
    led.classList.add("on"); waves.setAttribute("opacity", 1);
    setTimeout(() => { led.classList.remove("on"); waves.setAttribute("opacity", 0); }, 230);
    // a real door only reacts if the remote is in range
    if (S.d < 120) { S.doorUntil = S.t + 14; }
  }
  function boot() {
    S.on = true; S.t = 0; S.fix = null;
    say("I", "boot", `ESP32-C3 up, flash says parked=${S.flash}`);
    if (S.flash === "home") { S.mode = "leaving"; S.left = 10; say("I", "trip", "parked at home, so pressing 10× while driving out"); }
    else { S.mode = "away"; say("I", "trip", "parked away: waiting for a GPS fix"); }
    ui();
  }
  function tick() {
    // the door motor runs on its own power
    const want = S.t < S.doorUntil ? 1 : 0;
    S.door += Math.sign(want - S.door) * .25; S.door = Math.max(0, Math.min(1, S.door)); drawDoor();
    if (!S.on) return ui();
    S.t++;
    if (S.drive) { S.d = Math.max(0, Math.min(MAX, S.d + S.drive * 26)); if (S.d === 0 || S.d === MAX) S.drive = 0; }
    const under = S.d < 25, sats = under ? 0 : 7 + (S.t % 3), acc = under ? 999 : 8 + (S.t % 5), fix = sats >= 4 && acc <= 50;
    if (fix !== S.fix) { fix ? say("I", "gnss", `fix ok: ${sats} sats, ±${acc} m`) : say("W", "gnss", under ? "no fix (underground)" : "fix rejected"); S.fix = fix; }
    $("#gd-fix").textContent = fix ? `${sats} sats · ±${acc} m` : "no fix";
    if (fix) {
      if ((S.mode === "leaving" || S.mode === "home") && S.d > LEAVE) { S.mode = "away"; S.left = 0; S.flash = "away"; say("I", "trip", `past ${LEAVE} m: away, saved to flash`); }
      else if (S.mode === "away" && S.d < ARRIVE) { S.mode = "arriving"; S.until = S.t + 180; S.flash = "home"; say("I", "trip", `inside ${ARRIVE} m: pressing every 2 s for up to 180 s, saved parked=home`); }
      else if (S.mode === "arriving" && S.d > LEAVE) { S.mode = "away"; S.flash = "away"; say("I", "trip", "drove past home and left the radius again: stop pressing"); }
    }
    if (S.mode === "leaving" && S.left > 0 && S.t % 2 === 0) { press(); if (--S.left === 0) { say("I", "remote", "10 presses done"); } }
    if (S.mode === "arriving" && S.t % 2 === 0) {
      if (S.t <= S.until) press(); else { S.mode = "home"; say("I", "trip", "180 s up, stop pressing"); }
    }
    ui();
  }
  // drag the car
  let dragging = false;
  const toD = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 800; return Math.max(0, Math.min(MAX, (x - 120) / 660 * MAX)); };
  svg.addEventListener("pointerdown", e => { if (!S.on) return; dragging = true; svg.setPointerCapture(e.pointerId); S.drive = 0; S.d = toD(e); ui(); });
  svg.addEventListener("pointermove", e => { if (dragging) { S.d = toD(e); ui(); } });
  svg.addEventListener("pointerup", () => dragging = false);
  $("#gd-away").onclick = () => { if (!S.on) boot(); S.drive = 1; };
  $("#gd-home").onclick = () => { if (!S.on) boot(); S.drive = -1; };
  $("#gd-ign").onclick = () => {
    if (S.on) { S.on = false; S.drive = 0; say("W", "power", `ignition off: power gone, flash keeps parked=${S.flash}`); ui(); }
    else boot();
  };
  ui(); drawDoor(); boot();
  const timer = setInterval(tick, 250);
  onLeave(() => clearInterval(timer));
}
