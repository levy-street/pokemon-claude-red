// Tell the IndexNow search engines (Bing, Yandex, Seznam, Naver...) which pages changed, after a deploy.
// tools/build_site.js queues each page whose content changed in data/seo-pending.json; this sends the queue and clears
// it only once the engines accept it, so a failed submission is retried with the next deploy.
//   INDEXNOW_KEY=<key> node tools/indexnow.js https://your.site/
// The key file (<key>.txt, written by tools/build_dist.js) must already be live: the engines fetch it to check.
'use strict';
const fs = require('fs'), path = require('path');
const site = (process.argv[2] || '').replace(/\/?$/, '/'), key = process.env.INDEXNOW_KEY;
const PENDING = path.join(__dirname, '..', 'data', 'seo-pending.json');
if (!key || !process.argv[2]) { console.log('indexnow: no INDEXNOW_KEY or site given, skipped'); process.exit(0); }
let pending = []; try { pending = JSON.parse(fs.readFileSync(PENDING, 'utf8')); } catch (e) {}
if (!pending.length) { console.log('indexnow: no changed pages'); process.exit(0); }
(async () => {
  const keyUrl = site + key + '.txt';
  const kr = await fetch(keyUrl, { cache: 'no-store' });
  if (!kr.ok || (await kr.text()).trim() !== key) { console.error('indexnow: the key file is not live at ' + keyUrl); process.exit(1); }
  const host = new URL(site).host, urls = pending.map(p => site + p.replace(/^\//, ''));
  for (let i = 0; i < urls.length; i += 10000) { // up to 10,000 URLs per request
    const batch = urls.slice(i, i + 10000);
    const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: keyUrl, urlList: batch }) });
    console.log(`indexnow: ${batch.length} URL(s) -> ${r.status} ${r.statusText}`);
    if (r.status !== 200 && r.status !== 202) { console.error(await r.text()); process.exit(1); }
  }
  fs.writeFileSync(PENDING, '[]');
})().catch(e => { console.error('indexnow:', e.message); process.exit(1); });
