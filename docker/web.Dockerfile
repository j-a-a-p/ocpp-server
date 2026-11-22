# Web server of the local stack: builds both UIs and serves them next to the
# reverse proxy for the API and the charger WebSocket, like Apache does in
# production. Build context is the repository root.

FROM node:22-bookworm-slim AS management-ui
WORKDIR /src
COPY management-ui/package.json management-ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY management-ui/ ./
RUN npm run build

FROM node:22-bookworm-slim AS resident-ui
WORKDIR /src
COPY resident-ui/package.json resident-ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY resident-ui/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/web/index.html /srv/www/index.html
COPY infra/web/favicon.svg /srv/www/favicon.svg
COPY --from=management-ui /src/dist /srv/www/management-ui
COPY --from=resident-ui /src/dist /srv/www/resident-ui
