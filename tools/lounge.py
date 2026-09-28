# The live SOCIAL ZONE (src/game/lounge.js): who's in the lounge and where they're standing, chat, battle and trade
# offers, a random-match queue, and a relay for link battles. Nothing is stored: it all lives in memory.
#
# Transport: a WebSocket at /api/lounge/ws, or long polling (POST /api/lounge/hello, GET /api/lounge/poll,
# POST /api/lounge/send) for networks that block WebSockets. Every message to a player carries a sequence number `q`,
# so a phone that drops its connection (switching apps) picks up where it left off within AWAY_GRACE seconds.
#
# Link battles run on both players' games: each game resolves the turn from the two picks and a shared random seed
# (src/game/battle.js), so the server only matches players and relays their picks. It never sees a password, an
# email or a save.
import base64, collections, hashlib, json, re, secrets, struct, threading, time

VERSION = 1              # bump with any change to battle rules, so two different builds never battle each other
ROOM_CAP = 40            # a room full of avatars; the next player opens SOCIAL ZONE 2
AWAY_GRACE = 30          # seconds a dropped player keeps their place (and their battle)
OFFER_TTL = 45           # seconds an unanswered battle/trade offer stays open
MAX_MSG = 16 * 1024      # a 3-POKéMON team is ~1 KB, a battle snapshot ~3 KB
BACKLOG = 3000           # messages kept per player for resuming
WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

LOCK = threading.RLock()
players, by_key, rooms, offers, matches, queue = {}, {}, {}, {}, {}, []
moved = {}               # room -> {player id: [x, y, dir]} since the last position broadcast
recent_chat = {}         # room -> last lines, for players who join
next_id = [1]

NAME = re.compile(r"[^A-Z0-9 .\-'É]")
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
LOOK_ENUMS = {'face': ('m', 'f'), 'outfit': ('pants', 'shorts', 'dress'), 'head': ('cap', 'spiky', 'short', 'bald', 'long', 'pony', 'bun', 'beanie', 'hat')}
# slurs, masked in chat. rot13, so this file doesn't spell them out: PART matches inside words, WORD whole words only
ROT = str.maketrans('abcdefghijklmnopqrstuvwxyz', 'nopqrstuvwxyzabcdefghijklm')
PART = ['a[v1!l]tt']
WORD = ['puvax', 'fcvp', 'xvxr', 'jrgonpx', 'genaal', 'ergneq(rq)?', 'snt(tbg)?']
BLOCK = [re.compile(w.translate(ROT), re.I) for w in PART] + [re.compile(r'\b(' + w.translate(ROT) + r')s?\b', re.I) for w in WORD]

def clean_name(v): return NAME.sub('', str(v or '').upper())[:10].strip() or 'TRAINER'
def clean_look(l):
    out = {}
    if not isinstance(l, dict): return out
    for k in ('skin', 'hair', 'hat', 'shirt', 'bottom', 'bag'):
        if isinstance(l.get(k), str) and HEX.match(l[k]): out[k] = l[k].lower()
    for k, ok in LOOK_ENUMS.items():
        if l.get(k) in ok: out[k] = l[k]
    return out
def clean_chat(v):
    t = re.sub(r'[^\x20-\x7eéÉ]', '', str(v or '')).strip()[:60]
    for rx in BLOCK: t = rx.sub(lambda m: '*' * len(m.group(0)), t)
    return t
def clip_json(v, n=4096):
    """a team / Pokémon payload, relayed as-is: each game validates it (monIn in src/game/social.js)"""
    s = json.dumps(v, separators=(',', ':'))
    return v if len(s) <= n else None
def num(v, lo, hi):
    try: return max(lo, min(hi, int(v)))
    except Exception: return lo

class Player:
    def __init__(self, name, look, ip):
        self.id = next_id[0]; next_id[0] += 1
        self.key = secrets.token_urlsafe(18)
        self.name, self.look, self.ip = name, look, ip
        self.x, self.y, self.dir = 11, 12, 0
        self.status = ''            # '' | 'menu' | 'queue' | 'battle' | 'trade' | 'away'
        self.room = None
        self.out = collections.deque(maxlen=BACKLOG)  # (seq, json text)
        self.seq = 0
        self.cond = threading.Condition(LOCK)
        self.conn = None            # the live WebSocket, if any
        self.polled = 0             # last long-poll (fallback transport)
        self.gone_at = None         # when the connection dropped
        self.match = None
        self.team = None            # queued team
        self.chat_times = []
        self.last_line = ('', 0)
    def public(self):
        return {'id': self.id, 'name': self.name, 'look': self.look, 'x': self.x, 'y': self.y, 'd': self.dir, 's': self.status}
    def online(self, now):
        return self.conn is not None or now - self.polled < 35

