FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --chmod=0644 diagnostico-tributario-2027-app.html ./
COPY --chmod=0755 scripts/serve-original.mjs ./scripts/serve-original.mjs
USER node
EXPOSE 3001
CMD ["node", "scripts/serve-original.mjs"]
