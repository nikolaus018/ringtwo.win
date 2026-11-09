"""ringtwo.win: static site + a few live endpoints. Standard library only.

    PORT=8001 python3 server.py

GET /api/host     live stats of the machine this runs on (the mini PC at home)
GET /api/github   repo data for every project, cached server-side (ETag'd, refreshed in the background)
GET /api/commits  commit history per day per project (refreshed every 6 h)
Everything else is served from site/.
"""
import datetime as dt
import email.utils
import gzip
import json
import mimetypes
import os
import platform
import threading
import time
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
PORT = int(os.getenv("PORT", "8001"))
TZ = ZoneInfo("Europe/Vienna")
STARTED = time.time()
# Build version: stamped into index.html as {{v}} so style.css, app.js and the demos are fetched fresh after every deploy
# (Cloudflare tells browsers to cache .css/.js for 4 hours, whatever this server says).
VERSION = format(int(max(p.stat().st_mtime for p in SITE.rglob("*") if p.is_file())), "x")

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("audio/mp4", ".m4a")


def projects():
    return json.loads((SITE / "projects.json").read_text())


# ── live host stats ───────────────────────────────────────────────────────────

class Host:
    """Samples CPU, memory, network and temperature every 2 s and keeps 2 minutes of history."""

    def __init__(self):
        self.lock = threading.Lock()
        self.hist = []          # [(t, cpu%, mem%, net_bytes_per_s)]
        self.served_day = None
        self.served = 0
        self._cpu = None
        self._net = None
        threading.Thread(target=self.loop, daemon=True).start()

    @staticmethod
    def _read(path):
        try:
            return Path(path).read_text()
        except OSError:
            return None

    def cpu(self):
        s = self._read("/proc/stat")
        if not s:
            return None
        v = [int(x) for x in s.split("\n", 1)[0].split()[1:]]
        idle, total = v[3] + v[4], sum(v)
        prev, self._cpu = self._cpu, (idle, total)
        if not prev or total == prev[1]:
            return None
        return round(100 * (1 - (idle - prev[0]) / (total - prev[1])), 1)

    def net(self):
        s = self._read("/proc/net/dev")
        if not s:
            return None
        b = 0
        for line in s.splitlines()[2:]:
            name, rest = line.split(":", 1)
            if name.strip() == "lo":
                continue
            f = rest.split()
            b += int(f[0]) + int(f[8])
        now = time.time()
        prev, self._net = self._net, (now, b)
        if not prev:
            return None
        return int((b - prev[1]) / max(.001, now - prev[0]))

    def mem(self):
        s = self._read("/proc/meminfo")
        if not s:
            return None, None
        kv = {l.split(":")[0]: int(l.split()[1]) for l in s.splitlines() if ":" in l}
        total, avail = kv.get("MemTotal"), kv.get("MemAvailable")
        if not total or avail is None:
            return None, None
        return total * 1024, round(100 * (1 - avail / total), 1)

    def temp(self):
        best = None
        for z in Path("/sys/class/thermal").glob("thermal_zone*"):
            t = self._read(z / "temp")
            kind = (self._read(z / "type") or "").strip()
            if t and t.strip().lstrip("-").isdigit():
                c = int(t) / 1000
                if 0 < c < 120 and (best is None or kind.startswith(("x86_pkg", "cpu", "soc", "coretemp", "k10temp")) or c > best):
                    best = round(c, 1)
        return best

    def loop(self):
        while True:
            c, n = self.cpu(), self.net()
            _, m = self.mem()
            with self.lock:
                self.hist.append((round(time.time()), c, m, n))
                self.hist = self.hist[-60:]
            time.sleep(2)

    def hit(self):
        today = dt.datetime.now(TZ).date().isoformat()
        with self.lock:
            if today != self.served_day:
                self.served_day, self.served = today, 0
            self.served += 1

    def snapshot(self):
        up = self._read("/proc/uptime")
        total, _ = self.mem()
        osr = self._read("/etc/os-release") or ""
        pretty = next((l.split("=", 1)[1].strip('"') for l in osr.splitlines() if l.startswith("PRETTY_NAME=")), platform.system())
        try:
            load = [round(x, 2) for x in os.getloadavg()]
        except OSError:
            load = None
        with self.lock:
            hist = list(self.hist)
            served = self.served
        return {
            "os": pretty, "kernel": platform.release(), "arch": platform.machine(),
            "cpus": os.cpu_count(), "mem_total": total, "load": load, "temp_c": self.temp(),
            "uptime_s": int(float(up.split()[0])) if up else None,
            "app_uptime_s": int(time.time() - STARTED),
            "pages_today": served,
            "history": [{"t": t, "cpu": c, "mem": m, "net": n} for t, c, m, n in hist],
            "now": int(time.time()),
        }


