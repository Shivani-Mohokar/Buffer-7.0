// ═══════════════════════════════════════════════════════════
// GREEN TRANSPORT PLANNER — Main Application JS
// Fixed version: all known bugs resolved
// ═══════════════════════════════════════════════════════════

// Auto-detect backend URL.
// - If served by Flask (http://localhost:5000) → API = '' (same origin)
// - If opened as file:// directly → API = 'http://localhost:5000'
const API = (location.protocol === 'file:' || !location.port || location.port === '80' || location.port === '443')
  ? 'http://localhost:5000'
  : '';

let TOKEN = localStorage.getItem('gtp_token');
let USER  = JSON.parse(localStorage.getItem('gtp_user') || 'null');
let liveMap = null, routeMap = null;
let userMarker = null, userLat = null, userLon = null;
let chatHistory = [];
let selectedAvatar = '🌿';
let selectedPostType = 'tip';
let weeklyChart = null, modeChart = null;

// ── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  createParticles();
  setupNavLinks();
  updateNavUser();
  requestLocationOnLoad();
  showPage('home');
  scheduleNotifications();
  loadAdminStats();
});

// ── Particles ─────────────────────────────────────────────────────────────────
function createParticles() {
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const left  = Math.random() * 100;
    const drift = (Math.random() - 0.5) * 120;
    const d     = 6 + Math.random() * 12;
    const delay = Math.random() * 10;
    p.style.cssText = `left:${left}%;--d:${d}s;--delay:${delay}s;--drift:${drift}px;opacity:0`;
    c.appendChild(p);
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function setupNavLinks() {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      showPage(a.dataset.page);
      const nl = document.getElementById('navLinks');
      if (nl) nl.classList.remove('open');
    });
  });
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  if (pageId === 'map'       && !liveMap) setTimeout(initLiveMap, 200);
  if (pageId === 'dashboard') loadDashboard();
  if (pageId === 'rewards')   loadRewards();
  if (pageId === 'community') loadCommunity();
}

function toggleNav() {
  const nl = document.getElementById('navLinks');
  if (nl) nl.classList.toggle('open');
}

function updateNavUser() {
  const menu = document.getElementById('userMenu');
  if (!menu) return;
  if (USER) {
    menu.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="showPage('dashboard')">
        <span style="font-size:1.4rem">${USER.avatar || '🌿'}</span>
        <span style="font-size:0.85rem;color:var(--green-light)">${(USER.name || '').split(' ')[0]}</span>
      </div>
      <button class="auth-btn" onclick="logout()" style="font-size:0.78rem;padding:6px 12px">Logout</button>`;
  } else {
    menu.innerHTML = `<button class="auth-btn" onclick="showPage('login')">Login</button>`;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.getElementById('loginTab').classList.toggle('active', tab === 'login');
  document.getElementById('registerTab').classList.toggle('active', tab === 'register');
  document.getElementById('loginForm').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? '' : 'none';
}

function selectAvatar(av) {
  selectedAvatar = av;
  document.querySelectorAll('.av-opt').forEach(o =>
    o.classList.toggle('active', o.textContent.trim() === av));
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pwd   = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password: pwd})
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Login failed'; return; }
    saveSession(data);
    showToast('Welcome back, ' + data.user.name + '! 🌿');
    showPage('home');
  } catch (e) {
    console.error('Login error:', e);
    errEl.textContent = '❌ Cannot reach backend. Is it running? Open terminal → cd backend → python app.py';
  }
}

async function doRegister() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pwd   = document.getElementById('regPassword').value;
  const errEl = document.getElementById('regError');
  errEl.textContent = '';
  try {
    const res  = await fetch(`${API}/api/auth/register`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name, email, password: pwd, avatar: selectedAvatar})
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Registration failed'; return; }
    saveSession(data);
    showToast('Welcome to GreenMove, ' + name + '! 🌿');
    pushNotif('🎉 Account Created', 'Start planning eco routes to earn green points!', 'success');
    showPage('dashboard');
  } catch (e) {
    console.error('Register error:', e);
    errEl.textContent = '❌ Cannot reach backend. Is it running? Open terminal → cd backend → python app.py';
  }
}

function saveSession(data) {
  TOKEN = data.token;
  USER  = data.user;
  localStorage.setItem('gtp_token', TOKEN);
  localStorage.setItem('gtp_user', JSON.stringify(USER));
  updateNavUser();
}

function logout() {
  TOKEN = null; USER = null;
  localStorage.removeItem('gtp_token');
  localStorage.removeItem('gtp_user');
  updateNavUser();
  showPage('home');
  showToast('Logged out. See you soon! 👋');
}

function authHeaders() {
  return {'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}`};
}

