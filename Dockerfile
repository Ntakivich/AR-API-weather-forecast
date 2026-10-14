# The suite only calls HTTP APIs, so it needs Node.js but no browsers (no Playwright browser image).
FROM node:24-slim

WORKDIR /suite

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .

CMD ["npm", "run", "test:in-container"]
