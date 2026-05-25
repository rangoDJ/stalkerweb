# StalkerWeb

Self-hosted IPTV web app that replicates [Kodi's pvr.stalker](https://github.com/AlexELEC/pvr.stalker) functionality in a browser — no Kodi required.

[![Release](https://github.com/rangoDJ/stalkerweb/actions/workflows/release.yml/badge.svg)](https://github.com/rangoDJ/stalkerweb/actions/workflows/release.yml)
[![CI](https://github.com/rangoDJ/stalkerweb/actions/workflows/ci.yml/badge.svg)](https://github.com/rangoDJ/stalkerweb/actions/workflows/ci.yml)

---

## Features

- 🔌 **Full Stalker Middleware protocol** — handshake, token auth, keep-alive watchdog, idle session timeout.
- 📺 **Dynamic Channel Grid** — with multi-line genre filtering, search, and keyboard number-jump.
- ❤️ **Favorites** — star channels, organize into custom drag-and-drop groups, with inline group editor.
- 📅 **EPG Guide** — with scrollable timeline, configurable lookahead (6h–48h), and built-in player integration.
- 🔞 **Parental Lock** — toggleable filtering for adult content across all pages.
- 📱 **Android App** — companion Kotlin/Compose app with auto-update support (API 26+).
- ▶️ **HLS.js Video Player** — HLS playback with auto-recovery, native fallback for MP4/TS, fullscreen, volume, and keyboard shortcuts (`Space` play/pause, `F` fullscreen, `M` mute, arrow keys channel surf).
- 🖼️ **Logo Matching** — automatic channel logo lookup via `iptv-org` with manual override support.
- 📤 **STBEmu Backup Export** — generate a ready-to-import STBEmu profile JSON.
- 💾 **Session Persistence** — auto-reconnects to portal on container restart; saved tokens per portal.
- 🌐 **Multi-platform Docker** — `amd64` + `arm64` builds.
- 🛡️ **Security** — rate-limited auth endpoints, SSRF-guarded HLS proxy, input validation on all critical routes, structured logging.
- ✅ **Code Quality** — ESLint 9 flat config (backend + frontend), Prettier, 21 automated tests in CI.

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

The container includes:
- **HEALTHCHECK** — pings `/api/health` every 30s; Docker marks unhealthy after 3 failures.
- **Graceful shutdown** — on `SIGTERM`, the portal session is destroyed before exit.

## Android App

StalkerWeb includes a companion Android app for native playback.
- **Auto-Update**: The app automatically checks GitHub for new releases.
- **Installation**: Download the latest APK from the [Releases](https://github.com/rangoDJ/stalkerweb/releases) page.
- **Parental Lock**: Inherits settings from the web UI to hide restricted categories.

## Security

- **Rate Limiting** — Auth endpoints are rate-limited to prevent brute-force attacks.
- **SSRF Protection** — The HLS proxy validates all proxied URLs match the connected portal domain.
- **Input Validation** — Express-validator middleware sanitizes channel IDs, URLs, and auth fields on all critical routes.
- **Structured Logging** — All backend operations log via a structured logger with severity levels, redacted tokens.
- **Container HEALTHCHECK** — Docker monitors the service health and restarts on failure.

---

## HLS Proxy

StalkerWeb includes a built-in HLS proxy that forwards stream requests to the portal on behalf of external clients (Jellyfin, VLC, etc.). All proxy URLs are SSRF-guarded against the connected portal domain.

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

## Testing & Linting

```bash
# Backend
cd backend
npm test            # 17 tests (proxy helpers, cache operations)
npm run lint        # ESLint 9 + Prettier check
npm run audit       # Security audit

# Frontend
cd frontend
npm test            # 4 tests (utility functions)
npm run lint        # ESLint 9 (JSX + React + Hooks plugins)
npm run audit       # Security audit
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/connect` | Connect to portal (rate-limited: 5/min) |
| `POST` | `/api/auth/reconnect` | Re-connect using saved config (rate-limited: 10/min) |
| `GET` | `/api/auth/status` | Session status (connected, ping, idle info) |
| `DELETE` | `/api/auth/disconnect` | Tear down session |
| `GET` | `/api/auth/config` | Get saved portal config (pre-fills Setup form) |
| `PUT` | `/api/auth/config` | Persist portal config fields without connecting |
| `GET` | `/api/settings` | Get app preferences |
| `POST` | `/api/settings` | Save app preferences (EPG, Parental Lock, etc.) |
| `GET` | `/api/channels` | List channels (`?group=` filter, `?refresh=1`) |
| `GET` | `/api/channels/:id` | Single channel info |
| `GET` | `/api/channels/groups/all` | List genre groups |
| `GET` | `/api/channels/progress` | Channel load progress (poll while loading) |
| `GET` | `/api/epg/:channelId` | EPG for a channel (`?period=24`) |
| `GET` | `/api/epg/now` | Current + next programme for all channels |
| `GET` | `/api/stream/:channelId` | Resolve stream URL |
| `GET` | `/api/favorites` | Get favorites (channels + groups) |
| `GET` | `/api/m3u` | M3U playlist for external clients |
| `GET` | `/api/xmltv` | XMLTV guide feed |
| `GET` | `/api/export/stbemu` | Download STBEmu backup JSON |
| `POST` | `/api/logos/render` | Render a channel logo |
| `GET` | `/api/logos` | List all logo mappings |
| `POST` | `/api/logos/clear` | Clear logo cache |
| `DELETE` | `/api/logos/:id` | Remove a logo mapping |
| `POST` | `/api/logos/manual` | Set a manual logo override |

## License

MIT
