FROM node:20-bullseye-slim

WORKDIR /usr/src/app

# Install build dependencies for sqlite3 native bindings
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "run", "start"]
