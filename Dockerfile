FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY --chmod=0644 diagnostico-tributario-2027-app.html ./
COPY scripts ./scripts
COPY original ./original
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist-original ./dist-original
COPY shared ./shared
COPY server ./server
USER node
EXPOSE 3001
CMD ["npm", "run", "start:container"]
