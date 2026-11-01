#!/usr/bin/env bash
# Installe le serveur des affiches (affiches/serveur.js) sur une machine Ubuntu 24.04 neuve (Oracle Cloud, offre
# gratuite, ARM) : Node 22, Caddy (https automatique, adresse <ip>.sslip.io), le service systemd et sa mise à jour toute
# seule depuis GitHub (toutes les 15 minutes). Relançable sans risque. Les secrets ne sont pas ici : /etc/affiches.env
# (voir affiches.env.exemple), écrit à part, jamais dans le dépôt.
#   curl -fsSL https://raw.githubusercontent.com/xnzx07/nuvio-assets/main/serveur/installer.sh | bash
set -euo pipefail
DEPOT=https://github.com/xnzx07/nuvio-assets
ICI=/opt/affiches/depot

echo "== paquets"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent unattended-upgrades
if ! node --version 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y caddy
fi

echo "== pare-feu (les images Oracle refusent tout sauf SSH : 80 et 443 ouverts avant la règle de refus)"
for p in 80 443; do
  sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 5 -p tcp -m state --state NEW --dport "$p" -j ACCEPT
done
sudo netfilter-persistent save

echo "== code (seulement ce qui sert ici : les affiches, l'addon et ses données)"
id affiches >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /opt/affiches --shell /usr/sbin/nologin affiches
if [ ! -d "$ICI/.git" ]; then
  sudo -u affiches git clone --depth 1 --filter=blob:none --sparse "$DEPOT" "$ICI"
fi
sudo -u affiches git -C "$ICI" sparse-checkout set affiches serveur worker data
sudo -u affiches git -C "$ICI" pull --ff-only
sudo -u affiches bash -c "cd $ICI/affiches && npm ci --omit=dev --no-audit --no-fund"

echo "== secrets"
if [ ! -f /etc/affiches.env ]; then
  sudo install -m 640 -o root -g affiches "$ICI/serveur/affiches.env.exemple" /etc/affiches.env
  echo "   /etc/affiches.env créé depuis l'exemple : à remplir (TMDB_API_KEY, RELAIS_KEY, CLOUDFLARE_API_TOKEN…)"
fi

echo "== https"
IP=$(curl -fsS https://api.ipify.org)
HOTE="${IP//./-}.sslip.io"
# Les catalogues et les fiches vont à l'addon (worker/oracle/serveur.mjs) ; tout le reste aux affiches.
printf '%s {\n\tencode gzip\n\t@addon path_regexp ^/([^/]+/)?(catalog|meta)/\n\thandle @addon {\n\t\treverse_proxy 127.0.0.1:8788\n\t}\n\thandle {\n\t\treverse_proxy 127.0.0.1:8080\n\t}\n}\n' "$HOTE" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo grep -q '^SERVEUR_URL=' /etc/affiches.env && sudo sed -i "s|^SERVEUR_URL=.*|SERVEUR_URL=https://$HOTE|" /etc/affiches.env \
  || echo "SERVEUR_URL=https://$HOTE" | sudo tee -a /etc/affiches.env >/dev/null

echo "== services"
sudo install -m 644 "$ICI/serveur/affiches.service" "$ICI/serveur/addon.service" "$ICI/serveur/affiches-maj.service" "$ICI/serveur/affiches-maj.timer" /etc/systemd/system/
sudo install -m 755 "$ICI/serveur/mettre-a-jour.sh" /usr/local/bin/affiches-mettre-a-jour
sudo systemctl daemon-reload
sudo systemctl enable --now affiches.service addon.service affiches-maj.timer
sudo systemctl restart affiches.service addon.service
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "== prêt : https://$HOTE/etat"
