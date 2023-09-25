FROM node:18-alpine

COPY ./config/faunalocal /root/.fauna-shell

RUN apk add --update --no-cache python3
RUN npm install -g fauna-shell
