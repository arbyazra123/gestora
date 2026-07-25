# Production Dockerfile for Colyseus Server
# Optimized for Railway deployment
# Builds from workspace root to handle npm workspaces properly

FROM node:22-slim AS builder

# Install git (required by some npm dependencies)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace files
COPY package.json package-lock.json* ./
COPY server/package.json ./server/package.json

# Install all dependencies (including workspaces)
RUN npm install --workspace=server --include-workspace-root --omit=dev

# Copy server source
COPY server/src ./server/src

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy installed dependencies and source from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server

# Set working directory to server
WORKDIR /app/server

# Expose Colyseus port
EXPOSE 2567

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:2567/metrics', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "src/index.js"]
