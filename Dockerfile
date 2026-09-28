FROM node:24-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.ts ./
COPY calculations.mjs ./
COPY migrations ./migrations
COPY public ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "server.ts"]
