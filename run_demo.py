#!/usr/bin/env python3
"""Serve only the browser demo assets on loopback. No backend keys or APIs."""
import argparse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parent/'site'
ASSETS={'/':('index.html','text/html; charset=utf-8'),'/index.html':('index.html','text/html; charset=utf-8'),
        '/style.css':('style.css','text/css; charset=utf-8'),'/app.mjs':('app.mjs','text/javascript; charset=utf-8'),
        '/protocol.mjs':('protocol.mjs','text/javascript; charset=utf-8')}
CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

class Handler(BaseHTTPRequestHandler):
    server_version='LocalAgreementDemo'
    def log_message(self,*args):pass
    def do_GET(self):self.reply(False)
    def do_HEAD(self):self.reply(True)
    def reply(self,head):
        host=self.headers.get('Host','')
        if host not in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'):
            self.send_error(403,'Local host required');return
        path=urlsplit(self.path)
        if path.query or path.path not in ASSETS:
            self.send_error(404,'No such demo asset');return
        name,kind=ASSETS[path.path];data=(ROOT/name).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Content-Security-Policy',CSP)
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        if not head:self.wfile.write(data)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765,help='Loopback port; 0 selects a free port.')
    args=parser.parse_args()
    if not 0<=args.port<=65535:parser.error('port must be between 0 and 65535')
    try:server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError as exc:parser.exit(1,f'Cannot open demo port ({exc.errno}). Try --port 0.\n')
    server.daemon_threads=True
    print(f'Open http://127.0.0.1:{server.server_port}/',flush=True)
    print('Browser-only demo. No payments or private keys reach this server. Ctrl+C stops it.',flush=True)
    try:server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
