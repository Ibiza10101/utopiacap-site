import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');

const downloads = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'images.json'), 'utf8'));

/** Every sized-variant relPath (incl. the canonical one itself) -> canonical relPath. */
const toCanonical = new Map();
for (const { canonicalPath, variants } of downloads) {
  for (const v of variants) toCanonical.set(v, canonicalPath);
}

function allMdFiles() {
  const postsDir = path.join(SITE_ROOT, 'src', 'posts');
  const files = fs.readdirSync(postsDir).map((f) => path.join(postsDir, f));
  for (const f of fs.readdirSync(path.join(SITE_ROOT, 'src'))) {
    if (f.endsWith('.md')) files.push(path.join(SITE_ROOT, 'src', f));
  }
  return files;
}

const FULL_RE = /https?:\/\/web\.archive\.org\/web\/\d+(?:im_|if_)?\/https?:\/\/utopiacap\.com(\/wp-content\/uploads\/[^"'\s?]+)/g;

let filesChanged = 0;
for (const file of allMdFiles()) {
  let text = fs.readFileSync(file, 'utf8');
  const original = text;

  // Drop the responsive-size machinery entirely -- we only host one size per image.
  text = text.replace(/\s+(?:data-)?(?:lazy-)?srcset="[^"]*"/g, '');
  text = text.replace(/\s+(?:data-)?(?:lazy-)?sizes="[^"]*"/g, '');

  // Rewrite any plain relative reference (quoted) to its canonical path.
  text = text.replace(/(["'])(\/wp-content\/uploads\/[^"'\s?]+)\1/g, (full, quote, relPath) => {
    const canon = toCanonical.get(relPath) ?? toCanonical.get(relPath.replace(/\?.*$/, ''));
    return canon ? `${quote}${canon}${quote}` : full;
  });

  // Rewrite any still-full Wayback-prefixed URL (e.g. inside <noscript>) down to the canonical relative path.
  text = text.replace(FULL_RE, (full, relPath) => toCanonical.get(relPath) ?? relPath);

  // Drop the now-redundant lazy-load placeholder data: URI src and the "lazyload"/"jetpack-lazy-image" classes --
  // the image now loads directly from our own host, no JS lazy-loader needed.
  text = text.replace(/\s+src="data:image\/gif;base64,[^"]*"/g, '');
  text = text.replace(/\s+data-lazy-src="([^"]*)"/g, ' src="$1"');
  text = text.replace(/\s+data-src="([^"]*)"/g, ' src="$1"');
  // A tag could have carried both data-src and data-lazy-src (now two src=
  // attributes, invalid HTML) -- drop every src after the first per tag,
  // and the WordPress "is-pending-load" lazy-loader query string with it.
  text = text.replace(/<img\b[^>]*>/g, (tag) => {
    let seen = false;
    return tag.replace(/\s+src="([^"]*)"/g, (m, v) => {
      if (seen) return '';
      seen = true;
      return ` src="${v.replace(/\?is-pending-load=1$/, '')}"`;
    });
  });
  text = text.replace(/\bclass="([^"]*)"/g, (m, cls) => {
    const cleaned = cls.replace(/\b(lazyload|jetpack-lazy-image(?:--[a-z]+)?)\b/g, '').replace(/\s+/g, ' ').trim();
    return cleaned ? `class="${cleaned}"` : '';
  });

  if (text !== original) {
    fs.writeFileSync(file, text);
    filesChanged++;
  }
}
console.log(`Rewrote image references in ${filesChanged} files.`);
