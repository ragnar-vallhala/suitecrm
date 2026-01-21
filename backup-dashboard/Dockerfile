FROM node:18-alpine

# Install Docker CLI so we can run docker commands from within this container (using the mounted socket)
RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
