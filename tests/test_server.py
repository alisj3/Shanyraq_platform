import importlib.util
import json
from pathlib import Path
import secrets
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("navigator_server", Path(__file__).resolve().parents[1] / "server.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = module.Store(self.directory.name)
        self.visitor = secrets.token_hex(16)
        self.session = secrets.token_hex(16)

    def tearDown(self):
        self.directory.cleanup()

    def event(self, **overrides):
        return dict(id=secrets.token_hex(16), visitor=self.visitor, session=self.session,
                    kind="completed", consent=True, language="ru", purpose="self", **overrides)

    def test_consent_is_required(self):
        data = self.event()
        data["consent"] = False
        with self.assertRaises(ValueError):
            self.store.add_event(data)
        self.assertEqual(self.store.report()["visitors"], 0)

    def test_reopening_route_and_retry_do_not_inflate_reach(self):
        event = self.event()
        self.store.add_event(event)
        self.store.add_event(event)
        self.store.add_event(self.event())
        report = self.store.report()
        self.assertEqual(report["routes"], 1)
        self.assertEqual(report["purposes"], {"self": 1})

    def test_no_raw_answers_or_ip_are_stored(self):
        data = self.event()
        data.update(income=300000, diagnosis="test", region="test", ip="test")
        self.store.add_event(data)
        with self.store.connect() as db:
            record = dict(db.execute("SELECT * FROM events").fetchone())
        self.assertNotIn(self.visitor, record.values())
        self.assertFalse({"income", "diagnosis", "region", "ip"} & set(record))

    def test_group_data_requires_additional_consent(self):
        self.store.add_event(self.event(groups=["disability"]))
        self.assertEqual(self.store.report()["groups"], {})
        self.store.add_event(self.event(groups=["disability", "single_parent"], groupConsent=True))
        self.assertEqual(self.store.report()["groups"], {"disability": 1, "single_parent": 1})
        self.store.forget_groups(self.visitor)
        self.assertEqual(self.store.report()["groups"], {})

    def test_purpose_change_keeps_one_completed_session(self):
        self.store.add_event(self.event())
        data = self.event()
        data["purpose"] = "explore"
        self.store.add_event(data)
        self.assertEqual(self.store.report()["purposes"], {"explore": 1})

    def test_feedback_updates_and_contact_deletion(self):
        data = self.event()
        data.update(kind="feedback", value="yes")
        self.store.add_event(data)
        data.update(id=secrets.token_hex(16), value="no")
        self.store.add_event(data)
        self.assertEqual(self.store.report()["feedback"], {"no": 1})
        self.store.add_contact(dict(email="test@example.invalid", visitor=self.visitor, consent=True, language="ru"))
        self.store.forget(self.visitor)
        self.assertEqual(self.store.report()["contacts"], [])
        self.assertEqual(self.store.report()["visitors"], 0)

    def test_contact_consent_is_separate(self):
        with self.assertRaises(ValueError):
            self.store.add_contact(dict(email="test@example.invalid", visitor=self.visitor, consent=False))
        self.assertEqual(self.store.report()["contacts"], [])


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.server = module.ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
        cls.server.store = module.Store(cls.directory.name)
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.directory.cleanup()

    def test_health_and_no_external_scripts(self):
        with urlopen(self.base + "/api/health") as response:
            self.assertTrue(json.load(response)["ok"])
        with urlopen(self.base) as response:
            self.assertIn("script-src 'self'", response.headers["Content-Security-Policy"])
            self.assertIn('src="/app.js"', response.read().decode())

    def test_private_report_requires_key(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.base + "/api/admin/report")
        self.assertEqual(error.exception.code, 401)
        request = Request(self.base + "/api/admin/report", headers={"Authorization": "Bearer " + self.server.store.key})
        with urlopen(request) as response:
            self.assertEqual(response.status, 200)

    def test_external_origin_cannot_write(self):
        request = Request(self.base + "/api/forget", data=b'{}', headers={"Content-Type": "application/json", "Origin": "https://example.invalid"})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 403)

    def test_private_files_and_directory_listing_are_not_served(self):
        for path in ["/.local/admin-key", "/server.py", "/assets/"]:
            with self.assertRaises(HTTPError) as error:
                urlopen(self.base + path)
            self.assertEqual(error.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