def push(p, msg):
    p.seq += 1
    body = json.dumps(msg, separators=(',', ':'))
    p.out.append((p.seq, '{"q":%d,%s' % (p.seq, body[1:])))
    p.cond.notify_all()
def room_cast(room, msg, but=None):
    for pid in rooms.get(room, ()):
        if pid != but: push(players[pid], msg)
def sys_line(room, text):
    room_cast(room, {'t': 'sys', 'text': text})
    recent_chat.setdefault(room, collections.deque(maxlen=12)).append({'sys': True, 'text': text, 'at': time.time()})
def set_status(p, s):
    if p.status == s: return
    p.status = s
    room_cast(p.room, {'t': 'st', 'id': p.id, 's': s})

# ---------------------------------------------------------------- joining and leaving
def join(hello, ip):
    """a new player (or a resumed one, when hello carries a valid key) -> (player, welcome message)"""
    now = time.time()
    k = hello.get('key')
    p = by_key.get(k) if isinstance(k, str) else None
    if p:  # resuming: same id, same place, same battle
        p.gone_at = None
        if p.status == 'away': set_status(p, 'battle' if p.match else '')
        return p, None
    if hello.get('v') != VERSION: return None, {'t': 'error', 'why': 'version'}
    if len(players) >= 600 or sum(1 for q in players.values() if q.ip == ip) >= 8: return None, {'t': 'error', 'why': 'busy'}
    p = Player(clean_name(hello.get('name')), clean_look(hello.get('look')), ip)
    room = 1
    while len(rooms.get(room, ())) >= ROOM_CAP: room += 1
    p.room = room
    p.x, p.y = num(hello.get('x', 11), 0, 23), num(hello.get('y', 12), 0, 13)
    room_cast(room, {'t': 'join', 'p': p.public()})
    rooms.setdefault(room, set()).add(p.id)
    players[p.id], by_key[p.key] = p, p
    return p, None
def welcome(p):
    now = time.time()
    others = [players[i].public() for i in rooms.get(p.room, ()) if i != p.id]
    chat = [c for c in recent_chat.get(p.room, ()) if now - c['at'] < 600]
    return {'t': 'welcome', 'id': p.id, 'key': p.key, 'room': p.room, 'players': others, 'chat': chat,
            'queue': sum(1 for i in queue if players[i].room == p.room)}
def leave(p, why='left'):
    if p.id not in players: return
    if p.match: end_match(p.match, p, 'gone')
    if p.id in queue: queue.remove(p.id); queue_count(p.room)
    for o in list(offers.values()):
        if p.id in (o['from'], o['to']): close_offer(o, 'gone')
    rooms.get(p.room, set()).discard(p.id)
    moved.get(p.room, {}).pop(p.id, None)
    del players[p.id]; by_key.pop(p.key, None)
    room_cast(p.room, {'t': 'leave', 'id': p.id})
    p.cond.notify_all()
def queue_count(room):
    room_cast(room, {'t': 'queue', 'n': sum(1 for i in queue if players[i].room == room)})

# ---------------------------------------------------------------- offers, the queue and matches
def close_offer(o, why):
    offers.pop(o['id'], None)
    for pid, msg in ((o['from'], {'t': 'declined', 'id': o['id'], 'why': why}), (o['to'], {'t': 'cancelled', 'id': o['id'], 'why': why})):
        q = players.get(pid)
        if q:
            push(q, msg)
            if q.status == 'trade' and not q.match: set_status(q, '')
def start_battle(a, ta, b, tb):
    """a hosts: its side comes first in both games' checksums and wins speed ties by the shared seed"""
    mid = secrets.token_hex(6)
    matches[mid] = {'id': mid, 'kind': 'battle', 'a': a.id, 'b': b.id, 'names': (a.name, b.name), 'at': time.time()}
    seed = secrets.randbits(32)
    for p, host in ((a, True), (b, False)):
        p.match = mid
        if p.id in queue: queue.remove(p.id)
        foe = b if host else a
        push(p, {'t': 'battle', 'mid': mid, 'seed': seed, 'host': host, 'teams': [ta, tb],
                 'foe': {'id': foe.id, 'name': foe.name, 'look': foe.look}})
        set_status(p, 'battle')
    queue_count(a.room)
    if b.room != a.room: queue_count(b.room)
