# Build the frontend, then ship it with a dependency-free Node server.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# No npm install here: the server is stdlib-only and the bundle is already built.
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
