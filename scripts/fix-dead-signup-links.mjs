// One-off: rewrite simple inline dead signup links (href="/premium/",
// "/premium-service/", "/login-premium/") to point at /membership/ with the
// join-cta class, so they trigger the waitlist popup instead of 404ing.
// Does NOT touch files containing the big ihc_level_wrap pricing block --
// those need manual/semantic cleanup, handled separately.
import fs from 'node:fs';
import path from 'node:path';

const postsDir = 'src/posts';
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

const deadHrefRe = /href="\/(?:premium|premium-service|login-premium)\/"(\s+target="_blank"(\s+rel="noopener(?: noreferrer)?")?)?/g;

let fixedFiles = 0;
let fixedLinks = 0;
const skippedHasBlock = [];
const touched = [];

for (const f of files) {
  const p = path.join(postsDir, f);
  let content = fs.readFileSync(p, 'utf8');
  if (!/href="\/(premium|premium-service|login-premium)\/"/.test(content)) continue;

  const hasBigBlock = content.includes('ich_level_wrap') || content.includes('ihcBuyNewLevel');

  const before = content;
  const linkCount = (content.match(deadHrefRe) || []).length;
  content = content.replace(deadHrefRe, 'href="/membership/" class="join-cta"');

  if (content !== before) {
    fs.writeFileSync(p, content, 'utf8');
    fixedFiles++;
    fixedLinks += linkCount;
    touched.push(f);
  }
  if (hasBigBlock) skippedHasBlock.push(f);
}

console.log(`Rewrote ${fixedLinks} inline dead-signup link(s) across ${fixedFiles} file(s).`);
console.log(`\n${skippedHasBlock.length} of the touched/scanned files ALSO contain the big ihc_level_wrap pricing block (needs separate cleanup):`);
skippedHasBlock.forEach(f => console.log(' -', f));
