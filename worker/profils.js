/**
 * Mes profils (salle 2) : un lien fixe par membre de la famille, chacun son accueil dans son profil Nuvio. Nuvio ne dit
 * pas à l'addon quel profil regarde : il faut un lien par personne. Le lien principal garde la liste des autres (pf dans
 * ses réglages : leurs liens et leurs clés de modification), secrète comme la clé Gemini : jamais dans la page d'un lien
 * fixe, relue avec la clé du principal (POST /lien-fixe/<id>/lire). Un autre appareil retrouve donc tous les profils avec
 * le « lien pour modifier » du principal. Ce navigateur se souvient du principal (profil-principal) : la barre s'affiche
 * aussi sur la page d'un autre profil.
 *
 * Un enfant part de la programmation « Famille » du guichet, avec l'âge choisi (Mode famille) ; un adulte, d'une copie
 * du profil en cours. « Tout envoyer dans Nuvio » (compte-nuvio.js) envoie ensuite chaque profil au profil Nuvio du même nom.
 */
import { MAX_PROFILS } from "./config.js";

export const PRINCIPAL = "profil-principal";

export const PROFILS_HTML = `
      <div class="profils" id="profils" role="region" aria-labelledby="profils-titre" hidden>
        <p class="profils-titre"><b id="profils-titre">Mes profils</b><small id="profils-aide">Un lien par personne : chacun son accueil, dans son profil Nuvio.</small></p>
        <div class="profils-liste" id="profils-liste"></div>
        <p class="profils-err" id="profils-err" role="alert"></p>
      </div>
      <dialog id="profil-dialog" aria-labelledby="profil-dlg-titre">
        <form method="dialog" id="profil-form">
          <div class="coll-dlg-head"><h2 id="profil-dlg-titre">Nouveau profil</h2><button type="button" class="btn line" id="profil-fermer">Fermer</button></div>
          <div class="coll-dlg-body" id="profil-etape1">
            <label class="profil-champ"><span>Son prénom</span><input type="text" class="plain" id="profil-nom" maxlength="40" autocomplete="off" spellcheck="false" required placeholder="Léo"><small>C'est aussi le nom de son addon dans Nuvio. Donne-lui le même nom que son profil Nuvio : « Tout envoyer dans Nuvio » les associe tout seul.</small></label>
            <fieldset class="profil-qui">
              <legend>Pour qui ?</legend>
              <label><input type="radio" name="profil-qui" value="enfant" checked><span><b>Un enfant</b><small>La programmation Famille : dessins animés, aventures, rien qui fait peur.</small></span></label>
              <label><input type="radio" name="profil-qui" value="adulte"><span><b>Un adulte</b><small>Une copie de ce profil, à changer ensuite.</small></span></label>
            </fieldset>
            <div class="profil-champ" id="profil-age-champ"><span id="profil-age-titre">L'âge du plus jeune</span><div class="seg" id="profil-age" role="group" aria-labelledby="profil-age-titre"></div></div>
            <button type="submit" class="btn solid" id="profil-creer">Créer le profil</button>
          </div>
          <div class="coll-dlg-body" id="profil-etape2" hidden>
            <p class="profil-pret" id="profil-pret" tabindex="-1"></p>
            <p class="sub">Dans Nuvio, crée son profil avec le même nom (et sans « utiliser les addons du profil principal »), puis envoie-le avec « Tout envoyer dans Nuvio ». Ou installe son lien à la main depuis sa page.</p>
            <div class="profil-suite"><a class="btn solid" id="profil-regler">Régler son profil</a><a class="btn line" id="profil-envoyer">Tout envoyer dans Nuvio</a></div>
          </div>
        </form>
      </dialog>`;

