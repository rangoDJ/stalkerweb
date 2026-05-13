# StalkerWeb

Self-hosted IPTV web app that replicates [Kodi's pvr.stalker](https://github.com/AlexELEC/pvr.stalker) functionality in a browser — no Kodi required.

[![Docker Build](https://github.com/rangoDJ/stalkerweb/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/rangoDJ/stalkerweb/actions/workflows/docker-publish.yml)

---

## Features

- 🔌 **Full Stalker Middleware protocol** — handshake, token auth, keep-alive watchdog
- 📺 **Channel grid** with genre group filtering
- 📅 **EPG guide** with scrollable timeline
- ▶️ **HLS.js video player** built-in
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
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3000
      - DATA_DIR=/app/data
```

```bash
docker-compose up -d
```

Then open **http://localhost:3000**, enter your portal URL and MAC address, and click **Connect**.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port to listen on |
| `DATA_DIR` | `/app/data` | Persistent storage path |
| `PORTAL_URL` | _(none)_ | Optional: auto-connect portal URL |
| `PORTAL_MAC` | _(none)_ | Optional: auto-connect MAC address |
| `PORTAL_TIMEZONE` | `Europe/London` | Optional: portal timezone |

## Building from Source

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Development (hot-reload)
cd frontend && npm run dev     # UI at :5173
cd backend  && node server.js  # API at :3000

# Production build
cd frontend && npm run build
cd ..       && node backend/server.js  # serves UI + API at :3000

# Docker
docker-compose -f docker-compose.build.yml up --build
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/connect` | Connect to portal |
| `GET` | `/api/auth/status` | Session status |
| `DELETE` | `/api/auth/disconnect` | Disconnect |
| `GET` | `/api/channels` | List channels (`?group=`) |
| `GET` | `/api/channels/groups/all` | List genre groups |
| `GET` | `/api/epg` | Full EPG guide |
| `GET` | `/api/epg/:channelId` | EPG for one channel |
| `GET` | `/api/stream/:channelId` | Resolve stream URL |

## License

MIT
