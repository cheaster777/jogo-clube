# syntax=docker/dockerfile:1.7

FROM caddy:2.10.2-alpine
# The container runs with a read-only root file system.
ENV XDG_CONFIG_HOME=/tmp/config
ENV XDG_DATA_HOME=/tmp/data
COPY Caddyfile /etc/caddy/Caddyfile
COPY public /srv
