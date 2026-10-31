FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js query.js ./
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node","server.js"]
