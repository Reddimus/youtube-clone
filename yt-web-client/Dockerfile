# Build context is the REPOSITORY ROOT, not this directory:
#   docker build -f yt-web-client/Dockerfile .
# The app is an npm workspace and depends on packages/contract, so the whole
# workspace has to be visible to the installer.

FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Every workspace manifest is required for `npm ci` to reproduce the root
# lockfile, even though only two of them are built here.
COPY package.json package-lock.json ./
COPY packages/contract/package.json ./packages/contract/
COPY yt-web-client/package.json ./yt-web-client/
COPY yt-api-service/functions/package.json ./yt-api-service/functions/
COPY video-processing-service/package.json ./video-processing-service/
RUN npm ci

COPY packages/contract ./packages/contract
COPY yt-web-client ./yt-web-client
# The web tsconfig type-checks vitest.config.mts, which imports this shared
# helper from the workspace root.
COPY vitest.shared.mjs ./

ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG NEXT_PUBLIC_PROCESSED_VIDEO_BUCKET
ARG NEXT_PUBLIC_SITE_URL
# Unset by default so a build that forgets to pass configuration falls back to
# the self-contained demo feed instead of silently shipping someone else's
# bucket, which is what the previous default did.
ARG NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY} \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN} \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID} \
    NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID} \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID} \
    NEXT_PUBLIC_PROCESSED_VIDEO_BUCKET=${NEXT_PUBLIC_PROCESSED_VIDEO_BUCKET} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}

# NEXT_PUBLIC_* values are inlined at build time, so a partially configured
# build would produce an app that cannot reach Firebase at all. Either supply
# the full set or none of it (demo mode).
RUN if [ -n "$NEXT_PUBLIC_FIREBASE_PROJECT_ID" ]; then \
      test -n "$NEXT_PUBLIC_FIREBASE_API_KEY" \
      && test -n "$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" \
      && test -n "$NEXT_PUBLIC_FIREBASE_APP_ID"; \
    fi

RUN npm run build --workspace @yt/contract \
  && npm run build --workspace yt-web-client

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

# The standalone bundle is laid out relative to the workspace root, so the
# server entry point lives under yt-web-client/.
COPY --from=builder --chown=node:node /app/yt-web-client/.next/standalone ./
COPY --from=builder --chown=node:node /app/yt-web-client/.next/static ./yt-web-client/.next/static
COPY --from=builder --chown=node:node /app/yt-web-client/public ./yt-web-client/public

USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "yt-web-client/server.js"]
