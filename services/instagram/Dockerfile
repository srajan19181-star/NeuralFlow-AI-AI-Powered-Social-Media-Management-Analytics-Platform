FROM node:26-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /services/instagram
COPY instagram/package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY utils ./utils
COPY instagram/ .
CMD ["node", "index.js"]
