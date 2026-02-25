# Stage 1: Build stage
FROM node:20-alpine AS build

# Install required packages for native dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files and prisma schema first for better caching
# This prevents re-installing dependencies if only source code changes
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code and other required assets
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine AS production

# Install runtime dependencies: 
# - tzdata for timezones
# - dumb-init for process management
# - curl for healthchecks
RUN apk add --no-cache tzdata dumb-init curl

# Set environment
ENV TZ=Asia/Manila
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy build artifacts and necessary files from build stage
# Using --chown during copy is more efficient than a separate RUN chown
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /app/email-template ./email-template
COPY --from=build --chown=nodejs:nodejs /app/package*.json ./
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules

# Prune devDependencies to keep the image small
RUN npm prune --production

# Switch to non-root user
USER nodejs

# Expose the application port (matched with config.ts and .env)
EXPOSE 3002

# Healthcheck to verify the container is running correctly
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

# Use dumb-init to handle signals properly (e.g., SIGTERM)
ENTRYPOINT ["dumb-init", "--"]

# Run migrations and start the application
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]