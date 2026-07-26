FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build
WORKDIR /app
COPY package*.json ./
# `npm ci` installs exactly what package-lock.json resolves, and fails if the
# lock and manifest disagree. `npm install` was free to pick newer transitive
# versions at build time, so two builds of the same commit could ship different
# dependency trees (OpenSSF Scorecard pinned-dependencies / npmCommand).
RUN npm ci
COPY . .
RUN npm run build

# nginx-unprivileged runs as the non-root `nginx` user (UID 101) and listens on
# 8080 by default — no root needed at runtime (dockle DS-0002 / opengrep
# missing-user). Same envsubst-on-/etc/nginx/templates entrypoint as nginx:alpine.
FROM nginxinc/nginx-unprivileged:alpine@sha256:18d67281256ded39ff65e010ae4f831be18f19356f83c60bc546492c7eb6dd23
COPY --from=build /app/dist /usr/share/nginx/html

# Template config — ${ECONOMICS_DASHBOARD_TOKEN} is substituted at container start
# by Docker's nginx entrypoint (envsubst on /etc/nginx/templates/*.conf.template).
# The base image already provisions /etc/nginx/templates; only clear the default
# server block that would otherwise also listen on 8080.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
USER nginx
COPY <<'EOF' /etc/nginx/templates/default.conf.template
map $http_upgrade $connection_upgrade { default upgrade; "" close; }
server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;

  # Docker's embedded DNS at 127.0.0.11. Without a resolver + a variable in
  # proxy_pass, nginx resolves economics-api once at config load and caches
  # that IP for the container's lifetime — so every time economics-api gets
  # recreated (a normal `docker compose up --build economics-api`), this
  # dashboard starts 502ing on every request until it is ALSO restarted.
  # The resolver + variable combination forces nginx to re-resolve per
  # request instead of caching indefinitely.
  resolver 127.0.0.11 valid=10s;

  # Auto-inject Authorization for the dashboard so the user never sees a login.
  # Token sourced from ECONOMICS_DASHBOARD_TOKEN env at container start.
  location /economics {
    set $economics_upstream http://economics-api:8097;
    proxy_pass $economics_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Authorization "Bearer ${ECONOMICS_DASHBOARD_TOKEN}";
    proxy_read_timeout 86400s;
  }

  location / {
    try_files $uri /index.html;
  }
}
EOF

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
