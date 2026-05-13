# StalkerWeb

Self-hosted IPTV web app that replicates [Kodi's pvr.stalker](https://github.com/AlexELEC/pvr.stalker) functionality in a browser — no Kodi required.

[![Docker Build](https://github.com/rangoDJ/stalkerweb/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/rangoDJ/stalkerweb/actions/workflows/docker-publish.yml)

---

## Features

- 🔌 **Full Stalker Middleware protocol** — handshake, token auth, keep-alive watchdog
- 📺 **Channel grid** with genre group filtering and horizontal scroll
- ❤️ **Favorites** — star channels and organise them into custom groups
- 📅 **EPG guide** with scrollable timeline
- ▶️ **HLS.js video player** built-in
- 🖼️ **Logo matching** — automatic channel logo lookup with manual override support
- 📤 **STBEmu backup export** — generate a ready-to-import STBEmu profile JSON
- 💾 **Session persistence** — auto-reconnects to portal on container restart
- 🌐 **Multi-platform Docker image** — `amd64` + `arm64`

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
      # Optional: pre-seed portal credentials so the UI is skipped
      # - PORTAL_URL=http://your-portal.example.com/c/
      # - PORTAL_MAC=00:1A:79:XX:XX:XX
      # - PORTAL_TIMEZONE=Europe/London
```

```bash
docker-compose up -d
```

Then open **http://localhost:8983**, enter your portal URL and MAC address, and click **Connect**.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8983` | HTTP port to listen on |
| `DATA_DIR` | `./data` (relative to project root) | Persistent storage path |
| `PORTAL_URL` | _(none)_ | Optional: auto-connect portal URL |
| `PORTAL_MAC` | _(none)_ | Optional: auto-connect MAC address |
| `PORTAL_TIMEZONE` | `Europe/London` | Optional: portal timezone |

`PORT` and `DATA_DIR` have sensible defaults — you only need to set them if you want non-default values.

## HLS Proxy

StalkerWeb includes a built-in HLS proxy that forwards stream requests to the portal on behalf of external clients (Jellyfin, VLC, FFmpeg, etc.).

**Why it's needed:** Stalker portal stream URLs are short-lived and require authenticated HTTP headers (cookies, tokens) that external clients can't supply. The proxy resolves the real URL on-demand, injects the correct headers, and rewrites every URL inside the `.m3u8` playlist so that sub-playlists and segments are also fetched through the proxy.

| Endpoint | Description |
|---|---|
| `GET /proxy/stream/:channelId` | Resolve + proxy the master HLS playlist for a channel |
| `GET /proxy/hls?url=<encoded>` | Proxy an HLS sub-playlist (used internally in rewritten playlists) |
| `GET /proxy/hls/seg/<encoded>.ts` | Proxy an HLS segment (`.ts` suffix satisfies FFmpeg's extension whitelist) |

The proxy is self-contained — all URLs inside a rewritten playlist point back through StalkerWeb, so the client only ever talks to StalkerWeb, never directly to the portal.

---

## Jellyfin Integration

StalkerWeb exposes an M3U playlist and an XMLTV guide feed that Jellyfin can consume directly as a Live TV source. All streams are served through the HLS proxy, so Jellyfin never needs to authenticate with the portal.

### 1. Connect StalkerWeb to your portal

Open **http://your-host:8983**, go to **Settings**, fill in your portal URL and MAC address, and click **Connect**. Wait for the channel list to load.

### 2. Add the M3U tuner in Jellyfin

1. Jellyfin Dashboard → **Live TV** → **Tuner Devices** → **Add**
2. Select **M3U Tuner**
3. Set the URL to:
   ```
   http://your-host:8983/api/m3u
   ```
4. Save.

Jellyfin will import all channels. Each entry points to `/proxy/stream/:id` so streams are resolved live through the proxy.

### 3. Add the XMLTV guide provider

StalkerWeb generates a synthetic 7-day XMLTV feed. Since the Stalker protocol doesn't expose real EPG data, each channel gets 1-hour programme blocks labelled with its genre — enough for Jellyfin's genre filters and guide grid to work.

1. Jellyfin Dashboard → **Live TV** → **Guide Providers** → **Add**
2. Select **XMLTV**
3. Set the URL to:
   ```
   http://your-host:8983/api/xmltv
   ```
4. Save and run a guide refresh.

> **Note:** `tvg-id` in the M3U matches `channel id=` in the XMLTV feed, so Jellyfin correctly links channels to guide data automatically.

### 4. Refresh channels

After adding both sources, go to **Live TV → Manage → Refresh Guide** in Jellyfin. Channels should appear in the Live TV section within a minute.

---

## Building from Source

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Development (hot-reload)
cd frontend && npm run dev     # UI at :5173
cd backend  && node server.js  # API at :8983

# Production build
cd frontend && npm run build
cd ..       && node backend/server.js  # serves UI + API at :8983

# Docker (local build)
docker-compose -f docker-compose.build.yml up --build
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/connect` | Connect to portal |
| `GET` | `/api/auth/status` | Session status |
| `DELETE` | `/api/auth/disconnect` | Disconnect |
| `PUT` | `/api/auth/config` | Save portal config without reconnecting |
| `GET` | `/api/channels` | List channels (`?group=`) |
| `GET` | `/api/channels/groups/all` | List genre groups |
| `GET` | `/api/epg` | Full EPG guide |
| `GET` | `/api/epg/:channelId` | EPG for one channel |
| `GET` | `/api/stream/:channelId` | Resolve stream URL |
| `GET` | `/api/favorites` | Get favorites (channels + groups) |
| `POST` | `/api/favorites/channels` | Add channel to favorites |
| `DELETE` | `/api/favorites/channels/:id` | Remove channel from favorites |
| `GET` | `/api/logos` | List channel logos |
| `POST` | `/api/logos` | Add logo override |
| `GET` | `/api/export/stbemu` | Download STBEmu backup JSON |

## License

MIT
