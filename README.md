# StalkerWeb

Self-hosted IPTV web app that replicates [Kodi's pvr.stalker](https://github.com/AlexELEC/pvr.stalker) functionality in a browser — no Kodi required.

[![Release](https://github.com/rangoDJ/stalkerweb/actions/workflows/release.yml/badge.svg)](https://github.com/rangoDJ/stalkerweb/actions/workflows/release.yml)
[![CI](https://github.com/rangoDJ/stalkerweb/actions/workflows/ci.yml/badge.svg)](https://github.com/rangoDJ/stalkerweb/actions/workflows/ci.yml)

---

## Features

- 🔌 **Full Stalker Middleware protocol** — handshake, token auth, keep-alive watchdog, idle session timeout that auto-renews while playback is streaming.
- 📺 **Dynamic Channel Grid** — with multi-line genre filtering, search, and keyboard number-jump.
- ❤️ **Favorites** — star channels, organize into custom drag-and-drop groups, with inline group editor.
- 📅 **EPG Guide** — with scrollable timeline, configurable lookahead (6h–48h), and built-in player integration.
- 🔞 **Parental Lock** — toggleable filtering for adult content across all pages.
- 📱 **Android App** — companion Kotlin/Compose app with auto-update support (API 26+).
- ▶️ **HLS.js Video Player** — HLS playback with auto-recovery, native fallback for MP4/TS, fullscreen, volume, and keyboard shortcuts (`Space` play/pause, `F` fullscreen, `M` mute, arrow keys channel surf).
- 🖼️ **Logo Matching** — automatic channel logo lookup via `iptv-org` with manual override support.
- 🔁 **STBEmu Backup Export/Import** — export a profile as a ready-to-import STBEmu JSON, or import an STBEmu backup file (including multi-profile files, with a picker) straight into StalkerWeb.
- 🎬 **VOD & Series** — browse categories, seasons/episodes, search, favorites, and resumable "Continue Watching" progress.
- 📥 **Server-side Downloads** — save VOD titles to disk, with HLS-to-MP4 remuxing via ffmpeg.
- 💾 **Session Persistence** — auto-reconnects to portal on container restart; saved tokens per portal.
- 👤 **Multi-Profile** — save multiple portal connections and switch between them, each with its own genre filters.
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
      # Optional: minutes of inactivity before the portal session is torn
      # down (default 30). The timer is held off while a stream is playing,
      # so this is only the grace window after the last viewer disconnects.
      # - IDLE_TIMEOUT_MINUTES=30
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

While any of these connections is open, the backend renews the idle-disconnect
timer on a 60-second heartbeat, so playback through **any** client (web,
Jellyfin, Kodi, VLC) keeps the portal session alive — including single,
long-lived stream pipes — and the session only tears down `IDLE_TIMEOUT_MINUTES`
after the last viewer disconnects.

---

## Live Log Monitor

The backend exposes its structured logs over HTTP so an external agent (Claude,
Antigravity, a dashboard, or plain `curl`) can watch them in real time. Every
log line is also kept in an in-memory ring buffer (last `LOG_BUFFER_SIZE` lines,
default 1000) so a fresh connection immediately gets recent history.

| Endpoint | Description |
|---|---|
| `GET /api/logs` | One-shot JSON snapshot of the buffer |
| `GET /api/logs/stream` | SSE stream — replays the buffer, then live-tails new lines |

Both accept query filters: `?level=info|warn|error|debug`, `?tag=<source>`,
`?since=<seq>` (only lines after a given sequence number), `?limit=<n>`. Each
record is `{ seq, ts, level, tag, msg }`. The SSE stream emits an `id:` per
event, so a client that drops can resume gap-free via the `Last-Event-ID`
header (or `?since=`).

**Access control** — these logs can contain the portal MAC, portal URL and
stream tokens, so the endpoint is **localhost-only by default**: it accepts
requests only from the same host/container unless `LOG_MONITOR_TOKEN` is set.
With a token, any source IP may connect by sending it as `?token=<token>` or
`Authorization: Bearer <token>`.

```bash
# Tail the live stream from the same host:
curl -N http://localhost:8983/api/logs/stream

# Only errors, with a token, from a remote agent:
curl -N -H "Authorization: Bearer $LOG_MONITOR_TOKEN" \
  "http://your-host:8983/api/logs/stream?level=error"
```

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
| **Auth / Portal** ||
| `POST` | `/api/auth/connect` | Connect to a portal (rate-limited: 5/min) |
| `POST` | `/api/auth/reconnect` | Re-connect using saved config (rate-limited: 10/min) |
| `GET` | `/api/auth/status` | Session status (connected, profile, watchdog/idle info) |
| `DELETE` | `/api/auth/disconnect` | Tear down session |
| `GET` | `/api/auth/config` | Get saved portal config (pre-fills Setup form) |
| `PUT` | `/api/auth/config` | Persist portal config fields without connecting |
| **Channels / EPG** ||
| `GET` | `/api/channels` | List channels (`?group=` filter, `?refresh=1`) |
| `GET` | `/api/channels/:id` | Single channel info |
| `GET` | `/api/channels/groups/all` | List genre groups |
| `GET` | `/api/channels/progress` | Channel load progress (poll while loading) |
| `GET` | `/api/channels/events` | SSE stream of channel load progress |
| `GET` | `/api/channels/health` | Recent per-channel stream errors |
| `GET` | `/api/epg` | EPG for all channels (`?period=24`) |
| `GET` | `/api/epg/:channelId` | EPG for a channel (`?period=24`) |
| `GET` | `/api/epg/now` | Current + next programme for all channels |
| **Streaming** ||
| `GET` | `/api/stream/:channelId` | Resolve a live channel's stream URL |
| `GET` | `/api/stream/keepalive` | Renew the idle timer while a stream plays |
| `GET` | `/proxy/stream/:channelId` | Proxy the master HLS playlist for a channel |
| `GET` | `/proxy/hls?url=` | Proxy an HLS sub-playlist |
| `GET` | `/proxy/hls/seg/:encoded` | Proxy an HLS segment |
| **VOD & Downloads** ||
| `GET` | `/api/vod/categories` | VOD/series categories (`?type=vod\|series`) |
| `GET` | `/api/vod/items` | Browse/search items in a category |
| `GET` | `/api/vod/seasons/:movieId` | Seasons for a series |
| `GET` | `/api/vod/episodes/:showId/:seasonId` | Episodes for a season |
| `GET` | `/api/vod/stream` | Resolve a VOD/episode stream URL |
| `GET`/`PUT`/`DELETE` | `/api/vod/progress` `/:key` | Continue-watching progress |
| `GET` | `/api/downloads` | Current download job list |
| `GET` | `/api/downloads/events` | SSE stream of download job updates |
| `POST` | `/api/downloads` | Enqueue VOD downloads (`{ items: [...] }`) |
| `DELETE` | `/api/downloads/:id` | Cancel/remove a download job |
| **Favorites** ||
| `GET` | `/api/favorites` | Get favorites (channels + groups) |
| `POST`/`DELETE` | `/api/favorites/channels` `/:id` | Add/remove a favorite channel |
| `POST`/`PUT`/`DELETE` | `/api/favorites/groups` `/:id` | Create/rename/delete a favorite group |
| `POST`/`DELETE` | `/api/favorites/groups/:id/channels` `/:chId` | Add/remove a channel in a group |
| `PUT` | `/api/favorites/channels/order`, `/groups/order` | Persist drag-and-drop order |
| **Logos** ||
| `GET` | `/api/logos` | List logo overrides + iptv-org DB stats |
| `GET` | `/api/logos/check` | Test how a channel name resolves to a logo |
| `GET` | `/api/logos/render` | Render/proxy a logo image |
| `GET` | `/api/logos/map` | Full channel-name → logo URL map |
| `POST` | `/api/logos/refresh` | Refresh the iptv-org logo database |
| `GET`/`POST`/`DELETE` | `/api/logos/strip` `/:word` | List/add/remove logo-matching strip words |
| `POST`/`DELETE` | `/api/logos` `/:name` | Add/remove a manual logo override |
| **Export / External clients** ||
| `GET`/`POST` | `/api/export/stbemu` | Download an STBEmu backup JSON (`POST` to export an arbitrary profile) |
| `GET` | `/api/m3u` | M3U playlist for external clients |
| `GET` | `/api/xmltv` | XMLTV guide feed |
| **Settings & Logs** ||
| `GET` | `/api/settings` | Get app preferences |
| `POST` | `/api/settings` | Save app preferences (EPG, Parental Lock, download dir, etc.) |
| `GET` | `/api/logs` | One-shot JSON snapshot of the log buffer |
| `GET` | `/api/logs/stream` | SSE live-tail of backend logs (see [Live Log Monitor](#live-log-monitor)) |

## License

MIT
