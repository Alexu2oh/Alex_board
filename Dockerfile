FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/boards.sqlite
EXPOSE 3000
CMD ["node", "server.mjs"]
