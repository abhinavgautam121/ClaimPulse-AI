# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
ARG API_INTERNAL_URL=http://backend:8000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
# A bind-mounted source and one build step avoid copying node_modules between VFS layers.
RUN --mount=type=bind,target=/source --mount=type=tmpfs,target=/app,size=2147483648 \
    --mount=type=secret,id=proxy_ca --mount=type=tmpfs,target=/root/.npm \
    mkdir -p /app /release && cd /app && \
    cp /source/frontend/package.json /source/frontend/package-lock.json . && \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi && \
    npm ci --no-audit --no-fund && \
    cp -R /source/frontend/. /app/ && npm run build && \
    cp -R .next/standalone/. /release/ && \
    cp -R .next/static /release/.next/static
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /release/ ./
USER node
EXPOSE 3000
CMD ["node","server.js"]
