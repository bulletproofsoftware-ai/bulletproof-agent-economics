# =============================================================================
# Multi-stage Dockerfile for Agent Economics
# Stage 1: migrations — runs database migrations
# Stage 2: api — runs the Express API server
# =============================================================================

# --- Base ---
FROM node:20-alpine AS base
WORKDIR /app
# better-sqlite3 has no prebuilt binary for linux-musl-arm64 (Alpine on Apple
# Silicon), so it falls back to node-gyp, which needs a C++ toolchain + Python.
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev

# --- Build ---
FROM node:20-alpine AS build
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
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
CMD ["node", "dist/run-migrations.js"]

# --- API ---
FROM base AS api
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
EXPOSE 8097
CMD ["node", "dist/api/server.js"]