def end_match(mid, by, result):
    m = matches.pop(mid, None)
    if not m: return
    a, b = players.get(m['a']), players.get(m['b'])
    other = b if by is a else a
    for p in (a, b):
        if p and p.match == mid:
            p.match = None
            if p.status in ('battle', 'trade'): set_status(p, '')
    if not other: return
    if m['kind'] == 'trade':
        if result != 'done': push(other, {'t': 'trade', 'mid': mid, 'stage': 'cancel'})
        return
    if result in ('gone', 'stale'): push(other, {'t': 'gone', 'mid': mid})
    else: push(other, {'t': 'ended', 'mid': mid, 'r': result})  # normally their game got there too; if not, it stops waiting
    if not by: return
    if result == 'gone': return sys_line(by.room, f'{by.name} left the link battle, so {other.name} wins!')
    win, lose = (by, other) if result == 'win' else (other, by) if result in ('lose', 'forfeit', 'timeout') else (None, None)
    if win: sys_line(by.room, f'{win.name} won a link battle against {lose.name}!')
    elif result == 'draw': sys_line(by.room, f'{by.name} and {other.name} battled to a draw!')

def handle(p, m):
    """one message from a player's game"""
    t = m.get('t')
    now = time.time()
    if t == 'pos':
        p.x, p.y, p.dir = num(m.get('x'), 0, 23), num(m.get('y'), 0, 13), num(m.get('d'), 0, 3)
        moved.setdefault(p.room, {})[p.id] = [p.x, p.y, p.dir, num(m.get('s'), 1, 3)]
    elif t == 'st':  # the game's own busy / away-from-the-tab signal; queue, battle and trade are the server's to set
        s = m.get('s')
        if s in ('', 'menu', 'away') and p.status in ('', 'menu', 'away'): set_status(p, s)
    elif t == 'say':
        text = clean_chat(m.get('text'))
        p.chat_times = [x for x in p.chat_times if now - x < 10]
        if not text or len(p.chat_times) >= 5 or (text == p.last_line[0] and now - p.last_line[1] < 5):
            return push(p, {'t': 'sys', 'text': 'Slow down a little!'}) if text else None
        p.chat_times.append(now); p.last_line = (text, now)
        room_cast(p.room, {'t': 'say', 'id': p.id, 'name': p.name, 'text': text})
        recent_chat.setdefault(p.room, collections.deque(maxlen=12)).append({'id': p.id, 'name': p.name, 'text': text, 'at': now})
    elif t == 'offer':
        to, kind = players.get(m.get('to')), m.get('kind')
        if kind not in ('battle', 'trade'): return
        p.offer_times = [x for x in getattr(p, 'offer_times', []) if now - x < 60]
        if len(p.offer_times) >= 8: return push(p, {'t': 'declined', 'id': m.get('ref'), 'why': 'busy'})
        p.offer_times.append(now)
        payload = clip_json(m.get('team') if kind == 'battle' else m.get('mon'))
        oid = secrets.token_hex(5)
        if any(o['from'] == p.id for o in offers.values()) or p.match: return push(p, {'t': 'declined', 'id': m.get('ref'), 'why': 'busy'})
        if not to or to is p or to.room != p.room: return push(p, {'t': 'declined', 'id': m.get('ref'), 'why': 'gone'})
        if to.match or to.status in ('away',) or payload is None: return push(p, {'t': 'declined', 'id': m.get('ref'), 'why': 'busy'})
        offers[oid] = {'id': oid, 'from': p.id, 'to': to.id, 'kind': kind, 'payload': payload, 'at': now}
        push(p, {'t': 'offered', 'id': oid, 'ref': m.get('ref')})
        push(to, {'t': 'offer', 'id': oid, 'from': p.id, 'name': p.name, 'kind': kind, 'mon': payload if kind == 'trade' else None,
                  'n': len(payload) if kind == 'battle' and isinstance(payload, list) else None})
    elif t == 'cancel':
        o = offers.get(m.get('id'))
        if o and o['from'] == p.id: close_offer(o, 'cancelled')
    elif t == 'answer':
        o = offers.get(m.get('id'))
        if not o or o['to'] != p.id: return push(p, {'t': 'cancelled', 'id': m.get('id'), 'why': 'gone'})
        a = players.get(o['from'])
        if not m.get('ok') or not a or a.match or p.match:
            return close_offer(o, 'no' if not m.get('ok') else 'busy')
        mine = clip_json(m.get('team') if o['kind'] == 'battle' else m.get('mon'))
        if mine is None: return close_offer(o, 'busy')
        offers.pop(o['id'], None)
        if o['kind'] == 'battle':
            if p.id in queue: queue.remove(p.id)
            if a.id in queue: queue.remove(a.id)
            return start_battle(a, o['payload'], p, mine)
        # trade: the offerer sees what comes back and has the last word
        mid = secrets.token_hex(6)
        matches[mid] = {'id': mid, 'kind': 'trade', 'a': a.id, 'b': p.id, 'give': (o['payload'], mine), 'at': now}
        a.match = p.match = mid
        set_status(a, 'trade'); set_status(p, 'trade')
        push(a, {'t': 'trade', 'mid': mid, 'ref': o['id'], 'stage': 'confirm', 'mon': mine, 'name': p.name})
        push(p, {'t': 'trade', 'mid': mid, 'ref': o['id'], 'stage': 'wait', 'name': a.name})
    elif t == 'confirm':
        mm = matches.get(m.get('mid'))
        if not mm or mm['kind'] != 'trade' or mm['a'] != p.id: return
        b = players.get(mm['b'])
        if m.get('ok') and b:
            push(p, {'t': 'trade', 'mid': mm['id'], 'stage': 'done', 'mon': mm['give'][1], 'name': b.name})
            push(b, {'t': 'trade', 'mid': mm['id'], 'stage': 'done', 'mon': mm['give'][0], 'name': p.name})
            sys_line(p.room, f'{p.name} and {b.name} traded POKéMON!')
        else:
            for q in (p, b):
                if q: push(q, {'t': 'trade', 'mid': mm['id'], 'stage': 'cancel'})
        end_match(mm['id'], p, 'done')
    elif t == 'queue':
        if m.get('on'):
            team = clip_json(m.get('team'))
            if team is None or p.match or p.id in queue: return
            p.team = team
            queue.append(p.id); set_status(p, 'queue')
            if now - getattr(p, 'announced', 0) > 120: p.announced = now; sys_line(p.room, f'{p.name} is looking for a link battle!')
            ready = [i for i in queue if players[i].room == p.room and not players[i].match and players[i].online(now)]
            if len(ready) >= 2:
                a, b = players[ready[0]], players[ready[1]]
                return start_battle(a, a.team, b, b.team)
            queue_count(p.room)
        elif p.id in queue:
            queue.remove(p.id); set_status(p, ''); queue_count(p.room)
    elif t == 'bt':  # a battle pick, replacement or forfeit: straight to the opponent
        mm = matches.get(m.get('mid'))
        if not mm or p.match != mm['id']: return
        other = players.get(mm['b'] if mm['a'] == p.id else mm['a'])
        if other: push(other, {'t': 'bt', 'mid': mm['id'], 'turn': m.get('turn'), 'k': m.get('k'), 'a': m.get('a'), 'h': m.get('h'), 'snap': m.get('snap')})
    elif t == 'end':
        mm = matches.get(m.get('mid'))
        if mm and p.match == mm['id']: end_match(mm['id'], p, m.get('r'))
    elif t == 'bye':
        leave(p)

