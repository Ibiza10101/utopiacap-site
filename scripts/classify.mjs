import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync(new URL('./cdx.json', import.meta.url), 'utf8'));
const rows = raw.slice(1); // drop header row
const byUrl = new Map();
for (const r of rows) byUrl.set(r[2], r[1]); // original -> timestamp
const urls = [...byUrl.keys()];

const skipPatterns = [
  /\/wp-json\//, /\/feed\/?$/, /\/comments\/feed/, /\/wp-content\//,
  /\/category\//, /\/tag\//, /\/author\//, /\/page\/\d+\/?$/,
  /\/comment-page-\d+\/?$/, /\/amp\/?$/, /\?/, /\/archives\/?$/,
  /\/about-old\/?$/, /\/about-parallax-2\/?$/, /\/about-us-top-image\/?$/,
  /\/membership-test\/?$/, /\/account-page\/?$/, /\/alpha-png\/?$/,
  /\/\d{4}\/\d{2}\/?$/, // monthly archive listing (no day, no slug)
];

const knownPages = new Set([
  'about', 'about-us', 'contact', 'contact-us', 'legal-disclaimer', 'track-record',
  'membership', 'basics-of-short-selling', 'a-short-history-of-short-selling',
  'short-selling-in-the-public-eye', 'why-you-should-learn-about-short-selling',
]);

const posts = new Map(); // slug -> {url, hasDate}
const pages = [];
const other = [];

for (const u of urls) {
  const path = u.replace('https://utopiacap.com', '').replace(/^\/+/, '/');
  if (skipPatterns.some(p => p.test(path))) continue;
  if (path === '/') continue;

  const dated = path.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/?$/);
  if (dated) {
    const slug = dated[4];
    const date = `${dated[1]}-${dated[2]}-${dated[3]}`;
    const existing = posts.get(slug);
    if (!existing || !existing.hasDate) posts.set(slug, { url: u, date, hasDate: true, ts: byUrl.get(u) });
    continue;
  }

  const bare = path.match(/^\/([^/]+)\/?$/);
  if (bare) {
    const slug = bare[1];
    if (knownPages.has(slug)) { pages.push({ slug, url: u, ts: byUrl.get(u) }); continue; }
    if (!posts.has(slug)) posts.set(slug, { url: u, date: null, hasDate: false, ts: byUrl.get(u) });
    continue;
  }
  other.push(u);
}

console.log('POSTS:', posts.size);
console.log('PAGES:', pages.length);
console.log('OTHER (unclassified):', other.length);
console.log('\n--- other ---');
other.forEach(u => console.log(u));

fs.writeFileSync(new URL('./posts.json', import.meta.url), JSON.stringify([...posts.entries()].map(([slug, v]) => ({ slug, ...v })), null, 2));
fs.writeFileSync(new URL('./pages.json', import.meta.url), JSON.stringify(pages, null, 2));
