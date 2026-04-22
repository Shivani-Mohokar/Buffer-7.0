# Green Transport Planner 🌱🚍

## Problem Statement
Urban transportation contributes significantly to pollution, traffic congestion, and inefficient travel planning. Most navigation systems optimize for time, not environmental impact.

## Solution
Green Transport Planner is a full-stack eco-friendly travel platform that suggests optimized routes based on sustainability. It integrates real-time mapping, intelligent routing, and AI assistance to help users choose greener travel options.

## Key Features
- 🌍 Eco-friendly route suggestions
- 🗺️ Real-time navigation using TomTom Maps API
- 🤖 AI-powered recommendations using OpenAI
- 📍 Automatic location detection (GPS, WiFi, IP-based)
- 🔄 Fallback options if location permission is denied
- 📌 Manual location selection via map click or address input

## Tech Stack
- **Frontend:** (Add yours: HTML/CSS/JS / React)
- **Backend:** Flask (Python)
- **Database:** MongoDB
- **APIs Used:** 
  - TomTom Maps API (for routing & geocoding)
  - OpenAI API (for intelligent suggestions)

## How Location Detection Works
### 📱 Mobile Devices
- GPS Satellites — High accuracy (3–10 meters)
- Cell Tower Triangulation — Backup positioning
- WiFi Positioning — Uses nearby networks

### 💻 Laptop/Desktop
- WiFi Geolocation — Based on known WiFi networks
- IP Address Mapping — Approximate (city-level accuracy)
- Browser Geolocation API — Requires user permission

### 🔒 Permission Denied Fallback
- Manual address input
- IP-based location via `/api/get-location`
- Map click to select location
- TomTom Geocoding converts address → coordinates

## Data Structures Used
- Graphs (for route mapping and optimization)
- Arrays (for storing routes and data)
- Priority Queue (for shortest/efficient path calculation)

## Video Demo
https://drive.google.com/drive/folders/1spsL3PgRmffkek_1D_Qs0GtshRpwQSEi?usp=sharing

## Team Members
- Shivani Mohokar(Leader)
- Aarya Kulkarni
- Devika Prabhu
