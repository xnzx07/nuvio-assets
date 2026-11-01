#!/usr/bin/env bash
# Met le serveur à jour depuis GitHub (main) : les affiches si affiches/ ou serveur/ ont changé (tests du service avant de
# redémarrer), l'addon si worker/, data/, catalogs.json ou serveur/ ont changé (son code chargé pour essai). Un échec : on
# reste sur la version d'avant. Lancé par affiches-maj.timer.
set -euo pipefail
ICI=/opt/affiches/depot
# Le dépôt appartient au compte « affiches » : git refuse d'y travailler sous un autre compte.
g() { sudo -u affiches git -C "$ICI" "$@"; }
dans() { sudo -u affiches bash -c "cd '$ICI/affiches' && $1"; }
avant=$(g rev-parse HEAD)
g fetch --quiet --depth 1 origin main
apres=$(g rev-parse FETCH_HEAD)
[ "$avant" = "$apres" ] && exit 0
g reset --quiet --hard "$apres"
affiches=1; addon=1
if g diff --quiet "$avant" "$apres" -- affiches serveur; then affiches=0; fi
if g diff --quiet "$avant" "$apres" -- worker data catalogs.json serveur; then addon=0; fi
# L'addon n'est suivi qu'une fois installé et activé à la main (worker/ n'est même pas là avant) : jamais mis en service ici.
if ! systemctl is-enabled --quiet addon.service 2>/dev/null; then addon=0; fi
[ "$affiches$addon" = "00" ] && exit 0
if ! g diff --quiet "$avant" "$apres" -- affiches/package-lock.json; then dans "npm ci --omit=dev --no-audit --no-fund"; fi
retour() {
  echo "$1 : retour à $avant" >&2
  g reset --quiet --hard "$avant"
  dans "npm ci --omit=dev --no-audit --no-fund" >/dev/null 2>&1 || true
  exit 1
}
if [ "$affiches" = 1 ] && ! dans "env -u RELAIS_KEY node --test" >/tmp/affiches-tests.txt 2>&1; then retour "tests ratés"; fi
if [ "$addon" = 1 ] && ! sudo -u affiches bash -c "cd '$ICI' && ADDON_CACHE=/tmp/addon-essai node worker/oracle/serveur.mjs --essai" >/tmp/addon-essai.txt 2>&1; then retour "addon : code illisible"; fi
# Le service et sa mise à jour changent aussi parfois.
install -m 644 "$ICI/serveur/affiches.service" "$ICI/serveur/addon.service" "$ICI/serveur/affiches-maj.service" "$ICI/serveur/affiches-maj.timer" /etc/systemd/system/
install -m 755 "$ICI/serveur/mettre-a-jour.sh" /usr/local/bin/affiches-mettre-a-jour
systemctl daemon-reload
if [ "$affiches" = 1 ]; then systemctl restart affiches.service; fi
if [ "$addon" = 1 ]; then systemctl restart addon.service; fi
echo "à jour : $apres"
