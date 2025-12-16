FROM node:22-alpine

WORKDIR /app

# Install tzdata so the container supports timezones
RUN apk add --no-cache tzdata

# Set default timezone
ENV TZ=Asia/Manila

COPY package*.json tsconfig.json ./

RUN npm install 

COPY . .

RUN npx prisma generate

RUN npm run build

# Optional: expose port for readability
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]