export const PROFILS_CSS = `/* ---------- Mes profils (worker/profils.js) ---------- */
.profils { display: grid; gap: 10px; padding: 14px 18px; border-radius: 14px; border: 1px solid var(--seat); background: var(--velvet-2); }
.profils-titre { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.profils-titre b { font: 700 .78rem var(--body); letter-spacing: .16em; text-transform: uppercase; color: var(--bulb); }
.profils-titre small { color: var(--dim); font-size: .9rem; }
.profils-liste { display: flex; flex-wrap: wrap; gap: 8px; }
.profil { display: inline-flex; align-items: stretch; border-radius: 99px; border: 1.5px solid var(--seat); background: var(--velvet); overflow: hidden; }
.profil a, .profil button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 16px; border: 0; background: none; color: var(--cream); font: 700 .95rem var(--body); text-decoration: none; cursor: pointer; }
.profil a:hover, .profil button:hover { background: rgba(255,207,107,.1); }
.profil .initiale { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--seat); color: var(--cream); font: 800 .8rem var(--body); flex: none; }
.profil.ici { border-color: var(--bulb); }
.profil.ici .initiale { background: var(--bulb); color: var(--ink); }
.profil .tag { font: 800 .62rem var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.profil .retirer { padding: 8px 12px; color: var(--dim); border-left: 1px solid var(--seat); }
.profil .retirer:hover { color: #ffb4a8; }
.profil.ajout { border-style: dashed; border-color: rgba(255,207,107,.6); }
.profil.ajout button { color: var(--bulb); }
.profils-err { margin: 0; color: #ffb4a8; font-weight: 600; }
.profils-err:empty { display: none; }
#profil-dialog { color-scheme: light; width: min(560px, calc(100vw - 24px)); max-height: calc(100vh - 32px); padding: 0; border: 2px solid var(--ink); border-radius: 14px; background: var(--cream); color: var(--ink); }
#profil-dialog::backdrop { background: rgba(5,3,4,.72); }
#profil-dialog .coll-dlg-body { display: grid; gap: 16px; }
.profil-champ { display: grid; gap: 6px; }
.profil-champ > span { font: 700 .72rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: #5b4636; }
.profil-champ small { color: #5b4636; font-size: .85rem; line-height: 1.4; }
#profil-dialog input.plain { font: 600 1.05rem var(--body); padding: 10px 12px; border-radius: 8px; border: 1.5px solid #5b4636; background: #fffaf0; color: var(--ink); }
.profil-qui { margin: 0; padding: 0; border: 0; display: grid; gap: 8px; }
.profil-qui legend { padding: 0; margin-bottom: 6px; font: 700 .72rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: #5b4636; }
.profil-qui label { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; border: 1.5px solid rgba(42,26,20,.3); cursor: pointer; }
.profil-qui label:has(input:checked) { border-color: var(--red); background: rgba(229,65,58,.08); }
.profil-qui input { margin-top: 3px; accent-color: var(--red); }
.profil-qui b { display: block; }
.profil-qui small { color: #5b4636; }
#profil-dialog .seg button { background: #fffaf0; color: #5b4636; }
#profil-dialog .seg button[aria-pressed="true"] { background: var(--ink); color: var(--cream); }
#profil-dialog .btn.solid { justify-self: start; }
#profil-dialog .sub { margin: 0; color: #5b4636; }
.profil-pret { margin: 0; font: 800 1.15rem var(--body); color: var(--red); }
.profil-suite { display: flex; flex-wrap: wrap; gap: 8px; }
`;

