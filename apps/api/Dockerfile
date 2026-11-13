# syntax=docker/dockerfile:1
# The API, the worker and the maintenance commands (migrate, encrypt-bank) in one image. Build from the ROOT of the repository:
#   docker build -f apps/api/Dockerfile -t workshop-api .
# Only the compiled code and the production dependencies reach the final image: no source, no dev tools, no secret (the settings come from the environment when it runs).
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter api build

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter api...

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
# the same layout as in the repository: the packages live in /app/node_modules/.pnpm and apps/api/node_modules links to them
COPY --from=deps /repo/node_modules /app/node_modules
COPY --from=deps /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
COPY apps/api/package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# the worker uses the same image with `node dist/main.worker.js`; the migration with `node dist/migrate.js`
CMD ["node", "dist/main.js"]
