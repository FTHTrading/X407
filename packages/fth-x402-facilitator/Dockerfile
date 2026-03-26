# ===========================================================================
# FTH x402 Facilitator — Multi-stage Dockerfile
# ===========================================================================
# Build:  docker build -t fth-x402-facilitator -f packages/fth-x402-facilitator/Dockerfile .
# Run:    docker run --env-file .env -p 3100:3100 fth-x402-facilitator
#
# Must be built from monorepo root (context = .)

# ---------- Stage 1: Build ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root
COPY package.json package-lock.json* ./

# Copy all workspace packages (needed for npm workspace resolution)
COPY packages/fth-x402-facilitator/package.json packages/fth-x402-facilitator/
COPY packages/fth-x402-gateway/package.json packages/fth-x402-gateway/
COPY packages/fth-x402-sdk/package.json packages/fth-x402-sdk/
COPY packages/fth-x402-pricing/package.json packages/fth-x402-pricing/
COPY packages/fth-x402-core/package.json packages/fth-x402-core/
COPY packages/fth-metering/package.json packages/fth-metering/

# Install all dependencies
RUN npm install --workspace=packages/fth-x402-facilitator --include-workspace-root

# Copy facilitator source + fth-x402-core (cross-package import via rootDir: "..")
COPY packages/fth-x402-facilitator/ packages/fth-x402-facilitator/
COPY packages/fth-x402-core/ packages/fth-x402-core/

# Build TypeScript
RUN npm run x402:build:facilitator

# ---------- Stage 2: Production ----------
FROM node:22-alpine AS runtime

WORKDIR /app

# Security: run as non-root
RUN addgroup -g 1001 -S fth && adduser -u 1001 -S fth -G fth

# Copy built output + production deps
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/packages/fth-x402-facilitator/package.json packages/fth-x402-facilitator/
COPY --from=builder /app/packages/fth-x402-gateway/package.json packages/fth-x402-gateway/
COPY --from=builder /app/packages/fth-x402-sdk/package.json packages/fth-x402-sdk/
COPY --from=builder /app/packages/fth-x402-pricing/package.json packages/fth-x402-pricing/
COPY --from=builder /app/packages/fth-x402-core/package.json packages/fth-x402-core/
COPY --from=builder /app/packages/fth-metering/package.json packages/fth-metering/

RUN npm install --workspace=packages/fth-x402-facilitator --include-workspace-root --omit=dev

COPY --from=builder /app/packages/fth-x402-facilitator/dist/ packages/fth-x402-facilitator/dist/

# Copy migrations for DB setup at runtime
COPY db/migrations-x402/ db/migrations-x402/
COPY config/namespace-seed.json config/
COPY scripts/x402-db-setup.mjs scripts/
COPY scripts/x402-seed-namespaces.mjs scripts/

# Environment
ENV NODE_ENV=production
ENV PORT=3100
ENV HOST=0.0.0.0

EXPOSE 3100

USER fth

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "packages/fth-x402-facilitator/dist/fth-x402-facilitator/src/index.js"]
