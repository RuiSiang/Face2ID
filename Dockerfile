FROM node:18-alpine

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \ 
    pixman-dev \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev

RUN ln -sf python3 /usr/bin/python
RUN npm install npm@latest -g

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD [ "node", "app.js" ]
