# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.14.0

FROM node:${NODE_VERSION}-alpine AS frontend-deps
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

FROM frontend-deps AS frontend-build
WORKDIR /workspace
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY . .
RUN npm run lint && npm run build

FROM frontend-deps AS api-build
WORKDIR /workspace
COPY . .
RUN npm run server:build && npm run server:bundle

FROM caddy:2.10.2-alpine AS frontend
COPY --from=frontend-build /workspace/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

FROM node:${NODE_VERSION}-alpine AS api-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION}-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=api-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --from=api-build --chown=node:node /workspace/dist-server ./dist-server
COPY --chown=node:node scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=node:node database/migrations ./database/migrations

EXPOSE 3001
USER node
CMD ["sh", "-c", "npm run db:migrate && node dist-server/index.js"]
