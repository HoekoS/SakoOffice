# Ships a pre-built bundle with a dependency-free Node server.
#
# Run `npm run build` on the host first — this image deliberately installs
# nothing. The server is Node stdlib only and the browser bundle already
# contains three and react, so there is no node_modules to fetch, and the
# build does not depend on npm registry access at all.
FROM node:22-alpine
WORKDIR /app
COPY dist ./dist
COPY server ./server
COPY package.json ./
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
