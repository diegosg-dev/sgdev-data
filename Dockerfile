# syntax=docker/dockerfile:1

# --- deps ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- build site (uses fixture/public data until ETL fills volumes) ---
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# --- ETL runner (weekly cron via compose) ---
FROM deps AS etl
WORKDIR /app
COPY . .
CMD ["npm", "run", "etl"]

# --- production static site (default target for plain `docker build`) ---
FROM caddy:2.10-alpine AS web
# Clear file capabilities so Caddy executes cleanly under cap_drop: ALL (binds unprivileged :8080)
RUN setcap -r /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
