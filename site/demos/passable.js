// "Listen to a transition": two real renders from Passable, with a live spectrum that hands over from A to B.
const CSS = `
.pz-top { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.pz-play { flex: none; width: 52px; height: 52px; border-radius: 50%; border: 0; background: var(--text); color: #111; cursor: pointer; display: grid; place-items: center; transition: transform .1s; }
.pz-play:active { transform: scale(.96); }
.pz-play svg { width: 20px; height: 20px; }
.pz-songs { flex: 1; min-width: 200px; display: grid; gap: 4px; }
.pz-song { display: flex; align-items: baseline; gap: 8px; min-width: 0; transition: opacity .3s; }
.pz-song .k { flex: none; width: 19px; height: 19px; border-radius: 5px; font: 700 11px var(--sans); color: #fff; display: inline-grid; place-items: center; transform: translateY(3px); }
.pz-song b { font-size: 15.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pz-song span { color: var(--muted); font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pz-meta { font: 12px/1.6 var(--mono); color: var(--muted); text-align: right; }
.pz-meta b { color: var(--text); font-weight: 600; display: block; font-size: 15px; }
.pz-viz { position: relative; height: 220px; background: #09090b; }
.pz-viz canvas { width: 100%; height: 100%; display: block; }
.pz-sect { position: absolute; left: 16px; top: 12px; font: 600 11px var(--mono); letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
.pz-beat { position: absolute; right: 16px; top: 12px; display: flex; gap: 5px; }
.pz-beat i { width: 8px; height: 8px; border-radius: 50%; background: #26262c; transition: background .06s; }
.pz-beat i.on { background: var(--text); }
.pz-bar { position: relative; height: 34px; margin: 0; cursor: pointer; background: var(--panel-2); border-top: 1px solid var(--line); touch-action: none; }
.pz-bar .seg { position: absolute; top: 0; bottom: 0; }
.pz-bar .lbl { position: absolute; top: 50%; transform: translateY(-50%); font: 600 10.5px var(--mono); letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.6); pointer-events: none; padding: 0 10px; white-space: nowrap; }
.pz-bar .tick { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.07); }
.pz-bar .prog { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: rgba(255,255,255,.12); border-right: 2px solid #fff; pointer-events: none; }
.pz-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 11px 16px; border-top: 1px solid var(--line); }
.pz-foot p { margin: 0; color: var(--muted); font-size: 13.5px; flex: 1; min-width: 220px; }
@media (max-width: 620px) { .pz-viz { height: 170px; } .pz-meta { text-align: left; width: 100%; display: flex; gap: 14px; } .pz-meta b { display: inline; font-size: 13px; } .pz-bar .lbl { display: none; } }
`;
const CLIPS = [
  { a: "Flo Rida", at: "Good Feeling", b: "Far East Movement", bt: "Like A G6", file: "good-feeling-to-like-a-g6", dur: 60, bars: 16,
    note: "Thirteen bars with both songs playing. The kick and bass change hands on one downbeat, so there's never two basslines at once." },
  { a: "DJ Antoine", at: "Ma Chérie", b: "LMFAO", bt: "Party Rock Anthem", file: "ma-cherie-to-party-rock-anthem", dur: 60, bars: 16,
    note: "Ma Chérie's voice finishes its line, and Party Rock's comes in a beat later on its own line. That's the breath detector at work." },
];
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4.2" height="16" rx="1"/><rect x="13.8" y="4" width="4.2" height="16" rx="1"/></svg>',
};
const A = [91, 141, 239], Bc = [240, 137, 74];

