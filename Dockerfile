# Build stage
FROM node:22.2.0-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client
COPY tsconfig.json ./

# Build all packages (shared → server → client)
RUN npm run build

# Production stage
FROM node:22.2.0-slim AS production

# Install dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install production dependencies only (skip prepare script / husky)
RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Copy drizzle config for migrations
COPY packages/server/drizzle.config.ts ./packages/server/
COPY packages/server/src/db ./packages/server/src/db

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

# Start server
CMD ["node", "packages/server/dist/index.js"]
