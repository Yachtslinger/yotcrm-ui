FROM node:20-slim

WORKDIR /app

# Install build deps + Chromium for Puppeteer PDF generation + Python for PDF parsing
RUN apt-get update && apt-get install -y \
  python3 python3-pip make g++ \
  chromium \
  fonts-liberation \
  fonts-noto-color-emoji \
  libgbm1 libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 \
  libxdamage1 libxrandr2 libcups2 libpango-1.0-0 libatspi2.0-0 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Install Python PDF parsing libraries (needed at runtime for /api/brochures/scrape-pdf)
RUN pip3 install pdfplumber pypdf --break-system-packages --quiet

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

# Remove build-only C++ deps to save memory (keep python3 — needed for PDF scraping at runtime)
RUN apt-get purge -y make g++ && apt-get autoremove -y

# Create app-local data fallback dirs (NOT /data — that dir must only exist when Railway volume is mounted)
RUN mkdir -p /app/data/listings /app/data/inbox/raw_emails /app/data/inbox/processed_emails /app/data/listing-files

# Make start script executable
RUN chmod +x /app/start.sh

EXPOSE 8080

# Use start.sh which sets up env vars then execs next
CMD ["bash", "/app/start.sh"]
