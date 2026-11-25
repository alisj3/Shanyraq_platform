"""Local Shanyraq preview. Python standard library only. Binds to loopback."""

import argparse
import hashlib
import hmac
import json
from pathlib import Path
import re
import secrets
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = ROOT / ".local"
EVENTS = {"visit", "started", "completed", "task_done", "downloaded", "feedback", "outcome"}
PURPOSES = {"self", "family", "consultant", "explore"}
GROUPS = {"disability", "child_disability", "large_family", "single_parent", "orphan", "other", "unsure"}
OUTCOMES = {"understood", "documents", "applied", "answer", "housing", "unresolved"}
IDENTIFIER = re.compile(r"^[a-f0-9-]{20,64}$")


class Store:
    def __init__(self, directory=DATA):
        self.directory = Path(directory)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.db_path = self.directory / "navigator.sqlite3"
        key_path = self.directory / "admin-key"
        if not key_path.exists():
            key_path.write_text(secrets.token_urlsafe(32), encoding="utf-8")
            key_path.chmod(0o600)
        self.key = key_path.read_text(encoding="utf-8").strip()
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, day TEXT NOT NULL, visitor TEXT NOT NULL,
                session TEXT NOT NULL, kind TEXT NOT NULL, language TEXT NOT NULL,
                purpose TEXT NOT NULL, groups_json TEXT NOT NULL, value TEXT NOT NULL,
                route TEXT NOT NULL, task TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY, created TEXT NOT NULL, visitor TEXT NOT NULL,
                email TEXT NOT NULL, language TEXT NOT NULL, consent_version TEXT NOT NULL)""")
            db.execute("DELETE FROM events WHERE day < date('now', '-90 days')")
            db.execute("DELETE FROM contacts WHERE created < datetime('now', '-30 days')")
        self.db_path.chmod(0o600)

    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def visitor_hash(self, value):
        return hmac.new(self.key.encode(), value.encode(), hashlib.sha256).hexdigest()

    def add_event(self, payload):
        kind = payload.get("kind")
        visitor = payload.get("visitor", "")
        session = payload.get("session", "")
        event_id = payload.get("id", "")
        if payload.get("consent") is not True or kind not in EVENTS:
            raise ValueError("consent_or_event")
        if not all(isinstance(x, str) and IDENTIFIER.fullmatch(x) for x in [visitor, session, event_id]):
            raise ValueError("identifier")
        language = payload.get("language", "ru")
        purpose = payload.get("purpose", "explore")
        if language not in {"ru", "kk"} or purpose not in PURPOSES:
            raise ValueError("enum")
        # Accept no free text, income, region, medical details or questionnaire answers.
        groups = payload.get("groups", []) if payload.get("groupConsent") is True else []
        if not isinstance(groups, list) or len(groups) > 7 or any(x not in GROUPS for x in groups):
            raise ValueError("groups")
        if kind != "completed":
            groups = []
        value = payload.get("value", "")
        allowed_values = {"feedback": {"yes", "partly", "no"}, "outcome": OUTCOMES}
        if value not in allowed_values.get(kind, {""}):
            raise ValueError("value")
        route = str(payload.get("route", ""))
        task = str(payload.get("task", ""))
        if not re.fullmatch(r"[a-z0-9-]{0,64}", route) or not re.fullmatch(r"[a-z0-9-]{0,64}", task):
            raise ValueError("route_or_task")
        with self.connect() as db:
            # Reopening one route is not another person. Retain one completion and answer per session.
            if kind in {"completed", "feedback", "outcome"}:
                db.execute("DELETE FROM events WHERE visitor=? AND session=? AND kind=?", (self.visitor_hash(visitor), session, kind))
            db.execute("INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
                event_id, time.strftime("%Y-%m-%d", time.gmtime()), self.visitor_hash(visitor),
                session, kind, language, purpose, json.dumps(sorted(set(groups))), value, route, task,
            ))

    def add_contact(self, payload):
        email = payload.get("email", "")
        visitor = payload.get("visitor", "")
        if payload.get("consent") is not True or not isinstance(email, str):
            raise ValueError("contact_consent")
        if not re.fullmatch(r"[^\s@<>]{1,64}@[^\s@<>]{1,189}\.[^\s@<>]{2,20}", email) or len(email) > 254:
            raise ValueError("email")
        if not isinstance(visitor, str) or not IDENTIFIER.fullmatch(visitor):
            raise ValueError("identifier")
        language = payload.get("language", "ru")
        if language not in {"ru", "kk"}:
            raise ValueError("language")
        with self.connect() as db:
            db.execute("DELETE FROM contacts WHERE visitor=? AND email=?", (self.visitor_hash(visitor), email.strip()))
            db.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", (
                secrets.token_hex(16), time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
                self.visitor_hash(visitor), email.strip(), language, "local-2026-11-11",
            ))

    def forget(self, visitor):
        if not isinstance(visitor, str) or not IDENTIFIER.fullmatch(visitor):
            raise ValueError("identifier")
        with self.connect() as db:
            for table in ["events", "contacts"]:
                db.execute(f"DELETE FROM {table} WHERE visitor=?", (self.visitor_hash(visitor),))

    def forget_groups(self, visitor):
        if not isinstance(visitor, str) or not IDENTIFIER.fullmatch(visitor):
            raise ValueError("identifier")
        with self.connect() as db:
            db.execute("UPDATE events SET groups_json='[]' WHERE visitor=?", (self.visitor_hash(visitor),))

    def report(self):
        with self.connect() as db:
            kinds = dict(db.execute("SELECT kind, count(*) FROM events GROUP BY kind"))
            visitors = db.execute("SELECT count(DISTINCT visitor) FROM events").fetchone()[0]
            routes = db.execute("SELECT count(DISTINCT visitor || ':' || session) FROM events WHERE kind='completed'").fetchone()[0]
            purposes = dict(db.execute("SELECT purpose,count(DISTINCT visitor || ':' || session) FROM events WHERE kind='completed' GROUP BY purpose"))
            feedback = dict(db.execute("SELECT value,count(*) FROM events WHERE kind='feedback' GROUP BY value"))
            outcomes = dict(db.execute("SELECT value,count(DISTINCT visitor) FROM events WHERE kind='outcome' GROUP BY value"))
            languages = dict(db.execute("SELECT language,count(DISTINCT visitor || ':' || session) FROM events WHERE kind='completed' GROUP BY language"))
            days = [dict(row) for row in db.execute("SELECT day,count(*) AS events,count(DISTINCT visitor) AS visitors FROM events GROUP BY day ORDER BY day DESC LIMIT 30")]
            contacts = [dict(row) for row in db.execute("SELECT id,created,email,language,consent_version FROM contacts ORDER BY created DESC")]
            group_counts = {}
            group_sessions = {}
            for row in db.execute("SELECT visitor, session, groups_json FROM events WHERE kind='completed'"):
                session_key = (row["visitor"], row["session"])
                group_sessions.setdefault(session_key, set()).update(json.loads(row["groups_json"]))
            for groups in group_sessions.values():
                for group in groups:
                    group_counts[group] = group_counts.get(group, 0) + 1
        return {"visitors": visitors, "routes": routes, "events": kinds, "purposes": purposes,
                "feedback": feedback, "outcomes": outcomes, "languages": languages, "groups": group_counts,
                "days": days, "contacts": contacts, "local": True}


class Handler(SimpleHTTPRequestHandler):
    server_version = "ShanyraqLocal/1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, *_args):
        # IP addresses, headers and query parameters are deliberately not logged.
        pass

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        super().end_headers()

    def local_host(self):
        return self.headers.get("Host", "") in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}

    def json_response(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.local_host():
            return self.json_response(403, {"error": "local_only"})
        path = urlsplit(self.path).path
        if path == "/api/health":
            return self.json_response(200, {"ok": True, "local": True})
        if path == "/api/admin/report":
            token = self.headers.get("Authorization", "").removeprefix("Bearer ")
            if not hmac.compare_digest(token, self.server.store.key):
                return self.json_response(401, {"error": "admin_key"})
            return self.json_response(200, self.server.store.report())
        if path.startswith("/api/"):
            return self.json_response(404, {"error": "not_found"})
        if path == "/admin":
            self.path = "/admin.html"
        resolved = Path(self.translate_path(self.path)).resolve()
        if not resolved.is_relative_to(PUBLIC) or resolved.is_dir() and path != "/":
            return self.json_response(404, {"error": "not_found"})
        super().do_GET()

    def do_POST(self):
        origin = self.headers.get("Origin")
        allowed = {f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}"}
        if not self.local_host() or origin not in allowed or self.headers.get("Content-Type") != "application/json":
            return self.json_response(403, {"error": "origin"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                return self.json_response(413, {"error": "size"})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("body")
            path = urlsplit(self.path).path
            if path == "/api/events":
                self.server.store.add_event(data)
            elif path == "/api/contact":
                self.server.store.add_contact(data)
            elif path == "/api/forget":
                self.server.store.forget(data.get("visitor"))
            elif path == "/api/forget-groups":
                self.server.store.forget_groups(data.get("visitor"))
            elif path == "/api/admin/delete-contact":
                token = self.headers.get("Authorization", "").removeprefix("Bearer ")
                if not hmac.compare_digest(token, self.server.store.key):
                    return self.json_response(401, {"error": "admin_key"})
                with self.server.store.connect() as db:
                    db.execute("DELETE FROM contacts WHERE id=?", (str(data.get("id", "")),))
            else:
                return self.json_response(404, {"error": "not_found"})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return self.json_response(400, {"error": str(exc)[:60]})
        except sqlite3.Error:
            return self.json_response(503, {"error": "storage_unavailable"})
        self.json_response(200, {"ok": True})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    store = Store()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.store = store
    print(f"Навигатор готов: http://127.0.0.1:{args.port}", flush=True)
    print(f"Статистика команды: http://127.0.0.1:{args.port}/admin#key={store.key}", flush=True)
    print("Данные этой локальной версии сохраняются только на этом компьютере. Ctrl+C завершает работу.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
