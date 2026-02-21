FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Create data directory for SQLite
RUN mkdir -p data

# Expose port
EXPOSE 3010

# Run the application
CMD ["bun", "run", "src/index.ts"]
