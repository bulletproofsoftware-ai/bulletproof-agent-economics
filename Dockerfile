# =============================================================================
# Multi-stage Dockerfile for Agent Economics
# Stage 1: migrations — runs database migrations
# Stage 2: api — runs the Express API server
# =============================================================================

# --- Base ---
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS base
WORKDIR /app
# better-sqlite3 has no prebuilt binary for linux-musl-arm64 (Alpine on Apple
# Silicon), so it falls back to node-gyp, which needs a C++ toolchain + Python.
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev

# --- Build ---
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
COPY migrations/ migrations/
RUN npx tsc

# --- Migrations ---
FROM base AS migrations
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
# Drop root — the node:20-alpine base image ships a non-root `node` user.
USER node
CMD ["node", "dist/run-migrations.js"]

# --- API ---
FROM base AS api
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
# Drop root — the node:20-alpine base image ships a non-root `node` user.
USER node
EXPOSE 8097
CMD ["node", "dist/api/server.js"]
