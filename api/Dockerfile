FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/database ./src/database
EXPOSE 3000
# миграции и сидинг дефолтных категорий — при каждом старте (оба идемпотентны)
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/database/seed.js && node dist/main.js"]
