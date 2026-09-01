# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# FFmpeg: required for server-side remux/transcode of UDP/RTP/RTSP channels.
# Ships with ffprobe (used for codec detection) and all necessary demuxers/muxers.
RUN apk add --no-cache ffmpeg

# Backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Backend source
COPY backend/ ./backend/

# Frontend dist
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Data directory (will be volume-mounted)
RUN mkdir -p /app/data/cache

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8983/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

# Set at build time via `--build-arg APP_VERSION=v1.2.3` (release.yml does this
# from the pushed git tag); defaults to "dev" for local/manual builds.
ARG APP_VERSION=dev

ENV NODE_ENV=production \
    PORT=8983 \
    DATA_DIR=/app/data \
    APP_VERSION=$APP_VERSION

EXPOSE 8983

CMD ["node", "backend/server.js"]
