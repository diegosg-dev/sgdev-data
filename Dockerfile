# syntax=docker/dockerfile:1

# --- deps ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build site (uses fixture/public data until ETL fills volumes) ---
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# --- ETL runner (weekly cron via compose; implemented in M2) ---
FROM deps AS etl
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*
COPY . .
CMD ["npm", "run", "etl:help"]

# --- production static site (default target for plain `docker build`) ---
FROM caddy:2.10-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
