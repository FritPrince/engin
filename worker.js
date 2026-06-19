/**
 * Scale Factory Engine — Proxy Cloudflare Worker
 * ------------------------------------------------
 * Ce worker garde ta clé API Anthropic en sécurité (côté serveur).
 * Ta page index.html appelle CE worker, jamais api.anthropic.com directement.
 *
 * DÉPLOIEMENT (2 façons) :
 *
 *  A) Dashboard Cloudflare (le plus simple, sans rien installer) :
 *     1. Va sur https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *     2. Colle le contenu de ce fichier, clique "Deploy"
 *     3. Settings → Variables and Secrets → Add → type "Secret" :
 *           Nom    : ANTHROPIC_API_KEY
 *           Valeur : ta clé (commence par sk-ant-...)
 *        Puis redéploie.
 *     4. Récupère l'URL du worker (ex: https://scalefactory.TONNOM.workers.dev)
 *        et mets-la dans index.html (constante PROXY_URL).
 *
 *  B) Ligne de commande (wrangler) :
 *     npm i -g wrangler
 *     wrangler login
 *     wrangler secret put ANTHROPIC_API_KEY   (colle ta clé)
 *     wrangler deploy worker.js --name scalefactory
 */

// Origines autorisées à utiliser ce proxy. Remplace par TON URL GitHub Pages.
// Garder la liste réduite limite les abus (quelqu'un qui voudrait utiliser
// ton worker — et donc ta clé — depuis un autre site).
const ALLOWED_ORIGINS = [
  "https://fritprince.github.io",
  "http://localhost:8000", // pour tester en local
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // Pré-vol CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY manquante côté serveur (voir instructions dans worker.js)" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Corps JSON invalide" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    // On transmet le payload à Anthropic en ajoutant la clé (jamais exposée au navigateur).
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  },
};
