FROM node:22-alpine

RUN apk add --no-cache python3 make g++ dumb-init && \
    npm install -g pnpm@10.32.1

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3002

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "pnpm prisma migrate deploy && node ./dist/src/server.js"]
