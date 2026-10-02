# Dockerfile for LunoxyTelebot
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install dependencies needed for node-gyp if any (e.g. python, make, g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy application source
COPY . .

# Build frontend production bundle
RUN npm run build

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
