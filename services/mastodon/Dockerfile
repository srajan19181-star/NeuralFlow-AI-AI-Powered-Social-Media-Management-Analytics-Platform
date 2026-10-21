FROM node:26-alpine
WORKDIR /services/mastodon
COPY mastodon/package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY utils ./utils
COPY mastodon/ .
CMD ["node", "index.js"]
