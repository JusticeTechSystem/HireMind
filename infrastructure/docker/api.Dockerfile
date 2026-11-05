FROM node:22-slim AS build
RUN corepack enable && apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm exec prisma generate \
 && pnpm --filter "./packages/*" build && pnpm --filter @justiceview/api build

FROM node:22-slim
RUN corepack enable && apt-get update && apt-get install -y openssl fonts-noto-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
ENV PDF_FONT_PATH=/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf
EXPOSE 3000
USER node
# Run migrations as a separate release step (see docs/deployment.md), not on every container start.
CMD ["node", "apps/api/dist/main.js"]
