// Rend docs/reecriture/INVENTAIRE.md à partir de la sortie de inventaire-ancien.mjs.
//
//   git -C ../ardha archive origin/main | tar -x -C /tmp/ardha-ancien
//   node tools/inventaire-ancien.mjs /tmp/ardha-ancien > /tmp/inventaire.json
//   node tools/rendre-inventaire.mjs /tmp/inventaire.json <sha> > docs/reecriture/INVENTAIRE.md

import { readFileSync } from "node:fs";

const { front, back } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const sha = process.argv[3] ?? "?";

// Rattachement de chaque page et de chaque function à un lot du plan.
const LOTS = {
  "L0 · Socle": { pages: ["Auth", "NotFound"], fns: ["sentry-config"] },
  "L1 · Carte et parcellaire": { pages: ["Cadastre"], fns: ["load-communes-referentiel"] },
  "L2 · Étude": { pages: ["Home", "EtatEtude", "mobile/MobileStudyList", "mobile/MobileStudyView", "mobile/MobileMapPage"], fns: [] },
  "L3 · Chaîne PLU et urbanisme": {
    pages: ["Urbanisme"],
    fns: ["fetch-gpu-layers", "sync-documents-urba", "import-plu", "unpack-plu-archive", "extract-gis-layers", "extract-pdf-text",
      "extract-articles", "extract-rules", "analyze-zone-rules", "analyze-oap", "process-extraction-queue", "enqueue-extraction-backfill",
      "build-corpus", "provision-commune", "download-missing-pdfs", "read-zone-rules", "urbanisme", "urbanisme-docs",
      "purge-processed-storage", "purge-zone-cache"],
  },
  "L4 · Risques": { pages: ["Risques"], fns: [] },
  "L5 · Foncier et marché": { pages: ["Foncier"], fns: ["dvf-proxy", "dvf-archive", "market-analysis", "import-ecln", "construction-indices"] },
  "L6 · Estimation": { pages: ["Estimation"], fns: ["generate-estimation-pdf"] },
  "L7 · Faisabilité et résultats": { pages: ["Faisabilite", "Resultats"], fns: [] },
  "L8 · Exports": { pages: ["Export"], fns: [] },
  "L9 · Administration → CLI": { pages: ["Admin"], fns: ["admin-extraction-control", "analyze-manual-pdf"] },
  "Hors v1 · Volet agent (non repris, D-12)": {
    pages: ["AgentDashboard", "AgentListings", "AgentClients", "AgentMandates", "AgentProfile"],
    fns: ["generate-fiche-commerciale"],
  },
  "Hors v1 · SaaS": { pages: ["Onboarding"], fns: [] },
};

const n = (x) => x.toLocaleString("fr-FR");
const l = [];
l.push("# Inventaire de l'ancien Ardha");
l.push("");
l.push(`> Généré par \`tools/inventaire-ancien.mjs\` + \`tools/rendre-inventaire.mjs\` sur \`bimtheon-studio/ardha\` @ \`${sha}\`.`);
l.push("> Ne pas éditer à la main : régénérer.");
l.push("");
l.push("**Méthode.** Pour chaque page, fermeture transitive des imports locaux, hors infrastructure partagée");
l.push("(`components/ui`, `integrations/`, coquille de l'application). *Lignes propres* = code atteint par cette");
l.push("seule page ; le reste est partagé entre plusieurs pages (carte, hooks d'API, utilitaires). Pour chaque");
l.push("edge function : son `index.ts` seul, puis sa fermeture avec `_shared/`.");
l.push("");

// Synthèse par lot.
l.push("## Synthèse par lot");
l.push("");
l.push("| Lot | Pages | Lignes propres (front) | Functions | Lignes `index.ts` (back) |");
l.push("|---|---|--:|---|--:|");
const vus = new Set();
for (const [lot, { pages, fns }] of Object.entries(LOTS)) {
  const lp = pages.reduce((s, p) => s + (front[p]?.lignes_propres ?? 0), 0);
  const lb = fns.reduce((s, f) => s + (back[f]?.propres ?? 0), 0);
  pages.forEach((p) => vus.add("p:" + p));
  fns.forEach((f) => vus.add("f:" + f));
  l.push(`| ${lot} | ${pages.join(", ") || "—"} | ${n(lp)} | ${fns.length} | ${n(lb)} |`);
}
const orphelins = [
  ...Object.keys(front).filter((p) => !vus.has("p:" + p)).map((p) => "page " + p),
  ...Object.keys(back).filter((f) => !vus.has("f:" + f)).map((f) => "function " + f),
];
l.push("");
if (orphelins.length) l.push(`⚠️ Non rattachés à un lot : ${orphelins.join(", ")}.`);
else l.push("Toutes les pages et toutes les functions sont rattachées à un lot.");
l.push("");

l.push("## Front — par page");
l.push("");
l.push("| Page | Fichiers | Lignes (fermeture) | Lignes propres | Tables | Functions appelées | API externes |");
l.push("|---|--:|--:|--:|---|---|---|");
for (const [p, v] of Object.entries(front).sort((a, b) => b[1].lignes - a[1].lignes)) {
  const fns = v.invoke.filter((f) => f !== "sentry-config");
  l.push(`| ${p} | ${v.fichiers} | ${n(v.lignes)} | ${n(v.lignes_propres)} | ${v.tables.join(", ") || "—"} | ${fns.join(", ") || "—"} | ${v.externes.join(", ") || "—"} |`);
}
l.push("");

l.push("## Back — par edge function");
l.push("");
l.push("| Function | `index.ts` | Avec `_shared` | Tables | API externes | Appelée par (front) |");
l.push("|---|--:|--:|---|---|---|");
for (const [f, v] of Object.entries(back).sort((a, b) => b[1].lignes - a[1].lignes)) {
  l.push(`| ${f} | ${n(v.propres)} | ${n(v.lignes)} | ${v.tables.join(", ") || "—"} | ${v.externes.join(", ") || "—"} | ${v.appele_par.join(", ") || "cron, admin ou service"} |`);
}
l.push("");
console.log(l.join("\n"));
