import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');
const POSTS_OUT = path.join(SITE_ROOT, 'src', 'posts');
const PAGES_OUT = path.join(SITE_ROOT, 'src');
const LOG_PATH = path.join(SCRIPT_DIR, 'recover.log');
const STATE_PATH = path.join(SCRIPT_DIR, 'recover.state.json');

fs.mkdirSync(POSTS_OUT, { recursive: true });

const posts = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'posts.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'pages.json'), 'utf8'));

let state = { done: {} };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (site-recovery; contact research@utopiacap.com)' } });
  if (res.status === 429 || res.status === 503) {
    if (attempt > 6) throw new Error(`Giving up after ${attempt} attempts: ${res.status}`);
    const backoff = Math.min(60_000, 5_000 * attempt);
    log(`  rate-limited (${res.status}), backing off ${backoff / 1000}s (attempt ${attempt})`);
    await sleep(backoff);
    return fetchWithRetry(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function stripWaybackChrome(html) {
  // Remove Wayback's injected banner/scripts/comments wrapped around the page.
  return html.replace(/<!--\s*BEGIN WAYBACK TOOLBAR INSERT\s*-->[\s\S]*?<!--\s*END WAYBACK TOOLBAR INSERT\s*-->/i, '');
}

// Elements that are never real article content, wherever they show up
// nested inside entry-content (share widgets, comments, related-post lists,
// the membership paywall's login-form teaser, and the "next article" nav
// WordPress sometimes renders *inside* the content div, not just after it).
const JUNK_SELECTORS = [
  '.sharedaddy', '.jp-relatedposts', '.comments-area', '#comments',
  '.ihc-locker-wrap', '.posts-nav', '.post-navigation', 'nav',
  'script', 'style', 'form', '.widget', '.sidebar',
].join(', ');

function extractTitle($) {
  const raw = $('title').first().text();
  if (!raw) return null;
  // Strip the site-name / tagline suffixes WP appends, e.g.
  // "Foo Corp (TICKER) ... |Utopia Capital Research | Activist Shortseller | Research Reports"
  return raw.split('|')[0].replace(/\s*[–-]\s*utopiacap\.com\s*$/i, '').trim();
}

function extractContainer($) {
  const candidates = ['.entry-content', '.post-content', 'article .fusion-text', 'article'];
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 80) return el;
  }
  return null;
}

function cleanBody($, container) {
  const clone = container.clone();
  clone.find(JUNK_SELECTORS).remove();
  // The newsletter-signup CTA block ("GET OUR LATEST REPORTS...") is nested
  // as a sibling *inside* the same Fusion Builder content area as the
  // article on most posts, with no selector of its own to target — find it
  // by its known text and drop its whole decorative row.
  clone.find('*').each((_, el) => {
    const own = $(el).clone().children().remove().end().text().trim();
    if (/GET OUR LATEST REPORTS DELIVERED/i.test(own)) {
      $(el).closest('.fusion-fullwidth, .fusion-builder-row').remove();
    }
  });
  // Tidy up empty shells the removals above leave behind — repeated, since
  // removing an empty <li> can leave its parent <ul> empty in turn.
  for (let pass = 0; pass < 4; pass++) {
    const empties = clone.find('li, ul, div')
      .filter((_, el) => $(el).text().trim() === '' && $(el).children().length === 0);
    if (empties.length === 0) break;
    empties.remove();
  }
  // Rewrite Wayback-rewritten asset/internal links and uploads paths back to clean relative form.
  clone.find('a, img, source').each((_, el) => {
    for (const attr of ['href', 'src', 'data-src', 'srcset', 'data-srcset']) {
      const v = $(el).attr(attr);
      if (!v) continue;
      $(el).attr(attr, v
        .replace(/https?:\/\/web\.archive\.org\/web\/\d+(?:if_|im_)?\//g, '')
        .replace(/https?:\/\/utopiacap\.com/g, ''));
    }
  });
  let html = clone.html() || '';
  // Drop raw unparsed WP page-builder shortcodes left in some archived pages
  // (the paywall plugin's shortcode occasionally rendered unparsed).
  html = html.replace(/\[\/?[a-zA-Z_][a-zA-Z0-9_]*(?:\s+[a-zA-Z0-9_-]+="[^"]*")*\s*\/?\]/g, '');
  return html.trim();
}

function toYamlSafe(str) {
  return String(str).replace(/"/g, '\\"');
}

async function recoverOne({ slug, url, ts }, { isPost, dateFromUrl }) {
  const key = `${isPost ? 'post' : 'page'}:${slug}`;
  if (state.done[key]) { log(`skip (already done): ${key}`); return; }

  const archiveUrl = `http://web.archive.org/web/${ts}if_/${url}`;
  log(`fetching ${isPost ? 'post' : 'page'} ${slug} <- ${archiveUrl}`);
  const raw = await fetchWithRetry(archiveUrl);
  const stripped = stripWaybackChrome(raw);
  const $ = cheerio.load(stripped);
  const title = extractTitle($) || slug;
  const container = extractContainer($);
  if (!container) {
    log(`  WARNING: no content container found for ${slug}, skipping`);
    state.done[key] = { ok: false, reason: 'no-container' };
    saveState();
    return;
  }
  const body = cleanBody($, container);
  if (body.replace(/<[^>]+>/g, '').trim().length < 40) {
    log(`  WARNING: extracted body too short for ${slug}, skipping`);
    state.done[key] = { ok: false, reason: 'too-short' };
    saveState();
    return;
  }

  if (isPost) {
    const date = dateFromUrl || new Date().toISOString().slice(0, 10);
    const permalink = url.replace('https://utopiacap.com', '') || `/posts/${slug}/`;
    const front = [
      '---',
      `title: "${toYamlSafe(title)}"`,
      `date: ${date}`,
      `permalink: "${permalink}"`,
      'layout: post.njk',
      `sourceUrl: "${url}"`,
      `archivedAt: "${ts}"`,
      '---',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(POSTS_OUT, `${slug}.md`), front + body + '\n');
  } else {
    const permalink = url.replace('https://utopiacap.com', '') || `/${slug}/`;
    const front = [
      '---',
      `title: "${toYamlSafe(title)}"`,
      `permalink: "${permalink}"`,
      'layout: base.njk',
      `sourceUrl: "${url}"`,
      `archivedAt: "${ts}"`,
      '---',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(PAGES_OUT, `${slug}.md`), `${front}<h1>${title}</h1>\n${body}\n`);
  }

  state.done[key] = { ok: true };
  saveState();
}

async function main() {
  const limit = process.env.RECOVER_LIMIT ? Number(process.env.RECOVER_LIMIT) : Infinity;
  const skipPages = process.env.RECOVER_SKIP_PAGES === '1';
  log(`Starting recovery: ${posts.length} posts, ${pages.length} pages (limit=${limit})`);
  if (!skipPages) for (const p of pages.slice(0, limit)) {
    try {
      await recoverOne(p, { isPost: false });
    } catch (e) {
      log(`  ERROR on page ${p.slug}: ${e.message}`);
    }
    await sleep(3000);
  }
  for (const p of posts.slice(0, limit)) {
    try {
      await recoverOne(p, { isPost: true, dateFromUrl: p.date });
    } catch (e) {
      log(`  ERROR on post ${p.slug}: ${e.message}`);
    }
    await sleep(3000);
  }
  log('Recovery pass complete.');
}

main();
