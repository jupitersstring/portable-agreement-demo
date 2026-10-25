import http.client
import importlib.util
from pathlib import Path
import threading
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('agreement_demo_server',ROOT/'run_demo.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DemoHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=m.ThreadingHTTPServer(('127.0.0.1',0),m.Handler);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=3)
    def get(self,path='/',host=None,method='GET'):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            conn.request(method,path,headers={} if host is None else {'Host':host});r=conn.getresponse();return r.status,dict(r.getheaders()),r.read()
        finally:conn.close()
    def test_real_page_and_modules_are_served_without_network_apis(self):
        status,headers,body=self.get();self.assertEqual(status,200);self.assertIn(b'A verifiable agreement',body)
        self.assertIn("connect-src 'none'",headers['Content-Security-Policy']);self.assertEqual(headers['Cache-Control'],'no-store')
        for path in ('/app.mjs','/protocol.mjs','/style.css'):
            self.assertEqual(self.get(path)[0],200)
        self.assertFalse(self.get('/',method='HEAD')[2])
    def test_other_files_and_dns_rebinding_are_refused(self):
        for path in ('/../LICENSE','/.git/config','/run_demo.py','/tests/test_server.py','/?secret=not-a-real-key'):
            self.assertEqual(self.get(path)[0],404)
        self.assertEqual(self.get('/',host='attacker.example')[0],403)
        self.assertEqual(self.get('/',method='POST')[0],501)
    def test_public_assets_contain_no_network_clients_or_browser_storage(self):
        code=(ROOT/'site/app.mjs').read_text()+(ROOT/'site/protocol.mjs').read_text()
        for call in ('fetch(', 'XMLHttpRequest','localStorage','sessionStorage','sendBeacon','innerHTML'):
            self.assertNotIn(call,code)
