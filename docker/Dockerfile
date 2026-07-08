# Shared dev image for every app service (host, each game, the multiplayer
# server) — docker-compose.yml runs the same image with a different
# `command:` per service (npm run dev:host / dev:hand-sword / etc, already
# defined at the repo root). No production build here; this only exists to
# run the existing `npm run dev` workflow inside containers.
FROM node:22-slim

WORKDIR /app

# Copy just the manifests first so `npm install` is cached across rebuilds
# unless a package.json actually changes. This still fully installs at
# build time — the docker-compose bind mount overlays /app with live
# source at runtime, but named volumes over each node_modules path (see
# docker-compose.yml) get seeded from what's installed here, so the
# container ends up with a Linux-native node_modules even though the rest
# of /app comes from the (likely macOS/ARM) host filesystem.
COPY package.json package-lock.json ./
COPY host/package.json host/package.json
COPY games/hand-sword/package.json games/hand-sword/package.json
COPY games/tennis/package.json games/tennis/package.json
COPY games/pong/package.json games/pong/package.json
COPY server/package.json server/package.json

RUN npm install

COPY . .

EXPOSE 5151 5001 5002 5003 2567
