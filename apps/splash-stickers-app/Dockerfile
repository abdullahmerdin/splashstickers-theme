FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 10000

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10000

COPY package.json package-lock.json ./
COPY apps/splash-stickers-app/package.json apps/splash-stickers-app/package.json
COPY apps/splash-stickers-app/extensions/splash-storefront/package.json apps/splash-stickers-app/extensions/splash-storefront/package.json
COPY packages/design-contract/package.json packages/design-contract/package.json

RUN npm ci --omit=dev && npm cache clean --force

COPY apps/splash-stickers-app apps/splash-stickers-app
COPY packages/design-contract packages/design-contract

RUN npm run build:app

CMD ["npm", "run", "docker-start", "--workspace=@splash-stickers/app"]
