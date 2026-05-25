# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    apk add --no-cache su-exec

WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Backend source
COPY backend/ ./backend/

# Frontend dist
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Data directory (will be volume-mounted)
RUN mkdir -p /app/data/cache && chown -R appuser:appgroup /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8983/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

ENV NODE_ENV=production \
    PORT=8983 \
    DATA_DIR=/app/data

EXPOSE 8983

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "backend/server.js"]
