# --- Build stage ---
FROM node:24-slim AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile=false

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
COPY public ./public
COPY bin ./bin
COPY knowledge ./knowledge

RUN pnpm run build

# --- Runtime stage (prod deps only, no dev toolchain) ---
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/config ./config
COPY --from=build /app/bin ./bin
# Guidance markdown read at runtime by skill_knowledge.
COPY --from=build /app/knowledge ./knowledge
COPY package.json ./

# Persistent memory snapshot lives here — mount a volume at this path
ENV DATA_DIR=/app/.marketing-data
RUN mkdir -p /app/.marketing-data

# Railway injects PORT automatically; default 3333 for plain VPS/Docker
EXPOSE 3333
ENV HOST=0.0.0.0

CMD ["node", "./bin/cli.js", "dashboard"]
