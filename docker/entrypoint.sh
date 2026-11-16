#!/bin/sh
# Démarrage d'une copie Docker : les variables d'environnement du conteneur sont passées au Worker par un
# fichier .dev.vars lisible par lui seul (pas en arguments : la ligne de commande se voit avec ps), telles
# quelles (un mot de passe peut contenir des guillemets, #, = ou des espaces), puis le Worker écoute sur le
# port 8787, sans les droits root.
set -e
APP_DIR="${APP_DIR:-/app}"
DATA_DIR="${DATA_DIR:-/data}"
VARS="$APP_DIR/.dev.vars"

# Secret de l'espace hébergeur (signature du cookie et du jeton d'alerte), tiré au hasard la première fois
# et gardé dans le volume : il ne dépend ni du mot de passe ni des clés.
if [ -z "${HOTE_SECRET:-}" ]; then
  if [ ! -s "$DATA_DIR/hote-secret" ] && [ -w "$DATA_DIR" ]; then
    (umask 077; od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$DATA_DIR/hote-secret")
  fi
  [ -s "$DATA_DIR/hote-secret" ] && HOTE_SECRET=$(cat "$DATA_DIR/hote-secret")
fi

# Une ligne NOM=valeur par variable, entre guillemets simples (rien n'y est interprété) ; si la valeur en
# contient, entre accents graves, sinon entre guillemets doubles.
(umask 077; : > "$VARS")
for name in TMDB_API_KEY GEMINI_API_KEY GEMINI_PUBLIC TOP_10_KEY ADMIN_PASSWORD HOTE_SECRET INSTALLATION DEPOT; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || continue
  case "$value" in
    *"
"*) echo "$name contient un retour à la ligne : ignorée." >&2; continue ;;
  esac
  case "$value" in
    *"'"*) case "$value" in
      *'`'*) case "$value" in *'"'*) echo "$name contient à la fois ', \" et \` : ignorée." >&2; continue ;; esac; q='"' ;;
      *) q='`' ;;
    esac ;;
    *) q="'" ;;
  esac
  printf '%s=%s%s%s\n' "$name" "$q" "$value" "$q" >> "$VARS"
done

if [ -z "${TMDB_API_KEY:-}" ]; then
  echo "TMDB_API_KEY manquante : ajoute ta clé TMDB dans docker-compose.yml (environment)." >&2
fi
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "ADMIN_PASSWORD absent : pas d'espace hébergeur, donc pas de proposition de mise à jour." >&2
elif [ "${#ADMIN_PASSWORD}" -lt 10 ] || [ "$ADMIN_PASSWORD" = "choisis-un-mot-de-passe" ]; then
  echo "ADMIN_PASSWORD trop simple (10 caractères au moins, pas celui de l'exemple) : espace hébergeur fermé." >&2
fi

set --
# Derrière Cloudflare Tunnel ou un reverse proxy en https : l'adresse publique, pour que les liens du
# site et de l'addon soient en https://ton-domaine (sinon http://, bloqué par le navigateur).
if [ -n "${ADRESSE_PUBLIQUE:-}" ]; then
  host=$(printf '%s' "$ADRESSE_PUBLIQUE" | sed -e 's#^[A-Za-z]*://##' -e 's#/.*$##')
  set -- "$@" --local-upstream "$host" --upstream-protocol https
fi
cd "$APP_DIR"

# Lancé en root (cas normal) : le volume et le fichier des clés passent à l'utilisateur « node », qui fait
# tourner le Worker. Seuls les fichiers qui ne sont pas encore à lui sont modifiés (pas tout le cache à chaque
# démarrage, long sur un NAS ou une carte SD).
run=""
if [ "$(id -u)" = "0" ] && id node >/dev/null 2>&1 && command -v setpriv >/dev/null 2>&1; then
  find "$DATA_DIR" \( ! -user node -o ! -group node \) -exec chown -h node:node {} +
  chown node:node "$VARS"
  run="setpriv --reuid=node --regid=node --init-groups --"
  export HOME=/home/node
fi
# Les listes Top des plateformes (avec TOP_10_KEY ou, sans clé, celles de l'addon d'origine) : la tâche que Cloudflare
# lance seul, ici lancée par planifie.js sur /__scheduled (--test-scheduled).
if [ -f "$APP_DIR/docker/planifie.js" ]; then
  set -- "$@" --test-scheduled
  $run node "$APP_DIR/docker/planifie.js" &
fi
# --log-level warn : pas une ligne par requête (les adresses contiennent les réglages, parfois une clé Gemini).
exec $run wrangler dev --local --ip 0.0.0.0 --port 8787 --persist-to "$DATA_DIR" --show-interactive-dev-session=false --log-level warn "$@"
