import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT_ROOT = path.join(SITE_ROOT, 'src', 'wp-content', 'uploads');
const LOG_PATH = path.join(SCRIPT_DIR, 'recover-missing-images.log');

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

/** Every snapshot the CDX index has for this exact path, any timestamp, any of our own prior guesses included. */
async function allSnapshots(urlPath) {
  const url = `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('utopiacap.com' + urlPath)}&output=json&limit=20`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.slice(1).map((r) => r[1]); // every timestamp on record
}

async function main() {
  const failed = downloads.filter((d) => state.done[d.canonicalPath]?.ok === false);
  log(`Attempting ${failed.length} still-missing images via full per-image CDX history`);
  let ok = 0, stillFail = 0;
  for (const { canonicalPath, variants } of failed) {
    const candidates = [canonicalPath, ...variants.filter((v) => v !== canonicalPath)];
    let recovered = false;
    for (const p of candidates) {
      const timestamps = await allSnapshots(p);
      await sleep(1500);
      for (const ts of timestamps) {
        const url = `http://web.archive.org/web/${ts}im_/https://utopiacap.com${p}`;
        try {
          const res = await fetchWithRetry(url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 200) continue; // likely a redirect/error page, not real image bytes
            const outPath = path.join(OUT_ROOT, canonicalPath.replace('/wp-content/uploads/', ''));
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, buf);
            log(`  RECOVERED ${canonicalPath} via ${p} @ ${ts} (${buf.length} bytes)`);
            state.done[canonicalPath] = { ok: true, bytes: buf.length, via: `${p}@${ts}` };
            ok++;
            recovered = true;
            break;
          }
        } catch (e) { /* try next timestamp */ }
        await sleep(1500);
      }
      if (recovered) break;
    }
    if (!recovered) {
      log(`  STILL FAILING ${canonicalPath} -- no working snapshot found for any variant/timestamp`);
      stillFail++;
    }
    fs.writeFileSync(path.join(SCRIPT_DIR, 'download-images.state.json'), JSON.stringify(state, null, 2));
  }
  log(`Done. recovered=${ok} stillFail=${stillFail}`);
}

main();