export const PROFILS_JS = `// ---------- Mes profils : un lien fixe par personne (worker/profils.js) ----------
// Lu après salle2.js et le guichet : state, fixe, update, fixesLus, fixeGarde, PROG… sont les leurs.
const PROFILS_MAX = ${MAX_PROFILS};
let profilsEtat = null;   // { principal: id, liste: [{ i, m, n }] } (le principal en tête)
function principalLu() { try { return localStorage.getItem(${JSON.stringify(PRINCIPAL)}) || ""; } catch (e) { return ""; } }
function principalGarde(id) { try { localStorage.setItem(${JSON.stringify(PRINCIPAL)}, id); } catch (e) {} }
async function lienLu(i, m) {
  const r = await fetch(D.origin + "/lien-fixe/" + i + "/lire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modif: m }) });
  if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? "perdu" : "réseau");
  return r.json();
}
function profilsErreur(t) { $("profils-err").textContent = t || ""; }
const estPrincipal = () => !!(profilsEtat && fixe && profilsEtat.principal === fixe.id);
const pageDe = (i) => D.origin + "/" + i + "/configure";

// Appelée par salle2.js quand les secrets du lien fixe en cours sont lus (j : sa réponse, avec pf).
async function profilsLus(j) {
  if (!fixe || !fixe.modif) return dessineProfils();
  const ici = fixe.id;
  let principal = ici, autres = state.pf || [], nomPrincipal = state.n;
  if (!autres.length) {
    // Ce lien n'a pas de profils : peut-être l'un des profils du principal gardé par ce navigateur.
    const p = principalLu(), m = p && p !== ici ? fixesLus()[p] : "";
    if (m) {
      try {
        const pj = await lienLu(p, m);
        if ((pj.pf || []).some((x) => x.i === ici)) { principal = p; autres = pj.pf; nomPrincipal = pj.n || ""; }
      } catch (e) { /* principal injoignable : ce profil seul */ }
    }
  }
  if (principal === ici && autres.length) principalGarde(ici);
  // Les clés de chacun dans ce navigateur : un clic sur un profil ouvre sa page, prête à modifier.
  autres.forEach((x) => fixeGarde(x.i, x.m));
  const liste = [{ i: principal, m: fixesLus()[principal] || "", n: nomPrincipal }, ...autres.map((x) => ({ i: x.i, m: x.m, n: "" }))];
  profilsEtat = { principal, liste };
  dessineProfils();
  // Les noms des autres : ceux de leurs liens (leur nom d'addon).
  await Promise.all(liste.map(async (x) => {
    if (x.i === ici || x.n) return;
    try { x.n = (await lienLu(x.i, x.m)).n || ""; } catch (e) { x.n = ""; x.perdu = true; }
  }));
  dessineProfils();
  if (estPrincipal() && /nouveau-profil/.test(hashDepart || "")) ouvreNouveauProfil();
}

function dessineProfils() {
  const box = $("profils"), liste = $("profils-liste");
  // Un lien fixe que ce navigateur ne peut pas modifier : pas de profils à gérer ici.
  box.hidden = !D.fixedOk || !!(fixe && !fixe.modif);
  if (box.hidden) return;
  liste.textContent = "";
  if (!fixe) {
    $("profils-aide").textContent = "Un profil par personne (un enfant, ton conjoint…) : crée d'abord ton lien fixe, dans ton billet.";
    liste.append(el("span", { class: "profil ajout" }, el("button", { type: "button", text: "Voir mon billet", onclick: () => { $("fixe").scrollIntoView({ behavior: "smooth", block: "center" }); } })));
    return;
  }
  $("profils-aide").textContent = "Un lien par personne : chacun son accueil, dans son profil Nuvio.";
  const tous = profilsEtat ? profilsEtat.liste : [{ i: fixe.id, n: state.n }];
  tous.forEach((x, rang) => {
    const ici = x.i === fixe.id, nom = (ici ? state.n : x.n) || (rang ? "Profil " + (rang + 1) : "Principal");
    const lien = el("a", { href: pageDe(x.i), "aria-current": ici ? "page" : null },
      el("span", { class: "initiale", "aria-hidden": "true", text: nom.trim().charAt(0).toUpperCase() || "?" }), nom,
      rang === 0 && tous.length > 1 ? el("span", { class: "tag", text: "principal" }) : null);
    if (ici) lien.addEventListener("click", (e) => e.preventDefault());
    const bloc = el("span", { class: "profil" + (ici ? " ici" : "") }, lien);
    if (rang > 0 && estPrincipal()) bloc.append(el("button", { type: "button", class: "retirer", "aria-label": "Retirer " + nom + " de mes profils", text: "✕", onclick: () => retireProfil(x, nom) }));
    liste.append(bloc);
  });
  // Pas avant que les profils du lien soient relus (secrets) : un profil ajouté plus tôt les effacerait. D'un autre
  // profil : sur la page du principal, qui garde la liste.
  if (profilsEtat && tous.length - 1 < PROFILS_MAX) {
    const ajout = estPrincipal()
      ? el("button", { type: "button", text: "+ Ajouter un profil", onclick: ouvreNouveauProfil })
      : el("a", { href: pageDe(profilsEtat.principal) + "#nouveau-profil", text: "+ Ajouter un profil" });
    liste.append(el("span", { class: "profil ajout" }, ajout));
  }
}

function retireProfil(x, nom) {
  if (!confirm("Retirer « " + nom + " » de tes profils ? Son lien marche encore dans Nuvio tant que tu n'y retires pas son addon.")) return;
  state.pf = (state.pf || []).filter((p) => p.i !== x.i);
  profilsEtat.liste = profilsEtat.liste.filter((p) => p.i !== x.i);
  update(); dessineProfils();
  effet("toast", "« " + nom + " » n'est plus dans tes profils.");
}

// Le nouveau profil : enfant (programmation Famille, âge choisi) ou adulte (copie de celui-ci).
let profilAge = 10;
function dessineAgeProfil() {
  seg($("profil-age"), D.ages.map((a) => a[1]), Math.max(0, D.ages.findIndex((a) => a[0] === profilAge)), (n) => { profilAge = D.ages[n][0]; dessineAgeProfil(); });
}
function quiProfil() { return (document.querySelector('input[name="profil-qui"]:checked') || {}).value || "enfant"; }
function ouvreNouveauProfil() {
  if (!estPrincipal()) return;
  $("profil-etape1").hidden = false; $("profil-etape2").hidden = true;
  $("profil-nom").value = ""; profilAge = 10; dessineAgeProfil();
  $("profil-age-champ").hidden = quiProfil() !== "enfant";
  $("profil-dialog").showModal(); $("profil-nom").focus();
}
document.querySelectorAll('input[name="profil-qui"]').forEach((r) => r.addEventListener("change", () => { $("profil-age-champ").hidden = quiProfil() !== "enfant"; }));
$("profil-fermer").addEventListener("click", () => $("profil-dialog").close());
$("profil-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nom = $("profil-nom").value.replace(/[<>]/g, "").trim().slice(0, 40);
  if (!nom) { $("profil-nom").focus(); return; }
  const btn = $("profil-creer"), label = btn.textContent;
  // Pas de profils dans le profil d'un autre, ni le jeton d'alerte d'une copie ; la clé Gemini suit (la même famille).
  const base = { ...clone(state), n: nom, al: "", pf: [] };
  const nouveau = quiProfil() === "enfant" ? { ...base, ...PROG.prete(D, "famille"), n: nom, g: state.g, k: state.k, al: "", pf: [], f: profilAge } : base;
  const c = compact(nouveau), segNouveau = Object.keys(c).length ? enc(c) : "";
  btn.disabled = true; btn.textContent = "Création…"; profilsErreur("");
  try {
    const r = await fetch(D.origin + "/lien-fixe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: segNouveau }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(j.error || "Création impossible : réessaie dans un instant.");
    fixeGarde(j.id, j.modif);
    state.pf = [...(state.pf || []), { i: j.id, m: j.modif }];
    principalGarde(fixe.id);
    if (!profilsEtat) profilsEtat = { principal: fixe.id, liste: [{ i: fixe.id, m: fixe.modif, n: state.n }] };
    profilsEtat.liste.push({ i: j.id, m: j.modif, n: nom });
    update(); dessineProfils();
    $("profil-pret").textContent = "Le profil « " + nom + " » est prêt ✓";
    $("profil-regler").href = pageDe(j.id);
    $("profil-envoyer").href = D.origin + "/compte-nuvio";
    $("profil-etape1").hidden = true; $("profil-etape2").hidden = false; $("profil-pret").focus();
    effet("popcorn", btn); bruit("punch");
  } catch (err) {
    profilsErreur(err && err.message && !/fetch|network/i.test(err.message) ? err.message : "Création impossible : vérifie ta connexion.");
    $("profil-dialog").close();
  }
  btn.disabled = false; btn.textContent = label;
});
dessineProfils();
`;
