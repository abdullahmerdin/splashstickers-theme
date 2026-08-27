FROM node:22-alpine
RUN apk add --no-cache font-dejavu openssl

EXPOSE 10000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/splash-stickers-app/package.json apps/splash-stickers-app/package.json
COPY apps/splash-stickers-app/extensions/splash-storefront/package.json apps/splash-stickers-app/extensions/splash-storefront/package.json
COPY packages/design-contract/package.json packages/design-contract/package.json

RUN npm ci --include=dev

COPY apps/splash-stickers-app apps/splash-stickers-app
COPY packages/design-contract packages/design-contract

# Prisma client generation does not connect to the database. Keep build-time
# placeholders free of URLs and credentials; runtime validation requires the
# real values before migrations or the server can start.
RUN DATABASE_URL=build-placeholder \
    DIRECT_URL=build-placeholder \
    npx prisma generate --schema=apps/splash-stickers-app/prisma/schema.prisma \
    && npm run build:app \
    && npm prune --omit=dev \
    && npm cache clean --force

ENV HOST=0.0.0.0
ENV PORT=10000

CMD ["npm", "run", "docker-start", "--workspace=@splash-stickers/app"]
