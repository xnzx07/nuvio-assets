# Copie auto-hébergée du Catalogue FR (voir README, « Héberger ta propre copie »).
# Le Worker tourne tel quel avec wrangler dev : le runtime workerd de Cloudflare, en local.
# Cache et choix de l'hébergeur gardés dans le volume /data.
# Image de base fixée par son empreinte (multi-plateforme : amd64 et arm64) : la même à chaque construction,
# pas celle que le registre sert ce jour-là. Pour la mettre à jour : empreinte de la liste de manifestes de
# node:22-bookworm-slim (docker buildx imagetools inspect node:22-bookworm-slim).
FROM node:22-bookworm-slim@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9

# Certificats racines : l'image slim les retire, et sous Linux workerd ne lit que ceux du système (Node a les
# siens, pas lui). Sans eux, chaque appel https (TMDB…) échoue : « TLS peer's certificate is not trusted ».
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g wrangler@4.151.1 && npm cache clean --force

WORKDIR /app
COPY wrangler.toml catalogs.json ./
COPY worker ./worker
COPY data/imdb-ratings.bin data/sagas.json ./data/
COPY docker/entrypoint.sh ./docker/entrypoint.sh
# Le Worker tourne avec l'utilisateur « node » (voir entrypoint.sh) : il écrit son état de travail dans /app.
RUN chmod +x docker/entrypoint.sh && chown node:node /app

ENV INSTALLATION=docker \
    WRANGLER_SEND_METRICS=false \
    APP_DIR=/app
EXPOSE 8787
VOLUME /data
# État du conteneur (docker ps : healthy / unhealthy) : le manifeste de l'addon répond. Avec node, déjà là
# (pas de curl dans l'image slim) ; wrangler dev met quelques secondes à démarrer.
HEALTHCHECK --interval=1m --timeout=10s --start-period=1m --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/manifest.json').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/app/docker/entrypoint.sh"]
