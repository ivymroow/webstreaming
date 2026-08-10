FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 8080
CMD ["node", "server/index.js"]
