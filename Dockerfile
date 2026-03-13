FROM node:20-slim

WORKDIR /app

# Install build deps + Chromium for Puppeteer PDF generation
RUN apt-get update && apt-get install -y \
  python3 make g++ \
  chromium \
  fonts-liberation \
  fonts-noto-color-emoji \
  libgbm1 libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 \
  libxdamage1 libxrandr2 libcups2 libpango-1.0-0 libatspi2.0-0 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Puppeteer should use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install --include=dev

# Copy app source
COPY . .

# Build Next.js
RUN npm run build

# Remove build-only deps to save memory
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

# Create app-local data fallback dirs (NOT /data — that dir must only exist when Railway volume is mounted)
RUN mkdir -p /app/data/listings /app/data/inbox/raw_emails /app/data/inbox/processed_emails /app/data/listing-files

# Make start script executable
RUN chmod +x /app/start.sh

EXPOSE 8080

# Use start.sh which sets up env vars then execs next
CMD ["bash", "/app/start.sh"]
