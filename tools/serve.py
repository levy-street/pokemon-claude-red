#!/usr/bin/env python3
# Serves the built game (dist/) plus the small site API, all stored in one SQLite file (data/claudered.db):
#   POST /api/subscribe           email signup from the Levy St. bar (src/game/topbar.js), forwarded to the newsletter
#   POST /api/hit, GET /api/hits  the late-90s hit counter
#   POST /api/account/signup|login|logout, GET|PUT /api/save   accounts + cloud saves (src/game/cloudsave.js)
#   /api/lounge/*                 the live SOCIAL ZONE: presence, chat, offers, link battles (tools/lounge.py, in memory)
#
#   python3 tools/serve.py [port] [web dir]      serve (default 8784, dist/)
#   python3 tools/serve.py export                print the email list (bar signups + opted-in accounts) as CSV
#   python3 tools/serve.py sync-newsletter       re-send any signup the newsletter didn't accept yet
#
# Newsletter: every signup is kept here first, then forwarded to the Levy Street list on Notifuse in the background
# (NEWSLETTER_URL / NEWSLETTER_WORKSPACE / NEWSLETTER_LIST override the defaults below; its status is in `synced`).
#
# Passwords are never stored: only a salted scrypt hash (n=2^17, r=8, p=1, the OWASP minimum). Sessions are random
# 256-bit tokens held by the browser; the server keeps only their SHA-256. The database sits outside the web root,
# is git-ignored, and nothing here reads emails back over HTTP.
import base64, csv, hashlib, hmac, http.server, json, os, re, secrets, sqlite3, sys, threading, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get('CLAUDERED_DB', os.path.join(ROOT, 'data', 'claudered.db'))
EMAIL = re.compile(r'^[^@\s"<>]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
SESSION_DAYS, MAX_SAVE = 365, 512 * 1024
NEWSLETTER_URL = os.environ.get('NEWSLETTER_URL', 'https://notifuse.mogged.email/subscribe')
NEWSLETTER_WORKSPACE = os.environ.get('NEWSLETTER_WORKSPACE', 'levystreet')
NEWSLETTER_LIST = os.environ.get('NEWSLETTER_LIST', 'levystreetainewsletter')
now_iso = lambda: time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

def connect():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    old = os.path.join(os.path.dirname(DB), 'subscribers.db')  # the first version's file name
    if not os.path.exists(DB) and os.path.exists(old): os.rename(old, DB)
    db = sqlite3.connect(DB, check_same_thread=False)
    db.executescript('''
      CREATE TABLE IF NOT EXISTS subscribers (
        email TEXT PRIMARY KEY,   -- lower-cased
        created_at TEXT NOT NULL, -- UTC, ISO 8601
        source TEXT,              -- ?ref= / ?utm_source= on the link, else the referring host, else "direct"
        referrer TEXT,
        consent TEXT);            -- which wording they agreed to: topbar-v1 (the bar), account-v1 (the sign-up box)
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pw TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account INTEGER NOT NULL, created_at REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS saves (account INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);''')
    if 'synced' not in [r[1] for r in db.execute('PRAGMA table_info(subscribers)')]:
        db.execute('ALTER TABLE subscribers ADD COLUMN synced TEXT')  # newsletter status: NULL = not sent yet, 'ok', or the error
    db.commit(); return db

def send_to_newsletter(email):
    """POST one contact to the newsletter list; returns 'ok' or a short error"""
    body = json.dumps({'workspace_id': NEWSLETTER_WORKSPACE, 'list_ids': [NEWSLETTER_LIST], 'contact': {'email': email}}).encode()
    req = urllib.request.Request(NEWSLETTER_URL, data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10) as r: return 'ok' if 200 <= r.status < 300 else f'http {r.status}'
    except urllib.error.HTTPError as e: return f'http {e.code}: ' + e.read(200).decode('utf-8', 'replace')
    except Exception as e: return 'error: ' + str(e)[:200]

if len(sys.argv) > 1 and sys.argv[1] == 'export':
    w = csv.writer(sys.stdout); w.writerow(['email', 'created_at', 'source', 'referrer', 'consent', 'synced'])
    w.writerows(connect().execute('SELECT email, created_at, source, referrer, consent, synced FROM subscribers ORDER BY created_at'))
    sys.exit()
if len(sys.argv) > 1 and sys.argv[1] == 'sync-newsletter':
    db = connect(); rows = db.execute("SELECT email FROM subscribers WHERE synced IS NULL OR synced != 'ok'").fetchall()
    for (email,) in rows:
        status = send_to_newsletter(email); db.execute('UPDATE subscribers SET synced = ? WHERE email = ?', (status, email)); db.commit()
        print(status.ljust(8)[:60], email)
    print(len(rows), 'sent'); sys.exit()

# ---------------------------------------------------------------- passwords + sessions
N, R, P = 2 ** 17, 8, 1
hashing = threading.BoundedSemaphore(2)  # each hash takes ~128 MB, so at most two at once
def kdf(pw, salt, n=N, r=R, p=P):
    with hashing: return hashlib.scrypt(pw.encode(), salt=salt, n=n, r=r, p=p, dklen=32, maxmem=256 * 1024 * 1024)
def hash_pw(pw):
    salt = secrets.token_bytes(16)
    return f'scrypt${N}${R}${P}$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(kdf(pw, salt)).decode()
def check_pw(pw, stored):
    _, n, r, p, salt, key = stored.split('$')
    return hmac.compare_digest(kdf(pw, base64.b64decode(salt), int(n), int(r), int(p)), base64.b64decode(key))
DUMMY = hash_pw(secrets.token_hex(8))  # checked when the email is unknown, so a wrong email takes as long as a wrong password
tok_hash = lambda t: hashlib.sha256(t.encode()).hexdigest()

import lounge  # after the CLI commands above: it starts the lounge's clock thread
from urllib.parse import parse_qs

WEB = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, 'dist')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8784
db, lock, limits, recent = connect(), threading.Lock(), threading.Lock(), {}