# ── GitHub cache ──────────────────────────────────────────────────────────────

class GitHub:
    API = "https://api.github.com/"

    def __init__(self):
        self.lock = threading.Lock()
        self.file = DATA / "github.json"
        try:
            self.cache = json.loads(self.file.read_text())
        except (OSError, ValueError):
            self.cache = {"etag": {}, "body": {}, "repos": {}, "commits": None, "commits_at": 0, "repos_at": 0}
        self.blocked_until = 0
        threading.Thread(target=self.loop, daemon=True).start()

    def get(self, path):
        """GET with ETag: a 304 doesn't count against the 60/h unauthenticated limit."""
        req = urllib.request.Request(self.API + path, headers={
            "Accept": "application/vnd.github+json", "User-Agent": "ringtwo-win-homepage"})
        if path in self.cache["etag"]:
            req.add_header("If-None-Match", self.cache["etag"][path])
        if time.time() < self.blocked_until:
            raise RuntimeError("waiting for the GitHub rate limit to reset")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                body = json.loads(r.read())
                links = r.headers.get("Link", "")
                if r.headers.get("ETag"):
                    self.cache["etag"][path] = r.headers["ETag"]
                    self.cache["body"][path] = [body, links]
                return body, links
        except urllib.error.HTTPError as e:
            if e.code == 304 and path in self.cache["body"]:
                return tuple(self.cache["body"][path])
            if e.code in (403, 429) and e.headers.get("X-RateLimit-Remaining") == "0":
                self.blocked_until = float(e.headers.get("X-RateLimit-Reset") or time.time() + 3600) + 5
            raise

    def refresh_repos(self):
        p = projects()
        owner = p["owner"]
        repos, _ = self.get(f"users/{owner}/repos?per_page=100&sort=pushed")
        by = {r["name"]: r for r in repos}
        out = {}
        for pr in p["projects"]:
            r = by.get(pr["repo"])
            if not r:
                continue
            item = {"pushed_at": r["pushed_at"], "stars": r["stargazers_count"], "forks": r["forks_count"],
                    "language": r["language"], "license": (r.get("license") or {}).get("spdx_id"),
                    "size_kb": r["size"], "url": r["html_url"]}
            try:
                c, _ = self.get(f"repos/{owner}/{pr['repo']}/commits?per_page=1")
                if c:
                    item["last_commit"] = {"msg": c[0]["commit"]["message"].split("\n")[0][:140], "sha": c[0]["sha"][:7],
                                           "date": c[0]["commit"]["author"]["date"], "url": c[0]["html_url"]}
            except Exception:
                pass
            out[pr["repo"]] = item
        try:
            rel, links = self.get(f"repos/{owner}/venvy/releases?per_page=100")
            if rel:
                out.setdefault("venvy", {})["releases"] = {"count": len(rel), "latest": rel[0]["tag_name"],
                                                           "date": rel[0]["published_at"]}
        except Exception:
            pass
        with self.lock:
            self.cache["repos"], self.cache["repos_at"] = out, time.time()

    def refresh_commits(self):
        p = projects()
        days, hours, totals = {}, [0] * 24, {}
        for pr in p["projects"]:
            page = 1
            while page < 30:
                body, links = self.get(f"repos/{p['owner']}/{pr['repo']}/commits?per_page=100&page={page}")
                for c in body:
                    t = dt.datetime.fromisoformat(c["commit"]["author"]["date"].replace("Z", "+00:00")).astimezone(TZ)
                    d = days.setdefault(t.date().isoformat(), {})
                    d[pr["repo"]] = d.get(pr["repo"], 0) + 1
                    hours[t.hour] += 1
                    totals[pr["repo"]] = totals.get(pr["repo"], 0) + 1
                if 'rel="next"' not in links:
                    break
                page += 1
        data = {"days": dict(sorted(days.items())), "hours": hours, "totals": totals}
        with self.lock:
            self.cache["commits"], self.cache["commits_at"] = data, time.time()

    def save(self):
        with self.lock:
            tmp = self.file.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.cache))
            tmp.replace(self.file)

    def loop(self):
        while True:
            try:
                if time.time() - self.cache.get("repos_at", 0) > 900:
                    self.refresh_repos()
                    self.save()
                if time.time() - self.cache.get("commits_at", 0) > 6 * 3600:
                    self.refresh_commits()
                    self.save()
            except Exception as e:  # rate limit, network: try again later
                print("github refresh failed:", e, flush=True)
            time.sleep(max(60, self.blocked_until - time.time()))

    def repos(self):
        with self.lock:
            return {"repos": self.cache.get("repos", {}), "at": int(self.cache.get("repos_at", 0))}

    def commits(self):
        with self.lock:
            c = self.cache.get("commits")
        if c:
            return c
        return json.loads((SITE / "commits.json").read_text())   # shipped fallback


