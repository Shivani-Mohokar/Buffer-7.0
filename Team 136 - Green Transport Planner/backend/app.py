from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime, timedelta
import os
import requests
import hashlib
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='../frontend', static_url_path='')

# Allow requests from:
#   - Same origin (Flask serving the frontend at localhost:5000)
#   - file:// (browser sends Origin: null for direct file opens)
#   - Any localhost port (VS Code Live Server default :5500, etc.)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

# ── Always send CORS headers (handles file:// "null" origin too) ─────────────
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin']  = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    return response

@app.route('/api/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    return '', 204

# ── Config ────────────────────────────────────────────────────────────────────
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET', 'green-secret-key-2024')
TOMTOM_KEY   = os.getenv('TOMTOM_API_KEY', '')
OPENAI_KEY   = os.getenv('OPENAI_API_KEY', '')
MONGO_URI    = os.getenv('MONGO_URI', 'mongodb://localhost:27017/green_transport')

# ── Optional MongoDB (graceful fallback to in-memory if unavailable) ──────────
mongo = None
try:
    from flask_pymongo import PyMongo
    from bson import ObjectId
    app.config['MONGO_URI'] = MONGO_URI
    _mongo = PyMongo(app)
    _mongo.db.list_collection_names()   # ping — raises if not connected
    mongo = _mongo
    print("[DB] MongoDB connected ✓")
except Exception as e:
    print(f"[DB] MongoDB unavailable ({e}). Running in demo/memory mode.")
    mongo = None

# ── Optional JWT ──────────────────────────────────────────────────────────────
jwt = None
try:
    from flask_jwt_extended import (JWTManager, create_access_token,
                                    jwt_required, get_jwt_identity, verify_jwt_in_request)
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)
    jwt = JWTManager(app)
    print("[AUTH] JWT loaded ✓")
except Exception as e:
    print(f"[AUTH] JWT unavailable ({e}).")

# ── Optional OpenAI ───────────────────────────────────────────────────────────
openai_client = None
try:
    from openai import OpenAI
    if OPENAI_KEY:
        openai_client = OpenAI(api_key=OPENAI_KEY)
        print("[AI] OpenAI client ready ✓")
except Exception as e:
    print(f"[AI] OpenAI unavailable ({e}).")

# ── In-memory fallback stores (used when MongoDB is absent) ───────────────────
_mem_users   = {}   # id -> user dict
_mem_trips   = []
_mem_posts   = [
    {'_id': '1', 'author': 'Priya S.', 'avatar': '🌱', 'type': 'tip',
     'content': 'Taking the metro instead of cab saved me Rs.120 and 0.8 kg CO2 today! Small choices add up.',
     'likes': 24, 'created_at': datetime.utcnow().isoformat()},
    {'_id': '2', 'author': 'Rahul M.', 'avatar': '🌿', 'type': 'carpool',
     'content': 'Daily carpool from Pune to Hinjewadi available! 2 seats. DM me for details.',
     'likes': 12, 'created_at': datetime.utcnow().isoformat()},
    {'_id': '3', 'author': 'Ananya K.', 'avatar': '🦋', 'type': 'challenge',
     'content': 'Just completed Day 5 of Cycle Week! Legs hurt but CO2 savings feel amazing.',
     'likes': 47, 'created_at': datetime.utcnow().isoformat()},
]
_mem_leaderboard = [
    {'name': 'Priya S.',  'avatar': '🌱', 'green_points': 1420, 'level': 'Silver'},
    {'name': 'Rahul M.',  'avatar': '🌿', 'green_points': 980,  'level': 'Silver'},
    {'name': 'Ananya K.', 'avatar': '🦋', 'green_points': 750,  'level': 'Silver'},
    {'name': 'Vikram R.', 'avatar': '🐝', 'green_points': 440,  'level': 'Bronze'},
    {'name': 'Neha P.',   'avatar': '🌻', 'green_points': 320,  'level': 'Bronze'},
]
_mem_id_counter = 10

