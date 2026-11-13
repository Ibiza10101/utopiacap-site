import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT_ROOT = path.join(SITE_ROOT, 'src', 'wp-content', 'uploads');
const LOG_PATH = path.join(SCRIPT_DIR, 'download-images.log');

const downloads = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'images.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'download-images.state.json'), 'utf8'));

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

async function main() {
  const failed = downloads.filter((d) => state.done[d.canonicalPath]?.ok === false);
  log(`Retrying ${failed.length} failed images using their sized variants`);
  let ok = 0, stillFail = 0;
  for (const { canonicalPath, variants, ts } of failed) {
    const candidates = variants
      .filter((v) => v !== canonicalPath)
      .sort((a, b) => b.length - a.length); // longest filename often = biggest declared size
    let recovered = false;
    for (const variant of candidates) {
      const url = `http://web.archive.org/web/${ts}im_/https://utopiacap.com${variant}`;
      try {
        const res = await fetchWithRetry(url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const outPath = path.join(OUT_ROOT, canonicalPath.replace('/wp-content/uploads/', ''));
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, buf);
          log(`  RECOVERED ${canonicalPath} via ${variant} (${buf.length} bytes)`);
          state.done[canonicalPath] = { ok: true, bytes: buf.length, via: variant };
          ok++;
          recovered = true;
          break;
        }
      } catch (e) { /* try next candidate */ }
      await sleep(2000);
    }
    if (!recovered) {
      log(`  STILL FAILING ${canonicalPath} (tried ${candidates.length} variants)`);
      stillFail++;
    }
    fs.writeFileSync(path.join(SCRIPT_DIR, 'download-images.state.json'), JSON.stringify(state, null, 2));
  }
  log(`Retry pass done. recovered=${ok} stillFail=${stillFail}`);
}

main();