export default function (el, { esc, onLeave }) {
  if (!document.getElementById("css-pz")) document.head.insertAdjacentHTML("beforeend", `<style id="css-pz">${CSS}</style>`);
  el.innerHTML = `
    <div class="pz-top">
      <button class="pz-play" id="pz-play" type="button" aria-label="Play">${ICON.play}</button>
      <div class="pz-songs">
        <div class="pz-song" id="pz-a"><span class="k" style="background:#5b8def">A</span><b></b><span></span></div>
        <div class="pz-song" id="pz-b"><span class="k" style="background:#f0894a">B</span><b></b><span></span></div>
      </div>
      <div class="pz-meta"><b id="pz-time">0:00 / 1:00</b><span id="pz-bpm"></span></div>
    </div>
    <div class="pz-viz"><canvas id="pz-c"></canvas><span class="pz-sect" id="pz-sect">A, 8 bars</span><span class="pz-beat" id="pz-beat"><i></i><i></i><i></i><i></i></span></div>
    <div class="pz-bar" id="pz-bar" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
    <div class="pz-foot"><p id="pz-note"></p><div class="seg-ctl" role="group" aria-label="Transition">${CLIPS.map((c, i) => `<button type="button" data-i="${i}" aria-pressed="${!i}">${i + 1}</button>`).join("")}</div></div>`;
  const $ = s => el.querySelector(s);
  const audio = new Audio(); audio.preload = "metadata"; audio.crossOrigin = "anonymous";
  let ci = 0, ac = null, an = null, freq = null, raf = 0;
  const cv = $("#pz-c"), g = cv.getContext("2d"), clip = () => CLIPS[ci];
  const totalBars = () => 16 + clip().bars, len = () => audio.duration || clip().dur;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function load(i) {
    ci = i; const c = clip();
    audio.src = `audio/${c.file}.m4a`;
    $("#pz-a b").textContent = c.at; $("#pz-a span").textContent = c.a;
    $("#pz-b b").textContent = c.bt; $("#pz-b span").textContent = c.b;
    $("#pz-note").textContent = c.note;
    const tb = totalBars(), from = 8 / tb * 100, to = (8 + c.bars) / tb * 100;
    $("#pz-bar").innerHTML = `<div class="seg" style="left:0;width:${from}%;background:rgba(91,141,239,.24)"></div><div class="seg" style="left:${from}%;width:${to - from}%;background:linear-gradient(90deg,rgba(91,141,239,.34),rgba(240,137,74,.34))"></div><div class="seg" style="left:${to}%;right:0;background:rgba(240,137,74,.24)"></div>`
      + Array.from({ length: tb - 1 }, (_, k) => `<span class="tick" style="left:${(k + 1) / tb * 100}%"></span>`).join("")
      + `<span class="lbl" style="left:0">A · 8 bars</span><span class="lbl" style="left:${from}%">blend · ${c.bars} bars</span><span class="lbl" style="left:${to}%">B · 8 bars</span><div class="prog" id="pz-prog"></div>`;
    $("#pz-bpm").textContent = `≈ ${Math.round(tb * 4 / c.dur * 60)} BPM · ${tb} bars`;
    el.querySelectorAll("[data-i]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.i === i));
    paint();
  }
  function mixAt(t) { const bar = t / len() * totalBars(); return Math.max(0, Math.min(1, (bar - 8) / clip().bars)); }
  function paint() {
    const t = audio.currentTime || 0, tb = totalBars(), bar = t / len() * tb, m = mixAt(t);
    $("#pz-prog").style.width = (t / len() * 100) + "%";
    $("#pz-bar").setAttribute("aria-valuenow", Math.round(t / len() * 100));
    $("#pz-time").textContent = `${mmss(t)} / ${mmss(len())}`;
    $("#pz-a").style.opacity = (1 - m * .75).toFixed(2); $("#pz-b").style.opacity = (.25 + m * .75).toFixed(2);
    $("#pz-sect").textContent = bar < 8 ? `A · bar ${Math.floor(bar) + 1} of 8` : bar < 8 + clip().bars ? `blend · bar ${Math.floor(bar - 8) + 1} of ${clip().bars}` : `B · bar ${Math.floor(bar - 8 - clip().bars) + 1} of 8`;
    const beat = Math.floor((bar % 1) * 4), playing = !audio.paused;
    el.querySelectorAll("#pz-beat i").forEach((d, k) => d.classList.toggle("on", playing && k === beat));
  }
  function frame() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    g.clearRect(0, 0, w, h);
    const N = 72, gap = 2 * dpr, bw = (w - gap * (N - 1)) / N, mid = h * .5, m = mixAt(audio.currentTime || 0);
    const col = A.map((a, k) => Math.round(a + (Bc[k] - a) * m));
    if (an) an.getByteFrequencyData(freq);
    for (let i = 0; i < N; i++) {
      let v;
      if (an && !audio.paused) { const lo = Math.floor(Math.pow(i / N, 2) * freq.length * .7) + 1, hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / N, 2) * freq.length * .7) + 1); let s = 0; for (let k = lo; k < hi; k++) s += freq[k]; v = Math.pow(s / (hi - lo) / 255, 1.9); }
      else v = .05 + .04 * Math.sin(i * .5 + performance.now() / 700);
      const bh = Math.max(2 * dpr, v * h * .46);
      g.fillStyle = `rgba(${col.join(",")},${(.35 + v * .65).toFixed(2)})`;
      g.fillRect(i * (bw + gap), mid - bh, bw, bh * 2);
    }
    paint();
    raf = requestAnimationFrame(frame);
  }
  function ensureAudio() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaElementSource(audio); an = ac.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .78;
      freq = new Uint8Array(an.frequencyBinCount); src.connect(an); an.connect(ac.destination);
    } catch { an = null; }
  }
  $("#pz-play").onclick = async () => {
    if (audio.paused) { ensureAudio(); await ac?.resume?.(); try { await audio.play(); } catch { $("#pz-note").textContent = "This clip couldn't be played. Try again."; } }
    else audio.pause();
  };
  audio.onplay = () => { $("#pz-play").innerHTML = ICON.pause; $("#pz-play").setAttribute("aria-label", "Pause"); };
  audio.onpause = () => { $("#pz-play").innerHTML = ICON.play; $("#pz-play").setAttribute("aria-label", "Play"); };
  audio.onended = () => { audio.currentTime = 0; };
  const seek = e => { const r = $("#pz-bar").getBoundingClientRect(); audio.currentTime = Math.max(0, Math.min(.999, (e.clientX - r.left) / r.width)) * len(); paint(); };
  let sk = false;
  $("#pz-bar").addEventListener("pointerdown", e => { sk = true; $("#pz-bar").setPointerCapture(e.pointerId); seek(e); });
  $("#pz-bar").addEventListener("pointermove", e => sk && seek(e));
  $("#pz-bar").addEventListener("pointerup", () => sk = false);
  $("#pz-bar").addEventListener("keydown", e => { if (e.key === "ArrowRight") audio.currentTime = Math.min(len(), audio.currentTime + 5); if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5); });
  el.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { const was = !audio.paused; load(+b.dataset.i); if (was) audio.play(); });
  load(0);
  raf = requestAnimationFrame(frame);
  onLeave(() => { cancelAnimationFrame(raf); audio.pause(); audio.src = ""; ac?.close?.(); });
}
