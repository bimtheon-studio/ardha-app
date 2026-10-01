# PostgreSQL 18 + PostGIS 3.6 (image officielle) + pgvector compilé depuis son tag (D-10).
# Le dépôt PGDG ne garde que la dernière version de pgvector : la compiler depuis le tag rend
# l'image reproductible.
ARG PGVECTOR_VERSION=0.8.5

FROM postgis/postgis:18-3.6 AS pgvector
ARG PGVECTOR_VERSION
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential ca-certificates git postgresql-server-dev-18 \
 && git clone --depth 1 --branch "v${PGVECTOR_VERSION}" https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && make -C /tmp/pgvector OPTFLAGS="" \
 && make -C /tmp/pgvector install DESTDIR=/tmp/installation

FROM postgis/postgis:18-3.6
COPY --from=pgvector /tmp/installation/usr/lib/postgresql/18/lib/ /usr/lib/postgresql/18/lib/
COPY --from=pgvector /tmp/installation/usr/share/postgresql/18/extension/ /usr/share/postgresql/18/extension/
# L'image PostGIS crée les extensions dans la base par défaut au premier démarrage ; on n'en veut
# aucune d'office : c'est la première migration qui les déclare.
RUN rm -f /docker-entrypoint-initdb.d/*postgis*.sh
# Rattache le paquet ghcr.io (image de la CI) au dépôt.
LABEL org.opencontainers.image.source=https://github.com/bimtheon-studio/ardha-app