// ── Geolocation ───────────────────────────────────────────────────────────────
function requestLocationOnLoad() {
  if (!navigator.geolocation) {
    setLocationStatus('GPS not supported — enter location manually', false);
    fallbackIPLocation();
    return;
  }
  setLocationStatus('Requesting GPS permission...', true);
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      const coordStr = `${userLat.toFixed(5)}, ${userLon.toFixed(5)}`;
      setLocationStatus(`📍 ${userLat.toFixed(4)}, ${userLon.toFixed(4)}`, false);
      const src = document.getElementById('sourceInput');
      if (src) src.value = coordStr;
      const llt = document.getElementById('liveLocText');
      if (llt) llt.textContent = `${userLat.toFixed(4)}, ${userLon.toFixed(4)}`;
    },
    err => {
      console.warn('Geolocation denied/failed:', err.message);
      setLocationStatus('Location denied — enter address manually or use 🎯', false);
      const src = document.getElementById('sourceInput');
      if (src) src.placeholder = 'Enter your starting address...';
      fallbackIPLocation();
    },
    {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000}
  );
}

async function fallbackIPLocation() {
  try {
    const res  = await fetch(`${API}/api/get-location`);
    const data = await res.json();
    if (data.lat) {
      userLat = data.lat;
      userLon = data.lon;
      const src = document.getElementById('sourceInput');
      if (src && !src.value) src.placeholder = `${data.city}, ${data.country} (detected)`;
      const llt = document.getElementById('liveLocText');
      if (llt) llt.textContent = `${data.city}, ${data.country}`;
      setLocationStatus(`📡 ${data.city}, ${data.country} (IP)`, false);
    }
  } catch (e) {
    console.warn('IP fallback failed:', e);
  }
}

function getCurrentLocation() {
  if (!navigator.geolocation) { showToast('GPS not supported on this device'); return; }
  setLocationStatus('Getting GPS...', true);
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      const coordStr = `${userLat.toFixed(5)}, ${userLon.toFixed(5)}`;
      const src = document.getElementById('sourceInput');
      if (src) src.value = coordStr;
      setLocationStatus('📍 Location updated!', false);
      showToast('📍 GPS location captured!');
    },
    err => {
      setLocationStatus('Could not get GPS — enter manually', false);
      showToast('GPS failed. Please enter your location manually.');
    },
    {enableHighAccuracy: true, timeout: 8000}
  );
}

function setLocationStatus(msg, loading) {
  const text = document.getElementById('statusText');
  const dot  = document.querySelector('.status-dot');
  if (text) text.textContent = msg;
  if (dot)  dot.style.background = loading ? '#fbbf24' : '#22c55e';
}

// ── Route Search ──────────────────────────────────────────────────────────────
async function searchRoutes() {
  const destInput = document.getElementById('destInput');
  const srcInput  = document.getElementById('sourceInput');
  const dest = destInput ? destInput.value.trim() : '';

  if (!dest) {
    showToast('Please enter a destination 📍');
    return;
  }

  // Resolve source: prefer GPS coords; fall back to typed address
  let sourcePayload;
  if (userLat !== null && userLon !== null) {
    sourcePayload = {lat: userLat, lon: userLon};
  } else if (srcInput && srcInput.value.trim()) {
    sourcePayload = srcInput.value.trim();   // backend will geocode
  } else {
    showToast('📍 Location unavailable. Enter your starting address in the source field.');
    if (srcInput) srcInput.focus();
    return;
  }

  const btn = document.querySelector('.search-route-btn');
  if (btn) { btn.innerHTML = '<span>⏳ Finding Routes...</span>'; btn.disabled = true; }

  const resultEl = document.getElementById('routesResult');
  if (resultEl) resultEl.innerHTML = '<div class="loading">🌿 Calculating eco routes...</div>';

  try {
    const res  = await fetch(`${API}/api/route`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({source: sourcePayload, destination: dest})
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error || 'Route lookup failed';
      if (resultEl) resultEl.innerHTML = `<div class="loading">❌ ${msg}</div>`;
      renderDemoRoutes(dest);
    } else {
      renderRoutes(data.routes, data.destination);
      if (data.demo) showToast('Demo routes shown — add TomTom API key for live data');
    }
  } catch (err) {
    console.error('Route fetch error:', err);
    renderDemoRoutes(dest);
  } finally {
    if (btn) { btn.innerHTML = '<span>🔍 Find Eco Routes</span>'; btn.disabled = false; }
  }
}

