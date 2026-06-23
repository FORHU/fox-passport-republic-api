FROM node:22-alpine

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# Copy package files and prisma schema first for better caching
COPY package*.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm prisma generate

# Copy project files
COPY . .

# Build the application
RUN pnpm build

# Optional: expose port for readability
EXPOSE 3002

CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm start"]