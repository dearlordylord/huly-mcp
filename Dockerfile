FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive \
    GLAMA_VERSION="1.0.0" \
    LAZY_ENVS=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git && curl -fsSL https://deb.nodesource.com/setup_25.x | bash - && apt-get install -y --no-install-recommends nodejs && npm install -g mcp-proxy@6.2.0 pnpm@10.14.0 && node --version && curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR="/usr/local/bin" sh && uv python install 3.14 --default --preview && ln -s $(uv python find) /usr/local/bin/python && python --version && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
WORKDIR /app
RUN git clone https://github.com/dearlordylord/huly-mcp . && git checkout 7fd78696fcfbe07a2c98f262bd2e09bf193238bb
RUN pnpm install --frozen-lockfile && pnpm build
CMD ["node", "dist/index.cjs"]
