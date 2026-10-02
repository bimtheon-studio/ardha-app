# Image de production d'Ardha pour once (lot LD, D-13) : API, worker et front (servi par l'API) dans
# un seul conteneur, lancés par `dist/launcher/main.js`. Contrat de once : HTTP sur le port 80, santé
# sur `/up`, volume persistant `/storage`, hooks `/hooks/pre-backup` et `/hooks/post-restore`.
# PostgreSQL et Redis sont hors de l'image (D-13).
ARG NODE_IMAGE=node:26.10.0-trixie-slim

# Construction : back (swc) et front (Vite), aux versions de mise.toml.
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION=12.8.1
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .swcrc tsconfig.base.json tsconfig.json ./
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY src src
COPY frontend frontend
RUN pnpm build
# Dépendances d'exécution du back seulement.
RUN rm -rf node_modules frontend/node_modules \
 && pnpm install --frozen-lockfile --prod --filter ardha --ignore-scripts

# Exécution : Node, tini (signaux, processus orphelins), client PostgreSQL 18 pour les hooks.
FROM ${NODE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tini \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/frontend/dist frontend/dist
COPY drizzle drizzle
# Réponses enregistrées : seed des communes de référence sans Internet (environnements de PR).
COPY fixtures/http fixtures/http
COPY --chmod=755 docker/app/hooks /hooks
COPY --chmod=755 docker/app/ardha /usr/local/bin/ardha
RUN install -d -o node -g node /storage

# Rattache le paquet ghcr.io au dépôt (droits, page du paquet).
LABEL org.opencontainers.image.source=https://github.com/bimtheon-studio/ardha-app \
      org.opencontainers.image.description="Ardha : API, worker et front, pour once"
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=80 \
    TRUST_PROXY=1 \
    FILES_DRIVER=disk \
    FILES_DIR=/storage/files \
    FRONTEND_DIR=/app/frontend/dist
USER node
EXPOSE 80
VOLUME /storage
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/launcher/main.js"]
