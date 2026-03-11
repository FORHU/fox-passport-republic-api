FROM node:22-alpine

WORKDIR /app

# Copy package files and prisma schema first for better caching
# This prevents re-installing dependencies if only source code changes
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --legacy-peer-deps

# Generate Prisma client
RUN npx prisma generate

RUN npm run build

# Optional: expose port for readability
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]