FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY public ./public
COPY openapi.yaml ./openapi.yaml

USER node
EXPOSE 8080

CMD ["node", "src/server.js"]
