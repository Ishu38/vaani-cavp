#!/bin/sh
set -e

# Substitute environment variables in nginx config
export API_URL="${API_URL:-http://server:3001}"
envsubst '${API_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
