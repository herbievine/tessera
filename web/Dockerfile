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

RUN printf 'server {\n\
    listen 80;\n\
    server_name tessera.herbievine.com;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n\
server {\n\
    listen 80;\n\
    server_name api.tessera.herbievine.com;\n\
    location / {\n\
        proxy_pass http://api:3010;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