function renderDemoRoutes(dest) {
  const destAddr = dest || 'Destination';
  const demoRoutes = [
    {label: 'Greenest Route', icon: '🚲', color: '#22c55e',
     distance_km: 8.2, eta_minutes: 35, co2_kg: 0,    cost_inr: 0,   green_points: 98, traffic: 0},
    {label: 'Transit Route',  icon: '🚌', color: '#38bdf8',
     distance_km: 7.5, eta_minutes: 28, co2_kg: 0.17, cost_inr: 1.5, green_points: 60, traffic: 3},
    {label: 'Fastest Route',  icon: '🚗', color: '#ef4444',
     distance_km: 6.5, eta_minutes: 18, co2_kg: 0.78, cost_inr: 5.2, green_points: 6,  traffic: 5},
  ];
  renderRoutes(demoRoutes, {address: destAddr});
  showToast('Demo data shown — add your TomTom API key in .env for live routes');
}

/**
 * FIX: was using undefined `dest` variable inside this function.
 * Now `destination` is always the object passed in; address is safely read from it.
 */
function renderRoutes(routes, destination) {
  const container = document.getElementById('routesResult');
  if (!container) return;
  container.innerHTML = '';

  // Safe address string
  const destAddr = (destination && (destination.address || '')) || 'Destination';

  routes.forEach((r, i) => {
    const recommended = i === 0;
    const card = document.createElement('div');
    card.className = 'route-card' + (recommended ? ' recommended' : '');
    // Safely encode route object for onclick — avoid inline JSON issues
    const routeId = 'route_' + i;
    window[routeId] = r;  // store on window to avoid JSON serialisation issues in onclick
    card.innerHTML = `
      <div class="route-card-header">
        <span class="route-icon">${r.icon}</span>
        <span class="route-label-text" style="color:${r.color}">${r.label}</span>
        ${recommended ? '<span class="route-rec-badge">✨ Recommended</span>' : ''}
        ${r.demo ? '<span style="font-size:0.65rem;color:#fbbf24;margin-left:auto">demo</span>' : ''}
      </div>
      <div class="route-metrics">
        <div class="metric"><div class="metric-val">${r.distance_km} km</div><div class="metric-lbl">Distance</div></div>
        <div class="metric"><div class="metric-val">${r.eta_minutes} min</div><div class="metric-lbl">ETA</div></div>
        <div class="metric"><div class="metric-val" style="color:${r.co2_kg === 0 ? '#22c55e' : '#f87171'}">${r.co2_kg} kg</div><div class="metric-lbl">CO₂</div></div>
        <div class="metric"><div class="metric-val" style="color:#fbbf24">₹${r.cost_inr}</div><div class="metric-lbl">Cost</div></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:16px;font-size:0.78rem;color:var(--text-muted)">
        <span>⭐ +${r.green_points} pts</span>
        <span>🚦 +${r.traffic} min delay</span>
      </div>
      <button class="select-route-btn" onclick="selectRoute(window['${routeId}'], '${destAddr.replace(/'/g, "\\'")}')">
        Select This Route →
      </button>`;
    container.appendChild(card);
  });

  // Draw route on map if points available
  const firstWithPoints = routes.find(r => r.points && r.points.length > 1);
  if (firstWithPoints) drawRouteOnMap(firstWithPoints.points);
}

async function selectRoute(route, destAddr) {
  showToast(`${route.icon} ${route.label} selected! +${route.green_points} pts`);
  if (TOKEN) {
    try {
      await fetch(`${API}/api/save-trip`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          source: userLat ? `${userLat},${userLon}` : 'unknown',
          destination: destAddr,
          mode: route.label.toLowerCase().includes('green') || route.label.toLowerCase().includes('cycl')
                  ? 'cycling'
                  : route.label.toLowerCase().includes('transit')
                    ? 'transit' : 'driving',
          distance_km:  route.distance_km,
          co2_saved:    route.co2_kg,
          green_points: route.green_points
        })
      });
      pushNotif('🏆 Points Earned', `+${route.green_points} green points added!`);
    } catch (e) {
      console.warn('Save trip failed:', e);
    }
  }
}

