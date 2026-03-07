FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/signal-simulator/package.json packages/signal-simulator/
COPY packages/ingestion-gateway/package.json packages/ingestion-gateway/
COPY packages/stream-processor/package.json packages/stream-processor/
COPY packages/anomaly-engine/package.json packages/anomaly-engine/
COPY packages/api-server/package.json packages/api-server/

RUN npm install --production=false

COPY tsconfig.base.json ./
COPY packages/ packages/

EXPOSE 3000 3100
