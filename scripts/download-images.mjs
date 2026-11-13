import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT_ROOT = path.join(SITE_ROOT, 'src', 'wp-content', 'uploads');
const LOG_PATH = path.join(SCRIPT_DIR, 'download-images.log');
const STATE_PATH = path.join(SCRIPT_DIR, 'download-images.state.json');

const downloads = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'images.json'), 'utf8'));

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
    if (attempt > 6) throw new Error(`Giving up after ${attempt} attempts: ${res.status}`);
    const backoff = Math.min(60_000, 5_000 * attempt);
    log(`  rate-limited (${res.status}), backing off ${backoff / 1000}s`);
    await sleep(backoff);
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

async function main() {
  const limit = process.env.IMG_LIMIT ? Number(process.env.IMG_LIMIT) : Infinity;
  log(`Starting image download: ${downloads.length} canonical images (limit=${limit})`);
  let ok = 0, fail = 0;
  for (const { canonicalPath, ts } of downloads.slice(0, limit)) {
    if (state.done[canonicalPath]) continue;
    const url = `http://web.archive.org/web/${ts}im_/https://utopiacap.com${canonicalPath}`;
    const outPath = path.join(OUT_ROOT, canonicalPath.replace('/wp-content/uploads/', ''));
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        log(`  FAIL ${res.status} ${canonicalPath}`);
        state.done[canonicalPath] = { ok: false, status: res.status };
        fail++;
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
        log(`  OK ${canonicalPath} (${buf.length} bytes)`);
        state.done[canonicalPath] = { ok: true, bytes: buf.length };
        ok++;
      }
    } catch (e) {
      log(`  ERROR ${canonicalPath}: ${e.message}`);
      state.done[canonicalPath] = { ok: false, error: e.message };
      fail++;
    }
    saveState();
    await sleep(2500);
  }
  log(`Done. ok=${ok} fail=${fail}`);
}

main();
