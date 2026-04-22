FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config as template (envsubst will process it at runtime)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Copy entrypoint script
COPY entrypoint.sh /docker-entrypoint.d/40-envsubst-api-url.sh
RUN chmod +x /docker-entrypoint.d/40-envsubst-api-url.sh

EXPOSE 8080

CMD ["/docker-entrypoint.d/40-envsubst-api-url.sh"]
