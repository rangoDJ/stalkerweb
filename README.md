# StalkerWeb

Self-hosted IPTV web app that replicates [Kodi's pvr.stalker](https://github.com/AlexELEC/pvr.stalker) functionality in a browser — no Kodi required.

[![Release](https://github.com/rangoDJ/stalkerweb/actions/workflows/release.yml/badge.svg)](https://github.com/rangoDJ/stalkerweb/actions/workflows/release.yml)

---

## Features

- 🔌 **Full Stalker Middleware protocol** — handshake, token auth, keep-alive watchdog.
- 📺 **Dynamic Channel Grid** — with multi-line genre filtering and search.
- ❤️ **Favorites** — star channels and organize them into custom groups.
- 📅 **EPG Guide** — with scrollable timeline and built-in player integration.
- 🔞 **Parental Lock** — toggleable filtering for adult content.
- 📱 **Android App** — companion app with auto-update support.
- ▶️ **HLS.js Video Player** — high-performance built-in web player.
- 🖼️ **Logo Matching** — automatic channel logo lookup via `iptv-org` with manual override support.
- 📤 **STBEmu Backup Export** — generate a ready-to-import STBEmu profile JSON.
- 💾 **Session Persistence** — auto-reconnects to portal on container restart.
- 🌐 **Multi-platform Docker** — `amd64` + `arm64` support.

## Quick Start (Docker)

```yaml
# docker-compose.yml
services:
  stalkerweb:
    image: ghcr.io/rangodj/stalkerweb:latest
    container_name: stalkerweb
    restart: unless-stopped
    ports:
      - "8983:8983"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      # Optional: pre-seed portal credentials
      # - PORTAL_URL=http://your-portal.example.com/c/
      # - PORTAL_MAC=00:1A:79:XX:XX:XX
```

```bash
docker-compose up -d
```

Then open **http://localhost:8983**, enter your portal URL and MAC address, and click **Connect**.

## Android App

StalkerWeb includes a companion Android app for native playback.
- **Auto-Update**: The app automatically checks GitHub for new releases.
- **Installation**: Download the latest APK from the [Releases](https://github.com/rangoDJ/stalkerweb/releases) page.
- **Parental Lock**: Inherits settings from the web UI to hide restricted categories.

## HLS Proxy

StalkerWeb includes a built-in HLS proxy that forwards stream requests to the portal on behalf of external clients (Jellyfin, VLC, etc.).

| Endpoint | Description |
|---|---|
| `GET /proxy/stream/:channelId` | Proxy the master HLS playlist for a channel |
| `GET /proxy/hls?url=<encoded>` | Proxy an HLS sub-playlist |
| `GET /proxy/hls/seg/<encoded>.ts` | Proxy an HLS segment |

---

## Jellyfin Integration

StalkerWeb exposes an M3U playlist and an XMLTV guide feed that Jellyfin can consume directly.

### 1. Add M3U Tuner
Set the M3U URL to: `http://your-host:8983/api/m3u`

### 2. Add XMLTV Guide
Set the XMLTV URL to: `http://your-host:8983/api/xmltv`

---

## Building from Source

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Development
cd frontend && npm run dev     # UI at :5173
cd backend  && node server.js  # API at :8983

# Production build
cd frontend && npm run build
cd ..       && node backend/server.js
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/connect` | Connect to portal |
| `GET` | `/api/auth/status` | Session status |
| `GET` | `/api/settings` | Get app preferences |
| `POST` | `/api/settings` | Save app preferences (EPG, Parental Lock, etc.) |
| `GET` | `/api/channels` | List channels (`?group=`) |
| `GET` | `/api/channels/groups/all` | List genre groups |
| `GET` | `/api/epg` | Full EPG guide |
| `GET` | `/api/stream/:channelId` | Resolve stream URL |
| `GET` | `/api/favorites` | Get favorites (channels + groups) |
| `GET` | `/api/export/stbemu` | Download STBEmu backup JSON |

## License

MIT
