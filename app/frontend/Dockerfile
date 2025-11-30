FROM node:20-alpine AS build
WORKDIR /usr/src/app

ARG API_BASE_URL
ENV API_BASE_URL=${API_BASE_URL}

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
