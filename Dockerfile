FROM node:22-slim

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and config
COPY src/ ./src/
COPY tsconfig.json ./
COPY soul.md ./

# Install tsx for running TypeScript directly
RUN npm install -g tsx

# No exposed ports — Telegram long-polling only
# EXPOSE is intentionally omitted

CMD ["tsx", "src/index.ts"]
