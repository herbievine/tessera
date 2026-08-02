# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lock ./

# Copy each workspace's package.json so bun can resolve the graph before copying full source
COPY api/package.json ./api/
COPY web/package.json ./web/

RUN bun install --frozen-lockfile

COPY api/ ./api/
COPY web/ ./web/

WORKDIR /app/web
RUN bun run build

# Production stage
FROM nginx:alpine AS runner

COPY web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
