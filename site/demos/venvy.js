// "Break a deploy": Venvy's deploy pipeline with its health check and automatic rollback, played out in the browser.
const CSS = `
.vv { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); }
.vv-l { padding: 16px; display: grid; gap: 14px; align-content: start; border-right: 1px solid var(--line); }
.vv-app { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.vv-app b { font-size: 16px; }
.vv-pill { font: 600 10.5px var(--mono); letter-spacing: .05em; text-transform: uppercase; padding: 3px 7px; border-radius: 6px; border: 1px solid; }
.vv-pill.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, transparent); background: color-mix(in srgb, var(--ok) 10%, transparent); }
.vv-pill.busy { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.vv-pill.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, transparent); background: color-mix(in srgb, var(--bad) 10%, transparent); }
.vv-pill.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent); }
.vv-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.vv-steps { display: grid; gap: 2px; }
.vv-step { display: grid; grid-template-columns: 20px 1fr auto; gap: 10px; align-items: center; padding: 7px 10px; border-radius: 8px; font-size: 14px; color: var(--dim); }
.vv-step.run { background: var(--panel-2); color: var(--text); }
.vv-step.done { color: var(--muted); }
.vv-step.fail { color: var(--bad); }
.vv-step i { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-2); display: grid; place-items: center; font: 700 10px var(--mono); font-style: normal; }
.vv-step.run i { border-color: var(--accent); border-top-color: transparent; animation: vvspin .7s linear infinite; }
.vv-step.done i { border-color: var(--ok); background: var(--ok); color: #0e0e10; }
.vv-step.fail i { border-color: var(--bad); background: var(--bad); color: #0e0e10; }
.vv-step span { font: 11.5px var(--mono); color: var(--dim); }
@keyframes vvspin { to { transform: rotate(360deg); } }
.vv-rel { display: grid; gap: 4px; }
.vv-rel div { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; font: 12.5px var(--mono); color: var(--muted); padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }
.vv-rel div.live { border-color: color-mix(in srgb, var(--ok) 40%, var(--line)); color: var(--text); }
.vv-rel em { font-style: normal; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vv-log { margin: 0; background: #09090b; padding: 14px 16px; font: 12px/1.75 var(--mono); color: var(--muted); height: 100%; min-height: 300px; max-height: 420px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; }
.vv-log .p { color: var(--accent); } .vv-log .ok { color: var(--ok); } .vv-log .bad { color: var(--bad); } .vv-log .w { color: var(--warn); } .vv-log .d { color: var(--dim); }
.vv-real { padding: 11px 16px; border-top: 1px solid var(--line); font: 12px/1.6 var(--mono); color: var(--dim); display: flex; gap: 6px 14px; flex-wrap: wrap; }
.vv-real b { color: var(--muted); font-weight: 500; }
@media (max-width: 760px) { .vv { grid-template-columns: 1fr; } .vv-l { border-right: 0; border-bottom: 1px solid var(--line); } .vv-log { min-height: 220px; max-height: 260px; } }
`;
const STEPS = [["pull", "git pull"], ["install", "pip install -r requirements.txt"], ["build", "build"], ["restart", "restart as user shop-api"], ["health", "GET /health"]];
const BREAKS = [
  { at: "restart", log: ["Traceback (most recent call last):", '  File "main.py", line 4, in <module>', "    import stripe", "ModuleNotFoundError: No module named 'stripe'", "process exited with code 1"], why: "crashes on start: a dependency missing from requirements.txt" },
  { at: "health", log: ["listening on :52891", "GET /health → 500 Internal Server Error", "KeyError: 'DATABASE_URL'"], why: "starts, but answers 500: an environment variable it expects isn't set" },
  { at: "health", log: ["listening on :52891", "GET /health … no answer within 5 s"], why: "starts, but hangs: a migration locks the database" },
];

