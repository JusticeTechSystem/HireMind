FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ARG VITE_CONTACT_EMAIL
RUN pnpm install --frozen-lockfile=false && pnpm --filter "./packages/*" build && pnpm --filter @hiremind/web build

FROM nginx:1.27-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
