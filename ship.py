"""Deploy ringtwo.win to the Venvy app "homepage" (python: server.py serves site/ and /api/*).

    python3 ship.py           upload server.py + site/ and restart
    python3 ship.py login     sign in once (password is prompted, never stored)

Uses the Venvy session in ~/.config/venvy/ (shared with the other projects' ship.py).
Standard library only. Note: uploads never delete files that were removed from site/.
"""
import getpass
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SHIP = ["server.py", "requirements.txt"]   # plus everything under site/
BASE = os.getenv("VENVY_URL", "https://venvy.ringtwo.win").rstrip("/")
APP_NAME = os.getenv("VENVY_APP", "homepage")
SESSION_FILE = Path.home() / ".config" / "venvy" / (urllib.parse.urlparse(BASE).netloc.replace(":", "_") + ".json")
UPLOAD_BATCH = 15


class ApiError(Exception):
    def __init__(self, status, detail):
        super().__init__(f"HTTP {status}: {detail}")
        self.status, self.detail = status, detail


class Venvy:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.auth_key = None

    def cookie(self, name):
        return next((c.value for c in self.jar if c.name == name), None)

    def set_cookie(self, name, value):
        host = urllib.parse.urlparse(BASE).hostname
        self.jar.set_cookie(http.cookiejar.Cookie(0, name, value, None, False, host, False, False, "/", True,
                                                  BASE.startswith("https"), None, False, None, None, {}))

    def save(self):
        SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        SESSION_FILE.touch(mode=0o600, exist_ok=True)
        SESSION_FILE.chmod(0o600)
        SESSION_FILE.write_text(json.dumps({"session": self.cookie("session"), "auth_key": self.auth_key}))

    def load(self):
        try:
            data = json.loads(SESSION_FILE.read_text())
        except (OSError, ValueError):
            return False
        if not data.get("session") or not data.get("auth_key"):
            return False
        self.set_cookie("session", data["session"])
        self.auth_key = data["auth_key"]
        return True

    def call(self, method, path, body=None, form=None, files=None):
        headers = {"Accept": "application/json", "User-Agent": "ringtwo-site-ship"}
        data = None
        if form is not None or files is not None:
            boundary = uuid.uuid4().hex
            parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
                     for k, v in (form or {}).items()]
            for field, filename, content in files or []:
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
                             f"Content-Type: application/octet-stream\r\n\r\n".encode() + content + b"\r\n")
            data = b"".join(parts) + f"--{boundary}--\r\n".encode()
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if self.auth_key:
            headers["X-Venvy-Key"] = self.auth_key
        if method != "GET":
            if not self.cookie("csrf_token"):
                self.call("GET", "/api/health")
            headers["X-CSRF-Token"] = self.cookie("csrf_token") or ""
        req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
        try:
            with self.http.open(req, timeout=120) as res:
                raw = res.read()
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                detail = json.loads(raw).get("detail")
            except (ValueError, AttributeError):
                detail = raw[:300].decode("utf-8", "replace")
            raise ApiError(e.status, detail) from None
        return json.loads(raw) if raw else None


def login():
    v = Venvy()
    body = {"username": input("User: ").strip(), "password": getpass.getpass("Password: ")}
    try:
        res = v.call("POST", "/api/auth/login", body)
    except ApiError as e:
        if e.status != 403 or e.detail != "totp_required":
            sys.exit(f"✗ Login failed ({e})")
        res = v.call("POST", "/api/auth/login", {**body, "totp_code": input("2FA code: ").strip()})
    v.auth_key = res["auth_key"]
    v.save()
    print(f"✓ Signed in as {res['username']}.")


def find_app(v):
    return next((a for a in v.call("GET", "/api/apps") if a["name"] == APP_NAME or a["slug"] == APP_NAME), None)


def deploy():
    v = Venvy()
    if not v.load() or not v.call("GET", "/api/auth/status").get("authenticated"):
        sys.exit("✗ Not signed in to Venvy. Run once:  python3 ship.py login")
    v.save()
    app = find_app(v)
    if not app:
        sys.exit(f"✗ No Venvy app named {APP_NAME!r}.")
    files = SHIP + sorted(str(p.relative_to(ROOT)) for p in (ROOT / "site").rglob("*") if p.is_file() and not p.name.startswith("."))
    if app["runtime"] != "python" or app.get("entrypoint") != "server.py":
        sys.exit("✗ The app isn't set up as python/server.py yet. Run once:  python3 ship.py setup")
    print(f"• Uploading {len(files)} files to {APP_NAME} (#{app['id']}) …")
    for i in range(0, len(files), UPLOAD_BATCH):
        batch = [("files", f, (ROOT / f).read_bytes()) for f in files[i:i + UPLOAD_BATCH]]
        res = v.call("POST", f"/api/apps/{app['id']}/files/upload", form={"path": ""}, files=batch)
        if res and res.get("skipped"):
            sys.exit(f"✗ Skipped: {res['skipped']}")
    v.call("POST", f"/api/apps/{app['id']}/control?action=restart")
    for _ in range(30):
        time.sleep(2)
        app = find_app(v)
        if app["status"] == "running":
            print("✓ Running: https://ringtwo.win")
            return
    sys.exit(f"✗ App status: {app['status']}")


def setup():
    """One-time switch of the app from Venvy's static runtime to python + server.py, same port (the tunnel stays)."""
    v = Venvy()
    if not v.load() or not v.call("GET", "/api/auth/status").get("authenticated"):
        sys.exit("✗ Not signed in to Venvy. Run once:  python3 ship.py login")
    app = find_app(v)
    port = app.get("port") or 8001
    if app["status"] in ("running", "starting"):
        v.call("POST", f"/api/apps/{app['id']}/control?action=stop")
        for _ in range(30):
            time.sleep(1)
            if find_app(v)["status"] == "stopped":
                break
    env = json.loads(app.get("env_json") or "{}")
    v.call("PUT", f"/api/apps/{app['id']}", {"runtime": "python", "entrypoint": "server.py", "port": port,
                                              "manual_ports": [port], "env_vars": {**env, "PORT": str(port)},
                                              "restart_policy": "on-failure", "start_on_boot": True,
                                              "healthcheck_path": "/healthz"})
    files = [("files", f, (ROOT / f).read_bytes()) for f in SHIP]
    v.call("POST", f"/api/apps/{app['id']}/files/upload", form={"path": ""}, files=files)
    res = v.call("POST", f"/api/apps/{app['id']}/venv/rebuild", {"version": ""})
    end = time.time() + 600
    while time.time() < end:
        j = v.call("GET", f"/api/jobs/{res['job_id']}")
        if j["status"] == "done":
            break
        if j["status"] == "error":
            sys.exit(f"✗ venv: {j.get('error')}")
        time.sleep(2)
    print(f"✓ {APP_NAME} is now python/server.py on port {port}. Next:  python3 ship.py")


if __name__ == "__main__":
    try:
        {"login": login, "setup": setup}.get(sys.argv[1] if sys.argv[1:] else "", deploy)()
    except ApiError as e:
        sys.exit("✗ Venvy session expired. Run:  python3 ship.py login" if e.status == 401 else f"✗ Venvy: {e}")
