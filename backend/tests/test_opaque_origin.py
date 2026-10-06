"""HTTP sandbox boundary: reject opaque origins before any route effects."""
import copy
import json
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import Handler, Workshop
from world import World


class TestOpaqueOrigin(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.workshop = Workshop(Path(self.root.name) / "workshop")
        self.server.world = World(data_root=Path(self.root.name) / "world")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method, path, origin=None, body=None):
        conn = HTTPConnection(*self.server.server_address, timeout=10)
        headers = {} if origin is None else {"Origin": origin}
        try:
            conn.request(method, path, body=body, headers=headers)
            response = conn.getresponse()
            data = response.read()
            return response.status, dict(response.getheaders()), json.loads(data) if data else None
        finally:
            conn.close()

    def state(self):
        return copy.deepcopy((self.server.workshop.snapshot(), self.server.world.state()))

    def test_null_rejected_before_routes_and_body_parsing(self):
        before = self.state()
        workshop, world = self.server.workshop, self.server.world
        with patch.object(Handler, "_body", side_effect=AssertionError("body parsed")), \
             patch.object(workshop, "advance_demo", side_effect=AssertionError("route ran")), \
             patch.object(world, "challenge", side_effect=AssertionError("challenge issued")):
            for method, path in (
                ("OPTIONS", "/api/demo/advance"),
                ("GET", "/api/health"),
                ("GET", "/api/events"),
                ("GET", "/api/world/challenge"),
                ("POST", "/api/world/challenge"),
                ("POST", "/api/demo/advance"),
                ("POST", "/api/demo/reset"),
                ("POST", "/api/world/join"),
                ("POST", "/api/adapter/hooks"),
                ("POST", "/unknown"),
            ):
                with self.subTest(method=method, path=path):
                    status, _, body = self.request(method, path, "null", "invalid json")
                    self.assertEqual(status, 403)
                    self.assertEqual(body, {"error": "OPAQUE_ORIGIN_FORBIDDEN"})
                    self.assertEqual(self.state(), before)
                    self.assertIs(self.server.workshop, workshop)
                    self.assertIs(self.server.world, world)

    def test_no_origin_and_loopback_flows_preserved(self):
        for origin in (None, "http://127.0.0.1:5173", "http://localhost:5173"):
            with self.subTest(origin=origin):
                self.assertEqual(self.request("GET", "/api/health", origin)[0], 200)
                status, headers, _ = self.request("OPTIONS", "/api/demo/advance", origin)
                self.assertEqual(status, 204)
                if origin:
                    self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
                step = self.server.workshop.demo_step
                self.assertEqual(self.request("POST", "/api/demo/advance", origin)[0], 200)
                self.assertEqual(self.server.workshop.demo_step, step + 1)
                self.assertEqual(self.request("POST", "/api/world/challenge", origin)[0], 200)

    def test_origin_check_is_exact(self):
        self.assertEqual(self.request("GET", "/api/health", "NULL")[0], 200)
