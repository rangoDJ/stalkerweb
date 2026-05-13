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
