# Runtime image assembled from the host-built bundle (dist/) — same pattern as
# mcp-servers/planka: CI builds dist/ first (npm ci && npm run build), then this
# image just serves it. Build locally with:
#   npm ci && npm run build && docker build -t gitlab-ci-generator .
# Pinned base (no :latest); bump deliberately.
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 80
