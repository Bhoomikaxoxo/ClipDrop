FROM node:20-slim

# Install system dependencies: ffmpeg, python3, curl, ca-certificates, yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install all workspace dependencies
RUN npm run install:all

# Copy source files
COPY . .

# Build Vite frontend bundle
RUN npm run build --prefix client

EXPOSE 5001

ENV PORT=5001
ENV NODE_ENV=production

CMD ["node", "server/src/index.js"]