HOST = Host()
GH = GitHub()


# ── HTTP ──────────────────────────────────────────────────────────────────────

LONG_CACHE = {".webp", ".png", ".jpg", ".m4a", ".woff2", ".svg"}
COMPRESS = {".html", ".css", ".js", ".json", ".svg"}


class Handler(BaseHTTPRequestHandler):
    server_version = "ringtwo"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass

    def send_json(self, obj, max_age=0):
        raw = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", f"public, max-age={max_age}" if max_age else "no-store")
        self.common_headers()
        self.body(raw, compressible=True)

    def common_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")

    def body(self, raw, compressible=False):
        if compressible and len(raw) > 1024 and "gzip" in self.headers.get("Accept-Encoding", ""):
            raw = gzip.compress(raw, 6)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path == "/api/host":
            return self.send_json(HOST.snapshot())
        if path == "/api/github":
            return self.send_json(GH.repos(), max_age=60)
        if path == "/api/commits":
            return self.send_json(GH.commits(), max_age=600)
        if path == "/healthz":
            return self.send_json({"ok": True})
        self.static(path)

    def static(self, path):
        rel = urllib.request.url2pathname(path).lstrip("/") or "index.html"
        f = (SITE / rel).resolve()
        if f.is_dir():
            f = f / "index.html"
        if SITE not in f.parents and f != SITE or not f.is_file():
            self.send_response(404)
            self.send_header("Content-Type", "text/plain")
            self.common_headers()
            return self.body(b"not found")
        if f.name == "index.html":
            HOST.hit()
        st = f.stat()
        etag = f'"{st.st_mtime_ns:x}-{st.st_size:x}-{VERSION}"'
        ext = f.suffix.lower()
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ext in (".json", ".js"):
            ctype += "; charset=utf-8"
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.common_headers()
            self.end_headers()
            return
        data = f.read_bytes()
        if f.name == "index.html":
            data = data.replace(b"{{v}}", VERSION.encode())
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes=") and ext == ".m4a":
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else max(0, len(data) - int(b))
            end = min(len(data) - 1, int(b)) if a and b else len(data) - 1
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
            data = data[start:end + 1]
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", email.utils.formatdate(st.st_mtime, usegmt=True))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "public, max-age=604800" if ext in LONG_CACHE else "no-cache")
        self.common_headers()
        self.body(data, compressible=ext in COMPRESS)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    srv.daemon_threads = True
    print(f"ringtwo.win on :{PORT}", flush=True)
    srv.serve_forever()
