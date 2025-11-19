FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Install git for simple-git, CA certificates for HTTPS, Chromium for puppeteer, and build tools for native modules
RUN apk add --no-cache \
    git \
    ca-certificates \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    python3 \
    make \
    g++

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data/documents

EXPOSE 3001

# Increase Node.js heap size to 4GB to handle large documents
CMD ["node", "--max-old-space-size=4096", "dist/index.js"]