// ── Route Map ──────────────────────────────────────────────────────────────────
function drawRouteOnMap(points) {
  const mapContainer = document.getElementById('routeMapContainer');
  if (!mapContainer || points.length < 2) return;
  mapContainer.style.display = '';

  if (!routeMap) {
    routeMap = L.map('routeMap').setView(points[0], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '©OpenStreetMap ©CARTO', maxZoom: 19
    }).addTo(routeMap);
  }

  // Clear old layers
  routeMap.eachLayer(l => { if (l instanceof L.Polyline) routeMap.removeLayer(l); });

  const line = L.polyline(points, {color: '#22c55e', weight: 4, opacity: 0.8}).addTo(routeMap);
  routeMap.fitBounds(line.getBounds(), {padding: [30, 30]});
}

// ── Live Map ──────────────────────────────────────────────────────────────────
function initLiveMap() {
  if (liveMap) return;

  const centre = userLat ? [userLat, userLon] : [18.5204, 73.8567];
  liveMap = L.map('liveMap', {zoomControl: true}).setView(centre, userLat ? 14 : 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OpenStreetMap ©CARTO', maxZoom: 19
  }).addTo(liveMap);

  if (userLat) {
    addUserMarker(userLat, userLon);
    fetchNearbyPlaces(userLat, userLon, 'EV_STATION');
    updateTrafficInfo();
    updateNearestEV(userLat, userLon);
  } else {
    navigator.geolocation?.getCurrentPosition(pos => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      liveMap.setView([userLat, userLon], 14);
      addUserMarker(userLat, userLon);
      fetchNearbyPlaces(userLat, userLon, 'EV_STATION');
      updateTrafficInfo();
      updateNearestEV(userLat, userLon);
    });
  }

  // Live position tracking
  navigator.geolocation?.watchPosition(pos => {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    if (userMarker) userMarker.setLatLng([userLat, userLon]);
    const llt = document.getElementById('liveLocText');
    if (llt) llt.textContent = `${userLat.toFixed(4)}, ${userLon.toFixed(4)}`;
  }, null, {enableHighAccuracy: true});
}

function addUserMarker(lat, lon) {
  const icon = L.divIcon({
    html: `<div style="background:#22c55e;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(34,197,94,0.7)"></div>`,
    className: '', iconAnchor: [8, 8]
  });
  userMarker = L.marker([lat, lon], {icon}).addTo(liveMap);
  userMarker.bindPopup('📍 You are here');
}

function centerOnUser() {
  if (liveMap && userLat) liveMap.setView([userLat, userLon], 15);
}

/**
 * FIX: was using `event.target` without receiving `event` as a parameter.
 * Now accepts the click event explicitly.
 */
