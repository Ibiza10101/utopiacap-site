import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');
const POSTS_DIR = path.join(SITE_ROOT, 'src', 'posts');
const OUT_ROOT = path.join(SITE_ROOT, 'src', 'wp-content', 'uploads');
const LOG_PATH = path.join(SCRIPT_DIR, 'fix-photon-images.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchWithRetry(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (site-recovery; contact research@utopiacap.com)' } });
  if (res.status === 429 || res.status === 503) {
    if (attempt > 6) throw new Error(`Giving up: ${res.status}`);
    const backoff = Math.min(60_000, 5_000 * attempt);
    log(`  rate-limited (${res.status}), backing off ${backoff / 1000}s`);
    await sleep(backoff);
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

// Matches a Jetpack Photon URL, Wayback-wrapped or not: .../i0|i1|i2.wp.com/utopiacap.com/wp-content/uploads/<path>?resize=...
const PHOTON_RE = /https?:\/\/web\.archive\.org\/web\/\d+(?:im_|if_)?\/https?:\/\/i[0-2]\.wp\.com\/utopiacap\.com(\/wp-content\/uploads\/[^"'\s?]+)(?:\?[^"'\s]*)?|https?:\/\/i[0-2]\.wp\.com\/utopiacap\.com(\/wp-content\/uploads\/[^"'\s?]+)(?:\?[^"'\s]*)?/g;

const postFiles = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
const allPaths = new Map(); // relPath -> archivedAt (any post that references it)

for (const f of postFiles) {
  const full = path.join(POSTS_DIR, f);
  const text = fs.readFileSync(full, 'utf8');
  const archivedAt = text.match(/^archivedAt: "(\d+)"/m)?.[1];
  let m;
  const re = new RegExp(PHOTON_RE);
  while ((m = re.exec(text))) {
    const relPath = m[1] || m[2];
    if (!allPaths.has(relPath) && archivedAt) allPaths.set(relPath, archivedAt);
  }
}

log(`Found ${allPaths.size} unique Photon-CDN images across ${postFiles.length} posts`);

async function downloadAll() {
  let ok = 0, fail = 0;
  for (const [relPath, ts] of allPaths) {
    const outPath = path.join(OUT_ROOT, relPath.replace('/wp-content/uploads/', ''));
    if (fs.existsSync(outPath)) { ok++; continue; }
    const url = `http://web.archive.org/web/${ts}im_/https://utopiacap.com${relPath}`;
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) { log(`  FAIL ${res.status} ${relPath}`); fail++; }
      else {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
        log(`  OK ${relPath} (${buf.length} bytes)`);
        ok++;
      }
    } catch (e) { log(`  ERROR ${relPath}: ${e.message}`); fail++; }
    await sleep(2500);
  }
  log(`Download done. ok=${ok} fail=${fail}`);
}

function rewritePosts() {
  let changed = 0;
  for (const f of postFiles) {
    const full = path.join(POSTS_DIR, f);
    let text = fs.readFileSync(full, 'utf8');
    const original = text;

    // Rewrite every Photon URL (Wayback-wrapped or not) straight to the local path.
    text = text.replace(PHOTON_RE, (full, p1, p2) => p1 || p2);

    // Same lazy-load/duplicate-src cleanup as rewrite-images.mjs, for tags this touched.
    text = text.replace(/\s+data-recalc-dims="[^"]*"/g, '');
    text = text.replace(/<img\b[^>]*>/g, (tag) => {
      let seen = false;
      return tag.replace(/\s+src="([^"]*)"/g, (m, v) => {
        if (seen) return '';
        seen = true;
        return ` src="${v}"`;
      });
    });

    if (text !== original) {
      fs.writeFileSync(full, text);
      changed++;
    }
  }
  log(`Rewrote Photon references in ${changed} posts.`);
}

await downloadAll();
rewritePosts();
