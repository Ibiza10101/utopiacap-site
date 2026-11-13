import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SITE_ROOT = path.resolve(SCRIPT_DIR, '..');
const POSTS_DIR = path.join(SITE_ROOT, 'src', 'posts');

const matches = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'featured-images.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'download-featured-images.state.json'), 'utf8'));

const byPost = new Map();
for (const { postFile, imagePath } of matches) {
  if (state.done[imagePath]?.ok !== true) continue; // only insert ones that actually downloaded
  if (!byPost.has(postFile)) byPost.set(postFile, []);
  byPost.get(postFile).push(imagePath);
}

let changed = 0;
for (const [postFile, images] of byPost) {
  const full = path.join(POSTS_DIR, postFile);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  // Insert right after the front matter's closing "---", before the body.
  const frontMatterEnd = content.indexOf('---', 3) + 3;
  const before = content.slice(0, frontMatterEnd);
  const after = content.slice(frontMatterEnd);
  const figures = images
    .map((p) => `<img src="${p}" loading="lazy" style="max-width:100%;height:auto;">`)
    .join('\n');
  const block = `\n\n<div class="recovered-images">\n${figures}\n</div>\n`;
  fs.writeFileSync(full, before + block + after);
  changed++;
}
console.log(`Inserted recovered images into ${changed} posts.`);