def tick():
    """10 times a second: send the room's footsteps as one message; once a second, expire the dropped and the stale"""
    n = 0
    while True:
        time.sleep(0.1); n += 1
        with LOCK:
            for room, pos in list(moved.items()):
                if pos: room_cast(room, {'t': 'pos', 'l': [[pid] + v for pid, v in pos.items()]}); pos.clear()
            if n % 10: continue
            now = time.time()
            for p in list(players.values()):
                if p.online(now): continue
                if p.gone_at is None:
                    p.gone_at = now
                    if p.status != 'away': set_status(p, 'away')
                    if p.id in queue: queue.remove(p.id); queue_count(p.room)
                elif now - p.gone_at > AWAY_GRACE: leave(p)
            for o in list(offers.values()):
                if now - o['at'] > OFFER_TTL: close_offer(o, 'timeout')
            for mm in list(matches.values()):
                if mm['kind'] == 'trade' and now - mm['at'] > OFFER_TTL + 30:  # the offerer never confirmed
                    a = players.get(mm['a'])
                    if a: push(a, {'t': 'trade', 'mid': mm['id'], 'stage': 'cancel'})
                    end_match(mm['id'], a, 'timeout')
                elif now - mm['at'] > 3 * 3600: end_match(mm['id'], None, 'stale')
threading.Thread(target=tick, daemon=True).start()

