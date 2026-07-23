FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ && \
    npm install -g pnpm@10.32.1

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# ---- Production image ----
FROM node:22-alpine AS production

RUN apk add --no-cache python3 make g++ dumb-init && \
    npm install -g pnpm@latest

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile --prod

# Pull generated Prisma client and compiled output from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3002

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "pnpm prisma migrate deploy && node ./dist/src/server.js"]
