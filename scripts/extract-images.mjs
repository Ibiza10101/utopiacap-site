import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');

function allMdFiles() {
  const postsDir = path.join(SITE_ROOT, 'src', 'posts');
  const files = fs.readdirSync(postsDir).map((f) => path.join(postsDir, f));
  for (const f of fs.readdirSync(path.join(SITE_ROOT, 'src'))) {
    if (f.endsWith('.md')) files.push(path.join(SITE_ROOT, 'src', f));
  }
  return files;
}

const FULL_RE = /https?:\/\/web\.archive\.org\/web\/(\d+)(?:im_|if_)?\/https?:\/\/utopiacap\.com(\/wp-content\/uploads\/[^"'\s?]+)/g;
const REL_RE = /["'](\/wp-content\/uploads\/[^"'\s?]+)["']/g;

/** Strips a WordPress-generated thumbnail-size suffix, e.g. "-300x171" before the extension. */
function canonicalize(relPath) {
  return relPath.replace(/-\d+x\d+(\.\w+)$/i, '$1');
}

const byRelPath = new Map(); // original relPath -> timestamp (every variant we saw)

function record(relPath, ts) {
  if (!byRelPath.has(relPath) || byRelPath.get(relPath).ts < ts) byRelPath.set(relPath, { ts });
}

for (const file of allMdFiles()) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = FULL_RE.exec(text))) record(m[2], m[1]);
}
for (const file of allMdFiles()) {
  const text = fs.readFileSync(file, 'utf8');
  const archivedAt = text.match(/^archivedAt: "(\d+)"/m)?.[1];
  let m;
  while ((m = REL_RE.exec(text))) {
    if (!byRelPath.has(m[1]) && archivedAt) record(m[1], archivedAt);
  }
}

// Group every variant under its canonical (un-sized) path, keep the
// largest-looking variant (by filename length as a proxy -- the un-sized
// original has no "-WxH" and is usually the biggest) as the one we'll
// actually download, but remember every variant -> canonical mapping so
// we can rewrite references later.
const groups = new Map(); // canonicalPath -> { ts, variants: Set<relPath> }
for (const [relPath, { ts }] of byRelPath) {
  const canon = canonicalize(relPath);
  if (!groups.has(canon)) groups.set(canon, { ts, variants: new Set() });
  const g = groups.get(canon);
  g.variants.add(relPath);
  // Prefer a timestamp recorded directly against the canonical (unsized) URL if we have one.
  if (relPath === canon) g.ts = ts;
}

const downloads = [...groups.entries()].map(([canonicalPath, { ts, variants }]) => ({
  canonicalPath, ts, variants: [...variants],
}));

console.log(`Unique references: ${byRelPath.size}; canonical images to download: ${downloads.length}`);
fs.writeFileSync(path.join(SCRIPT_DIR, 'images.json'), JSON.stringify(downloads, null, 2));