# ---------------------------------------------------------------- WebSocket (RFC 6455, just what browsers send)
def ws_accept(key): return base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
def ws_frame(data, op=1):
    n = len(data)
    head = bytes([0x80 | op, n]) if n < 126 else bytes([0x80 | op, 126]) + struct.pack('>H', n) if n < 65536 else bytes([0x80 | op, 127]) + struct.pack('>Q', n)
    return head + data
def ws_read(rfile):
    """-> (opcode, payload bytes), reassembling fragments; None when the socket closes"""
    buf, first = b'', None
    while True:
        h = rfile.read(2)
        if len(h) < 2: return None
        fin, op, masked, n = h[0] & 0x80, h[0] & 0x0f, h[1] & 0x80, h[1] & 0x7f
        if n == 126: n = struct.unpack('>H', rfile.read(2))[0]
        elif n == 127: n = struct.unpack('>Q', rfile.read(8))[0]
        if n > MAX_MSG or not masked: return None
        mask, data = rfile.read(4), rfile.read(n)
        if len(data) < n: return None
        data = (int.from_bytes(data, 'little') ^ int.from_bytes((mask * (n // 4 + 1))[:n], 'little')).to_bytes(n, 'little') if n else b''
        if op >= 8: return op, data  # control frames are never fragmented
        buf += data; first = first if first is not None else op
        if len(buf) > MAX_MSG: return None
        if fin: return first, buf

def serve_ws(handler, ip):
    """runs on the request's own thread: reads the player's messages; a second thread writes theirs"""
    sock, rfile, wfile = handler.connection, handler.rfile, handler.wfile
    sock.settimeout(50)  # the server pings every 20 s and the game sends a heartbeat, so a silent socket is a dead one
    wlock = threading.Lock()
    def send_raw(data, op=1):
        with wlock: wfile.write(ws_frame(data, op))
    first = ws_read(rfile)
    try: hello = json.loads(first[1]) if first and first[0] == 1 else None
    except Exception: hello = None
    if not isinstance(hello, dict) or hello.get('t') != 'hello': return
    with LOCK:
        p, err = join(hello, ip)
        if err: return send_raw(json.dumps(err).encode())
        since = num(hello.get('since'), 0, 1 << 40) if hello.get('key') == p.key else 0
        if since and (not p.out or p.out[0][0] > since + 1): since = 0  # too far behind: start over from a fresh welcome
        p.conn = me = object(); p.gone_at = None
        if not since: push(p, welcome(p))
        sent = [since if since else p.seq - 1]
    def writer():
        while True:
            with LOCK:
                if p.conn is not me or p.id not in players and not any(s > sent[0] for s, _ in p.out): break
                if p.seq <= sent[0]: p.cond.wait(20)
                if p.conn is not me: break
                batch = [txt for s, txt in p.out if s > sent[0]]
                sent[0] = p.seq
            try:
                if batch: send_raw(('[' + ','.join(batch) + ']').encode())
                else: send_raw(b'', 9)  # ping
            except Exception: break
            if p.id not in players: break
        try: sock.shutdown(2)
        except Exception: pass
    threading.Thread(target=writer, daemon=True).start()
    try:
        while True:
            f = ws_read(rfile)
            if not f or f[0] == 8: break
            if f[0] != 1: continue
            try: m = json.loads(f[1])
            except Exception: continue
            for one in (m if isinstance(m, list) else [m])[:50]:
                if isinstance(one, dict):
                    with LOCK:
                        if p.id in players: handle(p, one)
    except Exception: pass
    finally:
        with LOCK:
            if p.conn is me:
                p.conn = None
                p.cond.notify_all()

# ---------------------------------------------------------------- long polling (the fallback)
def poll_hello(hello, ip):
    with LOCK:
        p, err = join(hello, ip)
        if err: return err
        p.polled = time.time(); p.gone_at = None
        w = welcome(p); push(p, w)
        return {'t': 'ok', 'key': p.key, 'q': p.seq, 'welcome': w}
def poll(key, since):
    with LOCK:
        p = by_key.get(key)
        if not p: return None
        p.polled = time.time(); p.gone_at = None
        if p.status == 'away': set_status(p, 'battle' if p.match else '')
        if p.seq <= since: p.cond.wait(20)
        p.polled = time.time()
        if p.id not in players: return None
        return '[' + ','.join(txt for s, txt in p.out if s > since) + ']'
def poll_send(key, msgs):
    with LOCK:
        p = by_key.get(key)
        if not p: return False
        p.polled = time.time()
        for one in msgs[:50]:
            if isinstance(one, dict) and p.id in players: handle(p, one)
        return True
