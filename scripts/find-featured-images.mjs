import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');

const raw = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'all_uploads_cdx.json'), 'utf8'));
const rows = raw.slice(1);

const known = new Set();
for (const d of JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'images.json'), 'utf8'))) {
  for (const v of d.variants) known.add(v);
  known.add(d.canonicalPath);
}

function canonicalize(relPath) {
  return relPath.replace(/-\d+x\d+(?:@\d+x)?(\.\w+)$/i, '$1');
}

// Real image files only, and not a redirect/stub capture of the same URL (those show up with mimetype text/html).
const REAL_IMAGE_MIME = /^image\//;

const orphans = new Map(); // canonicalPath -> { ts, mime }
for (const r of rows) {
  const [, ts, original, mime] = r;
  if (!REAL_IMAGE_MIME.test(mime)) continue;
  const m = original.match(/utopiacap\.com(\/wp-content\/uploads\/[^?]+)/);
  if (!m) continue;
  const relPath = m[1];
  if (known.has(relPath)) continue;
  const canon = canonicalize(relPath);
  const existing = orphans.get(canon);
  if (!existing || ts > existing.ts) orphans.set(canon, { ts, mime });
}

// Drop known junk categories already excluded earlier (logos, icons, backgrounds, non-post theme assets)
// plus the blockchain-timestamp badge graphics, which are generic per-publish-date
// images (BC-TR = "Blockchain Track Record") with no connection to any one post's
// actual ticker -- matching them by date-token would need real per-post date logic,
// not worth it for a decorative badge.
const JUNK_RE = /logo|favicon|icon|background|-png\.png$|alpha-png|short-report\.pdf$|^bc-tr-|wordproof|blockchain-timestamp/i;
const candidates = [...orphans.entries()].filter(([p]) => !JUNK_RE.test(p));

console.log(`Orphan real-image candidates (after junk filter): ${candidates.length}`);

// Load every post's slug + any ticker-ish token we can pull from its filename, to match against "TICKER-candles.png" etc.
const postsDir = path.join(SITE_ROOT, 'src', 'posts');
const postFiles = fs.readdirSync(postsDir);

// Words common enough across unrelated posts/images to cause false matches
// on their own (e.g. "capital" alone matched Alpha Capital Anstalt to
// Aspire Capital's and Hudson Bay Capital's images).
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'its', 'has', 'was', 'about', 'alert', 'trade',
  'report', 'short', 'inc', 'corp', 'ltd', 'llc', 'group', 'holdings', 'international',
  'capital', 'management', 'research', 'trading', 'investments', 'pink', 'otcmkts', 'otcqb',
  'nasdaq', 'amex', 'landing', 'page', 'paid', 'shareholder', 'attorney', 'bad', 'reputation',
  'investor', 'warning', 'watchlist', 'why', 'you', 'should', 'learn', 'about', 'short-selling',
  'shares', 'share', 'stock', 'stocks', 'company', 'companies', 'featured', 'image', 'images',
  'index', 'graph', 'chart', 'promotion', 'lawsuit', 'disclaimer', 'actual', 'long', 'term', 'spike',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'sec', 'liaison', 'subject', 'links', 'custodian', 'agent', 'transfer',
]);

function tickerTokens(filename) {
  const base = filename.replace(/\.md$/, '');
  return new Set(base.split('-').map((s) => s.toLowerCase()).filter((s) => s.length >= 3 && !STOPWORDS.has(s)));
}

// Image filenames vary: TICKER-candles, TICKER_candles, TICKER2-candles (a
// second report on the same ticker), or a Wayback-cache-busting hash
// prefix before the real name (86c48-worx_candles.png). Every run of 3+
// letters in the filename is a candidate ticker token, not just the lead.
function imageTokens(fname) {
  return [...fname.matchAll(/[a-z]{3,}/gi)].map((m) => m[0].toLowerCase()).filter((t) => !STOPWORDS.has(t));
}

const matches = []; // { postFile, imagePath, ts }
const unmatched = [];
for (const [imgPath, { ts }] of candidates) {
  const fname = path.basename(imgPath).toLowerCase();
  const imgToks = imageTokens(fname);
  let matched = null;
  for (const pf of postFiles) {
    const postToks = tickerTokens(pf);
    if (imgToks.some((t) => postToks.has(t))) { matched = pf; break; }
  }
  if (matched) matches.push({ postFile: matched, imagePath: imgPath, ts });
  else unmatched.push(imgPath);
}

// Dedupe per post: the "apollo13_images" directory and hash-prefixed names
// are the same underlying photo re-hosted by a later Jetpack/CDN pass --
// prefer the plain /uploads/YYYY/MM/Name.ext form when one exists for the
// same base name.
function baseName(imgPath) {
  return path.basename(imgPath).toLowerCase().replace(/^[0-9a-f]{5}-/i, '').replace(/-[0-9a-z]{20,}(\.\w+)$/i, '$1');
}
const byPostAndBase = new Map(); // `${postFile}::${base}` -> best match
for (const m of matches) {
  const key = `${m.postFile}::${baseName(m.imagePath)}`;
  const existing = byPostAndBase.get(key);
  const score = (p) => (p.includes('/apollo13_images/') ? 0 : 1) - (/[0-9a-f]{5}-/i.test(path.basename(p)) ? 0.5 : 0);
  if (!existing || score(m.imagePath) > score(existing.imagePath)) byPostAndBase.set(key, m);
}
const deduped = [...byPostAndBase.values()];

console.log(`Matched to a post: ${matches.length} (deduped to ${deduped.length} unique images)`);
console.log(`Unmatched (no obvious post): ${unmatched.length}`);

fs.writeFileSync(path.join(SCRIPT_DIR, 'featured-images.json'), JSON.stringify(deduped, null, 2));
fs.writeFileSync(path.join(SCRIPT_DIR, 'featured-images-unmatched.json'), JSON.stringify(unmatched, null, 2));