def forward(email):
    def run():
        status = send_to_newsletter(email)
        with lock: db.execute('UPDATE subscribers SET synced = ? WHERE email = ?', (status, email)); db.commit()
        if status != 'ok': print('newsletter:', status, flush=True)
    threading.Thread(target=run, daemon=True).start()

def allow(key, n, window):
    """sliding-window rate limit: True if this key has used fewer than n tries in the last `window` seconds"""
    t = time.time()
    with limits:
        hits = [x for x in recent.get(key, []) if t - x < window]
        recent[key] = hits + [t]
        return len(hits) < n

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=WEB, **k)

    def end_headers(self):
        # the page itself always revalidates: its script links carry ?v=<content hash> (tools/build_dist.js), so a
        # fresh page is all it takes for every visitor to pick up a deploy
        p = self.path.split('?')[0]
        if self.command in ('GET', 'HEAD') and (p.endswith('/') or p.endswith('.html')): self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def body(self, limit=4096):
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n <= limit: raise ValueError(n)
        d = json.loads(self.rfile.read(n))
        if not isinstance(d, dict): raise ValueError('not an object')
        return d
    def ip(self): return self.headers.get('CF-Connecting-IP') or self.client_address[0]  # the tunnel passes the visitor's address
    def token(self):
        m = re.match(r'Bearer ([A-Za-z0-9_-]{20,100})$', self.headers.get('Authorization') or '')
        return m and m.group(1)
    def account(self):
        t = self.token()
        if not t: return None
        with lock: row = db.execute('SELECT account, created_at FROM sessions WHERE token = ?', (tok_hash(t),)).fetchone()
        return row[0] if row and time.time() - row[1] < SESSION_DAYS * 86400 else None
    def new_session(self, account):
        t = secrets.token_urlsafe(32)
        with lock: db.execute('INSERT INTO sessions VALUES (?, ?, ?)', (tok_hash(t), account, time.time())); db.commit()
        return t

    def do_GET(self):
        path = self.path.split('?')[0].rstrip('/')
        if path == '/api/lounge/ws':
            if 'websocket' not in (self.headers.get('Upgrade') or '').lower() or not self.headers.get('Sec-WebSocket-Key'): return self.reply(400, {'ok': False})
            if not allow(('lounge', self.ip()), 30, 60): return self.reply(429, {'ok': False, 'error': 'too many tries'})
            self.close_connection = True
            self.wfile.write(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '
                              + lounge.ws_accept(self.headers['Sec-WebSocket-Key']) + '\r\n\r\n').encode())
            try: lounge.serve_ws(self, self.ip())
            except Exception: pass
            return
        if path == '/api/lounge/poll':
            q = parse_qs(self.path.partition('?')[2])
            try: since = int((q.get('since') or ['0'])[0])
            except ValueError: since = 0
            out = lounge.poll((q.get('k') or [''])[0], since)
            if out is None: return self.reply(410, {'ok': False, 'error': 'gone'})
            body = out.encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        if path == '/api/hits':
            with lock: row = db.execute("SELECT value FROM counters WHERE name = 'hits'").fetchone()
            return self.reply(200, {'ok': True, 'hits': row[0] if row else 0})
        if path == '/api/save':
            acc = self.account()
            if not acc: return self.reply(401, {'ok': False, 'error': 'log in'})
            with lock: row = db.execute('SELECT data, updated_at FROM saves WHERE account = ?', (acc,)).fetchone()
            return self.reply(200, {'ok': True, 'save': json.loads(row[0]) if row else None, 'updatedAt': row[1] if row else None})
        if path.startswith('/api/'): return self.reply(404, {'ok': False, 'error': 'not found'})
        return super().do_GET()

    def do_PUT(self):
        if self.path.split('?')[0].rstrip('/') != '/api/save': return self.send_error(404)
        acc = self.account()
        if not acc: return self.reply(401, {'ok': False, 'error': 'log in'})
        if not allow(('save', acc), 120, 3600): return self.reply(429, {'ok': False, 'error': 'too many tries'})
        try: d = self.body(MAX_SAVE)
        except Exception: return self.reply(400, {'ok': False, 'error': 'bad request'})
        if not isinstance(d.get('save'), dict): return self.reply(400, {'ok': False, 'error': 'bad request'})
        with lock:
            row = db.execute('SELECT data, updated_at FROM saves WHERE account = ?', (acc,)).fetchone()
            # never silently overwrite progress made on another device since this browser last synced
            if row and not d.get('force') and d.get('base') != row[1]:
                return self.reply(409, {'ok': False, 'error': 'newer save', 'save': json.loads(row[0]), 'updatedAt': row[1]})
            stamp = now_iso() + '.' + secrets.token_hex(3)  # unique, so two saves in one second never look alike
            db.execute('INSERT OR REPLACE INTO saves VALUES (?, ?, ?)', (acc, json.dumps({'save': d['save'], 'wtp': d.get('wtp')}), stamp))
            db.commit()
        self.reply(200, {'ok': True, 'updatedAt': stamp})

    def do_POST(self):
        path = self.path.split('?')[0].rstrip('/')
        if path in ('/api/lounge/hello', '/api/lounge/send'):
            try: d = self.body(lounge.MAX_MSG * 4)
            except Exception: return self.reply(400, {'ok': False, 'error': 'bad request'})
            if path == '/api/lounge/hello':
                if not allow(('lounge', self.ip()), 30, 60): return self.reply(429, {'ok': False, 'error': 'too many tries'})
                return self.reply(200, lounge.poll_hello(d, self.ip()))
            ok = lounge.poll_send(str(d.get('k', '')), d.get('m') if isinstance(d.get('m'), list) else [])
            return self.reply(200 if ok else 410, {'ok': ok})
        if path == '/api/hit':  # counts at most 60 visits an hour from one address
            counted = allow(('hit', self.ip()), 60, 3600)
            with lock:
                if counted: db.execute("INSERT INTO counters VALUES ('hits', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1"); db.commit()
                row = db.execute("SELECT value FROM counters WHERE name = 'hits'").fetchone()
            return self.reply(200, {'ok': True, 'hits': row[0] if row else 0})
        if path == '/api/account/logout':
            t = self.token()
            if t:
                with lock: db.execute('DELETE FROM sessions WHERE token = ?', (tok_hash(t),)); db.commit()
            return self.reply(200, {'ok': True})
        if path not in ('/api/subscribe', '/api/account/signup', '/api/account/login'): return self.send_error(404)
        # 20 tries an hour per address for the bar (offices and campuses share one), 30 per 15 min for accounts
        if not (allow(('sub', self.ip()), 20, 3600) if path == '/api/subscribe' else allow(('auth', self.ip()), 30, 900)):
            return self.reply(429, {'ok': False, 'error': 'too many tries'})
        try: d = self.body()
        except Exception: return self.reply(400, {'ok': False, 'error': 'bad request'})
        if d.get('website'): return self.reply(200, {'ok': True})  # honeypot: only bots fill the hidden field
        email = str(d.get('email', '')).strip().lower()
        if len(email) > 254 or not EMAIL.match(email): return self.reply(400, {'ok': False, 'error': 'invalid email'})
        clip = lambda v: str(v or '')[:300]
        if path == '/api/subscribe':
            with lock:
                db.execute('INSERT OR IGNORE INTO subscribers (email, created_at, source, referrer, consent) VALUES (?, ?, ?, ?, ?)', (email, now_iso(), clip(d.get('source')), clip(d.get('referrer')), clip(d.get('consent'))))
                db.commit(); status = db.execute('SELECT synced FROM subscribers WHERE email = ?', (email,)).fetchone()[0]
            if status != 'ok': forward(email)
            return self.reply(200, {'ok': True})

        pw = str(d.get('password', ''))
        if path == '/api/account/signup':
            if not 8 <= len(pw) <= 200: return self.reply(400, {'ok': False, 'error': 'weak password'})
            with lock: exists = db.execute('SELECT 1 FROM accounts WHERE email = ?', (email,)).fetchone()
            if exists: return self.reply(409, {'ok': False, 'error': 'exists'})
            h = hash_pw(pw)
            with lock:
                try: cur = db.execute('INSERT INTO accounts (email, pw, created_at, source) VALUES (?, ?, ?, ?)', (email, h, now_iso(), clip(d.get('source'))))
                except sqlite3.IntegrityError: return self.reply(409, {'ok': False, 'error': 'exists'})
                optin = d.get('updates') is True  # the opt-in box, unticked by default
                if optin: db.execute('INSERT OR IGNORE INTO subscribers (email, created_at, source, referrer, consent) VALUES (?, ?, ?, ?, ?)', (email, now_iso(), clip(d.get('source')), clip(d.get('referrer')), 'account-v1'))
                db.commit(); acc = cur.lastrowid
            if optin: forward(email)
            return self.reply(200, {'ok': True, 'token': self.new_session(acc), 'email': email, 'saveAt': None})

        # login: 10 wrong passwords an hour per email, then it waits
        if not allow(('login', email), 10, 3600): return self.reply(429, {'ok': False, 'error': 'too many tries'})
        with lock: row = db.execute('SELECT id, pw FROM accounts WHERE email = ?', (email,)).fetchone()
        if not (check_pw(pw, row[1] if row else DUMMY) and row): return self.reply(401, {'ok': False, 'error': 'wrong'})
        with limits: recent.pop(('login', email), None)
        with lock: saved = db.execute('SELECT updated_at FROM saves WHERE account = ?', (row[0],)).fetchone()
        return self.reply(200, {'ok': True, 'token': self.new_session(row[0]), 'email': email, 'saveAt': saved and saved[0]})

    def log_message(self, fmt, *args):  # keep the log to API calls and errors, not every sprite script or lounge message
        if self.path.startswith('/api/lounge/') and not (len(args) > 1 and str(args[1])[:1] == '5'): return
        if self.command in ('POST', 'PUT') or (len(args) > 1 and str(args[1])[:1] in '45'): super().log_message(fmt, *args)

print(f'serving {WEB} on http://127.0.0.1:{PORT}  (data -> {DB})', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