def _new_id():
    global _mem_id_counter
    _mem_id_counter += 1
    return str(_mem_id_counter)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_uid_from_token():
    """Return user id from JWT or None."""
    if jwt is None:
        return None
    try:
        verify_jwt_in_request(optional=True)
        return get_jwt_identity()
    except Exception:
        return None

def _get_user(uid):
    if mongo:
        from bson import ObjectId
        u = mongo.db.users.find_one({'_id': ObjectId(uid)})
        if u:
            u['_id'] = str(u['_id'])
        return u
    return _mem_users.get(str(uid))

def _serialize(obj):
    """JSON-safe serializer for MongoDB docs."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            out[k] = _serialize(v)
        return out
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    try:
        from bson import ObjectId
        if isinstance(obj, ObjectId):
            return str(obj)
    except ImportError:
        pass
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj

def _calc_level(pts):
    if pts >= 5000: return 'Platinum'
    if pts >= 2000: return 'Gold'
    if pts >= 500:  return 'Silver'
    return 'Bronze'

def _make_token(uid):
    """Create JWT or simple base64 fallback."""
    if jwt:
        return create_access_token(identity=str(uid))
    import base64
    payload = f"{uid}:{datetime.utcnow().isoformat()}"
    return base64.b64encode(payload.encode()).decode()

# ── Static pages ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('../frontend', path)

# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json or {}
    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    if not name or not email or not password:
        return jsonify({'error': 'Name, email and password are required'}), 400

    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    user = {
        'name': name, 'email': email, 'password': pw_hash,
        'created_at': datetime.utcnow().isoformat(),
        'green_points': 0, 'level': 'Bronze', 'total_trips': 0,
        'co2_saved': 0.0, 'streak_days': 0, 'badges': [],
        'favorite_mode': 'walking', 'avatar': data.get('avatar', '🌿')
    }

    if mongo:
        from bson import ObjectId
        if mongo.db.users.find_one({'email': email}):
            return jsonify({'error': 'Email already exists'}), 400
        result = mongo.db.users.insert_one(user)
        uid = str(result.inserted_id)
        mongo.db.leaderboard.insert_one(
            {'user_id': uid, 'name': name, 'avatar': user['avatar'],
             'green_points': 0, 'level': 'Bronze'})
    else:
        for u in _mem_users.values():
            if u['email'] == email:
                return jsonify({'error': 'Email already exists'}), 400
        uid = _new_id()
        user['_id'] = uid
        _mem_users[uid] = user

    token = _make_token(uid)
    safe_user = {k: v for k, v in user.items() if k != 'password'}
    safe_user['_id'] = uid
    return jsonify({'token': token, 'user': safe_user}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    email   = data.get('email', '').strip().lower()
    pw_hash = hashlib.sha256(data.get('password', '').encode()).hexdigest()

    if mongo:
        u = mongo.db.users.find_one({'email': email, 'password': pw_hash})
        if not u:
            return jsonify({'error': 'Invalid credentials'}), 401
        uid  = str(u['_id'])
        safe = {k: v for k, v in _serialize(u).items() if k != 'password'}
        safe['_id'] = uid
    else:
        u = next((v for v in _mem_users.values()
                  if v['email'] == email and v['password'] == pw_hash), None)
        if not u:
            return jsonify({'error': 'Invalid credentials'}), 401
        uid  = u['_id']
        safe = {k: v for k, v in u.items() if k != 'password'}

    token = _make_token(uid)
    return jsonify({'token': token, 'user': safe})

@app.route('/api/auth/me', methods=['GET'])
def me():
    uid = _get_uid_from_token()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    user = _get_user(uid)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({k: v for k, v in user.items() if k != 'password'})

# ── Location ──────────────────────────────────────────────────────────────────

@app.route('/api/get-location', methods=['GET'])
def get_location():
    """IP-based location fallback."""
    try:
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        ip = ip.split(',')[0].strip().split(':')[0]
        resp = requests.get(f'http://ip-api.com/json/{ip}', timeout=5)
        d = resp.json()
        if d.get('status') == 'success':
            return jsonify({
                'lat': d['lat'], 'lon': d['lon'],
                'city': d.get('city', ''), 'country': d.get('country', ''),
                'method': 'ip'
            })
    except Exception as e:
        print(f"[LOC] IP lookup failed: {e}")
    # Fallback: Pune, India
    return jsonify({'lat': 18.5204, 'lon': 73.8567,
                    'city': 'Pune', 'country': 'India', 'method': 'default'})

# ── Route calculation helpers ─────────────────────────────────────────────────

def calc_co2(distance_km, mode):
    factors = {'driving': 120, 'cycling': 0, 'walking': 0, 'transit': 22, 'electric': 18}
    return round(distance_km * factors.get(mode, 120) / 1000, 3)

def calc_cost(distance_km, mode):
    rates = {'driving': 8, 'cycling': 0, 'walking': 0, 'transit': 2, 'electric': 2.5}
    return round(distance_km * rates.get(mode, 8) / 10, 2)

def calc_green_points(mode, distance_km):
    base = {'walking': 15, 'cycling': 12, 'transit': 8, 'electric': 6, 'driving': 1}
    return int(base.get(mode, 1) * min(distance_km, 50))

def geocode_address(address):
    """Geocode address via TomTom. Returns (lat, lon)."""
    quoted = requests.utils.quote(address)
    url = (f"https://api.tomtom.com/search/2/geocode/{quoted}.json"
           f"?key={TOMTOM_KEY}&limit=1")
    resp = requests.get(url, timeout=8)
    resp.raise_for_status()
    results = resp.json().get('results', [])
    if not results:
        raise ValueError(f"No results for '{address}'")
    pos = results[0]['position']
    return pos['lat'], pos['lon']

# ── Routing ───────────────────────────────────────────────────────────────────

@app.route('/api/route', methods=['POST'])
def get_route():
    data = request.json or {}
    src  = data.get('source')
    dst  = data.get('destination')

    # ── Normalise source ──────────────────────────────────────────────────────
    if isinstance(src, str):
        parts = src.replace(' ', '').split(',')
        if len(parts) == 2:
            try:
                src = {'lat': float(parts[0]), 'lon': float(parts[1])}
            except ValueError:
                if TOMTOM_KEY:
                    try:
                        lat, lon = geocode_address(src)
                        src = {'lat': lat, 'lon': lon}
                    except Exception as e:
                        return jsonify({'error': f'Could not geocode source: {e}'}), 400
                else:
                    src = {'lat': 18.5204, 'lon': 73.8567}

    if not src or not isinstance(src, dict) or 'lat' not in src:
        return jsonify({'error': 'Invalid or missing source coordinates'}), 400

    # ── Normalise destination ─────────────────────────────────────────────────
    dst_address = dst if isinstance(dst, str) else (dst.get('address', '') if dst else '')

    if isinstance(dst, str):
        if TOMTOM_KEY:
            try:
                lat, lon = geocode_address(dst)
                dst = {'lat': lat, 'lon': lon, 'address': dst_address}
            except Exception as e:
                return jsonify({'error': f'Could not geocode destination "{dst_address}": {e}'}), 400
        else:
            # Demo offset
            dst = {'lat': src['lat'] + 0.05, 'lon': src['lon'] + 0.07, 'address': dst_address}

    if not dst or not isinstance(dst, dict) or 'lat' not in dst:
        return jsonify({'error': 'Invalid or missing destination'}), 400

    # ── Travel mode definitions ───────────────────────────────────────────────
    travel_modes = [
        {'mode': 'bicycle', 'eco_mode': 'cycling',  'label': 'Greenest Route', 'color': '#22c55e', 'icon': '🚲'},
        {'mode': 'car',     'eco_mode': 'transit',  'label': 'Transit Route',  'color': '#38bdf8', 'icon': '🚌'},
        {'mode': 'car',     'eco_mode': 'driving',  'label': 'Fastest Route',  'color': '#ef4444', 'icon': '🚗'},
    ]

    routes = []

    if not TOMTOM_KEY:
        # ── Demo mode ─────────────────────────────────────────────────────────
        import math
        dist_km = round(
            math.sqrt((dst['lat'] - src['lat'])**2 + (dst['lon'] - src['lon'])**2) * 111, 1)
        dist_km = max(dist_km, 1.5)
        for tm in travel_modes:
            speed = {'cycling': 15, 'transit': 30, 'driving': 50}[tm['eco_mode']]
            eta   = int(dist_km / speed * 60)
            routes.append({
                'label': tm['label'], 'icon': tm['icon'], 'color': tm['color'],
                'distance_km': dist_km, 'eta_minutes': eta,
                'co2_kg': calc_co2(dist_km, tm['eco_mode']),
                'cost_inr': calc_cost(dist_km, tm['eco_mode']),
                'green_points': calc_green_points(tm['eco_mode'], dist_km),
                'traffic': 0,
                'points': [[src['lat'], src['lon']], [dst['lat'], dst['lon']]],
                'demo': True
            })
        return jsonify({'routes': routes, 'destination': dst, 'demo': True})

    # ── Live TomTom ───────────────────────────────────────────────────────────
    for tm in travel_modes:
        url = (f"https://api.tomtom.com/routing/1/calculateRoute/"
               f"{src['lat']},{src['lon']}:{dst['lat']},{dst['lon']}/json"
               f"?key={TOMTOM_KEY}&travelMode={tm['mode']}&traffic=true")
        try:
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            rdata   = resp.json()
            summary = rdata['routes'][0]['summary']
            leg     = rdata['routes'][0]['legs'][0]
            dist_km = summary['lengthInMeters'] / 1000
            eta_min = summary['travelTimeInSeconds'] // 60
            routes.append({
                'label': tm['label'], 'icon': tm['icon'], 'color': tm['color'],
                'distance_km': round(dist_km, 2), 'eta_minutes': eta_min,
                'co2_kg': calc_co2(dist_km, tm['eco_mode']),
                'cost_inr': calc_cost(dist_km, tm['eco_mode']),
                'green_points': calc_green_points(tm['eco_mode'], dist_km),
                'traffic': summary.get('trafficDelayInSeconds', 0) // 60,
                'points': [[p['latitude'], p['longitude']] for p in leg['points'][::5]]
            })
        except Exception as e:
            print(f"[ROUTE] TomTom error for {tm['label']}: {e}")
            routes.append({
                'label': tm['label'], 'icon': tm['icon'], 'color': tm['color'],
                'error': 'Route unavailable', 'distance_km': 0, 'eta_minutes': 0,
                'co2_kg': 0, 'cost_inr': 0, 'green_points': 0, 'traffic': 0, 'points': []
            })

    return jsonify({'routes': routes, 'destination': dst})

# ── Save Trip ─────────────────────────────────────────────────────────────────

@app.route('/api/save-trip', methods=['POST'])
def save_trip():
    uid = _get_uid_from_token()
    if not uid:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.json or {}
    trip = {
        'user_id': uid,
        'source': data.get('source', ''),
        'destination': data.get('destination', ''),
        'mode': data.get('mode', 'driving'),
        'distance_km': data.get('distance_km', 0),
        'co2_saved': data.get('co2_saved', 0),
        'green_points': data.get('green_points', 0),
        'created_at': datetime.utcnow().isoformat()
    }

    if mongo:
        from bson import ObjectId
        mongo.db.trips.insert_one(trip)
        pts = trip['green_points']
        mongo.db.users.update_one({'_id': ObjectId(uid)}, {
            '$inc': {'green_points': pts, 'total_trips': 1, 'co2_saved': trip['co2_saved']},
            '$set': {'last_trip': datetime.utcnow()}
        })
        user = _get_user(uid)
        total_pts = user['green_points']
        level = _calc_level(total_pts)
        mongo.db.users.update_one({'_id': ObjectId(uid)}, {'$set': {'level': level}})
        mongo.db.leaderboard.update_one(
            {'user_id': uid}, {'$set': {'green_points': total_pts, 'level': level}})
    else:
        _mem_trips.append(trip)
        if uid in _mem_users:
            u = _mem_users[uid]
            u['green_points'] = u.get('green_points', 0) + trip['green_points']
            u['total_trips']  = u.get('total_trips', 0) + 1
            u['co2_saved']    = u.get('co2_saved', 0.0) + trip['co2_saved']
            u['level'] = _calc_level(u['green_points'])
        total_pts = _mem_users.get(uid, {}).get('green_points', 0)
        level = _calc_level(total_pts)

    return jsonify({'success': True, 'points_earned': trip['green_points'], 'level': level})

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    uid = _get_uid_from_token()
    if not uid:
        return jsonify({'error': 'Authentication required'}), 401
    user = _get_user(uid)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if mongo:
        trips = [_serialize(t) for t in
                 mongo.db.trips.find({'user_id': uid}).sort('created_at', -1).limit(50)]
    else:
        trips = sorted([t for t in _mem_trips if t.get('user_id') == uid],
                       key=lambda x: x.get('created_at', ''), reverse=True)[:50]

    mode_counts = {}
    for t in trips:
        m = t.get('mode', 'unknown')
        mode_counts[m] = mode_counts.get(m, 0) + 1
    fav_mode = max(mode_counts, key=mode_counts.get) if mode_counts else 'cycling'

    weekly_co2 = [0] * 7
    for t in trips:
        try:
            created = datetime.fromisoformat(t['created_at']) if isinstance(t['created_at'], str) else t['created_at']
            day_idx = (datetime.utcnow() - created).days
            if 0 <= day_idx < 7:
                weekly_co2[6 - day_idx] += t.get('co2_saved', 0)
        except Exception:
            pass

    return jsonify({
        'user': {k: v for k, v in user.items() if k != 'password'},
        'stats': {
            'total_trips':   user.get('total_trips', 0),
            'co2_saved':     round(user.get('co2_saved', 0), 2),
            'green_points':  user.get('green_points', 0),
            'level':         user.get('level', 'Bronze'),
            'badges':        user.get('badges', []),
            'favorite_mode': fav_mode,
            'streak_days':   user.get('streak_days', 0),
        },
        'weekly_co2':   weekly_co2,
        'recent_trips': trips[:10]
    })

# ── Community ─────────────────────────────────────────────────────────────────

@app.route('/api/community', methods=['GET'])
def get_community():
    if mongo:
        posts = list(mongo.db.community_posts.find().sort('created_at', -1).limit(20))
        return jsonify({'posts': [_serialize(p) for p in posts]})
    return jsonify({'posts': list(reversed(_mem_posts))})

@app.route('/api/community', methods=['POST'])
def post_community():
    uid = _get_uid_from_token()
    if not uid:
        return jsonify({'error': 'Login required'}), 401
    user = _get_user(uid)
    data = request.json or {}
    post = {
        'user_id': uid,
        'author': user['name'] if user else 'User',
        'avatar': user.get('avatar', '🌿') if user else '🌿',
        'type': data.get('type', 'tip'),
        'content': data.get('content', ''),
        'likes': 0,
        'created_at': datetime.utcnow().isoformat()
    }
    if mongo:
        result = mongo.db.community_posts.insert_one(post)
        return jsonify({'success': True, '_id': str(result.inserted_id)})
    post['_id'] = _new_id()
    _mem_posts.append(post)
    return jsonify({'success': True, '_id': post['_id']})

@app.route('/api/community/like/<post_id>', methods=['POST'])
def like_post(post_id):
    if mongo:
        from bson import ObjectId
        try:
            mongo.db.community_posts.update_one(
                {'_id': ObjectId(post_id)}, {'$inc': {'likes': 1}})
        except Exception:
            pass
    else:
        for p in _mem_posts:
            if str(p['_id']) == post_id:
                p['likes'] = p.get('likes', 0) + 1
    return jsonify({'success': True})

# ── Leaderboard ───────────────────────────────────────────────────────────────

@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    if mongo:
        board = list(mongo.db.leaderboard.find().sort('green_points', -1).limit(10))
        return jsonify({'leaderboard': [_serialize(b) for b in board]})
    return jsonify({'leaderboard': sorted(_mem_leaderboard,
                    key=lambda x: x['green_points'], reverse=True)[:10]})

# ── Rewards ───────────────────────────────────────────────────────────────────

REWARDS_CATALOG = [
    {'id': 'r1', 'title': '10% off Metro Pass',      'points': 200, 'icon': '🚇', 'category': 'transit'},
    {'id': 'r2', 'title': 'Free EV Charging 30 min', 'points': 350, 'icon': '⚡', 'category': 'ev'},
    {'id': 'r3', 'title': 'Cycle Rental 1 Day Free', 'points': 150, 'icon': '🚲', 'category': 'cycle'},
    {'id': 'r4', 'title': 'Plant a Tree',             'points': 100, 'icon': '🌳', 'category': 'eco'},
    {'id': 'r5', 'title': 'Green Coffee Voucher',     'points': 80,  'icon': '☕', 'category': 'food'},
    {'id': 'r6', 'title': 'Eco Store Rs.500 Off',     'points': 500, 'icon': '🛍️', 'category': 'shopping'},
]

@app.route('/api/rewards', methods=['GET'])
def get_rewards():
    uid = _get_uid_from_token()
    user_pts = 0
    redeemed = []
    if uid:
        user = _get_user(uid)
        if user:
            user_pts = user.get('green_points', 0)
        if mongo:
            r = list(mongo.db.rewards.find({'user_id': uid}))
            redeemed = [_serialize(x) for x in r]
    return jsonify({'catalog': REWARDS_CATALOG, 'user_points': user_pts, 'redeemed': redeemed})

@app.route('/api/rewards/redeem', methods=['POST'])
def redeem_reward():
    uid = _get_uid_from_token()
    if not uid:
        return jsonify({'error': 'Authentication required'}), 401
    data   = request.json or {}
    reward = next((r for r in REWARDS_CATALOG if r['id'] == data.get('reward_id')), None)
    if not reward:
        return jsonify({'error': 'Reward not found'}), 404
    user = _get_user(uid)
    if not user or user.get('green_points', 0) < reward['points']:
        return jsonify({'error': 'Insufficient points'}), 400
    if mongo:
        from bson import ObjectId
        mongo.db.users.update_one(
            {'_id': ObjectId(uid)}, {'$inc': {'green_points': -reward['points']}})
        mongo.db.rewards.insert_one(
            {'user_id': uid, 'reward': reward, 'redeemed_at': datetime.utcnow()})
    else:
        _mem_users[uid]['green_points'] -= reward['points']
    return jsonify({'success': True, 'reward': reward})

# ── Chat ──────────────────────────────────────────────────────────────────────

def _fallback_reply(msg):
    ml = msg.lower()
    if any(w in ml for w in ['route', 'direction', 'path', 'go to', 'get to', 'how to reach']):
        return "🗺️ Use the Routes tab to find the greenest path! I can compare cycling, transit, and driving options with real CO2 data."
    if any(w in ml for w in ['co2', 'carbon', 'emission', 'environment', 'pollution']):
        return "🌱 Cycling saves ~120g CO2 per km vs driving. Even switching to public transit cuts emissions by up to 70%!"
    if any(w in ml for w in ['ev', 'electric', 'charge', 'charging', 'station']):
        return "⚡ Check the Live Map tab for nearby EV charging stations. EVs produce only ~18g CO2/km vs 120g for petrol cars!"
    if any(w in ml for w in ['point', 'reward', 'badge', 'earn', 'redeem']):
        return "🏆 Earn green points by choosing eco routes! Cycling = 12pts/km, Transit = 8pts/km. Redeem in the Rewards tab."
    if any(w in ml for w in ['bus', 'metro', 'train', 'transit', 'public']):
        return "🚌 Public transport is a great green choice! It reduces per-person CO2 emissions by up to 70% compared to solo driving."
    if any(w in ml for w in ['cycle', 'bike', 'bicycle', 'cycling']):
        return "🚲 Cycling is the greenest commute option — zero CO2 emissions! Even short cycling trips can earn you 12 pts/km."
    return "🌿 Hi! I'm GreenBot. Ask me about eco-friendly routes, CO2 savings, EV stations, or green rewards!"

@app.route('/api/chat', methods=['POST'])
def chat():
    data    = request.json or {}
    message = data.get('message', '')
    history = data.get('history', [])

    system_prompt = (
        "You are GreenBot, an AI assistant for the Green Transport Planner app. "
        "Help users with eco-friendly routes, carbon reduction tips, public transport, "
        "EVs, cycling, and sustainable living. Keep replies concise and friendly. "
        "Use emojis and always encourage green choices."
    )

    if openai_client:
        messages = [{'role': 'system', 'content': system_prompt}]
        for h in history[-10:]:
            messages.append({'role': h['role'], 'content': h['content']})
        messages.append({'role': 'user', 'content': message})
        try:
            response = openai_client.chat.completions.create(
                model='gpt-3.5-turbo', messages=messages,
                max_tokens=300, temperature=0.7)
            reply = response.choices[0].message.content
        except Exception as e:
            print(f"[CHAT] OpenAI error: {e}")
            reply = _fallback_reply(message)
    else:
        reply = _fallback_reply(message)

    uid = _get_uid_from_token()
    if uid and mongo:
        mongo.db.chat_history.insert_one({
            'user_id': uid, 'user_message': message,
            'bot_reply': reply, 'created_at': datetime.utcnow()})

    return jsonify({'reply': reply})

# ── Nearby Places ─────────────────────────────────────────────────────────────

@app.route('/api/nearby', methods=['GET'])
def nearby():
    lat      = request.args.get('lat')
    lon      = request.args.get('lon')
    category = request.args.get('category', 'EV_STATION')

    if not lat or not lon or not TOMTOM_KEY:
        return jsonify({'places': []})

    url = (f"https://api.tomtom.com/search/2/nearbySearch/.json"
           f"?key={TOMTOM_KEY}&lat={lat}&lon={lon}"
           f"&radius=2000&categorySet={category}&limit=5")
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        results = resp.json().get('results', [])
        places = [{
            'name':     r['poi']['name'],
            'lat':      r['position']['lat'],
            'lon':      r['position']['lon'],
            'address':  r.get('address', {}).get('freeformAddress', ''),
            'distance': r.get('dist', 0)
        } for r in results if 'poi' in r and 'position' in r]
        return jsonify({'places': places})
    except Exception as e:
        print(f"[NEARBY] Error: {e}")
        return jsonify({'places': []})

# ── Admin Stats ───────────────────────────────────────────────────────────────

@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    if mongo:
        total_users = mongo.db.users.count_documents({})
        total_trips = mongo.db.trips.count_documents({})
        pipeline    = [{'$group': {'_id': None, 'total': {'$sum': '$co2_saved'}}}]
        co2_result  = list(mongo.db.trips.aggregate(pipeline))
        total_co2   = co2_result[0]['total'] if co2_result else 0
        recent      = list(mongo.db.users.find({}, {'password': 0})
                           .sort('created_at', -1).limit(5))
        recent_users = [_serialize(u) for u in recent]
    else:
        total_users  = len(_mem_users)
        total_trips  = len(_mem_trips)
        total_co2    = sum(t.get('co2_saved', 0) for t in _mem_trips)
        recent_users = []

    return jsonify({
        'total_users':     total_users,
        'total_trips':     total_trips,
        'total_co2_saved': round(total_co2, 2),
        'recent_users':    recent_users
    })

# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"\n🌿 Green Transport Planner — http://localhost:{port}")
    print(f"   TomTom API  : {'OK' if TOMTOM_KEY else 'MISSING (demo mode active)'}")
    print(f"   OpenAI API  : {'OK' if OPENAI_KEY else 'MISSING (smart fallback replies)'}")
    print(f"   MongoDB     : {'connected' if mongo else 'UNAVAILABLE (in-memory mode)'}\n")
    app.run(debug=True, port=port, host='0.0.0.0')
