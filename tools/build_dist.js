// Bundle the playable game into dist/ for static hosting (Cloudflare Pages, GitHub Pages, any web server):
// index.html + src/ only, plus preview.png (the title screen at 4x) for link previews on Reddit/Discord/etc.
// usage: [CF_BEACON_TOKEN=<token>] [GOOGLE_SITE_VERIFICATION=<token>] node tools/build_dist.js [https://your.site/]
// The URL makes og:image absolute (some scrapers need it) and adds a canonical link, robots.txt and sitemap.xml.
// GOOGLE_SITE_VERIFICATION is the content of Search Console's HTML-tag verification (<meta name="google-site-verification">).
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./headless.js');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'dist');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
const site = process.argv[2] ? process.argv[2].replace(/\/?$/, '/') : '';
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('content="preview.png"', 'content="' + site + 'preview.png"');
// Cloudflare Web Analytics (cookieless): CF_BEACON_TOKEN=<site token> adds the beacon script. Not needed when the
// site is proxied by Cloudflare with automatic Web Analytics switched on for the zone (the edge injects it then).
const beacon = process.env.CF_BEACON_TOKEN;
if (beacon) {
  if (!/^[0-9a-f]{32}$/i.test(beacon)) { console.error('CF_BEACON_TOKEN should be the 32-character site token'); process.exit(1); }
  html = html.replace('</head>', `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${beacon}"}'></script>\n</head>`);
}
// Google Search Console ownership: the HTML-tag method. The token is public anyway (it's in the page), but it belongs to
// whoever owns the property, so it comes from the environment rather than this repo
const gsv = process.env.GOOGLE_SITE_VERIFICATION;
if (gsv) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(gsv)) { console.error('GOOGLE_SITE_VERIFICATION should be the content="..." value of the Search Console meta tag'); process.exit(1); }
  html = html.replace('</head>', `<meta name="google-site-verification" content="${gsv}">\n</head>`);
}
// one canonical address for search engines, however the page was linked (?ref=reddit, ?team=..., trailing slashes)
if (site) html = html.replace('</head>', `<link rel="canonical" href="${site}">\n</head>`);
// every script link carries a hash of its contents, so caches (Cloudflare keeps .js for hours) can never serve an
// old file after a deploy, while unchanged files stay cached
html = html.replace(/<script src="(src\/[^"?]+\.js)"><\/script>/g, (m, f) => {
  const h = require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 10);
  return `<script src="${f}?v=${h}"></script>`;
});
fs.writeFileSync(path.join(OUT, 'index.html'), html);
if (site) { // for search engines: crawl the game, skip the API; the sitemap lists the reference pages built below
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}sitemap.xml\n`);
  // the Pokédex, moves, locations, guides, favicons, manifest, llms.txt and sitemap (tools/build_site.js)
  console.log('site pages:', require('./build_site.js')(OUT, site, H));
}
fs.cpSync(path.join(ROOT, 'src'), path.join(OUT, 'src'), { recursive: true });
// link preview: the title screen after its intro settles
const G = H.loadGame({ search: '' }).G; G.boot();
while (G.engine.scenes.length) G.engine.pop();
G.titleScreen(); H.runFrames(G, 45);
H.shot(G, path.join(OUT, 'preview.png'), 4);
let bytes = 0; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else bytes += st.size; } })(OUT);
console.log('dist/ ready:', (bytes / 1048576).toFixed(2) + ' MB (index.html, src/, preview.png)');
