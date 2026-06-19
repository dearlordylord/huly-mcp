FROM node:20-bookworm-slim AS build

WORKDIR /app

ENV HUSKY=0

COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && corepack prepare pnpm@10.29.3 --activate \
  && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
  && rm -rf node_modules

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && corepack prepare pnpm@10.29.3 --activate \
  && pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.cjs"]
