# The Docker image: the API, the dashboard's static files, and the queue's
# consumers in one Node process. Node runs the TypeScript sources directly.

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
COPY . .
# Only the server, the dashboard and the packages they use; the Worker's
# toolchain (wrangler, workerd) doesn't run on Alpine and isn't needed.
RUN pnpm install --frozen-lockfile --filter "server..." --filter "dashboard..."
RUN pnpm --filter dashboard build
# Leave only the server's runtime dependencies.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod --filter "server..."

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/dashboard/dist ./apps/dashboard/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/server/src/main.ts"]
