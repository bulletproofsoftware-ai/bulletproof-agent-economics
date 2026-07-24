FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Template config — ${ECONOMICS_DASHBOARD_TOKEN} is substituted at container start
# by Docker's nginx entrypoint (envsubst on /etc/nginx/templates/*.conf.template)
RUN mkdir -p /etc/nginx/templates && rm -f /etc/nginx/conf.d/default.conf
COPY <<'EOF' /etc/nginx/templates/default.conf.template
map $http_upgrade $connection_upgrade { default upgrade; "" close; }
server {
  listen 80;
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

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
