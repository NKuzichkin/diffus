FROM node:14

run npm install -g parcel-bundler
WORKDIR /usr/src/app
COPY app/package*.json ./
RUN npm install
COPY app .
EXPOSE 1234
CMD [ "parcel", "index.html" ]