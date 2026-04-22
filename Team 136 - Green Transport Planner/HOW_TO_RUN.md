# 🌿 Green Transport Planner — Run Guide

## Prerequisites
- Python 3.9+ installed
- VS Code (recommended) with Python extension

---

## 1 — Set up Python environment

```bash
# Open a terminal in VS Code (Ctrl+` or Terminal → New Terminal)
# Navigate to the project folder
cd green-transport-planner-fixed

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Mac / Linux:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

---

## 2 — Configure API keys (optional but recommended)

Edit the `.env` file in the project root:

```
TOMTOM_API_KEY=your_key_here    # Get free key at developer.tomtom.com
OPENAI_API_KEY=your_key_here    # Get at platform.openai.com  (optional)
MONGO_URI=mongodb://localhost:27017/green_transport  # optional
```

**The app works WITHOUT any API keys** — it runs in demo mode:
- Routes show estimated data (no real TomTom call)
- Chatbot uses keyword-based fallback replies
- User data stored in memory (cleared on restart) instead of MongoDB

---

## 3 — Run the backend

```bash
cd backend
python app.py
```

You should see:
```
🌿 Green Transport Planner — http://localhost:5000
   TomTom API  : MISSING (demo mode active)
   OpenAI API  : MISSING (smart fallback replies)
   MongoDB     : UNAVAILABLE (in-memory mode)
```

---

## 4 — Open the app

Open your browser and go to: **http://localhost:5000**

That's it! Flask serves the frontend automatically.

> ⚠️ Do NOT open `index.html` directly as a file (`file://`) — geolocation
> and API calls won't work from the file:// protocol. Always use http://localhost:5000.

---

## VS Code tip — run with one click

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Green Transport Planner",
      "type": "python",
      "request": "launch",
      "program": "${workspaceFolder}/backend/app.py",
      "env": {"FLASK_ENV": "development"},
      "console": "integratedTerminal"
    }
  ]
}
```

Then press **F5** to start the server.

---

## Bugs fixed in this version

| # | Bug | Fix |
|---|-----|-----|
| 1 | `event is not defined` in `filterNearby()` | Added `btn` parameter; pass `this` from HTML |
| 2 | `dest is not defined` in `renderRoutes()` | Removed stale reference; use `destination.address` safely |
| 3 | Route search fails if GPS denied | Falls back to manual source input; shows clear message |
| 4 | `app.json_encoder` deprecated in Flask 3 | Replaced with `_serialize()` helper |
| 5 | MongoDB crash on startup | Wrapped in try/except; graceful in-memory fallback |
| 6 | IP geolocation crashes on localhost `127.0.0.1` | Strips port; returns Pune default if lookup fails |
| 7 | Null element selectors causing silent failures | All DOM accesses guarded with null checks |
| 8 | Duplicate event listeners on community type buttons | Replaced `.addEventListener` with `.onclick` |
| 9 | Route map not shown | Added `drawRouteOnMap()` and `routeMapContainer` toggle |
