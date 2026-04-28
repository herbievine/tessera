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

# SPA config: listen on 3000, fall back to index.html for client-side routing
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
