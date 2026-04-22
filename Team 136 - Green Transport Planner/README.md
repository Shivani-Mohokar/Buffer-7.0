# 🌿 Green Transport Planner

A full-stack eco-friendly travel platform built with Flask, MongoDB, TomTom Maps API, and OpenAI.

---

## 📁 Folder Structure

```
green-transport-planner/
├── backend/
│   ├── app.py                 # Flask main application
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── index.html             # Main SPA (all pages)
│   ├── css/
│   │   └── main.css           # Green futuristic stylesheet
│   └── js/
│       └── app.js             # Full frontend logic (TypeScript-style JS)
├── .env.example               # Environment variables template
├── .env                       # Your actual env (not committed)
└── README.md
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.9+
- MongoDB (local or Atlas)
- Node.js (optional, for TypeScript compilation)
- TomTom API Key (free at https://developer.tomtom.com)
- OpenAI API Key (https://platform.openai.com)

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```
MONGO_URI=mongodb://localhost:27017/green_transport
JWT_SECRET=your-secret-key-here
TOMTOM_API_KEY=your_tomtom_key
OPENAI_API_KEY=your_openai_key
```

### 4. Start MongoDB

```bash
# Local MongoDB
mongod --dbpath /data/db

# Or use MongoDB Atlas (cloud) — update MONGO_URI in .env
```

### 5. Run the App

```bash
cd backend
python app.py
```

---

## 🌍 How Browser Geolocation Works

### 📱 Mobile Devices
1. **GPS Satellites** — Most accurate (3-10 meter accuracy)
2. **Cell Tower Triangulation** — Uses nearby towers as backup
3. **WiFi Positioning** — Cross-references known WiFi MAC addresses
4. Browser asks permission → User grants → GPS coordinates returned

### 💻 Laptop / Desktop
1. **WiFi Geolocation** — Google/Apple databases map WiFi networks to coordinates
2. **IP Address Mapping** — Less accurate (city-level, 100-500m)
3. **Browser Permission API** — Same `navigator.geolocation` call as mobile

### 🔒 Permission Denied Fallback
- Manual text input for source address
- IP-based location via our `/api/get-location` endpoint
- Map click to set location
- TomTom geocoding converts address → coordinates

---

## 🔌 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create account | No |
| POST | `/api/auth/login` | Login | No |
| GET | `/api/auth/me` | Get profile | Yes |
| GET | `/api/get-location` | IP geolocation fallback | No |
| POST | `/api/route` | Get eco route options | No |
| POST | `/api/eco-score` | Calculate eco score | No |
| POST | `/api/save-trip` | Save a completed trip | Yes |
| GET | `/api/dashboard` | User stats & charts | Yes |
| GET | `/api/community` | Community posts | No |
| POST | `/api/community` | Create post | Yes |
| POST | `/api/community/like/:id` | Like a post | No |
| GET | `/api/leaderboard` | Top users | No |
| GET | `/api/rewards` | Rewards catalog | Yes |
| POST | `/api/rewards/redeem` | Redeem reward | Yes |
| POST | `/api/chat` | AI chatbot | Optional |
| GET | `/api/nearby` | Nearby places (TomTom) | No |
| GET | `/api/admin/stats` | Admin statistics | No |

---

## 🗄️ MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `users` | User profiles, points, badges, level |
| `trips` | Trip history, CO₂, distance, mode |
| `rewards` | Redeemed rewards per user |
| `community_posts` | Community tips, carpools, alerts |
| `chat_history` | AI chatbot conversations |
| `leaderboard` | Live points rankings |

---

## 🎨 Features

### 🗺️ Eco Route Finder
- Source auto-detected via GPS / WiFi / IP
- Destination via text input (geocoded by TomTom)
- 3 route options: Greenest 🚲, Fastest 🚗, Cheapest 💰
- Shows: distance, ETA, CO₂ emissions, cost, traffic delay, green points

### 📍 Live Location Dashboard
- Leaflet.js map with real-time tracking
- Filter by: EV Stations, Bus Stops, Metro, Bike Rentals
- Live traffic info, nearest EV station distance

### 📊 Personal Eco Dashboard
- Total trips, CO₂ saved, green points, streak
- Weekly CO₂ chart (Chart.js bar)
- Mode split doughnut chart
- Recent trips list
- Level progression (Bronze → Platinum)

### 🏆 Gamification
- Points earned per trip based on mode + distance
- Badges: First Green Trip, 7 Day Streak, CO2 Saver, Community Hero
- Levels: Bronze (0), Silver (500), Gold (2000), Platinum (5000)
- Rewards catalog: Metro passes, EV charging, bike rentals, plant trees

### 👥 Community Hub
- Post tips, carpools, alerts, challenges
- Like system
- Real-time leaderboard
- Weekly challenges (No Car Friday, Cycle Week)

### 🤖 AI GreenBot (OpenAI)
- Route recommendations
- Carbon saving tips
- EV charging guidance
- Community questions
- Persistent chat history per user

### 🔔 Smart Notifications
- Auto-scheduled eco tips
- Reward unlock alerts
- Trip completion confirmations
- Challenge reminders

### 🔐 User Authentication
- JWT-based sessions
- bcrypt password hashing
- Avatar picker
- Profile auto-saved

### ⚙️ Admin Panel
- Total users, trips, CO₂ saved
- Recent user table

---

## 🔑 Getting API Keys

### TomTom Maps API (Free tier available)
1. Go to https://developer.tomtom.com
2. Create account → Create App
3. Enable: Maps SDK, Routing API, Search API, Places API
4. Copy API key → paste in `.env`

### OpenAI API
1. Go to https://platform.openai.com
2. Create API key
3. Add billing (pay-as-you-go, ~$0.002/query)
4. Paste in `.env`

### MongoDB Atlas (Free)
1. Go to https://cloud.mongodb.com
2. Create free cluster
3. Get connection string
4. Replace `MONGO_URI` in `.env`

---

## 🌐 Deployment

### Railway / Render
```bash
# Set environment variables in dashboard
# Deploy from GitHub
```

### Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "backend/app.py"]
```

---

## 📱 Mobile Compatibility
- Fully responsive (mobile-first CSS)
- Hamburger navigation on small screens
- Touch-optimized buttons and maps
- GPS auto-detection on mobile browsers

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS (TypeScript patterns) |
| Backend | Python Flask 3.0 |
| Database | MongoDB via PyMongo |
| Auth | JWT (flask-jwt-extended) |
| Maps | Leaflet.js + TomTom Routing & Search API |
| Charts | Chart.js |
| AI | OpenAI GPT-3.5-turbo |
| Geolocation | Browser Geolocation API + IP fallback |

---

## 📄 License
MIT License — Free to use, modify, and deploy.
