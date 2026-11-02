# Standalone build: docker build -t mathhack-frontend .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
# Empty VITE_API_URL: the browser calls /api on the same origin and nginx proxies it to the Worker.
ENV VITE_API_URL=
RUN npx vite build

FROM nginx:1.27-alpine
# API_ORIGIN is the Worker, e.g. https://mathhack-api.your-subdomain.workers.dev
ENV API_ORIGIN=https://mathhack-api.YOUR-SUBDOMAIN.workers.dev
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
