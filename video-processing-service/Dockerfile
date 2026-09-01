# Build context is the REPOSITORY ROOT, not this directory:
#   docker build -f video-processing-service/Dockerfile .
# The service is an npm workspace and depends on packages/contract, so the
# whole workspace has to be visible to the installer.

FROM node:26-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contract/package.json ./packages/contract/
COPY yt-web-client/package.json ./yt-web-client/
COPY yt-api-service/functions/package.json ./yt-api-service/functions/
COPY video-processing-service/package.json ./video-processing-service/
RUN npm ci

COPY packages/contract ./packages/contract
COPY video-processing-service ./video-processing-service

RUN npm run build --workspace @yt/contract \
  && npm run build --workspace video-processing-service

FROM node:26-bookworm-slim AS runner

ENV NODE_ENV=production \
    PORT=3000

# ffmpeg and ffprobe are the transcoder; ffprobe is what lets the pipeline
# refuse to upscale a source that is already smaller than a rendition.
RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contract/package.json ./packages/contract/
COPY yt-web-client/package.json ./yt-web-client/
COPY yt-api-service/functions/package.json ./yt-api-service/functions/
COPY video-processing-service/package.json ./video-processing-service/
RUN npm ci --omit=dev --workspace video-processing-service --include-workspace-root \
  && npm cache clean --force \
  && mkdir -p raw-videos processed-videos \
  && chown -R node:node /app

# @yt/contract is a real runtime dependency here (unlike the web client, which
# bundles it), so its build output has to ship alongside the service.
COPY --from=builder --chown=node:node /app/packages/contract/dist ./packages/contract/dist
COPY --from=builder --chown=node:node /app/video-processing-service/dist ./video-processing-service/dist

USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "video-processing-service/dist/index.js"]
