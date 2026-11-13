import * as cheerio from 'cheerio';

const slugs = process.argv.slice(2);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function latestTimestamp(path) {
  const res = await fetch(`http://archive.org/wayback/available?url=utopiacap.com/${path}`);
  const json = await res.json();
  return json.archived_snapshots?.closest?.timestamp;
}

async function fetchText(path) {
  const ts = await latestTimestamp(path);
  if (!ts) { console.log(`=== ${path}: NO SNAPSHOT ===`); return; }
  await sleep(1000);
  const res = await fetch(`http://web.archive.org/web/${ts}if_/https://utopiacap.com/${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (site-recovery; contact research@utopiacap.com)' },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  $('script, style, nav, .comments-area, .sharedaddy').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  console.log(`\n=== ${path} (ts ${ts}) ===\n${text}\n`);
}

for (const s of slugs) {
  await fetchText(s);
  await sleep(2500);
}
