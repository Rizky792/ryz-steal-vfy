FROM node:20-slim
WORKDIR /app

# Install dependencies (including devDeps — needed to build TypeScript).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source + circuit artifacts (wasm/zkey/vkey, ~4 MB total).
COPY tsconfig.json ./
COPY src ./src
COPY circuits ./circuits
COPY scripts ./scripts

RUN npm run build

# Drop dev-only files from the final image layer (deps stay; harmless).
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/index.js"]