function filterNearby(category, btn) {
  // `btn` is the clicked button element passed from HTML onclick
  document.querySelectorAll('.map-ctrl-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (!userLat) { showToast('Location not available — waiting for GPS'); return; }
  if (!liveMap) return;
  // Remove non-user markers
  liveMap.eachLayer(l => {
    if (l instanceof L.Marker && l !== userMarker) liveMap.removeLayer(l);
  });
  fetchNearbyPlaces(userLat, userLon, category);
}

async function fetchNearbyPlaces(lat, lon, category) {
  try {
    const res  = await fetch(`${API}/api/nearby?lat=${lat}&lon=${lon}&category=${category}`);
    const data = await res.json();
    const icons = {EV_STATION: '⚡', BUS_STOP: '🚌', METRO_STATION: '🚇', BICYCLE_RENTAL: '🚲'};
    const emoji = icons[category] || '📍';
    (data.places || []).forEach(p => {
      const icon = L.divIcon({
        html: `<div style="background:var(--bg-card,#0a1a0c);border:2px solid #22c55e;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:1rem">${emoji}</div>`,
        className: '', iconAnchor: [16, 16]
      });
      L.marker([p.lat, p.lon], {icon}).addTo(liveMap)
        .bindPopup(`<strong>${emoji} ${p.name}</strong><br>${p.address}<br><small>${Math.round(p.distance)}m away</small>`);
    });
  } catch (e) {
    console.warn('Nearby fetch failed:', e);
  }
}

function updateTrafficInfo() {
  const statuses = ['Light 🟢', 'Moderate 🟡', 'Heavy 🔴', 'Smooth 🟢'];
  const el = document.getElementById('liveTrafficText');
  if (el) el.textContent = statuses[Math.floor(Math.random() * 4)];
}

async function updateNearestEV(lat, lon) {
  const el = document.getElementById('nearestEV');
  if (!el) return;
  try {
    const res  = await fetch(`${API}/api/nearby?lat=${lat}&lon=${lon}&category=EV_STATION`);
    const data = await res.json();
    if (data.places && data.places.length > 0) {
      el.textContent = `${data.places[0].name} (${Math.round(data.places[0].distance)}m)`;
    } else {
      el.textContent = 'None nearby';
    }
  } catch (e) {
    el.textContent = 'Unavailable';
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (!TOKEN) {
    document.getElementById('dashAuthGuard').style.display = '';
    document.getElementById('dashContent').style.display   = 'none';
    return;
  }
  document.getElementById('dashAuthGuard').style.display = 'none';
  document.getElementById('dashContent').style.display   = '';

  try {
    const res  = await fetch(`${API}/api/dashboard`, {headers: authHeaders()});
    if (!res.ok) {
      if (res.status === 401) { logout(); return; }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const {stats, weekly_co2, recent_trips} = data;

    // User card
    const avatarEl = document.getElementById('dashAvatar');
    const nameEl   = document.getElementById('dashName');
    const levelEl  = document.getElementById('dashLevel');
    if (avatarEl) avatarEl.textContent = data.user.avatar || '🌿';
    if (nameEl)   nameEl.textContent   = data.user.name   || 'User';
    if (levelEl)  levelEl.textContent  = `${levelEmoji(stats.level)} ${stats.level}`;

    const lvlPts = {Bronze: [0, 500], Silver: [500, 2000], Gold: [2000, 5000], Platinum: [5000, 10000]};
    const [lo, hi] = lvlPts[stats.level] || [0, 500];
    const pct = Math.min(100, ((stats.green_points - lo) / (hi - lo)) * 100);
    const xpBar  = document.getElementById('xpBar');
    const xpText = document.getElementById('xpText');
    if (xpBar)  xpBar.style.width   = pct + '%';
    if (xpText) xpText.textContent  = `${stats.green_points} / ${hi} pts to ${nextLevel(stats.level)}`;

    // Stats boxes
    _setText('dTotalTrips', stats.total_trips);
    _setText('dCO2Saved',   stats.co2_saved);
    _setText('dPoints',     stats.green_points);
    _setText('dStreak',     stats.streak_days);

    renderDashCharts(weekly_co2, stats.favorite_mode);

    // Badges
    const badgeGrid = document.getElementById('badgesGrid');
    if (badgeGrid) {
      badgeGrid.innerHTML = stats.badges.length
        ? stats.badges.map(b => `<span class="badge-chip">🏅 ${b}</span>`).join('')
        : '<span style="color:var(--text-muted);font-size:0.875rem">Complete trips to earn badges!</span>';
    }

    // Recent trips
    const list = document.getElementById('tripsList');
    if (list) {
      list.innerHTML = (recent_trips || []).length
        ? recent_trips.map(t => `
          <div class="trip-item">
            <div class="trip-mode">${modeEmoji(t.mode)}</div>
            <div class="trip-info">
              <div class="trip-route">${t.destination || 'Trip'}</div>
              <div class="trip-meta">${t.distance_km || 0} km &bull; ${_formatDate(t.created_at)}</div>
            </div>
            <div class="trip-pts">+${t.green_points || 0} pts</div>
          </div>`).join('')
        : '<div class="loading">No trips yet. Plan your first eco route! 🌿</div>';
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

function renderDashCharts(weekly, favMode) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (weeklyChart) weeklyChart.destroy();
  const wc = document.getElementById('weeklyChart');
  if (wc) {
    weeklyChart = new Chart(wc, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          label: 'CO₂ Saved (kg)', data: weekly || [0,0,0,0,0,0,0],
          backgroundColor: 'rgba(34,197,94,0.4)', borderColor: '#22c55e',
          borderWidth: 2, borderRadius: 8
        }]
      },
      options: {
        plugins: {legend: {labels: {color: '#9ca3af'}}},
        scales: {
          x: {ticks: {color: '#9ca3af'}, grid: {color: 'rgba(255,255,255,0.05)'}},
          y: {ticks: {color: '#9ca3af'}, grid: {color: 'rgba(255,255,255,0.05)'}}
        }
      }
    });
  }

  if (modeChart) modeChart.destroy();
  const mc = document.getElementById('modeChart');
  if (mc) {
    modeChart = new Chart(mc, {
      type: 'doughnut',
      data: {
        labels: ['Cycling', 'Transit', 'Walking', 'Driving'],
        datasets: [{
          data: [40, 30, 20, 10],
          backgroundColor: ['#22c55e', '#38bdf8', '#a78bfa', '#f87171'],
          borderWidth: 0
        }]
      },
      options: {plugins: {legend: {labels: {color: '#9ca3af'}}}, cutout: '70%'}
    });
  }
}

// ── Rewards ───────────────────────────────────────────────────────────────────
async function loadRewards() {
  const pts = USER ? (USER.green_points || 0) : 0;
  _setText('rewardPoints', pts);

  const levels    = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  const userLevel = USER ? (USER.level || 'Bronze') : 'Bronze';
  levels.forEach(l => {
    const el = document.getElementById('tier' + l);
    if (el) el.classList.toggle('active', l === userLevel);
  });

  const userBadges = USER ? (USER.badges || []) : [];
  const badgeMap = {
    'First Green Trip': 'badge-first', '7 Day Streak': 'badge-streak',
    'CO2 Saver': 'badge-co2', 'Community Hero': 'badge-hero'
  };
  Object.entries(badgeMap).forEach(([name, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const unlocked = userBadges.includes(name);
    el.classList.toggle('unlocked', unlocked);
    el.classList.toggle('locked',   !unlocked);
  });

  if (!TOKEN) {
    const cat = document.getElementById('rewardsCatalog');
    if (cat) cat.innerHTML = '<div style="color:var(--text-muted)">Login to see and redeem rewards</div>';
    return;
  }
  try {
    const res  = await fetch(`${API}/api/rewards`, {headers: authHeaders()});
    const data = await res.json();
    _setText('rewardPoints', data.user_points || 0);
    const catalog = document.getElementById('rewardsCatalog');
    if (catalog) {
      catalog.innerHTML = (data.catalog || []).map(r => `
        <div class="reward-card">
          <div class="reward-icon">${r.icon}</div>
          <div class="reward-title">${r.title}</div>
          <div class="reward-cost">⭐ ${r.points} points</div>
          <button class="redeem-btn" onclick="redeemReward('${r.id}','${r.title}',${r.points},${data.user_points})">
            ${data.user_points >= r.points ? '🎁 Redeem' : `🔒 Need ${r.points - data.user_points} more pts`}
          </button>
        </div>`).join('');
    }
  } catch (e) {
    console.warn('Rewards load failed:', e);
  }
}

async function redeemReward(id, title, cost, userPts) {
  if (userPts < cost) { showToast('Not enough points! Keep travelling green 🌿'); return; }
  try {
    const res  = await fetch(`${API}/api/rewards/redeem`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({reward_id: id})
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎁 Redeemed: ${title}!`);
      pushNotif('🎁 Reward Redeemed!', `${title} has been added to your account.`);
      loadRewards();
    }
  } catch (e) {
    console.warn('Redeem failed:', e);
  }
}

// ── Community ─────────────────────────────────────────────────────────────────
async function loadCommunity() {
  // Set up post type buttons (safe re-init with duplicate listener guard)
  document.querySelectorAll('.type-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.type-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      selectedPostType = b.dataset.type;
    };
  });

  try {
    const [postsRes, boardRes] = await Promise.all([
      fetch(`${API}/api/community`),
      fetch(`${API}/api/leaderboard`)
    ]);
    const postsData = await postsRes.json();
    const boardData = await boardRes.json();
    renderPosts(postsData.posts || []);
    renderLeaderboard(boardData.leaderboard || []);
  } catch (e) {
    renderPosts(getDemoPosts());
    renderLeaderboard(getDemoLeaderboard());
  }
}

function getDemoPosts() {
  return [
    {_id:'1', author:'Priya S.',  avatar:'🌱', type:'tip',
     content:'Taking the metro instead of cab saved me ₹120 and 0.8 kg CO₂ today! Small choices add up 🌍',
     likes:24, created_at: new Date().toISOString()},
    {_id:'2', author:'Rahul M.',  avatar:'🌿', type:'carpool',
     content:'Daily carpool from Pune to Hinjewadi available! 2 seats. DM me for details.',
     likes:12, created_at: new Date().toISOString()},
    {_id:'3', author:'Ananya K.', avatar:'🦋', type:'challenge',
     content:'Just completed Day 5 of Cycle Week challenge! Legs hurt but CO₂ savings feel amazing 🚲💪',
     likes:47, created_at: new Date().toISOString()},
  ];
}

function getDemoLeaderboard() {
  return [
    {name:'Priya S.',  avatar:'🌱', green_points:1420, level:'Silver'},
    {name:'Rahul M.',  avatar:'🌿', green_points:980,  level:'Silver'},
    {name:'Ananya K.', avatar:'🦋', green_points:750,  level:'Silver'},
    {name:'Vikram R.', avatar:'🐝', green_points:440,  level:'Bronze'},
    {name:'Neha P.',   avatar:'🌻', green_points:320,  level:'Bronze'},
  ];
}

function renderPosts(posts) {
  const feed = document.getElementById('postsFeed');
  if (!feed) return;
  if (!posts.length) { feed.innerHTML = '<div class="loading">No posts yet. Be the first! 🌿</div>'; return; }
  feed.innerHTML = posts.map(p => `
    <div class="post-card" id="post-${p._id}">
      <div class="post-header">
        <div class="post-avatar">${p.avatar || '🌿'}</div>
        <div>
          <div class="post-author">${p.author}</div>
          <div class="post-time">${timeAgo(p.created_at)}</div>
        </div>
        <span class="post-type-badge ${p.type}">${typeLabel(p.type)}</span>
      </div>
      <div class="post-content">${p.content}</div>
      <div class="post-actions">
        <button class="post-action-btn" onclick="likePost('${p._id}',this)">👍 ${p.likes || 0}</button>
        <button class="post-action-btn">💬 Reply</button>
        <button class="post-action-btn">🔗 Share</button>
      </div>
    </div>`).join('');
}

function renderLeaderboard(board) {
  const list = document.getElementById('leaderList');
  if (!list) return;
  list.innerHTML = board.map((u, i) => `
    <div class="leader-item">
      <div class="leader-rank ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
      <div class="leader-avatar">${u.avatar || '🌿'}</div>
      <div class="leader-name">${u.name}</div>
      <div class="leader-pts">${u.green_points} pts</div>
    </div>`).join('');
}

async function submitPost() {
  if (!TOKEN) { showToast('Please login to post! 🔐'); showPage('login'); return; }
  const contentEl = document.getElementById('postContent');
  const content   = contentEl ? contentEl.value.trim() : '';
  if (!content) { showToast('Write something first! ✍️'); return; }
  try {
    const res = await fetch(`${API}/api/community`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({type: selectedPostType, content})
    });
    if (res.ok) {
      if (contentEl) contentEl.value = '';
      showToast('Posted to community! 🌿');
      loadCommunity();
    }
  } catch (e) { showToast('Could not post. Try again.'); }
}

async function likePost(id, btn) {
  try {
    await fetch(`${API}/api/community/like/${id}`, {method: 'POST'});
    const count = parseInt(btn.textContent.split(' ')[1]) + 1;
    btn.textContent = `👍 ${count}`;
  } catch (e) {}
}

function joinChallenge() {
  showToast('Joined the challenge! Good luck! 🚴');
  pushNotif('🏁 Challenge Joined', 'Cycle Week: Cycle 5 days to earn 300 pts!');
}

// ── Admin ─────────────────────────────────────────────────────────────────────
async function loadAdminStats() {
  try {
    const res  = await fetch(`${API}/api/admin/stats`);
    const data = await res.json();
    _setText('aUsers', data.total_users);
    _setText('aTrips', data.total_trips);
    _setText('aCO2',   (data.total_co2_saved || 0) + ' kg');
    const tbody = document.getElementById('adminUsersBody');
    if (tbody && data.recent_users) {
      tbody.innerHTML = data.recent_users.map(u => `
        <tr>
          <td>${u.avatar || '🌿'} ${u.name}</td>
          <td>${u.email || ''}</td>
          <td>${u.green_points || 0}</td>
          <td>${u.level || 'Bronze'}</td>
          <td>${_formatDate(u.created_at)}</td>
        </tr>`).join('');
    }
  } catch (e) {
    console.warn('Admin stats failed:', e);
  }
}

// ── Chatbot ───────────────────────────────────────────────────────────────────
function toggleChat() {
  const widget = document.getElementById('chatWidget');
  if (widget) widget.classList.toggle('open');
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg   = input ? input.value.trim() : '';
  if (!msg) return;
  if (input) input.value = '';

  appendChatMsg('user', msg, '👤');
  chatHistory.push({role: 'user', content: msg});
  appendChatMsg('bot', '...', '🤖', 'typing');

  try {
    const res  = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: TOKEN ? authHeaders() : {'Content-Type': 'application/json'},
      body: JSON.stringify({message: msg, history: chatHistory})
    });
    const data = await res.json();
    const typingEl = document.querySelector('.chat-typing');
    if (typingEl) typingEl.closest('.chat-msg')?.remove();
    appendChatMsg('bot', data.reply || '🌿 No response received.', '🤖');
    chatHistory.push({role: 'assistant', content: data.reply});
  } catch (e) {
    const typingEl = document.querySelector('.chat-typing');
    if (typingEl) typingEl.closest('.chat-msg')?.remove();
    appendChatMsg('bot', '🌿 Connection error. Make sure the backend is running on localhost:5000.', '🤖');
  }
}

function appendChatMsg(role, text, avatar, extra) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-bubble ${extra || ''}">${
      extra === 'typing'
        ? '<span class="chat-typing">GreenBot is thinking...</span>'
        : text
    }</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Notifications ─────────────────────────────────────────────────────────────
function pushNotif(title, body, type = 'info') {
  const container = document.getElementById('notifContainer');
  if (!container) return;
  const n = document.createElement('div');
  n.className = 'notif';
  n.innerHTML = `
    <div class="notif-icon">${type === 'success' ? '✅' : type === 'warn' ? '⚠️' : '🌿'}</div>
    <div class="notif-content">
      <div class="notif-title">${title}</div>
      <div class="notif-body">${body}</div>
    </div>`;
  container.appendChild(n);
  setTimeout(() => {n.classList.add('exit'); setTimeout(() => n.remove(), 300);}, 4000);
}

function scheduleNotifications() {
  const tips = [
    ['💡 Daily Eco Tip',   'Combining trip errands reduces total CO₂ by up to 30%!'],
    ['🚌 Transit Alert',   'Metro Line 1 is running on time — great for your commute!'],
    ['🏆 Streak Reminder', 'Choose green travel today to keep your streak alive!'],
    ['⚡ EV Update',       'New charging station opened near City Center!'],
  ];
  let i = 0;
  setTimeout(() => { pushNotif(tips[0][0], tips[0][1]); i = 1; }, 3000);
  setInterval(() => {
    pushNotif(tips[i % tips.length][0], tips[i % tips.length][1]);
    i++;
  }, 45000);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _formatDate(dateStr) {
  if (!dateStr) return '';
  try { return new Date(dateStr).toLocaleDateString(); }
  catch (e) { return String(dateStr).slice(0, 10); }
}

function levelEmoji(level) {
  return {Bronze: '🥉', Silver: '🥈', Gold: '🥇', Platinum: '💎'}[level] || '🥉';
}
function nextLevel(level) {
  return {Bronze: 'Silver', Silver: 'Gold', Gold: 'Platinum', Platinum: 'Platinum'}[level] || 'Silver';
}
function modeEmoji(mode) {
  return {cycling: '🚲', transit: '🚌', walking: '🚶', driving: '🚗', electric: '⚡'}[mode] || '🚲';
}
function typeLabel(type) {
  return {tip: '💡 Tip', carpool: '🚗 Carpool', alert: '⚠️ Alert', challenge: '🏁 Challenge'}[type] || '💬';
}
function timeAgo(dateStr) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch (e) { return ''; }
}
