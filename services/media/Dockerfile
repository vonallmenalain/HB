# syntax=docker/dockerfile:1
#
# Medien-Dienst für die Container Station auf dem QNAP.
#
# Bauen im Projektstamm (nicht in diesem Ordner), weil npm-Workspaces das
# Wurzel-package-lock.json brauchen:
#   docker build -f services/media/Dockerfile -t hb-media .
#
# Bewusst bookworm-slim statt alpine: sharp bringt fertige Binärdateien für
# glibc mit, unter musl müsste libvips erst gebaut werden.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY services/media/package.json services/media/
RUN npm ci --workspace @hb/media --include-workspace-root

FROM deps AS build
WORKDIR /app
COPY services/media ./services/media
RUN npm run compile -w @hb/media

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY services/media/package.json services/media/
RUN npm ci --omit=dev --workspace @hb/media --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/services/media/dist ./services/media/dist

# Der Dienst schreibt ausschliesslich nach /cache; der Hörbuch-Ordner wird
# read-only eingehängt.
RUN mkdir -p /cache && chown -R node:node /cache
USER node

ENV HB_MEDIA_ROOT=/media \
    HB_CACHE_DIR=/cache \
    HB_HOST=0.0.0.0 \
    HB_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "services/media/dist/index.js"]
