// Inventaire des fonctionnalités d'Ardha : pour chaque page (front) et chaque edge
// function (back), fermeture transitive des imports locaux, puis agrégation de ce
// que cette fermeture touche : tables, RPC, functions appelées, API externes, buckets.
//
//   node inventaire.mjs <racine-export> > inventaire.json

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const RACINE = resolve(process.argv[2]);
const SRC = join(RACINE, "src");
const FN = join(RACINE, "supabase/functions");

const EXT = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];
function resoudre(depuis, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(depuis), spec);
  else return null;
  for (const e of EXT) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const cache = new Map();
function analyser(f) {
  if (cache.has(f)) return cache.get(f);
  const code = readFileSync(f, "utf8");
  const sansCommentaires = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const imports = [...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)]
    .map((m) => resoudre(f, m[1])).filter(Boolean);
  const tous = (re) => [...new Set([...sansCommentaires.matchAll(re)].map((m) => m[1]))];
  const r = {
    lignes: code.split("\n").length,
    imports,
    tables: tous(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g),
    rpc: tous(/\.rpc\(\s*["'`]([a-z_]+)["'`]/g),
    invoke: [
      ...tous(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/g),
      ...tous(/functions\/v1\/([a-z0-9-]+)/g),
    ],
    buckets: tous(/storage\s*\.from\(\s*["'`]([a-z0-9-]+)["'`]/g),
    externes: tous(/https?:\/\/((?:[a-z0-9-]+\.)+(?:fr|com|org|net|io|gouv\.fr))/g)
      .filter((d) => !/supabase\.co|bimtheon|lovable|cdnjs|w3\.org|opengis|cityjson|agence\.fr|github|sentry|googleapis|gstatic/.test(d)),
  };
  cache.set(f, r);
  return r;
}

function fermeture(entree, exclure) {
  const vus = new Set();
  const pile = [entree];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || exclure(f)) continue;
    vus.add(f);
    for (const i of analyser(f).imports) pile.push(i);
  }
  return [...vus];
}

// Infrastructure partagée : ne compte pas comme « la » fonctionnalité d'une page.
const INFRA = /\/components\/ui\/|\/integrations\/|\/lib\/utils\.ts$|\/hooks\/use-toast|\/hooks\/use-mobile|\/components\/(AppSidebar|AppHeader|MobileBottomNav|ProtectedRoute|RequireOnboarding)\.tsx$/;

function agreger(fichiers) {
  const u = (k) => [...new Set(fichiers.flatMap((f) => analyser(f)[k]))].sort();
  return {
    fichiers: fichiers.length,
    lignes: fichiers.reduce((s, f) => s + analyser(f).lignes, 0),
    tables: u("tables"), rpc: u("rpc"), invoke: u("invoke"), buckets: u("buckets"), externes: u("externes"),
  };
}

const pages = [
  ...readdirSync(join(SRC, "pages")).filter((f) => f.endsWith(".tsx")).map((f) => join(SRC, "pages", f)),
  ...readdirSync(join(SRC, "pages/mobile")).map((f) => join(SRC, "pages/mobile", f)),
];

const front = {};
const usage = new Map(); // fichier → pages qui l'atteignent
for (const p of pages) {
  const fs_ = fermeture(p, (f) => INFRA.test(f));
  const nom = relative(join(SRC, "pages"), p).replace(/\.tsx$/, "");
  front[nom] = { ...agreger(fs_), liste: fs_.map((f) => relative(RACINE, f)) };
  for (const f of fs_) usage.set(f, [...(usage.get(f) ?? []), nom]);
}

// Part propre à chaque page vs partagée entre pages.
for (const [nom, v] of Object.entries(front)) {
  const propres = v.liste.filter((f) => (usage.get(join(RACINE, f)) ?? []).length === 1);
  v.lignes_propres = propres.reduce((s, f) => s + analyser(join(RACINE, f)).lignes, 0);
  v.fichiers_propres = propres.length;
}

const back = {};
for (const d of readdirSync(FN)) {
  if (d.startsWith("_") || !statSync(join(FN, d)).isDirectory()) continue;
  const idx = join(FN, d, "index.ts");
  if (!existsSync(idx)) continue;
  const fs_ = fermeture(idx, () => false);
  back[d] = { ...agreger(fs_), propres: analyser(idx).lignes };
}

// Qui appelle chaque function (front).
const appelants = {};
for (const [nom, v] of Object.entries(front)) for (const fn of v.invoke) (appelants[fn] ??= []).push(nom);
for (const [fn, v] of Object.entries(back)) v.appele_par = appelants[fn] ?? [];

for (const v of Object.values(front)) delete v.liste;
console.log(JSON.stringify({ front, back }, null, 1));
