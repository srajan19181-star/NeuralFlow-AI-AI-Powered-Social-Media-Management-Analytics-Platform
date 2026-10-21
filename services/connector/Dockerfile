FROM node:26-alpine
WORKDIR /services/connector
COPY connector/package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY utils ./utils
COPY connector/ .
CMD ["node", "index.js"]
