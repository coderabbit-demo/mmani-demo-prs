FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web
ENV NODE_OPTIONS=--no-warnings=ExperimentalWarning
EXPOSE 8080
CMD ["node", "services/gateway/src/server.ts"]
