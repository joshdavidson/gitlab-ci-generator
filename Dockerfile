# Runtime image assembled from the host-built bundles (dist/ + dist-server/) —
# same pattern as mcp-servers/planka: CI builds both first (npm ci && npm run
# build), then this image just runs them. The server bundle is self-contained
# (zero runtime deps), so no node_modules is copied. Build locally with:
#   npm ci && npm run build && docker build -t gitlab-ci-generator .
# Pinned base (no :latest); bump deliberately.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY dist ./dist
COPY dist-server ./dist-server
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "dist-server/main.js"]
