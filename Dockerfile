FROM rust:1.95.0-slim-bookworm AS native-toolchain

FROM node:24.15.0-bookworm-slim AS build

COPY --from=native-toolchain /usr/local/cargo /usr/local/cargo
COPY --from=native-toolchain /usr/local/rustup /usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV RUSTUP_HOME=/usr/local/rustup
ENV PATH="/usr/local/cargo/bin:${PATH}"
RUN apt-get update \
  && apt-get install --no-install-recommends -y python3-venv curl xz-utils gcc libc6-dev ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV HUSKY=0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN corepack enable \
  && corepack prepare pnpm@10.29.3 --activate \
  && pnpm install --frozen-lockfile

COPY . .
RUN bash -c 'source scripts/setup-native-toolchain.sh && pnpm build' \
  && rm -rf node_modules

FROM node:24.15.0-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN corepack enable \
  && corepack prepare pnpm@10.29.3 --activate \
  && pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.cjs"]