export default function (el, { p, onLeave, host }) {
  if (!document.getElementById("css-vv")) document.head.insertAdjacentHTML("beforeend", `<style id="css-vv">${CSS}</style>`);
  el.innerHTML = `
    <div class="vv">
      <div class="vv-l">
        <div class="vv-app"><b>shop-api</b><span class="vv-pill ok" id="vv-state">running v12</span><span class="vv-pill ok" id="vv-health">healthy</span></div>
        <div class="vv-btns">
          <button class="btn sm tint" id="vv-good" type="button">Deploy a working v13</button>
          <button class="btn sm" id="vv-bad" type="button" style="--c:#e5533d">Deploy a broken v13</button>
        </div>
        <div class="vv-steps" id="vv-steps"></div>
        <div><div class="label" style="margin-bottom:6px">Releases</div><div class="vv-rel" id="vv-rel"></div></div>
      </div>
      <pre class="vv-log" id="vv-log" aria-live="polite"></pre>
    </div>
    <div class="vv-real" id="vv-real"></div>`;
  const $ = s => el.querySelector(s);
  const log = $("#vv-log");
  let run = 0, version = 12, releases = [[12, "live", "2 days ago"], [11, "", "5 days ago"], [10, "", "last week"]], breakIdx = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const write = (cls, s) => { log.insertAdjacentHTML("beforeend", (cls ? `<span class="${cls}">` : "") + s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) + (cls ? "</span>" : "") + "\n"); log.scrollTop = log.scrollHeight; };
  const pill = (id, cls, t) => { const e = $(id); e.className = "vv-pill " + cls; e.textContent = t; };
  function steps(state = {}) {
    $("#vv-steps").innerHTML = STEPS.map(([k, t]) => `<div class="vv-step ${state[k]?.[0] || ""}"><i>${state[k]?.[0] === "done" ? "✓" : state[k]?.[0] === "fail" ? "!" : ""}</i>${t}<span>${state[k]?.[1] || ""}</span></div>`).join("");
  }
  function rel() {
    $("#vv-rel").innerHTML = releases.slice(0, 4).map(([v, s, when]) => `<div class="${s === "live" ? "live" : ""}"><b>v${v}</b><em>${when}</em><span class="vv-pill ${s === "live" ? "ok" : s === "failed" ? "bad" : ""}" ${s ? "" : 'style="border:0;padding:0"'}>${s === "live" ? "live" : s === "failed" ? "rolled back" : ""}</span></div>`).join("");
  }
  write("d", "# shop-api is a demo app. Pick a deploy above.");
  write("d", "# Venvy pulls, builds, restarts, then checks /health. If the new release isn't healthy, it puts the old one back.");
  steps(); rel();

  async function deploy(broken) {
    const me = ++run, alive = () => me === run && document.body.contains(el);
    const br = broken ? BREAKS[breakIdx++ % BREAKS.length] : null;
    const next = version + 1, st = {};
    $("#vv-good").disabled = $("#vv-bad").disabled = true;
    log.textContent = "";
    pill("#vv-state", "busy", `deploying v${next}`); pill("#vv-health", "busy", "checking");
    write("p", `$ venvy deploy shop-api   # v${version} → v${next}`);
    for (const [k, label] of STEPS) {
      st[k] = ["run", ""]; steps(st);
      const t0 = performance.now();
      if (k === "pull") { await sleep(500); write("", `HEAD is now at ${Math.random().toString(16).slice(2, 9)} ${broken ? "add payments" : "faster product search"}`); }
      if (k === "install") { await sleep(800); write("", broken && br.at === "restart" ? "Requirement already satisfied: flask, gunicorn" : "Requirement already satisfied: flask, gunicorn, sqlalchemy"); }
      if (k === "build") { await sleep(500); write("", "nothing to build (python)"); }
      if (k === "restart") {
        await sleep(600); write("", `stopping v${version} … started v${next} as user shop-api (pid ${2000 + Math.floor(Math.random() * 7000)})`);
        if (br && br.at === "restart") { for (const l of br.log) { await sleep(120); write("bad", l); } }
      }
      if (k === "health") {
        if (br && br.at === "health") for (const l of br.log.slice(0, 1)) write("", l);
        for (let i = 1; i <= 3; i++) {
          if (!alive()) return;
          await sleep(650);
          if (!br) { write("ok", `GET /health → 200 OK (${18 + Math.floor(Math.random() * 20)} ms)`); break; }
          write("w", `attempt ${i}/3: ${br.at === "restart" ? "connection refused" : br.log[1]}`);
          if (br.at === "health" && br.log[2] && i === 1) write("bad", br.log[2]);
        }
      }
      if (!alive()) return;
      const ms = Math.round(performance.now() - t0);
      const failed = br && (k === "health" || (k === "restart" && br.at === "restart"));
      st[k] = [failed ? "fail" : "done", (ms / 1000).toFixed(1) + " s"]; steps(st);
      if (failed) break;
    }
    if (!br) {
      version = next; releases.forEach(r => r[1] === "live" && (r[1] = "")); releases.unshift([next, "live", "just now"]);
      pill("#vv-state", "ok", `running v${version}`); pill("#vv-health", "ok", "healthy");
      write("ok", `✓ v${next} is live. v${next - 1} stays one click away.`);
    } else {
      pill("#vv-state", "warn", "rolling back"); pill("#vv-health", "bad", "unhealthy");
      write("bad", `✗ v${next} is not healthy: ${br.why}`);
      await sleep(500); if (!alive()) return;
      write("p", `↺ rolling back to v${version}`);
      await sleep(900); if (!alive()) return;
      write("", `started v${version} as user shop-api`);
      await sleep(500);
      write("ok", "GET /health → 200 OK (21 ms)");
      releases.unshift([next, "failed", "just now"]);
      pill("#vv-state", "ok", `running v${version}`); pill("#vv-health", "ok", "healthy");
      write("ok", `✓ back on v${version}. Nobody had to wake up; Venvy sends a notification (Discord, ntfy, email…).`);
      if (breakIdx < BREAKS.length) write("d", "# deploy another broken one, it breaks a different way.");
    }
    rel();
    $("#vv-good").disabled = $("#vv-bad").disabled = false;
  }
  $("#vv-good").onclick = () => deploy(false);
  $("#vv-bad").onclick = () => deploy(true);
  onLeave(() => run++);

  const real = () => {
    const h = host(), e = $("#vv-real"); if (!e) return;
    const up = s => { const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${hh}h` : hh ? `${hh}h ${m}m` : `${m}m`; };
    e.innerHTML = h ? `<span>For real: this page is the Venvy app <b>homepage</b></span><span>runtime <b>python</b></span><span>this process up <b>${up(h.app_uptime_s)}</b></span><span>machine up <b>${h.uptime_s ? up(h.uptime_s) : "?"}</b></span>`
      : `<span>For real: this page is served by a Venvy app called <b>homepage</b>.</span>`;
  };
  real(); const t = setInterval(real, 5000); onLeave(() => clearInterval(t));
}
