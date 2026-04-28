FROM oven/bun:latest

WORKDIR /app

# Copy each workspace's package.json so bun can resolve the graph before copying full source
COPY package.json bun.lock ./
COPY api/package.json ./api/
COPY web/package.json ./web/

RUN bun install --frozen-lockfile

COPY api/ ./api/

RUN mkdir -p api/data

EXPOSE 3010

WORKDIR /app/api
CMD ["bun", "run", "src/index.ts"]
