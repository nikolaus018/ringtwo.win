// "Patch a remote": the dongle's flow, simulated. The stock USB host stack refuses the remote's 512-byte packets.
const CSS = `
.dj { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
.dj-scene { padding: 14px 16px; display: grid; gap: 12px; align-content: start; border-right: 1px solid var(--line); }
.dj-scene svg { width: 100%; height: auto; display: block; }
.dj-ctrl { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dj-log { margin: 0; background: #09090b; padding: 14px 16px; font: 12px/1.75 var(--mono); color: var(--muted); min-height: 280px; max-height: 360px; overflow-y: auto; white-space: pre-wrap; }
.dj-log .I { color: #7fd6a0; } .dj-log .W { color: var(--warn); } .dj-log .E { color: var(--bad); } .dj-log .d { color: var(--dim); }
.dj-why { margin: 0; font-size: 13.5px; color: var(--muted); }
.dj-why b { color: var(--text); }
@media (max-width: 760px) { .dj { grid-template-columns: 1fr; } .dj-scene { border-right: 0; border-bottom: 1px solid var(--line); } .dj-log { min-height: 200px; } }
`;
const LED = { off: "#26262c", blue: "#3d82f6", yellow: "#e3b341", green: "#3ccf7e", red: "#e5533d" };

export default function (el, { p, onLeave }) {
  if (!document.getElementById("css-dj")) document.head.insertAdjacentHTML("beforeend", `<style id="css-dj">${CSS}</style>`);
  el.innerHTML = `<div class="dj">
    <div class="dj-scene">
      <svg viewBox="0 0 420 190" role="img" aria-label="A drone remote and the dongle">
        <rect x="20" y="40" width="230" height="110" rx="44" fill="#1f1f24" stroke="#4a4a52"/>
        <rect x="96" y="28" width="78" height="16" rx="5" fill="#1a1a1e" stroke="#4a4a52"/>
        <text x="135" y="22" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="#66666f">phone goes here, later</text>
        <circle cx="76" cy="95" r="25" fill="#17171a" stroke="#4a4a52"/><circle cx="76" cy="95" r="8" fill="#2a2a30"/>
        <circle cx="194" cy="95" r="25" fill="#17171a" stroke="#4a4a52"/><circle cx="194" cy="95" r="8" fill="#2a2a30"/>
        <rect x="246" y="88" width="10" height="14" rx="2" fill="#09090b" stroke="#4a4a52"/>
        <text x="135" y="176" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="#66666f">DJI N1 remote · bottom USB port</text>
        <g id="dj-dongle" transform="translate(80 0)">
          <rect x="254" y="91" width="26" height="8" rx="2" fill="#5a5a62"/>
          <rect x="278" y="68" width="112" height="54" rx="10" fill="#1b3628" stroke="#2c5a41"/>
          <rect x="292" y="82" width="30" height="26" rx="3" fill="#0e0e10"/><text x="307" y="99" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7" fill="#66666f">S3</text>
          <circle id="dj-led" cx="362" cy="95" r="8" fill="${LED.off}"/>
          <circle id="dj-glow" cx="362" cy="95" r="16" fill="${LED.off}" opacity="0"/>
          <text x="334" y="136" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="#66666f">dongle · ESP32-S3</text>
        </g>
      </svg>
      <div class="dj-ctrl">
        <div class="seg-ctl" role="group" aria-label="USB host stack"><button type="button" data-s="stock" aria-pressed="false">Espressif's stack</button><button type="button" data-s="patched" aria-pressed="true">My patched copy</button></div>
        <button class="btn sm tint" id="dj-plug" type="button">Plug in</button>
        <button class="btn sm" id="dj-cycle" type="button" disabled>Power-cycle remote</button>
      </div>
      <p class="dj-why" id="dj-why">Full-speed USB allows bulk packets of <b>64 bytes</b>. The remote announces <b>512</b>.</p>
    </div>
    <pre class="dj-log" id="dj-log" aria-live="polite"></pre></div>`;
  const $ = s => el.querySelector(s);
  const log = $("#dj-log");
  let stack = "patched", plugged = false, run = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t0 = performance.now();
  const say = (lvl, tag, msg) => { const ms = Math.round(performance.now() - t0); log.insertAdjacentHTML("beforeend", `<span class="${lvl}">${lvl}</span> <span class="d">(${String(ms).padStart(6)})</span> ${tag}: ${msg}\n`); log.scrollTop = log.scrollHeight; };
  const led = c => { $("#dj-led").setAttribute("fill", LED[c]); const g = $("#dj-glow"); g.setAttribute("fill", LED[c]); g.setAttribute("opacity", c === "off" ? 0 : .25); };
  log.innerHTML = `<span class="d"># a simulation of the dongle's flow. Pick a stack, then plug in.</span>\n`;

  async function plug() {
    const me = ++run, alive = () => me === run && document.body.contains(el);
    if (plugged) { // unplug
      plugged = false; $("#dj-plug").textContent = "Plug in"; $("#dj-dongle").setAttribute("transform", "translate(80 0)"); led("off"); $("#dj-cycle").disabled = true;
      say("I", "power", "unplugged"); return;
    }
    plugged = true; $("#dj-plug").textContent = "Unplug"; $("#dj-plug").disabled = true;
    for (let x = 80; x >= 0; x -= 8) { $("#dj-dongle").setAttribute("transform", `translate(${x} 0)`); await sleep(16); }
    if (!alive()) return;
    say("I", "boot", `powered from the remote's port, USB host stack: ${stack === "stock" ? "esp-idf (stock)" : "components/espressif__usb (patched)"}`);
    led("blue"); await sleep(600); if (!alive()) return;
    say("I", "usb", "device attached, full-speed");
    await sleep(400); say("I", "usb", "3 interfaces: 0 and 1 are DJI's own, 2 is CDC-ACM serial");
    await sleep(400); say("W", "usb", "interface 2 bulk endpoints say wMaxPacketSize = <b>512</b>");
    await sleep(500); if (!alive()) return;
    if (stack === "stock") {
      say("E", "hcd", "512 is above the full-speed bulk limit of 64: endpoint not opened");
      say("E", "dji", "can't open the serial port, giving up");
      led("red");
      $("#dj-why").innerHTML = "Espressif's stack is <b>right by the spec</b>, and the remote breaks the spec. Switch to the patched copy and plug in again.";
    } else {
      say("I", "hcd", "max-packet check relaxed for this device (patched)");
      say("I", "hcd", "non-periodic TX FIFO sized for 512-byte packets");
      await sleep(500); if (!alive()) return;
      led("yellow"); say("I", "dji", "sending packet 1 of 2"); await sleep(700); if (!alive()) return;
      say("I", "dji", "sending packet 2 of 2"); await sleep(700); if (!alive()) return;
      led("green"); say("I", "dji", "sent. Unplug me and connect the phone to the top port.");
      $("#dj-why").innerHTML = "<b>Green.</b> That's the whole job. It has to happen every time the drone and remote power up, which is why a phone app got old fast.";
      $("#dj-cycle").disabled = false;
    }
    $("#dj-plug").disabled = false;
  }
  $("#dj-plug").onclick = plug;
  $("#dj-cycle").onclick = () => { say("W", "remote", "power-cycled: back to CE. Plug the dongle in again."); led("off"); $("#dj-cycle").disabled = true; plugged = true; plug(); };
  el.querySelectorAll("[data-s]").forEach(b => b.onclick = () => {
    stack = b.dataset.s; el.querySelectorAll("[data-s]").forEach(x => x.setAttribute("aria-pressed", x === b));
    if (plugged) { plugged = true; plug(); }
    $("#dj-why").innerHTML = stack === "stock" ? "Espressif's stack, as shipped. Plug in and see what it makes of 512-byte packets." : "Full-speed USB allows bulk packets of <b>64 bytes</b>. The remote announces <b>512</b>.";
  });
  onLeave(() => run++);
}
