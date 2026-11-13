import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT_ROOT = path.join(SITE_ROOT, 'src', 'wp-content', 'uploads');
const LOG_PATH = path.join(SCRIPT_DIR, 'download-featured-images.log');
const STATE_PATH = path.join(SCRIPT_DIR, 'download-featured-images.state.json');

const matches = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'featured-images.json'), 'utf8'));

let state = { done: {} };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}
function saveState() { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); }
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
  log(`Downloading ${matches.length} featured/supporting images for 48 posts`);
  let ok = 0, fail = 0;
  for (const { imagePath, ts } of matches) {
    if (state.done[imagePath]) continue;
    const url = `http://web.archive.org/web/${ts}im_/https://utopiacap.com${imagePath}`;
    const outPath = path.join(OUT_ROOT, imagePath.replace('/wp-content/uploads/', ''));
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        log(`  FAIL ${res.status} ${imagePath}`);
        state.done[imagePath] = { ok: false, status: res.status };
        fail++;
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
        log(`  OK ${imagePath} (${buf.length} bytes)`);
        state.done[imagePath] = { ok: true, bytes: buf.length };
        ok++;
      }
    } catch (e) {
      log(`  ERROR ${imagePath}: ${e.message}`);
      state.done[imagePath] = { ok: false, error: e.message };
      fail++;
    }
    saveState();
    await sleep(2500);
  }
  log(`Done. ok=${ok} fail=${fail}`);
}

main();
