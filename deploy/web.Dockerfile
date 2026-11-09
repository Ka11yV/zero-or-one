# 게임(정적 파일) 빌드 → Caddy가 HTTPS로 서비스하고 /api는 API 서버로 넘긴다
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY tests ./tests
RUN npx tsc --noEmit && npx vite build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
