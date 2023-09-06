FROM oven/bun as build
WORKDIR /app
COPY package.json bun.lockb .
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM golang:bullseye as mongo
RUN apt-get update
RUN apt-get install -y --no-install-recommends libkrb5-dev
WORKDIR /mongo-tools
RUN git clone https://github.com/mongodb/mongo-tools.git .
RUN ./make build

FROM debian:bullseye-slim as bun
RUN apt-get update
RUN apt-get install -y --no-install-recommends curl ca-certificates unzip
RUN curl -fsSL https://bun.sh/install | bash

FROM debian:bullseye-slim as finale
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=bun /root/.bun/bin/bun /usr/local/bin
COPY --from=mongo /mongo-tools/bin/mongodump /mongo-tools/bin/mongorestore /usr/local/bin
COPY --from=build /app/index.js .
ENTRYPOINT ["bun", "index.js"]
