FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npx prisma generate
# Database URL is available at runtime from Coolify secrets, not at Docker build time.
RUN DATABASE_URL='postgresql://build:build@localhost:5432/build?schema=public' npm run build
RUN chmod +x scripts/docker-start.sh
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh","scripts/docker-start.sh"]
