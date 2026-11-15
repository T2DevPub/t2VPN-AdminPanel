FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npx prisma generate
RUN npm run build
RUN chmod +x scripts/docker-start.sh
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh","scripts/docker-start.sh"]
