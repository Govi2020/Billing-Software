FROM node:24-bookworm-slim

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY backend/sql ./sql
COPY schema_new.sql /schema_new.sql

ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
