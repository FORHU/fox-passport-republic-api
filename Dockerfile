FROM node:22-alpine

# Enable pnpm (bundled with Node via corepack - no npm install needed)
RUN corepack enable pnpm

WORKDIR /app

# Copy package files and prisma schema first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm exec prisma generate

# Copy project files
COPY . .

# Build the application
RUN pnpm build

# Optional: expose port for readability
EXPOSE 6002

CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]