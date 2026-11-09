"""Fetch commit dates of the public repos and write:
  site/commits.json          (used by ringtwo.win)
  <out>/activity-dark.svg    (GitHub profile README, dark theme)
  <out>/activity-light.svg   (GitHub profile README, light theme)

    python3 tools/activity_svg.py <profile-repo-dir>
Needs the gh CLI. Standard library only.
"""
import collections
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

OWNER = "nikolaus018"
REPOS = [  # (repo, label, colour)
    ("venvy", "Venvy", "#3d82f6"),
    ("passable", "Passable", "#f0894a"),
    ("leeway", "Leeway", "#22b8cf"),
    ("ear-router", "EAR Router", "#3ccf7e"),
    ("garageDoor-pro", "garageDoor-pro", "#e5533d"),
    ("dji-fcc-esp32", "dji-fcc-esp32", "#e3b341"),
    ("ahm", "ahm", "#a1a1aa"),
]
TZ = ZoneInfo("Europe/Vienna")
SITE = Path(__file__).resolve().parent.parent / "site"

THEMES = {
    "dark": dict(bg="#0d1117", line="#30363d", lane="#161b22", text="#e6edf3", muted="#7d8590"),
    "light": dict(bg="#ffffff", line="#d0d7de", lane="#f6f8fa", text="#1f2328", muted="#656d76"),
}


def fetch():
    days = collections.defaultdict(collections.Counter)
    hours = collections.Counter()
    totals = collections.Counter()
    for repo, *_ in REPOS:
        out = subprocess.check_output(
            ["gh", "api", "--paginate", f"repos/{OWNER}/{repo}/commits?per_page=100", "--jq", ".[].commit.author.date"],
            text=True)
        for line in out.split():
            t = dt.datetime.fromisoformat(line.replace("Z", "+00:00")).astimezone(TZ)
            days[t.date().isoformat()][repo] += 1
            hours[t.hour] += 1
            totals[repo] += 1
    return {"days": {d: dict(c) for d, c in sorted(days.items())},
            "hours": [hours[h] for h in range(24)], "totals": dict(totals)}


def svg(data, theme):
    c = THEMES[theme]
    days = data["days"]
    first = dt.date.fromisoformat(min(days))
    last = dt.date.fromisoformat(max(days))
    n = (last - first).days + 1
    order = sorted(REPOS, key=lambda r: -data["totals"].get(r[0], 0))
    W, PAD, L, RH, RG = 880, 24, 128, 14, 7
    top = 74
    cw = (W - PAD * 2 - L) / n
    H = top + len(order) * (RH + RG) + 18
    total = sum(data["totals"].values())
    font = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{font}">',
         f'<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="10" fill="{c["bg"]}" stroke="{c["line"]}"/>',
         f'<text x="{PAD}" y="34" font-size="15" font-weight="600" fill="{c["text"]}">{total} commits since {first:%B}</text>',
         f'<text x="{W-PAD}" y="34" font-size="12" fill="{c["muted"]}" text-anchor="end">'
         f'{first.day} {first:%b} – {last.day} {last:%b %Y} · {len(days)} active days · public repos</text>']
    x0 = PAD + L
    for i in range(n):
        d = first + dt.timedelta(days=i)
        if d.day == 1 or i == 0:
            o.append(f'<text x="{x0 + i*cw:.1f}" y="{top-10}" font-size="11" fill="{c["muted"]}">{d:%b}</text>')
            if i:
                o.append(f'<line x1="{x0 + i*cw - .5:.1f}" x2="{x0 + i*cw - .5:.1f}" y1="{top-6}" y2="{H-14}" stroke="{c["line"]}"/>')
    for row, (repo, label, col) in enumerate(order):
        y = top + row * (RH + RG)
        o.append(f'<text x="{PAD}" y="{y+11}" font-size="12" fill="{col}">{label}</text>')
        o.append(f'<text x="{x0-10}" y="{y+11}" font-size="11" fill="{c["muted"]}" text-anchor="end">{data["totals"].get(repo, 0)}</text>')
        o.append(f'<rect x="{x0}" y="{y}" width="{W-PAD-x0}" height="{RH}" rx="3" fill="{c["lane"]}"/>')
        for i in range(n):
            k = (first + dt.timedelta(days=i)).isoformat()
            v = days.get(k, {}).get(repo)
            if v:
                op = min(1, .3 + v ** .5 / 5)
                o.append(f'<rect x="{x0 + i*cw:.2f}" y="{y}" width="{max(1, cw-1.2):.2f}" height="{RH}" rx="1.5" fill="{col}" fill-opacity="{op:.2f}"/>')
    o.append("</svg>")
    return "\n".join(o)


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    data = fetch()
    (SITE / "commits.json").write_text(json.dumps(data, separators=(",", ":")))
    if out:
        for theme in THEMES:
            (out / f"activity-{theme}.svg").write_text(svg(data, theme))
    print(sum(data["totals"].values()), "commits")
